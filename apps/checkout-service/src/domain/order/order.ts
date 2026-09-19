import type {
  CancellationReason,
  CustomerRef,
  OrderLineSnapshot,
  OrderStatus,
  PostalAddress,
  PricingBreakdown,
  ShippingMethodId,
  OrderHeader,
  SkuQty,
} from "@meridian/contracts";
import { AggregateRoot, DomainError, ensure, Money } from "@meridian/kernel";
import { assertConsistentPricing } from "../pricing/pricing-calculator";
import { type ContractEvent, contractEvent } from "../shared/events";
import { newId } from "../shared/ids";
import { formatEuros } from "../shared/money-format";
import { CANCELLABLE_STATUSES, canTransition, RETURN_WINDOW_DAYS, RETURNABLE_STATUSES } from "./order-status";
import { trackingUrlFor } from "./tracking";

export type TimelineStatus = OrderStatus | "refund" | "return";

export interface TimelineEntry {
  id: string;
  status: TimelineStatus;
  note: string | null;
  at: Date;
}

export type RefundStatus = "pending" | "succeeded" | "failed";

export interface Refund {
  id: string;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  returnId: string | null;
  failureReason: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

export type ReturnStatus = "requested" | "approved" | "rejected" | "refunded";

export interface ReturnRequest {
  id: string;
  status: ReturnStatus;
  lines: SkuQty[];
  reason: string;
  refundCents: number | null;
  restock: boolean | null;
  note: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface Fulfillment {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

export interface PaymentRef {
  paymentId: string | null;
  transactionId: string | null;
}

export interface OrderProps {
  id: string;
  number: string;
  status: OrderStatus;
  customer: CustomerRef;
  shippingAddress: PostalAddress;
  shippingMethod: ShippingMethodId;
  lines: OrderLineSnapshot[];
  pricing: PricingBreakdown;
  couponCode: string | null;
  refundedCents: number;
  cancellationReason: CancellationReason | null;
  cancelledAt: Date | null;
  payment: PaymentRef;
  paidAt: Date | null;
  paymentDeadline: Date | null;
  fulfillment: Fulfillment;
  invoice: { number: string; issuedAt: Date } | null;
  refunds: Refund[];
  returns: ReturnRequest[];
  timeline: TimelineEntry[];
  correlationId: string;
  createdAt: Date;
  /** 0 until first persisted; storage bumps it on every save. */
  version: number;
}

export interface PlaceOrderInput {
  id: string;
  number: string;
  customer: CustomerRef;
  shippingAddress: PostalAddress;
  shippingMethod: ShippingMethodId;
  lines: OrderLineSnapshot[];
  pricing: PricingBreakdown;
  couponCode: string | null;
  correlationId: string;
  holdMinutes: number;
  now: Date;
}

export interface CancellationOutcome {
  refundRequired: boolean;
  refundableCents: number;
  wasPaid: boolean;
  /** Pending refund opened for a paid order (the caller sends `payment.refund`). */
  refund: Refund | null;
  /** Committed stock to put back (paid orders); empty for unpaid orders, whose hold is released instead. */
  restockLines: SkuQty[];
}

export type FulfilmentStep = { status: "fulfilling" } | { status: "shipped"; carrier?: string | null; trackingNumber?: string | null } | { status: "delivered" };

export interface ReturnDecision {
  approved: boolean;
  return: ReturnRequest;
  refund: Refund | null;
  restockLines: SkuQty[];
}

export interface OrderActions {
  cancel: boolean;
  requestReturn: boolean;
  downloadInvoice: boolean;
  pay: boolean;
}

export const ANONYMISED_NAME = "Deleted customer";
export const anonymisedEmail = (userId: string) => `deleted-${userId}@anonymised.invalid`;

const clone = <T>(value: T): T => structuredClone(value);
const formatCents = (cents: number) => formatEuros(cents);
const describeLines = (lines: SkuQty[]) => lines.map((line) => `${line.qty} × ${line.sku}`).join(", ");

/**
 * Order aggregate: the placed basket (lines, pricing, customer, address) and its lifecycle through payment,
 * fulfilment, cancellation, refunds, returns and invoicing. Every change goes through the state machine and raises
 * the matching contracts event.
 */
export class Order extends AggregateRoot<ContractEvent> {
  private constructor(private props: OrderProps) {
    super();
  }

  static place(input: PlaceOrderInput): Order {
    ensure(input.lines.length > 0, "VALIDATION_FAILED", "An order needs at least one item.");
    ensure(new Set(input.lines.map((line) => line.sku)).size === input.lines.length, "VALIDATION_FAILED", "Each item may appear only once in an order.");
    for (const line of input.lines) {
      ensure(Number.isInteger(line.qty) && line.qty >= 1, "VALIDATION_FAILED", "Quantities must be positive.", { sku: line.sku });
      ensure(line.lineTotalCents === line.unitPriceCents * line.qty, "VALIDATION_FAILED", "Line total is inconsistent.", { sku: line.sku });
    }
    assertConsistentPricing(input.pricing, input.lines);
    ensure(Number.isFinite(input.holdMinutes) && input.holdMinutes > 0, "VALIDATION_FAILED", "Payment hold must be positive.");
    ensure(input.customer.email.length > 0 && input.customer.name.trim().length > 0, "VALIDATION_FAILED", "An order needs a customer name and email.");

    const order = new Order({
      id: input.id,
      number: input.number,
      status: "placed",
      customer: clone(input.customer),
      shippingAddress: clone(input.shippingAddress),
      shippingMethod: input.shippingMethod,
      lines: clone(input.lines),
      pricing: clone(input.pricing),
      couponCode: input.couponCode,
      refundedCents: 0,
      cancellationReason: null,
      cancelledAt: null,
      payment: { paymentId: null, transactionId: null },
      paidAt: null,
      paymentDeadline: new Date(input.now.getTime() + input.holdMinutes * 60_000),
      fulfillment: { carrier: null, trackingNumber: null, trackingUrl: null, shippedAt: null, deliveredAt: null },
      invoice: null,
      refunds: [],
      returns: [],
      timeline: [],
      correlationId: input.correlationId,
      createdAt: input.now,
      version: 0,
    });
    order.addTimeline("placed", null, input.now);
    order.raise(
      contractEvent("OrderPlaced", "Order", order.id, {
        ...order.header(),
        lines: clone(order.props.lines),
        pricing: clone(order.props.pricing),
        shippingAddress: clone(order.props.shippingAddress),
        shippingMethod: order.props.shippingMethod,
        couponCode: order.props.couponCode,
        placedAt: input.now.toISOString(),
      }, input.now),
    );
    return order;
  }

  static restore(props: OrderProps): Order {
    return new Order(clone(props));
  }

  // ── read model ────────────────────────────────────────────────────────────
  get id() {
    return this.props.id;
  }
  get number() {
    return this.props.number;
  }
  get status() {
    return this.props.status;
  }
  get customer(): Readonly<CustomerRef> {
    return this.props.customer;
  }
  get userId() {
    return this.props.customer.userId;
  }
  get version() {
    return this.props.version;
  }
  get isNew() {
    return this.props.version === 0;
  }
  get totalCents() {
    return this.props.pricing.totalCents;
  }
  get payment(): Readonly<PaymentRef> {
    return this.props.payment;
  }
  get paymentDeadline() {
    return this.props.paymentDeadline;
  }
  get isPaid() {
    return this.props.paidAt !== null;
  }
  get invoice(): Readonly<{ number: string; issuedAt: Date }> | null {
    return this.props.invoice;
  }

  snapshot(): OrderProps {
    return clone(this.props);
  }

  header(): OrderHeader {
    return { orderId: this.props.id, number: this.props.number, customer: clone(this.props.customer) };
  }

  /** Stock lines (sku + qty) for reservations. */
  stockLines(): SkuQty[] {
    return this.props.lines.map((line) => ({ sku: line.sku, qty: line.qty }));
  }

  // ── payment ───────────────────────────────────────────────────────────────
  /** Links the payment intent created for this order. Idempotent; never overwrites a different payment. */
  attachPaymentIntent(paymentId: string, transactionId: string): void {
    const current = this.props.payment;
    if (current.paymentId === paymentId && current.transactionId === transactionId) return;
    if (current.paymentId && current.paymentId !== paymentId) return;
    this.props.payment = { paymentId, transactionId };
  }

  isPayable(): boolean {
    return this.props.status === "placed";
  }

  isPaidBy(paymentId: string): boolean {
    return this.props.paidAt !== null && this.props.payment.paymentId === paymentId;
  }

  /** placed → paid for exactly the order total. */
  markPaid(input: { paymentId: string; transactionId: string; amountCents: number }, now: Date): void {
    if (!this.isPayable()) throw new DomainError("ORDER_NOT_PAYABLE", "This order can no longer be paid.", { status: this.props.status });
    if (input.amountCents !== this.props.pricing.totalCents) {
      throw new DomainError("ORDER_NOT_PAYABLE", "The payment amount does not match the order total.", { expected: this.props.pricing.totalCents, received: input.amountCents });
    }
    this.transitionTo("paid");
    this.props.payment = { paymentId: input.paymentId, transactionId: input.transactionId };
    this.props.paidAt = now;
    this.props.paymentDeadline = null;
    this.addTimeline("paid", null, now);
    this.raise(
      contractEvent("OrderPaid", "Order", this.id, { ...this.header(), lines: clone(this.props.lines), pricing: clone(this.props.pricing), paymentId: input.paymentId, paidAt: now.toISOString() }, now),
    );
  }

  // ── cancellation ──────────────────────────────────────────────────────────
  canCancel(): boolean {
    return CANCELLABLE_STATUSES.includes(this.props.status);
  }

  /**
   * Cancels the order. An unpaid order only gives up its stock hold (the caller releases it). A paid order that has not
   * shipped opens a refund of everything paid and not already refunded or pending, and its committed stock goes back
   * on the shelf (`restockLines`). Returns what the caller must orchestrate.
   */
  cancel(reason: CancellationReason, now: Date, note: string | null = null): CancellationOutcome {
    if (!this.canCancel()) throw new DomainError("ORDER_NOT_CANCELLABLE", "This order can no longer be cancelled.", { status: this.props.status });
    const wasPaid = this.props.status !== "placed";
    const refundableCents = wasPaid ? this.refundableCents() : 0;
    const refundRequired = refundableCents > 0;
    this.transitionTo("cancelled");
    this.props.cancellationReason = reason;
    this.props.cancelledAt = now;
    this.props.paymentDeadline = null;
    this.addTimeline("cancelled", note ?? reason, now);
    this.raise(
      contractEvent("OrderCancelled", "Order", this.id, { ...this.header(), reason, refundRequired, totalCents: this.props.pricing.totalCents, cancelledAt: now.toISOString() }, now),
    );
    const refund = refundRequired ? this.openRefund({ amountCents: refundableCents, reason: "Order cancelled", returnId: null }, now) : null;
    return { refundRequired, refundableCents, wasPaid, refund, restockLines: wasPaid ? this.stockLines() : [] };
  }

  /** Unpaid past its payment deadline (or explicitly swept). */
  isExpiredAt(now: Date): boolean {
    return this.props.status === "placed" && this.props.paymentDeadline !== null && this.props.paymentDeadline <= now;
  }

  // ── fulfilment ────────────────────────────────────────────────────────────
  /** Admin fulfilment step: paid → fulfilling → shipped (carrier + tracking number) → delivered. */
  advanceFulfilment(request: FulfilmentStep, now: Date): { from: OrderStatus; to: OrderStatus } {
    const from = this.props.status;
    if (request.status === "fulfilling") this.startFulfilment(now);
    else if (request.status === "shipped") this.ship({ carrier: request.carrier ?? "", trackingNumber: request.trackingNumber ?? "" }, now);
    else if (request.status === "delivered") this.deliver(now);
    else throw new DomainError("INVALID_TRANSITION", "Unknown fulfilment step.", { to: (request as { status: unknown }).status });
    return { from, to: this.props.status };
  }

  startFulfilment(now: Date): void {
    this.transitionTo("fulfilling");
    this.addTimeline("fulfilling", null, now);
    this.raise(contractEvent("OrderFulfilling", "Order", this.id, this.header(), now));
  }

  ship(input: { carrier: string; trackingNumber: string }, now: Date): void {
    const carrier = input.carrier?.trim() ?? "";
    const trackingNumber = input.trackingNumber?.trim() ?? "";
    ensure(carrier.length > 0 && trackingNumber.length > 0, "VALIDATION_FAILED", "Carrier and tracking number are required to ship.");
    this.transitionTo("shipped");
    const trackingUrl = trackingUrlFor(carrier, trackingNumber);
    this.props.fulfillment = { ...this.props.fulfillment, carrier, trackingNumber, trackingUrl, shippedAt: now };
    this.addTimeline("shipped", `${carrier} ${trackingNumber}`, now);
    this.raise(contractEvent("OrderShipped", "Order", this.id, { ...this.header(), carrier, trackingNumber, trackingUrl, shippedAt: now.toISOString() }, now));
  }

  deliver(now: Date): void {
    this.transitionTo("delivered");
    this.props.fulfillment = { ...this.props.fulfillment, deliveredAt: now };
    this.addTimeline("delivered", null, now);
    this.raise(
      contractEvent("OrderDelivered", "Order", this.id, {
        ...this.header(),
        lines: this.props.lines.map(({ sku, slug, productName }) => ({ sku, slug, productName })),
        deliveredAt: now.toISOString(),
      }, now),
    );
  }

  // ── refunds ───────────────────────────────────────────────────────────────
  /** Paid amount not yet refunded and not tied up in pending refunds. */
  refundableCents(): number {
    if (this.props.paidAt === null) return 0;
    return Math.max(0, this.props.pricing.totalCents - this.props.refundedCents - this.pendingRefundCents());
  }

  /** Sum of refunds sent to the payment provider whose outcome is not known yet. */
  pendingRefundCents(): number {
    return this.props.refunds.filter((refund) => refund.status === "pending").reduce((sum, refund) => sum + refund.amountCents, 0);
  }

  /** Opens a pending refund (the caller sends `payment.refund`). 0 < amount ≤ paid − refunded − pending. */
  requestRefund(input: { amountCents: number; reason: string; returnId?: string | null; refundId?: string }, now: Date): Refund {
    ensure(this.props.paidAt !== null, "INVALID_TRANSITION", "Only paid orders can be refunded.");
    ensure(this.props.status !== "refunded", "INVALID_TRANSITION", "This order is already fully refunded.");
    return clone(this.openRefund(input, now));
  }

  private openRefund(input: { amountCents: number; reason: string; returnId?: string | null; refundId?: string }, now: Date): Refund {
    ensure(Number.isSafeInteger(input.amountCents) && input.amountCents > 0, "VALIDATION_FAILED", "Refund amount must be positive.");
    const refundable = this.refundableCents();
    ensure(input.amountCents <= refundable, "VALIDATION_FAILED", `At most ${formatCents(refundable)} can be refunded.`, { refundableCents: refundable });
    const refund: Refund = {
      id: input.refundId ?? newId(),
      amountCents: input.amountCents,
      reason: input.reason.trim() || "refund",
      status: "pending",
      returnId: input.returnId ?? null,
      failureReason: null,
      createdAt: now,
      settledAt: null,
    };
    this.props.refunds.push(refund);
    this.addTimeline("refund", `Refund of ${formatCents(refund.amountCents)} requested: ${refund.reason}`, now);
    return refund;
  }

  /**
   * Records the provider's refund outcome. Idempotent per refundId: a refund that is already settled is left alone.
   * Returns whether anything changed.
   */
  recordRefundOutcome(input: { refundId: string; amountCents: number; status: "succeeded" | "failed"; reason: string | null }, now: Date): boolean {
    ensure(this.props.paidAt !== null, "INVALID_TRANSITION", "Only paid orders can be refunded.");
    ensure(Number.isSafeInteger(input.amountCents) && input.amountCents >= 0, "VALIDATION_FAILED", "Refund amount must not be negative.");
    let refund = this.props.refunds.find((candidate) => candidate.id === input.refundId);
    if (refund && refund.status !== "pending") return false;
    if (!refund) {
      // A refund the provider made on its own (e.g. voiding a settled payment): recorded so the totals reconcile.
      refund = { id: input.refundId, amountCents: input.amountCents, reason: input.reason ?? "refund", status: "pending", returnId: null, failureReason: null, createdAt: now, settledAt: null };
      this.props.refunds.push(refund);
    }
    refund.settledAt = now;
    if (input.status === "failed") {
      refund.status = "failed";
      refund.failureReason = input.reason ?? "The payment provider rejected the refund.";
      this.addTimeline("refund", `Refund of ${formatCents(refund.amountCents)} failed: ${refund.failureReason}`, now);
      return true;
    }
    refund.status = "succeeded";
    refund.amountCents = input.amountCents;
    const total = this.props.pricing.totalCents;
    this.props.refundedCents = Math.min(total, this.props.refundedCents + input.amountCents);
    const full = this.props.refundedCents >= total;
    this.addTimeline("refund", `Refunded ${formatCents(input.amountCents)}`, now);
    if (this.props.status !== "cancelled") {
      const next: OrderStatus | null = full
        ? "refunded"
        : this.props.status === "delivered"
          ? "partially_refunded"
          : null;
      if (next && next !== this.props.status) {
        this.transitionTo(next);
        this.addTimeline(next, null, now);
      }
    }
    const returned = refund.returnId ? this.props.returns.find((candidate) => candidate.id === refund.returnId) : undefined;
    if (returned && returned.status === "approved") {
      returned.status = "refunded";
      this.addTimeline("return", "Return refunded", now);
    }
    this.raise(
      contractEvent("OrderRefunded", "Order", this.id, {
        ...this.header(),
        refundId: refund.id,
        amountCents: input.amountCents,
        totalRefundedCents: this.props.refundedCents,
        full,
        reason: refund.reason,
      }, now),
    );
    return true;
  }

  // ── returns ───────────────────────────────────────────────────────────────
  canRequestReturn(now: Date): boolean {
    const deliveredAt = this.props.fulfillment.deliveredAt;
    if (!RETURNABLE_STATUSES.includes(this.props.status) || !deliveredAt) return false;
    if (now.getTime() - deliveredAt.getTime() > RETURN_WINDOW_DAYS * 86_400_000) return false;
    return this.props.lines.some((line) => this.returnableQty(line.sku) > 0);
  }

  /** Purchased quantity minus quantities in returns that were not rejected. */
  returnableQty(sku: string): number {
    const line = this.props.lines.find((candidate) => candidate.sku === sku);
    if (!line) return 0;
    const returned = this.props.returns
      .filter((ret) => ret.status !== "rejected")
      .flatMap((ret) => ret.lines)
      .filter((l) => l.sku === sku)
      .reduce((sum, l) => sum + l.qty, 0);
    return Math.max(0, line.qty - returned);
  }

  requestReturn(input: { lines: SkuQty[]; reason: string; returnId?: string }, now: Date): ReturnRequest {
    if (!this.canRequestReturn(now)) throw new DomainError("ORDER_NOT_RETURNABLE", `Returns are possible within ${RETURN_WINDOW_DAYS} days of delivery.`);
    ensure(input.lines.length > 0, "VALIDATION_FAILED", "Choose at least one item to return.");
    ensure(new Set(input.lines.map((line) => line.sku)).size === input.lines.length, "VALIDATION_FAILED", "List each item once.");
    for (const line of input.lines) {
      ensure(Number.isInteger(line.qty) && line.qty >= 1, "VALIDATION_FAILED", "Return quantities must be positive.", { sku: line.sku });
      const available = this.returnableQty(line.sku);
      if (line.qty > available) throw new DomainError("ORDER_NOT_RETURNABLE", `At most ${available} of ${line.sku} can be returned.`, { sku: line.sku, available });
    }
    const request: ReturnRequest = {
      id: input.returnId ?? newId(),
      status: "requested",
      lines: clone(input.lines),
      reason: input.reason.trim(),
      refundCents: null,
      restock: null,
      note: null,
      createdAt: now,
      decidedAt: null,
    };
    this.props.returns.push(request);
    this.addTimeline("return", "Return requested", now);
    this.raise(contractEvent("ReturnRequested", "Order", this.id, { ...this.header(), returnId: request.id, lines: clone(request.lines), reason: request.reason }, now));
    return clone(request);
  }

  /** Default refund for returned lines: their line totals with the order discount pro-rated. */
  defaultReturnRefundCents(lines: SkuQty[]): number {
    const gross = lines.reduce((sum, returned) => {
      const line = this.props.lines.find((candidate) => candidate.sku === returned.sku);
      return sum + (line ? line.unitPriceCents * returned.qty : 0);
    }, 0);
    const { subtotalCents, discountCents } = this.props.pricing;
    const discountShare = subtotalCents > 0 ? Math.round((gross * discountCents) / subtotalCents) : 0;
    return Money.cents(Math.max(0, gross - discountShare)).cents;
  }

  /**
   * Decides a requested return. Approval opens the refund for it (by default the returned line totals with the order
   * discount pro-rated, capped at what is still refundable) and says which lines go back to stock; rejection keeps a
   * note for the shopper.
   */
  decideReturn(input: { returnId: string; approve: boolean; refundCents?: number; restock?: boolean; note?: string | null }, now: Date): ReturnDecision {
    const request = this.props.returns.find((candidate) => candidate.id === input.returnId);
    if (!request) throw new DomainError("NOT_FOUND", "Return not found.");
    ensure(request.status === "requested", "INVALID_TRANSITION", "This return was already decided.", { status: request.status });
    const note = input.note?.trim() || null;
    if (!input.approve) {
      request.status = "rejected";
      request.decidedAt = now;
      request.note = note;
      this.addTimeline("return", note ? `Return rejected: ${note}` : "Return rejected", now);
      this.raise(contractEvent("ReturnRejected", "Order", this.id, { ...this.header(), returnId: request.id, note: note ?? "" }, now));
      return { approved: false, return: clone(request), refund: null, restockLines: [] };
    }
    const refundable = this.refundableCents();
    let refundCents: number;
    if (input.refundCents === undefined) refundCents = Math.min(this.defaultReturnRefundCents(request.lines), refundable);
    else {
      ensure(Number.isSafeInteger(input.refundCents) && input.refundCents >= 0, "VALIDATION_FAILED", "Refund amount must not be negative.");
      ensure(input.refundCents <= refundable, "VALIDATION_FAILED", `At most ${formatCents(refundable)} can be refunded.`, { refundableCents: refundable });
      refundCents = input.refundCents;
    }
    const restock = input.restock ?? true;
    request.status = "approved";
    request.decidedAt = now;
    request.note = note;
    request.refundCents = refundCents;
    request.restock = restock;
    this.addTimeline("return", "Return approved", now);
    this.raise(contractEvent("ReturnApproved", "Order", this.id, { ...this.header(), returnId: request.id, lines: clone(request.lines), refundCents, restock }, now));
    const refund = refundCents > 0 ? this.openRefund({ amountCents: refundCents, reason: `Return of ${describeLines(request.lines)}`, returnId: request.id }, now) : null;
    return { approved: true, return: clone(request), refund: refund ? clone(refund) : null, restockLines: restock ? clone(request.lines) : [] };
  }

  findReturn(returnId: string): ReturnRequest | null {
    const found = this.props.returns.find((candidate) => candidate.id === returnId);
    return found ? clone(found) : null;
  }

  // ── invoice ───────────────────────────────────────────────────────────────
  /** Records the issued invoice. Idempotent: returns false when an invoice already exists. */
  issueInvoice(invoiceNumber: string, now: Date): boolean {
    if (this.props.invoice) return false;
    ensure(this.props.paidAt !== null, "INVALID_TRANSITION", "Invoices are issued for paid orders only.");
    ensure(/^INV-\d{4}-\d{6,}$/.test(invoiceNumber), "VALIDATION_FAILED", "Invalid invoice number.");
    this.props.invoice = { number: invoiceNumber, issuedAt: now };
    this.raise(contractEvent("InvoiceIssued", "Order", this.id, { ...this.header(), invoiceNumber, totalCents: this.props.pricing.totalCents, issuedAt: now.toISOString() }, now));
    return true;
  }

  // ── privacy ───────────────────────────────────────────────────────────────
  /** Removes personal data after the customer deleted their account; the order itself stays for bookkeeping. */
  anonymiseCustomer(): boolean {
    const userId = this.props.customer.userId;
    if (!userId) return false;
    const email = anonymisedEmail(userId);
    if (this.props.customer.email === email && this.props.shippingAddress.phone === null && this.props.customer.name === ANONYMISED_NAME) return false;
    this.props.customer = { userId, name: ANONYMISED_NAME, email };
    this.props.shippingAddress = { ...this.props.shippingAddress, phone: null };
    return true;
  }

  // ── viewer permissions ────────────────────────────────────────────────────
  actionsAt(now: Date): OrderActions {
    return {
      cancel: this.canCancel(),
      requestReturn: this.canRequestReturn(now),
      downloadInvoice: this.props.invoice !== null,
      pay: this.isPayable() && (this.props.paymentDeadline === null || this.props.paymentDeadline > now),
    };
  }

  private transitionTo(next: OrderStatus): void {
    const from = this.props.status;
    if (!canTransition(from, next)) {
      throw new DomainError("INVALID_TRANSITION", `An order cannot go from ${from} to ${next}.`, { from, to: next });
    }
    this.props.status = next;
  }

  private addTimeline(status: TimelineStatus, note: string | null, at: Date) {
    this.props.timeline.push({ id: newId(), status, note, at });
  }
}
