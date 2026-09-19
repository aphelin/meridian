import { onShutdown, registerHealthCheck } from "@meridian/nest-kit";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma";

/**
 * The identity database client. Disconnects in the "resources" shutdown phase, after HTTP, consumers and the outbox
 * relay have drained, rather than on Nest module destroy.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ datasourceUrl: process.env.IDENTITY_DATABASE_URL });
    onShutdown("prisma", "resources", () => this.$disconnect());
  }

  async onModuleInit() {
    registerHealthCheck("postgres", async () => {
      await this.$queryRaw`SELECT 1`;
    });
    await this.$connect();
  }
}
