import { ConsumerGroups } from "@meridian/contracts";
import { ConflictError } from "@meridian/kernel";
import { createLogger, isShuttingDown, KafkaMessaging, MessagingNames } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { ProjectorControl } from "../../application/ports";

const log = createLogger("ProjectorControl");
const GROUP = ConsumerGroups.analyticsProjector;
/** Kafka protocol error codes returned by DeleteGroups. */
const NON_EMPTY_GROUP = 68;
const GROUP_ID_NOT_FOUND = 69;

function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Group control on the kit's KafkaMessaging (its consumer loop and admin client). Every broker call is time-boxed. */
@Injectable()
export class KafkaProjectorControl extends ProjectorControl {
  constructor(private readonly kafka: KafkaMessaging) {
    super();
  }

  async pause(): Promise<void> {
    // This service runs exactly one consumer group, so stopping the process's consumers pauses the projector.
    const started = Date.now();
    await withTimeout(this.kafka.stopConsumers(), envMs("ANALYTICS_PAUSE_TIMEOUT_MS", 30_000), "pausing analytics-projector");
    log.info("analytics-projector paused", { tookMs: Date.now() - started });
  }

  async resetToEarliest(): Promise<void> {
    const admin = await withTimeout(this.kafka.getAdmin(), 10_000, "connecting the Kafka admin client");
    const groupId = MessagingNames.groupId(GROUP);
    const topics = this.topics();
    await withTimeout(this.kafka.ensureTopics(topics), 15_000, "ensuring analytics topics");
    const waitStarted = Date.now();
    const deadline = Date.now() + envMs("ANALYTICS_REBUILD_IDLE_TIMEOUT_MS", 30_000);
    // Offsets can only be moved while the group has no members; other replicas must leave first.
    for (;;) {
      const described = await withTimeout(admin.describeGroups([groupId]), 10_000, "describing analytics-projector");
      const state = described.groups.find((group) => group.groupId === groupId)?.state ?? "Dead";
      if (state === "Empty" || state === "Dead") {
        log.info("analytics-projector group idle", { state, waitedMs: Date.now() - waitStarted });
        break;
      }
      if (Date.now() > deadline) {
        throw new ConflictError(`analytics-projector still has active members (state ${state}); stop other analytics replicas and retry`);
      }
      await sleep(500);
    }
    // Deleting the idle group drops all of its committed offsets in one request; the consumer subscribes with
    // fromBeginning, so it restarts at the earliest retained offset of every topic. (admin.resetOffsets would join
    // the group once per topic and wait out a rebalance each time.)
    try {
      await withTimeout(admin.deleteGroups([groupId]), 10_000, "resetting analytics-projector offsets");
    } catch (error) {
      const failures = (error as { groups?: Array<{ errorCode: number }> }).groups ?? [];
      if (failures.some((failure) => failure.errorCode === NON_EMPTY_GROUP)) {
        throw new ConflictError("analytics-projector still has active members; stop other analytics replicas and retry");
      }
      if (!failures.length || failures.some((failure) => failure.errorCode !== GROUP_ID_NOT_FOUND)) throw error;
      // Never committed anything: already at the beginning.
    }
    log.info("analytics-projector offsets reset to earliest", { groupId, topics });
  }

  async resume(): Promise<void> {
    if (isShuttingDown()) {
      log.warn("not resuming analytics-projector: process is shutting down");
      return;
    }
    await this.kafka.startConsumers();
  }

  async lag(): Promise<number | null> {
    try {
      const status = await withTimeout(this.kafka.groupStatus(GROUP), envMs("ANALYTICS_LAG_TIMEOUT_MS", 3_000), "reading analytics-projector lag");
      return status.lag;
    } catch (error) {
      log.warn("projection lag unavailable", { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private topics(): string[] {
    const events = this.kafka.registry.kafkaGroups().get(GROUP)?.events ?? [];
    if (!events.length) throw new Error("analytics-projector has no registered event handlers");
    return MessagingNames.groupTopics(GROUP, events);
  }
}
