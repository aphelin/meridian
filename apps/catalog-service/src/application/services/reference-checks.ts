import { ValidationError } from "@meridian/kernel";
import type { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import type { Tx } from "../ports/transaction";

/** Products may only refer to categories and materials the catalog knows. */
export async function assertKnownReferences(
  referenceData: ReferenceDataRepository,
  tx: Tx,
  refs: { categoryId?: string; materials?: readonly string[]; variantMaterials?: readonly string[] },
): Promise<void> {
  if (refs.categoryId !== undefined) {
    const categories = await referenceData.categories(tx);
    if (!categories.some((c) => c.id === refs.categoryId)) throw new ValidationError(`Unknown category "${refs.categoryId}".`, { categoryId: refs.categoryId });
  }
  const wanted = [...(refs.materials ?? []), ...(refs.variantMaterials ?? [])];
  if (wanted.length) {
    const known = new Set((await referenceData.materials(tx)).map((m) => m.id));
    const unknown = [...new Set(wanted.filter((m) => !known.has(m)))];
    if (unknown.length) throw new ValidationError(`Unknown material ${unknown.join(", ")}.`, { materials: unknown });
  }
}
