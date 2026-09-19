import { PermanentError } from "@meridian/nest-kit";
import { DomainError } from "@meridian/kernel";
import type { z } from "zod";

/** Payloads that do not match the contract can never succeed: straight to the DLQ/DLT. */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown, name: string): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw new PermanentError(`Invalid ${name} payload`, { issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  return result.data;
}

const PERMANENT_CODES = new Set(["VALIDATION_FAILED", "NOT_FOUND", "INVALID_TRANSITION", "OUT_OF_STOCK"]);

/** Business-rule failures will fail the same way on every retry; infrastructure errors are retried. */
export async function asPermanentOnRuleViolation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError && PERMANENT_CODES.has(error.code)) throw new PermanentError(error.message, error.details, { cause: error });
    throw error;
  }
}
