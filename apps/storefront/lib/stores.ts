import { useSyncExternalStore } from "react";

type Listener = () => void;

function createStore<T>(key: string | null, fallback: T, parse: (raw: unknown) => T) {
  let cache: T | undefined;
  const listeners = new Set<Listener>();

  const read = (): T => {
    if (typeof window === "undefined") return fallback;
    if (cache !== undefined) return cache;
    cache = fallback;
    if (key) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) cache = parse(JSON.parse(raw));
      } catch {
        cache = fallback;
      }
    }
    return cache;
  };

  const write = (next: T) => {
    cache = next;
    if (key) {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage full or blocked: keep the in-memory value
      }
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (key && e.key === key) {
        cache = undefined;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  const server = () => fallback;

  return { read, write, subscribe, server };
}

// ── cart ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A cart line as kept on the device for instant UI; the server cart (checkout-service) is synced from it. */
export type CartLine = { sku: string; variantId: string; slug: string; qty: number };
type CartState = { lines: CartLine[]; updatedAt: number };

export const MAX_QTY = 20;
export const CART_ADDED = "meridian:cart-added";

const isLine = (l: unknown): l is CartLine => {
  const x = l as CartLine | null;
  return Boolean(x && typeof x.sku === "string" && x.sku && typeof x.variantId === "string" && typeof x.slug === "string" && Number.isInteger(x.qty) && x.qty > 0);
};

const EMPTY_CART: CartState = { lines: [], updatedAt: 0 };

const cartStore = createStore<CartState>("meridian.cart.v3", EMPTY_CART, (raw) => {
  const value = raw as Partial<CartState> | null;
  const lines = Array.isArray(value?.lines) ? value.lines.filter(isLine).map((l) => ({ ...l, qty: Math.min(l.qty, MAX_QTY) })) : [];
  return { lines, updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0 };
});

const writeLines = (lines: CartLine[], updatedAt = Date.now()) => cartStore.write({ lines, updatedAt });

export function useCart(): CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.read, cartStore.server).lines;
}

export function readCart(): CartState {
  return cartStore.read();
}

export function subscribeCart(listener: Listener) {
  return cartStore.subscribe(listener);
}

export function addToCart(line: Omit<CartLine, "qty">, qty = 1) {
  const lines = cartStore.read().lines;
  const hit = lines.find((l) => l.sku === line.sku);
  const next = hit
    ? lines.map((l) => (l === hit ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l))
    : [...lines, { ...line, qty: Math.min(MAX_QTY, qty) }];
  writeLines(next);
  window.dispatchEvent(new Event(CART_ADDED));
}

export function setCartQty(sku: string, qty: number) {
  const lines = cartStore.read().lines;
  writeLines(qty <= 0 ? lines.filter((l) => l.sku !== sku) : lines.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)));
}

export function clearCart() {
  writeLines([]);
}

/** Replaces the device cart with the server's (after sign-in merge, or when the server copy is newer). */
export function replaceCart(lines: CartLine[], updatedAt = Date.now()) {
  writeLines(lines.filter(isLine), updatedAt);
}

export function cartCount(lines: { qty: number }[]) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

// ── saved (wishlist) ────────────────────────────────────────────────────────────────────────────────────────────────

const savedStore = createStore<string[]>("meridian.saved.v2", [], (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(0, 100) : [],
);

export function useSaved() {
  return useSyncExternalStore(savedStore.subscribe, savedStore.read, savedStore.server);
}

export function readSaved() {
  return savedStore.read();
}

export function isSaved(slug: string) {
  return savedStore.read().includes(slug);
}

export function toggleSaved(slug: string) {
  const saved = savedStore.read();
  const on = !saved.includes(slug);
  savedStore.write(on ? [slug, ...saved] : saved.filter((s) => s !== slug));
  return on;
}

export function replaceSaved(slugs: string[]) {
  savedStore.write([...new Set(slugs)]);
}

// ── recently viewed ─────────────────────────────────────────────────────────────────────────────────────────────────

const recentStore = createStore<string[]>("meridian.recent.v2", [], (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(0, 8) : [],
);

export function useRecent() {
  return useSyncExternalStore(recentStore.subscribe, recentStore.read, recentStore.server);
}

export function touchRecent(slug: string) {
  recentStore.write([slug, ...recentStore.read().filter((s) => s !== slug)].slice(0, 8));
}

// ── panels ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Panel = "cart" | "menu" | "search" | null;
const panelStore = createStore<Panel>(null, null, () => null);

export function usePanel() {
  return useSyncExternalStore(panelStore.subscribe, panelStore.read, panelStore.server);
}

export function openPanel(panel: Panel) {
  panelStore.write(panel);
}

export function closePanel() {
  panelStore.write(null);
}
