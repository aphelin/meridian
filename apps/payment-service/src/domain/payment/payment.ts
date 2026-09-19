import type { CurrencyCode, PaymentProviderId, PaymentStatus } from "@meridian/contracts";
import { AggregateRoot, DomainError, Money, ensure } from "@meridian/kernel";
import { type PaymentEvent, type RefundKind, paymentEvent } from "./payment.events";
import { PaymentIds } from "./payment-ids";

export type RefundStatus = "pending" | "succeeded" | "failed";

export interface RefundState {
  refundId: string;
  kind: RefundKind;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  providerRefundId: string | null;
  failureReason: string | null;
  dispatchLeaseUntil: Date | null;
  createdAt: Date;
  settledAt: Date | null;
}

export interface PaymentState {
  id: string;
  orderId: string;
  orderNumber: string;
  transactionId: string;
  provider: PaymentProviderId;
  status: PaymentStatus;
  amountCents: number;
  currency: CurrencyCode;
  clientSecretHash: string | null;
  providerTransactionId: string | null;
  failureReason: string | null;
  voidReason: string | null;
  succeededAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  refunds: RefundState[];
}

export interface OpenPaymentInput {
  id: string;
  orderId: string;
  orderNumber: string;
  transactionId: string;
  provider: PaymentProviderId;
  amount: Money;
  clientSecretHash: string | null;
  now: Date;
}

export type RefundRequestOutcome = "accepted" | "duplicate" | "rejected";
/** accepted: talk to the provider now; in-flight: another worker holds the lease; submitted: awaiting provider confirmation; settled: nothing to do. */
export type RefundDispatchClaim = "dispatch" | "in-flight" | "submitted" | "settled";
/** captured: order confirmed; duplicate: already captured; refund-required: money arrived after the payment was closed. */
export type CaptureOutcome = "captured" | "duplicate" | "refund-required";

const CAPTURED: readonly PaymentStatus[] = ["succeeded", "partially_refunded", "refunded"];
const MAX_REASON = 500;
const clip = (text: string) => (text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text);

/**
 * One order's payment. Invariants:
 * - amount is a positive whole number of cents and never changes;
 * - pending → succeeded | failed | voided; captured payments move between succeeded/partially_refunded/refunded
 *   by their succeeded refunds, and may be voided (the uncaptured remainder is refunded);
 * - succeeded + pending refunds never exceed the amount; a refundId is applied at most once;
 * - local sandbox payments carry a client-secret hash, Paddle payments never do; Stripe test payments carry one for the
 *   test-mode sandbox-complete shortcut.
 */
export class Payment extends AggregateRoot<PaymentEvent> {
  private constructor(private state: PaymentState) {
    super();
  }

  static open(input: OpenPaymentInput): Payment {
    ensure(input.amount.cents > 0, "VALIDATION_FAILED", "A payment amount must be greater than zero.");
    ensure(input.orderId.trim().length > 0, "VALIDATION_FAILED", "A payment needs an order.");
    if (input.provider === "local-sandbox") ensure(!!input.clientSecretHash, "VALIDATION_FAILED", "Local sandbox payments need a client secret.");
    else if (input.provider === "paddle-sandbox") ensure(input.clientSecretHash === null, "VALIDATION_FAILED", "Paddle payments do not use a client secret.");
    return new Payment({
      id: input.id,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      transactionId: input.transactionId,
      provider: input.provider,
      status: "pending",
      amountCents: input.amount.cents,
      currency: input.amount.currency,
      clientSecretHash: input.clientSecretHash,
      providerTransactionId: null,
      failureReason: null,
      voidReason: null,
      succeededAt: null,
      voidedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      refunds: [],
    });
  }

  static restore(state: PaymentState): Payment {
    return new Payment({ ...state, refunds: state.refunds.map((r) => ({ ...r })) });
  }

  get id() {
    return this.state.id;
  }
  get orderId() {
    return this.state.orderId;
  }
  get transactionId() {
    return this.state.transactionId;
  }
  get provider() {
    return this.state.provider;
  }
  get status() {
    return this.state.status;
  }
  get amount() {
    return Money.cents(this.state.amountCents, this.state.currency);
  }
  get clientSecretHash() {
    return this.state.clientSecretHash;
  }
  get providerTransactionId() {
    return this.state.providerTransactionId;
  }
  get isCaptured() {
    return this.state.succeededAt !== null;
  }

  snapshot(): PaymentState {
    return { ...this.state, refunds: this.state.refunds.map((r) => ({ ...r })) };
  }

  refund(refundId: string): RefundState | undefined {
    const found = this.state.refunds.find((r) => r.refundId === refundId);
    return found ? { ...found } : undefined;
  }

  /** Sum of succeeded refunds. */
  get refundedCents(): number {
    return this.state.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCents, 0);
  }

  /** What may still be refunded: amount minus succeeded and in-flight refunds. */
  get refundableCents(): number {
    const committed = this.state.refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amountCents, 0);
    return Math.max(0, this.state.amountCents - committed);
  }

  /** Refunds that still have to be sent to the provider. */
  refundsAwaitingDispatch(): string[] {
    return this.state.refunds.filter((r) => r.status === "pending" && r.providerRefundId === null).map((r) => r.refundId);
  }

  /** An intent replay must describe the same charge. */
  matchesCharge(amount: Money): boolean {
    return this.state.amountCents === amount.cents && this.state.currency === amount.currency;
  }

  /** Links the provider transaction (Paddle transaction, Stripe PaymentIntent) created for this payment. Idempotent; a different id is refused. */
  attachProviderTransaction(providerTransactionId: string, now: Date): void {
    ensure(this.state.provider !== "local-sandbox", "INVALID_TRANSITION", "Local sandbox payments have no provider transaction.");
    ensure(providerTransactionId.trim().length > 0, "VALIDATION_FAILED", "Provider transaction id is empty.");
    if (this.state.providerTransactionId === providerTransactionId) return;
    ensure(this.state.providerTransactionId === null, "CONFLICT", "This payment is already linked to another provider transaction.");
    this.state.providerTransactionId = providerTransactionId;
    this.touch(now);
  }

  /**
   * The shopper paid while the order is still payable (local sandbox completion). Replays are no-ops (false).
   * A closed payment refuses: nothing is charged for an order that expired or was cancelled.
   */
  succeed(now: Date): boolean {
    if (this.state.succeededAt) return false;
    if (this.state.status !== "pending") {
      throw new DomainError("ORDER_NOT_PAYABLE", "This order can no longer be paid, so nothing was charged. Please place it again.", { status: this.state.status });
    }
    this.capture(now);
    return true;
  }

  /**
   * The provider reports captured money (Paddle webhook). Money that arrives after the payment was voided or failed
   * cannot be refused, so it is recorded and a full refund is scheduled instead of confirming the order.
   */
  recordProviderCapture(now: Date): CaptureOutcome {
    if (this.state.succeededAt) return "duplicate";
    if (this.state.status === "pending") {
      this.capture(now);
      return "captured";
    }
    this.state.succeededAt = now;
    if (this.state.status !== "voided") {
      this.state.status = "voided";
      this.state.voidedAt = now;
      this.state.voidReason = "Payment captured after it was closed";
      this.raise(paymentEvent("PaymentVoided", this.state.id, { paymentId: this.state.id, orderId: this.state.orderId, reason: this.state.voidReason }, now));
    }
    this.addRefund(PaymentIds.voidRefund(this.state.id), "void", this.state.amountCents, "Payment captured after the order was closed", now);
    this.touch(now);
    return "refund-required";
  }

  /**
   * One attempt to pay was declined but the shopper may retry on the same provider transaction (Stripe
   * payment_intent.payment_failed): the reason is kept, the payment stays pending and no event is raised.
   */
  recordFailedAttempt(reason: string, now: Date): boolean {
    if (this.state.status !== "pending") return false;
    this.state.failureReason = clip(reason);
    this.touch(now);
    return true;
  }

  /** The provider gave up on an uncaptured payment. */
  fail(reason: string, now: Date): boolean {
    if (this.state.status !== "pending") return false;
    this.state.status = "failed";
    this.state.failureReason = clip(reason);
    this.touch(now);
    this.raise(
      paymentEvent("PaymentFailed", this.state.id, { paymentId: this.state.id, orderId: this.state.orderId, transactionId: this.state.transactionId, reason: this.state.failureReason }, now),
    );
    return true;
  }

  /**
   * Checkout says the order is no longer payable. Pending payments close; captured money not yet refunded is
   * refunded in full (a pending `void` refund the application dispatches). Idempotent.
   */
  void(reason: string, now: Date): boolean {
    const status = this.state.status;
    if (status === "voided" || status === "failed") return false;
    if (this.isCaptured) {
      const remaining = this.refundableCents;
      if (remaining > 0 && !this.refund(PaymentIds.voidRefund(this.state.id))) {
        this.addRefund(PaymentIds.voidRefund(this.state.id), "void", remaining, clip(reason), now);
      }
    }
    this.state.status = "voided";
    this.state.voidReason = clip(reason);
    this.state.voidedAt = now;
    this.touch(now);
    this.raise(paymentEvent("PaymentVoided", this.state.id, { paymentId: this.state.id, orderId: this.state.orderId, reason: this.state.voidReason }, now));
    return true;
  }

  /**
   * Checkout asks for a refund. The same refundId is applied once ("duplicate"). A refund the payment cannot honour is
   * recorded as failed with RefundFailed ("rejected"), so checkout learns the outcome; otherwise it is pending ("accepted").
   */
  requestRefund(input: { refundId: string; amountCents: number; reason: string; now: Date }): RefundRequestOutcome {
    if (this.refund(input.refundId)) return "duplicate";
    const rejection = this.refundRejection(input.amountCents);
    const reason = clip(input.reason);
    if (rejection) {
      this.state.refunds.push({
        refundId: input.refundId,
        kind: "refund",
        amountCents: Math.max(0, Math.trunc(input.amountCents)),
        reason,
        status: "failed",
        providerRefundId: null,
        failureReason: rejection,
        dispatchLeaseUntil: null,
        createdAt: input.now,
        settledAt: input.now,
      });
      this.touch(input.now);
      this.raise(
        paymentEvent("RefundFailed", this.state.id, { orderId: this.state.orderId, refundId: input.refundId, reason: rejection }, input.now, {
          refundKind: "refund",
          refundReason: reason,
          refundAmountCents: Math.max(0, Math.trunc(input.amountCents)),
        }),
      );
      return "rejected";
    }
    this.addRefund(input.refundId, "refund", input.amountCents, reason, input.now);
    this.touch(input.now);
    return "accepted";
  }

  /**
   * Takes the right to call the provider for a pending refund for `leaseMs`. Two workers never refund the same
   * refundId concurrently; a crashed worker's lease simply expires.
   */
  claimRefundDispatch(refundId: string, now: Date, leaseMs: number): RefundDispatchClaim {
    const refund = this.mustFindRefund(refundId);
    if (refund.status !== "pending") return "settled";
    if (refund.providerRefundId !== null) return "submitted";
    if (refund.dispatchLeaseUntil && refund.dispatchLeaseUntil.getTime() > now.getTime()) return "in-flight";
    refund.dispatchLeaseUntil = new Date(now.getTime() + leaseMs);
    this.touch(now);
    return "dispatch";
  }

  releaseRefundDispatch(refundId: string, now: Date): void {
    const refund = this.mustFindRefund(refundId);
    if (refund.status !== "pending" || refund.dispatchLeaseUntil === null) return;
    refund.dispatchLeaseUntil = null;
    this.touch(now);
  }

  /** The provider accepted the refund but settles it later (Paddle adjustment awaiting approval). */
  markRefundSubmitted(refundId: string, providerRefundId: string, now: Date): void {
    const refund = this.mustFindRefund(refundId);
    if (refund.status !== "pending") return;
    ensure(refund.providerRefundId === null || refund.providerRefundId === providerRefundId, "CONFLICT", "Refund is already linked to another provider refund.");
    refund.providerRefundId = providerRefundId;
    refund.dispatchLeaseUntil = null;
    this.touch(now);
  }

  /** Money went back to the customer. Idempotent. */
  completeRefund(refundId: string, providerRefundId: string | null, now: Date): boolean {
    const refund = this.mustFindRefund(refundId);
    if (refund.status !== "pending") return false;
    refund.status = "succeeded";
    refund.providerRefundId = providerRefundId ?? refund.providerRefundId;
    refund.dispatchLeaseUntil = null;
    refund.settledAt = now;
    this.recomputeCapturedStatus();
    this.touch(now);
    this.raise(
      paymentEvent(
        "PaymentRefunded",
        this.state.id,
        { paymentId: this.state.id, orderId: this.state.orderId, refundId, amountCents: refund.amountCents, provider: this.state.provider },
        now,
        { refundKind: refund.kind, refundReason: refund.reason, refundAmountCents: refund.amountCents },
      ),
    );
    return true;
  }

  /** The provider refused the refund; the balance becomes refundable again. Idempotent. */
  failRefund(refundId: string, reason: string, now: Date): boolean {
    const refund = this.mustFindRefund(refundId);
    if (refund.status !== "pending") return false;
    refund.status = "failed";
    refund.failureReason = clip(reason);
    refund.dispatchLeaseUntil = null;
    refund.settledAt = now;
    // A voided payment must return all captured money: a checkout refund that failed after the void frees balance
    // that is now refunded as part of the void. (A failed void refund is not retried automatically.)
    if (this.state.status === "voided" && this.isCaptured && refund.kind === "refund" && this.refundableCents > 0) {
      const sequence = this.state.refunds.filter((r) => r.kind === "void").length + 1;
      this.addRefund(PaymentIds.voidRefund(this.state.id, sequence), "void", this.refundableCents, this.state.voidReason ?? "Payment voided", now);
    }
    this.touch(now);
    this.raise(
      paymentEvent("RefundFailed", this.state.id, { orderId: this.state.orderId, refundId, reason: refund.failureReason }, now, {
        refundKind: refund.kind,
        refundReason: refund.reason,
        refundAmountCents: refund.amountCents,
      }),
    );
    return true;
  }

  private refundRejection(amountCents: number): string | null {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return "Refund amount must be a positive whole number of cents.";
    if (!CAPTURED.includes(this.state.status)) return `The payment is ${this.state.status}, so there is nothing to refund.`;
    const refundable = this.refundableCents;
    if (amountCents > refundable) {
      return `A refund of ${Money.cents(amountCents, this.state.currency)} exceeds the refundable balance of ${Money.cents(refundable, this.state.currency)}.`;
    }
    return null;
  }

  private addRefund(refundId: string, kind: RefundKind, amountCents: number, reason: string, now: Date) {
    ensure(amountCents > 0 && amountCents <= this.refundableCents, "VALIDATION_FAILED", "Refund exceeds the refundable balance.");
    this.state.refunds.push({
      refundId,
      kind,
      amountCents,
      reason,
      status: "pending",
      providerRefundId: null,
      failureReason: null,
      dispatchLeaseUntil: null,
      createdAt: now,
      settledAt: null,
    });
  }

  private capture(now: Date) {
    this.state.status = "succeeded";
    this.state.succeededAt = now;
    this.touch(now);
    this.raise(
      paymentEvent(
        "PaymentSucceeded",
        this.state.id,
        { paymentId: this.state.id, orderId: this.state.orderId, transactionId: this.state.transactionId, amountCents: this.state.amountCents, provider: this.state.provider },
        now,
      ),
    );
  }

  private recomputeCapturedStatus() {
    if (!CAPTURED.includes(this.state.status)) return;
    const refunded = this.refundedCents;
    this.state.status = refunded === 0 ? "succeeded" : refunded >= this.state.amountCents ? "refunded" : "partially_refunded";
  }

  private mustFindRefund(refundId: string): RefundState {
    const refund = this.state.refunds.find((r) => r.refundId === refundId);
    if (!refund) throw new DomainError("NOT_FOUND", "Refund not found.", { refundId });
    return refund;
  }

  private touch(now: Date) {
    this.state.updatedAt = now;
  }
}
