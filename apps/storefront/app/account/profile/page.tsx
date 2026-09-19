import type { Metadata } from "next";
import { AccountProfilePage } from "@/components/account/AccountPages";

export const metadata: Metadata = { title: "Profile & security" };

export default function ProfilePage() {
  return <AccountProfilePage />;
}
