import type { Metadata } from "next";
import { EmailsPage } from "@/components/admin/Emails";

export const metadata: Metadata = { title: "Emails" };

export default function AdminEmailsPage() {
  return <EmailsPage />;
}
