import { Injectable } from "@nestjs/common";
import type { Category, Material } from "../../domain/catalog/category";
import { ReferenceDataRepository } from "../../domain/catalog/reference-data.repository";
import type { Transaction } from "../../domain/shared/transaction";
import { db } from "./prisma-transaction-runner";
import { PrismaService } from "./prisma.service";

@Injectable()
export class ReferenceDataPrismaRepository extends ReferenceDataRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  categories(tx?: Transaction): Promise<Category[]> {
    return db(this.prisma, tx).category.findMany({ orderBy: { position: "asc" }, select: { id: true, label: true, blurb: true, coverImageUrl: true, position: true } });
  }

  materials(tx?: Transaction): Promise<Material[]> {
    return db(this.prisma, tx).material.findMany({ orderBy: { position: "asc" } });
  }

  async saveCategory(category: Category, tx: Transaction): Promise<void> {
    const { id, ...fields } = category;
    await db(this.prisma, tx).category.upsert({ where: { id }, create: category, update: fields });
  }

  async saveMaterial(material: Material, tx: Transaction): Promise<void> {
    const { id, ...fields } = material;
    await db(this.prisma, tx).material.upsert({ where: { id }, create: material, update: fields });
  }
}
