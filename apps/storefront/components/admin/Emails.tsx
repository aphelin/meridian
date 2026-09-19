"use client";

import type { EmailDeliveryDto, EmailTemplate } from "@meridian/contracts";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { CopyValue, dateTime, EmptyState, ErrorState, FilterSelect, PageHeader, Pager, StateChip, TableSkeleton, useCursorPages } from "./kit";

type DeliveryStatus = EmailDeliveryDto["status"];

const STATUS_OPTIONS: { value: DeliveryStatus; label: string }[] = [
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed, retrying" },
  { value: "dead-lettered", label: "Dead-lettered" },
  { value: "suppressed", label: "Suppressed" },
];

const TEMPLATES: EmailTemplate[] = [
  "verify-email",
  "password-reset",
  "password-changed",
  "account-deleted",
  "order-confirmation",
  "order-shipped",
  "order-delivered",
  "order-cancelled",
  "order-refunded",
  "return-received",
  "return-approved",
  "return-rejected",
  "invoice-issued",
  "newsletter-confirm",
  "newsletter-welcome",
  "contact-received",
  "contact-internal",
  "back-in-stock",
];

const TEMPLATE_OPTIONS = TEMPLATES.map((t) => ({ value: t, label: t }));

function statusTone(status: DeliveryStatus) {
  return status === "sent" ? "ok" : status === "dead-lettered" ? "error" : status === "failed" || status === "queued" ? "warn" : "muted";
}

export function EmailsPage() {
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [template, setTemplate] = useState<EmailTemplate | "all">("all");
  const pages = useCursorPages(`${status}|${template}`);
  const emails = trpc.admin.emails.list.useQuery(
    { status: status === "all" ? undefined : status, template: template === "all" ? undefined : template, cursor: pages.cursor },
    { placeholderData: keepPreviousData, refetchInterval: 10_000 },
  );

  return (
    <div>
      <PageHeader
        title="Emails"
        description={
          <>
            Every <code className="font-sans font-medium">notification.send-email</code> command and what happened to it. Dead-lettered sends can be replayed from the{" "}
            <Link href="/admin/system" className="link">
              System page
            </Link>
            .
          </>
        }
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <FilterSelect label="Delivery status" value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" />
        <FilterSelect label="Template" value={template} onChange={setTemplate} options={TEMPLATE_OPTIONS} allLabel="All templates" className="min-w-52" />
      </div>
      <ErrorState className="mt-5" error={emails.error} what="The delivery log could not be loaded" />
      <div className="mt-5">
        {emails.isPending ? (
          <TableSkeleton />
        ) : emails.data && !emails.data.items.length ? (
          <EmptyState title="No emails match" body={status !== "all" || template !== "all" ? "Try another status or template." : "Sent emails are logged here."} />
        ) : emails.data ? (
          <Table className="min-w-[980px]" aria-label="Email deliveries">
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>To and subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Correlation id</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.data.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm font-medium">{e.template}</TableCell>
                  <TableCell className="max-w-[22rem]">
                    <p className="truncate">{e.to}</p>
                    <p className="truncate text-sm text-stone" title={e.subject}>
                      {e.subject}
                    </p>
                    {e.lastError ? (
                      <p className="truncate text-[0.8125rem] text-brick" title={e.lastError}>
                        {e.lastError}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StateChip tone={statusTone(e.status)}>{STATUS_OPTIONS.find((s) => s.value === e.status)?.label ?? e.status}</StateChip>
                  </TableCell>
                  <TableCell className="text-right tabular">{e.attempts}</TableCell>
                  <TableCell className="max-w-[12rem]">{e.correlationId ? <CopyValue value={e.correlationId} label="correlation id" /> : "—"}</TableCell>
                  <TableCell className="text-sm text-stone tabular">
                    {dateTime(e.createdAt)}
                    {e.sentAt ? <span className="block">sent {dateTime(e.sentAt)}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        <Pager page={pages.page} nextCursor={emails.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={emails.isFetching} />
      </div>
    </div>
  );
}

const TOPICS: Record<string, string> = { order: "An order", product: "A product", returns: "Returns", other: "Something else" };

export function ContactMessagesPage() {
  const pages = useCursorPages("messages");
  const messages = trpc.admin.contactMessages.list.useQuery({ cursor: pages.cursor }, { placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="Messages" description="Messages sent from the contact page, newest first. The sender also got a confirmation email." />
      <ErrorState className="mt-5" error={messages.error} what="Messages could not be loaded" />
      <div className="mt-6">
        {messages.isPending ? (
          <TableSkeleton rows={4} />
        ) : messages.data && !messages.data.items.length ? (
          <EmptyState title="No messages yet" body="Messages from the contact form appear here." />
        ) : messages.data ? (
          <ul className="grid gap-3" aria-label="Contact messages">
            {messages.data.items.map((m) => (
              <li key={m.id} className="rounded-[16px] border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-stone">
                      <a className="link" href={`mailto:${m.email}`}>
                        {m.email}
                      </a>
                      {m.orderNumber ? <span className="tabular"> · order {m.orderNumber}</span> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone">
                    <StateChip tone="muted">{TOPICS[m.topic] ?? m.topic}</StateChip>
                    <span className="tabular">{dateTime(m.createdAt)}</span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-[0.9375rem]">{m.message}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <Pager page={pages.page} nextCursor={messages.data?.nextCursor} onNext={pages.next} onPrevious={pages.previous} busy={messages.isFetching} />
      </div>
    </div>
  );
}
