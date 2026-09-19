import { describe, expect, it } from "vitest";
import { applyProductChange, displayProductName, type ProductDirectoryEntry } from "./product-directory";

const at = (iso: string) => new Date(iso);
const entry = (over: Partial<ProductDirectoryEntry> = {}): ProductDirectoryEntry => ({ productId: "p1", slug: "holt-sofa", name: "Holt", heroImageUrl: "/h.jpg", archived: false, versionAt: at("2026-09-02T00:00:00Z"), ...over });
const snapshot = (iso: string, name = "Holt 2") => ({ kind: "snapshot" as const, productId: "p1", slug: "holt-sofa", name, heroImageUrl: "/h2.jpg", archived: false, versionAt: at(iso) });

describe("product directory ordering rules", () => {
  it("product directory: newer snapshot replaces, older or equal snapshot is ignored", () => {
    expect(applyProductChange(entry(), snapshot("2026-09-03T00:00:00Z"))).toMatchObject({ name: "Holt 2", heroImageUrl: "/h2.jpg" });
    expect(applyProductChange(entry(), snapshot("2026-09-01T00:00:00Z"))).toBeNull();
    expect(applyProductChange(entry(), snapshot("2026-09-02T00:00:00Z"))).toBeNull();
  });

  it("product directory: archive at or after the version marks archived; a duplicate or older archive changes nothing", () => {
    const archive = (iso: string) => ({ kind: "archived" as const, productId: "p1", slug: "holt-sofa", versionAt: at(iso) });
    expect(applyProductChange(entry(), archive("2026-09-02T00:00:00Z"))).toMatchObject({ archived: true, name: "Holt" });
    expect(applyProductChange(entry({ archived: true }), archive("2026-09-02T00:00:00Z"))).toBeNull();
    expect(applyProductChange(entry(), archive("2026-09-01T00:00:00Z"))).toBeNull();
    expect(applyProductChange(null, archive("2026-09-01T00:00:00Z"))).toMatchObject({ name: null, archived: true });
  });

  it("product directory: display name falls back to the slug only for unknown products", () => {
    expect(displayProductName(entry(), "holt-sofa")).toBe("Holt");
    expect(displayProductName(null, "holt-sofa")).toBe("Holt sofa");
    expect(displayProductName(entry({ name: null }), "holt-sofa")).toBe("Holt sofa");
  });
});
