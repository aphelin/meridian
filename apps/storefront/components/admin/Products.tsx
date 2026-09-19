"use client";

import type { ProductStatus } from "@meridian/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCatalog } from "@/lib/catalog-context";
import { money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { compactDateTime, dateTime, EmptyState, ErrorState, FilterSelect, PageHeader, Pager, RowCard, RowCards, SearchForm, StateChip, TableFrom, TableSkeleton, useCursorPages } from "./kit";

export const PRODUCT_STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function ProductStatusChip({ status }: { status: ProductStatus }) {
  return <StateChip tone={status === "published" ? "ok" : status === "draft" ? "warn" : "muted"}>{PRODUCT_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}</StateChip>;
}

export function ProductsList() {
  const catalog = useCatalog();
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [q, setQ] = useState("");
  const pages = useCursorPages(`${status}|${q}`);
  const products = trpc.admin.products.list.useQuery({ status: status === "all" ? undefined : status, q: q || undefined, cursor: pages.cursor }, { placeholderData: keepPreviousData });
  const categories = new Map(catalog.categories.map((c) => [c.id, c.label]));

  return (
    <div>
      <PageHeader
        title="Products"
        description="Drafts, published and archived pieces. Publishing emits ProductPublished, which the search indexer and inventory consume."
        actions={
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">
            New product
          </Link>
        }
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchForm label="Search products" placeholder="Name or slug" onSearch={setQ} />
        <FilterSelect label="Product status" value={status} onChange={setStatus} options={PRODUCT_STATUS_OPTIONS} allLabel="All statuses" className="w-full sm:w-auto" />
      </div>
      <ErrorState className="mt-5" error={products.error} what="Products could not be loaded" />
      <div className="mt-5">
        {products.isPending ? (
          <TableSkeleton />
        ) : products.data && !products.data.items.length ? (
          <EmptyState title="No products match" body="Try another search or status, or create a new product." />
        ) : products.data ? (
          <>
            <RowCards at="md" label="Products" busy={products.isFetching}>
              {products.data.items.map((p) => (
                <RowCard key={p.id} linked>
                  <div className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails may live on the media bucket */}
                    <img src={p.heroImageUrl} alt="" className="size-12 shrink-0 rounded-[10px] bg-plaster object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/admin/products/${p.id}`} className="link min-w-0 font-medium after:absolute after:inset-0">
                          {p.name}
                        </Link>
                        <ProductStatusChip status={p.status} />
                      </div>
                      <p className="truncate text-sm text-stone">{p.slug}</p>
                      <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-sm text-stone">
                        <span>
                          {categories.get(p.categoryId) ?? p.categoryId} · <span className="text-ink tabular">{money(p.priceCents)}</span> · {p.variants.length}{" "}
                          {p.variants.length === 1 ? "variant" : "variants"}
                        </span>
                        <span className="whitespace-nowrap tabular">{compactDateTime(p.updatedAt)}</span>
                      </p>
                    </div>
                  </div>
                </RowCard>
              ))}
            </RowCards>
            <TableFrom at="md">
              <Table compact className="min-w-[660px]" aria-label="Products" aria-busy={products.isFetching}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Variants</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails may live on the media bucket */}
                          <img src={p.heroImageUrl} alt="" className="size-11 shrink-0 rounded-[10px] bg-plaster object-cover" loading="lazy" />
                          <div className="min-w-0">
                            <Link href={`/admin/products/${p.id}`} className="link font-medium">
                              {p.name}
                            </Link>
                            <p className="truncate text-sm text-stone">{p.slug}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{categories.get(p.categoryId) ?? p.categoryId}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular">{money(p.priceCents)}</TableCell>
                      <TableCell className="text-right tabular">{p.variants.length}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <ProductStatusChip status={p.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-stone tabular" title={dateTime(p.updatedAt)}>
                        {compactDateTime(p.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrom>
          </>
        ) : null}
        <Pager page={pages.page} nextCursor={products.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={products.isFetching} />
      </div>
    </div>
  );
}
