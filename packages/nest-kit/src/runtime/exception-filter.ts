import { type ApiError, type ErrorCode, ErrorCodes, HttpHeaders } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { RequestContext } from "../core/context";
import { createLogger } from "../core/logger";
import { errorCodeForStatus, UpstreamHttpError } from "../http/errors";
import { validationFailed } from "../validation";

/** HTTP status for every contracts ErrorCode. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
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

export function statusForErrorCode(code: ErrorCode): number {
  return ERROR_STATUS[code] ?? 500;
}

const INTERNAL_MESSAGE = "Something went wrong on our side. Please try again.";
const log = createLogger("ExceptionFilter");

export interface MappedError {
  status: number;
  body: ApiError;
}

const isErrorCode = (value: unknown): value is ErrorCode => typeof value === "string" && (ErrorCodes as readonly string[]).includes(value);

/** Errors raised by body-parser / http-errors before Nest routing: they carry an explicit 4xx status. */
function clientHttpError(error: unknown): { status: number; message: string } | null {
  if (error === null || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown; expose?: unknown; type?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : typeof candidate.statusCode === "number" ? candidate.statusCode : NaN;
  if (!(status >= 400 && status < 500)) return null;
  if (candidate.type === "entity.too.large") return { status, message: "Request body is too large" };
  if (candidate.type === "entity.parse.failed") return { status, message: "Request body is not valid JSON" };
  return { status, message: candidate.expose === true && typeof candidate.message === "string" ? candidate.message : "Invalid request" };
}

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return typeof message === "string" ? message : exception.message;
}

/**
 * Maps any thrown value to a contracts ApiError: DomainError by code, zod issues to 400 VALIDATION_FAILED, Nest
 * HttpExceptions by status, upstream error responses with their own status, and everything else to a 500 that
 * never exposes internals. The body always carries the request's correlation id.
 */
export function toApiError(error: unknown, correlationId = RequestContext.correlationId() ?? randomUUID()): MappedError {
  const build = (status: number, code: ErrorCode, message: string, details?: unknown): MappedError => ({
    status,
    body: { statusCode: status, code, message, correlationId, ...(details === undefined ? {} : { details }) },
  });

  if (error instanceof ZodError) error = validationFailed(error.issues);
  if (error instanceof UpstreamHttpError) {
    const status = error.status >= 400 && error.status <= 599 ? error.status : 502;
    return build(status, error.code, error.message, error.status < 500 ? error.details : undefined);
  }
  if (error instanceof DomainError) {
    const status = statusForErrorCode(error.code);
    return build(status, error.code, status >= 500 && error.code === "INTERNAL" ? INTERNAL_MESSAGE : error.message, error.details);
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const response = error.getResponse();
    const ownCode = typeof response === "object" && response !== null ? (response as { code?: unknown }).code : undefined;
    const code = isErrorCode(ownCode) ? ownCode : errorCodeForStatus(status);
    return build(status, code, status >= 500 ? INTERNAL_MESSAGE : httpExceptionMessage(error));
  }
  const client = clientHttpError(error);
  if (client) return build(client.status, errorCodeForStatus(client.status), client.message);
  return build(500, "INTERNAL", INTERNAL_MESSAGE);
}

type HttpResponse = {
  headersSent: boolean;
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
  getHeader(name: string): unknown;
  setHeader(name: string, value: string): unknown;
};
type HttpRequest = { method?: string; originalUrl?: string; url?: string; headers: Record<string, string | string[] | undefined> };

function logMapped(mapped: MappedError, error: unknown, req: HttpRequest | undefined) {
  const fields = { status: mapped.status, code: mapped.body.code, method: req?.method, path: req?.originalUrl ?? req?.url };
  if (mapped.status >= 500 && mapped.body.code === "INTERNAL") log.error("unhandled error", { ...fields, error });
  else if (mapped.status >= 500) log.warn("request failed", { ...fields, message: error instanceof Error ? error.message : String(error) });
  else log.debug("request rejected", { ...fields, message: mapped.body.message });
}

/** Writes the mapped error; shared by the Nest filter and the Express error middleware for pre-routing failures. */
export function sendApiError(error: unknown, req: HttpRequest | undefined, res: HttpResponse): void {
  const header = res.getHeader(HttpHeaders.correlationId);
  const mapped = toApiError(error, RequestContext.correlationId() ?? (typeof header === "string" && header ? header : randomUUID()));
  logMapped(mapped, error, req);
  if (res.headersSent) return;
  res.setHeader(HttpHeaders.correlationId, mapped.body.correlationId);
  res.status(mapped.status).json(mapped.body);
}

@Catch()
export class KitExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") throw exception;
    const http = host.switchToHttp();
    sendApiError(exception, http.getRequest<HttpRequest>(), http.getResponse<HttpResponse>());
  }
}
