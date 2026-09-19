import type { Metadata } from "next";
import { EditProduct } from "@/components/admin/ProductEditor";

export const metadata: Metadata = { title: "Edit product" };

export default async function AdminProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditProduct id={id} />;
}
