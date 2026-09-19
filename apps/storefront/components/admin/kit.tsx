"use client";

import { cloneElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Shared building blocks for the admin console: page frame, data states, filters, cursor pages, time helpers. */

type ClientError = { message: string; data?: { code?: string; status?: number; correlationId?: string; details?: unknown } | null } | null | undefined;

/** Admin error states always carry the request reference, whatever the status, so a failure can be traced in logs. */
export function adminReference(error: ClientError): string | null {
  const id = error?.data?.correlationId;
  return id ? `Reference: ${id}` : null;
}

export function ErrorState({ error, what, className }: { error: ClientError; what?: string; className?: string }) {
  if (!error) return null;
  return (
    <Alert className={className} reference={adminReference(error)}>
      {what ? <span className="font-medium">{what}: </span> : null}
      {errorMessage(error) ?? "Something went wrong."}
    </Alert>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="section-title">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] text-stone">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, className, children }: { title: string; body?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("panel grid place-items-center px-6 py-12 text-center", className)} role="status">
      <p className="heading">{title}</p>
      {body ? <p className="mt-2 max-w-[48ch] text-sm text-stone">{body}</p> : null}
      {children}
    </div>
  );
}

/**
 * Responsive record lists: the same rows render as stacked cards below `at` and as a table from `at` up. The inactive
 * layout is display:none, so screen readers and role locators only ever see one copy of each link and button.
 */
type Breakpoint = "md" | "lg" | "xl";
const CARDS_UNTIL: Record<Breakpoint, string> = { md: "md:hidden", lg: "lg:hidden", xl: "xl:hidden" };
const TABLE_FROM: Record<Breakpoint, string> = { md: "hidden md:block", lg: "hidden lg:block", xl: "hidden xl:block" };

export function RowCards({ at, label, busy, children, className }: { at: Breakpoint; label: string; busy?: boolean; children: ReactNode; className?: string }) {
  return (
    <ul
      className={cn("grid grid-cols-[minmax(0,1fr)] divide-y divide-line overflow-hidden rounded-[16px] border border-line", CARDS_UNTIL[at], className)}
      aria-label={label}
      aria-busy={busy}
    >
      {children}
    </ul>
  );
}

/** One record in `RowCards`. Pass `linked` when a stretched link (after:absolute after:inset-0) makes the whole card clickable. */
export function RowCard({ children, linked, className }: { children: ReactNode; linked?: boolean; className?: string }) {
  return <li className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3.5", linked && "relative transition-colors hover:bg-plaster/60", className)}>{children}</li>;
}

/** Wraps the table half of a responsive list; give the table a min width so it scrolls (with an edge shade) rather than squashing. */
export function TableFrom({ at, children }: { at: Breakpoint; children: ReactNode }) {
  return <div className={TABLE_FROM[at]}>{children}</div>;
}

/** Table-shaped loading placeholder that reserves the space the data will take. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-2 rounded-[16px] border border-line p-4", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

export function Section({ title, id, actions, children, className }: { title: string; id: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="heading">
          {title}
        </h2>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A labelled Radix select for filters; `all` stands for "no filter" because Radix items cannot use empty values. */
export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string;
  value: T | "all";
  onChange: (value: T | "all") => void;
  options: readonly { value: T; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T | "all")}>
      <SelectTrigger aria-label={label} className={cn("min-w-40", className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Search field that submits on Enter or the button, so every keystroke doesn't hit the service. Full width on phones. */
export function SearchForm({ label, placeholder, initial = "", onSearch }: { label: string; placeholder: string; initial?: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      aria-label={label}
      noValidate
      className="flex w-full items-center gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <label className="relative min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">{label}</span>
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone" />
        <input
          type="search"
          className="field !min-h-10 w-full !rounded-full !pl-10 text-sm sm:w-64"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (!e.target.value) onSearch("");
          }}
        />
      </label>
      <button type="submit" className="btn btn-secondary btn-sm shrink-0">
        Search
      </button>
    </form>
  );
}

/** Cursor pagination state: a stack of cursors so "Previous" works on forward-only cursors. */
export function useCursorPages(resetKey: string) {
  const [state, setState] = useState<{ key: string; stack: (string | undefined)[] }>({ key: resetKey, stack: [undefined] });
  const stack = state.key === resetKey ? state.stack : [undefined];
  return {
    cursor: stack[stack.length - 1],
    page: stack.length,
    next: (cursor: string) => setState({ key: resetKey, stack: [...stack, cursor] }),
    previous: () => setState({ key: resetKey, stack: stack.length > 1 ? stack.slice(0, -1) : stack }),
  };
}

export function Pager({ page, nextCursor, onNext, onPrevious, busy }: { page: number; nextCursor: string | null | undefined; onNext: (cursor: string) => void; onPrevious: () => void; busy?: boolean }) {
  if (page === 1 && !nextCursor) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-end gap-3">
      <span className="text-sm text-stone tabular">Page {page}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onPrevious} disabled={page === 1 || busy}>
        <Icon name="arrowLeft" size={16} />
        Previous
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => nextCursor && onNext(nextCursor)} disabled={!nextCursor || busy}>
        Next
        <Icon name="arrowRight" size={16} />
      </button>
    </nav>
  );
}

/** Label, control and message. While there is an error the control is described by it, unless it names its own description. */
export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  const control =
    error && isValidElement<{ "aria-describedby"?: string }>(children) && !children.props["aria-describedby"]
      ? cloneElement(children, { "aria-describedby": `${htmlFor}-error` })
      : children;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {error ? (
        <FieldError id={`${htmlFor}-error`} className="mt-0">
          {error}
        </FieldError>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Re-renders every `intervalMs` so relative times ("12s ago") stay current. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ago(iso: string | number | null | undefined, now: number): string {
  if (iso === null || iso === undefined) return "never";
  const at = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(at)) return "unknown";
  return duration(Math.max(0, now - at) / 1000) + " ago";
}

/** Compact duration from seconds: 42s, 3m 5s, 2h 10m, 3d 4h. */
export function duration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86_400)}d ${Math.floor((s % 86_400) / 3600)}h`;
}

const stamp = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function dateTime(iso: string | null | undefined): string {
  return iso ? stamp.format(new Date(iso)) : "—";
}

const compactStamp = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Table-cell timestamp: "17 Sept, 17:43", with the year only when it isn't this year, so date columns stay one line. */
export function compactDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return at.getFullYear() === new Date().getFullYear() ? compactStamp.format(at) : stamp.format(at);
}

/** Euro input text ("12.50", "12,5") to integer cents; null when it isn't a valid amount. */
export function parseEuros(text: string): number | null {
  const normalised = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  return Math.round(Number(normalised) * 100);
}

export function eurosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** Status chip on the house style, with a brick variant for failures (open breakers, down services, dead letters). */
export function StateChip({ tone, children, title }: { tone: "ok" | "warn" | "muted" | "info" | "error"; children: ReactNode; title?: string }) {
  if (tone === "error") {
    return (
      <span title={title} className="status status-error">
        {children}
      </span>
    );
  }
  return (
    <Badge tone={tone} title={title}>
      {children}
    </Badge>
  );
}

/** Small copy-to-clipboard button for ids (correlation ids, transaction ids). */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="truncate rounded-[6px] bg-plaster font-sans px-1.5 py-0.5 text-[0.8125rem] tabular" title={value}>
        {value}
      </code>
      <button
        type="button"
        className="grid size-7 shrink-0 place-items-center rounded-full text-stone hover:bg-plaster hover:text-ink"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          );
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={15} />
      </button>
    </span>
  );
}
