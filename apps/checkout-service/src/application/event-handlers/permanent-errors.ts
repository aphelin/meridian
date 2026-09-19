import { DomainError } from "@meridian/kernel";
import { PermanentError } from "@meridian/nest-kit";

/** Domain errors that no retry can fix: the message goes to the DLQ at once. Outages and chaos stay retryable. */
const PERMANENT_CODES = new Set(["NOT_FOUND", "VALIDATION_FAILED", "ORDER_NOT_PAYABLE", "INVALID_TRANSITION"]);

export function asPermanentWhenUnfixable(error: unknown): unknown {
  if (error instanceof DomainError && PERMANENT_CODES.has(error.code)) return new PermanentError(error.message, error.details, { cause: error });
  return error;
}
