"use client";

import type { AnalyticsOverviewDto } from "@meridian/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { money, shortDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ago, EmptyState, ErrorState, FilterSelect, PageHeader, Section, StateChip, useNow } from "./kit";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

const REASONS: Record<string, string> = {
  customer: "Cancelled by customer",
  admin: "Cancelled by admin",
  expired: "Payment window expired",
  "out-of-stock": "Out of stock",
  "payment-unavailable": "Payment unavailable",
};

function percent(rate: number) {
  return `${(rate * 100).toFixed(rate > 0 && rate < 0.1 ? 1 : 0)}%`;
}

function DailyChart({ daily }: { daily: AnalyticsOverviewDto["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.grossCents));
  const total = daily.reduce((n, d) => n + d.grossCents, 0);
  if (!total) return <EmptyState title="No paid orders in this period" body="Revenue appears here as orders are paid." />;
  return (
    <figure className="relative">
      <div className="flex h-48 items-end gap-[3px] rounded-[16px] border border-line px-3 pt-4 pb-3" aria-hidden="true">
        {daily.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${shortDate(d.day)}: ${money(d.grossCents)} from ${d.ordersPaid} paid`}>
            <div
              className="w-full rounded-t-[4px] bg-ink transition-colors group-hover:bg-stone"
              style={{ height: d.grossCents ? `${Math.max(2, (d.grossCents / max) * 100)}%` : "2px", opacity: d.grossCents ? 1 : 0.15 }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 text-[0.8125rem] text-stone">
        <span className="whitespace-nowrap tabular">{shortDate(daily[0].day)}</span>
        <span className="order-last w-full text-center sm:order-none sm:w-auto">Gross revenue per UTC day</span>
        <span className="whitespace-nowrap tabular">{shortDate(daily[daily.length - 1].day)}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Daily sales</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Orders paid</th>
            <th>Gross</th>
          </tr>
        </thead>
        <tbody>
          {daily
            .filter((d) => d.ordersPaid || d.ordersPlaced)
            .map((d) => (
              <tr key={d.day}>
                <td>{shortDate(d.day)}</td>
                <td>{d.ordersPaid}</td>
                <td>{money(d.grossCents)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Dashboard() {
  const utils = trpc.useUtils();
  const now = useNow(5000);
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [confirm, setConfirm] = useState(false);
  const overview = trpc.admin.analytics.overview.useQuery({ days: Number(days) }, { placeholderData: keepPreviousData, refetchInterval: 15_000 });
  const top = trpc.admin.analytics.topProducts.useQuery({ days: Number(days), limit: 5 }, { placeholderData: keepPreviousData });
  const rebuild = trpc.admin.analytics.rebuild.useMutation({
    onSuccess: () => {
      setConfirm(false);
      toast.success("Analytics rebuild started", { description: "The projection is replaying the order log from the beginning." });
      void utils.admin.analytics.invalidate();
    },
  });

  const data = overview.data;
  const t = data?.totals;
  const tiles = [
    { label: "Gross revenue", value: t ? money(t.grossCents) : null, note: t ? `${t.ordersPaid} paid orders` : null },
    { label: "Net revenue", value: t ? money(t.netCents) : null, note: t ? `${money(t.refundsCents)} refunded` : null },
    { label: "Average order", value: t ? money(t.averageOrderCents) : null, note: t ? `${t.ordersPlaced} orders placed` : null },
    { label: "Conversion", value: t ? percent(t.conversionRate) : null, note: t ? `${t.ordersCancelled} cancelled` : null },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Sales projected from the order event log by the analytics-projector consumer group (CQRS read model)."
        actions={
          <>
            <FilterSelect label="Period" value={days} onChange={(v) => setDays(v === "all" ? "30" : v)} options={RANGES} />
            <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
              Rebuild analytics
            </Button>
          </>
        }
      />

      <ErrorState className="mt-6" error={overview.error} what="Analytics is unavailable" />

      {data ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone" aria-label="Projection status">
          <StateChip tone={data.projectionLag === 0 ? "ok" : data.projectionLag < 0 ? "muted" : "warn"}>
            {data.projectionLag < 0 ? "Lag unknown" : data.projectionLag === 0 ? "Projection up to date" : `Projection lag ${data.projectionLag}`}
          </StateChip>
          <span>Last event {ago(data.lastEventAt, now)}</span>
        </p>
      ) : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[16px] border border-line p-5">
            <dt className="text-sm text-stone">{tile.label}</dt>
            <dd className="mt-2 text-3xl font-semibold tracking-[-0.03em] tabular">{tile.value ?? (overview.isPending ? <Skeleton className="h-9 w-28" /> : "—")}</dd>
            <dd className="mt-1 min-h-5 text-sm text-stone tabular">{tile.note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-10 xl:grid-cols-12">
        <Section title="Revenue by day" id="daily-title" className="min-w-0 xl:col-span-8">
          {data ? <DailyChart daily={data.daily} /> : overview.isPending ? <Skeleton className="h-52" /> : null}
        </Section>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10 xl:col-span-4">
          <Section title="Top products" id="top-title">
            <ErrorState error={top.error} />
            {top.isPending ? (
              <Skeleton className="h-40" />
            ) : top.data?.length ? (
              <ol className="divide-y divide-line border-y border-line">
                {top.data.map((p, i) => (
                  <li key={p.slug} className="flex items-baseline justify-between gap-4 py-3 text-[0.9375rem]">
                    <span className="min-w-0">
                      <span className="mr-2 text-stone tabular">{i + 1}</span>
                      <span className="font-medium">{p.productName}</span>
                      <span className="block truncate text-[0.8125rem] text-stone">{p.sku}</span>
                    </span>
                    <span className="shrink-0 text-right tabular">
                      {money(p.revenueCents)}
                      <span className="block text-[0.8125rem] text-stone">{p.units} {p.units === 1 ? "unit" : "units"}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : top.data ? (
              <p className="text-stone">No paid orders in this period.</p>
            ) : null}
          </Section>

          <Section title="Cancellations" id="cancel-title">
            {data ? (
              data.cancellations.length ? (
                <ul className="divide-y divide-line border-y border-line">
                  {data.cancellations.map((c) => (
                    <li key={c.reason} className="flex justify-between gap-4 py-3 text-[0.9375rem]">
                      <span>{REASONS[c.reason] ?? c.reason}</span>
                      <span className="tabular">{c.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone">No cancellations in this period.</p>
              )
            ) : overview.isPending ? (
              <Skeleton className="h-24" />
            ) : null}
          </Section>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={(open) => !rebuild.isPending && setConfirm(open)}>
        <DialogContent className="p-6">
          <DialogTitle>Rebuild analytics?</DialogTitle>
          <DialogDescription className="mt-2">
            The projector pauses, truncates its tables, resets its consumer group offsets to the earliest event and replays the whole order log. Figures read low until it catches up.
          </DialogDescription>
          <ErrorState className="mt-4" error={rebuild.error} what="Rebuild refused" />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={() => setConfirm(false)} disabled={rebuild.isPending}>
              Cancel
            </Button>
            <Button size="sm" pending={rebuild.isPending} onClick={() => rebuild.mutate()}>
              Rebuild now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
