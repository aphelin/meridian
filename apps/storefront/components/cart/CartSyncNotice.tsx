"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { retryCartSync, useCartSyncStatus } from "@/lib/sync";

/** A quiet note while the device cart can't be saved to the server cart, with a retry action. */
export function CartSyncNotice({ className }: { className?: string }) {
  const status = useCartSyncStatus();
  const [pending, setPending] = useState(false);
  if (status.state !== "error") return null;
  return (
    <Alert role="status" className={cn("text-sm", className)} reference={status.correlationId ? `Reference: ${status.correlationId}` : null}>
      <p>{status.retryable ? "Couldn’t save your cart to your account. Retrying…" : `Couldn’t save your cart to your account. ${status.message}`}</p>
      <button
        type="button"
        className="mt-1 font-medium underline underline-offset-4 disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void retryCartSync().finally(() => setPending(false));
        }}
      >
        {pending ? "Trying again…" : "Try again now"}
      </button>
    </Alert>
  );
}
