import "@meridian/nest-kit/tracing";
import "reflect-metadata";
import { bootstrapService } from "@meridian/nest-kit";
import { AppModule, SERVICE_NAME } from "./app.module";

void bootstrapService({ name: SERVICE_NAME, module: AppModule, defaultPort: 3004 });
