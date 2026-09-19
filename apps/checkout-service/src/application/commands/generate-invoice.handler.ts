import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { createLogger } from "@meridian/nest-kit";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Invoice, invoiceDocumentFor, InvoiceRepository, newId, type Order, OrderRepository, ShippingPolicies } from "../../domain";
import { InvoiceRenderer, InvoiceStorage, MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { GenerateInvoiceCommand, type GenerateInvoiceResult } from "./generate-invoice.command";

export const INVOICE_CONTENT_TYPE = "application/pdf";
const log = createLogger("GenerateInvoice");

/**
 * `checkout.generate-invoice`, idempotent per order:
 *   1. allocate the invoice number from the Postgres sequence and persist it (a retry reuses it, so storage outages do
 *      not burn numbers),
 *   2. render the PDF and store it in the invoices bucket (timeout + breaker + chaos `s3.put`; a failure throws so the
 *      message is retried and finally dead-lettered, and a replay resumes here),
 *   3. mark the invoice issued and record it on the order with InvoiceIssued, in one version-guarded transaction.
 * An order that already has its invoice is left alone, so exactly one InvoiceIssued is raised per order.
 */
@CommandHandler(GenerateInvoiceCommand)
export class GenerateInvoiceHandler implements ICommandHandler<GenerateInvoiceCommand, GenerateInvoiceResult> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly invoices: InvoiceRepository,
    private readonly renderer: InvoiceRenderer,
    private readonly storage: InvoiceStorage,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    private readonly shipping: ShippingPolicies,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ orderId }: GenerateInvoiceCommand): Promise<GenerateInvoiceResult> {
    const order = await this.load(orderId);
    if (order.invoice) return "already-issued";
    if (!order.isPaid) throw new DomainError("INVALID_TRANSITION", "Invoices are issued for paid orders only.", { orderId, status: order.status });

    const invoice = await this.uow.run(async (tx) => {
      const existing = await this.invoices.findByOrderId(orderId, tx);
      if (existing) return existing;
      const sequence = await this.invoices.nextSequence(tx);
      return this.invoices.insertIfAbsent(Invoice.allocate({ id: newId(), orderId, sequence, totalCents: order.totalCents, now: this.clock.now() }), tx);
    });

    const snapshot = order.snapshot();
    const label = this.shipping.has(snapshot.shippingMethod) ? this.shipping.get(snapshot.shippingMethod).label : snapshot.shippingMethod;
    const pdf = await this.renderer.render(invoiceDocumentFor(snapshot, invoice.number, invoice.createdAt, label));
    await this.storage.put(invoice.objectKey, pdf, INVOICE_CONTENT_TYPE);

    const issued = await retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const fresh = await this.orders.findById(orderId, tx);
        const stored = await this.invoices.findByOrderId(orderId, tx);
        if (!fresh || !stored) throw new NotFoundError(`Order ${orderId} not found`, { orderId });
        const now = this.clock.now();
        if (!fresh.issueInvoice(stored.number, now)) return false;
        stored.markIssued(now);
        await this.invoices.save(stored, tx);
        await this.orders.save(fresh, tx);
        await this.outbox.events(tx, fresh.pullEvents());
        return true;
      }),
    );
    if (issued) log.info("invoice issued", { orderId, invoiceNumber: invoice.number, bytes: pdf.byteLength });
    return issued ? "issued" : "already-issued";
  }

  private async load(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError(`Order ${orderId} not found`, { orderId });
    return order;
  }
}
