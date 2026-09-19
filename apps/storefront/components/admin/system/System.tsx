"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { ago, duration, ErrorState, PageHeader, Section, useNow } from "../kit";
import { ChaosControls } from "./Chaos";
import { DeadLetterBrowser } from "./DeadLetters";
import { BreakerTable, ServiceCard } from "./ServiceCard";
import { healthTone, type DeadLetterSelection, type SystemOverview } from "./shared";

const REFRESH_MS = 5000;
const SERVICE_NAMES = ["identity-service", "catalog-service", "inventory-service", "checkout-service", "payment-service", "notification-service", "search-worker", "analytics-service"];

/** Five tiles fill every row: 2 + 2 + 1 wide on phones, 3 + 2 on tablets and narrow laptops, one row of five from xl. */
const TILE_SPAN = ["sm:col-span-2", "sm:col-span-2", "sm:col-span-2", "sm:col-span-3", "col-span-2 sm:col-span-3"].map((span) => `${span} xl:col-span-1`);

function Summary({ data }: { data: SystemOverview }) {
  const healthy = data.services.filter((s) => healthTone(s.health).tone === "ok").length;
  const breakers = [...data.bff.breakers, ...data.services.flatMap((s) => s.breakers)];
  const open = breakers.filter((b) => b.state === "open").length;
  const halfOpen = breakers.filter((b) => b.state === "half-open").length;
  const messaging = data.services.flatMap((s) => (s.messaging ? [s.messaging] : []));
  const dlq = messaging.reduce((n, m) => n + m.queues.reduce((k, q) => k + q.dlq.messages, 0), 0);
  const dlt = messaging.reduce((n, m) => n + m.consumerGroups.reduce((k, g) => k + g.dlt.messages, 0), 0);
  const pending = messaging.reduce((n, m) => n + m.outbox.pending, 0);
  const oldest = Math.max(-1, ...messaging.map((m) => m.outbox.oldestPendingAgeSec ?? -1));
  const lag = messaging.reduce((n, m) => n + m.consumerGroups.reduce((k, g) => k + Math.max(0, g.lag), 0), 0);

  const tiles = [
    { label: "Services healthy", value: `${healthy} / ${data.services.length}`, alert: healthy < data.services.length },
    { label: "Open breakers", value: String(open), note: halfOpen ? `${halfOpen} half-open` : `${breakers.length} tracked`, alert: open > 0 },
    { label: "Dead letters", value: String(dlq + dlt), note: `${dlq} in DLQs · ${dlt} in DLTs`, alert: dlq + dlt > 0 },
    { label: "Outbox backlog", value: String(pending), note: oldest >= 0 ? `oldest ${duration(oldest)}` : "all published", alert: oldest > 30 },
    { label: "Consumer lag", value: String(lag), note: "summed over groups", alert: false },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-6 xl:grid-cols-5" aria-label="System summary">
      {tiles.map((t, i) => (
        <div key={t.label} className={`rounded-[16px] p-4 ${TILE_SPAN[i]} ${t.alert ? "bg-brick-wash text-brick" : "border border-line"}`}>
          <dt className={`text-sm ${t.alert ? "" : "text-stone"}`}>{t.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tracking-[-0.02em] tabular">{t.value}</dd>
          {t.note ? <dd className={`text-[0.8125rem] ${t.alert ? "" : "text-stone"}`}>{t.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function RebuildButton({ kind }: { kind: "search" | "analytics" }) {
  const [open, setOpen] = useState(false);
  const onSuccess = () => {
    setOpen(false);
    toast.success(kind === "search" ? "Search rebuild started" : "Analytics rebuild started", { description: "The read model is replaying its Kafka topics from the earliest offset." });
  };
  const search = trpc.admin.search.rebuild.useMutation({ onSuccess });
  const analytics = trpc.admin.analytics.rebuild.useMutation({ onSuccess });
  const m = kind === "search" ? search : analytics;
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {kind === "search" ? "Rebuild search index" : "Rebuild analytics"}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !m.isPending && setOpen(next)}>
        <DialogContent className="p-6">
          <DialogTitle>{kind === "search" ? "Rebuild the search index?" : "Rebuild analytics?"}</DialogTitle>
          <DialogDescription className="mt-2">
            {kind === "search"
              ? "search-worker truncates its product documents and replays the catalog and inventory topics (group search-indexer). Search results may be incomplete for a few seconds."
              : "analytics-service pauses its projector, truncates its tables and replays the order log (group analytics-projector). Figures read low until it catches up."}
          </DialogDescription>
          <ErrorState className="mt-4" error={m.error} what="Rebuild refused" />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={m.isPending}>
              Cancel
            </Button>
            <Button size="sm" pending={m.isPending} onClick={() => m.mutate()}>
              Rebuild now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SystemPage() {
  const utils = trpc.useUtils();
  const [auto, setAuto] = useState(true);
  const [selection, setSelection] = useState<Partial<DeadLetterSelection>>({});
  const overview = trpc.admin.system.overview.useQuery(undefined, { refetchInterval: auto ? REFRESH_MS : false, refetchIntervalInBackground: false, staleTime: 0 });
  // Ticks every second so "updated Xs ago" stays honest between refreshes.
  const now = useNow(1000);
  const data = overview.data;

  const browse = (next: DeadLetterSelection) => {
    setSelection(next);
    requestAnimationFrame(() => document.getElementById("dead-letters")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div>
      <PageHeader
        title="System"
        description="Live health of the eight services and the BFF: dependency checks, circuit breakers, RabbitMQ queues, Kafka consumer groups, outboxes and dead letters."
        actions={
          <>
            <RebuildButton kind="search" />
            <RebuildButton kind="analytics" />
          </>
        }
      />

      <div className="sticky top-16 z-10 -mx-2 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] bg-paper/90 px-2 py-2 backdrop-blur sm:rounded-full lg:top-[72px]">
        <p className="text-sm text-stone tabular" role="status" aria-live="off" data-testid="system-updated">
          {overview.dataUpdatedAt ? `Updated ${ago(overview.dataUpdatedAt, Math.max(now, overview.dataUpdatedAt))}` : "Loading…"}
          {overview.isFetching ? " · refreshing" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Switch id="auto-refresh" checked={auto} onCheckedChange={setAuto} />
          <Label htmlFor="auto-refresh" className="mb-0 cursor-pointer font-normal">
            Auto-refresh every 5 s
          </Label>
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="!min-h-9"
          onClick={() => {
            void overview.refetch();
            void utils.admin.system.chaos.list.invalidate();
            void utils.admin.system.deadLetters.invalidate();
          }}
        >
          Refresh now
        </Button>
      </div>

      <ErrorState className="mt-4" error={overview.error} what={data ? "Refresh failed, showing the last good report" : "The system overview could not be loaded"} />

      <div className="mt-5">
        {data ? (
          <Summary data={data} />
        ) : overview.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 xl:grid-cols-5" aria-busy="true">
            {TILE_SPAN.map((span, i) => (
              <Skeleton key={i} className={`h-24 ${span}`} />
            ))}
          </div>
        ) : null}
      </div>

      <Section title="Services" id="services-title" className="mt-10">
        {data ? (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {data.services.map((s) => (
              <ServiceCard key={s.service} s={s} now={now} onBrowse={browse} />
            ))}
          </div>
        ) : overview.isPending ? (
          <div className="grid gap-4 xl:grid-cols-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Storefront BFF breakers" id="bff-title" className="mt-10">
        <p className="-mt-2 mb-3 text-sm text-stone">One breaker per upstream service in this Next.js process. Upstream 4xx answers never count as failures.</p>
        <div className="rounded-[18px] border border-line p-5">{data ? <BreakerTable breakers={data.bff.breakers} now={now} caption="Storefront BFF circuit breakers" /> : <Skeleton className="h-24" />}</div>
      </Section>

      <section id="dead-letters" aria-labelledby="dead-letters-title" className="mt-12 scroll-mt-32">
        <h2 id="dead-letters-title" className="heading">
          Dead-letter browser
        </h2>
        <p className="mt-1 mb-4 text-sm text-stone">Messages that exhausted their retries. Payload values under token, secret, password and URL keys are redacted by the BFF.</p>
        <DeadLetterBrowser overview={data} selection={selection} onSelect={setSelection} autoRefresh={auto} />
      </section>

      <section aria-labelledby="chaos-title" className="mt-12">
        <h2 id="chaos-title" className="heading">
          Chaos controls
        </h2>
        <p className="mt-1 mb-4 text-sm text-stone">Inject failures, delays or timeouts at a named point to watch retries, breakers and dead-lettering happen. Rules expire on their own.</p>
        <ChaosControls overview={data} services={data?.services.map((s) => s.service) ?? SERVICE_NAMES} autoRefresh={auto} />
      </section>
    </div>
  );
}

