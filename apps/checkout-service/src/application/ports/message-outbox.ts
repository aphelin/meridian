import type { CommandName, CommandPayloads } from "@meridian/contracts";
import type { ContractEvent, TransactionContext } from "../../domain";

export interface AggregateRef {
  type: string;
  id: string;
}

/** Transactional messaging: outbox rows for events and commands, and inbox dedupe for consumed messages. */
export abstract class MessageOutbox {
  /** Writes one outbox row per domain event, in order. */
  abstract events(tx: TransactionContext, events: readonly ContractEvent[]): Promise<void>;
  abstract command<N extends CommandName>(tx: TransactionContext, name: N, payload: CommandPayloads[N], aggregate?: AggregateRef): Promise<string>;
  /** Runs `work` only the first time `consumer` sees `messageId`, inside `tx`. Returns whether it ran. */
  abstract once(tx: TransactionContext, consumer: string, messageId: string, work: () => Promise<unknown>): Promise<boolean>;
  /** Read-only check used to short-circuit redeliveries before doing any remote work. */
  abstract wasProcessed(consumer: string, messageId: string): Promise<boolean>;
}
