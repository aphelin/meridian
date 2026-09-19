import type { OneTimeTokenRepository, RefreshTokenRepository, UserRepository } from "../../domain";
import type { MessageOutbox } from "./message-outbox";

/** Repositories and outbox that share one database transaction. */
export interface TransactionScope {
  users: UserRepository;
  tokens: OneTimeTokenRepository;
  sessions: RefreshTokenRepository;
  outbox: MessageOutbox;
}

/** Runs `work` atomically: everything written through the scope commits together or not at all. */
export abstract class UnitOfWork {
  abstract run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T>;
}
