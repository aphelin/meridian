import "../../../src/tracing/register";
import { bootstrapService } from "../../../src/runtime/bootstrap";
import { FixtureModule } from "./fixture.module";

void bootstrapService({ name: "kit-runtime-fixture", module: FixtureModule, defaultPort: 4091 }).catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ level: "error", msg: "fixture failed to start", error: String(error) })}\n`);
  process.exit(1);
});
