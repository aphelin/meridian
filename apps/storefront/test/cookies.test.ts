import { describe, expect, it } from "vitest";
import { CookieJar, headersWriter, parseCookieHeader, serializeCookie } from "@/server/cookies";

describe("cookie jar", () => {
  it("parses the cookie header and ignores malformed names", () => {
    const map = parseCookieHeader('access=abc.def; refresh="r1"; bad name=x; cart=c%2D1');
    expect(map.get("access")).toBe("abc.def");
    expect(map.get("refresh")).toBe("r1");
    expect(map.get("cart")).toBe("c-1");
    expect(map.has("bad name")).toBe(false);
  });

  it("serializes httpOnly, SameSite=Lax cookies and Secure only when asked", () => {
    const plain = serializeCookie("access", "tok", { maxAgeSec: 900 });
    expect(plain).toBe("access=tok; Path=/; Max-Age=900; HttpOnly; SameSite=Lax");
    expect(serializeCookie("access", "tok", { maxAgeSec: 900, secure: true })).toMatch(/; Secure$/);
  });

  it("rejects unsafe cookie names and values instead of escaping them", () => {
    expect(() => serializeCookie("a;b", "x", { maxAgeSec: 1 })).toThrow();
    expect(() => serializeCookie("a", "x; Domain=evil", { maxAgeSec: 1 })).toThrow();
  });

  it("reflects writes in later reads and keeps one Set-Cookie per name on the response", () => {
    const headers = new Headers();
    const jar = new CookieJar("access=old", headersWriter(headers));
    jar.set("access", "new1", { maxAgeSec: 60 });
    jar.set("access", "new2", { maxAgeSec: 60 });
    jar.delete("refresh", {});
    expect(jar.get("access")).toBe("new2");
    expect(headers.getSetCookie()).toEqual(["access=new2; Path=/; Max-Age=60; HttpOnly; SameSite=Lax"]);
    jar.delete("access", {});
    expect(jar.get("access")).toBeUndefined();
    expect(headers.getSetCookie()[0]).toMatch(/^access=; Path=\/; Max-Age=0; Expires=/);
  });
});
