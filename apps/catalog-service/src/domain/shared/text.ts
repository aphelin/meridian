import { ensure } from "@meridian/kernel";

/** Trimmed text between `min` and `max` characters, or a VALIDATION_FAILED error naming the field. */
export function requiredText(value: unknown, field: string, max: number, min = 1): string {
  const text = typeof value === "string" ? value.trim() : "";
  ensure(text.length >= min && text.length <= max, "VALIDATION_FAILED", `${field} must be ${min > 1 ? `${min}–${max}` : `1–${max}`} characters.`, { field });
  return text;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  ensure(text.length <= max, "VALIDATION_FAILED", `${field} must be at most ${max} characters.`, { field });
  return text;
}

const ASSET_PATH = /^(\/[^\s]*|https?:\/\/[^\s]+)$/;

/** A public asset reference: a site-relative path ("/products/x.jpg") or an absolute http(s) URL. */
export function assetUrl(value: unknown, field: string): string {
  const url = requiredText(value, field, 500);
  ensure(ASSET_PATH.test(url), "VALIDATION_FAILED", `${field} must be a site path starting with "/" or an http(s) URL.`, { field });
  return url;
}
