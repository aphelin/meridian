import { Module } from "@nestjs/common";
import { jwtModule } from "../../../src/auth";
import { KitModule } from "../../../src/runtime/kit.module";
import { DemoController } from "./demo.controller";

@Module({
  imports: [KitModule.forRoot({ service: "kit-runtime-fixture" }), jwtModule()],
  controllers: [DemoController],
})
export class FixtureModule {}
