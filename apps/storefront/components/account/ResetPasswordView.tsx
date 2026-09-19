"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors } from "@/lib/validation";
import { BackToSignIn, FormError, MIN_PASSWORD, NarrowPage, newPasswordRules, passwordEntered, PasswordField, Success, codeOf } from "./shared";

const SERVER_FIELDS = { password: "password" } as const;
import { useOneTimeToken } from "./useOneTimeToken";

/** Chooses a new password from an emailed one-time link (`?token=`). */
export function ResetPasswordView({ token: initialToken }: { token: string | null }) {
  const token = useOneTimeToken(initialToken);
  const utils = trpc.useUtils();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors(
    { password, confirm },
    {
      password: newPasswordRules("Enter a new password."),
      confirm: [passwordEntered("Enter the new password again."), (value) => (value === password ? null : "The passwords don’t match.")],
    },
  );
  const reset = trpc.auth.resetPassword.useMutation({
    // Every session was revoked by the reset, including one in this browser.
    onSuccess: () => utils.auth.me.invalidate(),
    onError: (error) => fields.showServer(fieldErrorsOf(error, SERVER_FIELDS), formRef.current),
  });

  if (!token) {
    return (
      <NarrowPage title="This link isn’t complete">
        <p className="text-center text-stone">Open the reset link from your email again, or request a new one.</p>
        <div className="mt-6 grid">
          <Button asChild>
            <Link href="/account/forgot-password">Request a new link</Link>
          </Button>
        </div>
        <BackToSignIn />
      </NarrowPage>
    );
  }

  if (reset.isSuccess) {
    return (
      <NarrowPage title="Password updated">
        <Success>Your password has been reset and you’ve been signed out everywhere. Sign in with your new password.</Success>
        <div className="mt-6 grid">
          <Button asChild>
            <Link href="/account">Sign in</Link>
          </Button>
        </div>
      </NarrowPage>
    );
  }

  const code = codeOf(reset.error);
  const linkProblem = code === "TOKEN_INVALID" || code === "TOKEN_EXPIRED";

  return (
    <NarrowPage title="Choose a new password" lede="Pick something you don’t use anywhere else.">
      <form
        ref={formRef}
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (reset.isPending || !fields.check(e.currentTarget)) return;
          reset.mutate({ token, password });
        }}
      >
        <PasswordField
          label="New password"
          autoComplete="new-password"
          aria-required
          maxLength={256}
          value={password}
          error={fields.errors.password}
          onChange={(v) => {
            setPassword(v);
            if (reset.isError && !linkProblem) reset.reset();
          }}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          aria-required
          maxLength={256}
          value={confirm}
          onChange={setConfirm}
          error={fields.errors.confirm}
        />
        <FormError error={hasErrors(fieldErrorsOf(reset.error, SERVER_FIELDS)) ? null : reset.error}>
          {linkProblem ? (
            <>
              {reset.error?.message}{" "}
              <Link href="/account/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </>
          ) : undefined}
        </FormError>
        <Button type="submit" className="w-full" pending={reset.isPending} disabled={linkProblem}>
          Reset password
        </Button>
      </form>
      <BackToSignIn />
    </NarrowPage>
  );
}
