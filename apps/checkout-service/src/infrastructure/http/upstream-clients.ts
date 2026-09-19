import { envInt, ResilientHttpClient, ResilientHttpClientFactory, serviceAuthorization } from "@meridian/nest-kit";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

const SERVICE = "checkout-service";
/** Service tokens live one minute; reuse each for 30 seconds instead of signing one per call. */
const TOKEN_REUSE_MS = 30_000;

/**
 * One resilient client per upstream (timeout + circuit breaker + correlation id + service JWT). Base URLs from
 * CATALOG_URL / INVENTORY_URL / PAYMENT_URL (payment intents and payment summaries use separate clients and breakers).
 */
@Injectable()
export class UpstreamClients {
  readonly catalog: ResilientHttpClient;
  readonly inventory: ResilientHttpClient;
  readonly payment: ResilientHttpClient;
  readonly paymentSummary: ResilientHttpClient;
  private token: { value: string; at: number } | null = null;

  constructor(factory: ResilientHttpClientFactory, jwt: JwtService) {
    const auth = () => {
      const now = Date.now();
      if (!this.token || now - this.token.at > TOKEN_REUSE_MS) this.token = { value: serviceAuthorization(jwt, SERVICE), at: now };
      return this.token.value;
    };
    this.catalog = factory.create({
      name: "catalog",
      baseUrl: process.env.CATALOG_URL?.trim() || "http://localhost:3012",
      timeoutMs: envInt("CATALOG_TIMEOUT_MS", 3000, { min: 100, max: 30_000 }),
      retries: 1,
      auth,
    });
    this.inventory = factory.create({
      name: "inventory",
      baseUrl: process.env.INVENTORY_URL?.trim() || "http://localhost:3003",
      timeoutMs: envInt("INVENTORY_TIMEOUT_MS", 4000, { min: 100, max: 30_000 }),
      auth,
    });
    this.payment = factory.create({
      name: "payment",
      baseUrl: process.env.PAYMENT_URL?.trim() || "http://localhost:3005",
      timeoutMs: envInt("PAYMENT_TIMEOUT_MS", 6000, { min: 100, max: 30_000 }),
      auth,
    });
    this.paymentSummary = factory.create({
      name: "payment-summary",
      baseUrl: process.env.PAYMENT_URL?.trim() || "http://localhost:3005",
      timeoutMs: envInt("PAYMENT_SUMMARY_TIMEOUT_MS", 2000, { min: 100, max: 30_000 }),
      retries: 0,
      auth,
    });
  }
}
