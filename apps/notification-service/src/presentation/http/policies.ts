import type { RateLimitPolicy } from "@meridian/nest-kit";

/** Contract rate-limit policies for the email-sending public forms. */
export const RateLimits = {
  newsletter: { name: "newsletter", limit: 5, windowSec: 3600, by: ["ip", "body:email"] },
  contact: { name: "contact", limit: 5, windowSec: 3600, by: ["ip", "body:email"] },
  stockAlert: { name: "stock-alert", limit: 10, windowSec: 3600, by: ["ip", "body:email"] },
} satisfies Record<string, RateLimitPolicy>;

/** Turnstile actions (must match the storefront widgets' `action`). */
export const CaptchaActions = {
  newsletter: "newsletter-subscribe",
  contact: "contact",
  stockAlert: "stock-alert",
} as const;
