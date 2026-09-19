import type { PrismaTx } from "@meridian/nest-kit";

/** The transaction handle handed to repositories, `OutboxWriter` and `Inbox` inside one unit of work. */
export type Tx = PrismaTx;

/** Runs work in one atomic unit: aggregate writes, outbox rows and inbox marks commit or roll back together. */
export abstract class TransactionRunner {
  abstract run<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}
