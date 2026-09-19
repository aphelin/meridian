import { ConsumerGroups } from "@meridian/contracts";
import { createLogger, Inbox } from "@meridian/nest-kit";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { purchaseRecordsFromDelivery } from "../../domain/review/purchase-record";
import { PurchaseRecordRepository, ReviewRepository } from "../../domain/review/review.repository";
import { WishlistRepository } from "../../domain/wishlist/wishlist.repository";
import { TransactionRunner } from "../ports/transaction";
import { ForgetUserCommand, RecordPurchasesCommand } from "./purchases.commands";

const log = createLogger("CatalogPurchases");
export const PURCHASES_CONSUMER = ConsumerGroups.catalogPurchases;

/** Idempotent per messageId (Inbox) and per (userId, slug) (the earliest delivery is kept). */
@CommandHandler(RecordPurchasesCommand)
export class RecordPurchasesHandler implements ICommandHandler<RecordPurchasesCommand, boolean> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly purchases: PurchaseRecordRepository,
  ) {}

  async execute({ messageId, order }: RecordPurchasesCommand): Promise<boolean> {
    const records = purchaseRecordsFromDelivery(order);
    const ran = await this.transactions.run((tx) =>
      Inbox.once(tx, PURCHASES_CONSUMER, messageId, async () => {
        for (const record of records) await this.purchases.record(record, tx);
      }),
    );
    if (ran) log.info("purchases recorded", { orderId: order.orderId, products: records.length });
    return ran;
  }
}

/** Account deletion: personal data goes, the review text and rating stay under "Former customer". */
@CommandHandler(ForgetUserCommand)
export class ForgetUserHandler implements ICommandHandler<ForgetUserCommand, boolean> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly reviews: ReviewRepository,
    private readonly purchases: PurchaseRecordRepository,
    private readonly wishlists: WishlistRepository,
  ) {}

  async execute({ messageId, userId }: ForgetUserCommand): Promise<boolean> {
    let summary = { reviews: 0, purchases: 0, wishlist: 0 };
    const ran = await this.transactions.run((tx) =>
      Inbox.once(tx, PURCHASES_CONSUMER, messageId, async () => {
        const reviews = await this.reviews.findByUser(userId, tx);
        for (const review of reviews) {
          review.anonymise();
          await this.reviews.save(review, tx);
        }
        const purchases = await this.purchases.deleteByUser(userId, tx);
        const wishlist = await this.wishlists.deleteByUser(userId, tx);
        summary = { reviews: reviews.length, purchases, wishlist };
      }),
    );
    if (ran) log.info("user data removed from catalog", { userId, ...summary });
    return ran;
  }
}
