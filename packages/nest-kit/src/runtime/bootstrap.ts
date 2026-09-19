import { type DynamicModule, type INestApplication, Module, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import type { Server } from "node:http";
import { installSignalHandlers, onShutdown } from "../core/lifecycle";
import { createLogger, JsonNestLogger } from "../core/logger";
import { collectProcessMetrics } from "../core/metrics";
import { setServiceName } from "../core/service-info";
import { envInt, envList } from "../config/env";
import { KitExceptionFilter, sendApiError } from "./exception-filter";
import { HealthController } from "./health.controller";
import { closeHttpServer } from "./http-shutdown";
import { requestContextMiddleware, restoreRequestContext } from "./request-context";

export interface BootstrapOptions {
  /** Service name for logs, metrics, tracing and chaos keys, e.g. "checkout-service". */
  name: string;
  module: Type<unknown> | DynamicModule;
  /** Used when PORT is not set. */
  defaultPort: number;
  /** Keep the raw request body on `req.rawBody` (webhook signature verification). */
  rawBody?: boolean;
  /** Last chance to adjust the app (extra middleware, global interceptors) before it starts listening. */
  configure?: (app: NestExpressApplication) => void | Promise<void>;
}

export const BODY_LIMIT = "1mb";
const log = createLogger("Bootstrap");
let processHandlersInstalled = false;

function installProcessHandlers() {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.on("unhandledRejection", (reason) => log.error("unhandled promise rejection", { error: reason }));
  installSignalHandlers();
}

/** Body-parser failures happen before Nest routing, so Nest filters never see them; answer them as ApiError here. */
function bodyErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);
  sendApiError(error, req, res);
}

/**
 * Creates and starts a service: JSON logging, correlation ids, helmet, 1 MB body limit, optional CORS, ApiError
 * mapping, HTTP metrics, health and metrics routes, and graceful shutdown on SIGTERM/SIGINT.
 */
export async function bootstrapService(options: BootstrapOptions): Promise<INestApplication> {
  setServiceName(options.name);
  collectProcessMetrics();

  @Module({ imports: [options.module], controllers: [HealthController] })
  class ServiceRootModule {}

  const app = await NestFactory.create<NestExpressApplication>(ServiceRootModule, {
    logger: new JsonNestLogger(),
    bodyParser: false,
    rawBody: options.rawBody ?? false,
    abortOnError: false,
  });

  app.use(requestContextMiddleware);
  app.use(helmet());
  const origins = envList("CORS_ORIGINS");
  if (origins.length) app.enableCors({ origin: origins, credentials: true });
  app.useBodyParser("json", { limit: BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: BODY_LIMIT, extended: true });
  app.use(bodyErrorHandler);
  app.use(restoreRequestContext);
  app.useGlobalFilters(new KitExceptionFilter());

  // Registered before app.init() so Nest's own teardown (onModuleDestroy, e.g. Prisma) runs first in "resources".
  const hookTimeout = envInt("SHUTDOWN_HOOK_TIMEOUT_MS", 10_000, { min: 0 });
  onShutdown("http-server", "http", () => closeHttpServer(app.getHttpServer() as Server, Math.max(0, hookTimeout - 500)));
  onShutdown("nest-application", "resources", () => app.close());

  await options.configure?.(app);
  installProcessHandlers();

  const port = envInt("PORT", options.defaultPort, { min: 0, max: 65_535 });
  await app.listen(port);
  const address = (app.getHttpServer() as Server).address();
  log.info("service started", { port: typeof address === "object" && address ? address.port : port });
  return app;
}
