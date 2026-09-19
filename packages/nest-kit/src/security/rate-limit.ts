import { DomainError } from "@meridian/kernel";
import { applyDecorators, CanActivate, ExecutionContext, Injectable, Optional, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { verifyBearer } from "../auth";
import { createLogger } from "../core/logger";
import { counter } from "../core/metrics";
import { UpstreamUnavailableError } from "../http/errors";
import { RedisService } from "../runtime/redis.service";
import { clientIp, type IpRequest, isLoopbackIp, normalizeIp } from "./client-ip";

export type RateLimitDimension = "ip" | "user" | `body:${string}` | `header:${string}`;

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSec: number;
  /** Every listed dimension is counted separately; the request is rejected when any of them is over the limit. */
  by: RateLimitDimension[];
  /** Behaviour when Redis is unavailable. Default "open" (allow, warn, count a metric). */
  failMode?: "open" | "closed";
}

/** Dimension values for one request; missing or empty values are not counted. */
export type RateLimitValues = Partial<Record<RateLimitDimension, string | number | null | undefined>>;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  /** Requests left in the tightest counted dimension after this one. */
  remaining: number;
  /** Seconds until the tightest counted dimension regains capacity. */
  resetSec: number;
  /** Seconds the caller should wait before retrying; 0 when allowed. */
  retryAfterSec: number;
  /** Redis keys (without REDIS_KEY_PREFIX) that were counted. Empty when no dimension applied. */
  keys: string[];
  /** True when Redis was unavailable and the fail-open policy let the request through uncounted. */
  degraded: boolean;
}

export class RateLimitedError extends DomainError {
  constructor(
    readonly policy: string,
    readonly retryAfterSec: number,
  ) {
    super("RATE_LIMITED", `Too many requests. Please try again in ${retryAfterSec} second${retryAfterSec === 1 ? "" : "s"}.`, { retryAfterSec });
    this.name = "RateLimitedError";
  }
}

const RATE_LIMIT_POLICY = "meridian:rate-limit-policy";
const MAX_KEY_VALUE_LENGTH = 128;
const COMMAND = "meridianSlidingWindow";
const log = createLogger("RateLimit");
const rejections = () => counter("rate_limit_rejections_total", "Requests rejected by a rate limit policy", ["policy"]);
const storeErrors = () => counter("rate_limit_store_errors_total", "Rate limit checks that could not reach Redis", ["policy", "fail_mode"]);

/**
 * Sliding-window log over one sorted set per key, evaluated atomically for all keys so concurrent replicas cannot
 * overshoot. Time comes from the Redis server so replica clock skew does not matter. A rejected request is not
 * recorded, so a client that backs off regains capacity as its earlier requests age out.
 * Returns {allowed, remaining, resetMs} or {0, 0, retryAfterMs}.
 */
export const SLIDING_WINDOW_LUA = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local blocked = false
local retryAfter = 0
for _, key in ipairs(KEYS) do
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local count = redis.call('ZCARD', key)
  if count >= limit then
    blocked = true
    local freeing = redis.call('ZRANGE', key, count - limit, count - limit, 'WITHSCORES')
    local wait = tonumber(freeing[2]) + window - now
    if wait > retryAfter then retryAfter = wait end
  end
end
if blocked then
  return {0, 0, retryAfter}
end
local remaining = limit
local reset = 0
for _, key in ipairs(KEYS) do
  redis.call('ZADD', key, now, now .. '-' .. member)
  redis.call('PEXPIRE', key, window)
  local left = limit - redis.call('ZCARD', key)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local frees = tonumber(oldest[2]) + window - now
  if left < remaining or (left == remaining and frees > reset) then
    remaining = left
    reset = frees
  end
end
return {1, remaining, reset}
`;

type SlidingWindowCommand = (numKeys: number, ...args: (string | number)[]) => Promise<[number, number, number]>;

function loopbackCounted(env: NodeJS.ProcessEnv = process.env) {
  return env.RATE_LIMIT_LOOPBACK === "true";
}

function keyValue(value: string): string {
  return value.length > MAX_KEY_VALUE_LENGTH ? `sha256:${createHash("sha256").update(value).digest("hex")}` : value;
}

/**
 * Redis keys `rl:<policy>:<dimension>:<value>` for the dimensions that apply. Loopback IPs are not counted (the BFF
 * calls from 127.0.0.1 for every shopper) unless RATE_LIMIT_LOOPBACK=true.
 */
export function rateLimitKeys(policy: RateLimitPolicy, values: RateLimitValues, env: NodeJS.ProcessEnv = process.env): string[] {
  const keys: string[] = [];
  for (const dimension of policy.by) {
    const rawValue = values[dimension];
    if (rawValue === undefined || rawValue === null) continue;
    let value = String(rawValue).trim();
    if (!value) continue;
    if (dimension === "ip") {
      const ip = normalizeIp(value);
      if (!ip || (isLoopbackIp(ip) && !loopbackCounted(env))) continue;
      value = ip;
    } else if (dimension !== "user") {
      value = value.toLowerCase();
    }
    keys.push(`rl:${policy.name}:${dimension}:${keyValue(value)}`);
  }
  return [...new Set(keys)];
}

function assertPolicy(policy: RateLimitPolicy) {
  const valid =
    /^[a-z0-9][a-z0-9-]*$/i.test(policy.name) &&
    Number.isInteger(policy.limit) &&
    policy.limit >= 1 &&
    Number.isInteger(policy.windowSec) &&
    policy.windowSec >= 1 &&
    policy.by.length > 0 &&
    policy.by.every((d) => d === "ip" || d === "user" || /^(body|header):.+$/.test(d));
  if (!valid) throw new Error(`Invalid rate limit policy: ${JSON.stringify(policy)}`);
}

@Injectable()
export class RateLimiter {
  constructor(private readonly redis: RedisService) {}

  /** Counts one request against `policy` for the given dimension values. Throws only under failMode "closed" when Redis is down. */
  async consume(policy: RateLimitPolicy, values: RateLimitValues): Promise<RateLimitDecision> {
    assertPolicy(policy);
    const keys = rateLimitKeys(policy, values);
    const base = { limit: policy.limit, keys };
    if (!keys.length) {
      log.debug("rate limit skipped: no countable dimension", { policy: policy.name, by: policy.by });
      return { ...base, allowed: true, remaining: policy.limit, resetSec: 0, retryAfterSec: 0, degraded: false };
    }
    let result: [number, number, number];
    try {
      if (!this.redis.isReady()) throw new Error(`redis is ${this.redis.client.status}`);
      result = await this.command()(keys.length, ...keys, policy.limit, policy.windowSec * 1000, randomBytes(6).toString("hex"));
    } catch (error) {
      const failMode = policy.failMode ?? "open";
      storeErrors().inc({ policy: policy.name, fail_mode: failMode });
      log.warn("rate limit store unavailable", { policy: policy.name, failMode, error: error instanceof Error ? error.message : String(error) });
      if (failMode === "closed") throw new UpstreamUnavailableError("redis", "network", { cause: error });
      return { ...base, keys: [], allowed: true, remaining: policy.limit, resetSec: 0, retryAfterSec: 0, degraded: true };
    }
    const [allowed, remaining, ms] = result.map(Number);
    if (allowed === 1) {
      return { ...base, allowed: true, remaining: Math.max(0, remaining), resetSec: Math.ceil(ms / 1000), retryAfterSec: 0, degraded: false };
    }
    rejections().inc({ policy: policy.name });
    const retryAfterSec = Math.max(1, Math.ceil(ms / 1000));
    return { ...base, allowed: false, remaining: 0, resetSec: retryAfterSec, retryAfterSec, degraded: false };
  }

  private command(): SlidingWindowCommand {
    const client = this.redis.client as unknown as Record<string, SlidingWindowCommand> & { defineCommand(name: string, def: { lua: string }): void };
    // defineCommand gives EVALSHA with automatic EVAL fallback and applies the key prefix to KEYS.
    if (typeof client[COMMAND] !== "function") client.defineCommand(COMMAND, { lua: SLIDING_WINDOW_LUA });
    return client[COMMAND].bind(client);
  }
}

type RateLimitedRequest = IpRequest & { body?: unknown; principal?: { sub: string } | null };
type HeaderResponse = { setHeader(name: string, value: string | number): unknown };

/** Applies a Redis-backed rate limit policy to a route or controller. */
export function RateLimit(policy: RateLimitPolicy) {
  assertPolicy(policy);
  return applyDecorators(SetMetadata(RATE_LIMIT_POLICY, policy), UseGuards(RateLimitGuard));
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    @Optional() private readonly jwt?: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_POLICY, [ctx.getHandler(), ctx.getClass()]);
    if (!policy) return true;
    const http = ctx.switchToHttp();
    const req = http.getRequest<RateLimitedRequest>();
    const res = http.getResponse<HeaderResponse>();
    const decision = await this.limiter.consume(policy, await this.values(policy, req));
    if (decision.keys.length) {
      res.setHeader("RateLimit-Limit", decision.limit);
      res.setHeader("RateLimit-Remaining", decision.remaining);
      res.setHeader("RateLimit-Reset", decision.resetSec);
    }
    if (decision.allowed) return true;
    res.setHeader("Retry-After", decision.retryAfterSec);
    throw new RateLimitedError(policy.name, decision.retryAfterSec);
  }

  private async values(policy: RateLimitPolicy, req: RateLimitedRequest): Promise<RateLimitValues> {
    const values: RateLimitValues = {};
    const body = req.body !== null && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    for (const dimension of policy.by) {
      if (dimension === "ip") values.ip = clientIp(req);
      else if (dimension === "user") values.user = await this.userId(req);
      else if (dimension.startsWith("body:")) {
        const value = body[dimension.slice(5)];
        if (typeof value === "string" || typeof value === "number") values[dimension] = value;
      } else {
        const header = req.headers[dimension.slice(7).toLowerCase()];
        values[dimension] = Array.isArray(header) ? header[0] : header;
      }
    }
    return values;
  }

  /** Guards run in decorator order, so the auth guard may not have run yet; verify the bearer token here if needed. */
  private async userId(req: RateLimitedRequest): Promise<string | undefined> {
    if (req.principal) return req.principal.sub;
    if (!this.jwt) return undefined;
    try {
      return (await verifyBearer(this.jwt, req.headers.authorization))?.sub;
    } catch {
      return undefined;
    }
  }
}
