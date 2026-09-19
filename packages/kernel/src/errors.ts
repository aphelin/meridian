import type { ErrorCode } from "@meridian/contracts";

/**
 * A rule of the domain was broken. The code maps to an HTTP status in nest-kit;
 * the message is written for the shopper or admin who triggered it.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_FAILED", message, details);
    this.name = "ValidationError";
  }
}

/** Throws a DomainError with `code` unless `condition` holds. */
export function ensure(condition: unknown, code: ErrorCode, message: string, details?: unknown): asserts condition {
  if (!condition) throw new DomainError(code, message, details);
}
