import { createRequire } from "node:module";
import { cfg } from "./env";

/** RabbitMQ management API (read-only use): queue depth, unacked deliveries and consumers. */
export interface RabbitQueue {
  name: string;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
}

function managementBase(): { base: string; auth: string } {
  const url = new URL(cfg.rabbitManagementUrl);
  const auth = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}`;
  url.username = "";
  url.password = "";
  return { base: url.toString().replace(/\/$/, ""), auth };
}

export async function rabbitQueue(name: string): Promise<RabbitQueue> {
  const { base, auth } = managementBase();
  const res = await fetch(`${base}/api/queues/%2F/${encodeURIComponent(name)}`, { headers: { authorization: auth }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`rabbit management GET queue ${name}: ${res.status}`);
  return (await res.json()) as RabbitQueue;
}

/** Namespaced command queue name as declared by the services. */
export const commandQueue = (command: string) => `${cfg.ns}.${command}`;

// amqplib (root dependency, no bundled types) for real-time queue counts; the management API refreshes every ~5 s.
const requireAmqp = createRequire(import.meta.url);

/** Real-time ready-message and consumer counts of a queue through a passive declare (never creates or changes it). */
export async function liveQueueCounts(name: string): Promise<{ ready: number; consumers: number }> {
  const amqp = requireAmqp("amqplib") as { connect(url: string): Promise<any> };
  const conn = await amqp.connect(cfg.rabbitUrl);
  try {
    const ch = await conn.createChannel();
    ch.on("error", () => undefined);
    const ok = (await ch.checkQueue(name)) as { messageCount: number; consumerCount: number };
    await ch.close().catch(() => undefined);
    return { ready: ok.messageCount, consumers: ok.consumerCount };
  } finally {
    await conn.close().catch(() => undefined);
  }
}
