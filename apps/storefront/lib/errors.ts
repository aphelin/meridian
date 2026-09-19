/** Shopper-facing error helpers for tRPC errors from the BFF (data carries the contracts code and correlation id). */

type ErrorData = { code?: string; status?: number; correlationId?: string; details?: unknown };
type ClientError = { message: string; data?: ErrorData | null } | null | undefined;

export function errorCode(error: ClientError): string | undefined {
  return error?.data?.code;
}

/** "Reference: <correlationId>" for server-side failures, so support can find the request in the logs. */
export function errorReference(error: ClientError): string | null {
  const data = error?.data;
  if (!data?.correlationId) return null;
  return (data.status ?? 500) >= 500 ? `Reference: ${data.correlationId}` : null;
}

/** First field message of a VALIDATION_FAILED error, else the error message. */
export function errorMessage(error: ClientError): string | undefined {
  if (!error) return undefined;
  const issues = (error.data?.details as { issues?: { message?: string }[] } | undefined)?.issues;
  return (error.data?.code === "VALIDATION_FAILED" && issues?.[0]?.message) || error.message;
}

/**
 * Field messages from a VALIDATION_FAILED error, keyed by form field: zod issues are matched on their path
 * ("request.customer.email") and domain errors on `details.field`. `fields` maps those server names to form keys.
 */
export function fieldErrorsOf<K extends string>(error: ClientError, fields: Record<string, K>): Partial<Record<K, string>> {
  const found: Partial<Record<K, string>> = {};
  if (error?.data?.code !== "VALIDATION_FAILED") return found;
  const details = error.data.details as { issues?: { path?: string; message?: string }[]; field?: string } | undefined;
  for (const issue of details?.issues ?? []) {
    const key = issue.path !== undefined ? fields[issue.path] : undefined;
    if (key && issue.message && !found[key]) found[key] = issue.message;
  }
  const key = details?.field ? fields[details.field] : undefined;
  if (key && !found[key]) found[key] = error.message;
  return found;
}
