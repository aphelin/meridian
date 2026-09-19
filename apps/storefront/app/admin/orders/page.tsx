import type { Metadata } from "next";
import { OrdersList } from "@/components/admin/Orders";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <OrdersList />;
}
