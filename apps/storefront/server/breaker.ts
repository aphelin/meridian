import type { BreakerState, BreakerStatusDto } from "@meridian/contracts";
import CircuitBreaker from "opossum";
import { ServiceError } from "./errors";

export interface BreakerOptions {
  /** Minimum calls in the rolling window before the breaker may open. Default 5. */
  volumeThreshold?: number;
  /** Failure percentage above which the breaker opens. Default 50. */
  errorThresholdPercentage?: number;
  /** Time open before a trial call is let through. Default BREAKER_RESET_MS or 10000. */
  resetTimeoutMs?: number;
  /**
   * Rolling statistics window. Default 60000: calls are bounded by per-call timeouts of up to 15 s, so a shorter window
   * could never hold enough consecutive timeouts to reach the volume threshold.
   */
  rollingWindowMs?: number;
}

type Action = () => Promise<unknown>;

interface Entry {
  name: string;
  target: string;
  breaker: CircuitBreaker<[Action], unknown>;
  lastStateChangeAt: string | null;
  timeouts: number;
}

const KEY = Symbol.for("meridian.bff.breakers");
const registry: Map<string, Entry> = ((globalThis as Record<symbol, unknown>)[KEY] as Map<string, Entry> | undefined) ?? new Map();
(globalThis as Record<symbol, unknown>)[KEY] = registry;

/** Errors that say nothing about the dependency's health: upstream 4xx answers. */
export function isNeutral(error: unknown): boolean {
  return error instanceof ServiceError && error.status < 500;
}

function stateOf(breaker: CircuitBreaker<[Action], unknown>): BreakerState {
  if (breaker.opened) return "open";
  if (breaker.halfOpen) return "half-open";
  return "closed";
}

function statusOf(entry: Entry): BreakerStatusDto {
  const stats = entry.breaker.stats;
  return {
    name: entry.name,
    target: entry.target,
    state: stateOf(entry.breaker),
    failures: stats.failures,
    successes: stats.successes,
    rejects: stats.rejects,
    timeouts: entry.timeouts,
    lastStateChangeAt: entry.lastStateChangeAt,
  };
}

export interface BffBreaker {
  readonly name: string;
  /**
   * Runs `action` through the breaker. An open breaker rejects immediately with 503 UPSTREAM_UNAVAILABLE; upstream 4xx
   * errors pass through without counting; everything else the action throws counts as a failure.
   */
  fire<T>(action: () => Promise<T>): Promise<T>;
  status(): BreakerStatusDto;
}

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Returns the process-wide breaker registered under `name`, creating it on first use. */
export function breakerFor(name: string, options: BreakerOptions = {}): BffBreaker {
  let entry = registry.get(name);
  if (!entry) {
    const breaker = new CircuitBreaker<[Action], unknown>((action: Action) => action(), {
      name,
      // Per-call timeouts are enforced by AbortSignal in the action, so the socket is released when they fire.
      timeout: false,
      volumeThreshold: options.volumeThreshold ?? 5,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      resetTimeout: options.resetTimeoutMs ?? envInt("BREAKER_RESET_MS", 10_000),
      rollingCountTimeout: options.rollingWindowMs ?? 60_000,
      rollingCountBuckets: 12,
      errorFilter: (error: unknown) => isNeutral(error),
    });
    const created: Entry = { name, target: `http:${name}`, breaker, lastStateChangeAt: null, timeouts: 0 };
    const changed = (state: BreakerState) => () => {
      created.lastStateChangeAt = new Date().toISOString();
      const line = { level: state === "open" ? "warn" : "info", time: created.lastStateChangeAt, service: "storefront-bff", msg: "circuit breaker state changed", breaker: name, state };
      if (state === "open") console.warn(JSON.stringify(line));
      else console.info(JSON.stringify(line));
    };
    breaker.on("open", changed("open"));
    breaker.on("halfOpen", changed("half-open"));
    breaker.on("close", changed("closed"));
    registry.set(name, created);
    entry = created;
  }
  const current = entry;
  return {
    name,
    async fire<T>(action: () => Promise<T>): Promise<T> {
      // opossum counts the fire into the current bucket synchronously; a neutral outcome is removed from it again so
      // client errors neither add to nor dilute the failure rate.
      const bucket = (current.breaker.status as unknown as { window?: { fires: number; successes: number }[] }).window?.[0];
      try {
        return (await current.breaker.fire(action)) as T;
      } catch (error) {
        if (error instanceof Error && CircuitBreaker.isOurError(error)) {
          throw ServiceError.unavailable(name, "breaker-open", undefined, error);
        }
        if (error instanceof ServiceError && error.reason === "timeout") current.timeouts += 1;
        if (bucket && isNeutral(error)) {
          bucket.fires = Math.max(0, bucket.fires - 1);
          bucket.successes = Math.max(0, bucket.successes - 1);
        }
        throw error;
      }
    },
    status: () => statusOf(current),
  };
}

/** State of every breaker in this BFF process, sorted by name. */
export function breakerSnapshot(): BreakerStatusDto[] {
  return [...registry.values()].map(statusOf).sort((a, b) => a.name.localeCompare(b.name));
}

/** Test helper: drop every breaker and stop its statistics timers. */
export function resetBreakers(): void {
  for (const entry of registry.values()) entry.breaker.shutdown();
  registry.clear();
}
