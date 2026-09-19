"use client";

import type { ProductDto, UserDto } from "@meridian/contracts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plate } from "@/components/ui/Plate";
import { Skeleton } from "@/components/ui/skeleton";
import { useCatalog } from "@/lib/catalog-context";
import { money, plural, shortDate, statusLabel, statusTone } from "@/lib/format";
import { bySku, variantImage } from "@/lib/product";
import { useSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { countryName } from "./countries";
import { ErrorState } from "./shared";

const RECENT = 3;

function RecentOrders() {
  const orders = trpc.orders.list.useQuery();
  const catalog = useCatalog();

  if (orders.isPending) {
    return (
      <div className="mt-6 grid gap-3" aria-busy="true" aria-label="Loading orders">
        <Skeleton className="h-[88px] !rounded-[14px]" />
        <Skeleton className="h-[88px] !rounded-[14px]" />
      </div>
    );
  }
  if (orders.error) return <div className="mt-6"><ErrorState title="We couldn’t load your orders" error={orders.error} onRetry={() => void orders.refetch()} /></div>;
  if (!orders.data.length) {
    return (
      <div className="panel mt-6 px-6 py-12 text-center">
        <h3 className="heading">No orders yet</h3>
        <p className="mt-1 text-stone">When you check out while signed in, your orders appear here.</p>
        <Button asChild className="mt-5">
          <Link href="/shop">Browse the shop</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {orders.data.slice(0, RECENT).map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="group flex flex-wrap items-center gap-x-5 gap-y-3 py-5">
              <div className="flex -space-x-3" aria-hidden="true">
                {o.lines.slice(0, 3).map((l) => {
                  const hit = bySku(catalog, l.sku);
                  return (
                    <div key={l.sku} className="well aspect-[4/5] w-12 !rounded-[10px] ring-2 ring-paper">
                      {hit ? <Plate src={variantImage(hit.product, hit.variant.id)} alt="" sizes="48px" /> : null}
                    </div>
                  );
                })}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium group-hover:underline">Order {o.number}</p>
                <p className="text-sm text-stone">
                  {shortDate(o.createdAt)} · {plural(o.itemCount, "item")}
                </p>
              </div>
              <span className={`status ${statusTone(o.status)}`}>{statusLabel(o.status)}</span>
              <p className="w-24 text-right tabular">{money(o.totalCents)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-right">
        <Link href="/orders" className="link text-sm">
          {orders.data.length > RECENT ? `View all ${orders.data.length} orders` : "Order history"}
        </Link>
      </p>
    </>
  );
}

function DefaultAddress() {
  const addresses = trpc.account.addresses.list.useQuery();
  const fallback = (
    <Link href="/account/addresses" className="link text-sm">
      Manage addresses
    </Link>
  );
  if (addresses.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading addresses" className="mt-4 grid gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }
  if (addresses.error) {
    return (
      <div className="mt-4 text-sm" role="alert">
        <p className="text-brick">We couldn’t load your addresses.</p>
        {addresses.error.data?.correlationId ? <p className="text-xs text-stone tabular">Reference: {addresses.error.data.correlationId}</p> : null}
        <button type="button" className="link mt-2" onClick={() => void addresses.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  const main = addresses.data.find((a) => a.isDefault) ?? addresses.data[0];
  if (!main) {
    return (
      <div className="mt-3 text-sm text-stone">
        <p>No saved addresses yet. Save one to check out faster.</p>
        <p className="mt-3">
          <Link href="/account/addresses" className="link">
            Add an address
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 text-sm">
      <address className="not-italic text-stone">
        <span className="block font-medium text-ink">{main.label || main.fullName}</span>
        {main.label ? <span className="block">{main.fullName}</span> : null}
        <span className="block">{main.line1}</span>
        <span className="block">
          {main.postalCode} {main.city}, {countryName(main.country)}
        </span>
      </address>
      <p className="mt-3 text-stone">
        {plural(addresses.data.length, "saved address", "saved addresses")} · {fallback}
      </p>
    </div>
  );
}

function SavedPreview() {
  const catalog = useCatalog();
  const bySlug = new Map(catalog.products.map((p) => [p.slug, p]));
  const saved = useSaved()
    .map((s) => bySlug.get(s))
    .filter((p): p is ProductDto => Boolean(p));
  return saved.length ? (
    <ul className="mt-5 grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-4">
      {saved.slice(0, 6).map((p) => (
        <li key={p.slug}>
          <Link href={`/product/${p.slug}`} className="block" aria-label={p.name}>
            <div className="well aspect-[4/5] !rounded-[12px] bg-paper">
              <Plate src={variantImage(p)} alt="" sizes="96px" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-3 text-sm text-stone">Tap the heart on any piece to keep it here.</p>
  );
}

/** Account overview: recent orders, default address, saved pieces and account details at a glance. */
export function Overview({ user }: { user: UserDto }) {
  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
      <section className="lg:col-span-8" aria-labelledby="orders-title">
        <h2 id="orders-title" className="section-title">
          Recent orders
        </h2>
        <RecentOrders />
      </section>

      <div className="grid content-start gap-4 lg:col-span-4">
        <section className="panel p-6" aria-labelledby="details-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="details-title" className="heading">
              Your details
            </h2>
            <Link href="/account/profile" className="link text-sm">
              Edit
            </Link>
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-stone">Name</dt>
              <dd className="break-words font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-stone">Email</dt>
              <dd className="flex flex-wrap items-center gap-2 break-all font-medium">
                {user.email}
                {user.emailVerified ? null : <Badge tone="warn">Not verified</Badge>}
              </dd>
            </div>
            <div>
              <dt className="text-stone">Member since</dt>
              <dd className="font-medium">{shortDate(user.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="panel p-6" aria-labelledby="address-title">
          <h2 id="address-title" className="heading">
            Default address
          </h2>
          <DefaultAddress />
        </section>

        <section className="panel p-6" aria-labelledby="saved-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="saved-title" className="heading">
              Saved
            </h2>
            <Link href="/saved" className="link text-sm">
              View all
            </Link>
          </div>
          <SavedPreview />
        </section>
      </div>
    </div>
  );
}
