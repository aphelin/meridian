import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { JsonNestLogger, RequestContext, createLogger, installSignalHandlers, onShutdown, setServiceName } from "../../../src/core";
import { AppModule } from "./app.module";
import { FixtureErrorFilter } from "./error.filter";

async function main() {
  setServiceName(process.env.SERVICE_NAME ?? "kit-messaging-fixture");
  const log = createLogger("Fixture");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: new JsonNestLogger(), bodyParser: false });
  // Parse JSON first, then open the request context, so the context survives body-parser's stream callbacks.
  app.useBodyParser("json", { limit: "1mb" });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const header = req.headers["x-correlation-id"];
    const correlationId = typeof header === "string" && header ? header : undefined;
    RequestContext.run({ correlationId }, () => {
      res.setHeader("x-correlation-id", RequestContext.correlationId() ?? "");
      next();
    });
  });
  app.useGlobalFilters(new FixtureErrorFilter());
  installSignalHandlers();
  onShutdown("http", "http", () => app.close());
  const port = Number(process.env.PORT ?? 4095);
  await app.listen(port);
  log.info("service started", { port });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
