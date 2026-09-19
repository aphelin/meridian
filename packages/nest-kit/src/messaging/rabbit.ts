import { Commands, type DeadLetterDto, type MessageEnvelope } from "@meridian/contracts";
import { connect as amqpConnect, type Channel, type ChannelModel, type ConfirmChannel, type GetMessage, type Options } from "amqplib";
import { randomUUID } from "node:crypto";
import { counter, createLogger, instanceId } from "../core";
import { MessagingNames, messagingSettings } from "./config";
import { rabbitDeadLetterDto, rabbitDeadLetterId, rabbitReplayHeaders } from "./dead-letters";
import { rabbitPublishOptions } from "./envelope";
import { errorText } from "./errors";
import { processRabbitDelivery, type RabbitPublishOptions } from "./rabbit-processor";
import { handlerRegistry, type HandlerRegistry, type RabbitHandlerRegistration } from "./registry";
import { commandTopology, declareTopology } from "./topology";

const log = createLogger("RabbitMQ");
const processed = () => counter("rabbit_messages_processed_total", "RabbitMQ command deliveries handled", ["command", "result"]);

export type AmqpConnect = (url: string, socketOptions?: unknown) => Promise<ChannelModel>;

/** Adds `heartbeat=30` to an AMQP URL unless the URL sets its own. */
export function withHeartbeat(url: string, seconds = 30): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("heartbeat")) parsed.searchParams.set("heartbeat", String(seconds));
    return parsed.toString();
  } catch {
    return url;
  }
}

class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.tails.get(key) ?? Promise.resolve();
    const next = tail.then(fn, fn);
    const settled = next.catch(() => undefined);
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });
    return next;
  }
}

/** Returns held messages to their queue in order. If the channel is already gone the broker requeues them itself. */
function requeueAll(channel: Channel, messages: GetMessage[]): void {
  for (const message of messages) {
    try {
      channel.nack(message, false, true);
    } catch {
      return;
    }
  }
}

interface PendingConfirm {
  key: string;
  reject: (error: Error) => void;
}

class CommandConsumer {
  private channel: Channel | null = null;
  private tag: string | null = null;
  private stopped = false;
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly owner: RabbitMessaging,
    readonly registration: RabbitHandlerRegistration,
  ) {}

  get active(): boolean {
    return this.channel !== null && this.tag !== null;
  }

  async start(model: ChannelModel): Promise<void> {
    if (this.stopped || this.channel) return;
    const settings = messagingSettings();
    const channel = await model.createChannel();
    channel.on("error", (error) => log.error("consumer channel error", { command: this.registration.command, error: errorText(error) }));
    channel.on("close", () => {
      if (this.channel !== channel) return;
      this.channel = null;
      this.tag = null;
      if (!this.stopped) this.owner.consumerLost(this.registration.command);
    });
    this.channel = channel;
    try {
      const topology = commandTopology(this.registration.command, settings.rabbitRetryDelaysMs);
      await declareTopology(channel, topology);
      await channel.prefetch(this.registration.prefetch);
      const consumerTag = `${this.owner.service}.${instanceId()}.${this.registration.command}.${randomUUID().slice(0, 8)}`;
      const reply = await channel.consume(topology.queue, (message) => this.onMessage(channel, message), { noAck: false, consumerTag });
      this.tag = reply.consumerTag;
      log.info("command consumer running", { command: this.registration.command, queue: topology.queue, prefetch: this.registration.prefetch });
    } catch (error) {
      this.channel = null;
      await channel.close().catch(() => undefined);
      throw error;
    }
  }

  private onMessage(channel: Channel, message: Parameters<Parameters<Channel["consume"]>[1]>[0]): void {
    if (!message) {
      // Broker-side cancel (queue deleted or node failover): rebuild the consumer.
      log.warn("consumer cancelled by broker", { command: this.registration.command });
      if (this.channel === channel) {
        this.channel = null;
        this.tag = null;
        void channel.close().catch(() => undefined);
        if (!this.stopped) this.owner.consumerLost(this.registration.command);
      }
      return;
    }
    const settings = messagingSettings();
    const command = this.registration.command;
    const task = (async () => {
      this.owner.inflight += 1;
      try {
        const outcome = await processRabbitDelivery(message, {
          registration: this.registration,
          delaysMs: settings.rabbitRetryDelaysMs,
          publish: (exchange, routingKey, content, options) => this.owner.publish(exchange, routingKey, content, options),
          ack: () => channel.ack(message),
          nack: (requeue) => channel.nack(message, false, requeue),
          onDeadLetter: async (envelope, info) => {
            if (!envelope) return;
            for (const listener of this.owner.registry.deadLetterListenersFor(command)) await listener(envelope as MessageEnvelope, info);
          },
          requeueDelayMs: 1000,
        });
        processed().inc({ command, result: outcome.result });
      } catch (error) {
        log.error("command delivery crashed; requeueing", { command, messageId: message.properties.messageId, error: errorText(error) });
        try {
          channel.nack(message, false, true);
        } catch {
          // channel already closed: the broker redelivers
        }
      } finally {
        this.owner.inflight -= 1;
      }
    })();
    this.inflight.add(task);
    void task.finally(() => this.inflight.delete(task));
  }

  /** Cancels the consumer tag (no new deliveries), waits for in-flight handlers to settle and ack, then closes the channel. */
  async stop(): Promise<void> {
    this.stopped = true;
    const channel = this.channel;
    const tag = this.tag;
    if (channel && tag) await channel.cancel(tag).catch((error) => log.warn("consumer cancel failed", { command: this.registration.command, error: errorText(error) }));
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
    this.channel = null;
    this.tag = null;
    if (channel) await channel.close().catch(() => undefined);
  }
}

/**
 * RabbitMQ access for one process: one connection (heartbeat 30s, connect timeout 5s), a confirm channel for all
 * publishing (mandatory + publisher confirms, so unroutable or nacked messages are failures), one channel per
 * command consumer with its prefetch, automatic reconnection with backoff, and the DLQ admin operations.
 */
export class RabbitMessaging {
  private model: ChannelModel | null = null;
  private connecting: Promise<ChannelModel> | null = null;
  private publisherChannel: Promise<ConfirmChannel> | null = null;
  private readonly declaredCommands = new Set<string>();
  private readonly pending = new Set<PendingConfirm>();
  private readonly returned = new Map<string, number>();
  private drain: { promise: Promise<void>; release: () => void } | null = null;
  private readonly consumers = new Map<string, CommandConsumer>();
  private readonly queueLock = new KeyedMutex();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 1000;
  private closed = false;
  private consuming = false;
  /** Deliveries currently inside a handler (including chaos delays). */
  inflight = 0;

  constructor(
    readonly service: string,
    readonly registry: HandlerRegistry = handlerRegistry,
    private readonly connectFn: AmqpConnect = amqpConnect as AmqpConnect,
  ) {}

  private connection(): Promise<ChannelModel> {
    if (this.closed) return Promise.reject(new Error("RabbitMQ messaging is closed"));
    if (!this.connecting) {
      const attempt: Promise<ChannelModel> = this.connectFn(withHeartbeat(messagingSettings().rabbitUrl), { timeout: 5000 }).then(
        (model) => {
          if (this.connecting !== attempt || this.closed) {
            void model.close().catch(() => undefined);
            throw new Error("RabbitMQ connection superseded");
          }
          model.on("error", (error) => log.error("connection error", { error: errorText(error) }));
          model.on("close", () => this.onConnectionClosed(model));
          model.on("blocked", (reason) => log.warn("connection blocked by broker", { reason }));
          this.model = model;
          this.reconnectDelayMs = 1000;
          log.info("connected");
          return model;
        },
        (error) => {
          if (this.connecting === attempt) this.connecting = null;
          throw error;
        },
      );
      attempt.catch(() => undefined);
      this.connecting = attempt;
    }
    return this.connecting;
  }

  private onConnectionClosed(model: ChannelModel): void {
    if (this.model !== model) return;
    this.model = null;
    this.connecting = null;
    this.publisherChannel = null;
    this.declaredCommands.clear();
    this.returned.clear();
    this.releaseDrain();
    for (const confirm of [...this.pending]) confirm.reject(new Error("RabbitMQ connection closed before the publish was confirmed"));
    if (this.closed) return;
    log.warn("connection closed");
    if (this.consuming) this.scheduleReconnect();
  }

  /** Called by a consumer whose channel died while the process still wants it. */
  consumerLost(command: string): void {
    if (this.closed || !this.consuming) return;
    const consumer = this.consumers.get(command);
    if (consumer) this.consumers.delete(command);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.closed) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(30_000, this.reconnectDelayMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.syncConsumers().catch((error) => {
        log.error("consumer restart failed; retrying", { error: errorText(error) });
        this.scheduleReconnect();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private confirmChannel(): Promise<ConfirmChannel> {
    if (!this.publisherChannel) {
      const created: Promise<ConfirmChannel> = this.connection()
        .then((model) => model.createConfirmChannel())
        .then(
          (channel) => {
            channel.on("error", (error) => log.error("publisher channel error", { error: errorText(error) }));
            channel.on("return", (message: GetMessage) => {
              const key = this.returnKey(message.fields.exchange, message.fields.routingKey, message.properties.messageId);
              this.returned.set(key, (this.returned.get(key) ?? 0) + 1);
            });
            channel.on("drain", () => this.releaseDrain());
            channel.on("close", () => {
              if (this.publisherChannel === created) this.publisherChannel = null;
              this.declaredCommands.clear();
              this.releaseDrain();
              for (const confirm of [...this.pending]) confirm.reject(new Error("RabbitMQ publisher channel closed before the publish was confirmed"));
            });
            return channel;
          },
          (error) => {
            if (this.publisherChannel === created) this.publisherChannel = null;
            throw error;
          },
        );
      created.catch(() => undefined);
      this.publisherChannel = created;
    }
    return this.publisherChannel;
  }

  /** Wakes publishers waiting for `drain` (also when the channel closes, so they fail fast instead of hanging). */
  private releaseDrain(): void {
    const drain = this.drain;
    this.drain = null;
    drain?.release();
  }

  private returnKey(exchange: string, routingKey: string, messageId: string | undefined): string {
    return JSON.stringify([exchange, routingKey, messageId ?? ""]);
  }

  /**
   * Publishes one message and resolves once the broker confirmed it. Rejects when the broker nacks it, when it is
   * returned as unroutable (mandatory), or when the channel closes first. Waits for `drain` under backpressure.
   */
  async publish(exchange: string, routingKey: string, content: Buffer, options: RabbitPublishOptions): Promise<void> {
    const channel = await this.confirmChannel();
    while (this.drain) await this.drain.promise;
    const key = this.returnKey(exchange, routingKey, options.messageId);
    await new Promise<void>((resolve, reject) => {
      const confirm: PendingConfirm = {
        key,
        reject: (error) => {
          if (!this.pending.delete(confirm)) return;
          reject(error);
        },
      };
      this.pending.add(confirm);
      const settle = (error: unknown) => {
        if (!this.pending.delete(confirm)) return;
        const returns = this.returned.get(key) ?? 0;
        if (returns > 0) {
          if (returns === 1) this.returned.delete(key);
          else this.returned.set(key, returns - 1);
          reject(new Error(`Unroutable message: no queue bound to "${exchange}" with routing key "${routingKey}"`));
          return;
        }
        if (error) reject(error instanceof Error ? error : new Error("Message nacked by the broker"));
        else resolve();
      };
      try {
        const writable = channel.publish(exchange, routingKey, content, options as Options.Publish, (error) => settle(error));
        if (!writable && !this.drain) {
          let release!: () => void;
          const promise = new Promise<void>((done) => (release = done));
          this.drain = { promise, release };
        }
      } catch (error) {
        this.pending.delete(confirm);
        reject(error);
      }
    });
  }

  /** Declares the full durable topology of a command once per connection (cached). */
  async ensureCommandTopology(command: string): Promise<void> {
    if (this.declaredCommands.has(command)) return;
    await this.queueLock.run(`topology:${command}`, async () => {
      if (this.declaredCommands.has(command)) return;
      const channel = await this.confirmChannel();
      await declareTopology(channel, commandTopology(command, messagingSettings().rabbitRetryDelaysMs));
      this.declaredCommands.add(command);
    });
  }

  /** Publishes a command envelope to the commands exchange (routing key = namespaced command) after declaring its topology. */
  async publishCommand(envelope: MessageEnvelope, traceparent?: string | null): Promise<void> {
    await this.ensureCommandTopology(envelope.name);
    await this.publish(MessagingNames.commandsExchange(), MessagingNames.commandQueue(envelope.name), Buffer.from(JSON.stringify(envelope)), rabbitPublishOptions(envelope, traceparent));
  }

  /** Starts a consumer for every registered command that has none; stops consumers whose handler was removed. */
  syncConsumers(): Promise<void> {
    // Serialised: startup, late registrations and reconnects must never start two consumers for one queue.
    return this.queueLock.run("consumers:sync", () => this.syncConsumersNow());
  }

  private async syncConsumersNow(): Promise<void> {
    if (this.closed || !this.consuming) return;
    const desired = new Map(this.registry.rabbitHandlers().map((registration) => [registration.command as string, registration] as const));
    for (const [command, consumer] of [...this.consumers]) {
      if (desired.get(command) !== consumer.registration || !consumer.active) {
        this.consumers.delete(command);
        await consumer.stop();
      }
    }
    const missing = [...desired].filter(([command]) => !this.consumers.has(command));
    if (!missing.length) return;
    const model = await this.connection();
    const failures: unknown[] = [];
    for (const [command, registration] of missing) {
      const consumer = new CommandConsumer(this, registration);
      try {
        await consumer.start(model);
        this.consumers.set(command, consumer);
      } catch (error) {
        failures.push(error);
        log.error("could not start command consumer", { command, error: errorText(error) });
      }
    }
    if (failures.length) throw failures[0];
  }

  /** Starts consumers in the background; while the broker is unreachable it keeps retrying with backoff. */
  startConsumers(): void {
    if (this.closed) return;
    this.consuming = true;
    this.syncConsumers().catch((error) => {
      log.error("could not start command consumers; retrying", { error: errorText(error) });
      this.scheduleReconnect();
    });
  }

  isConsuming(): boolean {
    return this.consuming;
  }

  commands(): string[] {
    return this.registry.rabbitHandlers().map((registration) => registration.command);
  }

  async stopConsumers(): Promise<void> {
    this.consuming = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.queueLock.run("consumers:sync", async () => {
      const consumers = [...this.consumers.values()];
      this.consumers.clear();
      await Promise.all(consumers.map((consumer) => consumer.stop()));
    });
  }

  async close(): Promise<void> {
    await this.stopConsumers();
    this.closed = true;
    const model = this.model ?? (this.connecting ? await this.connecting.catch(() => null) : null);
    this.model = null;
    this.connecting = null;
    this.publisherChannel = null;
    if (model) await model.close().catch(() => undefined);
  }

  /** Healthy when the connection is up and the broker opens and closes a channel. */
  async healthCheck(): Promise<void> {
    await this.withChannel(async () => undefined);
  }

  private async withChannel<T>(fn: (channel: Channel) => Promise<T>): Promise<T> {
    const model = await this.connection();
    const channel = await model.createChannel();
    channel.on("error", () => undefined);
    let closed = false;
    channel.once("close", () => (closed = true));
    try {
      return await fn(channel);
    } finally {
      if (!closed) await channel.close().catch(() => undefined);
    }
  }

  /** Message and consumer counts, or zeros when the queue does not exist (checkQueue would close the channel). */
  async queueCounts(queue: string): Promise<{ messages: number; consumers: number }> {
    return this.withChannel(async (channel) => {
      const reply = await channel.checkQueue(queue);
      return { messages: reply.messageCount, consumers: reply.consumerCount };
    }).catch((error) => {
      if (/NOT_FOUND|404/.test(String(error))) return { messages: 0, consumers: 0 };
      throw error;
    });
  }

  /** Resolves a DLQ (or command queue) name to its contract command, or null if it is not a command DLQ. */
  commandForQueue(queueOrDlq: string): string | null {
    for (const command of Object.values(Commands)) {
      if (MessagingNames.dlq(command) === queueOrDlq || MessagingNames.commandQueue(command) === queueOrDlq) return command;
    }
    return null;
  }

  /**
   * Non-destructive DLQ peek: takes up to `limit` messages unacknowledged on a private channel, then requeues them
   * (RabbitMQ puts requeued messages back at their original position). Serialised per queue with replay.
   */
  async peekDeadLetters(dlq: string, limit: number): Promise<DeadLetterDto[]> {
    return this.queueLock.run(`dlq:${dlq}`, () =>
      this.withChannel(async (channel) => {
        const { messageCount } = await channel.checkQueue(dlq);
        const held: GetMessage[] = [];
        try {
          while (held.length < Math.min(limit, messageCount)) {
            const message = await channel.get(dlq, { noAck: false });
            if (!message) break;
            held.push(message);
          }
          return held.map((message) => rabbitDeadLetterDto(dlq, message));
        } finally {
          requeueAll(channel, held);
        }
      }),
    );
  }

  /**
   * Moves dead letters back to the command queue with attempts reset: the given ids, or the `limit` oldest.
   * Each message is republished with a broker confirm before it is acked off the DLQ; everything else is requeued.
   */
  async replayDeadLetters(dlq: string, ids: string[] | undefined, limit: number): Promise<{ replayed: number; remaining: number }> {
    const command = this.commandForQueue(dlq);
    if (!command) throw new Error(`"${dlq}" is not a command dead-letter queue`);
    const deadLetterQueue = MessagingNames.dlq(command);
    await this.ensureCommandTopology(command);
    return this.queueLock.run(`dlq:${deadLetterQueue}`, () =>
      this.withChannel(async (channel) => {
        const { messageCount } = await channel.checkQueue(deadLetterQueue);
        const wanted = ids ? new Set(ids) : null;
        const held: GetMessage[] = [];
        let replayed = 0;
        let failure: unknown = null;
        try {
          for (let scanned = 0; scanned < messageCount; scanned++) {
            if (wanted ? wanted.size === 0 : replayed >= limit) break;
            const message = await channel.get(deadLetterQueue, { noAck: false });
            if (!message) break;
            const id = rabbitDeadLetterId(message);
            if (wanted && !wanted.has(id)) {
              held.push(message);
              continue;
            }
            try {
              const properties = message.properties;
              await this.publish(MessagingNames.commandsExchange(), MessagingNames.commandQueue(command), message.content, {
                persistent: true,
                mandatory: true,
                messageId: properties.messageId,
                correlationId: properties.correlationId,
                type: properties.type,
                contentType: properties.contentType ?? "application/json",
                contentEncoding: properties.contentEncoding,
                appId: properties.appId,
                timestamp: properties.timestamp,
                headers: rabbitReplayHeaders(properties.headers, id, deadLetterQueue),
              });
            } catch (error) {
              held.push(message);
              failure = error;
              break;
            }
            channel.ack(message);
            replayed += 1;
            wanted?.delete(id);
            log.info("dead letter replayed", { command, queue: deadLetterQueue, id, messageId: message.properties.messageId });
          }
        } finally {
          requeueAll(channel, held);
        }
        if (failure && replayed === 0) throw failure;
        return { replayed, remaining: Math.max(0, messageCount - replayed) };
      }),
    );
  }
}
