import { KAFKA_PARTITIONS } from "@meridian/contracts";
import { randomUUID } from "node:crypto";
import { Kafka, Partitioners, logLevel, type Admin, type Consumer, type KafkaMessage, type LogEntry, type Message, type Producer } from "kafkajs";
import { counter, createLogger, gauge, instanceId, namespaced, writeLog } from "../core";
import { MessagingNames, messagingSettings } from "./config";
import { errorText } from "./errors";
import { processKafkaRecord } from "./kafka-processor";
import { handlerRegistry, type HandlerRegistry } from "./registry";

const log = createLogger("Kafka");

const processed = () => counter("kafka_messages_processed_total", "Kafka records handled by consumer groups", ["group", "result"]);
const lagGauge = () => gauge("kafka_consumer_lag", "Records behind the log end, summed over a group's partitions", ["group"]);

function kafkaLogCreator() {
  return () =>
    ({ level, label, log: entry }: LogEntry) => {
      const { message, timestamp: _timestamp, ...fields } = entry;
      const mapped = level <= logLevel.ERROR ? "error" : level === logLevel.WARN ? "warn" : level === logLevel.INFO ? "info" : "debug";
      writeLog(mapped, `kafkajs:${label}`, message, fields);
    };
}

export interface KafkaTopicRecord {
  partition: number;
  message: KafkaMessage;
}

export interface KafkaGroupStatus {
  group: string;
  groupId: string;
  topics: string[];
  state: string;
  members: number;
  lag: number;
  dltTopic: string;
  dltOffsets: Array<{ partition: number; low: bigint; high: bigint }>;
}

/**
 * Members actually holding partitions. While a rebalance is in progress the broker already lists joining members
 * that have no assignment yet (and the old members keep consuming their previous one), so only members with an
 * assignment count until the group is Stable again.
 */
export function activeMembers(group: { state: string; members: Array<{ memberAssignment?: Buffer | null }> } | undefined): number {
  if (!group) return 0;
  if (group.state === "Stable") return group.members.length;
  return group.members.filter((member) => (member.memberAssignment?.length ?? 0) > 0).length;
}

/** Serialises async work (e.g. topic creation) so concurrent callers never race each other. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/** One kafkajs consumer for one logical group; restarts itself with backoff when kafkajs gives up. */
class GroupConsumer {
  private consumer: Consumer | null = null;
  private stopped = false;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private readonly lag = new Map<number, number>();

  constructor(
    private readonly owner: KafkaMessaging,
    readonly group: string,
    readonly topics: string[],
  ) {}

  start(): void {
    if (!this.loop) this.loop = this.runLoop();
  }

  private async runLoop(): Promise<void> {
    let delayMs = 1000;
    while (!this.stopped) {
      try {
        await this.connectAndRun();
        return;
      } catch (error) {
        log.error("consumer group failed to start; retrying", { group: this.group, retryInMs: delayMs, error: errorText(error) });
        await this.disposeConsumer();
        await this.pause(delayMs);
        delayMs = Math.min(30_000, delayMs * 2);
      }
    }
  }

  private pause(ms: number): Promise<void> {
    if (this.stopped) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }

  private async connectAndRun(): Promise<void> {
    const settings = messagingSettings();
    const dlt = MessagingNames.dltTopic(this.group);
    await this.owner.ensureTopics([...this.topics, dlt]);
    if (this.stopped) return;
    const consumer = this.owner.client().consumer({
      groupId: MessagingNames.groupId(this.group),
      sessionTimeout: 30_000,
      rebalanceTimeout: 60_000,
      heartbeatInterval: 1_000,
      maxWaitTimeInMs: 1_000,
      allowAutoTopicCreation: false,
      retry: { initialRetryTime: 300, maxRetryTime: 10_000, retries: 8 },
    });
    this.consumer = consumer;
    consumer.on(consumer.events.CRASH, (event) => {
      const { error, restart } = event.payload;
      log.error("consumer crashed", { group: this.group, restart, error: errorText(error) });
      if (restart || this.stopped || this.consumer !== consumer) return;
      // kafkajs will not restart this one itself: rebuild the consumer after a pause.
      this.consumer = null;
      void consumer.disconnect().catch(() => undefined);
      this.loop = (async () => {
        await this.pause(2000);
        await this.runLoop();
      })();
    });
    await consumer.connect();
    if (this.stopped) return;
    await consumer.subscribe({ topics: this.topics, fromBeginning: true });
    await consumer.run({
      autoCommit: false,
      eachBatchAutoResolve: false,
      partitionsConsumedConcurrently: KAFKA_PARTITIONS,
      eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
        const active = () => isRunning() && !isStale() && !this.stopped;
        for (const message of batch.messages) {
          if (!active()) break;
          this.owner.inflight += 1;
          let result;
          try {
            result = await processKafkaRecord(
              { topic: batch.topic, partition: batch.partition, message },
              {
                group: this.group,
                handlers: this.owner.registry.kafkaGroups().get(this.group)?.handlers ?? [],
                delaysMs: settings.kafkaRetryDelaysMs,
                isActive: active,
                heartbeat,
                deadLetter: (record) => this.owner.send(dlt, [record]),
              },
            );
          } finally {
            this.owner.inflight -= 1;
          }
          processed().inc({ group: this.group, result: result.result });
          if (result.result === "aborted") break;
          // Commit only after success, a deliberate skip, or a confirmed DLT write (at-least-once).
          await consumer.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(message.offset) + 1n).toString() }]);
          resolveOffset(message.offset);
          await heartbeat();
        }
        const lag = Number(batch.offsetLag());
        this.lag.set(batch.partition, Number.isFinite(lag) && lag > 0 ? lag : 0);
        lagGauge().set({ group: this.group }, [...this.lag.values()].reduce((sum, value) => sum + value, 0));
      },
    });
    log.info("consumer group running", { group: this.group, groupId: MessagingNames.groupId(this.group), topics: this.topics });
  }

  private async disposeConsumer(): Promise<void> {
    const consumer = this.consumer;
    this.consumer = null;
    if (consumer) await consumer.disconnect().catch(() => undefined);
  }

  /** Stops fetching, lets the in-flight record finish (retries are abandoned, offset stays uncommitted) and leaves the group. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    await this.loop?.catch(() => undefined);
    await this.disposeConsumer();
  }
}

/**
 * Kafka access for one process: a lazily connected producer and admin, idempotent topic creation, one consumer per
 * registered group, and the DLT read path used by the admin endpoints.
 */
export class KafkaMessaging {
  private kafka: Kafka | null = null;
  private producer: Promise<Producer> | null = null;
  private admin: Promise<Admin> | null = null;
  private readonly knownTopics = new Set<string>();
  private readonly topicLock = new Mutex();
  private readonly syncLock = new Mutex();
  private readonly groups = new Map<string, GroupConsumer>();
  private closed = false;
  private consuming = false;
  /** Records currently inside a handler (including retry waits). */
  inflight = 0;

  constructor(
    readonly service: string,
    readonly registry: HandlerRegistry = handlerRegistry,
  ) {}

  client(): Kafka {
    if (!this.kafka) {
      this.kafka = new Kafka({
        clientId: `${this.service}-${instanceId()}`,
        brokers: messagingSettings().kafkaBrokers,
        connectionTimeout: 3000,
        requestTimeout: 10_000,
        retry: { initialRetryTime: 300, maxRetryTime: 10_000, retries: 5 },
        logLevel: logLevel.WARN,
        logCreator: kafkaLogCreator,
      });
    }
    return this.kafka;
  }

  getProducer(): Promise<Producer> {
    if (this.closed) return Promise.reject(new Error("Kafka messaging is closed"));
    if (!this.producer) {
      const producer = this.client().producer({
        // Explicit partitioner: murmur2 (Java-compatible) and no kafkajs v2 partitioner warning.
        createPartitioner: Partitioners.DefaultPartitioner,
        allowAutoTopicCreation: false,
        maxInFlightRequests: 1,
        retry: { initialRetryTime: 300, maxRetryTime: 5000, retries: 3 },
      });
      const ready: Promise<Producer> = producer.connect().then(
        () => producer,
        (error) => {
          if (this.producer === ready) this.producer = null;
          throw error;
        },
      );
      ready.catch(() => undefined);
      producer.on(producer.events.DISCONNECT, () => {
        if (this.producer === ready) this.producer = null;
      });
      this.producer = ready;
    }
    return this.producer;
  }

  getAdmin(): Promise<Admin> {
    if (this.closed) return Promise.reject(new Error("Kafka messaging is closed"));
    if (!this.admin) {
      const admin = this.client().admin({ retry: { initialRetryTime: 300, maxRetryTime: 3000, retries: 3 } });
      const ready: Promise<Admin> = admin.connect().then(
        () => admin,
        (error) => {
          if (this.admin === ready) this.admin = null;
          throw error;
        },
      );
      ready.catch(() => undefined);
      admin.on(admin.events.DISCONNECT, () => {
        if (this.admin === ready) this.admin = null;
      });
      this.admin = ready;
    }
    return this.admin;
  }

  /** Creates missing topics (3 partitions, broker default replication). Safe to call concurrently and across replicas. */
  ensureTopics(topics: string[]): Promise<void> {
    const wanted = [...new Set(topics)].filter((topic) => !this.knownTopics.has(topic));
    if (!wanted.length) return Promise.resolve();
    return this.topicLock.run(async () => {
      const missing = wanted.filter((topic) => !this.knownTopics.has(topic));
      if (!missing.length) return;
      const admin = await this.getAdmin();
      const existing = new Set(await admin.listTopics());
      const create = missing.filter((topic) => !existing.has(topic));
      if (create.length) {
        await admin.createTopics({ waitForLeaders: true, timeout: 10_000, topics: create.map((topic) => ({ topic, numPartitions: KAFKA_PARTITIONS })) });
        log.info("topics ensured", { created: create });
      }
      for (const topic of missing) this.knownTopics.add(topic);
    });
  }

  /** Produces records (acks from all in-sync replicas) after making sure the topic exists. */
  async send(topic: string, messages: Message[]): Promise<void> {
    await this.ensureTopics([topic]);
    const producer = await this.getProducer();
    try {
      await producer.send({ topic, messages, acks: -1, timeout: 10_000 });
    } catch (error) {
      if ((error as { type?: string }).type === "UNKNOWN_TOPIC_OR_PARTITION") this.knownTopics.delete(topic);
      throw error;
    }
  }

  /** Enables consuming and starts a consumer per registered group (each keeps retrying in the background). */
  startConsumers(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.consuming = true;
    return this.syncConsumers();
  }

  /** Starts consumers for new groups, restarts a group whose topic set changed and stops removed groups. Serialised. */
  syncConsumers(): Promise<void> {
    return this.syncLock.run(() => this.syncConsumersNow());
  }

  private async syncConsumersNow(): Promise<void> {
    if (this.closed || !this.consuming) return;
    const desired = new Map<string, string[]>();
    for (const [group, entry] of this.registry.kafkaGroups()) desired.set(group, MessagingNames.groupTopics(group, entry.events));
    for (const [group, consumer] of [...this.groups]) {
      const topics = desired.get(group);
      if (!topics || topics.join("|") !== consumer.topics.join("|")) {
        this.groups.delete(group);
        await consumer.stop();
      }
    }
    for (const [group, topics] of desired) {
      if (this.groups.has(group)) continue;
      const consumer = new GroupConsumer(this, group, topics);
      this.groups.set(group, consumer);
      consumer.start();
    }
  }

  isConsuming(): boolean {
    return this.consuming;
  }

  groupNames(): string[] {
    return [...this.registry.kafkaGroups().keys()];
  }

  async stopConsumers(): Promise<void> {
    this.consuming = false;
    await this.syncLock.run(async () => {
      const consumers = [...this.groups.values()];
      this.groups.clear();
      await Promise.all(consumers.map((consumer) => consumer.stop()));
    });
  }

  async disconnectProducer(): Promise<void> {
    const producer = this.producer;
    this.producer = null;
    if (producer) await producer.then((p) => p.disconnect()).catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.stopConsumers();
    await this.disconnectProducer();
    this.closed = true;
    const admin = this.admin;
    this.admin = null;
    if (admin) await admin.then((a) => a.disconnect()).catch(() => undefined);
  }

  async healthCheck(): Promise<void> {
    const admin = await this.getAdmin();
    await admin.describeCluster();
  }

  async topicOffsets(topic: string): Promise<Array<{ partition: number; low: bigint; high: bigint }>> {
    const admin = await this.getAdmin();
    const offsets = await admin.fetchTopicOffsets(topic);
    return offsets.map((entry) => ({ partition: entry.partition, low: BigInt(entry.low), high: BigInt(entry.high) })).sort((a, b) => a.partition - b.partition);
  }

  async groupStatus(group: string): Promise<KafkaGroupStatus> {
    const admin = await this.getAdmin();
    const entry = this.registry.kafkaGroups().get(group);
    const topics = MessagingNames.groupTopics(group, entry?.events ?? []);
    const groupId = MessagingNames.groupId(group);
    const dltTopic = MessagingNames.dltTopic(group);
    await this.ensureTopics([...topics, dltTopic]);
    const [description, committed, topicOffsets, dltOffsets] = await Promise.all([
      admin.describeGroups([groupId]),
      admin.fetchOffsets({ groupId, topics }),
      Promise.all(topics.map(async (topic) => [topic, await this.topicOffsets(topic)] as const)),
      this.topicOffsets(dltTopic),
    ]);
    const described = description.groups.find((g) => g.groupId === groupId);
    let lag = 0n;
    for (const [topic, partitions] of topicOffsets) {
      const commits = committed.find((c) => c.topic === topic)?.partitions ?? [];
      for (const { partition, low, high } of partitions) {
        const raw = commits.find((c) => c.partition === partition)?.offset ?? "-1";
        const position = BigInt(raw) < 0n ? low : BigInt(raw);
        if (high > position) lag += high - position;
      }
    }
    lagGauge().set({ group }, Number(lag));
    return {
      group,
      groupId,
      topics,
      state: described?.state ?? "Unknown",
      members: activeMembers(described),
      lag: Number(lag),
      dltTopic,
      dltOffsets,
    };
  }

  /**
   * Reads every retained record of a topic without touching any real consumer group: a throwaway group reads from
   * the earliest offset up to the high watermarks captured at the start, never commits, and is deleted afterwards.
   */
  async readTopic(topic: string, options: { maxRecords?: number; timeoutMs?: number } = {}): Promise<KafkaTopicRecord[]> {
    const maxRecords = options.maxRecords ?? 10_000;
    const timeoutMs = options.timeoutMs ?? 15_000;
    await this.ensureTopics([topic]);
    const offsets = await this.topicOffsets(topic);
    const pending = new Map(offsets.filter((o) => o.high > o.low).map((o) => [o.partition, o.high] as const));
    if (!pending.size) return [];

    const records: KafkaTopicRecord[] = [];
    const groupId = namespaced(`meridian.admin-reader.${randomUUID()}`);
    const consumer = this.client().consumer({
      groupId,
      sessionTimeout: 10_000,
      heartbeatInterval: 1000,
      maxWaitTimeInMs: 250,
      allowAutoTopicCreation: false,
      retry: { retries: 2 },
    });
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    let timer: NodeJS.Timeout | undefined;
    try {
      await consumer.connect();
      await consumer.subscribe({ topics: [topic], fromBeginning: true });
      await consumer.run({
        autoCommit: false,
        eachBatch: async ({ batch }) => {
          const high = pending.get(batch.partition);
          if (high === undefined) return;
          for (const message of batch.messages) {
            if (BigInt(message.offset) < high && records.length < maxRecords) records.push({ partition: batch.partition, message });
          }
          const last = BigInt(batch.lastOffset());
          if (last >= high - 1n || records.length >= maxRecords) pending.delete(batch.partition);
          if (!pending.size) finish();
        },
      });
      const outcome = await Promise.race([done.then(() => "done" as const), new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), timeoutMs)))]);
      if (outcome === "timeout") throw new Error(`Timed out reading ${topic} after ${timeoutMs}ms`);
    } finally {
      clearTimeout(timer);
      await consumer.disconnect().catch(() => undefined);
      await this.getAdmin()
        .then((admin) => admin.deleteGroups([groupId]))
        .catch(() => undefined);
    }
    return records.sort((a, b) => Number(a.message.timestamp) - Number(b.message.timestamp) || a.partition - b.partition || Number(BigInt(a.message.offset) - BigInt(b.message.offset)));
  }
}
