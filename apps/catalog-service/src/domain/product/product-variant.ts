import type { ColorFamily } from "@meridian/contracts";
import { ensure } from "@meridian/kernel";
import { assetUrl, requiredText } from "../shared/text";

export const COLOR_FAMILIES: readonly ColorFamily[] = ["neutral", "white", "black", "grey", "brown", "green", "blue", "red", "orange", "yellow", "pink", "metal"];

const VARIANT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const MATERIAL_ID = /^[a-z][a-z0-9-]{0,39}$/;
export const MAX_VARIANTS = 20;

export interface VariantProps {
  /** Stable id used in URLs and carts, e.g. "charcoal". */
  id: string;
  sku: string;
  label: string;
  colorFamily: ColorFamily;
  /** Material id from the catalog material list. */
  material: string;
  swatchUrl: string;
  imageUrl: string;
}

/** One purchasable configuration of a product, identified globally by its SKU. Immutable value object. */
export class ProductVariant implements VariantProps {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly colorFamily: ColorFamily;
  readonly material: string;
  readonly swatchUrl: string;
  readonly imageUrl: string;

  private constructor(props: VariantProps) {
    this.id = props.id;
    this.sku = props.sku;
    this.label = props.label;
    this.colorFamily = props.colorFamily;
    this.material = props.material;
    this.swatchUrl = props.swatchUrl;
    this.imageUrl = props.imageUrl;
  }

  static create(input: VariantProps): ProductVariant {
    const id = typeof input.id === "string" ? input.id.trim() : "";
    ensure(VARIANT_ID.test(id), "VALIDATION_FAILED", "Variant ids use lower-case letters, digits and hyphens.", { id: input.id });
    const sku = typeof input.sku === "string" ? input.sku.trim() : "";
    ensure(SKU.test(sku), "VALIDATION_FAILED", "SKUs use upper-case letters, digits and hyphens (2–40 characters).", { sku: input.sku });
    ensure(COLOR_FAMILIES.includes(input.colorFamily), "VALIDATION_FAILED", "Unknown colour family.", { colorFamily: input.colorFamily });
    ensure(typeof input.material === "string" && MATERIAL_ID.test(input.material), "VALIDATION_FAILED", "Variant material must be a material id.", { material: input.material });
    return new ProductVariant({
      id,
      sku,
      label: requiredText(input.label, "Variant label", 80),
      colorFamily: input.colorFamily,
      material: input.material,
      swatchUrl: assetUrl(input.swatchUrl, "swatchUrl"),
      imageUrl: assetUrl(input.imageUrl, "imageUrl"),
    });
  }

  equals(other: ProductVariant): boolean {
    return (
      this.id === other.id &&
      this.sku === other.sku &&
      this.label === other.label &&
      this.colorFamily === other.colorFamily &&
      this.material === other.material &&
      this.swatchUrl === other.swatchUrl &&
      this.imageUrl === other.imageUrl
    );
  }
}

/** Validates a full variant list: at least one, at most MAX_VARIANTS, unique ids and SKUs. */
export function variantList(inputs: readonly VariantProps[]): ProductVariant[] {
  ensure(Array.isArray(inputs) && inputs.length >= 1, "VALIDATION_FAILED", "A product needs at least one variant.");
  ensure(inputs.length <= MAX_VARIANTS, "VALIDATION_FAILED", `A product can have at most ${MAX_VARIANTS} variants.`);
  const variants = inputs.map((input) => ProductVariant.create(input));
  const ids = new Set(variants.map((v) => v.id));
  ensure(ids.size === variants.length, "VALIDATION_FAILED", "Variant ids must be unique within a product.");
  const skus = new Set(variants.map((v) => v.sku));
  ensure(skus.size === variants.length, "VALIDATION_FAILED", "Variant SKUs must be unique.");
  return variants;
}
