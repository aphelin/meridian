import { createLogger } from "./logger";

/**
 * Ordered graceful shutdown. On SIGTERM/SIGINT the runtime calls `shutdown()`:
 *   1. readiness flips to 503 immediately and new work is refused,
 *   2. "drain": wait SHUTDOWN_DRAIN_MS so load balancers stop routing,
 *   3. "http": stop accepting connections and let in-flight requests finish,
 *   4. "consumers": stop Kafka/RabbitMQ consumers after their in-flight handlers settle,
 *   5. "producers": stop the outbox relay after its current batch, flush producers,
 *   6. "resources": close Prisma, Redis, broker connections, tracing exporter.
 * Each hook gets SHUTDOWN_HOOK_TIMEOUT_MS; the whole sequence is bounded by SHUTDOWN_TIMEOUT_MS.
 */
export type ShutdownPhase = "drain" | "http" | "consumers" | "producers" | "resources";
const PHASES: ShutdownPhase[] = ["drain", "http", "consumers", "producers", "resources"];

type Hook = { name: string; phase: ShutdownPhase; run: () => Promise<void> | void };

const hooks: Hook[] = [];
const log = createLogger("Lifecycle");
let shuttingDown = false;
let finished: Promise<void> | null = null;

export function onShutdown(name: string, phase: ShutdownPhase, run: () => Promise<void> | void): void {
  hooks.push({ name, phase, run });
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

function envMs(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function withTimeout(hook: Hook, ms: number) {
  let timer: NodeJS.Timeout | undefined;
  const started = Date.now();
  try {
    await Promise.race([
      Promise.resolve().then(hook.run),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
    log.info("shutdown hook finished", { hook: hook.name, phase: hook.phase, durationMs: Date.now() - started });
  } catch (error) {
    log.error("shutdown hook failed", { hook: hook.name, phase: hook.phase, error });
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every registered hook phase by phase. Safe to call more than once; later calls await the first run. */
export function shutdown(signal: string): Promise<void> {
  if (finished) return finished;
  shuttingDown = true;
  log.info("shutdown started", { signal });
  const hookTimeout = envMs("SHUTDOWN_HOOK_TIMEOUT_MS", 10_000);
  finished = (async () => {
    for (const phase of PHASES) {
      if (phase === "drain") {
        const drain = envMs("SHUTDOWN_DRAIN_MS", 0);
        if (drain) await new Promise((resolve) => setTimeout(resolve, drain));
      }
      for (const hook of hooks.filter((h) => h.phase === phase)) await withTimeout(hook, hookTimeout);
    }
    log.info("shutdown complete", { signal });
  })();
  return finished;
}

/** Installs SIGTERM/SIGINT handlers that run `shutdown()` and exit 0, or exit 1 if SHUTDOWN_TIMEOUT_MS elapses first. */
export function installSignalHandlers(): void {
  const handle = (signal: NodeJS.Signals) => {
    const limit = envMs("SHUTDOWN_TIMEOUT_MS", 25_000);
    const force = setTimeout(() => {
      log.error("shutdown timed out; forcing exit", { signal, limitMs: limit });
      process.exit(1);
    }, limit);
    force.unref();
    shutdown(signal).then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once("SIGTERM", handle);
  process.once("SIGINT", handle);
}

/** Test helper: forget hooks and state. */
export function resetLifecycleForTests(): void {
  hooks.length = 0;
  shuttingDown = false;
  finished = null;
}
