import { MessagingNames } from "./config";

export type RabbitFailureDecision =
  | { action: "retry"; attempts: number; delayMs: number; exchange: string; routingKey: string; queue: string }
  | { action: "dead-letter"; attempts: number; reason: "permanent" | "exhausted"; exchange: string; routingKey: string; queue: string };

/**
 * Where a failed RabbitMQ delivery goes next. `attempt` is the 1-based number of the delivery that just failed.
 * Delivery n (n ≤ delays.length) is retried after delays[n-1]; the delivery after the last tier, or any
 * PermanentError, is dead-lettered. With delays [a, b, c] a message is delivered at most 4 times.
 */
export function decideRabbitFailure(command: string, attempt: number, delaysMs: readonly number[], permanent: boolean): RabbitFailureDecision {
  const attempts = Math.max(1, Math.floor(attempt));
  const dlq = MessagingNames.dlq(command);
  if (permanent || attempts > delaysMs.length) {
    return {
      action: "dead-letter",
      attempts,
      reason: permanent ? "permanent" : "exhausted",
      exchange: MessagingNames.deadLetterExchange(),
      routingKey: MessagingNames.commandQueue(command),
      queue: dlq,
    };
  }
  const delayMs = delaysMs[attempts - 1];
  const queue = MessagingNames.retryQueue(command, delayMs);
  return { action: "retry", attempts, delayMs, exchange: MessagingNames.retryExchange(), routingKey: queue, queue };
}

/** Delay to wait before in-process Kafka attempt `nextAttempt` (2-based), or null when the record must go to the DLT. */
export function kafkaRetryDelay(nextAttempt: number, delaysMs: readonly number[]): number | null {
  const index = nextAttempt - 2;
  return index >= 0 && index < delaysMs.length ? delaysMs[index] : null;
}

/** Outbox publish backoff after `attempts` failures: 1s, 2s, 4s … capped at 30s. */
export function outboxBackoffMs(attempts: number, baseMs = 1000, maxMs = 30_000): number {
  const exponent = Math.max(0, Math.min(30, attempts - 1));
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

/** AMQP headers that the broker owns; copying them onto a republished message is wrong (RabbitMQ 4 rejects/ignores them). */
const BROKER_HEADERS = new Set(["x-death", "x-first-death-exchange", "x-first-death-queue", "x-first-death-reason", "x-last-death-exchange", "x-last-death-queue", "x-last-death-reason"]);

export function republishableHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers ?? {})) if (!BROKER_HEADERS.has(key)) out[key] = value;
  return out;
}

/** Sleeps `ms`, waking early (resolving false) when `shouldStop` turns true; checks every `tickMs` and calls `tick`. */
export async function interruptibleSleep(ms: number, shouldStop: () => boolean, tick?: () => Promise<void>, tickMs = 1000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (shouldStop()) return false;
    await new Promise((resolve) => setTimeout(resolve, Math.min(tickMs, Math.max(0, end - Date.now()))));
    if (tick) await tick();
  }
  return !shouldStop();
}
