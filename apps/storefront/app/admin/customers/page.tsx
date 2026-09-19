import type { Metadata } from "next";
import { CustomersPage } from "@/components/admin/Customers";

export const metadata: Metadata = { title: "Customers" };

export default function AdminCustomersPage() {
  return <CustomersPage />;
}
