"use client";

import type { CatalogSnapshotDto } from "@meridian/contracts";
import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_CATALOG } from "./product";
import { trpc } from "./trpc";

const InitialCatalog = createContext<CatalogSnapshotDto | null>(null);

/** Seeds client components with the snapshot the root layout loaded on the server. */
export function CatalogProvider({ initial, children }: { initial: CatalogSnapshotDto | null; children: ReactNode }) {
  return <InitialCatalog.Provider value={initial}>{children}</InitialCatalog.Provider>;
}

/**
 * The published catalog for client components: the server-rendered snapshot first, then `catalog.snapshot` from the
 * BFF (which caches catalog-service for 60 s).
 */
export function useCatalog(): CatalogSnapshotDto {
  const initial = useContext(InitialCatalog);
  const query = trpc.catalog.snapshot.useQuery(undefined, {
    initialData: initial ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return query.data ?? initial ?? EMPTY_CATALOG;
}
