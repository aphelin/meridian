import type { ErrorCode } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { verifyOrderAccessToken } from "../../../src/auth";
import { injectChaos } from "../../../src/core/chaos";
import { RequestContext } from "../../../src/core/context";
import { createLogger } from "../../../src/core/logger";
import { type ResilientHttpClient, ResilientHttpClientFactory } from "../../../src/http/resilient-http-client";
import { RequireCaptcha } from "../../../src/security/captcha";
import { RateLimit } from "../../../src/security/rate-limit";
import { parseWith } from "../../../src/validation";

const log = createLogger("Demo");
const MAX_SLOW_MS = 30_000;
const validateSchema = z.object({ email: z.email(), qty: z.int().min(1).max(5) });

@Controller("demo")
export class DemoController {
  private readonly upstream: ResilientHttpClient;

  constructor(clients: ResilientHttpClientFactory) {
    this.upstream = clients.create({ name: "demo-upstream", baseUrl: "", timeoutMs: 500 });
  }

  @Get("echo")
  echo() {
    const correlationId = RequestContext.correlationId();
    log.info("echo", { correlationId });
    return { correlationId };
  }

  @Get("slow")
  async slow(@Query("ms") ms?: string) {
    const wait = Math.min(Math.max(Number(ms) || 0, 0), MAX_SLOW_MS);
    await new Promise((resolve) => setTimeout(resolve, wait));
    return { done: true };
  }

  @Post("rate")
  @HttpCode(200)
  @RateLimit({ name: "demo", limit: 3, windowSec: 60, by: ["ip", "body:email"] })
  rate() {
    return { ok: true };
  }

  @Post("captcha")
  @HttpCode(200)
  @RequireCaptcha("demo")
  captcha() {
    return { ok: true };
  }

  @Get("upstream")
  upstreamCall(@Query("target") target?: string) {
    if (!target) throw new DomainError("VALIDATION_FAILED", "target is required");
    return this.upstream.get(target);
  }

  @Get("domain-error")
  domainError(@Query("code") code?: string): never {
    throw new DomainError((code ?? "INTERNAL") as ErrorCode, "demo");
  }

  @Post("validate")
  @HttpCode(200)
  validate(@Body() body: unknown) {
    parseWith(validateSchema, body);
    return { ok: true };
  }

  @Get("chaos")
  async chaos() {
    await injectChaos("demo.target");
    return { ok: true };
  }

  @Get("order-access")
  orderAccess(@Query("orderId") orderId?: string, @Query("token") token?: string) {
    return { valid: verifyOrderAccessToken(orderId ?? "", token) };
  }
}
