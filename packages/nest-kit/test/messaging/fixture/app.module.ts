import { Module } from "@nestjs/common";
import { jwtModule } from "../../../src/auth";
import { MessagingModule } from "../../../src/messaging";
import { DemoController } from "./demo.controller";
import { DemoHandlers } from "./demo.handlers";
import { PrismaService } from "./prisma.service";

@Module({
  imports: [
    jwtModule(),
    MessagingModule.forRoot({ service: "kit-messaging-fixture", prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: [DemoController],
  providers: [PrismaService, DemoHandlers],
  exports: [PrismaService],
})
export class AppModule {}
