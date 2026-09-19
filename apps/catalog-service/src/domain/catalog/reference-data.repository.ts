import type { Transaction } from "../shared/transaction";
import type { Category, Material } from "./category";

/** Categories and materials: the vocabulary products refer to. */
export abstract class ReferenceDataRepository {
  abstract categories(tx?: Transaction): Promise<Category[]>;
  abstract materials(tx?: Transaction): Promise<Material[]>;
  abstract saveCategory(category: Category, tx: Transaction): Promise<void>;
  abstract saveMaterial(material: Material, tx: Transaction): Promise<void>;
}
