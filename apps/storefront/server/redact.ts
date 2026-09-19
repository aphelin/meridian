export const REDACTED = "[redacted]";

/** Keys whose values are secrets or carry one-time links (verifyUrl, resetUrl, confirmUrl, orderUrl, …). */
const SECRET_KEY = /token|secret|password|Url$/i;
/** A string that embeds a one-time credential in a query string, whatever key it sits under. */
const SECRET_QUERY = /[?&](token|access|secret|password)=/i;
const MAX_DEPTH = 32;

/**
 * Deep copy of `value` with every value under a secret-looking key replaced by "[redacted]", plus any string that
 * embeds a token in a URL query. Used on dead-letter payloads before they leave the BFF.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (typeof value === "string") return SECRET_QUERY.test(value) ? REDACTED : value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? REDACTED : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}
