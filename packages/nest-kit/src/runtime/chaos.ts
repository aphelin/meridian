import type { ChaosRuleDto, ChaosRuleInput } from "@meridian/contracts";
import { DomainError, NotFoundError } from "@meridian/kernel";
import { Body, Controller, Delete, Get, HttpCode, Put, Query } from "@nestjs/common";
import type Redis from "ioredis";
import { z } from "zod";
import { AdminOnly } from "../auth";
import { type ChaosStore, chaosEnabled, chaosStore, clearChaos, setChaosRule } from "../core/chaos";
import { UpstreamUnavailableError } from "../http/errors";
import { parseWith } from "../validation";

/** The ioredis calls the chaos store needs (a narrow type keeps it testable without a server). */
export type ChaosRedis = Pick<Redis, "hgetall" | "hdel" | "del" | "multi">;

/**
 * Chaos rules in one Redis hash per service (`chaos:<service>:rules`, field = target), so every replica of the service
 * sees the same rules. Expiry is per rule (`expiresAt`); the hash itself expires with its longest-lived rule.
 */
export class RedisChaosStore implements ChaosStore {
  readonly key: string;

  constructor(
    private readonly redis: ChaosRedis,
    service: string,
    /** Lets reads fail immediately while Redis is down instead of adding a command timeout to every injection point. */
    private readonly isReady: () => boolean = () => true,
  ) {
    this.key = `chaos:${service}:rules`;
  }

  async list(): Promise<ChaosRuleDto[]> {
    if (!this.isReady()) throw new Error("redis is not ready");
    const raw = await this.redis.hgetall(this.key);
    const now = Date.now();
    const active: ChaosRuleDto[] = [];
    const expired: string[] = [];
    for (const [target, json] of Object.entries(raw)) {
      const rule = parseRule(json);
      if (rule && Date.parse(rule.expiresAt) > now) active.push(rule);
      else expired.push(target);
    }
    if (expired.length) await this.redis.hdel(this.key, ...expired).catch(() => undefined);
    return active.sort((a, b) => a.target.localeCompare(b.target));
  }

  async set(rule: ChaosRuleDto): Promise<void> {
    const expiresAt = Date.parse(rule.expiresAt);
    // NX then GT: give the hash an expiry if it has none, otherwise only ever extend it, atomically across replicas.
    const results = await this.redis
      .multi()
      .hset(this.key, rule.target, JSON.stringify(rule))
      .pexpireat(this.key, expiresAt, "NX")
      .pexpireat(this.key, expiresAt, "GT")
      .exec();
    const failed = results?.find(([error]) => error);
    if (!results || failed) throw failed?.[0] ?? new Error("chaos rule transaction aborted");
  }

  async clear(target?: string): Promise<void> {
    if (target) await this.redis.hdel(this.key, target);
    else await this.redis.del(this.key);
  }
}

function parseRule(json: string): ChaosRuleDto | null {
  try {
    const rule = JSON.parse(json) as ChaosRuleDto;
    return typeof rule?.target === "string" && typeof rule.expiresAt === "string" ? rule : null;
  } catch {
    return null;
  }
}

const chaosRuleInput = z.object({
  target: z.string().trim().min(1).max(200),
  fault: z.enum(["fail", "delay", "timeout"]),
  rate: z.number().min(0).max(1),
  delayMs: z.int().min(0).max(120_000),
  ttlSec: z.int().min(1).max(86_400),
}) satisfies z.ZodType<ChaosRuleInput>;

async function viaStore<T>(work: () => Promise<T>): Promise<T> {
  if (!chaosEnabled()) throw new NotFoundError("Not found");
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new UpstreamUnavailableError("redis", "network", { cause: error });
  }
}

/** Dev-only fault injection controls. 404 unless CHAOS_ENABLED=true outside production. */
@Controller("admin/chaos")
@AdminOnly()
export class ChaosAdminController {
  @Get()
  list(): Promise<ChaosRuleDto[]> {
    return viaStore(() => chaosStore().list());
  }

  @Put()
  set(@Body() body: unknown): Promise<ChaosRuleDto> {
    if (!chaosEnabled()) throw new NotFoundError("Not found");
    const input = parseWith(chaosRuleInput, body);
    return viaStore(() => setChaosRule(input));
  }

  @Delete()
  @HttpCode(204)
  async clear(@Query("target") target?: string): Promise<void> {
    await viaStore(() => clearChaos(target?.trim() || undefined));
  }
}
