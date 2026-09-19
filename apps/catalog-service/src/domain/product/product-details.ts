import { ensure } from "@meridian/kernel";
import { optionalText } from "../shared/text";

export interface ProductDetailsProps {
  widthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  construction: string | null;
  care: string | null;
}

const MAX_MEASURE = 10_000;

function measure(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  ensure(typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_MEASURE, "VALIDATION_FAILED", `${field} must be a positive number.`, { field });
  return value;
}

/** Dimensions, weight and making notes shown on the product page. Immutable value object. */
export class ProductDetails implements ProductDetailsProps {
  private constructor(
    readonly widthCm: number | null,
    readonly depthCm: number | null,
    readonly heightCm: number | null,
    readonly weightKg: number | null,
    readonly construction: string | null,
    readonly care: string | null,
  ) {}

  static create(input: Partial<ProductDetailsProps> | null | undefined): ProductDetails {
    const d = input ?? {};
    return new ProductDetails(
      measure(d.widthCm, "widthCm"),
      measure(d.depthCm, "depthCm"),
      measure(d.heightCm, "heightCm"),
      measure(d.weightKg, "weightKg"),
      optionalText(d.construction, "construction", 2000),
      optionalText(d.care, "care", 2000),
    );
  }

  static empty(): ProductDetails {
    return ProductDetails.create({});
  }

  equals(other: ProductDetails): boolean {
    return (
      this.widthCm === other.widthCm &&
      this.depthCm === other.depthCm &&
      this.heightCm === other.heightCm &&
      this.weightKg === other.weightKg &&
      this.construction === other.construction &&
      this.care === other.care
    );
  }

  toJSON(): ProductDetailsProps {
    return { widthCm: this.widthCm, depthCm: this.depthCm, heightCm: this.heightCm, weightKg: this.weightKg, construction: this.construction, care: this.care };
  }
}
