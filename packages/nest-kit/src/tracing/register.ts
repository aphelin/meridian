/**
 * `import "@meridian/nest-kit/tracing"` must be the first line of every service `main.ts`, so instrumentation patches
 * http, express, Nest, pg, ioredis, amqplib and kafkajs before they are loaded. Starts the OpenTelemetry NodeSDK with
 * the OTLP HTTP exporter only when OTEL_EXPORTER_OTLP_ENDPOINT is set; otherwise it loads nothing and does nothing.
 */
import { onShutdown } from "../core/lifecycle";
import { createLogger } from "../core/logger";

export const tracingEnabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());

if (tracingEnabled) {
  // Loaded lazily so a disabled tracer costs nothing at startup; `require` keeps registration synchronous.
  const { NodeSDK } = require("@opentelemetry/sdk-node") as typeof import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node") as typeof import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http") as typeof import("@opentelemetry/exporter-trace-otlp-http");

  const log = createLogger("Tracing");
  const serviceName = process.env.SERVICE_NAME?.trim() || process.env.OTEL_SERVICE_NAME?.trim() || "unknown-service";
  const sdk = new NodeSDK({
    serviceName,
    // Reads OTEL_EXPORTER_OTLP_ENDPOINT and appends /v1/traces.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem, DNS and raw socket spans drown the request traces this platform is meant to show.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });
  sdk.start();
  log.info("tracing started", { serviceName, endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });
  onShutdown("tracing", "resources", async () => {
    await sdk.shutdown();
  });
}
