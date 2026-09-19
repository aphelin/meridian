import type { Metadata } from "next";

/** Everything under /account is private to the shopper: never indexed, links never followed. */
export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
