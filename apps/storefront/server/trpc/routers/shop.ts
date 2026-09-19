import type {
  CatalogSnapshotDto,
  ProductDto,
  PublicStockDto,
  ReviewDto,
  ReviewEligibilityDto,
  ReviewListDto,
  SearchResultDto,
  SuggestionDto,
  WishlistDto,
} from "@meridian/contracts";
import { z } from "zod";
import { findProduct, getCatalog } from "../../catalog";
import { ServiceError } from "../../errors";
import { revalidateStorefront } from "../../render-cache";
import { searchProducts } from "../../search";
import { SEARCH_TIMEOUT_MS, seg, services } from "../../services";
import { withSession } from "../../session";
import { authedProcedure, publicProcedure, router } from "../init";
import { captchaToken, cursor, searchQuery, sku, slug, stockAlertRequest } from "../schemas";

export function requireCaptcha(token: string | undefined): string {
  if (!token) throw new ServiceError({ code: "CAPTCHA_REQUIRED", message: "Please complete the security check." });
  return token;
}

export const catalogRouter = router({
  snapshot: publicProcedure.query((): Promise<CatalogSnapshotDto> => getCatalog()),

  product: publicProcedure.input(z.object({ slug })).query(async ({ input }): Promise<ProductDto> => {
    const cached = await findProduct(input.slug);
    if (cached) return cached;
    // Not in the (up to 60 s old) snapshot: ask catalog directly so a product published a moment ago is visible.
    return services.catalog.get<ProductDto>(`/products/${seg(input.slug)}`);
  }),

  bySlugs: publicProcedure.input(z.object({ slugs: z.array(slug).max(50) })).query(async ({ input }): Promise<ProductDto[]> => {
    const bySlug = new Map((await getCatalog()).products.map((p) => [p.slug, p]));
    return input.slugs.map((s) => bySlug.get(s)).filter((p): p is ProductDto => p !== undefined && p.status === "published");
  }),

  stock: publicProcedure.input(z.object({ skus: z.array(sku).min(1).max(100) })).query(async ({ input }): Promise<PublicStockDto[]> => {
    const wanted = new Set(input.skus);
    const rows = await services.inventory.get<PublicStockDto[]>("/stock");
    return rows.filter((r) => wanted.has(r.sku)).map((r) => ({ sku: r.sku, available: Math.max(0, r.available) }));
  }),
});

export const searchRouter = router({
  products: publicProcedure.input(searchQuery).query(({ input }): Promise<SearchResultDto> => searchProducts(input)),

  suggest: publicProcedure.input(z.object({ q: z.string().max(200), limit: z.number().int().min(1).max(8).optional() })).query(({ input }): Promise<SuggestionDto[]> =>
    input.q.trim()
      ? services.search.get<SuggestionDto[]>("/search/suggest", { timeoutMs: SEARCH_TIMEOUT_MS, query: { q: input.q, limit: input.limit } })
      : Promise.resolve([]),
  ),
});

export const reviewsRouter = router({
  list: publicProcedure.input(z.object({ slug, cursor })).query(({ input }): Promise<ReviewListDto> =>
    services.catalog.get<ReviewListDto>(`/products/${seg(input.slug)}/reviews`, { query: { cursor: input.cursor } }),
  ),

  eligibility: publicProcedure.input(z.object({ slug })).query(({ input, ctx }): Promise<ReviewEligibilityDto> =>
    withSession((token) => services.catalog.get<ReviewEligibilityDto>(`/products/${seg(input.slug)}/reviews/eligibility`, { token }), { jar: ctx.scope.cookies }),
  ),

  post: authedProcedure
    .input(z.object({ slug, rating: z.number().int().min(1).max(5), title: z.string().trim().min(1).max(120), body: z.string().trim().min(20, "Reviews need at least 20 characters.").max(2000) }))
    .mutation(async ({ input, ctx }): Promise<ReviewDto> => {
      const review = await ctx.call((token) =>
        services.catalog.post<ReviewDto>(`/products/${seg(input.slug)}/reviews`, { token, body: { rating: input.rating, title: input.title, body: input.body } }),
      );
      // A review moves the product's rating, which the cached product page bakes into its JSON-LD and summary.
      revalidateStorefront("catalog", input.slug);
      return review;
    }),
});

export const wishlistRouter = router({
  get: authedProcedure.query(({ ctx }): Promise<WishlistDto> => ctx.call((token) => services.catalog.get<WishlistDto>("/wishlist", { token }))),

  add: authedProcedure.input(z.object({ slug })).mutation(({ input, ctx }): Promise<WishlistDto> =>
    ctx.call((token) => services.catalog.post<WishlistDto>("/wishlist", { token, body: { slug: input.slug } })),
  ),

  remove: authedProcedure.input(z.object({ slug })).mutation(({ input, ctx }): Promise<WishlistDto> =>
    ctx.call((token) => services.catalog.delete<WishlistDto>(`/wishlist/${seg(input.slug)}`, { token })),
  ),

  /** Server ∪ local: the device's saved slugs are added to the account's wishlist (never removing server entries). */
  merge: authedProcedure.input(z.object({ slugs: z.array(slug).max(100) })).mutation(({ input, ctx }): Promise<WishlistDto> =>
    ctx.call(async (token) => {
      const current = await services.catalog.get<WishlistDto>("/wishlist", { token });
      const union = [...new Set([...current.slugs, ...input.slugs])];
      if (union.length === current.slugs.length) return current;
      return services.catalog.put<WishlistDto>("/wishlist", { token, body: { slugs: union.slice(0, 100) } });
    }),
  ),
});

export const alertsRouter = router({
  stock: publicProcedure.input(stockAlertRequest.extend({ captchaToken })).mutation(async ({ input }) => {
    const { captchaToken: token, ...body } = input;
    await services.notification.post("/stock-alerts", { body, captchaToken: requireCaptcha(token) });
    return { ok: true as const };
  }),
});
