import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** tests/system */
export const suiteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(suiteDir, "../..");
/** Replica logs, pid registry and chaos registry of the current run (ignored by the suite itself). */
export const runDir = join(suiteDir, ".run");

export type ServiceName =
  | "identity-service"
  | "catalog-service"
  | "inventory-service"
  | "checkout-service"
  | "payment-service"
  | "notification-service"
  | "search-worker"
  | "analytics-service";

export const SERVICES: Record<ServiceName, { urlVar: string; dbVar: string }> = {
  "identity-service": { urlVar: "IDENTITY_URL", dbVar: "IDENTITY_DATABASE_URL" },
  "catalog-service": { urlVar: "CATALOG_URL", dbVar: "CATALOG_DATABASE_URL" },
  "inventory-service": { urlVar: "INVENTORY_URL", dbVar: "INVENTORY_DATABASE_URL" },
  "checkout-service": { urlVar: "CHECKOUT_URL", dbVar: "CHECKOUT_DATABASE_URL" },
  "payment-service": { urlVar: "PAYMENT_URL", dbVar: "PAYMENT_DATABASE_URL" },
  "notification-service": { urlVar: "NOTIFICATION_URL", dbVar: "NOTIFICATION_DATABASE_URL" },
  "search-worker": { urlVar: "SEARCH_URL", dbVar: "SEARCH_DATABASE_URL" },
  "analytics-service": { urlVar: "ANALYTICS_URL", dbVar: "ANALYTICS_DATABASE_URL" },
};

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the suite through node .unlazy/platform/checks/system-tests.mjs`);
  return value;
}

export interface StackState {
  ns: string;
  dbUrls: Record<ServiceName, string>;
  processes: { svc: ServiceName; pid: number; logPath: string }[];
}

export function stackState(): StackState {
  const file = need("STACK_STATE_FILE");
  if (!existsSync(file)) throw new Error(`stack state file ${file} does not exist (is the stack up?)`);
  return JSON.parse(readFileSync(file, "utf8")) as StackState;
}

export const serviceUrl = (svc: ServiceName): string => need(SERVICES[svc].urlVar);

export const cfg = {
  get ns() {
    return need("MESSAGING_NAMESPACE");
  },
  get redisKeyPrefix() {
    return need("REDIS_KEY_PREFIX");
  },
  get jwtSecret() {
    return need("JWT_SECRET");
  },
  get orderLinkSecret() {
    return need("ORDER_LINK_SECRET");
  },
  get adminEmail() {
    return need("STACK_ADMIN_EMAIL");
  },
  get adminPassword() {
    return need("STACK_ADMIN_PASSWORD");
  },
  get mailhogUrl() {
    return need("MAILHOG_API_URL");
  },
  get turnstileSecret() {
    return process.env.TURNSTILE_SECRET_KEY ?? "1x0000000000000000000000000000000AA";
  },
  // Shared infra (PLAN "Environment and ports"); overridable for other hosts.
  redisUrl: process.env.SYSTEM_REDIS_URL ?? "redis://localhost:6380",
  kafkaBrokers: (process.env.SYSTEM_KAFKA_BROKERS ?? "localhost:9092").split(","),
  rabbitUrl: process.env.SYSTEM_RABBIT_URL ?? "amqp://localhost:5672",
  rabbitManagementUrl: process.env.SYSTEM_RABBIT_MANAGEMENT_URL ?? "http://guest:guest@localhost:15672",
};

/** Turnstile always-pass test token (the stack runs with the always-pass test secret). */
export const CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/** Stack service log path (read-only use: observing that a stack process did something). */
export function stackLogPath(svc: ServiceName): string {
  const p = stackState().processes.find((x) => x.svc === svc);
  if (!p) throw new Error(`no stack process for ${svc}`);
  return p.logPath;
}
