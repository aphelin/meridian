import type { ReviewEligibilityDto, ReviewListDto, WishlistDto } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class ListReviewsQuery extends Query<ReviewListDto> {
  constructor(
    readonly slug: string,
    readonly cursor?: string,
    readonly limit?: number,
  ) {
    super();
  }
}

export class GetReviewEligibilityQuery extends Query<ReviewEligibilityDto> {
  constructor(
    readonly slug: string,
    readonly userId: string | null,
  ) {
    super();
  }
}

export class GetWishlistQuery extends Query<WishlistDto> {
  constructor(readonly userId: string) {
    super();
  }
}
