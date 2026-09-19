import { ensure } from "@meridian/kernel";

export type StarCounts = [number, number, number, number, number];

/** Aggregate star ratings of a product. Index 0 = one star … index 4 = five stars. Immutable value object. */
export class RatingSummary {
  private constructor(private readonly counts: StarCounts) {}

  static empty(): RatingSummary {
    return new RatingSummary([0, 0, 0, 0, 0]);
  }

  static of(counts: readonly number[]): RatingSummary {
    ensure(counts.length === 5 && counts.every((c) => Number.isSafeInteger(c) && c >= 0), "VALIDATION_FAILED", "Rating counts must be five non-negative whole numbers.");
    return new RatingSummary([counts[0], counts[1], counts[2], counts[3], counts[4]]);
  }

  /** Adds one rating of `stars` (1–5). */
  add(stars: number): RatingSummary {
    ensure(Number.isInteger(stars) && stars >= 1 && stars <= 5, "VALIDATION_FAILED", "Rating must be a whole number from 1 to 5.");
    const next = [...this.counts] as StarCounts;
    next[stars - 1] += 1;
    return new RatingSummary(next);
  }

  get count(): number {
    return this.counts.reduce((sum, c) => sum + c, 0);
  }

  /** Mean rating rounded to one decimal, or null without ratings. */
  get average(): number | null {
    const count = this.count;
    if (count === 0) return null;
    const total = this.counts.reduce((sum, c, i) => sum + c * (i + 1), 0);
    return Math.round((total / count) * 10) / 10;
  }

  get distribution(): StarCounts {
    return [...this.counts] as StarCounts;
  }
}
