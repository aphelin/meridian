import { ensure } from "@meridian/kernel";
import { requiredText } from "../shared/text";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 20;
export const UPLOAD_URL_TTL_SECONDS = 300;

/** Upload content types accepted for product images and the object key extension each one gets. */
export const IMAGE_CONTENT_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type ImageContentType = keyof typeof IMAGE_CONTENT_TYPES;

export function isImageContentType(value: unknown): value is ImageContentType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IMAGE_CONTENT_TYPES, value.toLowerCase().split(";")[0].trim());
}

export function imageKeyPrefix(productId: string): string {
  return `products/${productId}/`;
}

/** Object key for a new upload; the random part makes keys unguessable and never reused. */
export function imageObjectKey(productId: string, uniqueId: string, contentType: string): string {
  ensure(isImageContentType(contentType), "VALIDATION_FAILED", "Images must be JPEG, PNG or WebP.", { contentType });
  const normalized = contentType.toLowerCase().split(";")[0].trim() as ImageContentType;
  ensure(/^[A-Za-z0-9-]{8,64}$/.test(uniqueId), "VALIDATION_FAILED", "Invalid upload id.");
  return `${imageKeyPrefix(productId)}${uniqueId}.${IMAGE_CONTENT_TYPES[normalized]}`;
}

/** An uploaded object may only be attached to the product its upload ticket was issued for. */
export function assertImageKeyFor(productId: string, objectKey: string): void {
  const prefix = imageKeyPrefix(productId);
  const rest = objectKey.startsWith(prefix) ? objectKey.slice(prefix.length) : "";
  ensure(/^[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$/.test(rest), "VALIDATION_FAILED", "This image was not uploaded for this product.", { objectKey });
}

/** Checks the stored object's metadata (from the storage HEAD) against the upload rules. */
export function assertUploadedImage(object: { contentType: string | null; sizeBytes: number }): void {
  ensure(object.contentType !== null && isImageContentType(object.contentType), "VALIDATION_FAILED", "Images must be JPEG, PNG or WebP.", { contentType: object.contentType });
  ensure(object.sizeBytes > 0 && object.sizeBytes <= MAX_IMAGE_BYTES, "VALIDATION_FAILED", "Images must be at most 8 MB.", { sizeBytes: object.sizeBytes });
}

export interface ProductImageProps {
  id: string;
  objectKey: string;
  url: string;
  alt: string;
  position: number;
  createdAt: Date;
}

/** A gallery image stored in object storage. Entity inside the Product aggregate. */
export class ProductImage implements ProductImageProps {
  private constructor(
    readonly id: string,
    readonly objectKey: string,
    readonly url: string,
    readonly alt: string,
    readonly position: number,
    readonly createdAt: Date,
  ) {}

  static create(props: ProductImageProps): ProductImage {
    ensure(typeof props.id === "string" && props.id.length > 0, "VALIDATION_FAILED", "Image id is required.");
    ensure(Number.isInteger(props.position) && props.position >= 0, "VALIDATION_FAILED", "Image position must be a whole number.");
    return new ProductImage(props.id, requiredText(props.objectKey, "objectKey", 300), requiredText(props.url, "url", 800), requiredText(props.alt, "alt", 200), props.position, props.createdAt);
  }

  withPosition(position: number): ProductImage {
    return new ProductImage(this.id, this.objectKey, this.url, this.alt, position, this.createdAt);
  }
}
