import type { AuthResultDto, UserDto } from "@meridian/contracts";
import { createHash } from "node:crypto";
import type { CookieJar, CookieOptions } from "./cookies";
import { scopeOrDetached } from "./context";
import { ServiceError } from "./errors";
import { services } from "./services";

export const COOKIE = {
  access: "access",
  refresh: "refresh",
  cart: "cart",
  orderAccessPrefix: "oa_",
} as const;

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;
export const ACCESS_MAX_AGE = 15 * MINUTE;
export const REFRESH_MAX_AGE = 30 * DAY;
export const CART_MAX_AGE = 30 * DAY;
export const ORDER_ACCESS_MAX_AGE = 30 * DAY;

/** How long a completed rotation is shared with requests that still carry the refresh token it consumed. */
const ROTATION_SHARE_MS = 20_000;

export function cookieOptions(maxAgeSec: number): CookieOptions {
  return { maxAgeSec, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
}

const base = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" });

export function setSessionCookies(jar: CookieJar, tokens: Pick<AuthResultDto, "accessToken" | "refreshToken">): void {
  jar.set(COOKIE.access, tokens.accessToken, cookieOptions(ACCESS_MAX_AGE));
  jar.set(COOKIE.refresh, tokens.refreshToken, cookieOptions(REFRESH_MAX_AGE));
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.delete(COOKIE.access, base());
  jar.delete(COOKIE.refresh, base());
}

export function hasSession(jar: CookieJar): boolean {
  return jar.has(COOKIE.access) || jar.has(COOKIE.refresh);
}

// ── refresh rotation (single-flight per refresh token) ─────────────────────────────────────────────────────────────

type Rotation = { promise: Promise<AuthResultDto | null>; timer?: ReturnType<typeof setTimeout> };
const KEY = Symbol.for("meridian.bff.rotations");
const rotations: Map<string, Rotation> = ((globalThis as Record<symbol, unknown>)[KEY] as Map<string, Rotation> | undefined) ?? new Map();
(globalThis as Record<symbol, unknown>)[KEY] = rotations;

const fingerprint = (token: string) => createHash("sha256").update(token).digest("base64url");

export type RefreshFn = (refreshToken: string) => Promise<AuthResultDto>;

const defaultRefresh: RefreshFn = (refreshToken) => services.identity.post<AuthResultDto>("/auth/refresh", { body: { refreshToken } });

/**
 * Exchanges the refresh cookie for a new token pair. Refresh tokens are single use (reuse revokes the family), so every
 * caller holding the same refresh token — procedures of one batch, parallel browser requests — shares one call and
 * receives the same new pair for a short window afterwards. Returns null when the refresh token is rejected (the
 * session cookies are then cleared); throws when identity is unavailable (cookies are kept).
 */
export async function rotateSession(jar: CookieJar, refresh: RefreshFn = defaultRefresh): Promise<AuthResultDto | null> {
  const current = jar.get(COOKIE.refresh);
  if (!current) return null;
  const id = fingerprint(current);
  let rotation = rotations.get(id);
  if (!rotation) {
    const created: Rotation = {
      promise: refresh(current).catch((error: unknown) => {
        if (error instanceof ServiceError && error.status >= 400 && error.status < 500) return null;
        // Unavailable: forget the attempt right away so the next request can retry.
        if (rotations.get(id) === created) rotations.delete(id);
        throw error;
      }),
    };
    rotations.set(id, created);
    created.promise
      .then(() => {
        created.timer = setTimeout(() => {
          if (rotations.get(id) === created) rotations.delete(id);
        }, ROTATION_SHARE_MS);
        created.timer.unref?.();
      })
      .catch(() => undefined);
    rotation = created;
  }
  const result = await rotation.promise;
  if (!result) {
    // Another request may already have stored a newer pair in this jar; only clear the pair that failed.
    if (jar.get(COOKIE.refresh) === current) clearSessionCookies(jar);
    return null;
  }
  setSessionCookies(jar, result);
  return result;
}

/** Test helper. */
export function resetRotations(): void {
  for (const rotation of rotations.values()) if (rotation.timer) clearTimeout(rotation.timer);
  rotations.clear();
}

/**
 * Runs `call` with the session's access token: rotates first when only a refresh cookie is left, and once more when
 * the upstream answers 401 to a token. Without a usable session, `required` calls fail with UNAUTHORIZED and optional
 * calls run anonymously.
 */
export async function withSession<T>(call: (token: string | undefined) => Promise<T>, { required = false, jar = scopeOrDetached().cookies }: { required?: boolean; jar?: CookieJar } = {}): Promise<T> {
  let token = jar.get(COOKIE.access);
  if (!token && jar.has(COOKIE.refresh)) token = (await rotateSession(jar))?.accessToken;
  if (!token && required) throw ServiceError.unauthorized();
  try {
    return await call(token);
  } catch (error) {
    if (!(token && error instanceof ServiceError && error.code === "UNAUTHORIZED")) throw error;
    const fresh = jar.has(COOKIE.refresh) ? await rotateSession(jar) : null;
    if (fresh) return call(fresh.accessToken);
    clearSessionCookies(jar);
    if (required) throw ServiceError.unauthorized("Your session has ended. Please sign in again.");
    return call(undefined);
  }
}

/** The signed-in user, or null (no session, or the session could not be renewed). */
export async function currentUser(jar: CookieJar = scopeOrDetached().cookies): Promise<UserDto | null> {
  if (!hasSession(jar)) return null;
  try {
    return await withSession((token) => (token ? services.identity.get<UserDto>("/me", { token }) : Promise.resolve(null)), { jar });
  } catch (error) {
    // A rejected session, or an account deleted elsewhere, is simply "signed out".
    if (error instanceof ServiceError && (error.code === "UNAUTHORIZED" || error.code === "NOT_FOUND")) {
      clearSessionCookies(jar);
      return null;
    }
    throw error;
  }
}

// ── guest cart and order access cookies ────────────────────────────────────────────────────────────────────────────

const CART_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;
const ACCESS_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export function guestCartId(jar: CookieJar): string | undefined {
  const id = jar.get(COOKIE.cart);
  return id && CART_ID.test(id) ? id : undefined;
}

export function rememberGuestCart(jar: CookieJar, id: string): void {
  if (CART_ID.test(id) && jar.get(COOKIE.cart) !== id) jar.set(COOKIE.cart, id, cookieOptions(CART_MAX_AGE));
}

export function forgetGuestCart(jar: CookieJar): void {
  jar.delete(COOKIE.cart, base());
}

export function isOrderId(id: string): boolean {
  return ORDER_ID.test(id);
}

export function orderAccessCookieName(orderId: string): string {
  if (!ORDER_ID.test(orderId)) throw ServiceError.notFound("We couldn’t find that order.");
  return `${COOKIE.orderAccessPrefix}${orderId}`;
}

/** Guest access token for an order: an explicit (email link) token wins over the remembered cookie. */
export function orderAccessFor(jar: CookieJar, orderId: string, explicit?: string | null): string | undefined {
  if (explicit && ACCESS_TOKEN.test(explicit)) return explicit;
  const stored = jar.get(orderAccessCookieName(orderId));
  return stored && ACCESS_TOKEN.test(stored) ? stored : undefined;
}

export function rememberOrderAccess(jar: CookieJar, orderId: string, token: string): void {
  if (!ACCESS_TOKEN.test(token)) return;
  const name = orderAccessCookieName(orderId);
  if (jar.get(name) !== token) jar.set(name, token, cookieOptions(ORDER_ACCESS_MAX_AGE));
}
