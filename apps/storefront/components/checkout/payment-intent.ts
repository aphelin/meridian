import type { PaymentIntentDto } from "@meridian/contracts";

/**
 * The payment intent of an order placed in this tab, kept in sessionStorage so a reload or a visit to the order page
 * can still complete the sandbox payment. It lives only for this tab and only until the payment deadline; the guest
 * order access token is never here (the BFF keeps it in an httpOnly cookie).
 */
export interface StoredIntent {
  orderId: string;
  number: string;
  totalCents: number;
  email: string;
  deadline: string | null;
  intent: PaymentIntentDto;
}

const PREFIX = "meridian.pay.";
const LAST = "meridian.pay.last";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const expired = (s: StoredIntent) => Boolean(s.deadline && Date.parse(s.deadline) < Date.now());

export function rememberIntent(stored: StoredIntent) {
  const store = storage();
  try {
    store?.setItem(PREFIX + stored.orderId, JSON.stringify(stored));
    store?.setItem(LAST, stored.orderId);
  } catch {
    // storage full or blocked: the payment step still works for this page view
  }
}

export function recallIntent(orderId: string): StoredIntent | null {
  const store = storage();
  try {
    const raw = store?.getItem(PREFIX + orderId);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredIntent;
    if (value?.orderId !== orderId || !value.intent || expired(value)) {
      forgetIntent(orderId);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** The last order placed in this tab that still waits for payment. */
export function recallLastIntent(): StoredIntent | null {
  const id = storage()?.getItem(LAST);
  return id ? recallIntent(id) : null;
}

export function forgetIntent(orderId: string) {
  const store = storage();
  try {
    store?.removeItem(PREFIX + orderId);
    if (store?.getItem(LAST) === orderId) store.removeItem(LAST);
  } catch {
    // ignore
  }
}
