"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { money, plural, shortDate, statusLabel, statusTone } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ErrorState } from "./ErrorState";

function HistorySkeleton() {
  return (
    <ul className="mt-8 grid gap-3" aria-busy="true" aria-label="Loading orders">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-[92px] w-full !rounded-[14px]" />
        </li>
      ))}
    </ul>
  );
}

/** Order history for the signed-in shopper. Guests reach their orders through the private link in the email. */
export function OrderHistory() {
  const me = trpc.auth.me.useQuery();
  const orders = trpc.orders.list.useQuery(undefined, { enabled: Boolean(me.data) });

  return (
    <main className="shell pt-8 md:pt-14">
      <h1 className="title">Your orders</h1>
      {me.isPending || (me.data && orders.isPending) ? (
        <HistorySkeleton />
      ) : me.error ? (
        <div className="mt-8">
          <ErrorState headingLevel="h2" title="We couldn’t load your orders" error={me.error} onRetry={() => void me.refetch()} />
        </div>
      ) : !me.data ? (
        <div className="panel mt-8 grid place-items-center px-6 py-16 text-center sm:py-20">
          <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
            <Icon name="user" size={24} />
          </span>
          <h2 className="heading mt-5">Sign in to see your orders</h2>
          <p className="mt-2 max-w-[44ch] text-stone">Checked out as a guest? Open the private link in your order confirmation email.</p>
          <Button asChild className="mt-6">
            <Link href="/account?next=/orders">Sign in</Link>
          </Button>
        </div>
      ) : orders.error ? (
        <div className="mt-8">
          <ErrorState headingLevel="h2" title="We couldn’t load your orders" error={orders.error} onRetry={() => void orders.refetch()} />
        </div>
      ) : !orders.data?.length ? (
        <div className="panel mt-8 grid place-items-center px-6 py-16 text-center sm:py-20">
          <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
            <Icon name="package" size={24} />
          </span>
          <h2 className="heading mt-5">No orders yet</h2>
          <p className="mt-2 max-w-[40ch] text-stone">When you place an order it shows up here, with its status and invoice.</p>
          <Button asChild className="mt-6">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3" aria-label="Orders">
          {orders.data.map((o) => {
            const names = o.lines.map((l) => (l.qty > 1 ? `${l.productName} × ${l.qty}` : l.productName));
            return (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="group grid gap-x-6 gap-y-2 rounded-[14px] bg-raised p-4 shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-ink)] sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
                  aria-label={`Order ${o.number}, ${statusLabel(o.status)}, ${money(o.totalCents)}, placed ${shortDate(o.createdAt)}`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2.5">
                      <span className="font-medium group-hover:underline">Order {o.number}</span>
                      <span className={`status ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
                    </p>
                    <p className="mt-1 truncate text-sm text-stone">
                      {shortDate(o.createdAt)} · {plural(o.itemCount, "item")} · {names.join(", ")}
                    </p>
                  </div>
                  <p className="flex items-center gap-3 text-lg font-medium tabular sm:justify-end">
                    {money(o.totalCents)}
                    <Icon name="arrowRight" size={18} className="text-stone transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
