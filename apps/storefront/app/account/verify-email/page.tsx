import type { Metadata } from "next";
import { VerifyEmailView } from "@/components/account/VerifyEmailView";

// The one-time token is in the URL: never send it to another origin in a Referer header.
export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: Search }) {
  const token = (await searchParams).token;
  return <VerifyEmailView token={typeof token === "string" && token.trim() ? token.trim() : null} />;
}
