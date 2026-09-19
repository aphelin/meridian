import type { Cents, ColorFamily, CurrencyCode, IsoDateTime, Page, ProductStatus } from "../common";

export interface CategoryDto {
  id: string;
  label: string;
  blurb: string;
  coverImageUrl: string;
  position: number;
}

export interface MaterialDto {
  id: string;
  label: string;
  swatchUrl: string;
}

export interface VariantDto {
  id: string;
  sku: string;
  label: string;
  colorFamily: ColorFamily;
  material: string;
  swatchUrl: string;
  imageUrl: string;
  position: number;
}

export interface ProductImageDto {
  id: string;
  url: string;
  alt: string;
  position: number;
}

export interface ProductDetailsDto {
  widthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  construction: string | null;
  care: string | null;
}

export interface RatingSummaryDto {
  average: number | null;
  count: number;
  /** Index 0 = one star … index 4 = five stars. */
  distribution: [number, number, number, number, number];
}

export interface ProductDto {
  id: string;
  slug: string;
  name: string;
  kind: string;
  story: string;
  categoryId: string;
  materials: string[];
  priceCents: Cents;
  currency: CurrencyCode;
  status: ProductStatus;
  featured: boolean;
  soldOut: boolean;
  heroImageUrl: string;
  detailImageUrl: string | null;
  variants: VariantDto[];
  images: ProductImageDto[];
  details: ProductDetailsDto;
  rating: RatingSummaryDto;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CatalogSnapshotDto {
  categories: CategoryDto[];
  materials: MaterialDto[];
  products: ProductDto[];
}

export interface ProductInput {
  slug: string;
  name: string;
  kind: string;
  story: string;
  categoryId: string;
  materials: string[];
  priceCents: Cents;
  featured: boolean;
  soldOut: boolean;
  heroImageUrl: string;
  detailImageUrl: string | null;
  details: ProductDetailsDto;
}

export interface VariantInput {
  id: string;
  sku: string;
  label: string;
  colorFamily: ColorFamily;
  material: string;
  swatchUrl: string;
  imageUrl: string;
}

export interface ImageUploadTicketDto {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: IsoDateTime;
}

export interface ReviewDto {
  id: string;
  rating: number;
  title: string;
  body: string;
  /** First name and last initial only. */
  authorName: string;
  verifiedPurchase: true;
  createdAt: IsoDateTime;
}

export interface ReviewListDto extends Page<ReviewDto> {
  summary: RatingSummaryDto;
}

export interface ReviewEligibilityDto {
  eligible: boolean;
  reason: "eligible" | "sign-in" | "not-delivered" | "already-reviewed";
}

export interface WishlistDto {
  slugs: string[];
}
