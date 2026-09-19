import { counter, createLogger, RedisService } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { CatalogCache } from "../../application/ports/catalog-cache";

const log = createLogger("CatalogCache");
const GENERATION_KEY = "catalog:cache:generation";
const lookups = () => counter("catalog_cache_lookups_total", "Catalog cache lookups", ["key", "result"]);

/**
 * Cache-aside in Redis shared by every replica. Entries live under the current generation number; invalidation
 * increments the generation, so a reader that loaded from the database before a write committed can only store its
 * stale value under an old generation that nobody reads again. Redis problems degrade to database reads.
 */
@Injectable()
export class RedisCatalogCache extends CatalogCache {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async readThrough<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
    if (!this.redis.isReady()) {
      lookups().inc({ key, result: "unavailable" });
      return load();
    }
    let entryKey: string;
    try {
      const generation = (await this.redis.client.get(GENERATION_KEY)) ?? "0";
      entryKey = `catalog:cache:${generation}:${key}`;
      const hit = await this.redis.client.get(entryKey);
      if (hit !== null) {
        lookups().inc({ key, result: "hit" });
        return JSON.parse(hit) as T;
      }
    } catch (error) {
      lookups().inc({ key, result: "error" });
      log.warn("catalog cache read failed; loading from the database", { key, error });
      return load();
    }
    lookups().inc({ key, result: "miss" });
    const value = await load();
    try {
      await this.redis.client.set(entryKey, JSON.stringify(value), "EX", ttlSec);
    } catch (error) {
      log.warn("catalog cache write failed", { key, error });
    }
    return value;
  }

  async invalidate(): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.redis.client.incr(GENERATION_KEY);
        return;
      } catch (error) {
        if (attempt === 2) log.warn("catalog cache invalidation failed; entries expire within their TTL", { error });
      }
    }
  }
}
