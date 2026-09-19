import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const cents = z.number().int().min(0).max(100_000_000);

export const createIntentSchema = z.object({
  orderId: id,
  orderNumber: z.string().trim().min(1).max(40),
  amountCents: cents.min(1),
  currency: z.literal("EUR"),
  customer: z.object({ email: z.string().trim().max(254).pipe(z.email()), name: z.string().trim().min(1).max(200) }),
  lines: z
    .array(z.object({ name: z.string().trim().min(1).max(300), qty: z.number().int().min(1).max(10_000), unitPriceCents: cents }))
    .min(1)
    .max(200),
});

export const sandboxCompleteSchema = z.object({
  clientSecret: z.string().min(1).max(200),
});

export const transactionIdParam = z.string().min(1).max(100);
export const orderIdParam = id;
