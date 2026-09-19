import type { IsoDateTime } from "../common";

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerStatusDto {
  name: string;
  target: string;
  state: BreakerState;
  failures: number;
  successes: number;
  rejects: number;
  timeouts: number;
  lastStateChangeAt: IsoDateTime | null;
}

export interface QueueStatusDto {
  queue: string;
  messages: number;
  consumers: number;
  dlq: { queue: string; messages: number };
}

export interface ConsumerGroupStatusDto {
  group: string;
  topics: string[];
  state: string;
  members: number;
  lag: number;
  dlt: { topic: string; messages: number };
}

export interface MessagingStatusDto {
  service: string;
  instanceId: string;
  outbox: { pending: number; oldestPendingAgeSec: number | null; failing: number };
  queues: QueueStatusDto[];
  consumerGroups: ConsumerGroupStatusDto[];
  breakers: BreakerStatusDto[];
  ready: boolean;
  shuttingDown: boolean;
}

export interface DeadLetterDto {
  /** Opaque id used for replay of a single message. */
  id: string;
  source: "rabbit" | "kafka";
  queueOrTopic: string;
  name: string;
  messageId: string;
  correlationId: string;
  attempts: number;
  lastError: string;
  firstFailedAt: IsoDateTime | null;
  payload: unknown;
}

export interface ReplayRequest {
  source: "rabbit" | "kafka";
  queueOrTopic: string;
  /** Replay these ids, or up to `limit` oldest messages when omitted. */
  ids?: string[];
  limit?: number;
}

export interface ReplayResultDto {
  replayed: number;
  remaining: number;
}

export type ChaosFault = "fail" | "delay" | "timeout";

export interface ChaosRuleDto {
  /** Named injection point, e.g. "smtp.send", "http:inventory", "handler:notification.send-email". */
  target: string;
  fault: ChaosFault;
  /** 0–1 share of calls affected. */
  rate: number;
  delayMs: number;
  expiresAt: IsoDateTime;
}

export type ChaosRuleInput = Omit<ChaosRuleDto, "expiresAt"> & { ttlSec: number };

export interface HealthDto {
  status: "ok" | "degraded" | "down" | "shutting-down";
  service: string;
  instanceId: string;
  checks: Record<string, { status: "up" | "down"; latencyMs: number | null; error?: string }>;
}
