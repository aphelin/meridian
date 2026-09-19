import type { Metadata } from "next";
import { ResetPasswordView } from "@/components/account/ResetPasswordView";

// The one-time token is in the URL: never send it to another origin in a Referer header.
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Search }) {
  const token = (await searchParams).token;
  return <ResetPasswordView token={typeof token === "string" && token.trim() ? token.trim() : null} />;
}
