import { describe, expect, it } from "vitest";
import { NOW } from "../../testing/in-memory";
import { FORMER_CUSTOMER, reviewAuthorName } from "./author-name";
import { purchaseRecordsFromDelivery } from "./purchase-record";
import { Review } from "./review";
import { assertMayReview, reviewEligibility } from "./review-eligibility";

const post = (overrides: Partial<Parameters<typeof Review.post>[0]> = {}) =>
  Review.post({ id: "rev_1", productId: "prd_1", userId: "user_1", authorName: "Nino B.", rating: 4, title: "Solid sofa", body: "Comfortable, well made, the wool is soft.", now: NOW, ...overrides });

describe("review eligibility", () => {
  it("eligibility asks anonymous shoppers to sign in", () => {
    expect(reviewEligibility({ signedIn: false, purchased: true, alreadyReviewed: false })).toBe("sign-in");
  });

  it("eligibility requires a delivered purchase and no earlier review", () => {
    expect(reviewEligibility({ signedIn: true, purchased: false, alreadyReviewed: false })).toBe("not-delivered");
    expect(reviewEligibility({ signedIn: true, purchased: true, alreadyReviewed: true })).toBe("already-reviewed");
    expect(reviewEligibility({ signedIn: true, purchased: true, alreadyReviewed: false })).toBe("eligible");
  });

  it("posting without eligibility fails with REVIEW_NOT_ALLOWED", () => {
    expect(() => assertMayReview({ signedIn: true, purchased: false, alreadyReviewed: false })).toThrow(expect.objectContaining({ code: "REVIEW_NOT_ALLOWED" }));
    expect(() => assertMayReview({ signedIn: true, purchased: true, alreadyReviewed: true })).toThrow(expect.objectContaining({ code: "REVIEW_NOT_ALLOWED" }));
    expect(() => assertMayReview({ signedIn: true, purchased: true, alreadyReviewed: false })).not.toThrow();
  });
});

describe("Review aggregate", () => {
  it("raises ReviewPosted with the rating", () => {
    expect(post().pullEvents()).toMatchObject([{ name: "ReviewPosted", aggregateId: "rev_1", payload: { productId: "prd_1", userId: "user_1", rating: 4 } }]);
  });

  it("enforces rating 1–5, title up to 120 and body of 20–2000 characters", () => {
    expect(() => post({ rating: 0 })).toThrow();
    expect(() => post({ title: "x".repeat(121) })).toThrow();
    expect(() => post({ body: "too short" })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => post({ body: "x".repeat(2001) })).toThrow();
  });

  it("anonymises the author when the account is deleted", () => {
    const review = post();
    review.anonymise();
    expect(review.toState()).toMatchObject({ userId: null, authorName: FORMER_CUSTOMER, rating: 4 });
  });

  it("author names show the first name and last initial only", () => {
    expect(reviewAuthorName("nino beridze")).toBe("Nino B.");
    expect(reviewAuthorName("Anna Maria Lind")).toBe("Anna L.");
    expect(reviewAuthorName("Buyer")).toBe("Buyer");
    expect(reviewAuthorName("", "giorgi.k@example.com")).toBe("Giorgi");
    expect(reviewAuthorName(null, null)).toBe("Verified buyer");
  });
});

describe("purchase records", () => {
  it("one record per distinct delivered slug; malformed slugs are ignored", () => {
    const records = purchaseRecordsFromDelivery({ userId: "u1", customerName: "Buyer", orderId: "o1", deliveredAt: NOW, slugs: ["holt-sofa", "holt-sofa", "Bad Slug", "pil-lounge"] });
    expect(records.map((r) => r.slug)).toEqual(["holt-sofa", "pil-lounge"]);
  });
});
