import type { Metadata } from "next";
import { StockPage } from "@/components/admin/Stock";

export const metadata: Metadata = { title: "Stock" };

export default function AdminStockPage() {
  return <StockPage />;
}
