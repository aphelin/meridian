"use client";

import type { BreakerStatusDto, HealthDto, MessagingStatusDto } from "@meridian/contracts";
import { StateChip } from "../kit";

/** Shape of `admin.system.overview` (contract revision 2). */
export interface ServiceOverview {
  service: string;
  url: string;
  health: HealthDto | null;
  messaging: MessagingStatusDto | null;
  breakers: BreakerStatusDto[];
  error: string | null;
}
export interface SystemOverview {
  services: ServiceOverview[];
  bff: { breakers: BreakerStatusDto[] };
}
export type DeadLetterSelection = { service: string; source: "rabbit" | "kafka"; queueOrTopic: string };

/** Messaging names carry the stack namespace (`t-stack-abc.notification.send-email`); show the logical name. */
export function logicalName(name: string) {
  return name.replace(/^t-[a-z0-9-]+\./i, "");
}

export function healthTone(health: HealthDto | null): { tone: "ok" | "warn" | "error"; label: string } {
  if (!health) return { tone: "error", label: "Unreachable" };
  if (health.status === "ok") return { tone: "ok", label: "Healthy" };
  if (health.status === "degraded") return { tone: "warn", label: "Degraded" };
  if (health.status === "shutting-down") return { tone: "warn", label: "Shutting down" };
  return { tone: "error", label: "Down" };
}

const BREAKER_LABEL = { closed: "Closed", "half-open": "Half-open", open: "Open" } as const;

/** Closed = moss (calls flow), half-open = amber (trial call), open = brick (failing fast). */
export function BreakerChip({ state }: { state: BreakerStatusDto["state"] }) {
  return (
    <StateChip tone={state === "closed" ? "ok" : state === "half-open" ? "warn" : "error"} title={`Circuit ${BREAKER_LABEL[state].toLowerCase()}`}>
      {BREAKER_LABEL[state]}
    </StateChip>
  );
}

/** Chaos injection points a service is known to have, beyond its breakers and message handlers. */
export const EXTRA_CHAOS_TARGETS: Record<string, string[]> = {
  "catalog-service": ["s3.put"],
  "checkout-service": ["s3.put"],
  "payment-service": ["payment.local-sandbox", "stripe.api", "paddle.api"],
  "notification-service": ["smtp.send"],
};

export function chaosTargets(service: ServiceOverview | undefined, name: string): string[] {
  const targets = new Set<string>(EXTRA_CHAOS_TARGETS[name] ?? []);
  for (const b of service?.breakers ?? []) if (b.target && b.target !== "s3") targets.add(b.target);
  for (const q of service?.messaging?.queues ?? []) targets.add(`handler:rabbit:${logicalName(q.queue)}`);
  for (const g of service?.messaging?.consumerGroups ?? []) targets.add(`handler:kafka:${logicalName(g.group)}`);
  return [...targets];
}
