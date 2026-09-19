import type { InvoiceLinkDto } from "@meridian/contracts";
import { DomainError, NotFoundError } from "@meridian/kernel";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { InvoiceRepository, OrderRepository } from "../../domain";
import { CheckoutSettings, InvoiceStorage, OrderAccessTokens } from "../ports";
import { canViewOrder } from "../services";
import { GetInvoiceLinkQuery } from "./get-invoice-link.query";

/** Short-lived presigned download link for the order's invoice (owner, guest link or admin); 404 until it is issued. */
@QueryHandler(GetInvoiceLinkQuery)
export class GetInvoiceLinkHandler implements IQueryHandler<GetInvoiceLinkQuery, InvoiceLinkDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly invoices: InvoiceRepository,
    private readonly storage: InvoiceStorage,
    private readonly tokens: OrderAccessTokens,
    private readonly settings: CheckoutSettings,
  ) {}

  async execute(query: GetInvoiceLinkQuery): Promise<InvoiceLinkDto> {
    const order = await this.orders.findById(query.orderId);
    if (!order) throw new NotFoundError("Order not found.");
    if (!canViewOrder(order, query.viewer, query.accessToken, this.tokens)) throw new DomainError("FORBIDDEN", "You do not have access to this order.");
    const invoice = order.invoice ? await this.invoices.findByOrderId(order.id) : null;
    if (!invoice?.isIssued) throw new NotFoundError("The invoice for this order is not ready yet.");
    const link = await this.storage.downloadUrl(invoice.objectKey, this.settings.invoiceLinkSeconds);
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  }
}
