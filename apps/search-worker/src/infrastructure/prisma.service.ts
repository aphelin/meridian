import { onShutdown, registerHealthCheck } from "@meridian/nest-kit";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma";
import { installSearchIndexes } from "./persistence/search-indexes";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private disconnected = false;

  async onModuleInit() {
    await this.$connect();
    await installSearchIndexes(this);
    registerHealthCheck("postgres", async () => {
      await this.$queryRaw`SELECT 1`;
    });
    onShutdown("prisma", "resources", () => this.disconnect());
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    await this.$disconnect();
  }
}
