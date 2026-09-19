import type { BreakerStatusDto } from "@meridian/contracts";
import { Controller, type DynamicModule, Get, Global, Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminOnly, jwtModule } from "../auth";
import { setChaosStore } from "../core/chaos";
import { BreakerRegistry } from "../http/breaker";
import { ResilientHttpClientFactory } from "../http/resilient-http-client";
import { CaptchaGuard, TurnstileVerifier } from "../security/captcha";
import { RateLimiter, RateLimitGuard } from "../security/rate-limit";
import { ChaosAdminController, RedisChaosStore } from "./chaos";
import { RedisService } from "./redis.service";

export interface KitModuleOptions {
  /** Service name; scopes shared state such as chaos rules (`chaos:<service>:*`). */
  service: string;
}

export const KIT_OPTIONS = Symbol("KIT_OPTIONS");

@Controller("admin/breakers")
@AdminOnly()
export class BreakersAdminController {
  @Get()
  list(): BreakerStatusDto[] {
    return BreakerRegistry.snapshot();
  }
}

/** Points core chaos injection at Redis so rules set on any replica apply to all replicas of the service. */
@Injectable()
class ChaosStoreInstaller implements OnModuleInit {
  constructor(
    private readonly redis: RedisService,
    @Inject(KIT_OPTIONS) private readonly options: KitModuleOptions,
  ) {}

  onModuleInit() {
    setChaosStore(new RedisChaosStore(this.redis.client, this.options.service, () => this.redis.isReady()));
  }
}

/**
 * Platform runtime for a service: Redis, Redis-backed rate limiting and chaos rules, Turnstile captcha, resilient HTTP
 * clients, and the admin endpoints for chaos and circuit breakers. Global, so guards resolve their dependencies anywhere.
 */
@Global()
@Module({})
export class KitModule {
  static forRoot(options: KitModuleOptions): DynamicModule {
    return {
      module: KitModule,
      imports: [jwtModule()],
      controllers: [ChaosAdminController, BreakersAdminController],
      providers: [
        { provide: KIT_OPTIONS, useValue: options },
        RedisService,
        ChaosStoreInstaller,
        RateLimiter,
        RateLimitGuard,
        TurnstileVerifier,
        CaptchaGuard,
        ResilientHttpClientFactory,
      ],
      exports: [JwtModule, KIT_OPTIONS, RedisService, RateLimiter, RateLimitGuard, TurnstileVerifier, CaptchaGuard, ResilientHttpClientFactory],
    };
  }
}
