import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { cfg, repoRoot } from "./env";
import { waitFor } from "./wait";

// kafkajs is installed for @meridian/nest-kit (packages/nest-kit/node_modules), not at the repo root.
const requireFromKit = createRequire(join(repoRoot, "packages/nest-kit/package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Kafka, logLevel } = requireFromKit("kafkajs") as { Kafka: any; logLevel: { NOTHING: number } };

export interface Envelope<P = any> {
  messageId: string;
  kind: "event" | "command";
  name: string;
  correlationId: string;
  causationId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  producer: string;
  occurredAt: string;
  payload: P;
}

export interface KafkaRecord<P = any> {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string | null;
  headers: Record<string, string | undefined>;
  envelope: Envelope<P> | null;
}

export interface KafkaTap {
  records: KafkaRecord[];
  find<P = any>(name: string | null, predicate: (e: Envelope<P>, r: KafkaRecord<P>) => boolean, what: string, timeoutMs?: number): Promise<KafkaRecord<P>>;
  count(predicate: (r: KafkaRecord) => boolean): number;
  stop(): Promise<void>;
}

export const topic = (logical: string) => `${cfg.ns}.${logical}`;

const kafka = () => new Kafka({ clientId: `system-tests-${randomBytes(3).toString("hex")}`, brokers: cfg.kafkaBrokers, logLevel: logLevel.NOTHING });

/**
 * Reads the given namespaced topics from the beginning with a throwaway consumer group (deleted on stop), so no
 * event produced before or after the tap started is missed. Read-only: it never produces to service topics.
 */
export async function kafkaTap(logicalTopics: string[]): Promise<KafkaTap> {
  const client = kafka();
  const groupId = `${cfg.ns}.system-tests-tap-${randomBytes(4).toString("hex")}`;
  const consumer = client.consumer({ groupId, sessionTimeout: 15_000, heartbeatInterval: 1_000, retry: { retries: 3 } });
  const records: KafkaRecord[] = [];
  await consumer.connect();
  await consumer.subscribe({ topics: logicalTopics.map(topic), fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ topic: t, partition, message }: any) => {
      let envelope: Envelope | null = null;
      try {
        envelope = JSON.parse(message.value?.toString() ?? "null");
      } catch {
        envelope = null;
      }
      const headers = Object.fromEntries(Object.entries(message.headers ?? {}).map(([k, v]) => [k, v == null ? undefined : String(v)]));
      records.push({ topic: t, partition, offset: message.offset, timestamp: message.timestamp, key: message.key?.toString() ?? null, headers, envelope });
    },
  });
  let stopped = false;
  return {
    records,
    async find(name, predicate, what, timeoutMs = 60_000) {
      return waitFor(() => records.find((r) => r.envelope && (name === null || r.envelope.name === name) && predicate(r.envelope, r)), `Kafka ${name ?? "record"} on ${logicalTopics.join(",")}: ${what}`, { timeoutMs, intervalMs: 250 });
    },
    count: (predicate) => records.filter(predicate).length,
    async stop() {
      if (stopped) return;
      stopped = true;
      await consumer.disconnect().catch(() => undefined);
      const admin = client.admin();
      try {
        await admin.connect();
        await admin.deleteGroups([groupId]).catch(() => undefined);
      } finally {
        await admin.disconnect().catch(() => undefined);
      }
    },
  };
}

/** Sum of the latest offsets of a namespaced topic (messages ever written). */
export async function topicEndOffsets(logical: string): Promise<number> {
  const admin = kafka().admin();
  await admin.connect();
  try {
    const offsets: { high: string }[] = await admin.fetchTopicOffsets(topic(logical));
    return offsets.reduce((sum, o) => sum + Number(o.high), 0);
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}
