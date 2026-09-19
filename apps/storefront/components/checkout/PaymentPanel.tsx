"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorAlert } from "@/components/orders/ErrorState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { openPaddleSandboxCheckout } from "./paddle";
import { forgetIntent, type StoredIntent } from "./payment-intent";
import { StripePayment } from "./StripePayment";

const time = new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit" });

/**
 * Pays a placed order without real money. Stripe test mode renders the Payment Element; the retained Paddle sandbox
 * adapter opens the Paddle.js overlay; the local sandbox (no provider keys) completes through `checkout.sandboxPay`.
 * Every way the order is confirmed asynchronously (webhook or command), so the shopper lands on the order page, which
 * polls until it is paid.
 */
export function PaymentPanel({ stored, className, onPaid }: { stored: StoredIntent; className?: string; onPaid?: () => void }) {
  const router = useRouter();
  const pay = trpc.checkout.sandboxPay.useMutation();
  const [paddleError, setPaddleError] = useState<string | null>(null);
  const [paddleOpening, setPaddleOpening] = useState(false);
  const detach = useRef<(() => void) | null>(null);
  const { intent, orderId, totalCents } = stored;
  const orderUrl = `/orders/${orderId}?paid=1`;
  const stripe = intent.stripe ?? null;

  useEffect(() => () => detach.current?.(), []);

  const finish = () => {
    forgetIntent(orderId);
    if (onPaid) onPaid();
    else router.push(orderUrl);
  };

  const openPaddle = async () => {
    if (!intent.paddle) return;
    setPaddleError(null);
    setPaddleOpening(true);
    try {
      detach.current?.();
      detach.current = await openPaddleSandboxCheckout({
        paddle: intent.paddle,
        email: stored.email,
        onEvent: (event) => {
          if (event.name === "checkout.loaded" || event.name === "checkout.closed") setPaddleOpening(false);
          if (event.name === "checkout.completed") finish();
          if (event.name === "checkout.error" || event.name === "checkout.failed") setPaddleError("The payment did not go through. Try again or use another sandbox test card.");
        },
      });
    } catch (e) {
      setPaddleOpening(false);
      setPaddleError(e instanceof Error ? e.message : "The Paddle checkout could not load.");
    }
  };

  const busy = pay.isPending || pay.isSuccess;

  return (
    <div className={`panel p-6 sm:p-8 ${className ?? ""}`}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-paper" aria-hidden="true">
          <Icon name="info" />
        </span>
        <div>
          <h2 className="font-medium">{stripe ? "Card payment (Stripe test mode)" : intent.paddle ? "Paddle sandbox payment" : "Sandbox payment"}</h2>
          <p className="mt-1 text-stone">
            {stripe ? (
              <>
                Pay with a Stripe test card such as <span className="tabular">4242 4242 4242 4242</span>, any future expiry and any CVC. Nothing is charged, and the order is
                confirmed when Stripe’s webhook arrives.
              </>
            ) : intent.paddle ? (
              "Pay with a Paddle sandbox test card. Nothing is charged, and the order is confirmed when Paddle’s webhook arrives."
            ) : (
              "No card needed and nothing is charged. The order is confirmed asynchronously, like a real payment webhook."
            )}
          </p>
          {stored.deadline ? (
            <p className="mt-2 text-sm text-stone">
              The pieces are reserved until <span className="tabular">{time.format(new Date(stored.deadline))}</span>.
            </p>
          ) : null}
        </div>
      </div>

      <ErrorAlert className="mt-6" error={pay.error}>
        {pay.error?.data?.status === 403 || pay.error?.data?.status === 404 ? "This payment can’t be completed from here any more. Open the order to check its status." : undefined}
      </ErrorAlert>
      {paddleError ? <Alert className="mt-6">{paddleError}</Alert> : null}

      {stripe ? (
        <StripePayment
          stripe={stripe}
          totalCents={totalCents}
          email={stored.email}
          returnUrl={typeof window === "undefined" ? orderUrl : new URL(orderUrl, window.location.origin).toString()}
          onPaid={finish}
        />
      ) : intent.paddle ? (
        <Button type="button" className="mt-6 w-full" pending={paddleOpening} onClick={() => void openPaddle()}>
          Pay {money(totalCents)} with Paddle sandbox
        </Button>
      ) : intent.clientSecret ? (
        <Button
          type="button"
          className="mt-6 w-full"
          pending={busy}
          onClick={() => pay.mutate({ transactionId: intent.transactionId, clientSecret: intent.clientSecret! }, { onSuccess: finish })}
        >
          Pay {money(totalCents)} in sandbox
        </Button>
      ) : (
        <Button asChild className="mt-6 w-full">
          <Link href={`/orders/${orderId}`}>View order</Link>
        </Button>
      )}
    </div>
  );
}
