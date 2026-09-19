import { ErrorCodes, type ErrorCode } from "@meridian/contracts";

/** HTTP status for every contracts error code (mirrors the services' exception filter). */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  CAPTCHA_REQUIRED: 400,
  UNAUTHORIZED: 401,
  TOKEN_INVALID: 400,
  TOKEN_EXPIRED: 400,
  FORBIDDEN: 403,
  CAPTCHA_INVALID: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  OUT_OF_STOCK: 409,
  IDEMPOTENCY_IN_FLIGHT: 409,
  ORDER_NOT_CANCELLABLE: 409,
  ORDER_NOT_RETURNABLE: 409,
  ORDER_NOT_PAYABLE: 409,
  REVIEW_NOT_ALLOWED: 403,
  COUPON_INVALID: 422,
  COUPON_EXPIRED: 422,
  COUPON_MIN_BASKET: 422,
  COUPON_EXHAUSTED: 422,
  COUPON_ALREADY_USED: 422,
  IDEMPOTENCY_MISMATCH: 422,
  RATE_LIMITED: 429,
  SANDBOX_ONLY: 400,
  CHAOS_INJECTED: 503,
  UPSTREAM_UNAVAILABLE: 503,
  CAPTCHA_UNAVAILABLE: 503,
  INTERNAL: 500,
};

const KNOWN = new Set<string>(ErrorCodes);

export const GENERIC_SERVER_MESSAGE = "Something went wrong on our side.";

function codeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502 || status === 503 || status === 504) return "UPSTREAM_UNAVAILABLE";
  return "INTERNAL";
}

export type UnavailableReason = "timeout" | "network" | "breaker-open";

/** The one error type procedures throw: a contracts error code with its status, correlation id and optional details. */
export class ServiceError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly correlationId: string | undefined;
  readonly details: unknown;
  /** Upstream service that produced the error, when any (for logs). */
  readonly service: string | undefined;
  readonly reason: UnavailableReason | undefined;

  constructor(init: { status?: number; code: ErrorCode; message: string; correlationId?: string; details?: unknown; service?: string; reason?: UnavailableReason; cause?: unknown }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "ServiceError";
    this.code = init.code;
    this.status = init.status ?? STATUS_BY_CODE[init.code];
    this.correlationId = init.correlationId;
    this.details = init.details;
    this.service = init.service;
    this.reason = init.reason;
  }

  static unavailable(service: string, reason: UnavailableReason, correlationId?: string, cause?: unknown): ServiceError {
    return new ServiceError({ code: "UPSTREAM_UNAVAILABLE", message: GENERIC_SERVER_MESSAGE, correlationId, service, reason, cause });
  }

  static unauthorized(message = "Please sign in to continue."): ServiceError {
    return new ServiceError({ code: "UNAUTHORIZED", message });
  }

  static forbidden(message = "You do not have access to this."): ServiceError {
    return new ServiceError({ code: "FORBIDDEN", message });
  }

  static notFound(message = "We couldn’t find that."): ServiceError {
    return new ServiceError({ code: "NOT_FOUND", message });
  }

  /** Builds the error for an upstream error response, trusting its `ApiError` body only where it is well-formed. */
  static fromUpstream(service: string, status: number, text: string, fallbackCorrelationId?: string): ServiceError {
    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = text ? JSON.parse(text) : null;
      body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    const rawCode = typeof body?.code === "string" ? body.code : undefined;
    const code: ErrorCode = rawCode && KNOWN.has(rawCode) ? (rawCode as ErrorCode) : codeForStatus(status);
    const correlationId = typeof body?.correlationId === "string" ? body.correlationId : fallbackCorrelationId;
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((m): m is string => typeof m === "string").join(". ")
      : typeof rawMessage === "string"
        ? rawMessage
        : "";
    const serverSide = status >= 500;
    return new ServiceError({
      // Upstream 5xx collapse to the generic shopper message; a status outside the error range keeps its mapped status.
      status: status >= 400 && status <= 599 ? status : STATUS_BY_CODE[code],
      code,
      message: serverSide || !message ? (serverSide ? GENERIC_SERVER_MESSAGE : defaultMessage(code)) : message.slice(0, 500),
      correlationId,
      details: body?.details,
      service,
    });
  }
}

function defaultMessage(code: ErrorCode): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Please sign in to continue.";
    case "FORBIDDEN":
      return "You do not have access to this.";
    case "NOT_FOUND":
      return "We couldn’t find that.";
    case "RATE_LIMITED":
      return "Too many attempts in a short time. Wait a minute and try again.";
    default:
      return "The request could not be completed.";
  }
}

/** Codes whose `details` are safe and useful for the browser. */
export function exposesDetails(code: ErrorCode): boolean {
  return code === "VALIDATION_FAILED" || code === "OUT_OF_STOCK" || code.startsWith("COUPON_");
}

export type TrpcErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_CONTENT"
  | "TOO_MANY_REQUESTS"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR";

/** tRPC error code whose HTTP status equals `status`, so the wire status matches the contracts status. */
export function trpcCodeForStatus(status: number): TrpcErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE_CONTENT";
    case 429:
      return "TOO_MANY_REQUESTS";
    case 502:
    case 503:
    case 504:
      return "SERVICE_UNAVAILABLE";
    default:
      return status >= 400 && status < 500 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR";
  }
}

/** Browser-facing error data: contracts code, status, correlation id and (only for safe codes) details. */
export interface BrowserErrorData {
  code: ErrorCode;
  status: number;
  correlationId: string;
  details?: unknown;
}

type Issue = { path?: readonly (PropertyKey | { key: PropertyKey })[]; message: string };

function isZodLike(value: unknown): value is { issues: Issue[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { issues?: unknown }).issues));
}

/**
 * Maps any error raised while handling a procedure to what the browser may see. Upstream and local ServiceErrors keep
 * their code; input validation becomes VALIDATION_FAILED with the field issues; everything else is INTERNAL with a
 * generic message. 5xx messages never leak internals.
 */
export function toBrowserError(error: unknown, correlationId: string): { message: string; data: BrowserErrorData } {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const service = error instanceof ServiceError ? error : cause instanceof ServiceError ? cause : null;
  if (service) {
    const status = service.status;
    return {
      message: status >= 500 ? GENERIC_SERVER_MESSAGE : service.message,
      data: {
        code: service.code,
        status,
        correlationId: service.correlationId ?? correlationId,
        ...(exposesDetails(service.code) && service.details !== undefined ? { details: service.details } : {}),
      },
    };
  }
  const zod = isZodLike(cause) ? cause : isZodLike(error) ? error : null;
  if (zod) {
    const issues = zod.issues.map((i) => ({
      path: (i.path ?? []).map((p) => String(typeof p === "object" && p !== null ? p.key : p)).join("."),
      message: i.message,
    }));
    return {
      message: issues[0]?.message ? `Check the form: ${issues[0].message}` : "Check the form and try again.",
      data: { code: "VALIDATION_FAILED", status: 400, correlationId, details: { issues } },
    };
  }
  const trpcCode = (error as { code?: unknown } | null)?.code;
  if (trpcCode === "PARSE_ERROR" || trpcCode === "BAD_REQUEST") {
    return { message: "The request could not be read.", data: { code: "VALIDATION_FAILED", status: 400, correlationId } };
  }
  if (trpcCode === "NOT_FOUND" || trpcCode === "METHOD_NOT_SUPPORTED") {
    return { message: "We couldn’t find that.", data: { code: "NOT_FOUND", status: 404, correlationId } };
  }
  if (trpcCode === "PAYLOAD_TOO_LARGE" || trpcCode === "UNSUPPORTED_MEDIA_TYPE") {
    return { message: "The request could not be read.", data: { code: "VALIDATION_FAILED", status: 400, correlationId } };
  }
  return { message: GENERIC_SERVER_MESSAGE, data: { code: "INTERNAL", status: 500, correlationId } };
}
