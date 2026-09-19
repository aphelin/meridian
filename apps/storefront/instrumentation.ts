import { registerOTel } from "@vercel/otel";

const SERVICE_URL_VARS = ["IDENTITY_URL", "CATALOG_URL", "INVENTORY_URL", "CHECKOUT_URL", "PAYMENT_URL", "NOTIFICATION_URL", "SEARCH_URL", "ANALYTICS_URL"] as const;
const DEV_SERVICE_URLS = ["http://localhost:3001", "http://localhost:3012", "http://localhost:3003", "http://localhost:3004", "http://localhost:3005", "http://localhost:3006", "http://localhost:3007", "http://localhost:3008"];

/**
 * Traces start at the BFF when OTEL_EXPORTER_OTLP_ENDPOINT is set (no-op otherwise, like the services).
 * W3C trace context is propagated only to our own services, never to third parties such as Cloudflare or Paddle.
 */
export function register() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const serviceUrls = SERVICE_URL_VARS.map((name) => process.env[name]).filter((url): url is string => Boolean(url));
  registerOTel({
    serviceName: process.env.SERVICE_NAME ?? "storefront",
    instrumentationConfig: {
      fetch: { propagateContextUrls: serviceUrls.length ? serviceUrls : DEV_SERVICE_URLS },
    },
  });
}
