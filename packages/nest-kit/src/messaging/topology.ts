import { MessagingNames } from "./config";

export interface ExchangeDeclaration {
  name: string;
  type: "direct";
  options: { durable: true };
}

export interface QueueDeclaration {
  name: string;
  options: { durable: true; arguments?: Record<string, unknown> };
}

export interface BindingDeclaration {
  queue: string;
  exchange: string;
  routingKey: string;
}

export interface CommandTopology {
  command: string;
  queue: string;
  dlq: string;
  retryQueues: Array<{ name: string; delayMs: number }>;
  exchanges: ExchangeDeclaration[];
  queues: QueueDeclaration[];
  bindings: BindingDeclaration[];
}

/**
 * The durable RabbitMQ topology of one command. Publisher and consumer declare exactly this, so arguments always
 * match and neither side can hit PRECONDITION_FAILED:
 *   commands exchange --[queue]--> queue
 *   retry exchange --[retry queue]--> `<queue>.retry.<d>ms` (TTL d, dead-letters to commands exchange with [queue])
 *   dead-letter exchange --[queue]--> `<queue>.dlq`
 * where [queue] = the namespaced command name, which is both the queue name and its routing key.
 */
export function commandTopology(command: string, delaysMs: readonly number[]): CommandTopology {
  const commands = MessagingNames.commandsExchange();
  const retry = MessagingNames.retryExchange();
  const dlx = MessagingNames.deadLetterExchange();
  const queue = MessagingNames.commandQueue(command);
  const dlq = MessagingNames.dlq(command);
  const delays = [...new Set(delaysMs)];
  const retryQueues = delays.map((delayMs) => ({ name: MessagingNames.retryQueue(command, delayMs), delayMs }));
  return {
    command,
    queue,
    dlq,
    retryQueues,
    exchanges: [commands, retry, dlx].map((name) => ({ name, type: "direct" as const, options: { durable: true as const } })),
    queues: [
      { name: queue, options: { durable: true } },
      ...retryQueues.map(({ name, delayMs }) => ({
        name,
        options: {
          durable: true as const,
          arguments: { "x-message-ttl": delayMs, "x-dead-letter-exchange": commands, "x-dead-letter-routing-key": queue },
        },
      })),
      { name: dlq, options: { durable: true } },
    ],
    bindings: [
      { queue, exchange: commands, routingKey: queue },
      ...retryQueues.map(({ name }) => ({ queue: name, exchange: retry, routingKey: name })),
      { queue: dlq, exchange: dlx, routingKey: queue },
    ],
  };
}

export interface TopologyChannel {
  assertExchange(name: string, type: string, options?: { durable?: boolean }): Promise<unknown>;
  assertQueue(name: string, options?: { durable?: boolean; arguments?: Record<string, unknown> }): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
}

/** Declares a topology idempotently on a channel (exchanges, then queues, then bindings). */
export async function declareTopology(channel: TopologyChannel, topology: CommandTopology): Promise<void> {
  for (const exchange of topology.exchanges) await channel.assertExchange(exchange.name, exchange.type, exchange.options);
  for (const queue of topology.queues) await channel.assertQueue(queue.name, queue.options);
  for (const binding of topology.bindings) await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
}
