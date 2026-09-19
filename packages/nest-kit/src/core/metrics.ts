import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "@prometheus-io/client";

/** The single Prometheus registry for the process; exposed at GET /metrics by the runtime bootstrap. */
export const metricsRegistry = new Registry();
let defaultsCollected = false;

export function collectProcessMetrics(): void {
  if (defaultsCollected) return;
  defaultsCollected = true;
  collectDefaultMetrics({ register: metricsRegistry });
}

const counters = new Map<string, Counter<string>>();
const gauges = new Map<string, Gauge<string>>();
const histograms = new Map<string, Histogram<string>>();

/** Idempotent: returns the existing metric when called again with the same name. */
export function counter(name: string, help: string, labelNames: string[] = []): Counter<string> {
  let metric = counters.get(name);
  if (!metric) {
    metric = new Counter({ name, help, labelNames, registers: [metricsRegistry] });
    counters.set(name, metric);
  }
  return metric;
}

export function gauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
  let metric = gauges.get(name);
  if (!metric) {
    metric = new Gauge({ name, help, labelNames, registers: [metricsRegistry] });
    gauges.set(name, metric);
  }
  return metric;
}

export function histogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram<string> {
  let metric = histograms.get(name);
  if (!metric) {
    metric = new Histogram({ name, help, labelNames, registers: [metricsRegistry], ...(buckets ? { buckets } : {}) });
    histograms.set(name, metric);
  }
  return metric;
}
