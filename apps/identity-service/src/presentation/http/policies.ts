import type { RateLimitPolicy } from "@meridian/nest-kit";

/** Rate-limit policies from the platform contract table (identity rows). */
export const RateLimits = {
  login: { name: "login", limit: 10, windowSec: 60, by: ["ip", "body:email"] },
  register: { name: "register", limit: 5, windowSec: 600, by: ["ip"] },
  resend: { name: "resend", limit: 3, windowSec: 600, by: ["user"] },
  forgot: { name: "forgot", limit: 5, windowSec: 900, by: ["ip", "body:email"] },
  token: { name: "token", limit: 20, windowSec: 600, by: ["ip"] },
  password: { name: "password", limit: 5, windowSec: 600, by: ["user"] },
} satisfies Record<string, RateLimitPolicy>;

/** Turnstile actions (must match the storefront widgets' `action`). */
export const CaptchaActions = {
  register: "register",
  resendVerification: "resend-verification",
  forgotPassword: "forgot-password",
} as const;
