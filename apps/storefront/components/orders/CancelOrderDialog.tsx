"use client";

import type { OrderDto } from "@meridian/contracts";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ErrorAlert } from "./ErrorState";

/** Cancel with a confirm dialog. Placed orders release the reservation; paid orders are refunded in full. */
export function CancelOrderDialog({ order, access, onCancelled }: { order: OrderDto; access?: string; onCancelled: (order: OrderDto) => void }) {
  const [open, setOpen] = useState(false);
  const cancel = trpc.orders.cancel.useMutation();
  const paid = order.status !== "placed";
  const refundable = order.pricing.totalCents - order.refundedCents;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="secondary">
          Cancel order
        </Button>
      </DialogPrimitive.Trigger>
      <DialogContent className="p-6 sm:p-8">
        <DialogTitle>Cancel order {order.number}?</DialogTitle>
        <DialogDescription className="mt-2 !text-[0.9375rem]">
          {paid
            ? `The order stops here and ${money(refundable)} is refunded to your test payment. This can’t be undone.`
            : "The order stops here and the reserved pieces go back on sale. Nothing was charged. This can’t be undone."}
        </DialogDescription>
        <ErrorAlert className="mt-5" error={cancel.error} />
        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Keep order
            </Button>
          </DialogClose>
          <Button
            type="button"
            pending={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { id: order.id, access },
                {
                  onSuccess: (next) => {
                    setOpen(false);
                    onCancelled(next);
                  },
                },
              )
            }
          >
            Yes, cancel order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
