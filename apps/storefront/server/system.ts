import type { BreakerStatusDto, HealthDto, MessagingStatusDto } from "@meridian/contracts";
import { breakerSnapshot } from "./breaker";
import { ServiceError } from "./errors";
import { SERVICE_DEFS, SERVICE_KEYS, service, type ServiceKey } from "./services";

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

const HEALTH_TIMEOUT_MS = 3000;
const MESSAGING_TIMEOUT_MS = 5000;
const BREAKERS_TIMEOUT_MS = 3000;

export const SERVICE_NAMES = SERVICE_KEYS.map((k) => SERVICE_DEFS[k].service) as [string, ...string[]];

export function keyForServiceName(name: string): ServiceKey {
  const key = SERVICE_KEYS.find((k) => SERVICE_DEFS[k].service === name);
  if (!key) throw new ServiceError({ code: "VALIDATION_FAILED", message: "Unknown service." });
  return key;
}

function describe(part: string, error: unknown): string {
  if (error instanceof ServiceError) {
    const why = error.reason ? ` (${error.reason})` : "";
    return `${part}: ${error.code}${why}`;
  }
  return `${part}: ${error instanceof Error ? error.message : String(error)}`;
}

async function overviewOf(key: ServiceKey, token: string): Promise<ServiceOverview> {
  const client = service(key);
  const [health, messaging, breakers] = await Promise.allSettled([
    // A degraded or shutting-down service answers /health with 503 and a HealthDto body; that is still a health report.
    client.raw<HealthDto>("GET", "/health", { timeoutMs: HEALTH_TIMEOUT_MS, acceptStatuses: [503] }),
    client.get<MessagingStatusDto>("/admin/messaging", { token, timeoutMs: MESSAGING_TIMEOUT_MS }),
    client.get<BreakerStatusDto[]>("/admin/breakers", { token, timeoutMs: BREAKERS_TIMEOUT_MS }),
  ]);
  const errors: string[] = [];
  const healthBody = health.status === "fulfilled" && health.value.body && typeof health.value.body === "object" ? health.value.body : null;
  if (health.status === "rejected") errors.push(describe("health", health.reason));
  else if (!healthBody) errors.push("health: empty response");
  if (messaging.status === "rejected") errors.push(describe("messaging", messaging.reason));
  if (breakers.status === "rejected") errors.push(describe("breakers", breakers.reason));
  return {
    service: SERVICE_DEFS[key].service,
    url: client.baseUrl,
    health: healthBody,
    messaging: messaging.status === "fulfilled" ? (messaging.value ?? null) : null,
    breakers: breakers.status === "fulfilled" && Array.isArray(breakers.value) ? breakers.value : [],
    error: errors.length ? errors.join("; ") : null,
  };
}

/** Health, messaging and breaker state of all eight services in parallel; one service down never fails the overview. */
export async function systemOverview(token: string): Promise<SystemOverview> {
  const services = await Promise.all(SERVICE_KEYS.map((key) => overviewOf(key, token)));
  return { services, bff: { breakers: breakerSnapshot() } };
}
