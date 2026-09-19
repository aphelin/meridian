import type { ContactRequest, EventPayloads } from "@meridian/contracts";
import type { OrderEmailEvent, ProductDirectoryChange } from "../../domain";

/** A shopper wrote to support: store it, mail support and acknowledge to the sender. */
export class SubmitContactMessageCommand {
  constructor(
    readonly request: ContactRequest,
    readonly correlationId: string,
  ) {}
}

/** "Email me when this is back in stock." */
export class CreateStockAlertCommand {
  constructor(
    readonly email: string,
    readonly sku: string,
    readonly slug: string,
  ) {}
}

/** Kafka StockReplenished: notify every pending alert for the SKU exactly once. */
export class NotifyStockAlertsCommand {
  constructor(
    readonly sku: string,
    readonly messageId: string,
  ) {}
}

/** Kafka OrderPlaced: remember the recipient and address for later order emails. */
export class RecordOrderRecipientCommand {
  constructor(
    readonly payload: EventPayloads["OrderPlaced"],
    readonly messageId: string,
  ) {}
}

/** Kafka order lifecycle event → customer email. */
export class DispatchOrderEmailCommand {
  constructor(
    readonly event: OrderEmailEvent,
    readonly messageId: string,
  ) {}
}

/** Kafka UserDeleted: unsubscribe the newsletter and delete stock alerts and stored order addresses. */
export class ForgetCustomerCommand {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly messageId: string,
  ) {}
}

/** Kafka ProductPublished / ProductUpdated / ProductArchived: keep the product directory current (amendment 1o). */
export class ProjectProductCommand {
  constructor(
    readonly change: ProductDirectoryChange,
    readonly messageId: string,
  ) {}
}
