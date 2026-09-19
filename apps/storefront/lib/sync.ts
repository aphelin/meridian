import type { CartDto } from "@meridian/contracts";
import { useSyncExternalStore } from "react";
import { errorMessage } from "./errors";
import type { trpc } from "./trpc";
import { readCart, readSaved, replaceCart, replaceSaved, type CartLine } from "./stores";

type Client = ReturnType<typeof trpc.useUtils>["client"];

const PUSH_DEBOUNCE_MS = 400;
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 30_000;

let client: Client | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<SyncFailure | null> | null = null;
let lastPushed = "";
let failures = 0;
let retry: { op: SyncOp; timer: ReturnType<typeof setTimeout> | null } | null = null;

const signature = (lines: CartLine[]) =>
  JSON.stringify([...lines].sort((a, b) => a.sku.localeCompare(b.sku)).map((l) => [l.sku, l.variantId, l.qty]));

export const toCartLines = (cart: CartDto): CartLine[] => cart.lines.map((l) => ({ sku: l.sku, variantId: l.variantId, slug: l.slug, qty: l.qty }));

// ── status ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type SyncOp = "push" | "reconcile";
export type SyncFailure = { message: string; correlationId: string | null; retryable: boolean };
export type CartSyncStatus = { state: "idle" } | { state: "syncing" } | ({ state: "error" } & SyncFailure);

const IDLE: CartSyncStatus = { state: "idle" };
const SYNCING: CartSyncStatus = { state: "syncing" };
let status: CartSyncStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: CartSyncStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

export function readCartSyncStatus(): CartSyncStatus {
  return status;
}

export function subscribeCartSyncStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCartSyncStatus(): CartSyncStatus {
  return useSyncExternalStore(subscribeCartSyncStatus, readCartSyncStatus, () => IDLE);
}

/** Thrown by `flushCartSync` when the server cart could not be brought up to date with the device cart. */
export class CartSyncError extends Error {
  readonly correlationId: string | null;
  readonly retryable: boolean;
  constructor(failure: SyncFailure) {
    super(failure.message);
    this.name = "CartSyncError";
    this.correlationId = failure.correlationId;
    this.retryable = failure.retryable;
  }
}

/** Delay before retry number `attempt` (1-based): 1s, 2s, 4s, 8s … capped at 30s. */
export const retryDelay = (attempt: number) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));

function clearRetry() {
  if (retry?.timer) clearTimeout(retry.timer);
  retry = null;
}

function succeeded() {
  failures = 0;
  clearRetry();
  setStatus(IDLE);
}

/**
 * Records a failed sync call: logs it, sets the error status and, for network errors, 5xx and rate limits, schedules a
 * retry with exponential backoff. Other 4xx (validation, stock) will not change on retry, so they wait for the next
 * cart change or a manual retry.
 */
function failed(op: SyncOp, error: unknown): SyncFailure {
  const data = (error as { data?: { status?: number; code?: string; correlationId?: string } | null } | null)?.data;
  const httpStatus = data?.status;
  const retryable = httpStatus === undefined || httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
  const correlationId = data?.correlationId && data.correlationId !== "unknown" ? data.correlationId : null;
  const message = (error instanceof Error ? errorMessage(error) : undefined) || String(error);
  clearRetry();
  failures = retryable ? failures + 1 : 0;
  const retryInMs = retryable ? retryDelay(failures) : null;
  console.warn(JSON.stringify({ level: "warn", msg: "cart sync failed", op, attempt: failures || 1, status: httpStatus ?? null, code: data?.code ?? null, correlationId, retryInMs, error: message }));
  retry = { op, timer: null };
  if (retryInMs !== null) {
    retry.timer = setTimeout(() => {
      if (retry) retry.timer = null;
      void (op === "push" ? enqueuePush() : reconcileCart());
    }, retryInMs);
  }
  const failure = { message, correlationId, retryable };
  setStatus({ state: "error", ...failure });
  return failure;
}

// ── push ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Registers the tRPC client used for background cart sync (called once by Providers). */
export function bindSyncClient(next: Client | null) {
  client = next;
  if (!next) clearRetry();
}

async function push(): Promise<SyncFailure | null> {
  if (!client) return null;
  const lines = readCart().lines;
  const sig = signature(lines);
  if (sig === lastPushed) {
    // The cart went back to what the server already has, so a failed push has nothing left to retry.
    if (retry?.op === "push") succeeded();
    return null;
  }
  // An error stays visible while retrying, so the notice doesn't flicker between attempts.
  if (status.state !== "error") setStatus(SYNCING);
  try {
    await client.cart.setLines.mutate({ lines: lines.map(({ sku, variantId, qty }) => ({ sku, variantId, qty })) });
    lastPushed = sig;
    succeeded();
    return null;
  } catch (error) {
    // The device cart stays authoritative for the UI; the failure is surfaced and retried.
    return failed("push", error);
  }
}

/** Runs a push after any in-flight one, so pushes never overlap. */
function enqueuePush(): Promise<SyncFailure | null> {
  const next = (pushing ?? Promise.resolve(null)).catch(() => null).then(push);
  pushing = next;
  void next.finally(() => {
    if (pushing === next) pushing = null;
  });
  return next;
}

/** Schedules a debounced push of the device cart to the server cart. */
export function scheduleCartPush(delayMs = PUSH_DEBOUNCE_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void enqueuePush();
  }, delayMs);
}

/**
 * Pushes pending cart changes now (before checkout or sign-in merge). Rejects with a `CartSyncError` when the server
 * cart could not be updated, so callers never act on a stale server cart.
 */
export async function flushCartSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (retry?.op === "push" && retry.timer) {
    clearTimeout(retry.timer);
    retry.timer = null;
  }
  const failure = await enqueuePush();
  if (failure) throw new CartSyncError(failure);
}

/** The notice's retry action: re-runs the failed call now instead of waiting for the backoff. */
export async function retryCartSync() {
  const op = retry?.op ?? "push";
  if (retry?.timer) {
    clearTimeout(retry.timer);
    retry.timer = null;
  }
  if (op === "reconcile") await reconcileCart();
  else await enqueuePush();
}

/**
 * Reconciles the device cart with the server cart on load: a non-empty server cart that is newer wins (another device
 * or a merge), otherwise the device cart is pushed.
 */
export async function reconcileCart() {
  if (!client) return;
  try {
    const server = await client.cart.get.query();
    const local = readCart();
    const serverLines = toCartLines(server);
    const serverAt = Date.parse(server.updatedAt) || 0;
    lastPushed = signature(serverLines);
    succeeded();
    if (signature(local.lines) === lastPushed) return;
    if (serverLines.length && (serverAt > local.updatedAt || !local.lines.length)) replaceCart(serverLines, serverAt);
    else scheduleCartPush(0);
  } catch (error) {
    // Offline or BFF unavailable: keep the device cart, surface the failure and retry.
    failed("reconcile", error);
  }
}

/**
 * After sign-in or sign-up: merge the guest cart into the account and push the device's saved slugs into the wishlist,
 * then replace local state with the server's.
 */
export async function syncAfterSignIn(api: Client) {
  bindSyncClient(api);
  // A failed flush is already logged and shown; the merge still adopts the account cart.
  await flushCartSync().catch(() => undefined);
  const [cart, wishlist] = await Promise.allSettled([api.cart.merge.mutate(), api.wishlist.merge.mutate({ slugs: readSaved().slice(0, 100) })]);
  if (cart.status === "fulfilled") {
    const lines = toCartLines(cart.value);
    lastPushed = signature(lines);
    succeeded();
    replaceCart(lines, Date.parse(cart.value.updatedAt) || Date.now());
  }
  if (wishlist.status === "fulfilled") replaceSaved(wishlist.value.slugs);
}
