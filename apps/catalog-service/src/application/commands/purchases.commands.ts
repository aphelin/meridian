import { Command } from "@nestjs/cqrs";

export interface DeliveredOrder {
  orderId: string;
  userId: string;
  customerName: string;
  deliveredAt: Date;
  slugs: string[];
}

/** From OrderDelivered: remember which products a customer received (enables verified reviews). */
export class RecordPurchasesCommand extends Command<boolean> {
  constructor(
    readonly messageId: string,
    readonly order: DeliveredOrder,
  ) {
    super();
  }
}

/** From UserDeleted: drop the user's wishlist and purchase records, anonymise their reviews. */
export class ForgetUserCommand extends Command<boolean> {
  constructor(
    readonly messageId: string,
    readonly userId: string,
  ) {
    super();
  }
}
