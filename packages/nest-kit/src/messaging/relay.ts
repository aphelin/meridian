import type { EventName } from "@meridian/contracts";
import { counter, createLogger, gauge, isShuttingDown, serviceName } from "../core";
import { MessagingNames, isEventName, messagingSettings } from "./config";
import { buildEnvelope, kafkaRecordFor, withTraceparent, type OutboxRow } from "./envelope";
import { errorText } from "./errors";
import type { KafkaMessaging } from "./kafka";
import { isCommandName } from "./outbox-writer";
import { runTransaction, type PrismaLike, type PrismaTx } from "./prisma";
import type { RabbitMessaging } from "./rabbit";
import { outboxBackoffMs } from "./retry";

const log = createLogger("OutboxRelay");

const pendingGauge = () => gauge("outbox_pending", "Outbox rows not yet published");
const publishedCounter = () => counter("outbox_published_total", "Outbox rows published", ["kind"]);
const failureCounter = () => counter("outbox_publish_failures_total", "Outbox publish attempts that failed");

export const OUTBOX_BATCH_SIZE = 100;

/** Per-row backoff and per-key ordering guard, kept by each relay process. */
export class OutboxBackoff {
  private readonly rows = new Map<string, { until: number; key: string | null }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Row ids still waiting for their backoff to expire (excluded from the next SELECT). */
  excludedIds(): string[] {
    const now = this.now();
    const ids: string[] = [];
    for (const [id, entry] of this.rows) {
      if (entry.until <= now) this.rows.delete(id);
      else ids.push(id);
    }
    return ids;
  }

  /** Records a failed attempt; returns the backoff applied. */
  fail(row: Pick<OutboxRow, "id" | "attempts">, key: string | null): number {
    const delay = outboxBackoffMs(row.attempts + 1);
    this.rows.set(row.id, { until: this.now() + delay, key });
    return delay;
  }

  succeed(id: string): void {
    this.rows.delete(id);
  }

  /** Ordering keys that still have a backed-off row: later rows with the same key must wait for it. */
  blockedKeys(): Set<string> {
    const now = this.now();
    const keys = new Set<string>();
    for (const entry of this.rows.values()) if (entry.until > now && entry.key) keys.add(entry.key);
    return keys;
  }
}

/**
 * Ordering key of a row. Events of one aggregate share a Kafka partition key, so a later event must not overtake an
 * earlier one that failed. Commands have no ordering guarantee (each is independent work).
 */
export function orderingKey(row: Pick<OutboxRow, "kind" | "aggregateType" | "aggregateId">): string | null {
  return row.kind === "event" && row.aggregateId ? `${row.aggregateType ?? ""}:${row.aggregateId}` : null;
}

type PublishResult = { id: string; ok: true } | { id: string; ok: false; error: unknown };

/**
 * Transactional outbox relay. Every poll opens an interactive transaction, locks up to 100 unpublished rows with
 * `FOR UPDATE SKIP LOCKED` (so concurrent relays never take the same row), publishes events to Kafka and commands to
 * RabbitMQ (with publisher confirms), marks successes `publishedAt` and records failures (`attempts`, `lastError`) in
 * the same transaction. A failed row backs off exponentially (max 30s) without blocking unrelated rows, and later
 * rows of the same aggregate wait behind it so per-aggregate order holds.
 */
export class OutboxRelay {
  private running = false;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private readonly backoff = new OutboxBackoff();
  private lastPendingSample = 0;

  constructor(
    private readonly prisma: () => PrismaLike,
    private readonly kafka: KafkaMessaging | null,
    private readonly rabbit: RabbitMessaging | null,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
    log.info("outbox relay started", { pollMs: messagingSettings().outboxPollMs });
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Stops polling; resolves after the in-flight batch has been published and committed. */
  async stop(): Promise<void> {
    if (!this.running) return this.loop ?? undefined;
    this.running = false;
    this.wake?.();
    await this.loop;
    log.info("outbox relay stopped");
  }

  private async run(): Promise<void> {
    let errorDelay = 1000;
    while (this.running) {
      let fullBatch = false;
      try {
        const count = await this.tick();
        fullBatch = count >= OUTBOX_BATCH_SIZE;
        errorDelay = 1000;
        await this.samplePending();
      } catch (error) {
        log.error("outbox poll failed", { error: errorText(error), retryInMs: errorDelay });
        await this.sleep(errorDelay);
        errorDelay = Math.min(30_000, errorDelay * 2);
        continue;
      }
      if (!fullBatch) await this.sleep(messagingSettings().outboxPollMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(timer);
        if (self.wake === done) self.wake = null;
        resolve();
      }
      this.wake = done;
    });
  }

  private async samplePending(): Promise<void> {
    if (Date.now() - this.lastPendingSample < 5000) return;
    this.lastPendingSample = Date.now();
    const rows = await this.prisma().$queryRaw<Array<{ pending: bigint | number }>>`SELECT count(*) AS "pending" FROM "Outbox" WHERE "publishedAt" IS NULL`;
    pendingGauge().set(Number(rows[0]?.pending ?? 0));
  }

  /** Publishes one batch. Returns the number of rows locked (published or failed). */
  async tick(): Promise<number> {
    const excluded = this.backoff.excludedIds();
    return runTransaction(
      this.prisma(),
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT "id", "kind", "name", "aggregateType", "aggregateId", "payload", "correlationId", "causationId", "traceparent", "createdAt", "attempts"
          FROM "Outbox"
          WHERE "publishedAt" IS NULL AND NOT ("id" = ANY(${excluded}::text[]))
          ORDER BY "createdAt", "id"
          LIMIT ${OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return 0;
        const results = await this.publishRows(rows);
        await this.record(tx, rows, results);
        return rows.length;
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  }

  private async publishRows(rows: OutboxRow[]): Promise<PublishResult[]> {
    const blocked = this.backoff.blockedKeys();
    const results: PublishResult[] = [];
    const commandTasks: Array<Promise<PublishResult>> = [];
    // Declare every command's topology up front so the publishes below leave in row order.
    const topologyErrors = new Map<string, unknown>();
    if (this.rabbit) {
      const commands = [...new Set(rows.filter((row) => row.kind === "command" && isCommandName(row.name)).map((row) => row.name))];
      await Promise.all(commands.map((command) => this.rabbit!.ensureCommandTopology(command).catch((error) => topologyErrors.set(command, error))));
    }
    // After a failed produce, the rest of this batch's events wait for the next poll instead of each timing out
    // against a broker that is down (which would also outlive the transaction timeout).
    let kafkaFailure = false;
    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const key = orderingKey(row);
      if ((key && blocked.has(key)) || (row.kind === "event" && kafkaFailure)) {
        results.push({ id: row.id, ok: false, error: new DeferredError() });
        i += 1;
        continue;
      }
      if (row.kind === "event") {
        // Consecutive events for the same topic go out in one produce request, in order.
        const topic = isEventName(row.name) ? MessagingNames.topicForEvent(row.name as EventName) : null;
        const group: OutboxRow[] = [row];
        while (topic && i + group.length < rows.length) {
          const next = rows[i + group.length];
          const nextKey = orderingKey(next);
          if (next.kind !== "event" || !isEventName(next.name) || MessagingNames.topicForEvent(next.name) !== topic || (nextKey && blocked.has(nextKey))) break;
          if ((next.traceparent ?? null) !== (row.traceparent ?? null)) break;
          group.push(next);
        }
        i += group.length;
        const outcome = await this.publishEvents(topic, group);
        for (const member of group) results.push(outcome ? { id: member.id, ok: false, error: outcome } : { id: member.id, ok: true });
        if (outcome) {
          // A bad row (unknown event name) says nothing about the broker; only a real produce failure does.
          if (topic && this.kafka) kafkaFailure = true;
          for (const member of group) if (orderingKey(member)) blocked.add(orderingKey(member) as string);
        }
        continue;
      }
      i += 1;
      const topologyError = topologyErrors.get(row.name);
      commandTasks.push(topologyError ? Promise.resolve({ id: row.id, ok: false, error: topologyError }) : this.publishCommand(row));
    }
    results.push(...(await Promise.all(commandTasks)));
    return results;
  }

  /** Returns null on success or the error that failed the whole produce request. */
  private async publishEvents(topic: string | null, rows: OutboxRow[]): Promise<unknown | null> {
    try {
      if (!topic) throw new Error(`Unknown event name "${rows[0].name}"`);
      if (!this.kafka) throw new Error("Kafka is disabled in this process; cannot publish events");
      const producer = serviceName();
      const messages = rows.map((row) => kafkaRecordFor(buildEnvelope(row, producer), row.traceparent));
      await withTraceparent(rows[0].traceparent, () => this.kafka!.send(topic, messages));
      publishedCounter().inc({ kind: "event" }, rows.length);
      return null;
    } catch (error) {
      return error;
    }
  }

  private async publishCommand(row: OutboxRow): Promise<PublishResult> {
    try {
      if (row.kind !== "command") throw new Error(`Unknown outbox kind "${row.kind}"`);
      if (!isCommandName(row.name)) throw new Error(`Unknown command name "${row.name}"`);
      if (!this.rabbit) throw new Error("RabbitMQ is disabled in this process; cannot publish commands");
      const envelope = buildEnvelope(row, serviceName());
      await withTraceparent(row.traceparent, () => this.rabbit!.publishCommand(envelope, row.traceparent));
      publishedCounter().inc({ kind: "command" });
      return { id: row.id, ok: true };
    } catch (error) {
      return { id: row.id, ok: false, error };
    }
  }

  private async record(tx: PrismaTx, rows: OutboxRow[], results: PublishResult[]): Promise<void> {
    const published = results.filter((result) => result.ok).map((result) => result.id);
    if (published.length) {
      await tx.$executeRaw`UPDATE "Outbox" SET "publishedAt" = CURRENT_TIMESTAMP, "lastError" = NULL WHERE "id" = ANY(${published}::text[])`;
      for (const id of published) this.backoff.succeed(id);
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const result of results) {
      if (result.ok) continue;
      const row = byId.get(result.id);
      if (!row) continue;
      if (result.error instanceof DeferredError) {
        // Waiting behind an earlier failed row of the same aggregate: not an attempt of its own.
        this.backoff.fail({ id: row.id, attempts: 0 }, orderingKey(row));
        continue;
      }
      const message = errorText(result.error, 2000);
      await tx.$executeRaw`UPDATE "Outbox" SET "attempts" = "attempts" + 1, "lastError" = ${message} WHERE "id" = ${row.id}`;
      const delay = this.backoff.fail(row, orderingKey(row));
      failureCounter().inc();
      log.warn("outbox publish failed; backing off", { id: row.id, kind: row.kind, name: row.name, attempts: row.attempts + 1, retryInMs: delay, error: message });
    }
    if (published.length) log.debug("outbox batch published", { published: published.length, failed: rows.length - published.length, shuttingDown: isShuttingDown() });
  }
}

class DeferredError extends Error {
  constructor() {
    super("deferred behind an earlier failed row of the same aggregate");
    this.name = "DeferredError";
  }
}
