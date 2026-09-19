import type { ReviewDto, ReviewEligibilityDto, ReviewListDto } from "@meridian/contracts";
import { Authenticated, CurrentUser, OptionalAuth, parseWith, type Principal, RateLimit, ZodBody } from "@meridian/nest-kit";
import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { z } from "zod";
import { PostReviewCommand } from "../../application/commands/post-review.command";
import { GetReviewEligibilityQuery, ListReviewsQuery } from "../../application/queries/engagement.queries";
import { reviewInputSchema, reviewListQuerySchema, slugSchema } from "./schemas";

export const REVIEW_RATE_LIMIT = { name: "review", limit: 5, windowSec: 3600, by: ["user"] } as const;

/** Verified-purchase reviews. */
@Controller("products/:slug/reviews")
export class ReviewsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Param("slug") slug: string, @Query() query: unknown): Promise<ReviewListDto> {
    const q = parseWith(reviewListQuerySchema, query);
    return this.queryBus.execute(new ListReviewsQuery(parseWith(slugSchema, slug), q.cursor, q.limit));
  }

  @Get("eligibility")
  @OptionalAuth()
  eligibility(@Param("slug") slug: string, @CurrentUser() user: Principal | null): Promise<ReviewEligibilityDto> {
    return this.queryBus.execute(new GetReviewEligibilityQuery(parseWith(slugSchema, slug), user?.sub ?? null));
  }

  @Post()
  @RateLimit({ ...REVIEW_RATE_LIMIT, by: [...REVIEW_RATE_LIMIT.by] })
  @Authenticated()
  post(@Param("slug") slug: string, @CurrentUser() user: Principal, @ZodBody(reviewInputSchema) body: z.output<typeof reviewInputSchema>): Promise<ReviewDto> {
    return this.commandBus.execute(new PostReviewCommand(parseWith(slugSchema, slug), { userId: user.sub, email: user.email ?? null }, body));
  }
}
