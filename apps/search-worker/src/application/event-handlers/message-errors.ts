import { DomainError } from "@meridian/kernel";
import { PermanentError } from "@meridian/nest-kit";
import type { z } from "zod";

/** Payloads that do not match the contract can never succeed: straight to the group's DLT. */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown, name: string): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw new PermanentError(`Invalid ${name} payload`, { issues: result.error.issues.slice(0, 20).map((i) => `${i.path.join(".")}: ${i.message}`) });
  return result.data;
}

/** A fact the domain rejects will be rejected on every retry; infrastructure failures are retried. */
export async function permanentOnValidation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION_FAILED") throw new PermanentError(error.message, error.details, { cause: error });
    throw error;
  }
}
