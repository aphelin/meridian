import type { Metadata } from "next";
import { NewsletterConfirmView } from "@/components/content/NewsletterTokenView";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  description: "Confirm your Meridian newsletter subscription.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function NewsletterConfirmPage({ searchParams }: { searchParams: Search }) {
  const token = (await searchParams).token;
  return <NewsletterConfirmView token={typeof token === "string" && token.trim() ? token.trim() : null} />;
}
