import type { PrismaTx } from "./prisma";

/**
 * Idempotent consumer. Records `(messageId, consumer)` in the contract `Inbox` table and runs `work` only when this
 * is the first time, in the same transaction, so the side effects and the dedupe record commit or roll back together.
 * Returns whether `work` ran.
 */
export const Inbox = {
  async once(tx: PrismaTx, consumer: string, messageId: string, work: () => Promise<unknown> | unknown): Promise<boolean> {
    if (!consumer) throw new TypeError("Inbox.once: consumer is required");
    if (!messageId) throw new TypeError("Inbox.once: messageId is required");
    const inserted = await tx.$executeRaw`
      INSERT INTO "Inbox" ("messageId", "consumer", "processedAt") VALUES (${messageId}, ${consumer}, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING`;
    if (inserted === 0) return false;
    await work();
    return true;
  },
};
