import { DomainError } from "@meridian/kernel";
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { RequestContext, createLogger } from "../../../src/core";

const log = createLogger("FixtureErrors");
const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400, CONFLICT: 409, CHAOS_INJECTED: 503 };

/** Minimal stand-in for the runtime leaf's exception filter: DomainError codes and HttpExceptions keep their status. */
@Catch()
export class FixtureErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = RequestContext.correlationId() ?? null;
    if (error instanceof DomainError) {
      res.status(STATUS[error.code] ?? 400).json({ code: error.code, message: error.message, correlationId });
      return;
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      res.status(error.getStatus()).json({ code: "HTTP_ERROR", message: typeof body === "string" ? body : ((body as { message?: unknown }).message ?? error.message), correlationId });
      return;
    }
    log.error("unhandled error", { error });
    res.status(500).json({ code: "INTERNAL", message: "Internal error", correlationId });
  }
}
