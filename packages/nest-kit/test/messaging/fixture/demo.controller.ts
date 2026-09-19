import type { ChaosRuleInput, EventPayloads } from "@meridian/contracts";
import { Body, Controller, Delete, Get, Inject, Post, Query } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { clearChaos, setChaosRule } from "../../../src/core";
import { KafkaMessaging, OutboxWriter, RabbitMessaging } from "../../../src/messaging";
import { buildEventEnvelopeForTests, publishEnvelopeForTests } from "../../../src/messaging/testing";
import { inflight } from "./inflight";
import { PrismaService } from "./prisma.service";

function stockAdjusted(sku: string): EventPayloads["StockAdjusted"] {
  return { sku, onHand: 8, reserved: 1, available: 7, previousAvailable: 8, actorId: null, reason: "kit messaging probe" };
}

function count(raw: unknown, max = 100): number {
  const value = Number(raw ?? 1);
  return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, max) : 1;
}

@Controller("demo")
export class DemoController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(KafkaMessaging) private readonly kafka: KafkaMessaging,
    @Inject(RabbitMessaging) private readonly rabbit: RabbitMessaging,
  ) {}

  @Post("events")
  async events(@Body() body: { count?: number; aggregateId?: string }) {
    const n = count(body?.count);
    const messageIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const id = body?.aggregateId ?? `sku-${i}-${randomBytes(4).toString("hex")}`;
        ids.push(await this.outbox.event(tx, "StockAdjusted", { type: "StockItem", id }, stockAdjusted(id)));
      }
      return ids;
    });
    return { messageIds };
  }

  @Post("commands")
  async commands(@Body() body: { count?: number }) {
    const n = count(body?.count);
    const messageIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        ids.push(
          await this.outbox.command(tx, "notification.send-email", {
            template: "contact-received",
            to: { email: "probe@example.com", name: null },
            data: {},
            dedupeKey: randomUUID(),
          }),
        );
      }
      return ids;
    });
    return { messageIds };
  }

  @Post("chaos")
  chaos(@Body() body: ChaosRuleInput) {
    return setChaosRule(body);
  }

  @Delete("chaos")
  async clear() {
    await clearChaos();
    return { cleared: true };
  }

  @Get("handled")
  async handled(@Query("messageIds") raw?: string) {
    const ids = (raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id && id !== "none");
    if (!ids.length) return { rows: [] };
    const rows = await this.prisma.demoHandled.findMany({ where: { messageId: { in: ids } }, orderBy: { handledAt: "asc" } });
    return { rows };
  }

  @Get("inflight")
  inflight() {
    // The kit counts a delivery from the moment it enters handling (chaos delays included); the fixture counts its bodies.
    return { rabbit: Math.max(inflight.rabbit, this.rabbit.inflight), kafka: Math.max(inflight.kafka, this.kafka.inflight) };
  }

  @Post("raw-kafka")
  async rawKafka() {
    const sku = `raw-${randomBytes(4).toString("hex")}`;
    const envelope = buildEventEnvelopeForTests("StockAdjusted", stockAdjusted(sku), { aggregateType: "StockItem", aggregateId: sku });
    await publishEnvelopeForTests({ kafka: this.kafka }, envelope, { times: 2 });
    return { messageId: envelope.messageId };
  }
}
