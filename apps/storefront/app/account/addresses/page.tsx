import type { Metadata } from "next";
import { AccountAddressesPage } from "@/components/account/AccountPages";

export const metadata: Metadata = { title: "Addresses" };

export default function AddressesPage() {
  return <AccountAddressesPage />;
}
