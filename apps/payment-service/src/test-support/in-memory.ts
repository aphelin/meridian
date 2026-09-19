import type { PaymentProviderId } from "@meridian/contracts";
import { FixedClock } from "@meridian/kernel";
import {
  ClientSecrets,
  type OutboundMessage,
  type PaymentProvider,
  PaymentProviders,
  type PaymentTransaction,
  type ProviderRefundInput,
  type ProviderRefundResult,
  type ProviderTransactionInput,
  type SandboxConfirmationInput,
  UnitOfWork,
  WebhookVerifier,
} from "../application/ports";
import { Payment, PaymentRepository, type PaymentLookup, type PaymentState } from "../domain";

interface Db {
  payments: Map<string, PaymentState>;
  outbox: OutboundMessage[];
  inbox: Set<string>;
}

const cloneState = (s: PaymentState): PaymentState => ({ ...s, refunds: s.refunds.map((r) => ({ ...r })) });
const clone = (db: Db): Db => ({
  payments: new Map([...db.payments].map(([k, v]) => [k, cloneState(v)])),
  outbox: [...db.outbox],
  inbox: new Set(db.inbox),
});

/** Serialised in-memory unit of work with rollback on throw (a draft copy replaces the state only on success). */
export class InMemoryUnitOfWork extends UnitOfWork {
  db: Db = { payments: new Map(), outbox: [], inbox: new Set() };
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const draft = clone(this.db);
      const result = await work(this.bind(draft));
      this.db = draft;
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  payment(orderId: string): Payment | undefined {
    const state = [...this.db.payments.values()].find((p) => p.orderId === orderId);
    return state ? Payment.restore(state) : undefined;
  }

  messages(name?: string) {
    return this.db.outbox.filter((m) => !name || m.name === name);
  }

  private bind(db: Db): PaymentTransaction {
    class Repo extends PaymentRepository {
      async lock(lookup: PaymentLookup) {
        const states = [...db.payments.values()];
        const found = states.find((s) => {
          if ("orderId" in lookup) return s.orderId === lookup.orderId;
          if ("id" in lookup) return s.id === lookup.id;
          if ("transactionId" in lookup) return s.transactionId === lookup.transactionId;
          if ("providerTransactionId" in lookup) return s.providerTransactionId === lookup.providerTransactionId;
          return s.refunds.some((r) => r.providerRefundId === lookup.providerRefundId);
        });
        return found ? Payment.restore(cloneState(found)) : null;
      }
      async insert(payment: Payment) {
        const state = payment.snapshot();
        if ([...db.payments.values()].some((p) => p.orderId === state.orderId)) throw new Error("unique violation: orderId");
        db.payments.set(state.id, state);
      }
      async save(payment: Payment) {
        db.payments.set(payment.id, payment.snapshot());
      }
    }
    return {
      payments: new Repo(),
      async write(messages) {
        db.outbox.push(...messages);
      },
      async claim(consumer, key) {
        const k = `${consumer}|${key}`;
        if (db.inbox.has(k)) return false;
        db.inbox.add(k);
        return true;
      },
    };
  }
}

export class FakeProvider implements PaymentProvider {
  createCalls: ProviderTransactionInput[] = [];
  refundCalls: ProviderRefundInput[] = [];
  cancelCalls: string[] = [];
  confirmCalls: SandboxConfirmationInput[] = [];
  refundBehaviour: (input: ProviderRefundInput) => Promise<ProviderRefundResult> = async () => ({ status: "succeeded", providerRefundId: null });
  cancelBehaviour: (id: string) => Promise<void> = async () => undefined;
  confirmBehaviour: (input: SandboxConfirmationInput) => Promise<void> = async () => undefined;
  private txnCounter = 0;
  readonly transactionClientSecret?: (id: string) => Promise<string | null>;
  readonly confirmSandboxPayment?: (input: SandboxConfirmationInput) => Promise<void>;

  constructor(
    readonly id: PaymentProviderId,
    readonly supportsSandboxCompletion = id === "local-sandbox" || id === "stripe-test",
  ) {
    if (id === "stripe-test") {
      this.transactionClientSecret = async (txn) => `${txn}_secret_fake`;
      this.confirmSandboxPayment = async (input) => {
        this.confirmCalls.push(input);
        return this.confirmBehaviour(input);
      };
    }
  }

  async createTransaction(input: ProviderTransactionInput) {
    this.createCalls.push(input);
    if (this.id === "local-sandbox") return null;
    if (this.id === "stripe-test") {
      const id = `pi_fake_${++this.txnCounter}`;
      return { providerTransactionId: id, clientSecret: `${id}_secret_fake` };
    }
    return { providerTransactionId: `txn_paddle_${++this.txnCounter}` };
  }
  async refund(input: ProviderRefundInput) {
    this.refundCalls.push(input);
    return this.refundBehaviour(input);
  }
  async cancelTransaction(id: string) {
    this.cancelCalls.push(id);
    return this.cancelBehaviour(id);
  }
  clientToken() {
    return this.id === "paddle-sandbox" ? "test_token" : this.id === "stripe-test" ? "pk_test_fake" : null;
  }
}

export class FakeProviders extends PaymentProviders {
  constructor(
    readonly local = new FakeProvider("local-sandbox"),
    readonly paddle: FakeProvider | null = null,
    readonly stripe: FakeProvider | null = null,
  ) {
    super();
  }
  active() {
    return this.stripe ?? this.paddle ?? this.local;
  }
  get(id: PaymentProviderId) {
    return id === "local-sandbox" ? this.local : id === "stripe-test" ? this.stripe : this.paddle;
  }
}

export class PlainClientSecrets extends ClientSecrets {
  issue(paymentId: string) {
    return `secret-${paymentId}`;
  }
  hash(secret: string) {
    return `hash:${secret}`;
  }
  matches(secret: string, storedHash: string) {
    return this.hash(secret) === storedHash;
  }
}

export class StaticVerifier extends WebhookVerifier {
  valid = true;
  verify() {
    if (!this.valid) throw Object.assign(new Error("Invalid webhook signature."), { code: "UNAUTHORIZED" });
  }
}

export const testClock = () => new FixedClock(new Date("2026-09-17T10:00:00Z"));
export const settings = { refundDispatchLeaseMs: 30_000 };
