import type { ReviewEligibilityDto } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";

export type EligibilityReason = ReviewEligibilityDto["reason"];

export interface EligibilityFacts {
  signedIn: boolean;
  /** A delivered order line for this product exists for the user (PurchaseRecord). */
  purchased: boolean;
  alreadyReviewed: boolean;
}

/** Verified-purchase policy: signed in, the product was delivered to the user, and no earlier review. */
export function reviewEligibility(facts: EligibilityFacts): EligibilityReason {
  if (!facts.signedIn) return "sign-in";
  if (facts.alreadyReviewed) return "already-reviewed";
  if (!facts.purchased) return "not-delivered";
  return "eligible";
}

export function assertMayReview(facts: EligibilityFacts): void {
  const reason = reviewEligibility(facts);
  if (reason === "sign-in") throw new DomainError("UNAUTHORIZED", "Sign in to write a review.");
  if (reason === "already-reviewed") throw new DomainError("REVIEW_NOT_ALLOWED", "You have already reviewed this product.", { reason });
  if (reason === "not-delivered") throw new DomainError("REVIEW_NOT_ALLOWED", "Reviews open once your order has been delivered.", { reason });
}
