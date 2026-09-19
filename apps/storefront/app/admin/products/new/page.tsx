import type { Metadata } from "next";
import { NewProduct } from "@/components/admin/ProductEditor";

export const metadata: Metadata = { title: "New product" };

export default function AdminNewProductPage() {
  return <NewProduct />;
}
