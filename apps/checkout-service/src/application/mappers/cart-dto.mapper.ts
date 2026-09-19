import type { CartDto } from "@meridian/contracts";
import type { Cart } from "../../domain";

export function toCartDto(cart: Cart): CartDto {
  return {
    id: cart.id,
    userId: cart.userId,
    lines: cart.lines.map((line) => ({ sku: line.sku, variantId: line.variantId, qty: line.qty, slug: line.slug, unitPriceCents: line.unitPriceCents })),
    updatedAt: cart.updatedAt.toISOString(),
  };
}
