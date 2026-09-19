import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { CookieJar } from "./cookies";

/** Everything the BFF knows about the browser request a procedure runs for. */
export interface RequestScope {
  correlationId: string;
  /** Browser IP to forward as `x-forwarded-for`; undefined for loopback or unknown addresses. */
  forwardedFor: string | undefined;
  cookies: CookieJar;
}

const KEY = Symbol.for("meridian.bff.scope");
type Store = { als: AsyncLocalStorage<RequestScope> };
const store: Store = ((globalThis as Record<symbol, unknown>)[KEY] as Store | undefined) ?? { als: new AsyncLocalStorage<RequestScope>() };
(globalThis as Record<symbol, unknown>)[KEY] = store;

export function runInScope<T>(scope: RequestScope, fn: () => T): T {
  return store.als.run(scope, fn);
}

export function currentScope(): RequestScope | undefined {
  return store.als.getStore();
}

/** Scope of the current procedure, or a detached one (server components, background work). */
export function scopeOrDetached(): RequestScope {
  return currentScope() ?? { correlationId: randomUUID(), forwardedFor: undefined, cookies: new CookieJar(null) };
}

const CORRELATION = /^[A-Za-z0-9._:-]{1,128}$/;

/** Keeps a well-formed incoming correlation id; anything missing or suspicious is replaced by a new UUID. */
export function resolveCorrelationId(incoming: string | null | undefined): string {
  const value = incoming?.trim();
  return value && CORRELATION.test(value) ? value : randomUUID();
}

/** Canonical IP: IPv4-mapped IPv6 unwrapped, brackets, zone ids and ports removed. Undefined when not an IP. */
export function normalizeIp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let ip = value.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.replace(/%.*$/, "");
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip.toLowerCase() : undefined;
}

export function isLoopback(ip: string | undefined): boolean {
  return ip === "::1" || (ip !== undefined && /^127\./.test(ip));
}

/**
 * The browser address to forward to services. `x-forwarded-for` is read from the right: the last hop was written by
 * the component closest to this server (Next itself, or the reverse proxy in front of it). `TRUSTED_PROXY_HOPS`
 * skips that many additional proxies. Loopback addresses are never forwarded (local development), so services key
 * their rate limits by the remaining dimensions.
 */
export function forwardableClientIp(forwardedFor: string | null | undefined, env: Record<string, string | undefined> = process.env): string | undefined {
  if (!forwardedFor) return undefined;
  const hops = forwardedFor.split(",").map((h) => h.trim()).filter(Boolean);
  const skip = Math.max(0, Math.min(10, Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "0", 10) || 0));
  const ip = normalizeIp(hops[hops.length - 1 - skip]);
  return ip && !isLoopback(ip) ? ip : undefined;
}
