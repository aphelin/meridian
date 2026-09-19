import { DomainError } from "@meridian/kernel";

/** 401 for sign-in failures; one message for unknown email and wrong password (no enumeration). */
export const invalidCredentials = () => new DomainError("UNAUTHORIZED", "Invalid email or password.");
export const invalidSession = () => new DomainError("UNAUTHORIZED", "Your session has expired. Please sign in again.");
/** Re-authentication failures inside a valid session are 403 so the BFF does not treat them as an expired session. */
export const wrongPassword = () => new DomainError("FORBIDDEN", "The password you entered is incorrect.");
