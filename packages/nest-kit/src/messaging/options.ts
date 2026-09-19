import type { Type } from "@nestjs/common";
import type { PrismaLike } from "./prisma";

export interface MessagingModuleOptions {
  /** Service name used as outbox producer and in client ids, e.g. "checkout-service". */
  service: string;
  /** The service's Prisma client class (a provider somewhere in the app); used by the relay, inbox replay marks and admin stats. */
  prisma: Type<PrismaLike>;
  /** Connect to Kafka: produce events, run `@KafkaEventHandler` consumer groups. */
  kafka: boolean;
  /** Connect to RabbitMQ: publish commands, run `@RabbitCommandHandler` consumers. */
  rabbit: boolean;
  /** Run the outbox relay in this process. */
  relay: boolean;
}

export const MESSAGING_OPTIONS = Symbol.for("meridian:messaging:options");
