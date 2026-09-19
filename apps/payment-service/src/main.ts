import "@meridian/nest-kit/tracing";
import "reflect-metadata";
import { bootstrapService, createLogger } from "@meridian/nest-kit";
import { AppModule, SERVICE_NAME } from "./app.module";
import { loadPaymentConfig } from "./infrastructure/config/payment-settings";

const log = createLogger("PaymentService");

// Payments are sandbox/test mode only: refuse to start with a live Stripe key or any live or incomplete Paddle
// configuration (never logs key values).
try {
  loadPaymentConfig(process.env);
} catch (error) {
  const code = (error as { code?: string }).code ?? "PAYMENT_CONFIG_INVALID";
  const message = error instanceof Error ? error.message : String(error);
  log.error("refusing to start: invalid or non-sandbox payment configuration", { code, reason: message });
  process.stderr.write(`[payment-service] ${code}: ${message}\n`);
  process.exit(1);
}

void bootstrapService({ name: SERVICE_NAME, module: AppModule, defaultPort: 3005, rawBody: true });
