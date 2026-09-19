import type { CommandPayloads, EventName, EventPayloads } from "@meridian/contracts";
import type { DomainEvent } from "@meridian/kernel";

export type OutboundEvent = { [N in EventName]: DomainEvent<N, EventPayloads[N]> }[EventName];
export type SendEmailPayload = CommandPayloads["notification.send-email"];

/**
 * Transactional outbox, bound to the unit of work that persists the aggregate: rows commit or roll back with the
 * state change and the relay publishes them afterwards (events to Kafka, commands to RabbitMQ).
 */
export abstract class MessageOutbox {
  abstract publish(events: readonly OutboundEvent[]): Promise<void>;
  abstract sendEmail(payload: SendEmailPayload, aggregate?: { type: string; id: string }): Promise<void>;
}
