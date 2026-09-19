import { HttpHeaders } from "@meridian/contracts";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { RequestContext, type RequestContextState } from "../core/context";
import { isShuttingDown } from "../core/lifecycle";
import { createLogger } from "../core/logger";
import { histogram } from "../core/metrics";

const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const CONTEXT = Symbol("meridian:request-context");
const QUIET_ROUTES = new Set(["/health", "/health/live", "/health/ready", "/metrics"]);
const log = createLogger("Http");

type ContextRequest = Request & { [CONTEXT]?: RequestContextState };

/** Incoming `x-correlation-id` when it is a sane token, otherwise a fresh UUID (never trust arbitrary header content into logs). */
export function correlationIdFrom(header: string | string[] | undefined): string {
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  return value && CORRELATION_ID.test(value) ? value : randomUUID();
}

const durations = () =>
  histogram("http_request_duration_seconds", "HTTP request duration by method, route and status", ["method", "route", "status"], [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
  ]);

/** Route template (e.g. `/orders/:id`) so metric cardinality stays bounded; unmatched paths collapse into one label. */
function routeOf(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === "string" ? `${req.baseUrl ?? ""}${path}` : "unmatched";
}

/**
 * First middleware: assigns the correlation id (request header for downstream readers, response header for callers),
 * opens the RequestContext, records the request duration and writes one access log line.
 */
export function requestContextMiddleware(req: ContextRequest, res: Response, next: NextFunction): void {
  const correlationId = correlationIdFrom(req.headers[HttpHeaders.correlationId]);
  req.headers[HttpHeaders.correlationId] = correlationId;
  res.setHeader(HttpHeaders.correlationId, correlationId);
  // Keep-alive sockets would otherwise pin the server open after close() during graceful shutdown.
  if (isShuttingDown()) res.setHeader("connection", "close");

  const initial: RequestContextState = { correlationId, causationId: null, principalId: null };
  const started = process.hrtime.bigint();
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = routeOf(req);
    const status = res.headersSent ? res.statusCode : 499;
    durations().observe({ method: req.method, route, status: String(status) }, seconds);
    if (!QUIET_ROUTES.has(route)) {
      RequestContext.run(req[CONTEXT] ?? initial, () =>
        log.info("request completed", { method: req.method, route, path: req.originalUrl, status, durationMs: Math.round(seconds * 1000) }),
      );
    }
  };
  res.once("finish", record);
  res.once("close", record);

  RequestContext.run(initial, () => {
    // `run` copies the state; keep the live store so later middleware can re-enter it and see principal patches.
    req[CONTEXT] = RequestContext.get();
    next();
  });
}

/**
 * Re-enters the request's context after body parsing: body-parser resumes from stream callbacks that belong to the
 * socket's async resource, where the AsyncLocalStorage store opened by the first middleware is no longer active.
 */
export function restoreRequestContext(req: ContextRequest, _res: Response, next: NextFunction): void {
  const state = req[CONTEXT];
  if (!state) return next();
  if (RequestContext.get() === state) return next();
  RequestContext.run(state, () => {
    req[CONTEXT] = RequestContext.get();
    next();
  });
}
