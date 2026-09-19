import { describe, expect, it } from "vitest";
import { meta, snapshot } from "../test-support/fixtures";
import { SearchDocument } from "./search-document";

describe("SearchDocument", () => {
  it("derives facet values from the snapshot: materials include variant materials, colours come from variants", () => {
    const doc = SearchDocument.fromSnapshot(snapshot({ materials: ["Oak"] }), meta("2026-09-01T10:00:00Z")).toProps();
    expect(doc.materials).toEqual(["oak", "wool"]);
    expect(doc.colors).toEqual(["neutral", "grey"]);
    expect(doc.skus).toEqual(["HOLT-OAT", "HOLT-CHA"]);
    expect(doc.variantLabels).toEqual(["Oatmeal wool", "Charcoal wool"]);
  });

  it("is in stock only when not sold out and any variant is available (amendment 1p)", () => {
    const at = meta("2026-09-01T10:00:00Z");
    const known = (map: Record<string, boolean>) => (sku: string) => map[sku];
    expect(SearchDocument.fromSnapshot(snapshot(), at).inStock(known({}))).toBe(true);
    expect(SearchDocument.fromSnapshot(snapshot(), at).inStock(known({ "HOLT-OAT": false }))).toBe(true);
    expect(SearchDocument.fromSnapshot(snapshot(), at).inStock(known({ "HOLT-OAT": false, "HOLT-CHA": false }))).toBe(false);
    const soldOut = SearchDocument.fromSnapshot(snapshot({ soldOut: true }), at);
    expect(soldOut.toProps().soldOut).toBe(true);
    expect(soldOut.inStock(known({ "HOLT-OAT": true, "HOLT-CHA": true }))).toBe(false);
    const legacy = { ...snapshot() } as Partial<ReturnType<typeof snapshot>>;
    delete legacy.soldOut;
    expect(SearchDocument.fromSnapshot(legacy as never, at).soldOut).toBe(false);
  });

  it("rejects snapshots that break read-model invariants", () => {
    expect(() => SearchDocument.fromSnapshot(snapshot({ priceCents: -1 }), meta("2026-09-01T10:00:00Z"))).toThrow(/price/);
    expect(() => SearchDocument.fromSnapshot(snapshot({ slug: "Bad Slug" }), meta("2026-09-01T10:00:00Z"))).toThrow(/slug/);
    expect(() => SearchDocument.fromSnapshot(snapshot({ updatedAt: "nope" }), meta("2026-09-01T10:00:00Z"))).toThrow(/timestamps/);
  });

  it("only published products are searchable", () => {
    expect(SearchDocument.fromSnapshot(snapshot(), meta("2026-09-01T10:00:00Z")).searchable).toBe(true);
    expect(SearchDocument.fromSnapshot(snapshot({ status: "draft" }), meta("2026-09-01T10:00:00Z")).searchable).toBe(false);
  });

  it("a newer snapshot supersedes, a stale one does not", () => {
    const current = SearchDocument.fromSnapshot(snapshot({ updatedAt: "2026-09-02T00:00:00Z" }), meta("2026-09-02T00:00:01Z"));
    const newer = SearchDocument.fromSnapshot(snapshot({ updatedAt: "2026-09-03T00:00:00Z", priceCents: 1 }), meta("2026-09-03T00:00:01Z"));
    const stale = SearchDocument.fromSnapshot(snapshot({ updatedAt: "2026-09-01T00:00:00Z" }), meta("2026-09-01T00:00:01Z"));
    expect(newer.supersedes(current)).toBe(true);
    expect(stale.supersedes(current)).toBe(false);
    expect(current.supersedes(null)).toBe(true);
  });

  it("an equal snapshot version is decided by event time (idempotent redelivery applies, older event does not)", () => {
    const current = SearchDocument.fromSnapshot(snapshot({ ratingCount: 3 }), meta("2026-09-05T00:00:00Z"));
    expect(SearchDocument.fromSnapshot(snapshot({ ratingCount: 3 }), meta("2026-09-05T00:00:00Z")).supersedes(current)).toBe(true);
    expect(SearchDocument.fromSnapshot(snapshot({ ratingCount: 0 }), meta("2026-09-04T00:00:00Z")).supersedes(current)).toBe(false);
  });

  it("an archived tombstone is not resurrected by a replayed old snapshot but is by a later republish", () => {
    const published = SearchDocument.fromSnapshot(snapshot(), meta("2026-09-01T10:00:00Z"));
    const archived = published.archive(meta("2026-09-02T10:00:00Z"))!;
    expect(archived.status).toBe("archived");
    expect(archived.searchable).toBe(false);
    expect(SearchDocument.fromSnapshot(snapshot(), meta("2026-09-01T10:00:00Z")).supersedes(archived)).toBe(false);
    expect(SearchDocument.fromSnapshot(snapshot(), meta("2026-09-03T10:00:00Z")).supersedes(archived)).toBe(true);
  });

  it("ignores an archive fact older than the indexed document", () => {
    const published = SearchDocument.fromSnapshot(snapshot(), meta("2026-09-05T10:00:00Z"));
    expect(published.archive(meta("2026-09-01T10:00:00Z"))).toBeNull();
  });
});
