import { ensure } from "@meridian/kernel";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 80;

/** URL-safe product identifier shared with the storefront, carts, orders and purchase records. */
export function parseSlug(value: unknown): string {
  const slug = typeof value === "string" ? value.trim() : "";
  ensure(slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG.test(slug), "VALIDATION_FAILED", "Slugs use lower-case letters, digits and single hyphens (at most 80 characters).", { slug: value });
  return slug;
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);
}
