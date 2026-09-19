import { describe, expect, it } from "vitest";
import { auditEntry } from "./audit-entry";

const at = new Date("2026-09-17T10:00:00Z");

describe("audit entries", () => {
  it("audit entry for an order belongs to that order's trail", () => {
    const entry = auditEntry({ action: "order.transition", actorId: "admin-1", subjectType: "order", subjectId: "order-1", at, meta: { from: "paid", to: "fulfilling" } });
    expect(entry).toMatchObject({ action: "order.transition", actorId: "admin-1", orderId: "order-1", at, meta: { from: "paid", to: "fulfilling" } });
    expect(entry.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("audit entry for a coupon has no order and copies its meta", () => {
    const meta = { changed: { active: false } };
    const entry = auditEntry({ action: "coupon.update", actorId: "admin-1", subjectType: "coupon", subjectId: "NORTH-10", at, meta });
    meta.changed.active = true;
    expect(entry).toMatchObject({ orderId: null, meta: { changed: { active: false } } });
  });

  it("audit entry requires an actor", () => {
    expect(() => auditEntry({ action: "order.refund", actorId: " ", subjectType: "order", subjectId: "o", at, meta: {} })).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
  });
});
