import type { ProductStatus } from "@meridian/contracts";
import { AggregateRoot, DomainError, ensure, Money, NotFoundError } from "@meridian/kernel";
import { parseSlug } from "../shared/slug";
import { assetUrl, requiredText } from "../shared/text";
import { ProductDetails, type ProductDetailsProps } from "./product-details";
import type { ProductEvent, ProductField } from "./product-events";
import { MAX_IMAGES_PER_PRODUCT, type ProductImage } from "./product-image";
import { variantList, type ProductVariant, type VariantProps } from "./product-variant";
import { RatingSummary } from "./rating-summary";

export const MAX_PRICE_CENTS = 100_000_000;
export const MAX_MATERIALS = 20;
const MATERIAL_ID = /^[a-z][a-z0-9-]{0,39}$/;

/** The editable description of a product (contracts `ProductInput`). */
export interface ProductContentInput {
  slug: string;
  name: string;
  kind: string;
  story: string;
  categoryId: string;
  materials: string[];
  priceCents: number;
  featured: boolean;
  soldOut: boolean;
  heroImageUrl: string;
  detailImageUrl: string | null;
  details: ProductDetailsProps;
}

export interface ProductContent extends Omit<ProductContentInput, "details"> {
  details: ProductDetails;
}

export interface ProductState extends ProductContent {
  id: string;
  status: ProductStatus;
  variants: ProductVariant[];
  images: ProductImage[];
  rating: RatingSummary;
  firstPublishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function validContent(input: ProductContentInput): ProductContent {
  ensure(Array.isArray(input.materials), "VALIDATION_FAILED", "materials must be a list of material ids.");
  const materials = [...new Set(input.materials)];
  ensure(materials.length <= MAX_MATERIALS && materials.every((m) => typeof m === "string" && MATERIAL_ID.test(m)), "VALIDATION_FAILED", "materials must be material ids.");
  const price = Money.cents(input.priceCents);
  ensure(price.cents > 0 && price.cents <= MAX_PRICE_CENTS, "VALIDATION_FAILED", "priceCents must be a positive whole number of cents.");
  ensure(typeof input.featured === "boolean" && typeof input.soldOut === "boolean", "VALIDATION_FAILED", "featured and soldOut must be booleans.");
  ensure(typeof input.categoryId === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(input.categoryId), "VALIDATION_FAILED", "categoryId must be a category id.");
  return {
    slug: parseSlug(input.slug),
    name: requiredText(input.name, "name", 120),
    kind: requiredText(input.kind, "kind", 120),
    story: requiredText(input.story, "story", 2000),
    categoryId: input.categoryId,
    materials,
    priceCents: price.cents,
    featured: input.featured,
    soldOut: input.soldOut,
    heroImageUrl: assetUrl(input.heroImageUrl, "heroImageUrl"),
    detailImageUrl: input.detailImageUrl === null || input.detailImageUrl === undefined || input.detailImageUrl === "" ? null : assetUrl(input.detailImageUrl, "detailImageUrl"),
    details: ProductDetails.create(input.details),
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Product aggregate: the catalog's source of truth for what is sold and at what price.
 * Invariants: a valid slug/name/price; slugs never change once a product has been published (carts, orders, reviews
 * and wishlists refer to it); publishing needs at least one variant; variant ids and SKUs are unique within the product;
 * lifecycle draft → published ⇄ archived (draft → archived allowed). Changes to a published product raise ProductUpdated
 * listing the changed fields; the event payload snapshot is built from the state at commit time.
 */
export class Product extends AggregateRoot<ProductEvent> {
  private constructor(private state: ProductState) {
    super();
  }

  static createDraft(id: string, input: ProductContentInput, now: Date): Product {
    ensure(typeof id === "string" && id.length > 0 && id.length <= 64, "VALIDATION_FAILED", "Product id is required.");
    return new Product({
      ...validContent(input),
      id,
      status: "draft",
      variants: [],
      images: [],
      rating: RatingSummary.empty(),
      firstPublishedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Rehydrates a persisted product; no events are raised. */
  static restore(state: ProductState): Product {
    return new Product({ ...state, variants: [...state.variants], images: [...state.images], materials: [...state.materials] });
  }

  get id() {
    return this.state.id;
  }
  get slug() {
    return this.state.slug;
  }
  get status() {
    return this.state.status;
  }
  get categoryId() {
    return this.state.categoryId;
  }
  get variants(): readonly ProductVariant[] {
    return this.state.variants;
  }
  get images(): readonly ProductImage[] {
    return this.state.images;
  }
  get rating(): RatingSummary {
    return this.state.rating;
  }
  get isPublished(): boolean {
    return this.state.status === "published";
  }

  /** A read-only copy of the full state (for persistence and snapshots). */
  toState(): Readonly<ProductState> {
    return { ...this.state, variants: [...this.state.variants], images: [...this.state.images], materials: [...this.state.materials] };
  }

  /** Applies a partial content change. Returns the changed field names (empty when nothing changed). */
  revise(patch: Partial<ProductContentInput>, now: Date): ProductField[] {
    const current = this.state;
    const merged = validContent({
      slug: patch.slug ?? current.slug,
      name: patch.name ?? current.name,
      kind: patch.kind ?? current.kind,
      story: patch.story ?? current.story,
      categoryId: patch.categoryId ?? current.categoryId,
      materials: patch.materials ?? current.materials,
      priceCents: patch.priceCents ?? current.priceCents,
      featured: patch.featured ?? current.featured,
      soldOut: patch.soldOut ?? current.soldOut,
      heroImageUrl: patch.heroImageUrl ?? current.heroImageUrl,
      detailImageUrl: patch.detailImageUrl === undefined ? current.detailImageUrl : patch.detailImageUrl,
      details: patch.details === undefined ? current.details.toJSON() : patch.details,
    });
    const changed: ProductField[] = [];
    if (merged.slug !== current.slug) changed.push("slug");
    if (merged.name !== current.name) changed.push("name");
    if (merged.kind !== current.kind) changed.push("kind");
    if (merged.story !== current.story) changed.push("story");
    if (merged.categoryId !== current.categoryId) changed.push("categoryId");
    if (!sameList(merged.materials, current.materials)) changed.push("materials");
    if (merged.priceCents !== current.priceCents) changed.push("priceCents");
    if (merged.featured !== current.featured) changed.push("featured");
    if (merged.soldOut !== current.soldOut) changed.push("soldOut");
    if (merged.heroImageUrl !== current.heroImageUrl) changed.push("heroImageUrl");
    if (merged.detailImageUrl !== current.detailImageUrl) changed.push("detailImageUrl");
    if (!merged.details.equals(current.details)) changed.push("details");
    if (!changed.length) return changed;
    if (changed.includes("slug") && current.firstPublishedAt !== null) {
      throw new DomainError("CONFLICT", "The slug of a product that has been published cannot change.", { slug: current.slug });
    }
    this.state = { ...current, ...merged, updatedAt: now };
    this.changed(changed, now);
    return changed;
  }

  /** Replaces every variant. Returns whether anything changed. */
  replaceVariants(inputs: readonly VariantProps[], now: Date): boolean {
    const next = variantList(inputs);
    const current = this.state.variants;
    if (next.length === current.length && next.every((variant, i) => variant.equals(current[i]))) return false;
    this.state = { ...this.state, variants: next, updatedAt: now };
    this.changed(["variants"], now);
    return true;
  }

  publish(now: Date): boolean {
    if (this.state.status === "published") return false;
    ensure(this.state.variants.length > 0, "CONFLICT", "Add at least one variant before publishing.", { productId: this.state.id });
    this.state = { ...this.state, status: "published", firstPublishedAt: this.state.firstPublishedAt ?? now, updatedAt: now };
    this.raise({ name: "ProductPublished", aggregateType: "Product", aggregateId: this.state.id, payload: {}, occurredAt: now });
    return true;
  }

  archive(now: Date): boolean {
    if (this.state.status === "archived") return false;
    this.state = { ...this.state, status: "archived", updatedAt: now };
    this.raise({ name: "ProductArchived", aggregateType: "Product", aggregateId: this.state.id, payload: { slug: this.state.slug }, occurredAt: now });
    return true;
  }

  addImage(image: ProductImage, now: Date): ProductImage {
    ensure(this.state.images.length < MAX_IMAGES_PER_PRODUCT, "CONFLICT", `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`);
    ensure(!this.state.images.some((i) => i.objectKey === image.objectKey || i.id === image.id), "CONFLICT", "This image is already attached.");
    const positioned = image.withPosition(this.state.images.length);
    this.state = { ...this.state, images: [...this.state.images, positioned], updatedAt: now };
    this.changed(["images"], now);
    return positioned;
  }

  removeImage(imageId: string, now: Date): ProductImage {
    const image = this.state.images.find((i) => i.id === imageId);
    if (!image) throw new NotFoundError("Image not found.");
    const images = this.state.images.filter((i) => i.id !== imageId).map((i, position) => i.withPosition(position));
    this.state = { ...this.state, images, updatedAt: now };
    this.changed(["images"], now);
    return image;
  }

  /** Counts a verified review's star rating. Only published products can be reviewed. */
  recordRating(stars: number, now: Date): void {
    ensure(this.isPublished, "NOT_FOUND", "Product not found.");
    this.state = { ...this.state, rating: this.state.rating.add(stars), updatedAt: now };
    this.changed(["rating"], now);
  }

  /** The category this product belongs to was renamed; published snapshots carry the label, so tell consumers. */
  categoryRelabelled(now: Date): void {
    this.changed(["categoryLabel"], now);
  }

  private changed(fields: ProductField[], now: Date) {
    // Drafts and archived products are not visible downstream; publishing carries the full snapshot later.
    if (this.state.status !== "published") return;
    this.raise({ name: "ProductUpdated", aggregateType: "Product", aggregateId: this.state.id, payload: { changed: fields }, occurredAt: now });
  }
}
