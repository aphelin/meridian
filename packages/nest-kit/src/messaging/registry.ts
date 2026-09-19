import type { CommandEnvelope, CommandName, EventEnvelope, EventName, MessageEnvelope } from "@meridian/contracts";
import { SetMetadata } from "@nestjs/common";
import { isEventName } from "./config";
import { isCommandName } from "./outbox-writer";

export interface KafkaHandlerMeta {
  topic: string;
  partition: number;
  offset: string;
  /** 1-based in-process attempt for this record. */
  attempt: number;
  /** Attempts before the record is parked on the group's DLT: KAFKA_RETRY_DELAYS_MS length + 1. */
  maxAttempts: number;
}

export interface RabbitHandlerMeta {
  /** 1-based delivery attempt; counts every delivery of this message, including retries. */
  attempt: number;
  /** Deliveries before the message goes to the DLQ: RABBIT_RETRY_DELAYS_MS length + 1. */
  maxAttempts: number;
}

export type KafkaEventHandlerFn = (envelope: EventEnvelope, meta: KafkaHandlerMeta) => Promise<void>;
export type RabbitCommandHandlerFn = (envelope: CommandEnvelope, meta: RabbitHandlerMeta) => Promise<void>;

export interface KafkaEventHandlerOptions {
  /** Logical consumer group, e.g. "search-indexer". Namespaced on the broker. */
  group: string;
  events: EventName[];
}

export interface RabbitCommandHandlerOptions {
  command: CommandName;
  /** Unacknowledged deliveries this consumer holds at once (default 10). */
  prefetch?: number;
}

export interface KafkaHandlerRegistration extends KafkaEventHandlerOptions {
  name: string;
  handle: KafkaEventHandlerFn;
}

export interface RabbitHandlerRegistration extends Required<RabbitCommandHandlerOptions> {
  name: string;
  handle: RabbitCommandHandlerFn;
}

export interface DeadLetterInfo {
  queue: string;
  attempts: number;
  lastError: string;
  permanent: boolean;
}
export type DeadLetterListener = (envelope: MessageEnvelope, info: DeadLetterInfo) => Promise<void> | void;

export const KAFKA_EVENT_HANDLER = "meridian:messaging:kafka-event-handler";
export const RABBIT_COMMAND_HANDLER = "meridian:messaging:rabbit-command-handler";

const GROUP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_PREFETCH = 10;

export function normalizeKafkaOptions(options: KafkaEventHandlerOptions): KafkaEventHandlerOptions {
  if (!options || typeof options.group !== "string" || !GROUP_NAME.test(options.group)) {
    throw new TypeError(`KafkaEventHandler: invalid group "${String(options?.group)}"`);
  }
  if (!Array.isArray(options.events) || options.events.length === 0) throw new TypeError(`KafkaEventHandler(${options.group}): events must be a non-empty array`);
  for (const event of options.events) if (!isEventName(event)) throw new TypeError(`KafkaEventHandler(${options.group}): unknown event "${String(event)}"`);
  return { group: options.group, events: [...new Set(options.events)] };
}

export function normalizeRabbitOptions(options: RabbitCommandHandlerOptions): Required<RabbitCommandHandlerOptions> {
  if (!options || !isCommandName(options.command)) throw new TypeError(`RabbitCommandHandler: unknown command "${String(options?.command)}"`);
  const prefetch = options.prefetch ?? DEFAULT_PREFETCH;
  if (!Number.isSafeInteger(prefetch) || prefetch < 1 || prefetch > 65535) throw new TypeError(`RabbitCommandHandler(${options.command}): prefetch must be 1..65535`);
  return { command: options.command, prefetch };
}

/** Marks a provider method as a handler for events of a Kafka consumer group. Discovered by `MessagingModule`. */
export function KafkaEventHandler(options: KafkaEventHandlerOptions): MethodDecorator {
  const normalized = normalizeKafkaOptions(options);
  return (target, key, descriptor) => {
    const existing: KafkaEventHandlerOptions[] = (descriptor.value && Reflect.getMetadata?.(KAFKA_EVENT_HANDLER, descriptor.value)) || [];
    return SetMetadata(KAFKA_EVENT_HANDLER, [...existing, normalized])(target, key, descriptor);
  };
}

/** Marks a provider method as the RabbitMQ handler of a command queue. Discovered by `MessagingModule`. */
export function RabbitCommandHandler(options: RabbitCommandHandlerOptions): MethodDecorator {
  const normalized = normalizeRabbitOptions(options);
  return SetMetadata(RABBIT_COMMAND_HANDLER, normalized);
}

type Listener = () => void;

/**
 * Process-wide handler registry filled by decorator discovery and the imperative `register*` functions.
 * One queue consumer per command; one Kafka consumer per group dispatching by event name.
 */
export class HandlerRegistry {
  private readonly kafka: KafkaHandlerRegistration[] = [];
  private readonly rabbit = new Map<CommandName, RabbitHandlerRegistration>();
  private readonly deadLetterListeners = new Map<string, DeadLetterListener[]>();
  private readonly listeners = new Set<Listener>();

  registerKafka(options: KafkaEventHandlerOptions, handle: KafkaEventHandlerFn, name = handle.name || "anonymous"): () => void {
    const registration: KafkaHandlerRegistration = { ...normalizeKafkaOptions(options), name, handle };
    this.kafka.push(registration);
    this.notify();
    return () => {
      const index = this.kafka.indexOf(registration);
      if (index >= 0) this.kafka.splice(index, 1);
      this.notify();
    };
  }

  registerRabbit(options: RabbitCommandHandlerOptions, handle: RabbitCommandHandlerFn, name = handle.name || "anonymous"): () => void {
    const normalized = normalizeRabbitOptions(options);
    const existing = this.rabbit.get(normalized.command);
    if (existing) throw new Error(`RabbitCommandHandler: "${normalized.command}" already handled by ${existing.name}; one handler per command queue`);
    const registration: RabbitHandlerRegistration = { ...normalized, name, handle };
    this.rabbit.set(normalized.command, registration);
    this.notify();
    return () => {
      if (this.rabbit.get(normalized.command) === registration) this.rabbit.delete(normalized.command);
      this.notify();
    };
  }

  onDeadLetter(command: CommandName, listener: DeadLetterListener): () => void {
    const list = this.deadLetterListeners.get(command) ?? [];
    list.push(listener);
    this.deadLetterListeners.set(command, list);
    return () => {
      const current = this.deadLetterListeners.get(command) ?? [];
      this.deadLetterListeners.set(
        command,
        current.filter((l) => l !== listener),
      );
    };
  }

  deadLetterListenersFor(command: string): DeadLetterListener[] {
    return [...(this.deadLetterListeners.get(command as CommandName) ?? [])];
  }

  /** Group name → handlers and the union of their events. */
  kafkaGroups(): Map<string, { events: EventName[]; handlers: KafkaHandlerRegistration[] }> {
    const groups = new Map<string, { events: EventName[]; handlers: KafkaHandlerRegistration[] }>();
    for (const registration of this.kafka) {
      const entry = groups.get(registration.group) ?? { events: [], handlers: [] };
      entry.handlers.push(registration);
      for (const event of registration.events) if (!entry.events.includes(event)) entry.events.push(event);
      groups.set(registration.group, entry);
    }
    return groups;
  }

  rabbitHandlers(): RabbitHandlerRegistration[] {
    return [...this.rabbit.values()];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.kafka.length = 0;
    this.rabbit.clear();
    this.deadLetterListeners.clear();
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const handlerRegistry = new HandlerRegistry();

/** Registers a Kafka event handler without decorators. Returns an unregister function. */
export function registerKafkaHandler(options: KafkaEventHandlerOptions, handle: KafkaEventHandlerFn): () => void {
  return handlerRegistry.registerKafka(options, handle);
}

/** Registers a RabbitMQ command handler without decorators. Returns an unregister function. */
export function registerRabbitHandler(options: RabbitCommandHandlerOptions, handle: RabbitCommandHandlerFn): () => void {
  return handlerRegistry.registerRabbit(options, handle);
}

/** Observes commands this process moves to their DLQ (e.g. to mark a delivery dead-lettered). Best effort. */
export function onRabbitDeadLetter(command: CommandName, listener: DeadLetterListener): () => void {
  return handlerRegistry.onDeadLetter(command, listener);
}
