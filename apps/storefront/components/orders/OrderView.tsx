"use client";

import type { OrderDto } from "@meridian/contracts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PaymentPanel } from "@/components/checkout/PaymentPanel";
import { forgetIntent, recallIntent, type StoredIntent } from "@/components/checkout/payment-intent";
import { countryName } from "@/components/checkout/AddressFields";
import { PricingList } from "@/components/checkout/OrderSummary";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Plate } from "@/components/ui/Plate";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalog } from "@/lib/catalog-context";
import { errorCode } from "@/lib/errors";
import { money, shortDate, statusLabel, statusTone } from "@/lib/format";
import { bySku, variantImage } from "@/lib/product";
import { trpc } from "@/lib/trpc";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { ErrorState } from "./ErrorState";
import { InvoiceButton } from "./InvoiceButton";
import { OrderProgress, OrderTimeline } from "./OrderTimeline";
import { RefundsList, ReturnsList } from "./RefundsReturns";
import { ReturnRequestDialog } from "./ReturnRequestDialog";

const POLL_MS = 2000;
const POLL_FOR_MS = 60_000;
const PAID_STATES = new Set(["paid", "fulfilling", "shipped", "delivered", "refunded", "partially_refunded"]);
const time = new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit" });

const cancellationText: Record<string, string> = {
  customer: "You cancelled this order.",
  admin: "We cancelled this order.",
  expired: "This order was cancelled because it wasn’t paid in time.",
  "out-of-stock": "This order was cancelled because a piece sold out.",
  "payment-unavailable": "This order was cancelled because payment was unavailable.",
};

/** Still settling: paid confirmation, pending refunds, or the invoice for a paid order. */
function settling(order: OrderDto, waitingForPayment: boolean) {
  if (order.status === "placed") return waitingForPayment;
  if (order.refunds.some((r) => r.status === "pending")) return true;
  return PAID_STATES.has(order.status) && !order.invoice && order.status !== "refunded";
}

/** Only http(s) tracking links are rendered. */
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

export function OrderSkeleton() {
  return (
    <main className="shell pt-8 md:pt-12" aria-busy="true">
      <h1 className="sr-only">Loading order</h1>
      <Skeleton className="h-11 w-72 max-w-full" />
      <Skeleton className="mt-4 h-5 w-56" />
      <Skeleton className="mt-10 h-8 w-full" />
      <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="grid content-start gap-4 lg:col-span-7">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-80 !rounded-[18px] lg:col-span-5" />
      </div>
    </main>
  );
}

export function OrderView({ id }: { id: string }) {
  const search = useSearchParams();
  // Captured once: the access token moves into an httpOnly cookie and is then removed from the address bar.
  const [access] = useState(() => search.get("access") || undefined);
  // Stripe redirect-based methods come back with ?payment_intent=…&redirect_status=…: a failed redirect is not "just paid".
  const [redirectFailed] = useState(() => search.get("redirect_status") === "failed");
  const [justPaid, setJustPaid] = useState(() => search.get("paid") === "1" && !redirectFailed);
  const [pollUntil, setPollUntil] = useState(() => Date.now() + POLL_FOR_MS);
  const [timedOut, setTimedOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredIntent | null>(null);
  const catalog = useCatalog();
  const utils = trpc.useUtils();

  const order = trpc.orders.byId.useQuery(
    { id, access },
    {
      retry: false,
      refetchInterval: (q) => {
        const data = q.state.data;
        if (!data || q.state.error || Date.now() > pollUntil) return false;
        return settling(data, justPaid) ? POLL_MS : false;
      },
    },
  );
  const data = order.data;

  useEffect(() => {
    const left = pollUntil - Date.now();
    setTimedOut(false);
    if (left <= 0) return setTimedOut(true);
    const timer = window.setTimeout(() => setTimedOut(true), left);
    return () => window.clearTimeout(timer);
  }, [pollUntil]);

  useEffect(() => {
    // Drop Stripe's return parameters (they include the PaymentIntent client secret) from the address bar.
    if (search.has("payment_intent") || search.has("redirect_status")) window.history.replaceState(window.history.state, "", `/orders/${id}${justPaid ? "?paid=1" : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the landing from Stripe
  }, []);

  useEffect(() => {
    if (access && data) window.history.replaceState(window.history.state, "", `/orders/${id}${justPaid ? "?paid=1" : ""}`);
  }, [access, data, id, justPaid]);

  useEffect(() => {
    if (!data) return;
    if (data.status === "placed" && data.actions.pay) setStored(recallIntent(data.id));
    else {
      forgetIntent(data.id);
      setStored(null);
    }
  }, [data]);

  const keepPolling = () => setPollUntil(Date.now() + POLL_FOR_MS);

  if (order.isPending) return <OrderSkeleton />;

  if (order.error || !data) {
    const code = errorCode(order.error);
    const title =
      code === "UNAUTHORIZED"
        ? "Sign in to see this order"
        : code === "FORBIDDEN"
          ? "You don’t have access to this order"
          : code === "NOT_FOUND"
            ? "We couldn’t find that order"
            : "We couldn’t load this order";
    const description =
      code === "FORBIDDEN"
        ? "Sign in with the account that placed it, or open the private link from your order email."
        : code === "NOT_FOUND"
          ? "Check the link from your email and try again."
          : code === "UNAUTHORIZED"
            ? "This order belongs to an account. Sign in to see it."
            : undefined;
    const signIn = code === "UNAUTHORIZED" || code === "FORBIDDEN";
    return (
      <main className="shell pt-10">
        <ErrorState
          title={title}
          error={order.error}
          description={description}
          onRetry={signIn || code === "NOT_FOUND" ? undefined : () => void order.refetch()}
          action={signIn ? { href: `/account?next=${encodeURIComponent(`/orders/${id}`)}`, label: "Sign in" } : { href: "/shop", label: "Continue shopping" }}
        />
      </main>
    );
  }

  const paid = PAID_STATES.has(data.status);
  const trackingUrl = safeUrl(data.fulfillment.trackingUrl);
  const address = data.shippingAddress;
  const setOrder = (next: OrderDto) => utils.orders.byId.setData({ id, access }, next);

  return (
    <main className="shell pt-8 md:pt-12">
      <div aria-live="polite">
        {justPaid && paid ? (
          <Alert tone="ok" className="mb-8 items-center !py-4 text-[0.9375rem]">
            <span className="font-medium">Thank you, your payment went through and the order is confirmed.</span> It was a test payment, so nothing was charged. A confirmation is on its way to{" "}
            {data.customer.email}.
          </Alert>
        ) : justPaid && data.status === "placed" ? (
          timedOut ? (
            <Alert className="mb-8">
              We haven’t received the payment confirmation yet. It can take a little longer; check again in a moment.{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-4"
                onClick={() => {
                  keepPolling();
                  void order.refetch();
                }}
              >
                Check again
              </button>
            </Alert>
          ) : (
            <div className="alert mb-8 items-center !py-4 text-[0.9375rem]" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>Confirming your payment…</span>
            </div>
          )
        ) : null}
        {redirectFailed && data.status === "placed" ? (
          <Alert className="mb-8">The payment didn’t go through, so nothing was charged. You can try again below with another method or test card.</Alert>
        ) : null}
        {notice ? (
          <Alert tone="ok" className="mb-8">
            {notice}
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="title">Order {data.number}</h1>
        <span className={`status ${statusTone(data.status)}`}>{statusLabel(data.status)}</span>
      </div>
      <p className="mt-2 text-stone">
        Placed {shortDate(data.createdAt)} · {data.customer.email}
      </p>

      {data.status === "cancelled" ? (
        <p className="mt-6 rounded-[12px] bg-plaster px-4 py-3 text-[0.9375rem]">{cancellationText[data.cancellationReason ?? ""] ?? "This order was cancelled."}</p>
      ) : (
        <div className="mt-10">
          <OrderProgress order={data} />
        </div>
      )}

      {data.fulfillment.carrier && data.fulfillment.trackingNumber ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 text-[0.9375rem]">
          <Icon name="package" size={20} aria-hidden="true" />
          Shipped with {data.fulfillment.carrier}
          {data.fulfillment.shippedAt ? ` on ${shortDate(data.fulfillment.shippedAt)}` : ""} ·
          {trackingUrl ? (
            <a href={trackingUrl} className="link" target="_blank" rel="noreferrer noopener">
              Track parcel {data.fulfillment.trackingNumber}
            </a>
          ) : (
            <span className="tabular">Tracking number {data.fulfillment.trackingNumber}</span>
          )}
        </p>
      ) : null}

      <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="grid content-start gap-12 lg:col-span-7">
          {data.status === "placed" ? (
            stored ? (
              <PaymentPanel
                stored={stored}
                onPaid={() => {
                  setStored(null);
                  setJustPaid(true);
                  keepPolling();
                  window.history.replaceState(window.history.state, "", `/orders/${id}?paid=1`);
                  void order.refetch();
                }}
              />
            ) : !justPaid ? (
              <div className="panel p-6 sm:p-8">
                <h2 className="font-medium">Waiting for payment</h2>
                <p className="mt-1 text-stone">
                  This order hasn’t been paid yet.
                  {data.paymentDeadline ? ` Unpaid orders are cancelled automatically at ${time.format(new Date(data.paymentDeadline))}.` : ""}
                </p>
              </div>
            ) : null
          ) : null}

          <section aria-labelledby="items-title">
            <h2 id="items-title" className="heading">
              Items
            </h2>
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {data.lines.map((l) => {
                const hit = bySku(catalog, l.sku);
                return (
                  <li key={l.sku} className="flex items-center gap-4 py-4">
                    <div className="well aspect-[4/5] w-16 shrink-0 !rounded-[10px]">{hit ? <Plate src={variantImage(hit.product, hit.variant.id)} alt="" sizes="64px" /> : null}</div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/product/${l.slug}`} className="font-medium hover:underline">
                        {l.productName}
                      </Link>
                      <p className="truncate text-sm text-stone">
                        {l.variantLabel} · Qty <span className="tabular">{l.qty}</span> × <span className="tabular">{money(l.unitPriceCents)}</span>
                      </p>
                    </div>
                    <p className="tabular">{money(l.lineTotalCents)}</p>
                  </li>
                );
              })}
            </ul>
            {data.actions.cancel || data.actions.requestReturn ? (
              <div className="mt-6 flex flex-wrap gap-2.5">
                {data.actions.requestReturn ? (
                  <ReturnRequestDialog
                    order={data}
                    access={access}
                    onRequested={() => {
                      setNotice("Return requested. We’ll email you once it’s reviewed.");
                      keepPolling();
                      void order.refetch();
                    }}
                  />
                ) : null}
                {data.actions.cancel ? (
                  <CancelOrderDialog
                    order={data}
                    access={access}
                    onCancelled={(next) => {
                      setOrder(next);
                      forgetIntent(next.id);
                      setNotice(next.refunds.length || data.status !== "placed" ? "Order cancelled. Your refund is on its way." : "Order cancelled. Nothing was charged.");
                      keepPolling();
                      void utils.orders.list.invalidate();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </section>

          <ReturnsList order={data} />
          <RefundsList order={data} />

          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="heading">
              Timeline
            </h2>
            <div className="mt-5">
              <OrderTimeline timeline={data.timeline} />
            </div>
          </section>
        </div>

        <aside className="lg:col-span-5" aria-label="Order details">
          <div className="panel grid gap-6 p-6 sm:p-8 lg:sticky lg:top-28">
            <PricingList pricing={data.pricing} couponCode={data.couponCode} shippingLabel={data.shippingMethod.label} />
            {data.refundedCents ? (
              <p className="-mt-3 flex justify-between text-sm">
                <span className="text-stone">Refunded</span>
                <span className="tabular">−{money(data.refundedCents)}</span>
              </p>
            ) : null}
            <div className="grid gap-5 border-t border-line-strong/60 pt-5 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <h2 className="label">Delivery address</h2>
                <address className="not-italic text-stone">
                  {address.fullName}
                  <br />
                  {address.line1}
                  {address.line2 ? (
                    <>
                      <br />
                      {address.line2}
                    </>
                  ) : null}
                  <br />
                  {address.postalCode} {address.city}
                  <br />
                  {countryName(address.country)}
                  {address.phone ? (
                    <>
                      <br />
                      {address.phone}
                    </>
                  ) : null}
                </address>
              </div>
              <div>
                <h2 className="label">Contact</h2>
                <p className="break-words text-stone">
                  {data.customer.name}
                  <br />
                  {data.customer.email}
                </p>
                <h2 className="label mt-4">Shipping method</h2>
                <p className="text-stone">{data.shippingMethod.label}</p>
              </div>
            </div>
            <div className="grid gap-2.5">
              {data.actions.downloadInvoice ? (
                <InvoiceButton order={data} access={access} />
              ) : paid && data.status !== "refunded" ? (
                <p className="text-sm text-stone">{timedOut ? "Your invoice will be available here shortly." : "Preparing your invoice…"}</p>
              ) : null}
              <Button asChild variant={data.actions.downloadInvoice ? "quiet" : "primary"} className="w-full">
                <Link href="/shop">Continue shopping</Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
