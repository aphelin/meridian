import { randomBytes } from "node:crypto";
import { hostname } from "node:os";

let name = process.env.SERVICE_NAME ?? "unknown-service";
const instance = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;

/** Service name used in logs, metrics, outbox `producer`, Kafka client ids and OTel resources. */
export function serviceName(): string {
  return name;
}

export function setServiceName(value: string): void {
  name = value;
  process.env.SERVICE_NAME = value;
}

/** Unique per process; distinguishes replicas of the same service. */
export function instanceId(): string {
  return instance;
}

/** Name with the optional MESSAGING_NAMESPACE prefix applied (tests isolate topics, queues and groups with it). */
export function namespaced(value: string): string {
  const ns = process.env.MESSAGING_NAMESPACE?.trim();
  return ns ? `${ns}.${value}` : value;
}
