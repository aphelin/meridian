import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { type IdempotencyClaim, IdempotencyInterceptor, type IdempotencyStore } from "./idempotency.interceptor";

function setup(claim: IdempotencyClaim, headers: Record<string, string> = { "idempotency-key": "key-1" }) {
  const store: IdempotencyStore = { claim: vi.fn(async () => claim), complete: vi.fn(async () => undefined), release: vi.fn(async () => undefined) };
  const responseHeaders = new Map<string, string>();
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ method: "POST", route: { path: "/orders" }, headers, body: { a: 1 }, principal: null }),
      getResponse: () => ({ setHeader: (k: string, v: string) => responseHeaders.set(k, v) }),
    }),
  } as unknown as ExecutionContext;
  return { store, ctx, responseHeaders, interceptor: new IdempotencyInterceptor(store) };
}

const handler = (result: () => unknown): CallHandler => ({ handle: () => of(null).pipe(() => of(result())) });

describe("idempotency interceptor", () => {
  it("stores the first response and replays it for a repeated key", async () => {
    const first = setup({ state: "claimed" });
    await expect(firstValueFrom(await first.interceptor.intercept(first.ctx, handler(() => ({ id: "o1" }))))).resolves.toEqual({ id: "o1" });
    expect(first.store.complete).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/), { id: "o1" });
    const replay = setup({ state: "replay", response: { id: "o1" } });
    const run = vi.fn();
    await expect(firstValueFrom(await replay.interceptor.intercept(replay.ctx, handler(run)))).resolves.toEqual({ id: "o1" });
    expect(run).not.toHaveBeenCalled();
    expect(replay.responseHeaders.get("idempotent-replayed")).toBe("true");
  });

  it("maps mismatch and in-flight claims to IDEMPOTENCY_MISMATCH and IDEMPOTENCY_IN_FLIGHT", async () => {
    const mismatch = setup({ state: "mismatch" });
    await expect(mismatch.interceptor.intercept(mismatch.ctx, handler(() => 1))).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    const inflight = setup({ state: "in-flight" });
    await expect(inflight.interceptor.intercept(inflight.ctx, handler(() => 1))).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_FLIGHT" });
    const tooLong = setup({ state: "claimed" }, { "idempotency-key": "k".repeat(129) });
    await expect(tooLong.interceptor.intercept(tooLong.ctx, handler(() => 1))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("releases the claim when the handler fails so the client can retry", async () => {
    const failing = setup({ state: "claimed" });
    const failingHandler: CallHandler = { handle: () => throwError(() => new Error("saga failed")) };
    await expect(firstValueFrom(await failing.interceptor.intercept(failing.ctx, failingHandler))).rejects.toThrow("saga failed");
    expect(failing.store.release).toHaveBeenCalledTimes(1);
    expect(failing.store.complete).not.toHaveBeenCalled();
  });
});
