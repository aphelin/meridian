import { PermanentError } from "@meridian/nest-kit";
import { describe, expect, it, vi } from "vitest";
import { Review } from "../../domain/review/review";
import {
  clock,
  FakeCache,
  FakeReadModel,
  fakeOutbox,
  FakeTransactions,
  InMemoryProducts,
  InMemoryPurchases,
  InMemoryReferenceData,
  InMemoryReviews,
  InMemoryWishlists,
  NOW,
  publishedProduct,
} from "../../testing/in-memory";
import { CatalogPurchasesConsumer } from "../event-handlers/catalog-purchases.consumer";
import { GetReviewEligibilityHandler } from "../queries/engagement.handlers";
import { ProductEventWriter } from "../services/product-event-writer";
import { PostReviewCommand } from "./post-review.command";
import { PostReviewHandler } from "./post-review.handler";
import { ForgetUserHandler, RecordPurchasesHandler } from "./purchases.handlers";
import { ForgetUserCommand, RecordPurchasesCommand } from "./purchases.commands";

function setup() {
  const transactions = new FakeTransactions();
  const products = new InMemoryProducts(publishedProduct("prd_holt"));
  const reviews = new InMemoryReviews();
  const purchases = new InMemoryPurchases();
  const wishlists = new InMemoryWishlists();
  const outbox = fakeOutbox();
  const readModel = new FakeReadModel(products, reviews, wishlists);
  const cache = new FakeCache();
  const postReview = new PostReviewHandler(transactions, products, reviews, purchases, outbox, new ProductEventWriter(outbox, new InMemoryReferenceData()), cache, readModel, clock());
  const record = new RecordPurchasesHandler(transactions, purchases);
  const forget = new ForgetUserHandler(transactions, reviews, purchases, wishlists);
  const eligibility = new GetReviewEligibilityHandler(products, reviews, purchases);
  return { transactions, products, reviews, purchases, wishlists, outbox, readModel, cache, postReview, record, forget, eligibility };
}

const reviewInput = { rating: 4, title: "Solid sofa", body: "Comfortable, well made, the wool is soft." };
const delivered = (userId: string, messageId = `m-${Math.random()}`) =>
  new RecordPurchasesCommand(messageId, { orderId: "ord_1", userId, customerName: "Nino Beridze", deliveredAt: NOW, slugs: ["holt-sofa"] });

describe("verified-purchase reviews", () => {
  it("review eligibility moves from not-delivered to eligible to already-reviewed", async () => {
    const ctx = setup();
    const user = `u-${Math.random()}`;
    expect(await ctx.eligibility.execute({ slug: "holt-sofa", userId: null } as never)).toEqual({ eligible: false, reason: "sign-in" });
    expect(await ctx.eligibility.execute({ slug: "holt-sofa", userId: user } as never)).toEqual({ eligible: false, reason: "not-delivered" });
    await ctx.record.execute(delivered(user));
    expect(await ctx.eligibility.execute({ slug: "holt-sofa", userId: user } as never)).toEqual({ eligible: true, reason: "eligible" });
    await ctx.postReview.execute(new PostReviewCommand("holt-sofa", { userId: user, email: null }, reviewInput));
    expect(await ctx.eligibility.execute({ slug: "holt-sofa", userId: user } as never)).toEqual({ eligible: false, reason: "already-reviewed" });
    await expect(ctx.eligibility.execute({ slug: "nope", userId: user } as never)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a review before delivery with REVIEW_NOT_ALLOWED", async () => {
    const ctx = setup();
    await expect(ctx.postReview.execute(new PostReviewCommand("holt-sofa", { userId: "u-early", email: null }, reviewInput))).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
    expect(ctx.outbox.rows).toHaveLength(0);
  });

  it("posting writes ReviewPosted and ProductUpdated(rating) and updates the product rating", async () => {
    const ctx = setup();
    const user = `u-${Math.random()}`;
    await ctx.record.execute(delivered(user));
    const dto = await ctx.postReview.execute(new PostReviewCommand("holt-sofa", { userId: user, email: "x@y.z" }, reviewInput));
    expect(dto).toMatchObject({ rating: 4, authorName: "Nino B.", verifiedPurchase: true });
    expect(ctx.outbox.rows.map((r) => r.name)).toEqual(["ReviewPosted", "ProductUpdated"]);
    expect(ctx.outbox.rows[0].payload).toMatchObject({ slug: "holt-sofa", productId: "prd_holt", userId: user, rating: 4, ratingAvg: 4, ratingCount: 1 });
    expect(ctx.outbox.rows[1].payload).toMatchObject({ changed: ["rating"], product: { ratingAvg: 4, ratingCount: 1 } });
    expect((await ctx.products.findById("prd_holt"))?.rating.count).toBe(1);
    expect(ctx.cache.invalidations).toBe(1);
    await expect(ctx.postReview.execute(new PostReviewCommand("holt-sofa", { userId: user, email: null }, { ...reviewInput, rating: 1 }))).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
  });
});

describe("catalog-purchases consumer", () => {
  it("records purchases idempotently per message id", async () => {
    const ctx = setup();
    const user = `u-${Math.random()}`;
    const command = delivered(user, `dup-${Math.random()}`);
    expect(await ctx.record.execute(command)).toBe(true);
    expect(await ctx.record.execute(command)).toBe(false);
    expect(ctx.purchases.rows.size).toBe(1);
  });

  it("UserDeleted anonymises reviews, clears the wishlist and purchase records", async () => {
    const ctx = setup();
    const user = `u-${Math.random()}`;
    await ctx.record.execute(delivered(user));
    await ctx.postReview.execute(new PostReviewCommand("holt-sofa", { userId: user, email: null }, reviewInput));
    ctx.wishlists.lists.set(user, ["holt-sofa"]);
    expect(await ctx.forget.execute(new ForgetUserCommand(`del-${Math.random()}`, user))).toBe(true);
    const [review] = [...ctx.reviews.rows.values()].map((r: Review) => r.toState());
    expect(review).toMatchObject({ userId: null, authorName: "Former customer", rating: 4 });
    expect(ctx.wishlists.lists.has(user)).toBe(false);
    expect(ctx.purchases.rows.size).toBe(0);
  });

  it("skips guest deliveries and parks malformed payloads as permanent errors", async () => {
    const commandBus = { execute: vi.fn() };
    const consumer = new CatalogPurchasesConsumer(commandBus as never);
    const envelope = (name: string, payload: unknown) => ({ messageId: "m1", name, payload }) as never;
    await consumer.onOrderDelivered(envelope("OrderDelivered", { orderId: "o", customer: { userId: null, email: "g@x.y", name: "Guest" }, lines: [], deliveredAt: NOW.toISOString() }));
    expect(commandBus.execute).not.toHaveBeenCalled();
    await expect(consumer.onOrderDelivered(envelope("OrderDelivered", { orderId: "o" }))).rejects.toBeInstanceOf(PermanentError);
    await consumer.onUserDeleted(envelope("UserDeleted", { userId: "u1", email: "u@x.y" }));
    expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(ForgetUserCommand);
  });
});
