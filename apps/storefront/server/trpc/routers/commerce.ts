import type { CartDto, InvoiceLinkDto, OrderDto, OrderSummaryDto, PlaceOrderResultDto, QuoteDto, ReturnDto } from "@meridian/contracts";
import { z } from "zod";
import type { CookieJar } from "../../cookies";
import { LONG_TIMEOUT_MS, seg, services } from "../../services";
import { forgetGuestCart, guestCartId, orderAccessFor, rememberGuestCart, rememberOrderAccess, withSession } from "../../session";
import { authedProcedure, publicProcedure, router } from "../init";
import { accessToken, captchaToken, cartLine, orderId, placeOrderRequest, quoteRequest, returnRequest } from "../schemas";

/** Runs an order call as the signed-in owner and/or with the guest access token; remembers an explicit token that worked. */
async function withOrderAccess<T>(jar: CookieJar, id: string, explicit: string | undefined, call: (token: string | undefined, access: string | undefined) => Promise<T>): Promise<T> {
  const access = orderAccessFor(jar, id, explicit);
  const result = await withSession((token) => call(token, access), { jar });
  if (explicit && access === explicit) rememberOrderAccess(jar, id, explicit);
  return result;
}

export const cartRouter = router({
  get: publicProcedure.query(({ ctx }): Promise<CartDto> => {
    const jar = ctx.scope.cookies;
    return withSession((token) => services.checkout.get<CartDto>("/cart", { token, cartId: token ? undefined : guestCartId(jar) }), { jar });
  }),

  setLines: publicProcedure.input(z.object({ lines: z.array(cartLine).max(50) })).mutation(async ({ input, ctx }): Promise<CartDto> => {
    const jar = ctx.scope.cookies;
    const cart = await withSession((token) => services.checkout.put<CartDto>("/cart/items", { token, cartId: token ? undefined : guestCartId(jar), body: { lines: input.lines } }), { jar });
    if (!cart.userId) rememberGuestCart(jar, cart.id);
    return cart;
  }),

  merge: authedProcedure.mutation(async ({ ctx }): Promise<CartDto> => {
    const jar = ctx.scope.cookies;
    const cart = await ctx.call((token) => services.checkout.post<CartDto>("/cart/merge", { token, cartId: guestCartId(jar) }));
    forgetGuestCart(jar);
    return cart;
  }),

  clear: publicProcedure.mutation(async ({ ctx }) => {
    const jar = ctx.scope.cookies;
    await withSession((token) => services.checkout.delete("/cart", { token, cartId: token ? undefined : guestCartId(jar) }), { jar });
    return { ok: true as const };
  }),
});

export const checkoutRouter = router({
  quote: publicProcedure.input(quoteRequest).query(({ input, ctx }): Promise<QuoteDto> => {
    const jar = ctx.scope.cookies;
    return withSession((token) => services.checkout.post<QuoteDto>("/checkout/quote", { token, cartId: token ? undefined : guestCartId(jar), body: input }), { jar });
  }),

  /**
   * Places the order from the server cart. Guest orders get an access token, which is stored in the httpOnly
   * `oa_<orderId>` cookie and removed from the response so client JavaScript never sees it.
   */
  place: publicProcedure
    .input(z.object({ request: placeOrderRequest, idempotencyKey: z.uuid(), captchaToken }))
    .mutation(async ({ input, ctx }): Promise<PlaceOrderResultDto> => {
      const jar = ctx.scope.cookies;
      const result = await withSession(
        (token) =>
          services.checkout.post<PlaceOrderResultDto>("/orders", {
            token,
            cartId: token ? undefined : guestCartId(jar),
            idempotencyKey: input.idempotencyKey,
            captchaToken: input.captchaToken,
            body: input.request,
            // The saga prices, reserves and creates the payment intent synchronously.
            timeoutMs: LONG_TIMEOUT_MS,
          }),
        { jar },
      );
      if (result.accessToken) rememberOrderAccess(jar, result.order.id, result.accessToken);
      return { ...result, accessToken: null };
    }),

  sandboxPay: publicProcedure
    .input(z.object({ transactionId: z.string().trim().min(1).max(100), clientSecret: z.string().min(1).max(200) }))
    .mutation(async ({ input }) => {
      const res = await services.payment.post<{ status?: string } | undefined>(`/payments/${seg(input.transactionId)}/sandbox-complete`, { body: { clientSecret: input.clientSecret } });
      return { status: res?.status ?? "accepted" };
    }),
});

export const ordersRouter = router({
  list: authedProcedure.query(({ ctx }): Promise<OrderSummaryDto[]> => ctx.call((token) => services.checkout.get<OrderSummaryDto[]>("/orders", { token }))),

  byId: publicProcedure.input(z.object({ id: orderId, access: accessToken })).query(({ input, ctx }): Promise<OrderDto> =>
    withOrderAccess(ctx.scope.cookies, input.id, input.access, (token, access) => services.checkout.get<OrderDto>(`/orders/${seg(input.id)}`, { token, orderAccess: access })),
  ),

  cancel: publicProcedure.input(z.object({ id: orderId, access: accessToken })).mutation(({ input, ctx }): Promise<OrderDto> =>
    withOrderAccess(ctx.scope.cookies, input.id, input.access, (token, access) => services.checkout.post<OrderDto>(`/orders/${seg(input.id)}/cancel`, { token, orderAccess: access })),
  ),

  requestReturn: publicProcedure.input(returnRequest.extend({ id: orderId, access: accessToken })).mutation(({ input, ctx }): Promise<ReturnDto> =>
    withOrderAccess(ctx.scope.cookies, input.id, input.access, (token, access) =>
      services.checkout.post<ReturnDto>(`/orders/${seg(input.id)}/returns`, { token, orderAccess: access, body: { lines: input.lines, reason: input.reason } }),
    ),
  ),

  invoice: publicProcedure.input(z.object({ id: orderId, access: accessToken })).query(({ input, ctx }): Promise<InvoiceLinkDto> =>
    withOrderAccess(ctx.scope.cookies, input.id, input.access, (token, access) => services.checkout.get<InvoiceLinkDto>(`/orders/${seg(input.id)}/invoice`, { token, orderAccess: access })),
  ),
});
