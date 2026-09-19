import type { DeadLetterDto, MessagingStatusDto, QueueStatusDto, ConsumerGroupStatusDto, ReplayRequest, ReplayResultDto } from "@meridian/contracts";
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Query, ServiceUnavailableException } from "@nestjs/common";
import { AdminOnly } from "../auth";
import { createLogger, instanceId, isShuttingDown, readiness } from "../core";
import { MessagingNames } from "./config";
import { buildReplayMessage, kafkaDeadLetterDto, kafkaDeadLetterId, parseKafkaDeadLetterId } from "./dead-letters";
import { errorText } from "./errors";
import { Inbox } from "./inbox";
import type { KafkaMessaging } from "./kafka";
import type { MessagingModuleOptions } from "./options";
import { runTransaction, type PrismaLike } from "./prisma";
import type { RabbitMessaging } from "./rabbit";

const log = createLogger("MessagingAdmin");

export const DEAD_LETTER_DEFAULT_LIMIT = 50;
export const REPLAY_DEFAULT_LIMIT = 10;
export const ADMIN_MAX_LIMIT = 500;

/** Inbox consumer name that marks a Kafka DLT record as replayed (the DLT itself is an immutable log). */
export function dltReplayConsumer(dltTopic: string): string {
  return `dlt-replay:${dltTopic}`;
}

export function parseLimit(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new BadRequestException("limit must be a positive integer");
  return Math.min(value, ADMIN_MAX_LIMIT);
}

export function parseReplayRequest(body: unknown): ReplayRequest {
  if (typeof body !== "object" || body === null) throw new BadRequestException("Body must be a ReplayRequest object");
  const input = body as Record<string, unknown>;
  if (input.source !== "rabbit" && input.source !== "kafka") throw new BadRequestException('source must be "rabbit" or "kafka"');
  if (typeof input.queueOrTopic !== "string" || !input.queueOrTopic) throw new BadRequestException("queueOrTopic is required");
  let ids: string[] | undefined;
  if (input.ids !== undefined) {
    if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== "string" || !id)) throw new BadRequestException("ids must be an array of strings");
    if (input.ids.length > ADMIN_MAX_LIMIT) throw new BadRequestException(`at most ${ADMIN_MAX_LIMIT} ids per replay`);
    ids = [...new Set(input.ids as string[])];
  }
  return { source: input.source, queueOrTopic: input.queueOrTopic, ids, limit: parseLimit(input.limit, REPLAY_DEFAULT_LIMIT) };
}

/** Messaging operations behind the admin endpoints: status, dead-letter peek and replay. */
export class MessagingAdmin {
  constructor(
    private readonly options: MessagingModuleOptions,
    private readonly prisma: () => PrismaLike,
    private readonly kafka: KafkaMessaging | null,
    private readonly rabbit: RabbitMessaging | null,
  ) {}

  async status(): Promise<MessagingStatusDto> {
    const [outbox, queues, consumerGroups, health] = await Promise.all([this.outboxStats(), this.queueStatuses(), this.groupStatuses(), readiness()]);
    return {
      service: this.options.service,
      instanceId: instanceId(),
      outbox,
      queues,
      consumerGroups,
      // Circuit breakers are owned by the runtime (BreakerRegistry); the runtime's status endpoint reports them.
      breakers: [],
      ready: !isShuttingDown() && health.status === "ok",
      shuttingDown: isShuttingDown(),
    };
  }

  private async outboxStats(): Promise<MessagingStatusDto["outbox"]> {
    const rows = await this.prisma().$queryRaw<Array<{ pending: bigint | number; failing: bigint | number; oldest: number | null }>>`
      SELECT count(*) FILTER (WHERE "publishedAt" IS NULL) AS "pending",
             count(*) FILTER (WHERE "publishedAt" IS NULL AND "attempts" > 0) AS "failing",
             EXTRACT(EPOCH FROM (LOCALTIMESTAMP - min("createdAt") FILTER (WHERE "publishedAt" IS NULL)))::float8 AS "oldest"
      FROM "Outbox"`;
    const row = rows[0];
    const oldest = row?.oldest;
    return {
      pending: Number(row?.pending ?? 0),
      oldestPendingAgeSec: oldest === null || oldest === undefined ? null : Math.max(0, Math.round(Number(oldest))),
      failing: Number(row?.failing ?? 0),
    };
  }

  private async queueStatuses(): Promise<QueueStatusDto[]> {
    const rabbit = this.options.rabbit ? this.rabbit : null;
    if (!rabbit) return [];
    return Promise.all(
      rabbit.commands().map(async (command) => {
        const queue = MessagingNames.commandQueue(command);
        const dlq = MessagingNames.dlq(command);
        try {
          const [main, dead] = await Promise.all([rabbit.queueCounts(queue), rabbit.queueCounts(dlq)]);
          return { queue, messages: main.messages, consumers: main.consumers, dlq: { queue: dlq, messages: dead.messages } };
        } catch (error) {
          log.warn("queue status unavailable", { queue, error: errorText(error) });
          return { queue, messages: 0, consumers: 0, dlq: { queue: dlq, messages: 0 } };
        }
      }),
    );
  }

  private async groupStatuses(): Promise<ConsumerGroupStatusDto[]> {
    const kafka = this.options.kafka ? this.kafka : null;
    if (!kafka) return [];
    return Promise.all(
      kafka.groupNames().map(async (group) => {
        const dltTopic = MessagingNames.dltTopic(group);
        try {
          const status = await kafka.groupStatus(group);
          const retained = status.dltOffsets.reduce((sum, p) => sum + (p.high - p.low), 0n);
          const replayed = await this.replayedIds(dltTopic);
          let replayedRetained = 0n;
          for (const id of replayed) {
            const parsed = parseKafkaDeadLetterId(id);
            const partition = parsed && status.dltOffsets.find((p) => p.partition === parsed.partition);
            if (parsed && partition && parsed.offset >= partition.low && parsed.offset < partition.high) replayedRetained += 1n;
          }
          const messages = retained - replayedRetained;
          return { group: status.groupId, topics: status.topics, state: status.state, members: status.members, lag: status.lag, dlt: { topic: dltTopic, messages: Number(messages > 0n ? messages : 0n) } };
        } catch (error) {
          log.warn("consumer group status unavailable", { group, error: errorText(error) });
          return { group: MessagingNames.groupId(group), topics: [], state: "Unavailable", members: 0, lag: 0, dlt: { topic: dltTopic, messages: 0 } };
        }
      }),
    );
  }

  private async replayedIds(dltTopic: string): Promise<Set<string>> {
    const rows = await this.prisma().$queryRaw<Array<{ messageId: string }>>`SELECT "messageId" FROM "Inbox" WHERE "consumer" = ${dltReplayConsumer(dltTopic)}`;
    return new Set(rows.map((row) => row.messageId));
  }

  private groupForDlt(topic: string): string {
    const group = this.kafka?.groupNames().find((name) => MessagingNames.dltTopic(name) === topic);
    if (!this.options.kafka || !this.kafka || !group) throw new BadRequestException(`"${topic}" is not the DLT of a consumer group in this service`);
    return group;
  }

  private commandForDlq(queue: string): string {
    const command = this.rabbit?.commandForQueue(queue);
    if (!this.options.rabbit || !this.rabbit || !command) throw new BadRequestException(`"${queue}" is not a command dead-letter queue`);
    return command;
  }

  async deadLetters(source: unknown, queueOrTopic: unknown, rawLimit: unknown): Promise<DeadLetterDto[]> {
    const limit = parseLimit(rawLimit, DEAD_LETTER_DEFAULT_LIMIT);
    if (typeof queueOrTopic !== "string" || !queueOrTopic) throw new BadRequestException("queueOrTopic is required");
    if (source === "rabbit") {
      const command = this.commandForDlq(queueOrTopic);
      return this.unavailable(() => this.rabbit!.peekDeadLetters(MessagingNames.dlq(command), limit));
    }
    if (source === "kafka") {
      this.groupForDlt(queueOrTopic);
      return this.unavailable(async () => {
        const [records, replayed] = await Promise.all([this.kafka!.readTopic(queueOrTopic), this.replayedIds(queueOrTopic)]);
        return records
          .filter((record) => !replayed.has(kafkaDeadLetterId(record.partition, record.message)))
          .slice(0, limit)
          .map((record) => kafkaDeadLetterDto(queueOrTopic, record.partition, record.message));
      });
    }
    throw new BadRequestException('source must be "rabbit" or "kafka"');
  }

  async replay(body: unknown): Promise<ReplayResultDto> {
    const request = parseReplayRequest(body);
    const limit = request.limit ?? REPLAY_DEFAULT_LIMIT;
    if (request.source === "rabbit") {
      const command = this.commandForDlq(request.queueOrTopic);
      return this.unavailable(() => this.rabbit!.replayDeadLetters(MessagingNames.dlq(command), request.ids, limit));
    }
    const group = this.groupForDlt(request.queueOrTopic);
    const dltTopic = request.queueOrTopic;
    const replayTopic = MessagingNames.replayTopic(group);
    return this.unavailable(async () => {
      const [records, replayed] = await Promise.all([this.kafka!.readTopic(dltTopic), this.replayedIds(dltTopic)]);
      const candidates = records.filter((record) => !replayed.has(kafkaDeadLetterId(record.partition, record.message)));
      const wanted = request.ids ? new Set(request.ids) : null;
      const selected = wanted ? candidates.filter((record) => wanted.has(kafkaDeadLetterId(record.partition, record.message))) : candidates.slice(0, limit);
      let count = 0;
      for (const record of selected) {
        const id = kafkaDeadLetterId(record.partition, record.message);
        // The Inbox mark and the produce share a transaction: a failed produce leaves the record replayable,
        // and a record is never replayed twice (concurrent admins race on the Inbox primary key).
        const ran = await runTransaction(
          this.prisma(),
          (tx) => Inbox.once(tx, dltReplayConsumer(dltTopic), id, () => this.kafka!.send(replayTopic, [buildReplayMessage(dltTopic, id, record.message)])),
          { maxWait: 5000, timeout: 30_000 },
        );
        if (ran) {
          count += 1;
          log.info("dead letter replayed", { group, dltTopic, replayTopic, id });
        }
      }
      return { replayed: count, remaining: Math.max(0, candidates.length - count) };
    });
  }

  private async unavailable<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      log.error("messaging admin operation failed", { error: errorText(error) });
      throw new ServiceUnavailableException(`Messaging broker operation failed: ${errorText(error, 300)}`);
    }
  }
}

@Controller("admin/messaging")
@AdminOnly()
export class MessagingAdminController {
  constructor(@Inject(MessagingAdmin) private readonly admin: MessagingAdmin) {}

  @Get()
  status(): Promise<MessagingStatusDto> {
    return this.admin.status();
  }

  @Get("dead-letters")
  deadLetters(@Query("source") source?: string, @Query("queueOrTopic") queueOrTopic?: string, @Query("limit") limit?: string): Promise<DeadLetterDto[]> {
    return this.admin.deadLetters(source, queueOrTopic, limit);
  }

  @Post("replay")
  @HttpCode(200)
  replay(@Body() body: unknown): Promise<ReplayResultDto> {
    return this.admin.replay(body);
  }
}
