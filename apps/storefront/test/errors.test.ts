import { describe, expect, it } from "vitest";
import { GENERIC_SERVER_MESSAGE, ServiceError, toBrowserError, trpcCodeForStatus } from "@/server/errors";

describe("error mapping", () => {
  it("maps an upstream ApiError body to its contracts error code, status and correlation id", () => {
    const err = ServiceError.fromUpstream("checkout", 409, JSON.stringify({ statusCode: 409, code: "OUT_OF_STOCK", message: "Sold out", correlationId: "c-1", details: { sku: "A", available: 0 } }));
    expect(err).toMatchObject({ status: 409, code: "OUT_OF_STOCK", message: "Sold out", correlationId: "c-1", details: { sku: "A", available: 0 } });
  });

  it("maps unknown or missing upstream error codes by status", () => {
    expect(ServiceError.fromUpstream("x", 404, "not json").code).toBe("NOT_FOUND");
    expect(ServiceError.fromUpstream("x", 429, JSON.stringify({ code: "WHATEVER" })).code).toBe("RATE_LIMITED");
    expect(ServiceError.fromUpstream("x", 503, "").code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("never passes upstream 5xx messages to the browser", () => {
    const err = ServiceError.fromUpstream("x", 500, JSON.stringify({ code: "INTERNAL", message: "db password wrong at pg.ts:12" }));
    const out = toBrowserError(err, "corr");
    expect(out.message).toBe(GENERIC_SERVER_MESSAGE);
    expect(out.data).toEqual({ code: "INTERNAL", status: 500, correlationId: "corr" });
  });

  it("exposes details only for validation, stock and coupon error codes", () => {
    const coupon = new ServiceError({ code: "COUPON_MIN_BASKET", message: "Min basket", details: { minBasketCents: 50000 } });
    const forbidden = new ServiceError({ code: "FORBIDDEN", message: "No", details: { ownerId: "u1" } });
    expect(toBrowserError(coupon, "c").data.details).toEqual({ minBasketCents: 50000 });
    expect(toBrowserError(forbidden, "c").data).not.toHaveProperty("details");
  });

  it("maps zod input errors to VALIDATION_FAILED with field issues", () => {
    const zodLike = { code: "BAD_REQUEST", cause: { issues: [{ path: ["slugs"], message: "Too big" }] } };
    expect(toBrowserError(zodLike, "c")).toEqual({ message: "Check the form: Too big", data: { code: "VALIDATION_FAILED", status: 400, correlationId: "c", details: { issues: [{ path: "slugs", message: "Too big" }] } } });
  });

  it("maps unexpected crashes to INTERNAL with a generic message", () => {
    expect(toBrowserError(new TypeError("x is undefined"), "c")).toEqual({ message: GENERIC_SERVER_MESSAGE, data: { code: "INTERNAL", status: 500, correlationId: "c" } });
  });

  it("uses tRPC codes whose HTTP status equals the contracts status", () => {
    expect([400, 401, 403, 404, 409, 422, 429, 503, 500].map(trpcCodeForStatus)).toEqual([
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "UNPROCESSABLE_CONTENT",
      "TOO_MANY_REQUESTS",
      "SERVICE_UNAVAILABLE",
      "INTERNAL_SERVER_ERROR",
    ]);
  });
});
