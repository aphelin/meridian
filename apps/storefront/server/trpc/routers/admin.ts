import type {
  AdminOrderDto,
  AdminOrderListDto,
  AdminStockDto,
  AnalyticsOverviewDto,
  ChaosRuleDto,
  ContactMessageListDto,
  CouponDto,
  CustomerListDto,
  CustomerRef,
  DeadLetterDto,
  EmailDeliveryListDto,
  ImageUploadTicketDto,
  OrderDto,
  Page,
  ProductDto,
  ProductImageDto,
  RefundDto,
  ReplayResultDto,
  ReturnDto,
  StockMovementDto,
  TopProductDto,
} from "@meridian/contracts";
import { z } from "zod";
import { redact } from "../../redact";
import { revalidateStorefront } from "../../render-cache";
import { LONG_TIMEOUT_MS, seg, service, services } from "../../services";
import { keyForServiceName, systemOverview, type SystemOverview } from "../../system";
import { adminProcedure, router } from "../init";
import {
  chaosRuleInput,
  couponCode,
  couponInput,
  couponPatch,
  cursor,
  id,
  messagingSource,
  ORDER_STATUSES,
  productInput,
  queueOrTopic,
  refundRequest,
  returnDecision,
  serviceName,
  sku,
  stockAdjust,
  transitionRequest,
  variantInput,
} from "../schemas";

export type AdminReturnDto = ReturnDto & { orderNumber: string; customer: CustomerRef };

const days = z.number().int().min(1).max(366);

/**
 * Admin writes to the catalog change what shoppers see: drop the BFF snapshot and revalidate the cached (ISR) pages so
 * they appear without waiting for the 60 s window.
 */
async function catalogWrite<T>(work: Promise<T>): Promise<T> {
  const result = await work;
  const slug = typeof result === "object" && result !== null && "slug" in result && typeof result.slug === "string" ? result.slug : undefined;
  revalidateStorefront("catalog", slug);
  return result;
}

/** Stock and search-index writes change the listings' in-stock badges; product pages never cache stock. */
async function listingsWrite<T>(work: Promise<T>): Promise<T> {
  const result = await work;
  revalidateStorefront("listings");
  return result;
}

const ordersAdmin = router({
  list: adminProcedure
    .input(z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().trim().max(120).optional(), cursor, limit: z.number().int().min(1).max(100).optional() }).nullish())
    .query(({ input, ctx }): Promise<AdminOrderListDto> => ctx.call((token) => services.checkout.get<AdminOrderListDto>("/admin/orders", { token, query: { ...input } }))),

  byId: adminProcedure.input(z.object({ id })).query(({ input, ctx }): Promise<AdminOrderDto> =>
    ctx.call((token) => services.checkout.get<AdminOrderDto>(`/admin/orders/${seg(input.id)}`, { token })),
  ),

  transition: adminProcedure.input(transitionRequest.extend({ id })).mutation(({ input, ctx }): Promise<OrderDto> => {
    const { id: orderId, ...body } = input;
    return ctx.call((token) => services.checkout.post<OrderDto>(`/admin/orders/${seg(orderId)}/transition`, { token, body }));
  }),

  refund: adminProcedure.input(refundRequest.extend({ id })).mutation(async ({ input, ctx }) => {
    const { id: orderId, ...body } = input;
    const refund = await ctx.call((token) => services.checkout.post<RefundDto | undefined>(`/admin/orders/${seg(orderId)}/refunds`, { token, body }));
    return { ok: true as const, refund: refund ?? null };
  }),

  expire: adminProcedure.input(z.object({ olderThanSeconds: z.number().int().min(0).max(365 * 86_400).optional() }).nullish()).mutation(({ input, ctx }): Promise<{ expired: number }> =>
    ctx.call((token) => services.checkout.post<{ expired: number }>("/admin/orders/expire", { token, body: input ?? {} })),
  ),
});

const returnsAdmin = router({
  list: adminProcedure
    .input(z.object({ status: z.enum(["requested", "approved", "rejected", "refunded"]).optional(), cursor }).nullish())
    .query(({ input, ctx }): Promise<Page<AdminReturnDto>> => ctx.call((token) => services.checkout.get<Page<AdminReturnDto>>("/admin/returns", { token, query: { ...input } }))),

  decide: adminProcedure.input(returnDecision.extend({ id })).mutation(({ input, ctx }): Promise<ReturnDto> => {
    const { id: returnId, ...body } = input;
    return ctx.call((token) => services.checkout.post<ReturnDto>(`/admin/returns/${seg(returnId)}/decision`, { token, body }));
  }),
});

const couponsAdmin = router({
  list: adminProcedure.query(({ ctx }): Promise<CouponDto[]> => ctx.call((token) => services.checkout.get<CouponDto[]>("/admin/coupons", { token }))),

  create: adminProcedure.input(couponInput).mutation(({ input, ctx }): Promise<CouponDto> =>
    ctx.call((token) => services.checkout.post<CouponDto>("/admin/coupons", { token, body: input })),
  ),

  update: adminProcedure.input(z.object({ code: couponCode, patch: couponPatch })).mutation(({ input, ctx }): Promise<CouponDto> =>
    ctx.call((token) => services.checkout.patch<CouponDto>(`/admin/coupons/${seg(input.code)}`, { token, body: input.patch })),
  ),
});

const productsAdmin = router({
  list: adminProcedure
    .input(z.object({ status: z.enum(["draft", "published", "archived"]).optional(), q: z.string().trim().max(120).optional(), cursor }).nullish())
    .query(({ input, ctx }): Promise<Page<ProductDto>> => ctx.call((token) => services.catalog.get<Page<ProductDto>>("/admin/products", { token, query: { ...input } }))),

  byId: adminProcedure.input(z.object({ id })).query(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => services.catalog.get<ProductDto>(`/admin/products/${seg(input.id)}`, { token })),
  ),

  create: adminProcedure.input(productInput).mutation(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => catalogWrite(services.catalog.post<ProductDto>("/admin/products", { token, body: input }))),
  ),

  update: adminProcedure.input(z.object({ id, patch: productInput.partial() })).mutation(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => catalogWrite(services.catalog.patch<ProductDto>(`/admin/products/${seg(input.id)}`, { token, body: input.patch }))),
  ),

  replaceVariants: adminProcedure.input(z.object({ id, variants: z.array(variantInput).min(1).max(20) })).mutation(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => catalogWrite(services.catalog.put<ProductDto>(`/admin/products/${seg(input.id)}/variants`, { token, body: input.variants }))),
  ),

  publish: adminProcedure.input(z.object({ id })).mutation(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => catalogWrite(services.catalog.post<ProductDto>(`/admin/products/${seg(input.id)}/publish`, { token }))),
  ),

  archive: adminProcedure.input(z.object({ id })).mutation(({ input, ctx }): Promise<ProductDto> =>
    ctx.call((token) => catalogWrite(services.catalog.post<ProductDto>(`/admin/products/${seg(input.id)}/archive`, { token }))),
  ),

  uploadUrl: adminProcedure
    .input(z.object({ id, contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), fileName: z.string().trim().min(1).max(200) }))
    .mutation(({ input, ctx }): Promise<ImageUploadTicketDto> =>
      ctx.call((token) =>
        services.catalog.post<ImageUploadTicketDto>(`/admin/products/${seg(input.id)}/images/upload-url`, {
          token,
          body: { contentType: input.contentType, fileName: input.fileName },
          timeoutMs: LONG_TIMEOUT_MS,
        }),
      ),
    ),

  attachImage: adminProcedure.input(z.object({ id, objectKey: z.string().trim().min(1).max(300), alt: z.string().trim().min(1).max(200) })).mutation(({ input, ctx }): Promise<ProductImageDto> =>
    ctx.call((token) =>
      catalogWrite(
        services.catalog.post<ProductImageDto>(`/admin/products/${seg(input.id)}/images`, { token, body: { objectKey: input.objectKey, alt: input.alt }, timeoutMs: LONG_TIMEOUT_MS }),
      ),
    ),
  ),

  removeImage: adminProcedure.input(z.object({ id, imageId: id })).mutation(async ({ input, ctx }) => {
    await ctx.call((token) => catalogWrite(services.catalog.delete(`/admin/products/${seg(input.id)}/images/${seg(input.imageId)}`, { token, timeoutMs: LONG_TIMEOUT_MS })));
    return { ok: true as const };
  }),
});

const stockAdmin = router({
  list: adminProcedure.query(({ ctx }): Promise<AdminStockDto[]> => ctx.call((token) => services.inventory.get<AdminStockDto[]>("/admin/stock", { token }))),

  adjust: adminProcedure.input(stockAdjust).mutation(({ input, ctx }): Promise<AdminStockDto> =>
    ctx.call((token) => listingsWrite(services.inventory.post<AdminStockDto>("/admin/stock/adjust", { token, body: input }))),
  ),

  movements: adminProcedure.input(z.object({ sku })).query(({ input, ctx }): Promise<StockMovementDto[]> =>
    ctx.call((token) => services.inventory.get<StockMovementDto[]>(`/admin/stock/${seg(input.sku)}/movements`, { token })),
  ),
});

const customersAdmin = router({
  list: adminProcedure.input(z.object({ q: z.string().trim().max(100).optional(), cursor }).nullish()).query(({ input, ctx }): Promise<CustomerListDto> =>
    ctx.call((token) => services.identity.get<CustomerListDto>("/admin/customers", { token, query: { ...input } })),
  ),
});

const analyticsAdmin = router({
  overview: adminProcedure.input(z.object({ days })).query(({ input, ctx }): Promise<AnalyticsOverviewDto> =>
    ctx.call((token) => services.analytics.get<AnalyticsOverviewDto>("/analytics/overview", { token, query: { days: input.days } })),
  ),

  topProducts: adminProcedure.input(z.object({ days, limit: z.number().int().min(1).max(50) })).query(({ input, ctx }): Promise<TopProductDto[]> =>
    ctx.call((token) => services.analytics.get<TopProductDto[]>("/analytics/top-products", { token, query: { days: input.days, limit: input.limit } })),
  ),

  rebuild: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.call((token) => services.analytics.post("/admin/analytics/rebuild", { token, timeoutMs: LONG_TIMEOUT_MS }));
    return { ok: true as const };
  }),
});

const emailsAdmin = router({
  list: adminProcedure
    .input(z.object({ status: z.enum(["queued", "sent", "failed", "dead-lettered", "suppressed"]).optional(), template: z.string().trim().max(60).optional(), cursor }).nullish())
    .query(({ input, ctx }): Promise<EmailDeliveryListDto> => ctx.call((token) => services.notification.get<EmailDeliveryListDto>("/admin/emails", { token, query: { ...input } }))),
});

const contactMessagesAdmin = router({
  list: adminProcedure.input(z.object({ cursor }).nullish()).query(({ input, ctx }): Promise<ContactMessageListDto> =>
    ctx.call((token) => services.notification.get<ContactMessageListDto>("/admin/contact-messages", { token, query: { ...input } })),
  ),
});

const searchAdmin = router({
  rebuild: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.call((token) => listingsWrite(services.search.post("/admin/search/rebuild", { token, timeoutMs: LONG_TIMEOUT_MS })));
    return { ok: true as const };
  }),
});

const systemAdmin = router({
  overview: adminProcedure.query(({ ctx }): Promise<SystemOverview> => ctx.call((token) => systemOverview(token))),

  /**
   * Dead letters, most recently dead-lettered first (brokers list them in arrival order), with one-time links and
   * secrets redacted before they leave the BFF.
   */
  deadLetters: adminProcedure
    .input(z.object({ service: serviceName, source: messagingSource, queueOrTopic, limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ input, ctx }): Promise<DeadLetterDto[]> => {
      const letters = await ctx.call((token) =>
        service(keyForServiceName(input.service)).get<DeadLetterDto[]>("/admin/messaging/dead-letters", {
          token,
          query: { source: input.source, queueOrTopic: input.queueOrTopic, limit: input.limit },
          timeoutMs: LONG_TIMEOUT_MS,
        }),
      );
      return [...letters].reverse().map((letter) => ({ ...letter, payload: redact(letter.payload) }));
    }),

  replay: adminProcedure
    .input(z.object({ service: serviceName, source: messagingSource, queueOrTopic, ids: z.array(z.string().min(1).max(512)).max(200).optional(), limit: z.number().int().min(1).max(1000).optional() }))
    .mutation(({ input, ctx }): Promise<ReplayResultDto> => {
      const { service: name, ...body } = input;
      return ctx.call((token) => service(keyForServiceName(name)).post<ReplayResultDto>("/admin/messaging/replay", { token, body, timeoutMs: LONG_TIMEOUT_MS }));
    }),

  chaos: router({
    list: adminProcedure.input(z.object({ service: serviceName })).query(({ input, ctx }): Promise<ChaosRuleDto[]> =>
      ctx.call((token) => service(keyForServiceName(input.service)).get<ChaosRuleDto[]>("/admin/chaos", { token })),
    ),

    set: adminProcedure.input(chaosRuleInput.extend({ service: serviceName })).mutation(({ input, ctx }): Promise<ChaosRuleDto> => {
      const { service: name, ...rule } = input;
      return ctx.call((token) => service(keyForServiceName(name)).put<ChaosRuleDto>("/admin/chaos", { token, body: rule }));
    }),

    clear: adminProcedure.input(z.object({ service: serviceName, target: z.string().trim().min(1).max(200).optional() })).mutation(async ({ input, ctx }) => {
      await ctx.call((token) => service(keyForServiceName(input.service)).delete("/admin/chaos", { token, query: { target: input.target } }));
      return { ok: true as const };
    }),
  }),
});

export const adminRouter = router({
  orders: ordersAdmin,
  returns: returnsAdmin,
  coupons: couponsAdmin,
  products: productsAdmin,
  stock: stockAdmin,
  customers: customersAdmin,
  analytics: analyticsAdmin,
  emails: emailsAdmin,
  contactMessages: contactMessagesAdmin,
  search: searchAdmin,
  system: systemAdmin,
});
