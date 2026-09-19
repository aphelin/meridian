import { Injectable, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { registerHealthCheck } from "../core/health";
import { onShutdown } from "../core/lifecycle";
import { createLogger } from "../core/logger";

const COMMAND_TIMEOUT_MS = 1000;
const CONNECT_TIMEOUT_MS = 2000;
const ERROR_LOG_INTERVAL_MS = 10_000;
const log = createLogger("Redis");

/**
 * The process-wide Redis connection. `REDIS_KEY_PREFIX` is applied by ioredis to every key (including Lua script keys),
 * so leaf tests and replicas of different environments never share keys by accident. Commands fail after 1 s instead
 * of queueing forever while Redis is down, which lets callers apply their own fail-open/closed policy.
 */
@Injectable()
export class RedisService implements OnModuleInit {
  readonly client: Redis;
  readonly keyPrefix: string;
  private lastErrorLogAt = 0;

  constructor() {
    this.keyPrefix = process.env.REDIS_KEY_PREFIX ?? "";
    this.client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      keyPrefix: this.keyPrefix || undefined,
      commandTimeout: COMMAND_TIMEOUT_MS,
      connectTimeout: CONNECT_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    this.client.on("error", (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
      this.lastErrorLogAt = now;
      log.warn("redis connection error", { error: error.message, status: this.client.status });
    });
    this.client.on("ready", () => log.info("redis ready"));
  }

  /** True when commands can be sent right now; callers use it to fail fast instead of waiting for a command timeout. */
  isReady(): boolean {
    return this.client.status === "ready";
  }

  onModuleInit() {
    registerHealthCheck("redis", async () => {
      if (!this.isReady()) throw new Error(`redis is ${this.client.status}`);
      await this.client.ping();
    });
    onShutdown("redis", "resources", () => this.close());
    // Startup does not wait for Redis: readiness reports it and callers degrade per their fail mode.
    this.client.connect().catch((error: Error) => log.warn("redis initial connection failed; retrying in background", { error: error.message }));
  }

  async close(): Promise<void> {
    if (this.client.status === "end") return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
