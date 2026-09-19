import { onShutdown, registerHealthCheck } from "@meridian/nest-kit";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { type Prisma, PrismaClient } from "../../generated/prisma";

export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ datasourceUrl: process.env.CHECKOUT_DATABASE_URL, transactionOptions: { maxWait: 5_000, timeout: 15_000 } });
    // Closed in the "resources" phase, after HTTP, consumers and the outbox relay have drained.
    onShutdown("prisma", "resources", () => this.$disconnect());
  }

  async onModuleInit() {
    await this.$connect();
    registerHealthCheck("postgres", async () => {
      await this.$queryRaw`SELECT 1`;
    });
  }
}
