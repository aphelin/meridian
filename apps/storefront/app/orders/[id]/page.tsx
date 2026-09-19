import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderSkeleton, OrderView } from "@/components/orders/OrderView";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <OrderView id={id} />
    </Suspense>
  );
}
