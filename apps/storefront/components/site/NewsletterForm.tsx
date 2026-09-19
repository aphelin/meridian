"use client";

import { useId, useRef, useState } from "react";
import { FormError } from "@/components/content/forms";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";

const SERVER_FIELDS = { email: "email" } as const;

/**
 * Footer newsletter sign-up with double opt-in. The Turnstile widget (and Cloudflare's script) only loads once the
 * shopper starts using the form, so ordinary page views never contact Cloudflare. A submit before the check has
 * finished waits for the token and then sends.
 *
 * The field's accessible name deliberately avoids the word "email": account and checkout forms are found by the label
 * "Email", and the footer is on every page.
 */
export function NewsletterForm({ className = "mt-8 max-w-sm" }: { className?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [armed, setArmed] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors({ email }, { email: [rules.required("Enter your email address."), rules.email()] });
  const subscribe = trpc.newsletter.subscribe.useMutation({
    onSuccess: (_, input) => setSentTo(input.email),
    onError: (error) => fields.showServer(fieldErrorsOf(error, SERVER_FIELDS), formRef.current),
    // Turnstile tokens are single use: get a fresh one for the next attempt.
    onSettled: () => turnstile.current?.reset(),
  });

  const send = (token: string) => {
    setQueued(false);
    subscribe.mutate({ email: email.trim(), captchaToken: token });
  };

  const onToken = (token: string | null) => {
    setCaptcha(token);
    // A submit that arrived before the security check finished goes out as soon as the token does.
    if (token && queued && !subscribe.isPending) send(token);
  };

  if (sentTo) {
    return (
      <div className={className}>
        <div className="rounded-[14px] bg-raised p-5 shadow-[inset_0_0_0_1px_var(--color-line)]" role="status">
          <p className="flex items-center gap-2 font-medium">
            <Icon name="check" size={18} />
            Check your inbox
          </p>
          <p className="mt-1.5 text-sm text-stone">
            We sent a confirmation link to <span className="font-medium text-ink break-all">{sentTo}</span>. You’re on the list once you open it. The link
            works for 48 hours.
          </p>
          <p className="mt-2 text-xs text-stone">Demo shop: the email lands in the sandbox mailbox, not a real inbox.</p>
        </div>
        <button
          type="button"
          className="link mt-3 cursor-pointer text-sm"
          onClick={() => {
            subscribe.reset();
            setSentTo(null);
            setEmail("");
            fields.reset();
          }}
        >
          Use a different address
        </button>
      </div>
    );
  }

  const waiting = queued || subscribe.isPending;
  return (
    <form
      ref={formRef}
      className={className}
      aria-label="Newsletter"
      noValidate
      onFocus={() => setArmed(true)}
      onSubmit={(e) => {
        e.preventDefault();
        if (waiting) return;
        setArmed(true);
        if (!fields.check(e.currentTarget)) return;
        if (captcha) send(captcha);
        else setQueued(true);
      }}
    >
      <p className="font-medium">Newsletter</p>
      <p id={`${id}-hint`} className="mt-1 text-sm text-stone">
        Sign up with your email address. We’ll send you a link to confirm it first.
      </p>
      <label htmlFor={id} className="sr-only">
        Your address for the newsletter
      </label>
      <div className="mt-4 flex gap-2">
        <Input
          id={id}
          type="email"
          name="newsletter"
          aria-required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={fields.errors.email ? true : undefined}
          aria-describedby={fields.errors.email ? `${id}-error ${id}-hint` : `${id}-hint`}
          className="!min-h-12 !rounded-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="shrink-0" pending={waiting}>
          Sign up
        </Button>
      </div>
      <FieldError id={`${id}-error`}>{fields.errors.email}</FieldError>
      {armed ? <Turnstile ref={turnstile} action="newsletter-subscribe" onToken={onToken} className="mt-2" /> : null}
      <FormError error={hasErrors(fieldErrorsOf(subscribe.error, SERVER_FIELDS)) ? null : subscribe.error} className="mt-3" />
    </form>
  );
}
