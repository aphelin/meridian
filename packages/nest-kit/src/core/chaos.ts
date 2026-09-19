import type { ChaosFault, ChaosRuleDto, ChaosRuleInput } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { createLogger } from "./logger";

/**
 * Fault injection for demos and resilience tests. Disabled unless CHAOS_ENABLED=true and NODE_ENV is not production.
 * Named injection points (targets) used across the platform:
 *   "http:<client-name>"            ResilientHttpClient calls (e.g. "http:inventory")
 *   "handler:rabbit:<command>"      RabbitMQ command handlers (e.g. "handler:rabbit:notification.send-email")
 *   "handler:kafka:<group>"         Kafka consumer group handlers (e.g. "handler:kafka:search-indexer")
 *   "smtp.send", "s3.put", "captcha.verify", "paddle.api"   adapters
 * A rule target ending in "*" matches by prefix.
 */
export interface ChaosStore {
  list(): Promise<ChaosRuleDto[]>;
  set(rule: ChaosRuleDto): Promise<void>;
  clear(target?: string): Promise<void>;
}

export class ChaosError extends DomainError {
  constructor(target: string, fault: ChaosFault) {
    super("CHAOS_INJECTED", `Injected ${fault} at ${target}`, { target, fault });
    this.name = "ChaosError";
  }
}

export class MemoryChaosStore implements ChaosStore {
  private rules = new Map<string, ChaosRuleDto>();

  async list() {
    const now = Date.now();
    for (const [key, rule] of this.rules) if (Date.parse(rule.expiresAt) <= now) this.rules.delete(key);
    return [...this.rules.values()];
  }

  async set(rule: ChaosRuleDto) {
    this.rules.set(rule.target, rule);
  }

  async clear(target?: string) {
    if (target) this.rules.delete(target);
    else this.rules.clear();
  }
}

const log = createLogger("Chaos");
let store: ChaosStore = new MemoryChaosStore();
let cache: { at: number; rules: ChaosRuleDto[] } | null = null;
const CACHE_MS = 500;

export function chaosEnabled(): boolean {
  return process.env.CHAOS_ENABLED === "true" && process.env.NODE_ENV !== "production";
}

export function setChaosStore(next: ChaosStore): void {
  store = next;
  cache = null;
}

export function chaosStore(): ChaosStore {
  return store;
}

export function toChaosRule(input: ChaosRuleInput, now = new Date()): ChaosRuleDto {
  return {
    target: input.target,
    fault: input.fault,
    rate: Math.min(1, Math.max(0, input.rate)),
    delayMs: Math.max(0, input.delayMs),
    expiresAt: new Date(now.getTime() + Math.max(1, input.ttlSec) * 1000).toISOString(),
  };
}

export async function setChaosRule(input: ChaosRuleInput): Promise<ChaosRuleDto> {
  const rule = toChaosRule(input);
  await store.set(rule);
  cache = null;
  log.warn("chaos rule set", { rule });
  return rule;
}

export async function clearChaos(target?: string): Promise<void> {
  await store.clear(target);
  cache = null;
  log.warn("chaos cleared", { target: target ?? "*" });
}

async function currentRules(): Promise<ChaosRuleDto[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  const rules = await store.list().catch(() => []);
  cache = { at: Date.now(), rules };
  return rules;
}

function matches(rule: ChaosRuleDto, target: string) {
  return rule.target.endsWith("*") ? target.startsWith(rule.target.slice(0, -1)) : rule.target === target;
}

/** Call at an injection point. May delay, or throw ChaosError, according to the active rules. */
export async function injectChaos(target: string): Promise<void> {
  if (!chaosEnabled()) return;
  const now = Date.now();
  const rule = (await currentRules()).find((r) => matches(r, target) && Date.parse(r.expiresAt) > now);
  if (!rule || Math.random() >= rule.rate) return;
  if (rule.fault === "delay") {
    await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
    return;
  }
  if (rule.fault === "timeout") await new Promise((resolve) => setTimeout(resolve, rule.delayMs || 30_000));
  throw new ChaosError(target, rule.fault);
}
