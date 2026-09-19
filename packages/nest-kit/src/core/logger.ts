import type { LoggerService } from "@nestjs/common";
import { trace } from "@opentelemetry/api";
import { RequestContext } from "./context";
import { instanceId, serviceName } from "./service-info";

export type LogLevel = "debug" | "info" | "warn" | "error";
const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return order[level] ?? order.info;
}

/** One JSON object per line on stdout: time, level, service, instance, context, correlationId, traceId, msg, fields. */
export function writeLog(level: LogLevel, context: string, msg: string, fields: Record<string, unknown> = {}): void {
  if (order[level] < threshold()) return;
  const span = trace.getActiveSpan()?.spanContext();
  const line = {
    time: new Date().toISOString(),
    level,
    service: serviceName(),
    instance: instanceId(),
    context,
    correlationId: RequestContext.correlationId() ?? null,
    traceId: span?.traceId ?? null,
    msg,
    ...fields,
  };
  const text = JSON.stringify(line, (_key, value) => (value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value));
  if (level === "error" || level === "warn") process.stderr.write(`${text}\n`);
  else process.stdout.write(`${text}\n`);
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(context: string): Logger {
  return {
    debug: (msg, fields) => writeLog("debug", context, msg, fields),
    info: (msg, fields) => writeLog("info", context, msg, fields),
    warn: (msg, fields) => writeLog("warn", context, msg, fields),
    error: (msg, fields) => writeLog("error", context, msg, fields),
  };
}

/** Nest LoggerService adapter so framework logs share the JSON format. */
export class JsonNestLogger implements LoggerService {
  log(message: unknown, context?: string) {
    writeLog("info", context ?? "Nest", String(message));
  }
  error(message: unknown, stack?: string, context?: string) {
    writeLog("error", context ?? "Nest", String(message), stack ? { stack } : {});
  }
  warn(message: unknown, context?: string) {
    writeLog("warn", context ?? "Nest", String(message));
  }
  debug(message: unknown, context?: string) {
    writeLog("debug", context ?? "Nest", String(message));
  }
  verbose(message: unknown, context?: string) {
    writeLog("debug", context ?? "Nest", String(message));
  }
}
