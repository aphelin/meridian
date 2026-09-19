import type { HealthDto } from "@meridian/contracts";
import { isShuttingDown } from "./lifecycle";
import { instanceId, serviceName } from "./service-info";

type Check = () => Promise<void>;

const checks = new Map<string, Check>();

/** Registers a readiness dependency (database, Redis, broker…). A check resolves when healthy and throws when not. */
export function registerHealthCheck(name: string, check: Check): void {
  checks.set(name, check);
}

export function unregisterHealthCheck(name: string): void {
  checks.delete(name);
}

async function runOne(check: Check, timeoutMs: number) {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`health check timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { status: "up" as const, latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "down" as const, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Readiness report. `status` is "shutting-down" during graceful shutdown, "down" when any check fails. */
export async function readiness(timeoutMs = Number(process.env.HEALTH_CHECK_TIMEOUT_MS ?? 2000)): Promise<HealthDto> {
  const entries = await Promise.all([...checks].map(async ([name, check]) => [name, await runOne(check, timeoutMs)] as const));
  const results = Object.fromEntries(entries);
  const anyDown = entries.some(([, r]) => r.status === "down");
  return {
    status: isShuttingDown() ? "shutting-down" : anyDown ? "down" : "ok",
    service: serviceName(),
    instanceId: instanceId(),
    checks: results,
  };
}

/** Liveness: the process is running its event loop. */
export function liveness(): HealthDto {
  return { status: isShuttingDown() ? "shutting-down" : "ok", service: serviceName(), instanceId: instanceId(), checks: {} };
}
