import { rmSync } from "node:fs";
import { join } from "node:path";
import { clearRecordedChaos } from "./chaos";
import { tokens } from "./auth";
import { runDir, SERVICES, type ServiceName, serviceUrl } from "./env";
import { request } from "./http";
import { waitFor } from "./wait";
import { killLeftoverReplicas } from "./replica";

/** Safety net around the whole run: no replica or chaos rule from a crashed earlier run survives, before or after. */
async function sweep(phase: string) {
  const killed = killLeftoverReplicas();
  const cleared = await clearRecordedChaos();
  if (killed || cleared.length) console.warn(`[system-tests ${phase}] killed ${killed} leftover replica(s); cleared chaos: ${cleared.join(", ") || "none"}`);
}

/**
 * A breaker a previous stack session left open (e.g. smtp after an outage demo) would dead-letter this run's first
 * emails; start only when every stack breaker has left the open state (they half-open after BREAKER_RESET_MS).
 */
async function breakersSettled() {
  await waitFor(
    async () => {
      const open: string[] = [];
      for (const svc of Object.keys(SERVICES) as ServiceName[]) {
        const r = await request(serviceUrl(svc), "GET", "/admin/breakers", { token: tokens.admin() });
        if (r.status !== 200) throw new Error(`${svc} /admin/breakers: ${r.status}`);
        for (const b of r.json as { name: string; state: string }[]) if (b.state === "open") open.push(`${svc}:${b.name}`);
      }
      if (open.length) console.warn(`[system-tests setup] waiting for open breakers: ${open.join(", ")}`);
      return open.length === 0;
    },
    "stack circuit breakers to leave the open state",
    { timeoutMs: 60_000, intervalMs: 2000 },
  );
}

export async function setup() {
  await sweep("setup");
  await breakersSettled();
  // keep only the previous run's replica logs around for diagnosis
  rmSync(join(runDir, "logs"), { recursive: true, force: true });
}

export async function teardown() {
  await sweep("teardown");
}
