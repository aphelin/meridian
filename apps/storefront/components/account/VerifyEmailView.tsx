"use client";

import type { UserDto } from "@meridian/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { trpc } from "@/lib/trpc";
import { FormError, NarrowPage, codeOf, type ClientError } from "./shared";
import { useOneTimeToken } from "./useOneTimeToken";
import { VerifyBanner } from "./VerifyBanner";

/**
 * One confirmation per token per page load: tokens are single use, and React may mount the page twice in
 * development, so both mounts share the same request.
 */
const attempts = new Map<string, Promise<UserDto>>();

type State = { status: "verifying" } | { status: "verified"; user: UserDto } | { status: "failed"; error: ClientError };

/** Confirms an email address from the emailed link (`?token=`), then offers the way back to the account. */
export function VerifyEmailView({ token: initialToken }: { token: string | null }) {
  const token = useOneTimeToken(initialToken);
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const [state, setState] = useState<State>({ status: "verifying" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let attempt = attempts.get(token);
    if (!attempt) {
      attempt = utils.client.auth.verifyEmail.mutate({ token });
      attempts.set(token, attempt);
    }
    attempt.then(
      (user) => {
        if (!active) return;
        setState({ status: "verified", user });
        void utils.auth.me.invalidate();
      },
      (error: ClientError) => active && setState({ status: "failed", error }),
    );
    return () => {
      active = false;
    };
  }, [token, utils, round]);

  if (!token) {
    return (
      <NarrowPage title="This link isn’t complete">
        <p className="text-center text-stone">Open the confirmation link from your email again. Signed in, you can also ask for a new one from your account.</p>
        <div className="mt-6 grid">
          <Button asChild>
            <Link href="/account">Go to your account</Link>
          </Button>
        </div>
      </NarrowPage>
    );
  }

  if (state.status === "verifying") {
    return (
      <NarrowPage title="Confirming your email">
        <p className="flex items-center justify-center gap-3 text-stone" role="status">
          <span className="spinner" aria-hidden="true" />
          One moment…
        </p>
      </NarrowPage>
    );
  }

  const alreadyVerified = state.status === "failed" && codeOf(state.error) === "TOKEN_INVALID" && me.data?.emailVerified;
  if (state.status === "verified" || alreadyVerified) {
    const email = state.status === "verified" ? state.user.email : me.data?.email;
    return (
      <NarrowPage title="Your email is verified">
        <div className="panel grid place-items-center px-6 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
            <Icon name="check" size={24} />
          </span>
          <p className="mt-4 text-stone" role="status">
            Thanks for confirming <span className="font-medium text-ink">{email}</span>.
          </p>
          <Button asChild className="mt-6">
            <Link href="/account">{me.data ? "Go to your account" : "Sign in"}</Link>
          </Button>
        </div>
      </NarrowPage>
    );
  }

  const code = codeOf(state.error);
  const linkProblem = code === "TOKEN_INVALID" || code === "TOKEN_EXPIRED";
  return (
    <NarrowPage title={code === "TOKEN_EXPIRED" ? "This link has expired" : linkProblem ? "This link doesn’t work any more" : "We couldn’t confirm your email"}>
      <FormError error={state.error} />
      {linkProblem ? null : (
        <div className="mt-4 grid">
          <Button
            type="button"
            onClick={() => {
              attempts.delete(token);
              setState({ status: "verifying" });
              setRound((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {me.data && !me.data.emailVerified ? (
        <VerifyBanner email={me.data.email} />
      ) : me.data ? null : (
        <p className="mt-6 text-center text-stone">
          Sign in and we’ll offer to send you a new link.
        </p>
      )}
      <div className="mt-6 grid">
        <Button asChild variant={me.data && !me.data.emailVerified ? "secondary" : "primary"}>
          <Link href="/account">{me.data ? "Go to your account" : "Sign in"}</Link>
        </Button>
      </div>
    </NarrowPage>
  );
}
