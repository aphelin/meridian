import { createLogger } from "../core/logger";

const MIN_SECRET_LENGTH = 32;
const DEV_SECRET = "dev-only";
const log = createLogger("Auth");
let warnedDevSecret = false;

/** True when NODE_ENV is development, test or unset: the only environments allowed to run on weak secrets. */
export function isDevelopmentEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.NODE_ENV?.trim();
  return !mode || mode === "development" || mode === "test";
}

/**
 * JWT signing secret policy: outside development/test it must be set and at least 32 characters.
 * In development/test an unset secret falls back to "dev-only" with a warning.
 */
export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim();
  if (isDevelopmentEnv(env)) {
    if (secret) return secret;
    if (!warnedDevSecret) {
      warnedDevSecret = true;
      log.warn("JWT_SECRET is not set; using the insecure development secret", { nodeEnv: env.NODE_ENV ?? null });
    }
    return DEV_SECRET;
  }
  if (!secret) throw new Error(`JWT_SECRET must be set when NODE_ENV=${env.NODE_ENV}`);
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters when NODE_ENV=${env.NODE_ENV}`);
  return secret;
}
