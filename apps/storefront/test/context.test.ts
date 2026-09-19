import { describe, expect, it } from "vitest";
import { forwardableClientIp, normalizeIp, resolveCorrelationId } from "@/server/context";

describe("correlation id", () => {
  it("keeps a well-formed incoming correlation id", () => {
    expect(resolveCorrelationId("sf-probe-abc123")).toBe("sf-probe-abc123");
  });

  it("creates a UUID correlation id when missing or malformed", () => {
    expect(resolveCorrelationId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId("bad id\r\nx-injected: 1")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveCorrelationId("x".repeat(200))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("client ip forwarding", () => {
  it("never forwards loopback browser addresses (local development)", () => {
    expect(forwardableClientIp("127.0.0.1")).toBeUndefined();
    expect(forwardableClientIp("::1")).toBeUndefined();
    expect(forwardableClientIp("::ffff:127.0.0.1")).toBeUndefined();
  });

  it("forwards a public browser address, taking the hop written by the nearest proxy", () => {
    expect(forwardableClientIp("203.0.113.9")).toBe("203.0.113.9");
    expect(forwardableClientIp("6.6.6.6, 198.51.100.7")).toBe("198.51.100.7");
    expect(forwardableClientIp("6.6.6.6, 198.51.100.7, 10.0.0.2", { TRUSTED_PROXY_HOPS: "1" })).toBe("198.51.100.7");
  });

  it("ignores values that are not IP addresses", () => {
    expect(forwardableClientIp("evil.example")).toBeUndefined();
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("192.0.2.1:8080")).toBe("192.0.2.1");
  });
});
