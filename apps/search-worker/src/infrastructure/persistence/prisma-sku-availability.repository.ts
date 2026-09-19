import { Injectable } from "@nestjs/common";
import { SkuAvailability, SkuAvailabilityRepository, type ChangeResult } from "../../domain";
import { PrismaService } from "../prisma.service";

@Injectable()
export class PrismaSkuAvailabilityRepository extends SkuAvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  change(sku: string, change: (current: SkuAvailability | null) => SkuAvailability | null): Promise<ChangeResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`sku-availability:${sku}`}))`;
        const row = await tx.skuAvailability.findUnique({ where: { sku } });
        const next = change(row ? SkuAvailability.restore(row) : null);
        if (!next) return "unchanged";
        const data = { available: next.available, lastEventId: next.lastEventId, lastEventAt: next.lastEventAt };
        await tx.skuAvailability.upsert({ where: { sku }, create: { sku, ...data }, update: data });
        return "written";
      },
      { maxWait: 5_000, timeout: 10_000 },
    );
  }
}
