import type { ReviewEligibilityDto, ReviewListDto, WishlistDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ProductRepository } from "../../domain/product/product.repository";
import { reviewEligibility } from "../../domain/review/review-eligibility";
import { PurchaseRecordRepository, ReviewRepository } from "../../domain/review/review.repository";
import { CatalogReadModel } from "../ports/catalog-read-model";
import { decodeReviewCursor, encodeReviewCursor, pageSize } from "../services/cursor";
import { GetReviewEligibilityQuery, GetWishlistQuery, ListReviewsQuery } from "./engagement.queries";

/** Newest reviews first with the product's rating summary. */
@QueryHandler(ListReviewsQuery)
export class ListReviewsHandler implements IQueryHandler<ListReviewsQuery, ReviewListDto> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ slug, cursor, limit }: ListReviewsQuery): Promise<ReviewListDto> {
    const after = decodeReviewCursor(cursor);
    const product = await this.readModel.productBySlug(slug);
    if (!product || product.status !== "published") throw new NotFoundError("Product not found.");
    const slice = await this.readModel.reviews(product.id, after, pageSize(limit, 10, 50));
    return { items: slice.items, nextCursor: encodeReviewCursor(slice.next), summary: product.rating };
  }
}

@QueryHandler(GetReviewEligibilityQuery)
export class GetReviewEligibilityHandler implements IQueryHandler<GetReviewEligibilityQuery, ReviewEligibilityDto> {
  constructor(
    private readonly products: ProductRepository,
    private readonly reviews: ReviewRepository,
    private readonly purchases: PurchaseRecordRepository,
  ) {}

  async execute({ slug, userId }: GetReviewEligibilityQuery): Promise<ReviewEligibilityDto> {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isPublished) throw new NotFoundError("Product not found.");
    if (!userId) return { eligible: false, reason: reviewEligibility({ signedIn: false, purchased: false, alreadyReviewed: false }) };
    const alreadyReviewed = await this.reviews.existsFor(product.id, userId);
    const purchased = (await this.purchases.find(userId, product.slug)) !== null;
    const reason = reviewEligibility({ signedIn: true, purchased, alreadyReviewed });
    return { eligible: reason === "eligible", reason };
  }
}

@QueryHandler(GetWishlistQuery)
export class GetWishlistHandler implements IQueryHandler<GetWishlistQuery, WishlistDto> {
  constructor(private readonly readModel: CatalogReadModel) {}

  async execute({ userId }: GetWishlistQuery): Promise<WishlistDto> {
    return { slugs: await this.readModel.wishlist(userId) };
  }
}
