import { ValidationError } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseWith, type ValidationDetails } from "./index";

const schema = z.object({ email: z.email(), qty: z.int().min(1).max(5), note: z.string().optional() });

describe("zod validation", () => {
  it("parseWith returns the parsed zod output for valid input", () => {
    expect(parseWith(schema, { email: "a@b.co", qty: 2, extra: true })).toEqual({ email: "a@b.co", qty: 2 });
  });

  it("parseWith throws VALIDATION_FAILED with every issue in details", () => {
    let caught: unknown;
    try {
      parseWith(schema, { email: "nope", qty: 9 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const error = caught as ValidationError;
    expect(error.code).toBe("VALIDATION_FAILED");
    const { issues } = error.details as ValidationDetails;
    expect(issues.map((i) => i.path).sort()).toEqual(["email", "qty"]);
    expect(error.message).toMatch(/^Invalid request: (email|qty): /);
  });

  it("zod validation reports nested paths joined with dots", () => {
    const nested = z.object({ lines: z.array(z.object({ sku: z.string().min(1) })) });
    try {
      parseWith(nested, { lines: [{ sku: "" }] });
      throw new Error("expected failure");
    } catch (error) {
      expect(((error as ValidationError).details as ValidationDetails).issues[0].path).toBe("lines.0.sku");
    }
  });
});
