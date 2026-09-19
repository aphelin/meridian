"use client";

import { useId, useRef, useState } from "react";
import type { ProductDto, VariantDto } from "@meridian/contracts";
import { FieldError } from "@/components/ui/form";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { referenceOf } from "../shop/states";
import { Icon } from "../ui/Icon";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Back-in-stock alert for a sold-out finish: email + Turnstile → `alerts.stock`; notification-service mails on restock. */
export function StockAlertForm({ piece, variant }: { piece: ProductDto; variant: VariantDto }) {
  const id = useId();
  const me = trpc.auth.me.useQuery();
  const [email, setEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const alert = trpc.alerts.stock.useMutation({
    onSuccess: (_data, input) => setDone(input.email),
    // Captcha tokens are single use: ask for a fresh one before the next attempt.
    onError: () => turnstile.current?.reset(),
  });

  const value = email ?? me.data?.email ?? "";
  const invalid = !EMAIL.test(value.trim());

  if (done) {
    return (
      <div className="alert alert-ok mt-5" role="status">
        <Icon name="check" size={18} className="mt-px shrink-0" />
        <span>
          We’ll email <strong className="font-medium break-all">{done}</strong> when {piece.name} in {variant.label.toLowerCase()} is back in stock.
        </span>
      </div>
    );
  }

  return (
    <form
      className="panel mt-5 p-5"
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (invalid) focusFirstInvalid(e.currentTarget);
        if (invalid || !token || alert.isPending) return;
        alert.mutate({ email: value.trim(), sku: variant.sku, slug: piece.slug, captchaToken: token });
      }}
    >
      <p id={`${id}-title`} className="heading">
        Get an email when it’s back
      </p>
      <p className="mt-1.5 text-sm text-stone">
        {variant.label} is sold out. Leave your email and we’ll write once, when it’s restocked.
      </p>
      <label htmlFor={`${id}-email`} className="label mt-4 block">
        Email
      </label>
      <input
        id={`${id}-email`}
        type="email"
        autoComplete="email"
        className="field mt-1.5"
        value={value}
        aria-invalid={(touched && invalid) || undefined}
        aria-describedby={touched && invalid ? `${id}-email-error` : undefined}
        onChange={(e) => setEmail(e.target.value)}
      />
      <FieldError id={`${id}-email-error`}>{touched && invalid ? "Enter a valid email address." : null}</FieldError>
      <Turnstile ref={turnstile} action="stock-alert" onToken={setToken} className="mt-3" />
      {alert.error ? (
        <div className="alert alert-error mt-3" role="alert">
          <span>
            {alert.error.message}
            {referenceOf(alert.error) ? <span className="mt-1 block text-xs tabular break-all">{referenceOf(alert.error)}</span> : null}
          </span>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary mt-4 w-full sm:w-auto" disabled={alert.isPending || !token}>
        {alert.isPending ? (
          <>
            <span className="spinner" aria-hidden="true" /> Sending
          </>
        ) : !token ? (
          "Checking you’re human…"
        ) : (
          "Notify me"
        )}
      </button>
    </form>
  );
}
