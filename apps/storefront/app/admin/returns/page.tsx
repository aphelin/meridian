import type { Metadata } from "next";
import { ReturnsQueue } from "@/components/admin/Returns";

export const metadata: Metadata = { title: "Returns" };

export default function AdminReturnsPage() {
  return <ReturnsQueue />;
}
