"use client";

import type { AdminOrderDto } from "@meridian/contracts";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { money, statusLabel, statusTone } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { CopyValue, dateTime, EmptyState, ErrorState, eurosInput, Field, parseEuros, Section, StateChip } from "./kit";
import { OrderStatusChip } from "./Orders";

const REFUNDABLE = new Set(["paid", "fulfilling", "shipped", "delivered", "partially_refunded"]);

function refundableCents(order: AdminOrderDto) {
  const paid = order.payment?.amountCents ?? order.pricing.totalCents;
  const pending = order.refunds.filter((r) => r.status === "pending").reduce((n, r) => n + r.amountCents, 0);
  return Math.max(0, paid - order.refundedCents - pending);
}

function RefundDialog({ order, open, onOpenChange }: { order: AdminOrderDto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const max = refundableCents(order);
  const [amount, setAmount] = useState(() => eurosInput(max));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const refund = trpc.admin.orders.refund.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      toast.success("Refund requested", { description: "payment.refund was queued; the order updates when the provider confirms." });
      void utils.admin.orders.byId.invalidate({ id: order.id });
    },
  });
  const cents = parseEuros(amount);
  const amountError = cents === null ? "Enter an amount in euros, like 25 or 25.50." : cents <= 0 || cents > max ? `Enter an amount between €0.01 and ${money(max)}.` : null;
  const reasonError = reason.trim() ? null : "Give a reason for the refund.";

  return (
    <Dialog open={open} onOpenChange={(next) => !refund.isPending && onOpenChange(next)}>
      <DialogContent className="p-6">
        <DialogTitle>Refund order {order.number}</DialogTitle>
        <DialogDescription className="mt-2">Up to {money(max)} can be refunded: paid amount less refunds already made or pending.</DialogDescription>
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (amountError || reasonError) return focusFirstInvalid(e.currentTarget);
            if (cents === null) return;
            refund.mutate({ id: order.id, amountCents: cents, reason: reason.trim() });
          }}
        >
          <Field label="Refund amount (€)" htmlFor="refund-amount" error={touched ? amountError : null} hint={`Maximum ${money(max)}`}>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={touched && !!amountError}
              aria-describedby={touched && amountError ? "refund-amount-error" : "refund-amount-hint"}
            />
          </Field>
          <Field label="Reason" htmlFor="refund-reason" error={touched ? reasonError : null}>
            <Textarea id="refund-reason" rows={2} className="!min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={touched && !!reasonError} />
          </Field>
          <ErrorState error={refund.error} what="Refund refused" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" size="sm" onClick={() => onOpenChange(false)} disabled={refund.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" pending={refund.isPending}>
              Refund {cents !== null && !amountError ? money(cents) : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Fulfilment({ order }: { order: AdminOrderDto }) {
  const utils = trpc.useUtils();
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [touched, setTouched] = useState(false);
  const transition = trpc.admin.orders.transition.useMutation({
    onSuccess: (updated) => {
      toast.success(`Order ${updated.number} is now ${statusLabel(updated.status).toLowerCase()}`);
      void utils.admin.orders.invalidate();
    },
  });
  const f = order.fulfillment;

  return (
    <div className="grid gap-4">
      {f.carrier || f.trackingNumber ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.9375rem]">
          <dt className="text-stone">Carrier</dt>
          <dd>{f.carrier ?? "—"}</dd>
          <dt className="text-stone">Tracking</dt>
          <dd className="tabular">
            {f.trackingUrl ? (
              <a className="link" href={f.trackingUrl} target="_blank" rel="noreferrer">
                {f.trackingNumber}
              </a>
            ) : (
              (f.trackingNumber ?? "—")
            )}
          </dd>
          <dt className="text-stone">Shipped</dt>
          <dd>{dateTime(f.shippedAt)}</dd>
          <dt className="text-stone">Delivered</dt>
          <dd>{dateTime(f.deliveredAt)}</dd>
        </dl>
      ) : null}

      <ErrorState error={transition.error} what="Transition refused" />

      {order.status === "paid" ? (
        <Button size="sm" className="justify-self-start" pending={transition.isPending} onClick={() => transition.mutate({ id: order.id, status: "fulfilling" })}>
          Start fulfilment
        </Button>
      ) : null}

      {order.status === "fulfilling" ? (
        <form
          aria-label="Ship order"
          className="grid gap-3 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!carrier.trim() || !tracking.trim()) return focusFirstInvalid(e.currentTarget);
            transition.mutate({ id: order.id, status: "shipped", carrier: carrier.trim(), trackingNumber: tracking.trim() });
          }}
        >
          <Field label="Carrier" htmlFor="ship-carrier" error={touched && !carrier.trim() ? "Enter the carrier." : null}>
            <Input id="ship-carrier" className="!min-h-11" placeholder="DHL, UPS, DPD…" value={carrier} onChange={(e) => setCarrier(e.target.value)} aria-invalid={touched && !carrier.trim()} />
          </Field>
          <Field label="Tracking number" htmlFor="ship-tracking" error={touched && !tracking.trim() ? "Enter the tracking number." : null}>
            <Input id="ship-tracking" className="!min-h-11" value={tracking} onChange={(e) => setTracking(e.target.value)} aria-invalid={touched && !tracking.trim()} />
          </Field>
          <Button type="submit" size="sm" className="justify-self-start" pending={transition.isPending}>
            Mark shipped
          </Button>
        </form>
      ) : null}

      {order.status === "shipped" ? (
        <Button size="sm" className="justify-self-start" pending={transition.isPending} onClick={() => transition.mutate({ id: order.id, status: "delivered" })}>
          Mark delivered
        </Button>
      ) : null}

      {!["paid", "fulfilling", "shipped"].includes(order.status) && !f.carrier ? <p className="text-sm text-stone">No fulfilment steps are available in this state.</p> : null}
    </div>
  );
}

/** Payment states read like the order states they drive ("Paid", "Awaiting payment"); a failure uses the brick chip. */
const PAYMENT_AS_ORDER: Record<string, string> = { succeeded: "paid", pending: "placed" };

function PaymentStatusChip({ status }: { status: string }) {
  const mapped = PAYMENT_AS_ORDER[status] ?? status;
  const label = statusLabel(mapped).replace(/_/g, " ");
  const tone = status === "failed" ? "error" : status === "voided" ? "muted" : (statusTone(mapped).replace("status-", "") as "ok" | "warn" | "muted");
  return <StateChip tone={tone}>{label.charAt(0).toUpperCase() + label.slice(1)}</StateChip>;
}

export function OrderDetailSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-80 xl:col-span-8" />
        <Skeleton className="h-80 xl:col-span-4" />
      </div>
    </div>
  );
}

export function OrderDetail({ id }: { id: string }) {
  // A refund settles asynchronously (RabbitMQ → payment-service → provider → checkout), so poll while one is pending.
  const order = trpc.admin.orders.byId.useQuery(
    { id },
    { refetchInterval: (q) => (q.state.data?.refunds.some((r) => r.status === "pending") ? 2000 : false) },
  );
  const [refundOpen, setRefundOpen] = useState(false);

  if (order.isPending) return <OrderDetailSkeleton />;
  if (order.error || !order.data) {
    return (
      <div>
        <Link href="/admin/orders" className="link text-sm">
          All orders
        </Link>
        <h1 className="section-title mt-3">Order</h1>
        {order.error?.data?.code === "NOT_FOUND" ? (
          <EmptyState className="mt-6" title="Order not found" body="It may have been placed on another stack, or the link is wrong." />
        ) : (
          <ErrorState className="mt-6" error={order.error} what="The order could not be loaded" />
        )}
      </div>
    );
  }

  const o = order.data;
  const canRefund = REFUNDABLE.has(o.status) && refundableCents(o) > 0;
  const addr = o.shippingAddress;

  return (
    <div>
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-stone hover:text-ink">
        <Icon name="arrowLeft" size={16} />
        All orders
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title tabular">Order {o.number}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-stone">
            <OrderStatusChip status={o.status} />
            <span>Placed {dateTime(o.createdAt)}</span>
            {o.cancellationReason ? <span>· cancelled ({o.cancellationReason})</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRefund ? (
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(true)}>
              Refund
            </Button>
          ) : null}
          <Link href={`/orders/${o.id}`} className="btn btn-quiet btn-sm">
            Shopper view
          </Link>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone">
        Correlation id <CopyValue value={o.correlationId} label="correlation id" />
      </p>

      <div className="mt-8 grid gap-10 xl:grid-cols-12">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-10 xl:col-span-8">
          <Section title="Items" id="lines-title">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Piece</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.lines.map((l) => (
                  <TableRow key={l.sku}>
                    <TableCell>
                      <p className="font-medium">{l.productName}</p>
                      <p className="text-sm text-stone">
                        {l.variantLabel} · <span className="tabular">{l.sku}</span>
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular">{l.qty}</TableCell>
                    <TableCell className="text-right tabular">{money(l.unitPriceCents)}</TableCell>
                    <TableCell className="text-right tabular">{money(l.lineTotalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[0.9375rem] tabular">
              <dt className="text-stone">Subtotal</dt>
              <dd className="text-right">{money(o.pricing.subtotalCents)}</dd>
              {o.pricing.discountCents ? (
                <>
                  <dt className="text-stone">Discount{o.couponCode ? ` (${o.couponCode})` : ""}</dt>
                  <dd className="text-right">−{money(o.pricing.discountCents)}</dd>
                </>
              ) : null}
              <dt className="text-stone">Shipping ({o.shippingMethod.label})</dt>
              <dd className="text-right">{money(o.pricing.shippingCents)}</dd>
              <dt className="text-stone">VAT included ({o.pricing.taxRatePercent}%)</dt>
              <dd className="text-right">{money(o.pricing.taxCents)}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-medium">{money(o.pricing.totalCents)}</dd>
              {o.refundedCents ? (
                <>
                  <dt className="text-stone">Refunded</dt>
                  <dd className="text-right">−{money(o.refundedCents)}</dd>
                </>
              ) : null}
            </dl>
          </Section>

          <Section title="Fulfilment" id="fulfilment-title">
            <Fulfilment order={o} />
          </Section>

          <Section title="Refunds" id="refunds-title">
            {o.refunds.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {o.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="font-medium tabular">{money(r.amountCents)}</span>
                      <span className="block text-sm text-stone">
                        {r.reason} · {dateTime(r.createdAt)}
                      </span>
                    </span>
                    <StateChip tone={r.status === "succeeded" ? "ok" : r.status === "failed" ? "error" : "warn"}>{r.status}</StateChip>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone">No refunds.</p>
            )}
          </Section>

          <Section
            title="Returns"
            id="returns-title"
            actions={
              o.returns.some((r) => r.status === "requested") ? (
                <Link href="/admin/returns" className="link text-sm">
                  Open returns queue
                </Link>
              ) : null
            }
          >
            {o.returns.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {o.returns.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm">{r.lines.map((l) => `${l.qty} × ${l.sku}`).join(", ")}</span>
                      <StateChip tone={r.status === "rejected" ? "muted" : r.status === "requested" ? "warn" : "ok"}>{r.status}</StateChip>
                    </div>
                    <p className="mt-1 text-sm text-stone">
                      “{r.reason}” · {dateTime(r.createdAt)}
                      {r.refundCents !== null ? ` · refund ${money(r.refundCents)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone">No return requests.</p>
            )}
          </Section>

          <Section title="Audit trail" id="audit-title">
            {o.audit.length ? (
              <ol className="divide-y divide-line border-y border-line">
                {o.audit.map((a, i) => (
                  <li key={`${a.at}-${i}`} className="grid grid-cols-[minmax(0,1fr)] gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                    <span className="text-sm text-stone tabular">{dateTime(a.at)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{a.action}</span>
                      <span className="text-sm text-stone"> by admin {a.actorId.slice(0, 8)}</span>
                      {a.meta && typeof a.meta === "object" && Object.keys(a.meta).length ? (
                        <code className="mt-1 block truncate font-sans text-[0.8125rem] text-stone" title={JSON.stringify(a.meta)}>
                          {JSON.stringify(a.meta)}
                        </code>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-stone">No admin actions yet.</p>
            )}
          </Section>
        </div>

        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8 xl:col-span-4">
          <div className="panel p-6">
            <h2 className="heading">Payment</h2>
            {o.payment ? (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.9375rem]">
                <dt className="text-stone">Status</dt>
                <dd>
                  <PaymentStatusChip status={o.payment.status} />
                </dd>
                <dt className="text-stone">Provider</dt>
                <dd>{o.payment.provider}</dd>
                <dt className="text-stone">Amount</dt>
                <dd className="tabular">{money(o.payment.amountCents)}</dd>
                <dt className="text-stone">Refunded</dt>
                <dd className="tabular">{money(o.payment.refundedCents)}</dd>
                <dt className="text-stone">Transaction</dt>
                <dd className="min-w-0">
                  <CopyValue value={o.payment.transactionId} label="transaction id" />
                </dd>
                <dt className="text-stone">Created</dt>
                <dd>{dateTime(o.payment.createdAt)}</dd>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-stone">Payment details are missing because payment-service did not answer in time. The rest of the order still loads.</p>
            )}
            {o.paymentDeadline && o.status === "placed" ? <p className="mt-3 text-sm text-stone">Pay by {dateTime(o.paymentDeadline)}</p> : null}
          </div>

          <div className="panel p-6">
            <h2 className="heading">Customer</h2>
            <p className="mt-3 font-medium">{o.customer.name}</p>
            <p className="text-sm text-stone">
              <a className="link" href={`mailto:${o.customer.email}`}>
                {o.customer.email}
              </a>
              {o.customer.userId ? "" : " · guest checkout"}
            </p>
            <h3 className="mt-5 text-sm font-medium">Ship to</h3>
            <address className="mt-1 text-[0.9375rem] not-italic text-stone">
              {addr.fullName}
              <br />
              {addr.line1}
              {addr.line2 ? (
                <>
                  <br />
                  {addr.line2}
                </>
              ) : null}
              <br />
              {addr.postalCode} {addr.city}, {addr.country}
              {addr.phone ? (
                <>
                  <br />
                  {addr.phone}
                </>
              ) : null}
            </address>
            {o.invoice ? (
              <p className="mt-5 text-sm">
                Invoice <span className="tabular">{o.invoice.number}</span> · {dateTime(o.invoice.issuedAt)}
              </p>
            ) : null}
          </div>

          <div>
            <h2 className="heading">Timeline</h2>
            <ol aria-label="Timeline" className="mt-4 grid gap-3 border-l border-line pl-4">
              {o.timeline.map((t, i) => (
                <li key={`${t.at}-${i}`} className="relative">
                  <span className="absolute top-2 -left-[21px] size-2.5 rounded-full bg-ink" aria-hidden="true" />
                  <p className="font-medium">{t.status === "refund" ? "Refund" : t.status === "return" ? "Return" : statusLabel(t.status)}</p>
                  <p className="text-sm text-stone">
                    {dateTime(t.at)}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {refundOpen ? <RefundDialog order={o} open={refundOpen} onOpenChange={setRefundOpen} /> : null}
    </div>
  );
}
