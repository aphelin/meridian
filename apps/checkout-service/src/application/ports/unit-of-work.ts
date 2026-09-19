import type { TransactionContext } from "../../domain";

/** Runs work atomically: repositories, outbox rows and inbox marks written with `tx` commit or roll back together. */
export abstract class UnitOfWork {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
