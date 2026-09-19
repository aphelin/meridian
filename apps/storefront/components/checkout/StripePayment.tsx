"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { type Appearance, loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { type FormEvent, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

/**
 * Stripe Payment Element (test mode). The PaymentIntent is created by payment-service when the order is placed; this
 * only collects the payment method and confirms it. The order is confirmed by Stripe's signed webhook, never here.
 */

const loaded = new Map<string, Promise<Stripe | null>>();

/** Stripe.js is loaded once per publishable key, and only with a test key: live Stripe is never initialised here. */
function stripeFor(publishableKey: string): Promise<Stripe | null> {
  if (!publishableKey.startsWith("pk_test_")) return Promise.reject(new Error("Only Stripe test mode is enabled in this shop."));
  let stripe = loaded.get(publishableKey);
  if (!stripe) {
    stripe = loadStripe(publishableKey);
    loaded.set(publishableKey, stripe);
  }
  return stripe;
}

// Meridian tokens (app/globals.css): Albert Sans, raised-paper fields with a 1px strong-hairline inset ring and 12px
// radius, cobalt focus ring, ink primary, brick only for errors.
const INK = "#1b1a17";
const STONE = "#655f57";
const RAISED = "#fffdf9";
const LINE_STRONG = "#d6ccbd";
const COBALT = "#2b47b9";
const BRICK = "#a3321f";

const appearance: Appearance = {
  theme: "stripe",
  labels: "above",
  variables: {
    fontFamily: '"Albert Sans", ui-sans-serif, system-ui, sans-serif',
    fontSizeBase: "16px",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    colorPrimary: INK,
    colorBackground: RAISED,
    colorText: INK,
    colorTextSecondary: STONE,
    colorTextPlaceholder: STONE,
    colorDanger: BRICK,
    colorIcon: STONE,
    borderRadius: "12px",
    spacingUnit: "4px",
    gridRowSpacing: "16px",
    gridColumnSpacing: "12px",
    focusBoxShadow: `inset 0 0 0 2px ${COBALT}`,
    focusOutline: "none",
  },
  rules: {
    ".Label": { fontSize: "0.875rem", fontWeight: "500", color: INK, marginBottom: "6px" },
    ".Input": { border: "none", boxShadow: `inset 0 0 0 1px ${LINE_STRONG}`, padding: "13px 16px", transition: "box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1)" },
    ".Input:hover": { boxShadow: `inset 0 0 0 1px #b8ae9f` },
    ".Input:focus": { boxShadow: `inset 0 0 0 2px ${COBALT}` },
    ".Input--invalid": { boxShadow: `inset 0 0 0 1px ${BRICK}`, color: INK },
    ".Input--invalid:focus": { boxShadow: `inset 0 0 0 2px ${BRICK}` },
    ".Error": { color: BRICK, fontSize: "0.8125rem", marginTop: "6px" },
    ".Tab": { border: "none", boxShadow: `inset 0 0 0 1px ${LINE_STRONG}`, backgroundColor: RAISED },
    ".Tab:hover": { color: INK, boxShadow: `inset 0 0 0 1px #b8ae9f` },
    ".Tab--selected": { boxShadow: `inset 0 0 0 2px ${INK}`, color: INK },
    ".Tab--selected:focus": { boxShadow: `inset 0 0 0 2px ${COBALT}` },
    ".TabIcon--selected": { fill: INK },
    ".Block": { boxShadow: `inset 0 0 0 1px ${LINE_STRONG}`, border: "none" },
  },
};

const FONTS: StripeElementsOptions["fonts"] = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600&display=swap" }];

/** Shopper-safe text for a Stripe.js error: card and validation messages are written for shoppers; others are not. */
function describe(error: { type?: string; message?: string }) {
  if ((error.type === "card_error" || error.type === "validation_error") && error.message) return error.message;
  return "The payment could not be completed. Please try again, or use another test card.";
}

function PaymentForm({ totalCents, returnUrl, email, onPaid }: { totalCents: number; returnUrl: string; email?: string; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: "if_required" });
    if (result.error) {
      setError(describe(result.error));
      setSubmitting(false);
      return;
    }
    const status = result.paymentIntent?.status;
    if (status === "succeeded" || status === "processing" || status === "requires_capture") {
      onPaid();
      return;
    }
    setError("The payment needs another step that didn’t finish. Please try again.");
    setSubmitting(false);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6" aria-busy={!ready || undefined}>
      {!ready && !error ? (
        <div className="alert items-center !py-4 text-[0.9375rem]" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Loading the secure payment form…</span>
        </div>
      ) : null}
      <PaymentElement
        options={{ layout: "tabs", ...(email ? { defaultValues: { billingDetails: { email } } } : {}) }}
        onReady={() => setReady(true)}
        onLoadError={() => setError("The payment form could not load. Check your connection and reload the page.")}
      />
      {error ? <Alert className="mt-6">{error}</Alert> : null}
      <Button type="submit" className="mt-6 w-full" pending={submitting} disabled={!stripe || !elements || !ready}>
        Pay {money(totalCents)}
      </Button>
    </form>
  );
}

export function StripePayment({
  stripe,
  totalCents,
  returnUrl,
  email,
  onPaid,
}: {
  stripe: { clientSecret: string; publishableKey: string };
  totalCents: number;
  returnUrl: string;
  email?: string;
  onPaid: () => void;
}) {
  const [promise] = useState(() => stripeFor(stripe.publishableKey).catch(() => null));
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    void promise.then((loadedStripe) => live && !loadedStripe && setUnavailable(true));
    return () => {
      live = false;
    };
  }, [promise]);
  if (unavailable) return <Alert className="mt-6">The secure payment form could not load. Check your connection and reload the page.</Alert>;
  return (
    <Elements stripe={promise} options={{ clientSecret: stripe.clientSecret, appearance, fonts: FONTS, loader: "never" }}>
      <PaymentForm totalCents={totalCents} returnUrl={returnUrl} email={email} onPaid={onPaid} />
    </Elements>
  );
}
