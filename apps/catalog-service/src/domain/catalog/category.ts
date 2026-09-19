import { ensure } from "@meridian/kernel";
import { assetUrl, requiredText } from "../shared/text";

export interface Category {
  id: string;
  label: string;
  blurb: string;
  coverImageUrl: string;
  position: number;
}

export interface Material {
  id: string;
  label: string;
  swatchUrl: string;
  position: number;
}

const REF_ID = /^[a-z][a-z0-9-]{0,39}$/;

export function category(input: Category): Category {
  ensure(REF_ID.test(input.id), "VALIDATION_FAILED", "Category ids are short lower-case identifiers.", { id: input.id });
  ensure(Number.isInteger(input.position) && input.position >= 0, "VALIDATION_FAILED", "Category position must be a whole number.");
  return {
    id: input.id,
    label: requiredText(input.label, "label", 60),
    blurb: requiredText(input.blurb, "blurb", 400),
    coverImageUrl: assetUrl(input.coverImageUrl, "coverImageUrl"),
    position: input.position,
  };
}

export function material(input: Material): Material {
  ensure(REF_ID.test(input.id), "VALIDATION_FAILED", "Material ids are short lower-case identifiers.", { id: input.id });
  ensure(Number.isInteger(input.position) && input.position >= 0, "VALIDATION_FAILED", "Material position must be a whole number.");
  return { id: input.id, label: requiredText(input.label, "label", 60), swatchUrl: assetUrl(input.swatchUrl, "swatchUrl"), position: input.position };
}

export function sameCategory(a: Category, b: Category): boolean {
  return a.id === b.id && a.label === b.label && a.blurb === b.blurb && a.coverImageUrl === b.coverImageUrl && a.position === b.position;
}

export function sameMaterial(a: Material, b: Material): boolean {
  return a.id === b.id && a.label === b.label && a.swatchUrl === b.swatchUrl && a.position === b.position;
}
