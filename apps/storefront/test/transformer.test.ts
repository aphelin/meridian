import { describe, expect, it } from "vitest";
import { transformer } from "@/lib/transformer";

describe("wire transformer", () => {
  it("round-trips superjson values and passes a bare null through as JSON null", () => {
    const value = { at: new Date("2026-01-01T00:00:00Z"), n: null, list: [1, undefined] };
    expect(transformer.deserialize(JSON.parse(JSON.stringify(transformer.serialize(value))))).toEqual(value);
    expect(transformer.serialize(null)).toBeNull();
    expect(transformer.deserialize(null)).toBeNull();
    expect(transformer.deserialize({ json: null })).toBeNull();
  });
});
