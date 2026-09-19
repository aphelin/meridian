"use client";

import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCatalog } from "@/lib/catalog-context";
import { money } from "@/lib/format";
import { bySku } from "@/lib/product";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { dateTime, EmptyState, ErrorState, Field, FilterSelect, PageHeader, Pager, parseEuros, StateChip, TableSkeleton, useCursorPages } from "./kit";

type ReturnStatus = "requested" | "approved" | "rejected" | "refunded";
type Decision = { id: string; orderNumber: string; approve: boolean };

const STATUS_OPTIONS: { value: ReturnStatus; label: string }[] = [
  { value: "requested", label: "Awaiting decision" },
  { value: "approved", label: "Approved" },
  { value: "refunded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
];

function DecisionDialog({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [restock, setRestock] = useState(true);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const decide = trpc.admin.returns.decide.useMutation({
    onSuccess: () => {
      toast.success(decision.approve ? `Return for ${decision.orderNumber} approved` : `Return for ${decision.orderNumber} rejected`);
      void utils.admin.returns.invalidate();
      void utils.admin.orders.invalidate();
      onClose();
    },
  });
  const cents = amount.trim() ? parseEuros(amount) : undefined;
  const amountError = cents === null ? "Enter an amount in euros, or leave it empty for the default." : null;
  const noteError = !decision.approve && !note.trim() ? "Tell the customer why the return is rejected." : null;

  return (
    <Dialog open onOpenChange={(open) => !open && !decide.isPending && onClose()}>
      <DialogContent className="p-6">
        <DialogTitle>
          {decision.approve ? "Approve" : "Reject"} return for {decision.orderNumber}
        </DialogTitle>
        <DialogDescription className="mt-2">
          {decision.approve
            ? "Approving issues a refund through payment-service and, if you choose, restocks the returned pieces."
            : "The customer receives an email with your note."}
        </DialogDescription>
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (amountError || noteError) return focusFirstInvalid(e.currentTarget);
            decide.mutate(
              decision.approve
                ? { id: decision.id, approve: true, refundCents: cents ?? undefined, restock, note: note.trim() || undefined }
                : { id: decision.id, approve: false, note: note.trim() },
            );
          }}
        >
          {decision.approve ? (
            <>
              <Field label="Refund amount (€)" htmlFor="return-refund" error={touched ? amountError : null} hint="Leave empty to refund the returned lines, with any discount pro-rated.">
                <Input id="return-refund" inputMode="decimal" placeholder="Default" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={touched && !!amountError} />
              </Field>
              <div className="flex items-center justify-between gap-4 rounded-[14px] bg-plaster px-4 py-3">
                <Label htmlFor="return-restock" className="cursor-pointer">
                  Restock returned pieces
                </Label>
                <Switch id="return-restock" checked={restock} onCheckedChange={setRestock} />
              </div>
            </>
          ) : null}
          <Field label={decision.approve ? "Note (optional)" : "Note to the customer"} htmlFor="return-note" error={touched ? noteError : null}>
            <Textarea id="return-note" rows={3} className="!min-h-20" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={touched && !!noteError} />
          </Field>
          <ErrorState error={decide.error} what="Decision refused" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" size="sm" onClick={onClose} disabled={decide.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" pending={decide.isPending}>
              {decision.approve ? "Approve and refund" : "Reject return"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReturnsQueue() {
  const catalog = useCatalog();
  const [status, setStatus] = useState<ReturnStatus | "all">("requested");
  const [decision, setDecision] = useState<Decision | null>(null);
  const pages = useCursorPages(status);
  const returns = trpc.admin.returns.list.useQuery({ status: status === "all" ? undefined : status, cursor: pages.cursor }, { placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Returns" description="Return requests from delivered orders. Approve with a refund and optional restock, or reject with a note." />
      <div className="mt-6">
        <FilterSelect label="Return status" value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All returns" />
      </div>
      <ErrorState className="mt-5" error={returns.error} what="Returns could not be loaded" />
      <div className="mt-5">
        {returns.isPending ? (
          <TableSkeleton rows={4} />
        ) : returns.data && !returns.data.items.length ? (
          <EmptyState title={status === "requested" ? "No returns waiting" : "No returns here"} body="Requests appear when customers return delivered pieces." />
        ) : returns.data ? (
          <ul className="grid gap-3" aria-label="Return requests">
            {returns.data.items.map((r) => (
              <li key={r.id} className="rounded-[16px] border border-line p-5" aria-label={`Return for ${r.orderNumber}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      <Link href={`/admin/orders/${r.orderId}`} className="link tabular">
                        {r.orderNumber}
                      </Link>
                      <span className="text-stone"> · {r.customer.name}</span>
                    </p>
                    <p className="text-sm text-stone">
                      {r.customer.email} · requested {dateTime(r.createdAt)}
                    </p>
                  </div>
                  <StateChip tone={r.status === "requested" ? "warn" : r.status === "rejected" ? "muted" : "ok"}>{STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}</StateChip>
                </div>
                <ul className="mt-3 grid gap-1 text-[0.9375rem]">
                  {r.lines.map((l) => {
                    const meta = bySku(catalog, l.sku);
                    return (
                      <li key={l.sku}>
                        <span className="tabular">{l.qty} ×</span> {meta ? `${meta.product.name}, ${meta.variant.label}` : l.sku}
                        <span className="text-sm text-stone tabular"> · {l.sku}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 rounded-[14px] bg-plaster px-4 py-3 text-sm">“{r.reason}”</p>
                {r.status !== "requested" ? (
                  <p className="mt-3 text-sm text-stone">
                    Decided {dateTime(r.decidedAt)}
                    {r.refundCents !== null ? ` · refund ${money(r.refundCents)}` : ""}
                    {r.note ? ` · “${r.note}”` : ""}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setDecision({ id: r.id, orderNumber: r.orderNumber, approve: true })} aria-label={`Approve return for ${r.orderNumber}`}>
                      Approve
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDecision({ id: r.id, orderNumber: r.orderNumber, approve: false })} aria-label={`Reject return for ${r.orderNumber}`}>
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <Pager page={pages.page} nextCursor={returns.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={returns.isFetching} />
      </div>
      {decision ? <DecisionDialog key={decision.id + String(decision.approve)} decision={decision} onClose={() => setDecision(null)} /> : null}
    </div>
  );
}
