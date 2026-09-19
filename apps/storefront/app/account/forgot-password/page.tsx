import type { Metadata } from "next";
import { ForgotPasswordView } from "@/components/account/ForgotPasswordView";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
