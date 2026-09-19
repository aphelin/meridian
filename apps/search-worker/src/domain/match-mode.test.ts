import { describe, expect, it } from "vitest";
import { chooseMatchMode, didYouMeanFor, TYPO_SIMILARITY_THRESHOLD } from "./match-mode";
import { SearchText } from "./search-text";

describe("match mode and typo tolerance", () => {
  it("uses full text when the literal query matches", () => {
    expect(chooseMatchMode(SearchText.parse("wool sofa"), true)).toEqual({ kind: "full-text", tsquery: "wool & sofa:*" });
  });

  it("falls back to trigram similarity when full text matches nothing", () => {
    expect(chooseMatchMode(SearchText.parse("hollt"), false)).toEqual({ kind: "fuzzy", text: "hollt", threshold: TYPO_SIMILARITY_THRESHOLD });
    expect(TYPO_SIMILARITY_THRESHOLD).toBe(0.3);
  });

  it("browses everything without text", () => {
    expect(chooseMatchMode(null, false)).toEqual({ kind: "browse" });
  });

  it("offers did you mean only for the typo fallback", () => {
    expect(didYouMeanFor({ kind: "fuzzy", text: "hollt", threshold: 0.3 }, "Holt")).toBe("Holt");
    expect(didYouMeanFor({ kind: "fuzzy", text: "zzzz", threshold: 0.3 }, null)).toBeNull();
    expect(didYouMeanFor({ kind: "full-text", tsquery: "holt:*" }, "Holt")).toBeNull();
  });
});
