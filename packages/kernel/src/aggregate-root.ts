/** A fact the domain raised; application code turns these into outbox events in the same transaction. */
export interface DomainEvent<Name extends string = string, Payload = unknown> {
  readonly name: Name;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Payload;
  readonly occurredAt: Date;
}

/** Base for aggregate roots: collects domain events until the repository has persisted the aggregate. */
export abstract class AggregateRoot<Event extends DomainEvent = DomainEvent> {
  private pending: Event[] = [];

  protected raise(event: Event): void {
    this.pending.push(event);
  }

  /** Returns and clears the events raised since the last call. */
  pullEvents(): Event[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  peekEvents(): readonly Event[] {
    return this.pending;
  }
}
