import { DomainError } from "@meridian/kernel";

/** A SKU identifies stock and order lines platform-wide, so it can belong to one product only. */
export function assertSkusAvailable(productId: string, skus: readonly string[], owners: ReadonlyMap<string, string>): void {
  const taken = skus.filter((sku) => {
    const owner = owners.get(sku);
    return owner !== undefined && owner !== productId;
  });
  if (taken.length) throw new DomainError("CONFLICT", `SKU ${taken.join(", ")} is already used by another product.`, { skus: taken });
}
