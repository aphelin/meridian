import { BreakerRegistry } from "@meridian/nest-kit";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRejectedError } from "../../application/ports";
import { PaddleSandboxProvider } from "./paddle-sandbox.provider";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responder: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const { status, body } = responder(call);
    return { status, ok: status < 300, text: async () => JSON.stringify(body) };
  };
  return { calls, impl };
}

const settings = { apiKey: "pdl_sdbx_apikey_unit", clientToken: "test_unit", baseUrl: "http://paddle.stub", timeoutMs: 1000 };

afterEach(() => BreakerRegistry.reset());

describe("PaddleSandboxProvider", () => {
  it("paddle adapter refuses non-sandbox API keys", () => {
    expect(() => new PaddleSandboxProvider({ ...settings, apiKey: "pdl_live_apikey" })).toThrow(/sandbox/);
  });

  it("paddle transaction uses the sandbox key, a non-catalog item and custom_data", async () => {
    const { calls, impl } = fakeFetch(() => ({ status: 200, body: { data: { id: "txn_p", status: "ready" } } }));
    const provider = new PaddleSandboxProvider(settings, impl);
    const created = await provider.createTransaction({
      paymentId: "pay_1",
      orderId: "ord_1",
      orderNumber: "M-1",
      amountCents: 99_900,
      currency: "EUR",
      customer: { email: "a@b.test", name: "A" },
      lines: [{ name: "Chair", qty: 1, unitPriceCents: 99_900 }],
    });
    expect(created).toEqual({ providerTransactionId: "txn_p" });
    expect(calls[0].url).toBe("http://paddle.stub/transactions");
    expect(calls[0].headers.authorization).toBe("Bearer pdl_sdbx_apikey_unit");
    expect(calls[0].body).toMatchObject({
      currency_code: "EUR",
      custom_data: { orderId: "ord_1", paymentId: "pay_1" },
      items: [{ quantity: 1, price: { unit_price: { amount: "99900", currency_code: "EUR" } } }],
    });
  });

  it("paddle partial refund creates an adjustment for the transaction line item", async () => {
    const { calls, impl } = fakeFetch((call) =>
      call.method === "GET"
        ? { status: 200, body: { data: { id: "txn_p", details: { line_items: [{ id: "txnitm_1" }] } } } }
        : { status: 201, body: { data: { id: "adj_1", status: "pending_approval" } } },
    );
    const provider = new PaddleSandboxProvider(settings, impl);
    const result = await provider.refund({ paymentId: "p", orderId: "o", refundId: "r", providerTransactionId: "txn_p", amountCents: 500, currency: "EUR", reason: "x", full: false });
    expect(result).toEqual({ status: "pending", providerRefundId: "adj_1" });
    expect(calls[1].body).toMatchObject({ action: "refund", type: "partial", transaction_id: "txn_p", items: [{ item_id: "txnitm_1", type: "partial", amount: "500" }] });
  });

  it("paddle 4xx is a provider rejection; 5xx is transient", async () => {
    let status = 400;
    const { impl } = fakeFetch(() => ({ status, body: { error: { code: "transaction_not_refundable" } } }));
    const provider = new PaddleSandboxProvider(settings, impl);
    const input = { paymentId: "p", orderId: "o", refundId: "r", providerTransactionId: "txn_p", amountCents: 500, currency: "EUR" as const, reason: "x", full: true };
    await expect(provider.refund(input)).rejects.toBeInstanceOf(ProviderRejectedError);
    status = 503;
    await expect(provider.refund(input)).rejects.not.toBeInstanceOf(ProviderRejectedError);
  });
});
