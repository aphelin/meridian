import type { BreakerState, BreakerStatusDto } from "@meridian/contracts";
import CircuitBreaker from "opossum";
import { injectChaos } from "../core/chaos";
import { createLogger } from "../core/logger";
import { gauge } from "../core/metrics";
import { envInt } from "../config/env";
import { UpstreamUnavailableError } from "./errors";

export interface BreakerOptions {
  /** Per-call timeout enforced by the breaker; `false` disables it (the action must then bound itself). Default 5000. */
  timeoutMs?: number | false;
  /** Minimum calls in the rolling window before the breaker may open. Default 5. */
  volumeThreshold?: number;
  /** Failure percentage above which the breaker opens. Default 50. */
  errorThresholdPercentage?: number;
  /** Time open before a trial call is let through. Default BREAKER_RESET_MS or 10000. */
  resetTimeoutMs?: number;
  /** Rolling statistics window. Default 10000. */
  rollingWindowMs?: number;
  /**
   * Errors that say nothing about the dependency's availability (e.g. an upstream 4xx). They are rethrown unchanged
   * and removed from the rolling statistics, so they neither dilute nor add to the failure rate.
   */
  isNeutral?: (error: unknown) => boolean;
}

export interface KitBreaker<A extends unknown[], T> {
  readonly name: string;
  /** Chaos injection point evaluated before every call. */
  readonly target: string;
  /**
   * Runs the action through the breaker. Breaker-originated failures (open, timeout, overload) reject with
   * UpstreamUnavailableError; errors thrown by the action itself propagate unchanged.
   */
  fire(...args: A): Promise<T>;
  state(): BreakerState;
  status(): BreakerStatusDto;
}

const STATE_VALUE: Record<BreakerState, number> = { closed: 0, "half-open": 1, open: 2 };
const log = createLogger("CircuitBreaker");
const stateGauge = () => gauge("circuit_breaker_state", "Circuit breaker state: 0 closed, 1 half-open, 2 open", ["name"]);

interface Entry {
  breaker: CircuitBreaker;
  target: string;
  lastStateChangeAt: string | null;
}

const registry = new Map<string, Entry>();

function stateOf(breaker: CircuitBreaker): BreakerState {
  if (breaker.opened) return "open";
  if (breaker.halfOpen) return "half-open";
  return "closed";
}

function statusOf(name: string, entry: Entry): BreakerStatusDto {
  const stats = entry.breaker.stats;
  return {
    name,
    target: entry.target,
    state: stateOf(entry.breaker),
    failures: stats.failures,
    successes: stats.successes,
    rejects: stats.rejects,
    timeouts: stats.timeouts,
    lastStateChangeAt: entry.lastStateChangeAt,
  };
}

/** Every circuit breaker created in this process (HTTP clients, captcha, SMTP, S3, Paddle…). */
export class BreakerRegistry {
  static snapshot(): BreakerStatusDto[] {
    return [...registry.entries()].map(([name, entry]) => statusOf(name, entry)).sort((a, b) => a.name.localeCompare(b.name));
  }

  static get(name: string): BreakerStatusDto | undefined {
    const entry = registry.get(name);
    return entry ? statusOf(name, entry) : undefined;
  }

  /** Test helper: forget every breaker and stop their statistics timers. */
  static reset(): void {
    for (const entry of registry.values()) entry.breaker.shutdown();
    registry.clear();
  }
}

const UNAVAILABLE_REASON: Record<string, UpstreamUnavailableError["reason"]> = {
  EOPENBREAKER: "breaker-open",
  ETIMEDOUT: "timeout",
  ESEMLOCKED: "overloaded",
  ESHUTDOWN: "shutdown",
};

/**
 * Wraps `fn` in an opossum circuit breaker registered under `name`, with chaos injection at `target`.
 * Adapters (SMTP, S3, Paddle, captcha) and ResilientHttpClient all go through this so breakers are uniform and visible.
 */
export function createBreaker<A extends unknown[], T>(
  name: string,
  target: string,
  fn: (...args: A) => Promise<T>,
  options: BreakerOptions = {},
): KitBreaker<A, T> {
  const isNeutral = options.isNeutral ?? (() => false);
  const breaker = new CircuitBreaker<A, T>(
    async (...args: A) => {
      await injectChaos(target);
      return fn(...args);
    },
    {
      name,
      timeout: options.timeoutMs === undefined ? 5000 : options.timeoutMs,
      volumeThreshold: options.volumeThreshold ?? 5,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      resetTimeout: options.resetTimeoutMs ?? envInt("BREAKER_RESET_MS", 10_000, { min: 1 }),
      rollingCountTimeout: options.rollingWindowMs ?? 10_000,
      errorFilter: (error: unknown) => isNeutral(error),
    },
  );

  if (registry.has(name)) log.warn("circuit breaker name reused; the newest breaker replaces the old one in the registry", { name });
  const entry: Entry = { breaker: breaker as unknown as CircuitBreaker, target, lastStateChangeAt: null };
  registry.set(name, entry);
  stateGauge().set({ name }, STATE_VALUE.closed);

  const onState = (state: BreakerState) => () => {
    if (registry.get(name) !== entry) return;
    entry.lastStateChangeAt = new Date().toISOString();
    stateGauge().set({ name }, STATE_VALUE[state]);
    const fields = { name, target, state };
    if (state === "open") log.warn("circuit breaker opened", fields);
    else log.info("circuit breaker state changed", fields);
  };
  breaker.on("open", onState("open"));
  breaker.on("halfOpen", onState("half-open"));
  breaker.on("close", onState("closed"));

  return {
    name,
    target,
    async fire(...args: A): Promise<T> {
      // opossum counts the fire synchronously into the current bucket; remember it so a neutral outcome can be uncounted
      // even if the window rotates while the call is in flight.
      const bucket = breaker.status.window[0];
      try {
        return await breaker.fire(...args);
      } catch (error) {
        if (error instanceof Error && CircuitBreaker.isOurError(error)) {
          const code = (error as Error & { code?: string }).code ?? "";
          throw new UpstreamUnavailableError(name, UNAVAILABLE_REASON[code] ?? "network", { cause: error });
        }
        if (bucket && isNeutral(error)) {
          bucket.fires = Math.max(0, bucket.fires - 1);
          bucket.successes = Math.max(0, bucket.successes - 1);
        }
        throw error;
      }
    },
    state: () => stateOf(breaker as unknown as CircuitBreaker),
    status: () => statusOf(name, entry),
  };
}
