"use client";

import type { CatalogSnapshotDto } from "@meridian/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CatalogProvider } from "@/lib/catalog-context";
import type { PlateMap } from "@/lib/plates";
import { replaceSaved, subscribeCart } from "@/lib/stores";
import { bindSyncClient, reconcileCart, scheduleCartPush } from "@/lib/sync";
import { transformer } from "@/lib/transformer";
import { trpc } from "@/lib/trpc";
import { PlateProvider } from "../ui/PlateProvider";
import { TooltipProvider } from "../ui/tooltip";

/** Keeps the device cart and the server cart in sync, and adopts the account wishlist for signed-in visitors. */
function SessionSync() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const resolved = !me.isPending;
  const initialUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    bindSyncClient(utils.client);
    return () => bindSyncClient(null);
  }, [utils.client]);

  useEffect(() => {
    if (!resolved) return;
    void reconcileCart();
    return subscribeCart(() => scheduleCartPush());
  }, [resolved, me.data?.id]);

  useEffect(() => {
    if (!resolved || initialUser.current !== undefined) return;
    initialUser.current = me.data?.id ?? null;
    // Signed in when the app loads: the account wishlist is the source of truth. (Sign-in merges run in the account flow.)
    if (me.data) {
      utils.client.wishlist.get
        .query()
        .then((w) => replaceSaved(w.slugs))
        .catch(() => undefined);
    }
  }, [resolved, me.data, utils.client]);

  return null;
}

export function Providers({ plates, catalog, children }: { plates: PlateMap; catalog: CatalogSnapshotDto | null; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            // Client errors (sign in required, not found, validation) will not change on retry.
            retry: (count, error) => {
              const status = (error as { data?: { status?: number } } | null)?.data?.status ?? 500;
              return status >= 500 && count < 1;
            },
          },
        },
      }),
  );
  const [client] = useState(() => trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer, maxURLLength: 2000 })] }));

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <CatalogProvider initial={catalog}>
          <PlateProvider plates={plates}>
            <TooltipProvider>
              <SessionSync />
              {children}
            </TooltipProvider>
          </PlateProvider>
        </CatalogProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
