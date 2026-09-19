import type { ReviewDto } from "@meridian/contracts";
import { Command } from "@nestjs/cqrs";

export interface ReviewInput {
  rating: number;
  title: string;
  body: string;
}

export class PostReviewCommand extends Command<ReviewDto> {
  constructor(
    readonly slug: string,
    readonly author: { userId: string; email: string | null },
    readonly input: ReviewInput,
  ) {
    super();
  }
}
