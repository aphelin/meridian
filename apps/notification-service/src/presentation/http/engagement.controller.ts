import { RateLimit, RequestContext, RequireCaptcha, ZodBody } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { z } from "zod";
import {
  ConfirmNewsletterCommand,
  CreateStockAlertCommand,
  SubmitContactMessageCommand,
  SubscribeNewsletterCommand,
  UnsubscribeNewsletterCommand,
  type NewsletterStatusResult,
} from "../../application/commands";
import { CaptchaActions, RateLimits } from "./policies";
import { contactSchema, stockAlertSchema, subscribeSchema, tokenSchema } from "./schemas";

/**
 * Public, email-sending forms. Guards run bottom-up: the Redis rate limit is checked before the Turnstile call, so a
 * flood is rejected without hammering the captcha provider (and its breaker). Responses never reveal whether an
 * address is known.
 */
@Controller()
export class EngagementController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("newsletter/subscriptions")
  @HttpCode(202)
  @RequireCaptcha(CaptchaActions.newsletter)
  @RateLimit(RateLimits.newsletter)
  async subscribe(@ZodBody(subscribeSchema) body: z.output<typeof subscribeSchema>): Promise<{ status: "pending" }> {
    await this.commandBus.execute(new SubscribeNewsletterCommand(body.email));
    return { status: "pending" };
  }

  @Post("newsletter/confirm")
  @HttpCode(200)
  confirm(@ZodBody(tokenSchema) body: z.output<typeof tokenSchema>): Promise<NewsletterStatusResult> {
    return this.commandBus.execute(new ConfirmNewsletterCommand(body.token));
  }

  @Post("newsletter/unsubscribe")
  @HttpCode(200)
  unsubscribe(@ZodBody(tokenSchema) body: z.output<typeof tokenSchema>): Promise<NewsletterStatusResult> {
    return this.commandBus.execute(new UnsubscribeNewsletterCommand(body.token));
  }

  @Post("contact")
  @HttpCode(202)
  @RequireCaptcha(CaptchaActions.contact)
  @RateLimit(RateLimits.contact)
  async contact(@ZodBody(contactSchema) body: z.output<typeof contactSchema>): Promise<{ status: "received" }> {
    await this.commandBus.execute(new SubmitContactMessageCommand({ ...body, orderNumber: body.orderNumber ?? null }, RequestContext.correlationId() ?? "unknown"));
    return { status: "received" };
  }

  @Post("stock-alerts")
  @HttpCode(202)
  @RequireCaptcha(CaptchaActions.stockAlert)
  @RateLimit(RateLimits.stockAlert)
  async stockAlert(@ZodBody(stockAlertSchema) body: z.output<typeof stockAlertSchema>): Promise<{ status: "pending" }> {
    await this.commandBus.execute(new CreateStockAlertCommand(body.email, body.sku, body.slug));
    return { status: "pending" };
  }
}
