import { ConsumerGroups } from "@meridian/contracts";
import { ConflictError } from "@meridian/kernel";
import { createLogger, isShuttingDown, KafkaMessaging, MessagingNames, UpstreamUnavailableError } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { IndexReplayer } from "../../application/ports";

const log = createLogger("IndexReplayer");

const GROUP = ConsumerGroups.searchIndexer;
const RESET_ATTEMPTS = 20;
const RESET_RETRY_MS = 500;
const STEP_TIMEOUT_MS = 60_000;

/**
 * Replays the search-indexer consumer group from the earliest retained offsets. The read model is only ever built
 * from Kafka, so a rebuild needs no call to catalog or inventory. One rebuild at a time per process; a group with
 * members elsewhere (another replica still consuming) cannot be reset and is reported as a conflict.
 */
@Injectable()
export class KafkaIndexReplayer extends IndexReplayer {
  private running: Promise<void> | null = null;

  constructor(private readonly kafka: KafkaMessaging) {
    super();
  }

  async hasCommittedProgress(): Promise<boolean> {
    const topics = this.topics();
    await this.kafka.ensureTopics(topics);
    const admin = await this.kafka.getAdmin();
    const offsets = await withTimeout(admin.fetchOffsets({ groupId: MessagingNames.groupId(GROUP), topics }), "fetch committed offsets");
    return offsets.some((topic) => topic.partitions.some((partition) => BigInt(partition.offset) >= 0n));
  }

  isReplaying(): boolean {
    return this.running !== null;
  }

  replayFromEarliest(reset: () => Promise<void>): Promise<void> {
    if (this.running) return Promise.reject(new ConflictError("A search index rebuild is already in progress"));
    const run = this.replay(reset).finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  private async replay(reset: () => Promise<void>): Promise<void> {
    const groupId = MessagingNames.groupId(GROUP);
    const topics = this.topics();
    const started = Date.now();
    log.info("stopping search-indexer consumers for replay", { groupId, topics });
    try {
      await withTimeout(this.kafka.stopConsumers(), "stop consumers");
      const stoppedMs = Date.now() - started;
      // Offsets first: if the reset fails, the read model is left intact and consumption resumes where it was.
      // Deleting the (now empty) group drops every committed offset in one request; the consumers subscribe with
      // fromBeginning, so they restart at the earliest retained record. (kafkajs resetOffsets would join the group
      // with a temporary consumer per topic, which costs a rebalance delay each.)
      await this.kafka.ensureTopics(topics);
      const admin = await this.kafka.getAdmin();
      let attempt = 1;
      for (; ; attempt += 1) {
        const outcome = await withTimeout(
          admin.deleteGroups([groupId]).then(
            () => "reset" as const,
            (error: unknown) => classifyDeleteError(error),
          ),
          "reset consumer group offsets",
        );
        if (outcome === "reset") break;
        // The broker needs a moment to see the stopped member leave; members of other replicas never leave.
        if (attempt >= RESET_ATTEMPTS) {
          log.error("search-indexer offset reset failed", { groupId, attempts: attempt, reason: outcome.reason });
          if (outcome.reason === "NON_EMPTY_GROUP") throw new ConflictError("The search-indexer group is still consumed by another instance; stop it before rebuilding");
          throw new UpstreamUnavailableError("kafka", "network", { cause: outcome.error });
        }
        await new Promise((resolve) => setTimeout(resolve, RESET_RETRY_MS));
      }
      // Nothing consumes now and every offset points at the start of the log: empty the read model and replay.
      await reset();
      log.info("search-indexer offsets reset to earliest; replaying", { groupId, stopMs: stoppedMs, resetAttempts: attempt, totalMs: Date.now() - started });
    } finally {
      // Always resume consuming, even when the reset failed, unless the process is going down.
      if (!isShuttingDown()) await this.kafka.startConsumers();
    }
  }

  private topics(): string[] {
    const events = this.kafka.registry.kafkaGroups().get(GROUP)?.events ?? [];
    return MessagingNames.groupTopics(GROUP, events);
  }
}

type DeleteOutcome = "reset" | { reason: string; error: unknown };

/** A group that does not exist has no offsets to reset; anything else is retried. */
function classifyDeleteError(error: unknown): DeleteOutcome {
  const groups = (error as { groups?: Array<{ errorCode?: number; error?: { type?: string } }> }).groups ?? [];
  const reasons = groups.map((group) => group.error?.type ?? `code ${group.errorCode}`);
  if (reasons.length && reasons.every((reason) => reason === "GROUP_ID_NOT_FOUND")) return "reset";
  return { reason: reasons[0] ?? (error as { type?: string }).type ?? (error instanceof Error ? error.message : String(error)), error };
}

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      log.error("replay step timed out", { what, timeoutMs: STEP_TIMEOUT_MS });
      reject(new UpstreamUnavailableError("kafka", "timeout"));
    }, STEP_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
