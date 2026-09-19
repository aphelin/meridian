import type { Metadata } from "next";
import { SystemPage } from "@/components/admin/system/System";

export const metadata: Metadata = { title: "System" };

export default function AdminSystemPage() {
  return <SystemPage />;
}
