import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tokens } from "./auth";
import { runDir, type ServiceName, serviceUrl } from "./env";
import { request } from "./http";
import { waitFor } from "./wait";

export interface ChaosRule {
  target: string;
  fault: "fail" | "delay" | "timeout";
  rate?: number;
  delayMs?: number;
  ttlSec?: number;
}

const chaosDir = join(runDir, "chaos");
const recordPath = (svc: ServiceName, target: string) => join(chaosDir, `${createHash("sha1").update(`${svc} ${target}`).digest("hex")}.json`);

/** Sets a chaos rule through the service's admin API (Redis-backed, shared by all replicas of the service). */
export async function setChaos(svc: ServiceName, rule: ChaosRule): Promise<void> {
  mkdirSync(chaosDir, { recursive: true });
  writeFileSync(recordPath(svc, rule.target), JSON.stringify({ svc, target: rule.target }));
  const body = { target: rule.target, fault: rule.fault, rate: rule.rate ?? 1, delayMs: rule.delayMs ?? 0, ttlSec: rule.ttlSec ?? 120 };
  const r = await request(serviceUrl(svc), "PUT", "/admin/chaos", { body, token: tokens.admin() });
  if (r.status !== 200) throw new Error(`set chaos ${rule.target} on ${svc}: ${r.status} ${r.text}`);
}

/** Clears one chaos target and confirms the rule is gone from the shared store. */
export async function clearChaos(svc: ServiceName, target: string): Promise<void> {
  await waitFor(
    async () => {
      const del = await request(serviceUrl(svc), "DELETE", `/admin/chaos?target=${encodeURIComponent(target)}`, { token: tokens.admin() });
      if (del.status >= 300) throw new Error(`clear chaos ${target} on ${svc}: ${del.status} ${del.text}`);
      const list = await request(serviceUrl(svc), "GET", "/admin/chaos", { token: tokens.admin() });
      return list.status === 200 && Array.isArray(list.json) && !list.json.some((r: { target: string }) => r.target === target);
    },
    `chaos rule ${target} on ${svc} to be cleared`,
    { timeoutMs: 15_000, intervalMs: 500 },
  );
  rmSync(recordPath(svc, target), { force: true });
}

/** Runs `fn` with a chaos rule active; the rule is always cleared in `finally`, even when `fn` already cleared it. */
export async function withChaos<T>(svc: ServiceName, rule: ChaosRule, fn: () => Promise<T>): Promise<T> {
  try {
    await setChaos(svc, rule);
    return await fn();
  } finally {
    await clearChaos(svc, rule.target);
  }
}

/** Clears every rule recorded by a crashed run (global setup/teardown safety net). */
export async function clearRecordedChaos(): Promise<string[]> {
  if (!existsSync(chaosDir)) return [];
  const cleared: string[] = [];
  for (const file of readdirSync(chaosDir)) {
    try {
      const { svc, target } = JSON.parse(readFileSync(join(chaosDir, file), "utf8")) as { svc: ServiceName; target: string };
      await clearChaos(svc, target);
      cleared.push(`${svc} ${target}`);
    } catch {
      rmSync(join(chaosDir, file), { force: true });
    }
  }
  return cleared;
}
