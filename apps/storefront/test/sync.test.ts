import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Line = { sku: string; variantId: string; slug: string; qty: number };

const cart = vi.hoisted(() => ({ lines: [] as Line[], updatedAt: 0 }));

vi.mock("@/lib/stores", () => ({
  readCart: () => cart,
  readSaved: () => [],
  replaceCart: (lines: Line[], updatedAt: number) => Object.assign(cart, { lines, updatedAt }),
  replaceSaved: () => undefined,
}));

const serverError = (status: number, code: string, correlationId = "corr-1") => Object.assign(new Error(status >= 500 ? "Something went wrong on our side." : "Rejected"), { data: { status, code, correlationId } });

async function load() {
  vi.resetModules();
  const sync = await import("@/lib/sync");
  const setLines = vi.fn();
  const get = vi.fn();
  sync.bindSyncClient({ cart: { setLines: { mutate: setLines }, get: { query: get } } } as never);
  return { sync, setLines, get };
}

const setCart = (qty: number) => Object.assign(cart, { lines: [{ sku: "A", variantId: "v", slug: "a", qty }], updatedAt: Date.now() });

describe("cart sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setCart(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("backs off 1s, 2s, 4s, 8s … capped at 30s", async () => {
    const { sync } = await load();
    expect([1, 2, 3, 4, 5, 6, 7].map(sync.retryDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });

  it("retries a failed push with growing delays, then resets to idle on success", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValueOnce(serverError(503, "UPSTREAM_UNAVAILABLE")).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({});

    sync.scheduleCartPush(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(setLines).toHaveBeenCalledTimes(1);
    expect(sync.readCartSyncStatus()).toEqual({ state: "error", message: "Something went wrong on our side.", correlationId: "corr-1", retryable: true });
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string)).toMatchObject({ msg: "cart sync failed", op: "push", status: 503, correlationId: "corr-1", retryInMs: 1_000 });

    await vi.advanceTimersByTimeAsync(999);
    expect(setLines).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(setLines).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[1][0] as string)).toMatchObject({ retryInMs: 2_000, correlationId: null });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(setLines).toHaveBeenCalledTimes(3);
    expect(sync.readCartSyncStatus()).toEqual({ state: "idle" });

    // Success resets the backoff: the next failure waits 1s again.
    setLines.mockRejectedValueOnce(serverError(500, "INTERNAL"));
    setCart(2);
    sync.scheduleCartPush(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(vi.mocked(console.warn).mock.calls[2][0] as string)).toMatchObject({ retryInMs: 1_000 });
  });

  it("surfaces a 4xx rejection without retrying it", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValue(serverError(409, "OUT_OF_STOCK"));

    sync.scheduleCartPush(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(setLines).toHaveBeenCalledTimes(1);
    expect(sync.readCartSyncStatus()).toMatchObject({ state: "error", message: "Rejected", retryable: false });
  });

  it("notifies subscribers of status changes", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValueOnce(serverError(503, "UPSTREAM_UNAVAILABLE"));
    const seen: string[] = [];
    sync.subscribeCartSyncStatus(() => seen.push(sync.readCartSyncStatus().state));

    sync.scheduleCartPush(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen).toEqual(["syncing", "error", "idle"]);
  });

  it("flushCartSync rejects when the final push fails, and resolves once it succeeds", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValueOnce(serverError(503, "UPSTREAM_UNAVAILABLE", "corr-9")).mockResolvedValue({});

    const failure = await sync.flushCartSync().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(sync.CartSyncError);
    expect(failure).toMatchObject({ correlationId: "corr-9", retryable: true });

    await expect(sync.flushCartSync()).resolves.toBeUndefined();
    expect(setLines).toHaveBeenCalledTimes(2);
    expect(sync.readCartSyncStatus()).toEqual({ state: "idle" });
    // The pending backoff retry was cancelled by the successful flush.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(setLines).toHaveBeenCalledTimes(2);
  });

  it("flushCartSync waits for a debounced push instead of skipping it", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValue(serverError(502, "UPSTREAM_UNAVAILABLE"));
    sync.scheduleCartPush();
    await expect(sync.flushCartSync()).rejects.toBeInstanceOf(sync.CartSyncError);
    expect(setLines).toHaveBeenCalledTimes(1);
  });

  it("keeps the device cart when reconcile fails and retries it", async () => {
    const { sync, get, setLines } = await load();
    get.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ lines: [], updatedAt: new Date(0).toISOString() });
    setLines.mockResolvedValue({});

    await sync.reconcileCart();
    expect(cart.lines).toHaveLength(1);
    expect(sync.readCartSyncStatus()).toMatchObject({ state: "error", retryable: true });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.runOnlyPendingTimersAsync();
    // The server cart is empty and older, so the device cart is pushed.
    expect(setLines).toHaveBeenCalledWith({ lines: [{ sku: "A", variantId: "v", qty: 1 }] });
    expect(sync.readCartSyncStatus()).toEqual({ state: "idle" });
  });

  it("retryCartSync re-runs the failed push immediately", async () => {
    const { sync, setLines } = await load();
    setLines.mockRejectedValueOnce(serverError(400, "VALIDATION_FAILED")).mockResolvedValue({});
    sync.scheduleCartPush(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.readCartSyncStatus().state).toBe("error");

    await sync.retryCartSync();
    expect(setLines).toHaveBeenCalledTimes(2);
    expect(sync.readCartSyncStatus()).toEqual({ state: "idle" });
  });
});
