import type { PaymentIntentDto } from "@meridian/contracts";
import { ServiceOnly, ZodBody } from "@meridian/nest-kit";
import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { CreatePaymentIntentCommand } from "../../application/commands";
import { createIntentSchema } from "./schemas";

/** Checkout creates the payment intent while placing an order (service JWT required). */
@Controller("intents")
@ServiceOnly()
export class IntentsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(201)
  create(@ZodBody(createIntentSchema) body: z.output<typeof createIntentSchema>): Promise<PaymentIntentDto> {
    return this.commandBus.execute(new CreatePaymentIntentCommand(body));
  }
}
