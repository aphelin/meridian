import { isDevelopmentEnv } from "@meridian/nest-kit";
import { IdentitySettings } from "../../application/ports";
import { REFRESH_TOKEN_TTL_MS } from "../../domain";

const DEV_SITE_URL = "http://localhost:3100";

/** Resolves PUBLIC_SITE_URL and the seed admin from the environment; fails fast on a bad site URL outside development. */
export class EnvIdentitySettings extends IdentitySettings {
  readonly publicSiteUrl: string;
  readonly refreshTokenTtlMs = REFRESH_TOKEN_TTL_MS;
  readonly admin: { email: string; password: string } | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    super();
    this.publicSiteUrl = resolveSiteUrl(env);
    const email = env.ADMIN_EMAIL?.trim();
    const password = env.ADMIN_PASSWORD;
    this.admin = email && password ? { email, password } : null;
  }
}

export function resolveSiteUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (isDevelopmentEnv(env)) return DEV_SITE_URL;
    throw new Error("PUBLIC_SITE_URL must be set outside development");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PUBLIC_SITE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("PUBLIC_SITE_URL must be http(s)");
  if (url.search || url.hash) throw new Error("PUBLIC_SITE_URL must not contain a query or fragment");
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
