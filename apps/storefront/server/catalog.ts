import type { CatalogSnapshotDto, ProductDto } from "@meridian/contracts";
import { ServiceError } from "./errors";
import { services } from "./services";

export const CATALOG_TTL_MS = 60_000;

export interface CatalogProviderOptions {
  load: () => Promise<CatalogSnapshotDto>;
  ttlMs?: number;
  now?: () => number;
}

export interface CatalogProvider {
  /** The published catalog: cached for the TTL, the last good snapshot while catalog-service is unavailable. */
  get(): Promise<CatalogSnapshotDto>;
  /** Drops the cached snapshot (e.g. after an admin write through this BFF). */
  invalidate(): void;
}

/**
 * Catalog provider (C38): catalog-service `/catalog/snapshot` with an in-memory cache. Concurrent callers share one
 * load. When a refresh fails the previous snapshot keeps being served (stale), and only a process that never loaded a
 * snapshot fails, with 503 UPSTREAM_UNAVAILABLE.
 */
export function createCatalogProvider({ load, ttlMs = CATALOG_TTL_MS, now = Date.now }: CatalogProviderOptions): CatalogProvider {
  let cached: { snapshot: CatalogSnapshotDto; fetchedAt: number } | null = null;
  let inflight: Promise<CatalogSnapshotDto> | null = null;
  let generation = 0;

  const refresh = () => {
    if (!inflight) {
      const started = generation;
      inflight = load()
        .then((snapshot) => {
          if (started === generation) cached = { snapshot, fetchedAt: now() };
          return snapshot;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  return {
    async get() {
      if (cached && now() - cached.fetchedAt < ttlMs) return cached.snapshot;
      try {
        return await refresh();
      } catch (error) {
        if (cached) {
          console.warn(JSON.stringify({ level: "warn", msg: "serving stale catalog snapshot", ageMs: now() - cached.fetchedAt, error: error instanceof Error ? error.message : String(error) }));
          return cached.snapshot;
        }
        if (error instanceof ServiceError && error.status >= 500) throw error;
        throw ServiceError.unavailable("catalog", "network", error instanceof ServiceError ? error.correlationId : undefined, error);
      }
    },
    invalidate() {
      generation += 1;
      if (cached) cached = { ...cached, fetchedAt: Number.NEGATIVE_INFINITY };
    },
  };
}

const KEY = Symbol.for("meridian.bff.catalog");
type Holder = { provider: CatalogProvider };
const holder: Holder = ((globalThis as Record<symbol, unknown>)[KEY] as Holder | undefined) ?? {
  provider: createCatalogProvider({ load: () => services.catalog.get<CatalogSnapshotDto>("/catalog/snapshot") }),
};
(globalThis as Record<symbol, unknown>)[KEY] = holder;

export function getCatalog(): Promise<CatalogSnapshotDto> {
  return holder.provider.get();
}

export function invalidateCatalog(): void {
  holder.provider.invalidate();
}

/** Published product by slug from the snapshot. */
export async function findProduct(slug: string): Promise<ProductDto | undefined> {
  return (await getCatalog()).products.find((p) => p.slug === slug);
}
