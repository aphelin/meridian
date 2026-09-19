import { z } from "zod";

const COLOR_FAMILIES = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"] as const;
const SORTS = ["relevance", "featured", "newest", "price-asc", "price-desc", "name"] as const;

/** Query strings arrive as strings; a repeated parameter arrives as an array (take the last). */
const single = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (Array.isArray(value) ? value.at(-1) : value), schema);
const commaList = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) =>
      (Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    z.array(item).max(20),
  );
const cents = single(z.coerce.number().int().min(0).max(100_000_000)).optional();

export const searchQuerySchema = z.object({
  q: single(z.string().max(200)).optional(),
  category: single(z.string().trim().max(100)).optional(),
  materials: commaList(z.string().max(100)).optional(),
  colors: commaList(z.enum(COLOR_FAMILIES)).optional(),
  minPriceCents: cents,
  maxPriceCents: cents,
  inStock: single(z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1")).optional(),
  sort: single(z.enum(SORTS)).optional(),
  limit: single(z.coerce.number().int().min(1).max(50)).optional(),
  cursor: single(z.string().max(1024)).optional(),
});
export type SearchQueryParams = z.output<typeof searchQuerySchema>;

export const suggestQuerySchema = z.object({
  q: single(z.string().max(200)).default(""),
  limit: single(z.coerce.number().int().min(1).max(20)).optional(),
});
