import { createBreaker, createLogger, type KitBreaker, UpstreamUnavailableError } from "@meridian/nest-kit";
import {
  type PaymentProvider,
  type ProviderRefundInput,
  type ProviderRefundResult,
  ProviderRejectedError,
  type ProviderTransactionInput,
} from "../../application/ports";
import type { PaddleSettings } from "../config/payment-settings";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

interface PaddleRequest {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}

const log = createLogger("PaddleSandbox");
const PROVIDER = "paddle-sandbox" as const;

/**
 * Paddle Billing sandbox adapter. Every call: sandbox API key only (guarded at startup), 5 s timeout, circuit breaker
 * "paddle", chaos target "paddle.api". 4xx answers (other than 408/429) are definitive refusals and do not trip the breaker.
 */
export class PaddleSandboxProvider implements PaymentProvider {
  readonly id = PROVIDER;
  readonly supportsSandboxCompletion = false;
  private readonly breaker: KitBreaker<[PaddleRequest], unknown>;

  constructor(
    private readonly settings: PaddleSettings,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {
    if (!settings.apiKey.startsWith("pdl_sdbx_")) throw new Error("PaddleSandboxProvider requires a Paddle sandbox API key");
    this.breaker = createBreaker("paddle", "paddle.api", (request: PaddleRequest) => this.send(request), {
      timeoutMs: settings.timeoutMs + 500,
      isNeutral: (error) => error instanceof ProviderRejectedError,
    });
  }

  clientToken() {
    return this.settings.clientToken;
  }

  async createTransaction(input: ProviderTransactionInput): Promise<{ providerTransactionId: string }> {
    const summary = input.lines
      .map((line) => `${line.qty} × ${line.name}`)
      .join(", ")
      .slice(0, 900);
    const data = await this.call({
      method: "POST",
      path: "/transactions",
      body: {
        items: [
          {
            quantity: 1,
            price: {
              description: `Meridian order ${input.orderNumber}`,
              name: `Order ${input.orderNumber}`,
              tax_mode: "internal",
              unit_price: { amount: String(input.amountCents), currency_code: input.currency },
              product: { name: `Meridian order ${input.orderNumber}`, description: summary || undefined, tax_category: "standard" },
            },
          },
        ],
        currency_code: input.currency,
        collection_mode: "automatic",
        custom_data: { orderId: input.orderId, paymentId: input.paymentId },
      },
    });
    const id = stringField(data, "id");
    if (!id) throw new UpstreamUnavailableError("paddle", "network", { cause: new Error("Paddle created a transaction without an id") });
    return { providerTransactionId: id };
  }

  async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    if (!input.providerTransactionId) throw new ProviderRejectedError(PROVIDER, "The payment has no Paddle transaction to refund.", "no_transaction");
    const reason = (input.reason || "Refund").slice(0, 500);
    let body: Record<string, unknown>;
    if (input.full) {
      body = { action: "refund", type: "full", transaction_id: input.providerTransactionId, reason };
    } else {
      const itemId = await this.transactionItemId(input.providerTransactionId);
      body = {
        action: "refund",
        type: "partial",
        transaction_id: input.providerTransactionId,
        reason,
        items: [{ item_id: itemId, type: "partial", amount: String(input.amountCents) }],
      };
    }
    const data = await this.call({ method: "POST", path: "/adjustments", body });
    const id = stringField(data, "id");
    if (!id) throw new UpstreamUnavailableError("paddle", "network", { cause: new Error("Paddle created an adjustment without an id") });
    const status = stringField(data, "status");
    if (status === "rejected") throw new ProviderRejectedError(PROVIDER, "Paddle rejected the refund.", "adjustment_rejected");
    return status === "approved" ? { status: "succeeded", providerRefundId: id } : { status: "pending", providerRefundId: id };
  }

  async cancelTransaction(providerTransactionId: string): Promise<void> {
    await this.call({ method: "PATCH", path: `/transactions/${encodeURIComponent(providerTransactionId)}`, body: { status: "canceled" } });
  }

  private async transactionItemId(transactionId: string): Promise<string> {
    const data = await this.call({ method: "GET", path: `/transactions/${encodeURIComponent(transactionId)}` });
    const details = (data as { details?: { line_items?: { id?: unknown }[] } } | null)?.details;
    const itemId = details?.line_items?.find((item) => typeof item.id === "string")?.id;
    if (typeof itemId !== "string") throw new ProviderRejectedError(PROVIDER, "The Paddle transaction has no refundable line item.", "no_line_item");
    return itemId;
  }

  private async call(request: PaddleRequest): Promise<unknown> {
    return this.breaker.fire(request);
  }

  private async send(request: PaddleRequest): Promise<unknown> {
    let response: Awaited<ReturnType<FetchLike>>;
    let text: string;
    try {
      response = await this.fetchImpl(`${this.settings.baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          authorization: `Bearer ${this.settings.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new UpstreamUnavailableError("paddle", timeout ? "timeout" : "network", { cause: error });
    }
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) return (json as { data?: unknown } | null)?.data ?? null;
    const code = stringField((json as { error?: unknown } | null)?.error, "code");
    log.warn("paddle api error", { method: request.method, path: request.path.split("/").slice(0, 2).join("/"), status: response.status, code });
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      throw new ProviderRejectedError(PROVIDER, `Paddle refused the request (${response.status}).`, code);
    }
    throw new UpstreamUnavailableError("paddle", "network", { cause: new Error(`Paddle API answered ${response.status}${code ? ` (${code})` : ""}`) });
  }
}

function stringField(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field ? field : null;
}
