import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { buildEnvelope } from "./envelope";
import { RabbitMessaging, withHeartbeat, type AmqpConnect } from "./rabbit";
import { HandlerRegistry } from "./registry";

/** In-memory stand-in for an amqplib ChannelModel + ConfirmChannel that records every call in order. */
function fakeBroker(options: { returnUnroutable?: boolean; nack?: boolean } = {}) {
  const calls: string[] = [];
  const channel = Object.assign(new EventEmitter(), {
    assertExchange: async (name: string) => void calls.push(`assertExchange ${name}`),
    assertQueue: async (name: string, opts?: { arguments?: Record<string, unknown> }) => void calls.push(`assertQueue ${name}${opts?.arguments ? ` ttl=${opts.arguments["x-message-ttl"]}` : ""}`),
    bindQueue: async (queue: string, exchange: string, key: string) => void calls.push(`bindQueue ${queue} ${exchange} ${key}`),
    publish: (exchange: string, routingKey: string, _content: Buffer, props: { messageId?: string; mandatory?: boolean }, cb: (err: unknown) => void) => {
      calls.push(`publish ${exchange} ${routingKey} mandatory=${props.mandatory}`);
      setImmediate(() => {
        if (options.returnUnroutable) channel.emit("return", { fields: { exchange, routingKey }, properties: { messageId: props.messageId }, content: Buffer.alloc(0) });
        cb(options.nack ? new Error("nacked") : null);
      });
      return true;
    },
    close: async () => undefined,
  });
  const model = Object.assign(new EventEmitter(), {
    createConfirmChannel: async () => channel,
    createChannel: async () => channel,
    close: async () => undefined,
  });
  const urls: string[] = [];
  const connect: AmqpConnect = async (url) => {
    urls.push(url);
    return model as never;
  };
  return { calls, connect, urls };
}

const command = buildEnvelope(
  {
    id: "0190a3a4-0000-7000-8000-00000000c0de",
    kind: "command",
    name: "notification.send-email",
    aggregateType: null,
    aggregateId: null,
    payload: { template: "contact-received" },
    correlationId: "corr",
    causationId: null,
    traceparent: null,
    createdAt: new Date(),
    attempts: 0,
  },
  "svc",
);

describe("rabbit publisher", () => {
  afterEach(() => {
    delete process.env.MESSAGING_NAMESPACE;
    delete process.env.RABBIT_RETRY_DELAYS_MS;
  });

  it("publisher declares the command queue topology before the first publish, once per connection", async () => {
    process.env.MESSAGING_NAMESPACE = "t-unit";
    process.env.RABBIT_RETRY_DELAYS_MS = "300,600,900";
    const broker = fakeBroker();
    const rabbit = new RabbitMessaging("svc", new HandlerRegistry(), broker.connect);
    await rabbit.publishCommand(command);
    await rabbit.publishCommand(command);
    const firstPublish = broker.calls.findIndex((call) => call.startsWith("publish"));
    const declared = broker.calls.slice(0, firstPublish);
    expect(declared).toEqual([
      "assertExchange t-unit.meridian.commands",
      "assertExchange t-unit.meridian.retry",
      "assertExchange t-unit.meridian.dlx",
      "assertQueue t-unit.notification.send-email",
      "assertQueue t-unit.notification.send-email.retry.300ms ttl=300",
      "assertQueue t-unit.notification.send-email.retry.600ms ttl=600",
      "assertQueue t-unit.notification.send-email.retry.900ms ttl=900",
      "assertQueue t-unit.notification.send-email.dlq",
      "bindQueue t-unit.notification.send-email t-unit.meridian.commands t-unit.notification.send-email",
      "bindQueue t-unit.notification.send-email.retry.300ms t-unit.meridian.retry t-unit.notification.send-email.retry.300ms",
      "bindQueue t-unit.notification.send-email.retry.600ms t-unit.meridian.retry t-unit.notification.send-email.retry.600ms",
      "bindQueue t-unit.notification.send-email.retry.900ms t-unit.meridian.retry t-unit.notification.send-email.retry.900ms",
      "bindQueue t-unit.notification.send-email.dlq t-unit.meridian.dlx t-unit.notification.send-email",
    ]);
    expect(broker.calls.slice(firstPublish)).toEqual([
      "publish t-unit.meridian.commands t-unit.notification.send-email mandatory=true",
      "publish t-unit.meridian.commands t-unit.notification.send-email mandatory=true",
    ]);
    expect(broker.urls).toEqual(["amqp://localhost:5672?heartbeat=30"]);
  });

  it("an unroutable (returned) or nacked publish is a failure, never a silent success", async () => {
    const returned = fakeBroker({ returnUnroutable: true });
    await expect(new RabbitMessaging("svc", new HandlerRegistry(), returned.connect).publishCommand(command)).rejects.toThrow(/Unroutable/);
    const nacked = fakeBroker({ nack: true });
    await expect(new RabbitMessaging("svc", new HandlerRegistry(), nacked.connect).publishCommand(command)).rejects.toThrow(/nacked/);
  });

  it("adds a 30s heartbeat to the AMQP URL unless one is set", () => {
    expect(withHeartbeat("amqp://guest:guest@localhost:5672")).toBe("amqp://guest:guest@localhost:5672?heartbeat=30");
    expect(withHeartbeat("amqp://localhost:5672/?heartbeat=10")).toBe("amqp://localhost:5672/?heartbeat=10");
  });
});
