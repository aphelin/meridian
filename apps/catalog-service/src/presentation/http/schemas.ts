import { z } from "zod";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF_ID = /^[a-z][a-z0-9-]{0,39}$/;
const ASSET = /^(\/\S*|https?:\/\/\S+)$/;

export const slugSchema = z.string().trim().min(1).max(80).regex(SLUG, "lower-case letters, digits and single hyphens");
const assetUrl = z.string().trim().min(1).max(500).regex(ASSET, "a site path starting with / or an http(s) URL");
const measure = z.number().positive().max(10_000).nullable();

export const productDetailsSchema = z.object({
  widthCm: measure.optional().default(null),
  depthCm: measure.optional().default(null),
  heightCm: measure.optional().default(null),
  weightKg: measure.optional().default(null),
  construction: z.string().trim().max(2000).nullable().optional().default(null),
  care: z.string().trim().max(2000).nullable().optional().default(null),
});

export const productInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(120),
  story: z.string().trim().min(1).max(2000),
  categoryId: z.string().regex(REF_ID),
  materials: z.array(z.string().regex(REF_ID)).max(20),
  priceCents: z.number().int().positive().max(100_000_000),
  featured: z.boolean(),
  soldOut: z.boolean(),
  heroImageUrl: assetUrl,
  detailImageUrl: assetUrl.nullable(),
  details: productDetailsSchema,
});

export const productPatchSchema = productInputSchema.partial();

export const colorFamilySchema = z.enum(["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"]);

export const variantInputSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "lower-case letters, digits and hyphens"),
  sku: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, "upper-case letters, digits and hyphens"),
  label: z.string().trim().min(1).max(80),
  colorFamily: colorFamilySchema,
  material: z.string().regex(REF_ID),
  swatchUrl: assetUrl,
  imageUrl: assetUrl,
});

export const variantListSchema = z
  .array(variantInputSchema)
  .min(1, "at least one variant")
  .max(20)
  .refine((list) => new Set(list.map((v) => v.id)).size === list.length, "variant ids must be unique")
  .refine((list) => new Set(list.map((v) => v.sku)).size === list.length, "variant SKUs must be unique");

export const uploadUrlSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], "images must be JPEG, PNG or WebP"),
  fileName: z.string().trim().min(1).max(200),
});

export const attachImageSchema = z.object({
  objectKey: z.string().trim().min(1).max(300),
  alt: z.string().trim().min(1).max(200),
});

const flag = z.enum(["true", "false"]).transform((v) => v === "true");
const limit = z.coerce.number().int().min(1).max(100);
const cursor = z.string().min(1).max(200);

export const productListQuerySchema = z.object({
  category: z.string().regex(REF_ID).optional(),
  featured: flag.optional(),
  cursor: cursor.optional(),
  limit: limit.optional(),
});

export const adminProductListQuerySchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  q: z.string().trim().max(120).optional(),
  cursor: cursor.optional(),
  limit: limit.optional(),
});

export const pricesQuerySchema = z.object({
  skus: z
    .string()
    .max(4000)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(40)).max(100)),
});

export const reviewListQuerySchema = z.object({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(20, "reviews need at least 20 characters").max(2000),
});

export const wishlistReplaceSchema = z.object({ slugs: z.array(slugSchema).max(100) });
export const wishlistAddSchema = z.object({ slug: slugSchema });
export const productIdSchema = z.string().min(1).max(64);
