import { describe, expect, it } from "vitest";
import { afterCursor, decodeCursor, encodeCursor } from "./cursor";

describe("keyset cursor", () => {
  it("cursor round-trips createdAt and id and selects rows strictly after it", () => {
    const position = { createdAt: new Date("2026-09-17T10:00:00.123Z"), id: "b0c1" };
    const raw = encodeCursor(position);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(raw)).toEqual(position);
    expect(afterCursor(position)).toEqual({ OR: [{ createdAt: { lt: position.createdAt } }, { createdAt: position.createdAt, id: { lt: "b0c1" } }] });
    expect(afterCursor(null)).toEqual({});
  });

  it("malformed cursor is VALIDATION_FAILED", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(() => decodeCursor("not-a-cursor")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => decodeCursor(Buffer.from(JSON.stringify(["yesterday", "x"])).toString("base64url"))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});
