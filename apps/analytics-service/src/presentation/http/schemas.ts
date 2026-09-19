import { z } from "zod";

const days = z.coerce.number().int().min(1).max(366).default(30);

export const overviewQuerySchema = z.object({ days });

export const topProductsQuerySchema = z.object({
  days,
  limit: z.coerce.number().int().min(1).max(50).default(5),
});
