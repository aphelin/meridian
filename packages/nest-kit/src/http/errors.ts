import { type ErrorCode, ErrorCodes } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";

export type UnavailableReason = "timeout" | "network" | "breaker-open" | "overloaded" | "chaos" | "shutdown";

/** The upstream could not be reached in time (timeout, network failure, open breaker). Maps to 503 UPSTREAM_UNAVAILABLE. */
export class UpstreamUnavailableError extends DomainError {
  constructor(
    readonly upstream: string,
    readonly reason: UnavailableReason,
    options?: { cause?: unknown },
  ) {
    super("UPSTREAM_UNAVAILABLE", "A service we depend on is temporarily unavailable. Please try again shortly.", { upstream, reason });
    this.name = "UpstreamUnavailableError";
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

const isErrorCode = (value: unknown): value is ErrorCode => typeof value === "string" && (ErrorCodes as readonly string[]).includes(value);

/** Fallback code when an upstream error body is not a contracts ApiError. */
export function errorCodeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 413 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502 || status === 503 || status === 504) return "UPSTREAM_UNAVAILABLE";
  if (status >= 400 && status < 500) return "VALIDATION_FAILED";
  return "INTERNAL";
}

/**
 * The upstream answered with an error status. `code` and `message` come from its ApiError body when present, so a
 * 4xx from a downstream service surfaces to the caller unchanged; 5xx messages are replaced by a generic one.
 */
export class UpstreamHttpError extends DomainError {
  constructor(
    readonly status: number,
    code: ErrorCode,
    message: string,
    readonly body: unknown,
    readonly upstream = "upstream",
  ) {
    super(code, message, body !== null && typeof body === "object" && "details" in body ? (body as { details?: unknown }).details : undefined);
    this.name = "UpstreamHttpError";
  }

  static fromResponse(upstream: string, status: number, text: string): UpstreamHttpError {
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON error bodies (proxies, HTML error pages) keep the raw text.
    }
    const api = body !== null && typeof body === "object" ? (body as { code?: unknown; message?: unknown }) : {};
    const code = isErrorCode(api.code) ? api.code : errorCodeForStatus(status);
    const message =
      status < 500 && typeof api.message === "string" && api.message
        ? api.message
        : status < 500
          ? "The request was rejected by a downstream service."
          : "A service we depend on failed. Please try again shortly.";
    return new UpstreamHttpError(status, code, message, body, upstream);
  }
}
