import { envInt } from "@meridian/nest-kit";
import type { InventorySettings } from "../../application/ports";

/** Reads and validates the inventory environment once at startup (fails fast on malformed values). */
export function loadInventorySettings(env: NodeJS.ProcessEnv = process.env): InventorySettings {
  return {
    holdSeconds: envInt("RESERVATION_HOLD_SECONDS", 900, { min: 1, max: 7 * 24 * 3600, env }),
    graceSeconds: envInt("RESERVATION_GRACE_SECONDS", 300, { min: 0, max: 7 * 24 * 3600, env }),
    sweepMs: envInt("RESERVATION_SWEEP_MS", 60_000, { min: 100, max: 24 * 3600 * 1000, env }),
    sweepBatch: envInt("RESERVATION_SWEEP_BATCH", 100, { min: 1, max: 1000, env }),
    defaultOnHand: envInt("DEFAULT_STOCK_ON_HAND", 8, { min: 0, max: 1_000_000, env }),
  };
}
