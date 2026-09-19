"use client";

import type { OrderDto } from "@meridian/contracts";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { referenceOf } from "./ErrorState";

/**
 * Downloads the issued invoice. The BFF returns a presigned link valid for five minutes (served as an attachment),
 * so it is fetched on click and followed straight away; the shop page stays where it is.
 */
export function InvoiceButton({ order, access }: { order: OrderDto; access?: string }) {
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; reference: string | null } | null>(null);

  if (!order.invoice) return null;

  return (
    <div className="grid gap-2.5">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        pending={pending}
        onClick={async () => {
          setError(null);
          setPending(true);
          try {
            const link = await utils.orders.invoice.fetch({ id: order.id, access }, { staleTime: 0, gcTime: 0 });
            if (!/^https?:\/\//.test(link.url)) throw new Error("Unexpected invoice link.");
            const anchor = document.createElement("a");
            anchor.href = link.url;
            anchor.rel = "noopener noreferrer";
            anchor.download = `${order.invoice?.number ?? "invoice"}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          } catch (e) {
            const err = e as Parameters<typeof errorMessage>[0];
            setError({ message: errorMessage(err) ?? "The invoice could not be downloaded.", reference: referenceOf(err) });
          } finally {
            setPending(false);
          }
        }}
      >
        Download invoice {order.invoice.number}
      </Button>
      {error ? <Alert reference={error.reference}>{error.message}</Alert> : null}
    </div>
  );
}
