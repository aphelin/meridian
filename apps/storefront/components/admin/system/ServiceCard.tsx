"use client";

import type { BreakerStatusDto } from "@meridian/contracts";
import type { ReactNode } from "react";
import { ago, duration, StateChip } from "../kit";
import { BreakerChip, healthTone, logicalName, type DeadLetterSelection, type ServiceOverview } from "./shared";

/** Inline "label value" pairs for the stacked (narrow card) form of the service tables. */
function Stats({ items }: { items: { label: string; value: ReactNode; className?: string }[] }) {
  return (
    <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] text-stone">
      {items.map((item) => (
        <div key={item.label} className="flex gap-1">
          <dt>{item.label}</dt>
          <dd className={`tabular text-ink ${item.className ?? ""}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Service tables switch on their own width, not the viewport: two-up cards on a laptop are as narrow as a tablet.
 * Below 24rem they stack; the inactive form is display:none, so each row and button exists once for assistive tech.
 */
const STACKED = "divide-y divide-line @sm:hidden";
const TABULAR = "hidden overflow-x-auto @sm:block";

export function BreakerTable({ breakers, now, caption }: { breakers: BreakerStatusDto[]; now: number; caption: string }) {
  if (!breakers.length) return <p className="text-sm text-stone">No circuit breakers registered yet.</p>;
  const changed = (b: BreakerStatusDto) => (b.lastStateChangeAt ? ago(b.lastStateChangeAt, now) : "—");
  return (
    <div className="@container">
      <ul className={STACKED} aria-label={caption}>
        {breakers.map((b) => (
          <li key={`${b.name}-${b.target}`} className="py-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{b.name}</p>
                <p className="truncate text-[0.8125rem] text-stone">{b.target}</p>
              </div>
              <BreakerChip state={b.state} />
            </div>
            <Stats
              items={[
                { label: "Fail", value: b.failures, className: b.failures ? "text-brick" : "" },
                { label: "OK", value: b.successes },
                { label: "Rejected", value: b.rejects },
                { label: "Timeouts", value: b.timeouts },
                { label: "Changed", value: changed(b) },
              ]}
            />
          </li>
        ))}
      </ul>
      <div className={TABULAR}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-stone">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Breaker</th>
              <th className="py-1.5 pr-3 font-medium">State</th>
              <th className="w-14 py-1.5 pr-3 text-right font-medium" title="Failures in the rolling window">
                Fail
              </th>
              <th className="w-14 py-1.5 pr-3 text-right font-medium" title="Successes in the rolling window">
                OK
              </th>
              <th className="w-14 py-1.5 pr-3 text-right font-medium" title="Calls rejected while open">
                Rejected
              </th>
              <th className="w-14 py-1.5 text-right font-medium">Timeouts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {breakers.map((b) => (
              <tr key={`${b.name}-${b.target}`} aria-label={`Breaker ${b.name}`}>
                <td className="py-2 pr-3">
                  <span className="font-medium">{b.name}</span>
                  <span className="block text-[0.8125rem] break-all text-stone">{b.target}</span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <BreakerChip state={b.state} />
                  {b.lastStateChangeAt ? (
                    <span className="block text-[0.8125rem] text-stone tabular" title="Last state change">
                      {ago(b.lastStateChangeAt, now)}
                    </span>
                  ) : null}
                </td>
                <td className={`py-2 pr-3 text-right tabular ${b.failures ? "text-brick" : ""}`}>{b.failures}</td>
                <td className="py-2 pr-3 text-right tabular">{b.successes}</td>
                <td className="py-2 pr-3 text-right tabular">{b.rejects}</td>
                <td className="py-2 text-right tabular">{b.timeouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeadLetterCount({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return count ? (
    <button type="button" className="status status-error hover:underline" onClick={onClick} aria-label={`Browse ${count} dead letters in ${label}`}>
      <span className="tabular">{count}</span>
    </button>
  ) : (
    <span className="text-stone tabular">0</span>
  );
}

function groupTone(state: string) {
  return state === "Stable" ? "ok" : state === "Unavailable" || state === "Dead" || state === "Empty" ? "error" : "warn";
}

function Subheading({ children }: { children: ReactNode }) {
  return <h4 className="text-sm font-medium">{children}</h4>;
}

export function ServiceCard({ s, now, onBrowse }: { s: ServiceOverview; now: number; onBrowse: (selection: DeadLetterSelection) => void }) {
  const status = healthTone(s.health);
  const m = s.messaging;
  const checks = Object.entries(s.health?.checks ?? {});
  const titleId = `svc-${s.service}`;

  return (
    <article aria-labelledby={titleId} className="grid min-w-0 content-start gap-5 rounded-[18px] border border-line p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
            {s.service}
          </h3>
          <p className="truncate text-[0.8125rem] text-stone" title={s.url}>
            {s.health?.instanceId ?? m?.instanceId ?? "no instance answered"} · {s.url}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {m?.shuttingDown ? <StateChip tone="warn">Draining</StateChip> : null}
          {m && !m.ready && !m.shuttingDown ? <StateChip tone="warn">Not ready</StateChip> : null}
          <StateChip tone={status.tone}>{status.label}</StateChip>
        </div>
      </header>

      <section className="grid min-w-0 gap-2">
        <Subheading>Dependencies</Subheading>
        {checks.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={`${s.service} dependency checks`}>
            {checks.map(([name, check]) => (
              <li key={name} title={check.error ?? undefined}>
                <StateChip tone={check.status === "up" ? "ok" : "error"}>
                  {name} {check.status}
                  {check.latencyMs !== null ? <span className="text-stone tabular"> · {check.latencyMs} ms</span> : null}
                </StateChip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone">No health report.</p>
        )}
      </section>

      {m ? (
        <section className="grid min-w-0 gap-2">
          <Subheading>Transactional outbox</Subheading>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div className="min-w-0 rounded-[12px] bg-plaster px-2.5 py-2 sm:px-3">
              <dt className="text-stone">Pending</dt>
              <dd className={`text-lg font-semibold tabular ${m.outbox.pending ? "" : "text-stone"}`}>{m.outbox.pending}</dd>
            </div>
            <div className="min-w-0 rounded-[12px] bg-plaster px-2.5 py-2 sm:px-3">
              <dt className="text-stone">Oldest pending</dt>
              <dd className="text-lg font-semibold tabular">{m.outbox.oldestPendingAgeSec === null ? "—" : duration(m.outbox.oldestPendingAgeSec)}</dd>
            </div>
            <div className={`min-w-0 rounded-[12px] px-2.5 py-2 sm:px-3 ${m.outbox.failing ? "bg-brick-wash text-brick" : "bg-plaster"}`}>
              <dt className={m.outbox.failing ? "" : "text-stone"}>Failing</dt>
              <dd className="text-lg font-semibold tabular">{m.outbox.failing}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {m?.queues.length ? (
        <section className="grid min-w-0 gap-2">
          <Subheading>RabbitMQ command queues</Subheading>
          <div className="@container">
            <ul className={STACKED} aria-label={`${s.service} command queues`}>
              {m.queues.map((q) => (
                <li key={q.queue} className="py-2.5 text-sm">
                  <p className="break-all" title={q.queue}>
                    {logicalName(q.queue)}
                  </p>
                  <Stats
                    items={[
                      { label: "Ready", value: q.messages },
                      { label: "Consumers", value: q.consumers, className: q.consumers ? "" : "text-brick" },
                      { label: "DLQ", value: <DeadLetterCount count={q.dlq.messages} label={logicalName(q.dlq.queue)} onClick={() => onBrowse({ service: s.service, source: "rabbit", queueOrTopic: q.dlq.queue })} /> },
                    ]}
                  />
                </li>
              ))}
            </ul>
            <div className={TABULAR}>
              <table className="w-full text-left text-sm">
                <thead className="text-stone">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Queue</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Ready</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Consumers</th>
                    <th className="py-1.5 text-right font-medium">DLQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {m.queues.map((q) => (
                    <tr key={q.queue}>
                      <td className="py-2 pr-3 break-all" title={q.queue}>
                        {logicalName(q.queue)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">{q.messages}</td>
                      <td className={`py-2 pr-3 text-right tabular ${q.consumers ? "" : "text-brick"}`}>{q.consumers}</td>
                      <td className="py-2 text-right">
                        <DeadLetterCount count={q.dlq.messages} label={logicalName(q.dlq.queue)} onClick={() => onBrowse({ service: s.service, source: "rabbit", queueOrTopic: q.dlq.queue })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {m?.consumerGroups.length ? (
        <section className="grid min-w-0 gap-2">
          <Subheading>Kafka consumer groups</Subheading>
          <div className="@container">
            <ul className={STACKED} aria-label={`${s.service} consumer groups`}>
              {m.consumerGroups.map((g) => (
                <li key={g.group} className="py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-all" title={`${g.group}\nTopics: ${g.topics.map(logicalName).join(", ")}`}>
                      {logicalName(g.group)}
                      <span className="block text-[0.8125rem] text-stone">{g.topics.length} topics</span>
                    </p>
                    <StateChip tone={groupTone(g.state)}>{g.state}</StateChip>
                  </div>
                  <Stats
                    items={[
                      { label: "Members", value: g.members },
                      { label: "Lag", value: g.lag, className: g.lag > 0 ? "font-semibold" : "" },
                      { label: "DLT", value: <DeadLetterCount count={g.dlt.messages} label={logicalName(g.dlt.topic)} onClick={() => onBrowse({ service: s.service, source: "kafka", queueOrTopic: g.dlt.topic })} /> },
                    ]}
                  />
                </li>
              ))}
            </ul>
            <div className={TABULAR}>
              <table className="w-full text-left text-sm">
                <thead className="text-stone">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Group</th>
                    <th className="py-1.5 pr-3 font-medium">State</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Members</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Lag</th>
                    <th className="py-1.5 text-right font-medium">DLT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {m.consumerGroups.map((g) => (
                    <tr key={g.group}>
                      <td className="py-2 pr-3 break-all" title={`${g.group}\nTopics: ${g.topics.map(logicalName).join(", ")}`}>
                        {logicalName(g.group)}
                        <span className="block text-[0.8125rem] text-stone">{g.topics.length} topics</span>
                      </td>
                      <td className="py-2 pr-3">
                        <StateChip tone={groupTone(g.state)}>{g.state}</StateChip>
                      </td>
                      <td className="py-2 pr-3 text-right tabular">{g.members}</td>
                      <td className={`py-2 pr-3 text-right tabular ${g.lag > 0 ? "font-semibold" : ""}`}>{g.lag}</td>
                      <td className="py-2 text-right">
                        <DeadLetterCount count={g.dlt.messages} label={logicalName(g.dlt.topic)} onClick={() => onBrowse({ service: s.service, source: "kafka", queueOrTopic: g.dlt.topic })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid min-w-0 gap-2">
        <Subheading>Circuit breakers</Subheading>
        <BreakerTable breakers={s.breakers} now={now} caption={`${s.service} circuit breakers`} />
      </section>

      {s.error ? (
        <p className="rounded-[12px] bg-brick-wash px-3 py-2 text-[0.8125rem] text-brick" role="status">
          Partial report · {s.error}
        </p>
      ) : null}
    </article>
  );
}
