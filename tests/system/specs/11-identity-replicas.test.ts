import net from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tokens } from "../support/auth";
import { CAPTCHA_TOKEN } from "../support/env";
import { client, identity } from "../support/http";
import { mailsTo } from "../support/mailhog";
import { type Replica, startReplica, stopAllReplicas } from "../support/replica";
import { registerUser, uid, uniqueEmail } from "../support/shop";
import { holdsFor } from "../support/wait";

/** TCP server that accepts connections and never answers (an unreachable Turnstile). */
async function blackhole(): Promise<{ url: string; close(): Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    s.on("error", () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/turnstile/v0/siteverify`,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}

describe("identity replicas: shared rate limit and fail-closed captcha", () => {
  let replica: Replica;
  let hole: Awaited<ReturnType<typeof blackhole>>;

  beforeAll(async () => {
    hole = await blackhole();
    // a second identity-service replica on the stack database, Redis prefix and namespace; its Turnstile verifier never answers
    replica = await startReplica("identity-service", { extraEnv: { TURNSTILE_VERIFY_URL: hole.url } });
  });
  afterAll(async () => {
    try {
      if (replica) {
        const exit = await replica.stop("SIGTERM", 30_000);
        expect(exit.code).toBe(0);
      }
      await stopAllReplicas();
    } finally {
      await hole?.close();
    }
  });

  test("Redis rate limit on login (10 per 60 s per email) is shared by two identity replicas", async () => {
    const user = await registerUser("ratelimit", { verify: false });
    const stack = identity();
    const second = client(replica.url);
    const statuses: number[] = [];
    // ten logins alternate between the stack instance and the replica; all are within the limit
    for (let i = 0; i < 10; i++) {
      const target = i % 2 === 0 ? stack : second;
      const r = await target.post("/auth/login", { email: user.email, password: user.password });
      statuses.push(r.status);
      expect(r.headers.get("ratelimit-limit")).toBe("10");
      expect(Number(r.headers.get("ratelimit-remaining"))).toBe(9 - i);
    }
    expect(statuses.every((s) => s === 200 || s === 201), `logins within the limit: ${statuses}`).toBe(true);

    // the 11th attempt is refused by either replica, even with the right password
    for (const target of [stack, second]) {
      const limited = await target.post("/auth/login", { email: user.email, password: user.password });
      expect(limited.status, limited.text).toBe(429);
      expect(limited.json.code).toBe("RATE_LIMITED");
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(limited.json.correlationId).toBe(limited.correlationId);
    }

    // the key is per email: another account on the same client is unaffected
    const other = await second.post("/auth/login", { email: uniqueEmail("nobody"), password: `wrong-${uid()}` });
    expect(other.status).toBe(401);
  });

  test("captcha fail-closed: with an unreachable Turnstile verifier the replica answers 503 CAPTCHA_UNAVAILABLE within the timeout and creates nothing", async () => {
    const email = uniqueEmail("captcha");
    const second = client(replica.url);
    const body = { email, password: `pw-${uid(8)}`, name: "Captcha Down" };

    const missing = await second.post("/auth/register", body);
    expect(missing.status, missing.text).toBe(400);
    expect(missing.json.code).toBe("CAPTCHA_REQUIRED");

    const down = await second.post("/auth/register", body, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, timeoutMs: 15_000 });
    expect(down.status, down.text).toBe(503);
    expect(down.json.code).toBe("CAPTCHA_UNAVAILABLE");
    expect(down.json.correlationId).toBe(down.correlationId);
    expect(down.ms).toBeLessThan(6000);

    const forgot = await second.post("/auth/forgot-password", { email }, { headers: { "x-captcha-token": CAPTCHA_TOKEN }, timeoutMs: 15_000 });
    expect(forgot.status, forgot.text).toBe(503);
    expect(forgot.json.code).toBe("CAPTCHA_UNAVAILABLE");

    const breakers = await second.get("/admin/breakers", { token: tokens.admin() });
    const captcha = (breakers.json as { name: string; failures: number; timeouts: number; rejects: number }[]).find((b) => b.name === "captcha");
    expect(captcha && captcha.failures + captcha.timeouts + captcha.rejects).toBeGreaterThanOrEqual(2);

    // nothing was created: the account does not exist and no verification email is queued
    const login = await identity().post("/auth/login", { email, password: body.password });
    expect(login.status).toBe(401);
    await holdsFor(async () => (await mailsTo(email)).length === 0, "no email to the rejected address", { windowMs: 2000 });

    // the same request passes on the stack instance, whose verifier is reachable (the input itself was valid)
    const ok = await identity().post("/auth/register", body, { headers: { "x-captcha-token": CAPTCHA_TOKEN } });
    expect(ok.status, ok.text).toBe(201);
  });
});
