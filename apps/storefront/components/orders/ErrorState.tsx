"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { errorMessage } from "@/lib/errors";

type ClientError = { message: string; data?: { code?: string; status?: number; correlationId?: string; details?: unknown } | null } | null | undefined;

/** "Reference: <correlationId>" for any BFF error, so a shopper can quote it to support. */
export function referenceOf(error: ClientError): string | null {
  const id = error?.data?.correlationId;
  return id && id !== "unknown" ? `Reference: ${id}` : null;
}

/** Inline error alert for a failed mutation or query: the shopper-safe message plus the request reference. */
export function ErrorAlert({ error, className, children }: { error: ClientError; className?: string; children?: ReactNode }) {
  if (!error) return null;
  return (
    <Alert className={className} reference={referenceOf(error)}>
      {children ?? errorMessage(error)}
    </Alert>
  );
}

/** Full-panel error state for a data view that could not load. */
export function ErrorState({
  title,
  error,
  description,
  action,
  onRetry,
  headingLevel = "h1",
}: {
  title: string;
  error: ClientError;
  description?: ReactNode;
  action?: { href: string; label: string };
  onRetry?: () => void;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  const reference = referenceOf(error);
  return (
    <div className="panel grid place-items-center px-6 py-16 text-center sm:py-20" role="alert">
      <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
        <Icon name="info" size={24} />
      </span>
      <Heading className="heading mt-5">{title}</Heading>
      <p className="mt-2 max-w-[46ch] text-stone">{description ?? errorMessage(error) ?? "Something went wrong on our side."}</p>
      {reference ? <p className="mt-2 text-sm text-stone tabular">{reference}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {onRetry ? (
          <Button type="button" variant={action ? "secondary" : "primary"} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {action ? (
          <Button asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
