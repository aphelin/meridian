import { Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { HandleStripeWebhookCommand, type WebhookResult } from "../../application/commands";

/** Stripe events (test mode); authenticated by the Stripe-Signature header over the raw body. */
@Controller("webhooks")
export class StripeWebhookController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("stripe")
  @HttpCode(200)
  receive(@Req() req: { rawBody?: Buffer }, @Headers("stripe-signature") signature: string | undefined): Promise<WebhookResult> {
    return this.commandBus.execute(new HandleStripeWebhookCommand(Buffer.isBuffer(req.rawBody) ? req.rawBody : undefined, signature));
  }
}
