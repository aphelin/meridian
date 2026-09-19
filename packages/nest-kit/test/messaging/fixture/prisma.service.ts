import { Injectable } from "@nestjs/common";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { onShutdown } from "../../../src/core";

type GeneratedModule = typeof import("./generated");

/**
 * The generated client lives next to the sources (`fixture/generated`) while tsc emits into `fixture/dist/...`,
 * so it is loaded from whichever of the two locations exists at runtime.
 */
function loadGenerated(): GeneratedModule {
  const candidates = [join(__dirname, "generated"), join(__dirname, "../../../../generated")];
  const dir = candidates.find((candidate) => existsSync(join(candidate, "index.js")));
  if (!dir) throw new Error(`Generated Prisma client not found (looked in ${candidates.join(", ")}); run prisma generate`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(dir) as GeneratedModule;
}

const { PrismaClient } = loadGenerated();

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({ datasourceUrl: process.env.KIT_FIXTURE_DATABASE_URL });
    // Disconnect last, after consumers and the relay have drained (not on Nest's module destroy).
    onShutdown("prisma", "resources", () => this.$disconnect());
  }
}
