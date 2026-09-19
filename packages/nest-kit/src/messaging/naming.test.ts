import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessagingNames, messagingSettings, parseDelayList, parsePositiveInt } from "./config";
import { commandTopology, declareTopology } from "./topology";

const originalNamespace = process.env.MESSAGING_NAMESPACE;

describe("messaging names and topic resolution", () => {
  beforeEach(() => {
    delete process.env.MESSAGING_NAMESPACE;
  });
  afterEach(() => {
    if (originalNamespace === undefined) delete process.env.MESSAGING_NAMESPACE;
    else process.env.MESSAGING_NAMESPACE = originalNamespace;
  });

  it("resolves the Kafka topic of an event from its bounded context", () => {
    expect(MessagingNames.topicForEvent("StockAdjusted")).toBe("meridian.inventory");
    expect(MessagingNames.topicForEvent("OrderPaid")).toBe("meridian.checkout");
    expect(MessagingNames.topicForEvent("UserDeleted")).toBe("meridian.identity");
    expect(() => MessagingNames.topicForEvent("Nope" as never)).toThrow(/Unknown event/);
  });

  it("group topics dedupe event topics and always include the group's replay topic", () => {
    expect(MessagingNames.groupTopics("search-indexer", ["StockReserved", "StockDepleted", "ProductPublished"])).toEqual([
      "meridian.catalog",
      "meridian.inventory",
      "meridian.replay.search-indexer",
    ]);
    expect(MessagingNames.dltTopic("search-indexer")).toBe("meridian.dlt.search-indexer");
  });

  it("without a namespace, broker names equal the contract names", () => {
    expect(MessagingNames.groupId("kitfix-a")).toBe("kitfix-a");
    expect(MessagingNames.commandsExchange()).toBe("meridian.commands");
    expect(MessagingNames.commandQueue("notification.send-email")).toBe("notification.send-email");
    expect(MessagingNames.retryQueue("notification.send-email", 5000)).toBe("notification.send-email.retry.5000ms");
    expect(MessagingNames.dlq("notification.send-email")).toBe("notification.send-email.dlq");
  });

  it("namespace prefixes every topic, group, exchange and queue name", () => {
    process.env.MESSAGING_NAMESPACE = "t-leaf112";
    expect(MessagingNames.topicForEvent("StockAdjusted")).toBe("t-leaf112.meridian.inventory");
    expect(MessagingNames.groupId("kitfix-a")).toBe("t-leaf112.kitfix-a");
    expect(MessagingNames.dltTopic("kitfix-a")).toBe("t-leaf112.meridian.dlt.kitfix-a");
    expect(MessagingNames.replayTopic("kitfix-a")).toBe("t-leaf112.meridian.replay.kitfix-a");
    expect(MessagingNames.deadLetterExchange()).toBe("t-leaf112.meridian.dlx");
    expect(MessagingNames.retryExchange()).toBe("t-leaf112.meridian.retry");
    expect(MessagingNames.commandQueue("payment.refund")).toBe("t-leaf112.payment.refund");
    expect(MessagingNames.retryQueue("payment.refund", 300)).toBe("t-leaf112.payment.refund.retry.300ms");
    expect(MessagingNames.dlq("payment.refund")).toBe("t-leaf112.payment.refund.dlq");
  });

  it("parses retry delay lists and falls back to contract defaults on invalid input", () => {
    expect(parseDelayList("100, 200,300", [1])).toEqual([100, 200, 300]);
    expect(parseDelayList(undefined, [5000, 30000])).toEqual([5000, 30000]);
    expect(parseDelayList("100,abc", [7])).toEqual([7]);
    expect(parseDelayList("0,100", [7])).toEqual([7]);
    expect(parsePositiveInt("250", 500)).toBe(250);
    expect(parsePositiveInt("-1", 500)).toBe(500);
    const settings = messagingSettings({ RABBIT_RETRY_DELAYS_MS: "300,600,900", KAFKA_RETRY_DELAYS_MS: "100", OUTBOX_POLL_MS: "200", KAFKA_BROKERS: "a:1, b:2" });
    expect(settings.rabbitMaxAttempts).toBe(4);
    expect(settings.kafkaRetryDelaysMs).toEqual([100]);
    expect(settings.outboxPollMs).toBe(200);
    expect(settings.kafkaBrokers).toEqual(["a:1", "b:2"]);
  });

  it("command topology: retry queues dead-letter back to the namespaced command routing key, DLQ bound on the dlx", async () => {
    process.env.MESSAGING_NAMESPACE = "ns";
    const topology = commandTopology("notification.send-email", [300, 600, 600]);
    expect(topology.queue).toBe("ns.notification.send-email");
    expect(topology.retryQueues.map((q) => q.name)).toEqual(["ns.notification.send-email.retry.300ms", "ns.notification.send-email.retry.600ms"]);
    const retry = topology.queues.find((q) => q.name.endsWith("retry.300ms"));
    expect(retry?.options.arguments).toEqual({ "x-message-ttl": 300, "x-dead-letter-exchange": "ns.meridian.commands", "x-dead-letter-routing-key": "ns.notification.send-email" });
    expect(topology.bindings).toContainEqual({ queue: "ns.notification.send-email", exchange: "ns.meridian.commands", routingKey: "ns.notification.send-email" });
    expect(topology.bindings).toContainEqual({ queue: "ns.notification.send-email.dlq", exchange: "ns.meridian.dlx", routingKey: "ns.notification.send-email" });

    const calls: string[] = [];
    await declareTopology(
      {
        assertExchange: async (name) => calls.push(`exchange:${name}`),
        assertQueue: async (name) => calls.push(`queue:${name}`),
        bindQueue: async (queue, exchange) => calls.push(`bind:${queue}@${exchange}`),
      },
      topology,
    );
    expect(calls.indexOf("exchange:ns.meridian.commands")).toBeLessThan(calls.indexOf("queue:ns.notification.send-email"));
    expect(calls.at(-1)).toBe("bind:ns.notification.send-email.dlq@ns.meridian.dlx");
  });
});
