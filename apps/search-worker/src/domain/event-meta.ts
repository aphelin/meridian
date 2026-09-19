import { ValidationError } from "@meridian/kernel";

/** Where a read-model change came from: the Kafka message id and the time the source fact occurred. */
export interface EventMeta {
  messageId: string;
  occurredAt: Date;
}

export function eventMeta(messageId: string, occurredAt: string): EventMeta {
  const at = new Date(occurredAt);
  if (!messageId || Number.isNaN(at.getTime())) throw new ValidationError("Event has no usable messageId or occurredAt");
  return { messageId, occurredAt: at };
}
