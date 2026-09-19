import type { Metadata } from "next";
import { OrderHistory } from "@/components/orders/OrderHistory";

export const metadata: Metadata = { title: "Your orders" };

export default function OrdersPage() {
  return <OrderHistory />;
}
