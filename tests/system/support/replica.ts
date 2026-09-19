import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import { cfg, repoRoot, runDir, SERVICES, type ServiceName, serviceUrl, stackState } from "./env";
import { waitFor } from "./wait";

const PORT_MIN = 4201;
const PORT_MAX = 4299;
const pidDir = join(runDir, "replicas");
const logDir = join(runDir, "logs");

export interface ExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface Replica {
  svc: ServiceName;
  port: number;
  url: string;
  pid: number;
  logPath: string;
  child: ChildProcess;
  exited: Promise<ExitInfo>;
  log(): string;
  /** Parsed JSON log lines. */
  logLines(): Record<string, any>[];
  /** Sends `signal` and waits for exit; SIGKILLs after `timeoutMs` (reported as timedOut). */
  stop(signal?: NodeJS.Signals, timeoutMs?: number): Promise<ExitInfo & { timedOut: boolean }>;
}

const live = new Set<Replica>();
const reserved = new Set<number>();

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

async function allocatePort(): Promise<number> {
  const span = PORT_MAX - PORT_MIN + 1;
  const start = Math.floor(Math.random() * span);
  for (let i = 0; i < span; i++) {
    const port = PORT_MIN + ((start + i) % span);
    if (reserved.has(port)) continue;
    if (await portFree(port)) {
      reserved.add(port);
      return port;
    }
  }
  throw new Error(`no free port in ${PORT_MIN}-${PORT_MAX}`);
}

/** Same environment the stack gives its own process (stack.mjs `serviceEnv` over svc-lib `baseEnv`), on another port. */
export function replicaEnv(svc: ServiceName, port: number, extra: Record<string, string> = {}): Record<string, string> {
  const state = stackState();
  const urls = Object.fromEntries((Object.keys(SERVICES) as ServiceName[]).map((s) => [SERVICES[s].urlVar, serviceUrl(s)]));
  return {
    SERVICE_NAME: svc,
    PORT: String(port),
    [SERVICES[svc].dbVar]: state.dbUrls[svc],
    REDIS_URL: cfg.redisUrl,
    REDIS_KEY_PREFIX: cfg.redisKeyPrefix,
    KAFKA_BROKERS: cfg.kafkaBrokers.join(","),
    RABBIT_URL: cfg.rabbitUrl,
    MESSAGING_NAMESPACE: state.ns,
    JWT_SECRET: cfg.jwtSecret,
    ORDER_LINK_SECRET: cfg.orderLinkSecret,
    TURNSTILE_SECRET_KEY: cfg.turnstileSecret,
    CAPTCHA_TIMEOUT_MS: "3000",
    SHUTDOWN_DRAIN_MS: "0",
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "meridian",
    S3_SECRET_KEY: "meridianminio",
    S3_BUCKET_MEDIA: "meridian-media",
    S3_BUCKET_INVOICES: "meridian-invoices",
    S3_PUBLIC_URL: "http://localhost:9000/meridian-media",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SUPPORT_EMAIL: "support@meridian.local",
    MAILHOG_API_URL: cfg.mailhogUrl,
    ...urls,
    NODE_ENV: "development",
    CHAOS_ENABLED: "true",
    OUTBOX_POLL_MS: "250",
    KAFKA_RETRY_DELAYS_MS: "200,500,1000",
    RABBIT_RETRY_DELAYS_MS: "1000,2000,4000",
    PUBLIC_SITE_URL: process.env.STACK_SITE_URL ?? "http://localhost:5100",
    ADMIN_EMAIL: cfg.adminEmail,
    ADMIN_PASSWORD: cfg.adminPassword,
    ORDER_HOLD_MINUTES: "15",
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.STACK_OTEL ?? "",
    LOG_LEVEL: "info",
    ...extra,
  };
}

/**
 * Starts one extra replica of a stack service (built `dist/main.js`) on a port in 4201–4299 against the stack's
 * database, namespace and Redis prefix, and waits for readiness. Every replica is registered in `.run/replicas`
 * so global teardown can kill leftovers; tests stop them in `finally`/`afterAll`.
 */
export async function startReplica(svc: ServiceName, { extraEnv = {}, readyTimeoutMs = 120_000 }: { extraEnv?: Record<string, string>; readyTimeoutMs?: number } = {}): Promise<Replica> {
  mkdirSync(pidDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const port = await allocatePort();
  const logPath = join(logDir, `${svc}-${port}-${Date.now()}.log`);
  const fd = openSync(logPath, "w");
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: join(repoRoot, "apps", svc),
    env: { ...process.env, ...replicaEnv(svc, port, extraEnv) },
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  if (!child.pid) throw new Error(`failed to spawn ${svc} replica`);
  const pidFile = join(pidDir, `${child.pid}.json`);
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, svc, port, startedAt: new Date().toISOString() }));
  const exited = new Promise<ExitInfo>((resolve) =>
    child.once("exit", (code, signal) => {
      rmSync(pidFile, { force: true });
      reserved.delete(port);
      resolve({ code, signal });
    }),
  );
  const log = () => (existsSync(logPath) ? readFileSync(logPath, "utf8") : "");
  const replica: Replica = {
    svc,
    port,
    url: `http://localhost:${port}`,
    pid: child.pid,
    logPath,
    child,
    exited,
    log,
    logLines: () =>
      log()
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as Record<string, any>];
          } catch {
            return [];
          }
        }),
    async stop(signal: NodeJS.Signals = "SIGTERM", timeoutMs = 30_000) {
      live.delete(replica);
      if (child.exitCode !== null || child.signalCode !== null) return { ...(await exited), timedOut: false };
      child.kill(signal);
      let timer: NodeJS.Timeout | undefined;
      const result = await Promise.race([exited, new Promise<null>((r) => (timer = setTimeout(() => r(null), timeoutMs)))]);
      clearTimeout(timer);
      if (result) return { ...result, timedOut: false };
      child.kill("SIGKILL");
      return { ...(await exited), timedOut: true };
    },
  };
  live.add(replica);
  try {
    await waitFor(
      async () => {
        if (child.exitCode !== null) throw new Error(`exited with code ${child.exitCode}`);
        const r = await fetch(`${replica.url}/health/ready`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
        return r?.status === 200;
      },
      `${svc} replica on :${port} to become ready`,
      { timeoutMs: readyTimeoutMs, intervalMs: 500 },
    );
  } catch (error) {
    await replica.stop("SIGKILL", 5000);
    throw new Error(`${(error as Error).message}\n--- ${logPath} (tail) ---\n${log().slice(-3000)}`);
  }
  return replica;
}

/** Stops every replica started by this worker (SIGTERM, then SIGKILL). */
export async function stopAllReplicas(): Promise<void> {
  await Promise.all([...live].map((r) => r.stop("SIGTERM", 20_000)));
}

/** Kills replicas left behind by a crashed worker (pid registry); used by global setup/teardown. */
export function killLeftoverReplicas(): number {
  if (!existsSync(pidDir)) return 0;
  let killed = 0;
  for (const file of readdirSync(pidDir)) {
    const path = join(pidDir, file);
    try {
      const { pid, svc } = JSON.parse(readFileSync(path, "utf8")) as { pid: number; svc: string };
      if (!/^(identity|catalog|inventory|checkout|payment|notification|analytics)-service$|^search-worker$/.test(svc)) continue;
      if (isReplicaProcess(pid)) {
        process.kill(pid, "SIGKILL");
        killed++;
      }
    } catch {
      // unreadable or already gone
    }
    rmSync(path, { force: true });
  }
  return killed;
}

/** Only ever kill a process that is still a node dist/main.js of an apps/* service started from this repo. */
function isReplicaProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    const environ = readFileSync(`/proc/${pid}/environ`, "utf8");
    return cmdline.includes("dist/main.js") && environ.includes("SERVICE_NAME=") && stackState().processes.every((p) => p.pid !== pid);
  } catch {
    return false;
  }
}

process.once("exit", () => {
  for (const r of live) {
    try {
      r.child.kill("SIGKILL");
    } catch {
      // gone
    }
  }
});
