import { describe, expect, it } from "vitest";
import { InMemoryReadModel, InMemoryUnitOfWork } from "../../test-support/in-memory";
import { GetPublicStockHandler, ListPublicStockHandler, ListStockMovementsHandler } from "./stock.handlers";
import { GetPublicStockQuery, ListStockMovementsQuery } from "./stock.queries";

describe("stock queries", () => {
  it("public stock exposes only sku and available", async () => {
    const uow = new InMemoryUnitOfWork();
    uow.seed("P1", 5, 2);
    const reads = new InMemoryReadModel(uow);
    expect(await new ListPublicStockHandler(reads).execute()).toEqual([{ sku: "P1", available: 3 }]);
    expect(await new GetPublicStockHandler(reads).execute(new GetPublicStockQuery("P1"))).toEqual({ sku: "P1", available: 3 });
    await expect(new GetPublicStockHandler(reads).execute(new GetPublicStockQuery("NOPE"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("movements for an unknown SKU are 404", async () => {
    const reads = new InMemoryReadModel(new InMemoryUnitOfWork());
    await expect(new ListStockMovementsHandler(reads).execute(new ListStockMovementsQuery("NOPE"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
