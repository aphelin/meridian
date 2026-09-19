import type { ReviewDto } from "@meridian/contracts";
import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { OutboxWriter } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { randomUUID } from "node:crypto";
import { ProductRepository } from "../../domain/product/product.repository";
import { reviewAuthorName } from "../../domain/review/author-name";
import { Review } from "../../domain/review/review";
import { assertMayReview } from "../../domain/review/review-eligibility";
import { PurchaseRecordRepository, ReviewRepository } from "../../domain/review/review.repository";
import { CatalogCache } from "../ports/catalog-cache";
import { CatalogReadModel } from "../ports/catalog-read-model";
import { TransactionRunner } from "../ports/transaction";
import { ProductEventWriter } from "../services/product-event-writer";
import { PostReviewCommand } from "./post-review.command";

/**
 * Verified-purchase review. The product row is locked for the whole unit of work, so the eligibility check, the
 * one-review-per-user rule and the rating counters cannot race. Writes ReviewPosted and ProductUpdated(rating).
 */
@CommandHandler(PostReviewCommand)
export class PostReviewHandler implements ICommandHandler<PostReviewCommand, ReviewDto> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly products: ProductRepository,
    private readonly reviews: ReviewRepository,
    private readonly purchases: PurchaseRecordRepository,
    private readonly outbox: OutboxWriter,
    private readonly productEvents: ProductEventWriter,
    private readonly cache: CatalogCache,
    private readonly readModel: CatalogReadModel,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ slug, author, input }: PostReviewCommand): Promise<ReviewDto> {
    const reviewId = await this.transactions.run(async (tx) => {
      const product = await this.products.findBySlug(slug, tx, { forUpdate: true });
      if (!product || !product.isPublished) throw new NotFoundError("Product not found.");
      const purchase = await this.purchases.find(author.userId, product.slug, tx);
      const alreadyReviewed = await this.reviews.existsFor(product.id, author.userId, tx);
      assertMayReview({ signedIn: true, purchased: purchase !== null, alreadyReviewed });

      const now = this.clock.now();
      const review = Review.post({
        id: `rev_${randomUUID()}`,
        productId: product.id,
        userId: author.userId,
        authorName: reviewAuthorName(purchase?.customerName, author.email),
        rating: input.rating,
        title: input.title,
        body: input.body,
        now,
      });
      product.recordRating(input.rating, now);
      await this.reviews.save(review, tx);
      await this.products.save(product, tx);
      for (const event of review.pullEvents()) {
        await this.outbox.event(tx, "ReviewPosted", { type: "Review", id: review.id }, {
          reviewId: review.id,
          productId: product.id,
          slug: product.slug,
          userId: event.payload.userId,
          rating: event.payload.rating,
          ratingAvg: product.rating.average ?? event.payload.rating,
          ratingCount: product.rating.count,
        });
      }
      await this.productEvents.write(tx, product);
      return review.id;
    });
    await this.cache.invalidate();
    const dto = await this.readModel.review(reviewId);
    if (!dto) throw new DomainError("INTERNAL", "The review was saved but could not be read back.");
    return dto;
  }
}
