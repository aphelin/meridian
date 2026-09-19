import type { PaymentSummaryDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { RateLimit, Roles, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { CompleteSandboxPaymentCommand, type SandboxCompletionResult } from "../../application/commands";
import { GetPaymentByOrderQuery } from "../../application/queries";
import { orderIdParam, sandboxCompleteSchema, transactionIdParam } from "./schemas";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** Local sandbox checkout "pay" button; authorised by the intent's client secret, not by a JWT. */
  @Post(":transactionId/sandbox-complete")
  @HttpCode(202)
  @RateLimit({ name: "sandbox-pay", limit: 20, windowSec: 60, by: ["ip"] })
  complete(
    @Param("transactionId") transactionId: string,
    @ZodBody(sandboxCompleteSchema) body: z.output<typeof sandboxCompleteSchema>,
  ): Promise<SandboxCompletionResult> {
    if (!transactionIdParam.safeParse(transactionId).success) throw new NotFoundError("Unknown transaction.");
    return this.commandBus.execute(new CompleteSandboxPaymentCommand(transactionId, body.clientSecret));
  }

  @Get("by-order/:orderId")
  @Roles("service", "admin")
  byOrder(@Param("orderId") orderId: string): Promise<PaymentSummaryDto> {
    if (!orderIdParam.safeParse(orderId).success) throw new NotFoundError("No payment exists for this order.");
    return this.queryBus.execute(new GetPaymentByOrderQuery(orderId));
  }
}
