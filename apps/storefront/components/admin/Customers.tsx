"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { dateTime, EmptyState, ErrorState, PageHeader, Pager, SearchForm, StateChip, TableSkeleton, useCursorPages } from "./kit";

export function CustomersPage() {
  const [q, setQ] = useState("");
  const pages = useCursorPages(q);
  const customers = trpc.admin.customers.list.useQuery({ q: q || undefined, cursor: pages.cursor }, { placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Customers" description="Accounts registered with identity-service. Guest shoppers appear only on their orders." />
      <div className="mt-6">
        <SearchForm label="Search customers" placeholder="Name or email" onSearch={setQ} />
      </div>
      <ErrorState className="mt-5" error={customers.error} what="Customers could not be loaded" />
      <div className="mt-5">
        {customers.isPending ? (
          <TableSkeleton />
        ) : customers.data && !customers.data.items.length ? (
          <EmptyState title={q ? "No customers match" : "No customers yet"} body={q ? `Nobody matches “${q}”.` : "Accounts appear here when shoppers register."} />
        ) : customers.data ? (
          <Table className="min-w-[640px]" aria-label="Customers">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email verified</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>
                    <a className="link" href={`mailto:${u.email}`}>
                      {u.email}
                    </a>
                  </TableCell>
                  <TableCell>{u.role === "admin" ? <span className="status status-info">Admin</span> : <span className="text-sm text-stone">Customer</span>}</TableCell>
                  <TableCell>{u.emailVerified ? <StateChip tone="ok">Verified</StateChip> : <StateChip tone="warn">Unverified</StateChip>}</TableCell>
                  <TableCell className="text-sm text-stone tabular">{dateTime(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <Pager page={pages.page} nextCursor={customers.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={customers.isFetching} />
      </div>
    </div>
  );
}
