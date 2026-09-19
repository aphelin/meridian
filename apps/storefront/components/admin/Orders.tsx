"use client";

import type { OrderStatus } from "@meridian/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, statusLabel, statusTone } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { compactDateTime, dateTime, EmptyState, ErrorState, FilterSelect, PageHeader, Pager, RowCard, RowCards, SearchForm, TableFrom, TableSkeleton, useCursorPages } from "./kit";

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = (
  ["placed", "paid", "fulfilling", "shipped", "delivered", "cancelled", "refunded", "partially_refunded"] as const
).map((value) => ({ value, label: statusLabel(value) }));

export function OrderStatusChip({ status }: { status: string }) {
  return <span className={`status ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

function ExpireDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const expire = trpc.admin.orders.expire.useMutation({
    onSuccess: (result) => {
      onOpenChange(false);
      toast.success(result.expired ? `Expired ${result.expired} unpaid ${result.expired === 1 ? "order" : "orders"}` : "No unpaid orders past their hold");
      void utils.admin.orders.invalidate();
    },
  });
  return (
    <Dialog open={open} onOpenChange={(next) => !expire.isPending && onOpenChange(next)}>
      <DialogContent className="p-6">
        <DialogTitle>Expire unpaid orders?</DialogTitle>
        <DialogDescription className="mt-2">
          Runs the expiry sweep now: orders still awaiting payment after the hold window are cancelled and their stock reservations are released through the
          <code className="mx-1 font-sans font-medium">inventory.release-reservation</code>command.
        </DialogDescription>
        <ErrorState className="mt-4" error={expire.error} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="quiet" size="sm" onClick={() => onOpenChange(false)} disabled={expire.isPending}>
            Cancel
          </Button>
          <Button size="sm" pending={expire.isPending} onClick={() => expire.mutate({})}>
            Expire now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrdersList() {
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [q, setQ] = useState("");
  const [expireOpen, setExpireOpen] = useState(false);
  const pages = useCursorPages(`${status}|${q}`);
  const orders = trpc.admin.orders.list.useQuery(
    { status: status === "all" ? undefined : status, q: q || undefined, cursor: pages.cursor, limit: 25 },
    { placeholderData: keepPreviousData },
  );

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order across guests and accounts, newest first."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setExpireOpen(true)}>
            Expire unpaid orders
          </Button>
        }
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SearchForm label="Search orders" placeholder="Number, email or name" onSearch={setQ} />
        <FilterSelect label="Order status" value={status} onChange={setStatus} options={ORDER_STATUS_OPTIONS} allLabel="All statuses" className="w-full sm:w-auto" />
      </div>

      <ErrorState className="mt-5" error={orders.error} what="Orders could not be loaded" />
      <div className="mt-5">
        {orders.isPending ? (
          <TableSkeleton />
        ) : orders.data && !orders.data.items.length ? (
          <EmptyState title={q || status !== "all" ? "No orders match" : "No orders yet"} body={q || status !== "all" ? "Try another search or status." : "Orders appear here as shoppers check out."} />
        ) : orders.data ? (
          <>
            <RowCards at="md" label="Orders" busy={orders.isFetching}>
              {orders.data.items.map((o) => (
                <RowCard key={o.id} linked>
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/admin/orders/${o.id}`} className="link whitespace-nowrap font-medium tabular after:absolute after:inset-0">
                      {o.number}
                    </Link>
                    <OrderStatusChip status={o.status} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.customer.name}</p>
                      <p className="truncate text-sm text-stone">
                        {o.customer.email}
                        {o.customer.userId ? "" : " · guest"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular">
                        {money(o.totalCents)}
                        <span className="text-sm text-stone"> · {o.itemCount} {o.itemCount === 1 ? "item" : "items"}</span>
                      </p>
                      <p className="whitespace-nowrap text-sm text-stone tabular">{compactDateTime(o.createdAt)}</p>
                    </div>
                  </div>
                </RowCard>
              ))}
            </RowCards>
            <TableFrom at="md">
              <Table compact className="min-w-[640px]" aria-label="Orders" aria-busy={orders.isFetching}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.data.items.map((o) => (
                    <TableRow key={o.id} className="hover:bg-plaster/60">
                      <TableCell>
                        <Link href={`/admin/orders/${o.id}`} className="link whitespace-nowrap font-medium tabular">
                          {o.number}
                        </Link>
                      </TableCell>
                      {/* max-w-0 + w-full: the customer column takes the table's spare width and truncates at its own edge. */}
                      <TableCell className="w-full max-w-0">
                        <p className="truncate font-medium">{o.customer.name}</p>
                        <p className="truncate text-sm text-stone" title={o.customer.email}>
                          {o.customer.email}
                          {o.customer.userId ? "" : " · guest"}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <OrderStatusChip status={o.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular">
                        {money(o.totalCents)}
                        <span className="block text-sm text-stone">{o.itemCount === 1 ? "1 item" : `${o.itemCount} items`}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-stone tabular" title={dateTime(o.createdAt)}>
                        {compactDateTime(o.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrom>
          </>
        ) : null}
        <Pager page={pages.page} nextCursor={orders.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={orders.isFetching} />
      </div>
      <ExpireDialog open={expireOpen} onOpenChange={setExpireOpen} />
    </div>
  );
}
