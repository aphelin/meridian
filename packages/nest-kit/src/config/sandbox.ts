import { DomainError } from "@meridian/kernel";
import { envList } from "./env";

/** Raised at startup when configuration would let the platform touch real money or real mailboxes. */
export class SandboxOnlyError extends DomainError {
  constructor(message: string, details?: unknown) {
    super("SANDBOX_ONLY", message, details);
    this.name = "SandboxOnlyError";
  }
}

const PADDLE_VARIABLES = ["PADDLE_ENV", "PADDLE_API_KEY", "PADDLE_CLIENT_TOKEN", "PADDLE_WEBHOOK_SECRET", "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"];
const SANDBOX_SMTP_HOSTS = ["localhost", "127.0.0.1", "::1", "mailhog"];

const present = (env: NodeJS.ProcessEnv, name: string) => {
  const value = env[name]?.trim();
  return value ? value : undefined;
};

/**
 * Payments are sandbox only. When any Paddle variable is configured, PADDLE_ENV must be "sandbox",
 * the API key must be a sandbox key (pdl_sdbx_) and client tokens must be test tokens (test_).
 */
export function assertSandboxPayments(env: NodeJS.ProcessEnv = process.env): void {
  const configured = PADDLE_VARIABLES.filter((name) => present(env, name));
  if (!configured.length) return;
  if (present(env, "PADDLE_ENV") !== "sandbox") {
    throw new SandboxOnlyError('Paddle is configured but PADDLE_ENV is not "sandbox"', { configured });
  }
  const apiKey = present(env, "PADDLE_API_KEY");
  if (apiKey && !apiKey.startsWith("pdl_sdbx_")) {
    throw new SandboxOnlyError("PADDLE_API_KEY is not a Paddle sandbox key (expected prefix pdl_sdbx_)");
  }
  for (const name of ["PADDLE_CLIENT_TOKEN", "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"]) {
    const token = present(env, name);
    if (token && !token.startsWith("test_")) {
      throw new SandboxOnlyError(`${name} is not a Paddle sandbox client token (expected prefix test_)`);
    }
  }
}

/** Email is sandbox only: SMTP_HOST must be a local catcher (Mailhog) or a host listed in SMTP_SANDBOX_HOSTS. */
export function assertSandboxSmtp(env: NodeJS.ProcessEnv = process.env): void {
  const host = present(env, "SMTP_HOST")?.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  const allowed = new Set([...SANDBOX_SMTP_HOSTS, ...envList("SMTP_SANDBOX_HOSTS", [], env).map((h) => h.toLowerCase())]);
  if (!host) throw new SandboxOnlyError("SMTP_HOST must be set to a sandbox mail catcher", { allowed: [...allowed] });
  if (!allowed.has(host)) {
    throw new SandboxOnlyError(`SMTP_HOST "${host}" is not a sandbox mail host`, { allowed: [...allowed] });
  }
}
