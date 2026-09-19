"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { trpc } from "@/lib/trpc";
import { codeOf, friendlyMessage, referenceOf, useOneTimeToken, type ClientError } from "./forms";

/** Centred narrow page for the emailed newsletter links. */
function TokenPage({ title, icon, children }: { title: string; icon?: "check" | "info" | "spinner"; children: ReactNode }) {
  return (
    <main className="shell grid place-items-center pb-24 pt-12 md:pt-20">
      <div className="w-full max-w-[480px] text-center">
        {icon ? (
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-plaster" aria-hidden="true">
            {icon === "spinner" ? <span className="spinner" /> : <Icon name={icon} size={24} />}
          </span>
        ) : null}
        <h1 className="title mt-6">{title}</h1>
        <div className="mt-4 text-stone">{children}</div>
      </div>
    </main>
  );
}

function ShopLink({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Button asChild variant={variant} className="mt-8">
      <Link href="/shop">Continue shopping</Link>
    </Button>
  );
}

/** For links that no longer work: explain, then offer a fresh confirmation link right there. */
function RequestNewLink({ lede }: { lede: string }) {
  return (
    <>
      <p>{lede}</p>
      <div className="panel mt-8 p-5 text-left md:p-6">
        <NewsletterForm className="" />
      </div>
    </>
  );
}

function ServerError({ error, onRetry }: { error: ClientError; onRetry: () => void }) {
  const reference = referenceOf(error);
  return (
    <>
      <Alert className="mt-2 text-left" reference={reference}>
        {friendlyMessage(error)}
      </Alert>
      <Button type="button" className="mt-6" onClick={onRetry}>
        Try again
      </Button>
    </>
  );
}

const MISSING = "This link isn’t complete";

/**
 * One confirmation request per token per page load: tokens are single use and React may mount the view twice in
 * development, so both mounts share the same request.
 */
const confirmations = new Map<string, Promise<unknown>>();

type ConfirmState = { status: "confirming" } | { status: "confirmed" } | { status: "failed"; error: ClientError };

/** `/newsletter/confirm?token=`: confirms the double opt-in as soon as the page opens. */
export function NewsletterConfirmView({ token: initial }: { token: string | null }) {
  const token = useOneTimeToken(initial);
  const utils = trpc.useUtils();
  const [state, setState] = useState<ConfirmState>({ status: "confirming" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    let attempt = confirmations.get(token);
    if (!attempt) {
      attempt = utils.client.newsletter.confirm.mutate({ token });
      confirmations.set(token, attempt);
    }
    attempt.then(
      () => active && setState({ status: "confirmed" }),
      (error: ClientError) => active && setState({ status: "failed", error }),
    );
    return () => {
      active = false;
    };
  }, [token, utils, round]);

  if (!token) {
    return (
      <TokenPage title={MISSING} icon="info">
        <RequestNewLink lede="Open the link from your confirmation email again, or ask for a new one below." />
      </TokenPage>
    );
  }

  if (state.status === "confirming") {
    return (
      <TokenPage title="Confirming your subscription" icon="spinner">
        <p role="status">One moment…</p>
      </TokenPage>
    );
  }

  if (state.status === "confirmed") {
    return (
      <TokenPage title="You’re subscribed" icon="check">
        <p role="status">Thanks for confirming. We’ve sent you a welcome email, and it has a link to unsubscribe if you change your mind.</p>
        <ShopLink />
      </TokenPage>
    );
  }

  const code = codeOf(state.error);
  if (code === "TOKEN_EXPIRED") {
    return (
      <TokenPage title="This link has expired" icon="info">
        <RequestNewLink lede="Confirmation links work for 48 hours. Enter your address and we’ll send a fresh one." />
      </TokenPage>
    );
  }
  if (code === "TOKEN_INVALID" || code === "VALIDATION_FAILED") {
    return (
      <TokenPage title="This link doesn’t work any more" icon="info">
        <RequestNewLink lede="It may have been used already, or replaced by a newer link. If you haven’t confirmed yet, ask for a new one." />
      </TokenPage>
    );
  }
  return (
    <TokenPage title="We couldn’t confirm your subscription">
      <ServerError
        error={state.error}
        onRetry={() => {
          confirmations.delete(token);
          setState({ status: "confirming" });
          setRound((n) => n + 1);
        }}
      />
    </TokenPage>
  );
}

/** `/newsletter/unsubscribe?token=`: asks for one click, so a link preview or an accidental tap never unsubscribes. */
export function NewsletterUnsubscribeView({ token: initial }: { token: string | null }) {
  const token = useOneTimeToken(initial);
  const unsubscribe = trpc.newsletter.unsubscribe.useMutation();

  if (!token) {
    return (
      <TokenPage title={MISSING} icon="info">
        <p>Open the unsubscribe link from one of our emails again. Nothing has changed with your subscription.</p>
        <ShopLink variant="secondary" />
      </TokenPage>
    );
  }

  if (unsubscribe.isSuccess) {
    return (
      <TokenPage title="You’re unsubscribed" icon="check">
        <p role="status">We won’t send you the newsletter any more. Changed your mind? You can sign up again from the bottom of any page.</p>
        <ShopLink />
      </TokenPage>
    );
  }

  const code = codeOf(unsubscribe.error);
  if (code === "TOKEN_INVALID" || code === "VALIDATION_FAILED") {
    return (
      <TokenPage title="This link doesn’t work any more" icon="info">
        <p>It may belong to an older subscription. Use the unsubscribe link in your most recent newsletter email instead.</p>
        <ShopLink variant="secondary" />
      </TokenPage>
    );
  }

  return (
    <TokenPage title="Unsubscribe from the newsletter?">
      <p>You’ll stop getting the Meridian newsletter. Order and account emails aren’t affected.</p>
      {unsubscribe.error ? (
        <Alert className="mt-6 text-left" reference={referenceOf(unsubscribe.error)}>
          {friendlyMessage(unsubscribe.error)}
        </Alert>
      ) : null}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" pending={unsubscribe.isPending} onClick={() => unsubscribe.mutate({ token })}>
          Unsubscribe
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Keep me subscribed</Link>
        </Button>
      </div>
    </TokenPage>
  );
}
