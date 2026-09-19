import type { OrderDto, OrderSummaryDto, PlaceOrderResultDto, QuoteDto } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import {
  Authenticated,
  CurrentUser,
  IdempotencyInterceptor,
  OptionalAuth,
  type Principal,
  RateLimit,
  RequestContext,
  RequireCaptcha,
  ZodBody,
} from "@meridian/nest-kit";
import { Controller, Get, Headers, HttpCode, Param, Post, UseInterceptors } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { PlaceOrderCommand } from "../../application/commands";
import { GetOrderQuery, ListMyOrdersQuery, QuoteCheckoutQuery } from "../../application/queries";
import { QUOTE_POLICY, PLACE_ORDER_POLICY } from "./rate-limits";
import { headerValue, parseCartId, placeOrderSchema, quoteRequestSchema } from "./schemas";

@Controller()
export class CheckoutController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post("checkout/quote")
  @RateLimit(QUOTE_POLICY)
  @OptionalAuth()
  @HttpCode(200)
  quote(
    @CurrentUser() user: Principal | null,
    @ZodBody(quoteRequestSchema) body: z.infer<typeof quoteRequestSchema>,
    @Headers("x-cart-id") cartId?: string,
  ): Promise<QuoteDto> {
    return this.queryBus.execute(new QuoteCheckoutQuery(body, user?.sub ?? null, parseCartId(cartId)));
  }

  /**
   * Guards run bottom-up in declaration order here: auth, then the rate limit, then captcha (guests only); the
   * idempotency interceptor then replays or claims the Idempotency-Key before the saga runs.
   */
  @Post("orders")
  @UseInterceptors(IdempotencyInterceptor)
  @RequireCaptcha("place-order", { skipWhen: (req) => Boolean(req.principal) })
  @RateLimit(PLACE_ORDER_POLICY)
  @OptionalAuth()
  @HttpCode(201)
  placeOrder(
    @CurrentUser() user: Principal | null,
    @ZodBody(placeOrderSchema) body: z.infer<typeof placeOrderSchema>,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-cart-id") cartId?: string,
  ): Promise<PlaceOrderResultDto> {
    if (!idempotencyKey?.trim()) throw new ValidationError("The Idempotency-Key header is required to place an order.");
    return this.commandBus.execute(new PlaceOrderCommand(body, user?.sub ?? null, parseCartId(cartId), RequestContext.correlationId() ?? randomUUID()));
  }

  @Get("orders")
  @Authenticated()
  listMine(@CurrentUser() user: Principal): Promise<OrderSummaryDto[]> {
    return this.queryBus.execute(new ListMyOrdersQuery(user.sub));
  }

  @Get("orders/:id")
  @OptionalAuth()
  getOrder(@Param("id") id: string, @CurrentUser() user: Principal | null, @Headers("x-order-access") access?: string | string[]): Promise<OrderDto> {
    return this.queryBus.execute(new GetOrderQuery(id, user ? { userId: user.sub, role: user.role ?? null } : null, headerValue(access)));
  }
}
