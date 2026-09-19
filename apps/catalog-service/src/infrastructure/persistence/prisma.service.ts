import { createLogger, onShutdown, registerHealthCheck } from "@meridian/nest-kit";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma";

const log = createLogger("Prisma");

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private closed = false;

  constructor() {
    super({ transactionOptions: { maxWait: 3000, timeout: 15000 } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    registerHealthCheck("postgres", async () => {
      await this.$queryRaw`SELECT 1`;
    });
    onShutdown("prisma", "resources", () => this.close());
    log.info("postgres connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.$disconnect();
  }
}
