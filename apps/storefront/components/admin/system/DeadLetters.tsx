"use client";

import type { DeadLetterDto } from "@meridian/contracts";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ago, CopyValue, dateTime, EmptyState, ErrorState, useNow } from "../kit";
import { logicalName, type DeadLetterSelection, type SystemOverview } from "./shared";

type Draft = { service?: string; source?: "rabbit" | "kafka"; queueOrTopic?: string };

function sourcesOf(overview: SystemOverview | undefined, service: string | undefined) {
  const m = overview?.services.find((s) => s.service === service)?.messaging;
  return {
    rabbit: (m?.queues ?? []).map((q) => ({ value: q.dlq.queue, depth: q.dlq.messages })),
    kafka: (m?.consumerGroups ?? []).map((g) => ({ value: g.dlt.topic, depth: g.dlt.messages })),
  };
}

function Letter({ letter, onReplay, replaying, now }: { letter: DeadLetterDto; onReplay: () => void; replaying: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(letter.payload);
  const payloadId = `payload-${letter.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <li className="grid gap-3 rounded-[16px] border border-line p-4" aria-label={`Dead letter ${letter.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{letter.name}</p>
          <p className="text-[0.8125rem] text-stone">
            {letter.firstFailedAt ? `First failed ${ago(letter.firstFailedAt, now)} (${dateTime(letter.firstFailedAt)})` : "Failure time unknown"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="status status-warn tabular">{letter.attempts} attempts</span>
          <Button size="sm" className="!min-h-9" pending={replaying} onClick={onReplay} aria-label={`Replay ${letter.name} ${letter.messageId}`}>
            Replay
          </Button>
        </div>
      </div>
      <p className="rounded-[12px] bg-brick-wash px-3 py-2 text-sm break-words text-brick">
        <span className="font-medium">Last error: </span>
        {letter.lastError || "not recorded"}
      </p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-stone">Correlation id</dt>
        <dd className="min-w-0">{letter.correlationId ? <CopyValue value={letter.correlationId} label="correlation id" /> : "—"}</dd>
        <dt className="text-stone">Message id</dt>
        <dd className="min-w-0 truncate tabular" title={letter.messageId}>
          {letter.messageId || "—"}
        </dd>
      </dl>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Payload (secrets and one-time links redacted)</p>
          <button type="button" className="link text-sm" aria-expanded={open} aria-controls={payloadId} onClick={() => setOpen((v) => !v)}>
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
        {open ? (
          <pre id={payloadId} className="mt-2 max-h-80 overflow-auto rounded-[12px] bg-plaster p-3 font-sans text-[0.8125rem] leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(letter.payload, null, 2)}
          </pre>
        ) : (
          <p id={payloadId} className="mt-1 truncate rounded-[12px] bg-plaster px-3 py-2 text-[0.8125rem]" title={json}>
            {json}
          </p>
        )}
      </div>
    </li>
  );
}

/** Pick a service, a source (Rabbit DLQ or Kafka DLT) and a queue or topic, then inspect and replay what's parked there. */
export function DeadLetterBrowser({
  overview,
  selection,
  onSelect,
  autoRefresh,
}: {
  overview: SystemOverview | undefined;
  selection: Draft;
  onSelect: (draft: Draft) => void;
  autoRefresh: boolean;
}) {
  const utils = trpc.useUtils();
  const now = useNow(5000);
  const [confirmAll, setConfirmAll] = useState(false);
  const complete: DeadLetterSelection | null = selection.service && selection.source && selection.queueOrTopic ? (selection as DeadLetterSelection) : null;
  const letters = trpc.admin.system.deadLetters.useQuery(complete ? { ...complete, limit: 50 } : { service: "identity-service", source: "rabbit", queueOrTopic: "-", limit: 1 }, {
    enabled: Boolean(complete),
    refetchInterval: autoRefresh ? 5000 : false,
  });
  const replay = trpc.admin.system.replay.useMutation({
    onSuccess: (result) => {
      toast.success(`Replayed ${result.replayed} ${result.replayed === 1 ? "message" : "messages"}`, { description: `${result.remaining} remaining in ${complete ? logicalName(complete.queueOrTopic) : "the queue"}` });
      setConfirmAll(false);
      void utils.admin.system.deadLetters.invalidate();
      void utils.admin.system.overview.invalidate();
    },
  });

  const services = overview?.services.filter((s) => s.messaging && (s.messaging.queues.length || s.messaging.consumerGroups.length)) ?? [];
  const sources = sourcesOf(overview, selection.service);
  const options = selection.source ? sources[selection.source] : [];
  const items = complete ? (letters.data ?? []) : [];
  const depth = options.find((o) => o.value === selection.queueOrTopic)?.depth;

  return (
    <div className="grid gap-5">
      <div className="grid items-end gap-3 md:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]" role="group" aria-label="Dead-letter source">
        <div className="grid min-w-0 gap-1.5">
          <span className="label" id="dl-service-label">
            Service
          </span>
          <Select value={selection.service ?? ""} onValueChange={(service) => onSelect({ service })}>
            <SelectTrigger aria-labelledby="dl-service-label" className="w-full">
              <SelectValue placeholder="Choose a service" />
            </SelectTrigger>
            <SelectContent align="start">
              {services.map((s) => (
                <SelectItem key={s.service} value={s.service}>
                  {s.service}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="label" id="dl-source-label">
            Source
          </span>
          <Select value={selection.source ?? ""} onValueChange={(source) => onSelect({ service: selection.service, source: source as "rabbit" | "kafka" })} disabled={!selection.service}>
            <SelectTrigger aria-labelledby="dl-source-label" className="w-full">
              <SelectValue placeholder="Choose a source" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="rabbit" disabled={!sources.rabbit.length}>
                RabbitMQ dead-letter queue
              </SelectItem>
              <SelectItem value="kafka" disabled={!sources.kafka.length}>
                Kafka dead-letter topic
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="label" id="dl-queue-label">
            {selection.source === "kafka" ? "Topic" : "Queue"}
          </span>
          <Select value={selection.queueOrTopic ?? ""} onValueChange={(queueOrTopic) => onSelect({ ...selection, queueOrTopic })} disabled={!selection.source}>
            <SelectTrigger aria-labelledby="dl-queue-label" className="w-full">
              <SelectValue placeholder={selection.source === "kafka" ? "Choose a topic" : "Choose a queue"} />
            </SelectTrigger>
            <SelectContent align="start">
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {logicalName(o.value)} ({o.depth})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {complete ? (
          <div className="flex flex-wrap gap-2 md:col-span-3 xl:col-span-1">
            <Button variant="secondary" size="sm" pending={letters.isFetching} onClick={() => void letters.refetch()}>
              Reload
            </Button>
            <Button size="sm" disabled={!items.length || replay.isPending} onClick={() => setConfirmAll(true)}>
              Replay all
            </Button>
          </div>
        ) : null}
      </div>

      {!complete ? (
        <EmptyState title="Choose where to look" body="Pick a service, then its RabbitMQ dead-letter queue or Kafka dead-letter topic. Counts come from the overview above." />
      ) : letters.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <>
          <ErrorState error={letters.error} what="Dead letters could not be read" />
          <ErrorState error={replay.error} what="Replay failed" />
          {letters.data && !items.length ? (
            <EmptyState title="No dead letters here" body={`${logicalName(complete.queueOrTopic)} is empty. Messages land here after exhausting their retries.`} />
          ) : items.length ? (
            <>
              <p className="text-sm text-stone" role="status">
                Showing {items.length} {items.length === 1 ? "message" : "messages"}, newest first{depth !== undefined && depth > items.length ? ` (${depth} parked)` : ""}.
              </p>
              <ul className="grid gap-3" aria-label="Dead letters">
                {items.map((letter) => (
                  <Letter
                    key={letter.id}
                    letter={letter}
                    now={now}
                    replaying={replay.isPending && replay.variables?.ids?.[0] === letter.id}
                    onReplay={() => replay.mutate({ ...complete, ids: [letter.id] })}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      <Dialog open={confirmAll} onOpenChange={(open) => !replay.isPending && setConfirmAll(open)}>
        <DialogContent className="p-6">
          <DialogTitle>Replay every dead letter?</DialogTitle>
          <DialogDescription className="mt-2">
            {complete?.source === "kafka"
              ? "Each record is produced to the group’s replay topic, which only that consumer group reads. Fix the cause first or they will fail again."
              : "Each message is republished to its command queue with the attempt counter reset. Fix the cause first or they will dead-letter again."}
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={() => setConfirmAll(false)} disabled={replay.isPending}>
              Cancel
            </Button>
            <Button size="sm" pending={replay.isPending} onClick={() => complete && replay.mutate({ ...complete, limit: Math.min(1000, Math.max(items.length, depth ?? 0)) })}>
              Replay {Math.max(items.length, depth ?? 0)} messages
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
