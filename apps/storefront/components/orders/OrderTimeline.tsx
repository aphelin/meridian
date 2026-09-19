import type { OrderDto, TimelineEntryDto } from "@meridian/contracts";
import { statusLabel } from "@/lib/format";

const stamp = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const TRACK = [
  { id: "placed", label: "Placed" },
  { id: "paid", label: "Paid" },
  { id: "fulfilling", label: "Preparing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
] as const;

function entryLabel(entry: TimelineEntryDto) {
  if (entry.status === "refund") return "Refund";
  if (entry.status === "return") return "Return";
  if (entry.status === "placed") return "Placed";
  return statusLabel(entry.status);
}

/** Progress bar over the happy path; hidden for cancelled orders. Refunded orders keep the furthest step reached. */
export function OrderProgress({ order }: { order: OrderDto }) {
  if (order.status === "cancelled") return null;
  const reached = new Set(order.timeline.map((t) => t.status));
  const current = TRACK.reduce((at, step, i) => (reached.has(step.id) || order.status === step.id ? i : at), 0);
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
      {TRACK.map((step, i) => (
        <li key={step.id} className="min-w-0" aria-current={i === current ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full transition-colors duration-500 ${i <= current ? "bg-ink" : "bg-line"}`} aria-hidden="true" />
          <span className={`mt-2.5 block truncate text-xs sm:text-sm ${i <= current ? "font-medium text-ink" : "text-stone"}`}>
            {step.label}
            <span className="sr-only">{i <= current ? " (reached)" : " (not yet)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Every event on the order, oldest first, with the service's notes (carrier and tracking, refund amounts, returns). */
export function OrderTimeline({ timeline }: { timeline: TimelineEntryDto[] }) {
  const entries = [...timeline].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <ol className="relative grid gap-5 pl-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line-strong" aria-label="Order timeline">
      {entries.map((entry, i) => (
        <li key={`${entry.status}-${entry.at}-${i}`} className="relative">
          <span
            className={`absolute -left-6 top-[7px] size-[11px] rounded-full ${i === entries.length - 1 ? "bg-ink" : "bg-raised shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]"}`}
            aria-hidden="true"
          />
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{entryLabel(entry)}</span>
            <time dateTime={entry.at} className="text-sm text-stone tabular">
              {stamp.format(new Date(entry.at))}
            </time>
          </p>
          {entry.note ? <p className="text-[0.9375rem] text-stone">{entry.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
