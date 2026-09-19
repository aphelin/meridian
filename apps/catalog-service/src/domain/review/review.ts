import { AggregateRoot, type DomainEvent, ensure } from "@meridian/kernel";
import { requiredText } from "../shared/text";
import { FORMER_CUSTOMER } from "./author-name";

export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 2000;

export type ReviewPostedEvent = DomainEvent<"ReviewPosted", { productId: string; userId: string; rating: number }>;

export interface ReviewState {
  id: string;
  productId: string;
  /** Null once the author's account was deleted. */
  userId: string | null;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: Date;
}

/**
 * A verified-purchase review. Invariants: rating 1–5, title 1–120 characters, body 20–2000 characters; eligibility
 * (delivered purchase, one review per product per user) is decided by `ReviewEligibility` before posting.
 */
export class Review extends AggregateRoot<ReviewPostedEvent> {
  private constructor(private state: ReviewState) {
    super();
  }

  static post(input: { id: string; productId: string; userId: string; authorName: string; rating: number; title: string; body: string; now: Date }): Review {
    ensure(Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5, "VALIDATION_FAILED", "Rating must be a whole number from 1 to 5.");
    ensure(typeof input.userId === "string" && input.userId.length > 0, "UNAUTHORIZED", "Sign in to write a review.");
    const review = new Review({
      id: input.id,
      productId: input.productId,
      userId: input.userId,
      authorName: requiredText(input.authorName, "authorName", 60),
      rating: input.rating,
      title: requiredText(input.title, "Title", REVIEW_TITLE_MAX),
      body: requiredText(input.body, "Review", REVIEW_BODY_MAX, REVIEW_BODY_MIN),
      createdAt: input.now,
    });
    review.raise({ name: "ReviewPosted", aggregateType: "Review", aggregateId: input.id, payload: { productId: input.productId, userId: input.userId, rating: input.rating }, occurredAt: input.now });
    return review;
  }

  static restore(state: ReviewState): Review {
    return new Review({ ...state });
  }

  get id() {
    return this.state.id;
  }

  toState(): Readonly<ReviewState> {
    return { ...this.state };
  }

  /** Detaches the review from a deleted account; the text and rating stay as a product fact. */
  anonymise(): void {
    this.state = { ...this.state, userId: null, authorName: FORMER_CUSTOMER };
  }
}
