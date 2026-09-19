"use client";

import type { OrderDto, ReturnDto } from "@meridian/contracts";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/form";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Textarea } from "@/components/ui/textarea";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { ErrorAlert } from "./ErrorState";

/** Quantity of each SKU still returnable: purchased minus open, approved or refunded returns (rejected ones don't count). */
export function returnableQty(order: OrderDto): Map<string, number> {
  const taken = new Map<string, number>();
  for (const r of order.returns) {
    if (r.status === "rejected") continue;
    for (const l of r.lines) taken.set(l.sku, (taken.get(l.sku) ?? 0) + l.qty);
  }
  return new Map(order.lines.map((l) => [l.sku, Math.max(0, l.qty - (taken.get(l.sku) ?? 0))]));
}

const SERVER_FIELDS = { reason: "reason", lines: "pieces" } as const;

/** Line and quantity picker plus a reason. Orders can be returned within 30 days of delivery. */
export function ReturnRequestDialog({ order, access, onRequested }: { order: OrderDto; access?: string; onRequested: (ret: ReturnDto) => void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const piecesId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const returnable = returnableQty(order);
  const lines = order.lines.filter((l) => (returnable.get(l.sku) ?? 0) > 0);
  const chosen = Object.entries(picked).filter(([, qty]) => qty > 0);
  const fields = useFieldErrors(
    { pieces: chosen.length ? "chosen" : "", reason },
    { pieces: [rules.required("Choose at least one piece to return.")], reason: [rules.required("Tell us why you’re returning it.")] },
  );
  const request = trpc.orders.requestReturn.useMutation({ onError: (error) => fields.showServer(fieldErrorsOf(error, SERVER_FIELDS), formRef.current) });

  if (!lines.length) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          request.reset();
          fields.reset();
        }
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="secondary">
          Request a return
        </Button>
      </DialogPrimitive.Trigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-8">
        <DialogTitle>Request a return</DialogTitle>
        <DialogDescription className="mt-2 !text-[0.9375rem]">Pick the pieces and quantities to send back. We refund them once the return is approved.</DialogDescription>
        <form
          ref={formRef}
          className="mt-6 grid gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (request.isPending || !fields.check(e.currentTarget)) return;
            request.mutate(
              { id: order.id, access, reason: reason.trim(), lines: chosen.map(([sku, qty]) => ({ sku, qty })) },
              {
                onSuccess: (ret) => {
                  setOpen(false);
                  setPicked({});
                  setReason("");
                  onRequested(ret);
                },
              },
            );
          }}
        >
          <fieldset>
            <legend className="label">Pieces to return</legend>
            <ul className="divide-y divide-line border-y border-line">
              {lines.map((line) => {
                const max = returnable.get(line.sku) ?? 0;
                const qty = picked[line.sku] ?? 0;
                const checkboxId = `return-${line.sku}`;
                return (
                  <li key={line.sku} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <Checkbox
                      id={checkboxId}
                      checked={qty > 0}
                      onCheckedChange={(checked) => setPicked((p) => ({ ...p, [line.sku]: checked === true ? 1 : 0 }))}
                      aria-label={`Return ${line.productName}, ${line.variantLabel}`}
                      aria-invalid={fields.errors.pieces ? true : undefined}
                      aria-describedby={fields.errors.pieces ? `${piecesId}-error` : undefined}
                    />
                    <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block font-medium">{line.productName}</span>
                      <span className="block text-sm text-stone">
                        {line.variantLabel} · {max} returnable
                      </span>
                    </label>
                    {qty > 0 && max > 1 ? (
                      <QtyStepper size="sm" label={`${line.productName} return quantity`} value={qty} min={1} max={max} onChange={(n) => setPicked((p) => ({ ...p, [line.sku]: n }))} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <FieldError id={`${piecesId}-error`}>{fields.errors.pieces}</FieldError>
          </fieldset>
          <div>
            <label htmlFor={reasonId} className="label">
              Reason for the return
            </label>
            <Textarea
              id={reasonId}
              aria-required
              maxLength={1000}
              placeholder="The colour doesn’t work in the room"
              value={reason}
              aria-invalid={fields.errors.reason ? true : undefined}
              aria-describedby={fields.errors.reason ? `${reasonId}-error` : undefined}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldError id={`${reasonId}-error`}>{fields.errors.reason}</FieldError>
          </div>
          <ErrorAlert error={hasErrors(fieldErrorsOf(request.error, SERVER_FIELDS)) ? null : request.error} />
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Not now
              </Button>
            </DialogClose>
            <Button type="submit" pending={request.isPending}>
              Send return request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
