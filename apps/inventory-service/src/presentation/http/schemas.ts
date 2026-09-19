import { z } from "zod";

const sku = z.string().trim().min(1).max(64);
const orderId = z.string().trim().min(1).max(100);
const units = z.number().int().min(0).max(1_000_000);

export const reservationRequestSchema = z.object({
  orderId,
  lines: z
    .array(z.object({ sku, qty: z.number().int().min(1).max(1_000_000) }))
    .min(1)
    .max(100),
});

export const releaseRequestSchema = z
  .object({ reason: z.enum(["cancelled", "expired", "payment-failed"]).default("cancelled") })
  .default({ reason: "cancelled" });

export const adjustStockSchema = z
  .object({
    sku,
    onHand: units.optional(),
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0, "delta must not be zero").optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((body) => (body.onHand === undefined) !== (body.delta === undefined), { message: "Provide exactly one of onHand or delta", path: ["onHand"] });

export const seedStockSchema = z.object({
  skus: z.array(z.object({ sku, onHand: units })).max(5_000),
});

export const movementsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
