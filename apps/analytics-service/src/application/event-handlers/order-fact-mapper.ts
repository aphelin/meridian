import type { EventEnvelope } from "@meridian/contracts";
import { PermanentError } from "@meridian/nest-kit";
import { z } from "zod";
import type { OrderFact } from "../../domain";

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const orderId = z.string().min(1).max(200);
const line = z.object({
  sku: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
  productName: z.string().max(300),
  qty: z.number().int().positive().max(1_000_000),
  lineTotalCents: cents,
});
const pricing = z.object({ totalCents: cents });

const schemas = {
  OrderPlaced: z.object({ orderId, pricing, placedAt: isoDate }),
  OrderPaid: z.object({ orderId, pricing, lines: z.array(line).max(500), paidAt: isoDate }),
  OrderCancelled: z.object({ orderId, reason: z.string().min(1).max(100), cancelledAt: isoDate }),
  OrderRefunded: z.object({ orderId, amountCents: cents, totalRefundedCents: cents }),
  PaymentFailed: z.object({ orderId }),
} as const;

type ProjectedEvent = keyof typeof schemas;

const envelopeShape = z.object({ messageId: z.string().min(1).max(200), occurredAt: isoDate });

/**
 * Translates a contract envelope into a domain fact. A payload that does not match the contract will never
 * succeed, so it is a PermanentError (parked on the group's DLT instead of retried).
 */
export function toOrderFact(envelope: EventEnvelope): { messageId: string; occurredAt: Date; fact: OrderFact } {
  const meta = envelopeShape.safeParse(envelope);
  if (!meta.success) throw new PermanentError(`Invalid ${String(envelope?.name)} envelope`, { issues: issues(meta.error) });
  const { messageId, occurredAt } = meta.data;
  const name = envelope.name as ProjectedEvent;
  const schema = schemas[name];
  if (!schema) throw new PermanentError(`analytics-projector does not project ${String(envelope.name)}`);
  const parsed = schema.safeParse(envelope.payload);
  if (!parsed.success) throw new PermanentError(`Invalid ${name} payload`, { issues: issues(parsed.error) });
  return { messageId, occurredAt, fact: buildFact(name, parsed.data, occurredAt) };
}

function buildFact(name: ProjectedEvent, data: unknown, occurredAt: Date): OrderFact {
  switch (name) {
    case "OrderPlaced": {
      const p = data as z.output<typeof schemas.OrderPlaced>;
      return { kind: "placed", orderId: p.orderId, at: p.placedAt, totalCents: p.pricing.totalCents };
    }
    case "OrderPaid": {
      const p = data as z.output<typeof schemas.OrderPaid>;
      return { kind: "paid", orderId: p.orderId, at: p.paidAt, totalCents: p.pricing.totalCents, lines: p.lines };
    }
    case "OrderCancelled": {
      const p = data as z.output<typeof schemas.OrderCancelled>;
      return { kind: "cancelled", orderId: p.orderId, at: p.cancelledAt, reason: p.reason };
    }
    case "OrderRefunded": {
      const p = data as z.output<typeof schemas.OrderRefunded>;
      return { kind: "refunded", orderId: p.orderId, at: occurredAt, amountCents: p.amountCents, totalRefundedCents: p.totalRefundedCents };
    }
    case "PaymentFailed": {
      const p = data as z.output<typeof schemas.PaymentFailed>;
      return { kind: "payment-failed", orderId: p.orderId, at: occurredAt };
    }
  }
}

const issues = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
