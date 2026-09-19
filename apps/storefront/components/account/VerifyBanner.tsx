"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { trpc } from "@/lib/trpc";
import { FormError } from "./shared";

/** Shown while the shopper's email is unconfirmed: explains why, and resends the link (Turnstile protected). */
export function VerifyBanner({ email }: { email: string }) {
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const resend = trpc.auth.resendVerification.useMutation({ onSettled: () => turnstile.current?.reset() });

  return (
    <section aria-labelledby="verify-title" className="panel mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-paper" aria-hidden="true">
        <Icon name="info" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="verify-title" className="font-medium">
          Verify your email address
        </h2>
        <p className="mt-1 text-sm text-stone">
          We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Open it to confirm this address is yours. Links expire after
          24 hours.
        </p>
        {resend.isSuccess ? (
          <p className="alert alert-ok mt-3" role="status">
            <Icon name="check" size={18} className="mt-0.5 shrink-0" />
            <span>We sent a new link. Earlier links no longer work.</span>
          </p>
        ) : null}
        <FormError error={resend.error} className="mt-3" />
        <Turnstile ref={turnstile} action="resend-verification" onToken={setCaptcha} />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        pending={resend.isPending}
        disabled={!captcha}
        onClick={() => captcha && resend.mutate({ captchaToken: captcha })}
      >
        Resend verification email
      </Button>
    </section>
  );
}
