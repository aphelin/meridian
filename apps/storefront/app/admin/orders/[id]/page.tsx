import type { Metadata } from "next";
import { OrderDetail } from "@/components/admin/OrderDetail";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
