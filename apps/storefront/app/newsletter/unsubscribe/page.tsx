import type { Metadata } from "next";
import { NewsletterUnsubscribeView } from "@/components/content/NewsletterTokenView";

export const metadata: Metadata = {
  title: "Unsubscribe",
  description: "Unsubscribe from the Meridian newsletter.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: Search }) {
  const token = (await searchParams).token;
  return <NewsletterUnsubscribeView token={typeof token === "string" && token.trim() ? token.trim() : null} />;
}
