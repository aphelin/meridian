import type { AuthResultDto } from "@meridian/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/server/breaker";
import { CookieJar } from "@/server/cookies";
import { ServiceError } from "@/server/errors";
import { orderAccessCookieName, orderAccessFor, rememberOrderAccess, resetRotations, rotateSession, withSession } from "@/server/session";

const user = { id: "u1", email: "a@b.test", name: "A", role: "customer" as const, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" };
const pair = (n: number): AuthResultDto => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, user });

beforeEach(() => {
  resetRotations();
  resetBreakers();
});
afterEach(() => resetRotations());

describe("refresh rotation", () => {
  it("rotation stores the new access and refresh cookies", async () => {
    const jar = new CookieJar("refresh=refresh-0");
    const result = await rotateSession(jar, async () => pair(1));
    expect(result?.accessToken).toBe("access-1");
    expect(jar.get("access")).toBe("access-1");
    expect(jar.get("refresh")).toBe("refresh-1");
    expect(jar.setCookieHeaders().join("\n")).toMatch(/access=access-1; Path=\/; Max-Age=900; HttpOnly; SameSite=Lax/);
    expect(jar.setCookieHeaders().join("\n")).toMatch(/refresh=refresh-1; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax/);
  });

  it("single-flight: concurrent refresh with the same refresh token calls identity once and shares the new pair", async () => {
    let calls = 0;
    const refresh = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return pair(calls);
    });
    const jars = [new CookieJar("refresh=refresh-0"), new CookieJar("refresh=refresh-0"), new CookieJar("refresh=refresh-0")];
    const results = await Promise.all(jars.map((jar) => rotateSession(jar, refresh)));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r?.refreshToken)).toEqual(["refresh-1", "refresh-1", "refresh-1"]);
    // A request that arrives just after the rotation, still holding the consumed token, gets the same pair.
    const late = new CookieJar("refresh=refresh-0");
    expect((await rotateSession(late, refresh))?.accessToken).toBe("access-1");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a rejected refresh token clears the session cookies", async () => {
    const jar = new CookieJar("access=a; refresh=stolen");
    const result = await rotateSession(jar, async () => {
      throw new ServiceError({ code: "UNAUTHORIZED", message: "reused" });
    });
    expect(result).toBeNull();
    expect(jar.get("access")).toBeUndefined();
    expect(jar.get("refresh")).toBeUndefined();
  });

  it("an unavailable identity service keeps the session cookies and retries on the next request", async () => {
    const jar = new CookieJar("refresh=r0");
    const down = vi.fn(async () => {
      throw ServiceError.unavailable("identity", "timeout");
    });
    await expect(rotateSession(jar, down)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(jar.get("refresh")).toBe("r0");
    await expect(rotateSession(jar, down)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(down).toHaveBeenCalledTimes(2);
  });
});

describe("withSession", () => {
  it("fails with UNAUTHORIZED for required calls without a session", async () => {
    await expect(withSession(async () => "x", { required: true, jar: new CookieJar(null) })).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("runs optional calls anonymously without a session", async () => {
    const call = vi.fn(async (token: string | undefined) => token ?? "anon");
    await expect(withSession(call, { jar: new CookieJar(null) })).resolves.toBe("anon");
  });

  it("passes the access cookie as the token", async () => {
    await expect(withSession(async (token) => token, { jar: new CookieJar("access=tok") })).resolves.toBe("tok");
  });
});

describe("order access cookies", () => {
  it("stores the guest order access token in an httpOnly oa_<orderId> cookie", () => {
    const jar = new CookieJar(null);
    rememberOrderAccess(jar, "0b8f7a2e-1111-4a6b-9c1d-2e3f4a5b6c7d", "AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(jar.setCookieHeaders()[0]).toMatch(/^oa_0b8f7a2e-1111-4a6b-9c1d-2e3f4a5b6c7d=AbCdEfGhIjKlMnOpQrStUvWxYz012345; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
  });

  it("prefers an explicit order access token over the remembered one and rejects malformed tokens", () => {
    const jar = new CookieJar("oa_order-1=StoredTokenStoredToken12");
    expect(orderAccessFor(jar, "order-1")).toBe("StoredTokenStoredToken12");
    expect(orderAccessFor(jar, "order-1", "ExplicitTokenExplicit123")).toBe("ExplicitTokenExplicit123");
    expect(orderAccessFor(jar, "order-1", "bad token;")).toBe("StoredTokenStoredToken12");
  });

  it("refuses order ids that would make unsafe cookie names", () => {
    expect(() => orderAccessCookieName("../x;y")).toThrow(ServiceError);
  });
});
