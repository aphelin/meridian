import { describe, expect, it } from "vitest";
import { RatingSummary } from "./rating-summary";

describe("RatingSummary", () => {
  it("rating average is null without ratings and rounds to one decimal", () => {
    expect(RatingSummary.empty().average).toBeNull();
    const summary = RatingSummary.empty().add(5).add(4).add(4);
    expect(summary.average).toBe(4.3);
    expect(summary.count).toBe(3);
  });

  it("rating distribution indexes one star at 0 and five stars at 4", () => {
    expect(RatingSummary.empty().add(4).distribution).toEqual([0, 0, 0, 1, 0]);
    expect(RatingSummary.of([1, 0, 0, 0, 2]).average).toBe(3.7);
  });

  it("rejects ratings outside 1–5", () => {
    expect(() => RatingSummary.empty().add(0)).toThrow(/1 to 5/);
    expect(() => RatingSummary.empty().add(6)).toThrow(/1 to 5/);
    expect(() => RatingSummary.empty().add(2.5)).toThrow(/1 to 5/);
  });
});
