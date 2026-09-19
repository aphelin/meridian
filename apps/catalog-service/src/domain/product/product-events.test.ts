import { describe, expect, it } from "vitest";
import { NOW } from "../../testing/in-memory";
import { collapseProductEvents, type ProductEvent } from "./product-events";

const updated = (...changed: string[]): ProductEvent => ({ name: "ProductUpdated", aggregateType: "Product", aggregateId: "p", payload: { changed: changed as never }, occurredAt: NOW });
const published: ProductEvent = { name: "ProductPublished", aggregateType: "Product", aggregateId: "p", payload: {}, occurredAt: NOW };
const archived: ProductEvent = { name: "ProductArchived", aggregateType: "Product", aggregateId: "p", payload: { slug: "s" }, occurredAt: NOW };

describe("collapseProductEvents", () => {
  it("merges several updates into one ProductUpdated with the union of changed fields", () => {
    expect(collapseProductEvents([updated("priceCents", "name"), updated("variants", "priceCents")])).toEqual({ kind: "updated", changed: ["priceCents", "name", "variants"] });
  });

  it("a publish absorbs updates in the same unit of work; the last lifecycle event wins", () => {
    expect(collapseProductEvents([updated("variants"), published, updated("rating")])).toEqual({ kind: "published" });
    expect(collapseProductEvents([published, archived])).toEqual({ kind: "archived" });
    expect(collapseProductEvents([archived, published])).toEqual({ kind: "published" });
    expect(collapseProductEvents([])).toBeNull();
  });
});
