/* In-memory fakes of the domain repositories and application ports for unit tests (no network, no database). */
import type { AdminOrderListDto, CommandName, CommandPayloads, CreateIntentRequest, OrderSummaryDto, Page, PaymentIntentDto, PaymentSummaryDto, SkuQty } from "@meridian/contracts";
import { ConflictError, DomainError, ValidationError } from "@meridian/kernel";
import {
  type AdminOrderFilter,
  type AdminReturnDto,
  type CatalogPrice,
  CatalogPricing,
  CheckoutSettings,
  InventoryReservations,
  InvoiceRenderer,
  InvoiceStorage,
  MessageOutbox,
  OrderAccessTokens,
  OrderReadModel,
  PaymentIntents,
  PaymentSummaries,
  type ReturnFilter,
  UnitOfWork,
  type AggregateRef,
} from "../application/ports";
import {
  type AuditEntry,
  AuditLog,
  Cart,
  type CartProps,
  CartRepository,
  ConcurrencyConflictError,
  Coupon,
  type CouponProps,
  type CouponRedemption,
  CouponRepository,
  type ContractEvent,
  Invoice,
  type InvoiceDocument,
  type InvoiceProps,
  InvoiceRepository,
  Order,
  type OrderProps,
  OrderRepository,
  type TransactionContext,
} from "../domain";

const TX = {} as TransactionContext;

export class InMemoryCartRepository extends CartRepository {
  readonly rows = new Map<string, CartProps>();

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? Cart.restore(structuredClone(row)) : null;
  }
  async findByUserId(userId: string) {
    const row = [...this.rows.values()].find((candidate) => candidate.userId === userId);
    return row ? Cart.restore(structuredClone(row)) : null;
  }
  async save(cart: Cart) {
    const stored = this.rows.get(cart.id);
    if (cart.isNew ? stored || (cart.userId && [...this.rows.values()].some((row) => row.userId === cart.userId)) : stored?.version !== cart.version) {
      throw new ConcurrencyConflictError("Cart", cart.id);
    }
    this.rows.set(cart.id, { id: cart.id, userId: cart.userId, lines: structuredClone([...cart.lines]), createdAt: cart.createdAt, updatedAt: cart.updatedAt, version: cart.version + 1 });
  }
  async deleteByUserId(userId: string) {
    let count = 0;
    for (const [id, row] of this.rows) if (row.userId === userId && this.rows.delete(id)) count++;
    return count;
  }
  async purgeGuestCartsIdleSince(before: Date) {
    let count = 0;
    for (const [id, row] of this.rows) if (row.userId === null && row.updatedAt < before && this.rows.delete(id)) count++;
    return count;
  }
}

export class InMemoryOrderRepository extends OrderRepository {
  readonly rows = new Map<string, OrderProps>();
  /** Makes the next save of this order id fail with a concurrency conflict (simulates a racing writer). */
  conflictOnce = new Set<string>();

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? Order.restore(row) : null;
  }
  async findByReturnId(returnId: string) {
    const row = [...this.rows.values()].find((candidate) => candidate.returns.some((ret) => ret.id === returnId));
    return row ? Order.restore(row) : null;
  }
  async findByUserId(userId: string) {
    return [...this.rows.values()].filter((row) => row.customer.userId === userId).map((row) => Order.restore(row));
  }
  async save(order: Order) {
    const o = order.snapshot();
    const stored = this.rows.get(o.id);
    if (this.conflictOnce.delete(o.id)) throw new ConcurrencyConflictError("Order", o.id);
    if (order.isNew ? stored : stored?.version !== o.version) throw new ConcurrencyConflictError("Order", o.id);
    this.rows.set(o.id, { ...o, version: o.version + 1 });
  }
  async findUnpaidIds(criteria: { placedBefore?: Date; limit: number }) {
    return [...this.rows.values()]
      .filter((row) => row.status === "placed" && (!criteria.placedBefore || row.createdAt <= criteria.placedBefore))
      .slice(0, criteria.limit)
      .map((row) => row.id);
  }
  get(id: string): OrderProps {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no order ${id}`);
    return row;
  }
}

export class InMemoryCouponRepository extends CouponRepository {
  readonly coupons = new Map<string, CouponProps>();
  readonly redemptions: CouponRedemption[] = [];

  add(coupon: Coupon) {
    this.coupons.set(coupon.code, coupon.snapshot());
    return this;
  }
  async findByCode(code: string) {
    const row = this.coupons.get(Coupon.normalizeCode(code));
    return row ? Coupon.restore(row) : null;
  }
  async hasRedemption(code: string, customerKey: string) {
    return this.redemptions.some((r) => r.couponCode === code && r.customerKey === customerKey);
  }
  async recordRedemption(coupon: Coupon, redemption: CouponRedemption) {
    const row = this.coupons.get(coupon.code)!;
    if (row.maxRedemptions !== null && row.redemptions >= row.maxRedemptions) throw new DomainError("COUPON_EXHAUSTED", "exhausted");
    if (redemption.onceKey && this.redemptions.some((r) => r.couponCode === redemption.couponCode && r.onceKey === redemption.onceKey)) {
      throw new DomainError("COUPON_ALREADY_USED", "already used");
    }
    row.redemptions += 1;
    this.redemptions.push(redemption);
  }
  async releaseRedemption(orderId: string) {
    const index = this.redemptions.findIndex((r) => r.orderId === orderId);
    if (index < 0) return false;
    const [removed] = this.redemptions.splice(index, 1);
    this.coupons.get(removed.couponCode)!.redemptions -= 1;
    return true;
  }
  async list() {
    return [...this.coupons.values()].map((row) => Coupon.restore({ ...row }));
  }
  async create(coupon: Coupon) {
    if (this.coupons.has(coupon.code)) throw new ConflictError(`A coupon with the code ${coupon.code} already exists.`);
    this.add(coupon);
  }
  async updateTerms(coupon: Coupon) {
    const row = this.coupons.get(coupon.code);
    if (!row) throw new Error(`no coupon ${coupon.code}`);
    this.coupons.set(coupon.code, { ...coupon.snapshot(), redemptions: row.redemptions });
  }
  async createIfMissing(coupon: Coupon) {
    if (this.coupons.has(coupon.code)) return false;
    this.add(coupon);
    return true;
  }
}

export class FakeUnitOfWork extends UnitOfWork {
  runs = 0;
  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    this.runs++;
    return work(TX);
  }
}

export interface OutboxRow {
  kind: "event" | "command";
  name: string;
  payload: unknown;
  aggregate: AggregateRef | null;
}

export class RecordingOutbox extends MessageOutbox {
  readonly rows: OutboxRow[] = [];
  readonly inbox = new Set<string>();

  async events(_tx: TransactionContext, events: readonly ContractEvent[]) {
    for (const event of events) this.rows.push({ kind: "event", name: event.name, payload: event.payload, aggregate: { type: event.aggregateType, id: event.aggregateId } });
  }
  async command<N extends CommandName>(_tx: TransactionContext, name: N, payload: CommandPayloads[N], aggregate?: AggregateRef) {
    this.rows.push({ kind: "command", name, payload, aggregate: aggregate ?? null });
    return `msg-${this.rows.length}`;
  }
  async once(_tx: TransactionContext, consumer: string, messageId: string, work: () => Promise<unknown>) {
    const key = `${consumer}:${messageId}`;
    if (this.inbox.has(key)) return false;
    this.inbox.add(key);
    await work();
    return true;
  }
  async wasProcessed(consumer: string, messageId: string) {
    return this.inbox.has(`${consumer}:${messageId}`);
  }
  named(name: string) {
    return this.rows.filter((row) => row.name === name);
  }
}

export const CATALOG: Record<string, CatalogPrice> = {
  "HOLT-CHA-3": { sku: "HOLT-CHA-3", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", variantId: "charcoal", priceCents: 240_000, status: "published", soldOut: false },
  "KITE-OCH": { sku: "KITE-OCH", slug: "kite-lamp", productName: "Kite", variantLabel: "Ochre linen", variantId: "ochre", priceCents: 54_000, status: "published", soldOut: false },
  "OOS-1": { sku: "OOS-1", slug: "oos-thing", productName: "Gone", variantLabel: "Only", variantId: "only", priceCents: 30_000, status: "published", soldOut: false },
  "OLD-1": { sku: "OLD-1", slug: "old", productName: "Old", variantLabel: "Only", variantId: "only", priceCents: 10_000, status: "archived", soldOut: false },
};

export class FakeCatalog extends CatalogPricing {
  calls: string[][] = [];
  /** SKUs whose product the catalog currently flags soldOut. */
  soldOut = new Set<string>();
  async pricesFor(skus: string[]) {
    this.calls.push(skus);
    return skus.flatMap((sku) => (CATALOG[sku] ? [{ ...CATALOG[sku], soldOut: CATALOG[sku].soldOut || this.soldOut.has(sku) }] : []));
  }
}

export class FakeInventory extends InventoryReservations {
  reserved: { orderId: string; lines: SkuQty[] }[] = [];
  committed: string[] = [];
  outOfStock = new Set<string>();
  reserveError: Error | null = null;
  commitFailures = 0;

  async reserve(orderId: string, lines: SkuQty[]) {
    if (this.reserveError) throw this.reserveError;
    const missing = lines.find((line) => this.outOfStock.has(line.sku));
    if (missing) throw new DomainError("OUT_OF_STOCK", `Out of stock: ${missing.sku}`, { sku: missing.sku, available: 0 });
    this.reserved.push({ orderId, lines });
  }
  async commit(orderId: string) {
    if (this.commitFailures > 0) {
      this.commitFailures--;
      throw new DomainError("UPSTREAM_UNAVAILABLE", "inventory down");
    }
    this.committed.push(orderId);
  }
}

export class FakePayments extends PaymentIntents {
  requests: CreateIntentRequest[] = [];
  down = false;
  async createIntent(request: CreateIntentRequest): Promise<PaymentIntentDto> {
    this.requests.push(request);
    if (this.down) throw new DomainError("UPSTREAM_UNAVAILABLE", "payment down");
    return { paymentId: `pay_${request.orderId}`, transactionId: `txn_${request.orderId}`, provider: "local-sandbox", status: "pending", clientSecret: "secret", paddle: null };
  }
}

export class FakeAccessTokens extends OrderAccessTokens {
  issue(orderId: string) {
    return `token-for-${orderId}`;
  }
  verify(orderId: string, token: string | null | undefined) {
    return token === this.issue(orderId);
  }
}

export class FixedSettings extends CheckoutSettings {
  constructor(
    readonly orderHoldMinutes = 15,
    readonly invoiceLinkSeconds = 300,
  ) {
    super();
  }
}

export class InMemoryOrderReadModel extends OrderReadModel {
  constructor(private readonly orders: InMemoryOrderRepository) {
    super();
  }
  async listForUser(userId: string, limit: number): Promise<OrderSummaryDto[]> {
    return this.newestFirst()
      .filter((row) => row.customer.userId === userId)
      .slice(0, limit)
      .map(summary);
  }
  async listForAdmin(filter: AdminOrderFilter): Promise<AdminOrderListDto> {
    const q = filter.q?.toLowerCase();
    const matching = this.newestFirst().filter(
      (row) =>
        (!filter.status || row.status === filter.status) &&
        (!q || row.number.toLowerCase() === q || row.customer.email.toLowerCase().includes(q) || row.customer.name.toLowerCase().includes(q)),
    );
    return paginate(matching, filter.cursor, filter.limit, (row) => ({ ...summary(row), customer: row.customer }));
  }
  async listReturns(filter: ReturnFilter): Promise<Page<AdminReturnDto>> {
    const returns = this.newestFirst()
      .flatMap((row) => row.returns.map((ret) => ({ order: row, ret, id: ret.id, createdAt: ret.createdAt })))
      .filter(({ ret }) => !filter.status || ret.status === filter.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return paginate(returns, filter.cursor, filter.limit, ({ order, ret }) => ({
      id: ret.id,
      orderId: order.id,
      status: ret.status,
      lines: ret.lines,
      reason: ret.reason,
      refundCents: ret.refundCents,
      note: ret.note,
      createdAt: ret.createdAt.toISOString(),
      decidedAt: ret.decidedAt ? ret.decidedAt.toISOString() : null,
      orderNumber: order.number,
      customer: order.customer,
    }));
  }
  private newestFirst() {
    return [...this.orders.rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }
}

function summary(row: OrderProps): OrderSummaryDto {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    totalCents: row.pricing.totalCents,
    itemCount: row.lines.reduce((sum, line) => sum + line.qty, 0),
    lines: row.lines.map(({ sku, slug, productName, qty }) => ({ sku, slug, productName, qty })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Offset cursor for the fake (the Prisma read model uses keyset cursors; both are opaque to callers). */
function paginate<R, T>(rows: R[], cursor: string | null, limit: number, map: (row: R) => T): Page<T> {
  const offset = cursor === null ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) throw new ValidationError("Invalid cursor.");
  const page = rows.slice(offset, offset + limit);
  return { items: page.map(map), nextCursor: offset + limit < rows.length ? String(offset + limit) : null };
}

export class InMemoryInvoiceRepository extends InvoiceRepository {
  readonly rows = new Map<string, InvoiceProps>();
  private sequence = 0;

  async findByOrderId(orderId: string) {
    const row = this.rows.get(orderId);
    return row ? Invoice.restore({ ...row }) : null;
  }
  async nextSequence() {
    return ++this.sequence;
  }
  async insertIfAbsent(invoice: Invoice) {
    if (!this.rows.has(invoice.orderId)) this.rows.set(invoice.orderId, invoice.snapshot());
    return Invoice.restore({ ...this.rows.get(invoice.orderId)! });
  }
  async save(invoice: Invoice) {
    this.rows.set(invoice.orderId, invoice.snapshot());
  }
}

export class InMemoryAuditLog extends AuditLog {
  readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry) {
    this.entries.push(structuredClone(entry));
  }
  async forOrder(orderId: string) {
    return this.entries.filter((entry) => entry.orderId === orderId);
  }
}

export class FakeInvoiceStorage extends InvoiceStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  /** Number of upcoming puts that fail (simulates a storage outage). */
  failures = 0;
  async put(objectKey: string, body: Uint8Array, contentType: string) {
    if (this.failures > 0) {
      this.failures--;
      throw new DomainError("UPSTREAM_UNAVAILABLE", "storage down");
    }
    this.objects.set(objectKey, { body, contentType });
  }
  async downloadUrl(objectKey: string, expiresInSec: number) {
    return { url: `https://storage.test/${objectKey}?expires=${expiresInSec}`, expiresAt: new Date(Date.UTC(2026, 8, 17, 10, 0, expiresInSec)) };
  }
}

export class FakeInvoiceRenderer extends InvoiceRenderer {
  readonly documents: InvoiceDocument[] = [];
  async render(document: InvoiceDocument) {
    this.documents.push(document);
    return new TextEncoder().encode(`%PDF-fake ${document.invoiceNumber}`);
  }
}

export class FakePaymentSummaries extends PaymentSummaries {
  down = false;
  readonly calls: string[] = [];
  async forOrder(orderId: string): Promise<PaymentSummaryDto | null> {
    this.calls.push(orderId);
    if (this.down) return null;
    return { paymentId: `pay_${orderId}`, transactionId: `txn_${orderId}`, provider: "local-sandbox", status: "succeeded", amountCents: 0, refundedCents: 0, createdAt: "2026-09-17T10:00:00.000Z", refunds: [] };
  }
}
