import { AggregateRoot, ensure, ValidationError } from "@meridian/kernel";
import type { EmailAddress } from "../shared/email-address";

export type StockAlertStatus = "pending" | "notified";

export interface StockAlertState {
  id: string;
  email: string;
  sku: string;
  slug: string;
  status: StockAlertStatus;
  createdAt: Date;
  notifiedAt: Date | null;
}

const SKU = /^[A-Z0-9][A-Z0-9-]{0,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeSku(input: string): string {
  const sku = input.trim().toUpperCase();
  if (!SKU.test(sku)) throw new ValidationError("Invalid SKU", { field: "sku" });
  return sku;
}

export function assertSlug(input: string): string {
  const slug = input.trim();
  if (slug.length > 120 || !SLUG.test(slug)) throw new ValidationError("Invalid product slug", { field: "slug" });
  return slug;
}

/**
 * "Tell me when this variant is back in stock" for one address and SKU.
 * Invariants: at most one pending alert per (email, sku) — enforced through `pendingKey`; an alert notifies once.
 */
export class StockAlert extends AggregateRoot {
  private constructor(private state: StockAlertState) {
    super();
  }

  static create(id: string, email: EmailAddress, sku: string, slug: string, now: Date): StockAlert {
    return new StockAlert({ id, email: email.value, sku: normalizeSku(sku), slug: assertSlug(slug), status: "pending", createdAt: now, notifiedAt: null });
  }

  static restore(state: StockAlertState): StockAlert {
    return new StockAlert({ ...state });
  }

  /** Uniqueness key while pending; null once notified so the shopper may ask again later. */
  static pendingKeyOf(email: string, sku: string): string {
    return `${email}|${sku}`;
  }

  get id() {
    return this.state.id;
  }
  get email() {
    return this.state.email;
  }
  get sku() {
    return this.state.sku;
  }
  get slug() {
    return this.state.slug;
  }
  get status() {
    return this.state.status;
  }

  get pendingKey(): string | null {
    return this.state.status === "pending" ? StockAlert.pendingKeyOf(this.state.email, this.state.sku) : null;
  }

  /** The SKU is available again. */
  markNotified(now: Date): void {
    ensure(this.state.status === "pending", "INVALID_TRANSITION", `Stock alert ${this.state.id} was already notified.`);
    this.state.status = "notified";
    this.state.notifiedAt = now;
  }

  snapshot(): StockAlertState {
    return { ...this.state };
  }
}
