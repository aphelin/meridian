import type { CatalogSnapshotDto } from "@meridian/contracts";
import { describe, expect, it, vi } from "vitest";
import { createCatalogProvider } from "@/server/catalog";
import { ServiceError } from "@/server/errors";

const snapshot = (n: number): CatalogSnapshotDto => ({ categories: [], materials: [], products: Array.from({ length: n }, () => ({}) as CatalogSnapshotDto["products"][number]) });

describe("catalog provider", () => {
  it("caches the catalog-service snapshot for the TTL", async () => {
    let now = 0;
    const load = vi.fn(async () => snapshot(load.mock.calls.length));
    const provider = createCatalogProvider({ load, ttlMs: 60_000, now: () => now });
    expect((await provider.get()).products).toHaveLength(1);
    now = 59_999;
    expect((await provider.get()).products).toHaveLength(1);
    now = 60_000;
    expect((await provider.get()).products).toHaveLength(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one snapshot load between concurrent callers", async () => {
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return snapshot(3);
    });
    const provider = createCatalogProvider({ load });
    await Promise.all([provider.get(), provider.get(), provider.get()]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves the last good snapshot (stale) while catalog-service is unavailable", async () => {
    let now = 0;
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw ServiceError.unavailable("catalog", "timeout");
      return snapshot(23);
    });
    const provider = createCatalogProvider({ load, ttlMs: 1000, now: () => now });
    await provider.get();
    fail = true;
    now = 5000;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await provider.get()).products).toHaveLength(23);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("throws 503 UPSTREAM_UNAVAILABLE only when no snapshot was ever loaded", async () => {
    const provider = createCatalogProvider({ load: async () => Promise.reject(new TypeError("fetch failed")) });
    await expect(provider.get()).rejects.toMatchObject({ status: 503, code: "UPSTREAM_UNAVAILABLE" });
  });

  it("reloads after invalidation", async () => {
    const load = vi.fn(async () => snapshot(load.mock.calls.length));
    const provider = createCatalogProvider({ load, now: () => 0 });
    await provider.get();
    provider.invalidate();
    expect((await provider.get()).products).toHaveLength(2);
  });
});
