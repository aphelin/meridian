import { AggregateRoot, ensure } from "@meridian/kernel";
import { MAX_QTY_PER_LINE } from "../pricing/priced-line";
import type { ContractEvent } from "../shared/events";

export const MAX_CART_LINES = 50;
export const GUEST_CART_IDLE_DAYS = 30;

export interface CartLine {
  sku: string;
  variantId: string;
  slug: string;
  qty: number;
  unitPriceCents: number;
}

export interface CartProps {
  id: string;
  userId: string | null;
  lines: CartLine[];
  createdAt: Date;
  updatedAt: Date;
  /** 0 while never persisted; storage bumps it on every save (optimistic concurrency). */
  version: number;
}

/** A shopper's basket: a guest cart (addressed by id) or the single cart of a signed-in user. */
export class Cart extends AggregateRoot<ContractEvent> {
  private constructor(private props: CartProps) {
    super();
  }

  static open(id: string, userId: string | null, now: Date): Cart {
    ensure(id.length > 0, "VALIDATION_FAILED", "A cart needs an id.");
    return new Cart({ id, userId, lines: [], createdAt: now, updatedAt: now, version: 0 });
  }

  static restore(props: CartProps): Cart {
    return new Cart({ ...props, lines: props.lines.map((line) => ({ ...line })) });
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get lines(): readonly CartLine[] {
    return this.props.lines;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get version() {
    return this.props.version;
  }
  get isNew() {
    return this.props.version === 0;
  }
  get isGuest() {
    return this.props.userId === null;
  }
  get isEmpty() {
    return this.props.lines.length === 0;
  }

  /** Replaces every line (the storefront sends the whole basket). Lines must be unique per SKU. */
  replaceLines(lines: CartLine[], now: Date): void {
    ensure(lines.length <= MAX_CART_LINES, "VALIDATION_FAILED", `A bag holds at most ${MAX_CART_LINES} different items.`);
    const seen = new Set<string>();
    for (const line of lines) {
      Cart.assertLine(line);
      ensure(!seen.has(line.sku), "VALIDATION_FAILED", "Each item may appear only once in the bag.", { sku: line.sku });
      seen.add(line.sku);
    }
    this.props.lines = lines.map((line) => ({ ...line }));
    this.touch(now);
  }

  /**
   * Moves a guest cart into this user cart: quantities are summed per SKU and capped at the per-line maximum, lines
   * only in the guest cart are appended, and the guest cart is emptied.
   */
  mergeFrom(guest: Cart, now: Date): void {
    ensure(this.props.userId !== null, "VALIDATION_FAILED", "Only a signed-in cart can absorb a guest cart.");
    ensure(guest.isGuest, "FORBIDDEN", "That cart belongs to another account.");
    if (guest.id === this.id) return;
    const merged = this.props.lines.map((line) => ({ ...line }));
    for (const incoming of guest.lines) {
      const existing = merged.find((line) => line.sku === incoming.sku);
      if (existing) existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + incoming.qty);
      else merged.push({ ...incoming, qty: Math.min(MAX_QTY_PER_LINE, incoming.qty) });
    }
    ensure(merged.length <= MAX_CART_LINES, "VALIDATION_FAILED", `A bag holds at most ${MAX_CART_LINES} different items.`);
    this.props.lines = merged;
    this.touch(now);
    guest.clear(now);
  }

  clear(now: Date): void {
    this.props.lines = [];
    this.touch(now);
  }

  /** Guest carts untouched for GUEST_CART_IDLE_DAYS are purged; user carts never are. */
  isIdleGuest(now: Date, idleDays = GUEST_CART_IDLE_DAYS): boolean {
    return this.isGuest && now.getTime() - this.props.updatedAt.getTime() >= idleDays * 86_400_000;
  }

  private touch(now: Date) {
    this.props.updatedAt = now;
  }

  private static assertLine(line: CartLine) {
    ensure(typeof line.sku === "string" && line.sku.length > 0, "VALIDATION_FAILED", "A line needs a SKU.");
    ensure(Number.isInteger(line.qty) && line.qty >= 1 && line.qty <= MAX_QTY_PER_LINE, "VALIDATION_FAILED", `Quantity must be between 1 and ${MAX_QTY_PER_LINE}.`, { sku: line.sku });
    ensure(Number.isSafeInteger(line.unitPriceCents) && line.unitPriceCents >= 0, "VALIDATION_FAILED", "A price cannot be negative.", { sku: line.sku });
  }
}
