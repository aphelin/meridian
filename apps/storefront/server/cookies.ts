/**
 * Request-scoped cookie jar for the BFF. Reads the browser's `cookie` header once and records every change as a
 * `Set-Cookie` header on the response. Later reads in the same request see earlier writes, so a session rotated by
 * one procedure is used by the next procedure of the same batch.
 */

export interface CookieOptions {
  maxAgeSec: number;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict";
  secure?: boolean;
  path?: string;
}

export interface CookieWriter {
  /** Replaces every Set-Cookie header on the response with `values`. */
  replaceSetCookies(values: string[]): void;
}

/** Cookie names the BFF writes are restricted to a safe token alphabet. */
const NAME = /^[A-Za-z0-9_-]{1,128}$/;
/** Cookie values are opaque tokens (JWTs, base64url, UUIDs); anything else is rejected rather than escaped. */
const VALUE = /^[A-Za-z0-9._~+/=-]{0,4096}$/;

export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    if (!NAME.test(name) || out.has(name)) continue;
    try {
      value = decodeURIComponent(value);
    } catch {
      continue;
    }
    out.set(name, value);
  }
  return out;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!NAME.test(name)) throw new TypeError(`unsafe cookie name ${JSON.stringify(name)}`);
  if (!VALUE.test(value)) throw new TypeError(`unsafe value for cookie ${name}`);
  const parts = [`${name}=${value}`, `Path=${options.path ?? "/"}`, `Max-Age=${Math.max(0, Math.floor(options.maxAgeSec))}`];
  if (options.maxAgeSec <= 0) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite === "strict" ? "Strict" : "Lax"}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export class CookieJar {
  private readonly values: Map<string, string>;
  private readonly pending = new Map<string, string>();

  constructor(
    header: string | null | undefined,
    private readonly writer: CookieWriter | null = null,
  ) {
    this.values = parseCookieHeader(header);
  }

  get(name: string): string | undefined {
    const value = this.values.get(name);
    return value ? value : undefined;
  }

  has(name: string): boolean {
    return Boolean(this.get(name));
  }

  set(name: string, value: string, options: CookieOptions): void {
    const serialized = serializeCookie(name, value, options);
    if (options.maxAgeSec <= 0 || !value) this.values.delete(name);
    else this.values.set(name, value);
    this.pending.set(name, serialized);
    this.flush();
  }

  delete(name: string, options: Omit<CookieOptions, "maxAgeSec">): void {
    if (!this.values.has(name) && !this.pending.has(name)) return;
    this.set(name, "", { ...options, maxAgeSec: 0 });
  }

  /** Set-Cookie headers produced so far (one per cookie name, last write wins). */
  setCookieHeaders(): string[] {
    return [...this.pending.values()];
  }

  private flush() {
    this.writer?.replaceSetCookies(this.setCookieHeaders());
  }
}

/** Adapts a Fetch `Headers` object (tRPC's `resHeaders`) as the jar's writer. */
export function headersWriter(headers: Headers): CookieWriter {
  return {
    replaceSetCookies(values) {
      headers.delete("set-cookie");
      for (const value of values) headers.append("set-cookie", value);
    },
  };
}
