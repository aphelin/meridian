import type { EventName, EventPayloads } from "@meridian/contracts";
import type { DomainEvent } from "@meridian/kernel";

/** A domain event whose name and payload are a contracts event, so it maps 1:1 onto an outbox row. */
export type ContractEvent<N extends EventName = EventName> = { [K in N]: DomainEvent<K, EventPayloads[K]> }[N];

export function contractEvent<N extends EventName>(name: N, aggregateType: string, aggregateId: string, payload: EventPayloads[N], occurredAt: Date): ContractEvent<N> {
  return { name, aggregateType, aggregateId, payload, occurredAt } as ContractEvent<N>;
}
