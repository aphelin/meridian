"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { BackToSignIn, FormError, NarrowPage, Success, TextField } from "./shared";

const SERVER_FIELDS = { email: "email" } as const;

/**
 * Requests a password reset link. The answer is the same whether or not an account exists, so the page never reveals
 * which emails are registered.
 */
export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors({ email }, { email: [rules.required("Enter your email address."), rules.email()] });
  const forgot = trpc.auth.forgotPassword.useMutation({
    onSuccess: (_, input) => setSentTo(input.email),
    onError: (error) => fields.showServer(fieldErrorsOf(error, SERVER_FIELDS), formRef.current),
    onSettled: () => turnstile.current?.reset(),
  });

  if (sentTo) {
    return (
      <NarrowPage title="Check your inbox">
        <Success>
          If an account exists for <span className="font-medium">{sentTo}</span>, we’ve sent a link to reset your password. It works once and expires in one
          hour.
        </Success>
        <p className="mt-6 text-center text-sm text-stone">
          Nothing arrived? Check your spam folder, or{" "}
          <button
            type="button"
            className="link cursor-pointer"
            onClick={() => {
              forgot.reset();
              setSentTo(null);
            }}
          >
            try another email
          </button>
          .
        </p>
        <BackToSignIn />
      </NarrowPage>
    );
  }

  return (
    <NarrowPage title="Forgot your password?" lede="Enter the email you shop with and we’ll send you a link to choose a new one.">
      <form
        ref={formRef}
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!captcha || forgot.isPending || !fields.check(e.currentTarget)) return;
          forgot.mutate({ email: email.trim(), captchaToken: captcha });
        }}
      >
        <TextField label="Email" type="email" autoComplete="email" aria-required maxLength={254} value={email} onChange={setEmail} error={fields.errors.email} />
        <Turnstile ref={turnstile} action="forgot-password" onToken={setCaptcha} />
        {hasErrors(fieldErrorsOf(forgot.error, SERVER_FIELDS)) ? null : <FormError error={forgot.error} />}
        <Button type="submit" className="w-full" pending={forgot.isPending} disabled={!captcha}>
          Send reset link
        </Button>
      </form>
      <BackToSignIn />
    </NarrowPage>
  );
}
