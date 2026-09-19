import { z } from "zod";
import { EMAIL_TEMPLATES } from "../../domain";

const email = z.string().trim().min(3).max(254);

export const subscribeSchema = z.object({ email });
export const tokenSchema = z.object({ token: z.string().min(1).max(200) });

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  topic: z.enum(["order", "product", "returns", "other"]),
  orderNumber: z.string().trim().max(40).nullish(),
  message: z.string().trim().min(10).max(5000),
});

export const stockAlertSchema = z.object({
  email,
  sku: z.string().trim().min(1).max(64),
  slug: z.string().trim().min(1).max(120),
});

const limit = z.coerce.number().int().min(1).max(100).default(50);
const cursor = z.string().max(300).optional();

export const deliveriesQuerySchema = z.object({
  status: z.enum(["queued", "sent", "failed", "dead-lettered", "suppressed"]).optional(),
  template: z.enum(EMAIL_TEMPLATES).optional(),
  cursor,
  limit,
});

export const contactMessagesQuerySchema = z.object({ cursor, limit });
