import "@meridian/nest-kit/tracing";
import "reflect-metadata";
import { bootstrapService, createLogger } from "@meridian/nest-kit";
import { AppModule, SERVICE_NAME } from "./app.module";

bootstrapService({ name: SERVICE_NAME, module: AppModule, defaultPort: 3012 }).catch((error: unknown) => {
  createLogger("Main").error("catalog-service failed to start", { error });
  process.exit(1);
});
