import "@meridian/nest-kit/tracing";
import "reflect-metadata";
import { bootstrapService } from "@meridian/nest-kit";
import { AppModule, SERVICE_NAME } from "./app.module";

void bootstrapService({ name: SERVICE_NAME, module: AppModule, defaultPort: 3001 }).catch((error: unknown) => {
  console.error(JSON.stringify({ level: "error", msg: "identity-service failed to start", error: error instanceof Error ? error.stack : String(error) }));
  process.exit(1);
});
