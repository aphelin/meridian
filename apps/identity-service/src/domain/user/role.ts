import type { Role } from "@meridian/contracts";

export type { Role };
export const ROLES: readonly Role[] = ["customer", "admin"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
