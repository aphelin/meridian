import type { ChaosRuleDto } from "@meridian/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChaosError, clearChaos, injectChaos, MemoryChaosStore, setChaosRule, setChaosStore } from "../core/chaos";
import { type ChaosRedis, ChaosAdminController, RedisChaosStore } from "./chaos";

/** Minimal hash + key-expiry emulation of the ioredis calls RedisChaosStore makes. */
function fakeRedis() {
  const hashes = new Map<string, Map<string, string>>();
  const expiries = new Map<string, number>();
  const hash = (key: string) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key)!;
  };
  const client = {
    hgetall: async (key: string) => Object.fromEntries(hash(key)),
    hdel: async (key: string, ...fields: string[]) => fields.filter((f) => hash(key).delete(f)).length,
    del: async (key: string) => Number(hashes.delete(key)),
    multi() {
      const ops: (() => unknown)[] = [];
      const tx = {
        hset: (key: string, field: string, value: string) => (ops.push(() => hash(key).set(field, value)), tx),
        pexpireat: (key: string, at: number, mode: "NX" | "GT") => (
          ops.push(() => {
            const current = expiries.get(key);
            if ((mode === "NX" && current === undefined) || (mode === "GT" && current !== undefined && at > current)) expiries.set(key, at);
          }),
          tx
        ),
        exec: async () => ops.map((op) => [null, op()]),
      };
      return tx;
    },
  };
  return { client: client as unknown as ChaosRedis, hashes, expiries };
}

const rule = (target: string, ttlMs: number): ChaosRuleDto => ({ target, fault: "fail", rate: 1, delayMs: 0, expiresAt: new Date(Date.now() + ttlMs).toISOString() });

afterEach(async () => {
  vi.unstubAllEnvs();
  setChaosStore(new MemoryChaosStore());
});

describe("chaos redis store", () => {
  it("chaos rules live in one hash per service so every replica reads the same rules", async () => {
    const { client, hashes } = fakeRedis();
    const replicaA = new RedisChaosStore(client, "checkout-service");
    const replicaB = new RedisChaosStore(client, "checkout-service");
    await replicaA.set(rule("http:inventory", 30_000));
    expect(replicaA.key).toBe("chaos:checkout-service:rules");
    expect([...hashes.keys()]).toEqual(["chaos:checkout-service:rules"]);
    expect(await replicaB.list()).toEqual([expect.objectContaining({ target: "http:inventory" })]);
    expect(await new RedisChaosStore(client, "payment-service").list()).toEqual([]);
    await replicaB.clear("http:inventory");
    expect(await replicaA.list()).toEqual([]);
  });

  it("chaos store drops expired rules and only ever extends the hash expiry", async () => {
    const { client, expiries } = fakeRedis();
    const store = new RedisChaosStore(client, "svc");
    await store.set(rule("long", 60_000));
    const long = expiries.get(store.key)!;
    await store.set(rule("short", 1_000));
    expect(expiries.get(store.key)).toBe(long);
    await store.set(rule("expired", -1));
    expect((await store.list()).map((r) => r.target)).toEqual(["long", "short"]);
  });

  it("chaos injection reads rules from the installed store and honours clear", async () => {
    vi.stubEnv("CHAOS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    setChaosStore(new RedisChaosStore(fakeRedis().client, "svc"));
    await setChaosRule({ target: "smtp.send", fault: "fail", rate: 1, delayMs: 0, ttlSec: 30 });
    await expect(injectChaos("smtp.send")).rejects.toBeInstanceOf(ChaosError);
    await expect(injectChaos("s3.put")).resolves.toBeUndefined();
    await clearChaos("smtp.send");
    await expect(injectChaos("smtp.send")).resolves.toBeUndefined();
  });

  it("chaos store reads fail fast while Redis is not ready so injection points add no latency", async () => {
    const store = new RedisChaosStore(fakeRedis().client, "svc", () => false);
    await expect(store.list()).rejects.toThrow(/not ready/);
    vi.stubEnv("CHAOS_ENABLED", "true");
    setChaosStore(store);
    const started = Date.now();
    await expect(injectChaos("smtp.send")).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(50);
  });
});

describe("chaos admin controller", () => {
  it("chaos admin endpoints are 404 unless chaos is enabled", async () => {
    vi.stubEnv("CHAOS_ENABLED", "false");
    const controller = new ChaosAdminController();
    await expect(controller.list()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(() => controller.set({ target: "x", fault: "fail", rate: 1, delayMs: 0, ttlSec: 1 })).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
    vi.stubEnv("CHAOS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    await expect(controller.clear()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("chaos admin validates rule input and maps store failures to 503", async () => {
    vi.stubEnv("CHAOS_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "test");
    const controller = new ChaosAdminController();
    expect(() => controller.set({ target: "", fault: "explode", rate: 2 })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    await expect(controller.set({ target: "demo", fault: "delay", rate: 0.5, delayMs: 100, ttlSec: 10 })).resolves.toMatchObject({ target: "demo", fault: "delay", rate: 0.5 });
    const broken = { list: async () => [], set: async () => { throw new Error("ECONNREFUSED"); }, clear: async () => undefined };
    setChaosStore(broken);
    await expect(controller.set({ target: "demo", fault: "fail", rate: 1, delayMs: 0, ttlSec: 10 })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
});
