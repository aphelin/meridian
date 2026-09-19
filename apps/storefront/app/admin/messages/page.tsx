import type { Metadata } from "next";
import { ContactMessagesPage } from "@/components/admin/Emails";

export const metadata: Metadata = { title: "Messages" };

export default function AdminMessagesPage() {
  return <ContactMessagesPage />;
}
