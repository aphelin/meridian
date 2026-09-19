import type { Metadata } from "next";
import { AccountOverviewPage } from "@/components/account/AccountPages";

export const metadata: Metadata = { title: "Account" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: Search }) {
  const next = (await searchParams).next;
  return <AccountOverviewPage next={typeof next === "string" ? next : null} />;
}
