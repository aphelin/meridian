import { ConflictError } from "@meridian/kernel";

/** A save lost an optimistic-concurrency race: the aggregate changed since it was loaded. Callers reload and retry. */
export class ConcurrencyConflictError extends ConflictError {
  constructor(aggregateType: string, id: string) {
    super("This record was changed at the same time. Please try again.", { aggregateType, id });
    this.name = "ConcurrencyConflictError";
  }
}

export const isConcurrencyConflict = (error: unknown): error is ConcurrencyConflictError =>
  error instanceof ConcurrencyConflictError || (error instanceof Error && error.name === "ConcurrencyConflictError");
