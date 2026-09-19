import { Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { HandlePaddleWebhookCommand, type WebhookResult } from "../../application/commands";

/** Paddle notifications; authenticated by the Paddle-Signature HMAC over the raw body. */
@Controller("webhooks")
export class PaddleWebhookController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post("paddle")
  @HttpCode(200)
  receive(@Req() req: { rawBody?: Buffer }, @Headers("paddle-signature") signature: string | undefined): Promise<WebhookResult> {
    return this.commandBus.execute(new HandlePaddleWebhookCommand(Buffer.isBuffer(req.rawBody) ? req.rawBody : undefined, signature));
  }
}
