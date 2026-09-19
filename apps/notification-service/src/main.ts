import "@meridian/nest-kit/tracing";
import "reflect-metadata";
import { assertSandboxSmtp, bootstrapService, createLogger } from "@meridian/nest-kit";
import { AppModule, SERVICE_NAME } from "./app.module";

const log = createLogger("Main");

async function main() {
  // Email is sandbox only: refuse to start at all against a real SMTP relay (SANDBOX_ONLY), before connecting anything.
  assertSandboxSmtp(process.env);
  await bootstrapService({ name: SERVICE_NAME, module: AppModule, defaultPort: 3006 });
}

main().catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  log.error("notification-service failed to start", { code: typeof code === "string" ? code : undefined, error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
  // Give the log line time to flush; half-open connections from a failed bootstrap must not keep the process alive.
  setTimeout(() => process.exit(1), 250);
});
