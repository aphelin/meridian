import { ValidationError } from "@meridian/kernel";

/** Trims `value` and checks its length; empty optional values become null. */
export function requiredText(value: unknown, field: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ValidationError(`${field} is required.`, { field });
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`, { field });
  return text;
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`, { field });
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`, { field });
  return text;
}
