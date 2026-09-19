import { ErrorCodes } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChaosError } from "../core/chaos";
import { RequestContext } from "../core/context";
import { UpstreamHttpError, UpstreamUnavailableError } from "../http/errors";
import { ERROR_STATUS, toApiError } from "./exception-filter";

describe("exception filter error mapping", () => {
  it("error mapping covers every contracts ErrorCode with the PLAN status table", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ErrorCodes].sort());
    const expected: Record<string, number> = {
      VALIDATION_FAILED: 400, CAPTCHA_REQUIRED: 400, UNAUTHORIZED: 401, TOKEN_INVALID: 400, TOKEN_EXPIRED: 400, FORBIDDEN: 403,
      CAPTCHA_INVALID: 403, NOT_FOUND: 404, CONFLICT: 409, INVALID_TRANSITION: 409, OUT_OF_STOCK: 409, IDEMPOTENCY_IN_FLIGHT: 409,
      ORDER_NOT_CANCELLABLE: 409, ORDER_NOT_RETURNABLE: 409, ORDER_NOT_PAYABLE: 409, REVIEW_NOT_ALLOWED: 403, COUPON_INVALID: 422,
      COUPON_EXPIRED: 422, COUPON_MIN_BASKET: 422, COUPON_EXHAUSTED: 422, COUPON_ALREADY_USED: 422, IDEMPOTENCY_MISMATCH: 422,
      RATE_LIMITED: 429, SANDBOX_ONLY: 400, CHAOS_INJECTED: 503, UPSTREAM_UNAVAILABLE: 503, CAPTCHA_UNAVAILABLE: 503, INTERNAL: 500,
    };
    for (const code of ErrorCodes) {
      const mapped = toApiError(new DomainError(code, "boom"), "corr-1");
      expect(mapped.status, code).toBe(expected[code]);
      expect(mapped.body).toMatchObject({ statusCode: expected[code], code, correlationId: "corr-1" });
    }
  });

  it("error mapping keeps DomainError details and uses the RequestContext correlation id", () => {
    const mapped = RequestContext.run({ correlationId: "ctx-corr" }, () => toApiError(new DomainError("OUT_OF_STOCK", "Sold out", { sku: "A", available: 0 })));
    expect(mapped.body).toEqual({ statusCode: 409, code: "OUT_OF_STOCK", message: "Sold out", correlationId: "ctx-corr", details: { sku: "A", available: 0 } });
  });

  it("error mapping turns zod errors into 400 VALIDATION_FAILED with issues", () => {
    const result = z.object({ qty: z.int() }).safeParse({ qty: "x" });
    const mapped = toApiError(result.error, "c");
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("VALIDATION_FAILED");
    expect(mapped.body.details).toMatchObject({ issues: [{ path: "qty" }] });
  });

  it("error mapping maps Nest HttpExceptions by status", () => {
    expect(toApiError(new NotFoundException("Cannot GET /x"), "c").body).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: "Cannot GET /x" });
    expect(toApiError(new ForbiddenException(), "c").body).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(toApiError(new BadRequestException(["a", "b"]), "c").body).toMatchObject({ statusCode: 400, code: "VALIDATION_FAILED", message: "a, b" });
    expect(toApiError(new HttpException("teapot internals", 500), "c").body).toMatchObject({ statusCode: 500, code: "INTERNAL" });
    expect(toApiError(new HttpException("teapot internals", 500), "c").body.message).not.toContain("teapot");
  });

  it("error mapping hides unknown errors behind 500 INTERNAL", () => {
    const mapped = toApiError(new Error("password=hunter2 at db.ts:12"), "c");
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe("INTERNAL");
    expect(JSON.stringify(mapped.body)).not.toContain("hunter2");
  });

  it("error mapping answers body-parser failures with their 4xx status", () => {
    const tooLarge = Object.assign(new Error("request entity too large"), { status: 413, statusCode: 413, expose: true, type: "entity.too.large" });
    expect(toApiError(tooLarge, "c")).toMatchObject({ status: 413, body: { code: "VALIDATION_FAILED", message: "Request body is too large" } });
    const malformed = Object.assign(new SyntaxError("Unexpected token"), { status: 400, expose: true, type: "entity.parse.failed" });
    expect(toApiError(malformed, "c")).toMatchObject({ status: 400, body: { code: "VALIDATION_FAILED" } });
  });

  it("error mapping passes upstream 4xx through and maps unavailability and chaos to 503", () => {
    const upstream = UpstreamHttpError.fromResponse("catalog", 422, JSON.stringify({ statusCode: 422, code: "COUPON_INVALID", message: "Unknown coupon", correlationId: "x" }));
    expect(toApiError(upstream, "c")).toMatchObject({ status: 422, body: { code: "COUPON_INVALID", message: "Unknown coupon" } });
    const upstream5xx = UpstreamHttpError.fromResponse("catalog", 500, "<html>stack trace</html>");
    expect(toApiError(upstream5xx, "c")).toMatchObject({ status: 500, body: { code: "INTERNAL" } });
    expect(toApiError(upstream5xx, "c").body.message).not.toContain("stack");
    expect(toApiError(new UpstreamUnavailableError("inventory", "timeout"), "c")).toMatchObject({ status: 503, body: { code: "UPSTREAM_UNAVAILABLE" } });
    expect(toApiError(new ChaosError("smtp.send", "fail"), "c")).toMatchObject({ status: 503, body: { code: "CHAOS_INJECTED" } });
  });
});
