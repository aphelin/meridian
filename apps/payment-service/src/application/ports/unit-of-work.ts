import type { CommandName, CommandPayloads, EventName, EventPayloads } from "@meridian/contracts";
import type { PaymentRepository } from "../../domain";

export type OutboundMessage =
  | { [N in EventName]: { kind: "event"; name: N; aggregate: { type: string; id: string }; payload: EventPayloads[N] } }[EventName]
  | { [N in CommandName]: { kind: "command"; name: N; aggregate: { type: string; id: string } | null; payload: CommandPayloads[N] } }[CommandName];

/** Everything a command handler may touch inside one database transaction. */
export interface PaymentTransaction {
  readonly payments: PaymentRepository;
  /** Writes events and commands to the transactional outbox; published only if the transaction commits. */
  write(messages: readonly OutboundMessage[]): Promise<void>;
  /** Records (consumer, key) in the inbox; false when it was already recorded. Rolled back with the transaction. */
  claim(consumer: string, key: string): Promise<boolean>;
}

/** Runs `work` atomically: aggregate rows, outbox rows and inbox marks commit or roll back together. */
export abstract class UnitOfWork {
  abstract run<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
}
