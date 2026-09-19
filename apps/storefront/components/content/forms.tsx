"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { errorMessage } from "@/lib/errors";

/** Error shape of a tRPC client error from the BFF (data carries the contracts code, status and correlation id). */
export type ClientError = { message: string; data?: { code?: string; status?: number; correlationId?: string; details?: unknown } | null } | null | undefined;

export const codeOf = (error: ClientError) => error?.data?.code;

/** "Reference: <correlationId>" so a shopper can quote the failed request to support. */
export function referenceOf(error: ClientError): string | null {
  const id = error?.data?.correlationId;
  return id && id !== "unknown" ? `Reference: ${id}` : null;
}

/** Shopper-facing text for an error from the newsletter and contact procedures. */
export function friendlyMessage(error: ClientError): string {
  switch (codeOf(error)) {
    case "RATE_LIMITED":
      return "That’s a lot of requests for one address. Please wait a while and try again.";
    case "CAPTCHA_INVALID":
    case "CAPTCHA_REQUIRED":
      return "The security check didn’t go through. Wait a moment for it to finish, then try again.";
    case "CAPTCHA_UNAVAILABLE":
      return "The security check is unavailable right now. Please try again in a minute.";
    default: {
      const status = error?.data?.status ?? 500;
      return status >= 500 ? "Something went wrong on our side. Please try again." : (errorMessage(error) ?? "Please check the form and try again.");
    }
  }
}

/** Inline form error. Every failure carries its request reference when the BFF sent one. */
export function FormError({ error, className }: { error: ClientError; className?: string }) {
  if (!error) return null;
  return (
    <Alert className={className} reference={referenceOf(error)}>
      {friendlyMessage(error)}
    </Alert>
  );
}

/**
 * Keeps an emailed one-time token in memory and removes it from the address bar once read, so it doesn't linger in
 * history, screenshots or bookmarks.
 */
export function useOneTimeToken(initial: string | null): string | null {
  const [token] = useState(initial);
  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [token]);
  return token;
}
