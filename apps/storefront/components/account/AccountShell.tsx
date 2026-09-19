"use client";

import type { UserDto } from "@meridian/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { AuthPanel } from "./AuthPanel";
import { ErrorState } from "./shared";
import { VerifyBanner } from "./VerifyBanner";

export type AccountSection = "overview" | "profile" | "addresses";

const NAV: { id: AccountSection | "orders" | "saved"; href: string; label: string }[] = [
  { id: "overview", href: "/account", label: "Overview" },
  { id: "orders", href: "/orders", label: "Orders" },
  { id: "addresses", href: "/account/addresses", label: "Addresses" },
  { id: "profile", href: "/account/profile", label: "Profile & security" },
  { id: "saved", href: "/saved", label: "Saved" },
];

const SIGNED_OUT_LEDE: Record<AccountSection, string | undefined> = {
  overview: undefined,
  profile: "Sign in to edit your profile and password.",
  addresses: "Sign in to manage your saved addresses.",
};

function ShellSkeleton() {
  return (
    <main className="shell pb-24 pt-8 md:pt-14" aria-busy="true">
      <h1 className="sr-only">Loading your account</h1>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-3 h-5 w-48" />
      <div className="mt-8 flex gap-2">
        {NAV.map((n) => (
          <Skeleton key={n.id} className="h-[38px] w-24 !rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-10 h-64 w-full !rounded-[18px]" />
    </main>
  );
}

/** Signed-in frame for every account page: greeting, verification banner, section nav and sign out. */
export function AccountShell({ section, next, children }: { section: AccountSection; next?: string | null; children: (user: UserDto) => ReactNode }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();
      toast("You’re signed out", { description: "Your cart stays on this device." });
      router.push("/account");
    },
  });

  if (me.isPending) return <ShellSkeleton />;
  if (me.error) {
    return (
      <main className="shell pb-24 pt-10 md:pt-16">
        <ErrorState title="We couldn’t load your account" error={me.error} onRetry={() => void me.refetch()} headingLevel="h1" />
      </main>
    );
  }
  const user = me.data;
  if (!user) return <AuthPanel next={next} lede={SIGNED_OUT_LEDE[section]} />;

  const first = user.name.trim().split(/\s+/)[0] || user.name;
  return (
    <main className="shell pb-24 pt-8 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="title break-words">Hi, {first}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-stone">
            <span className="break-all">{user.email}</span>
            {user.emailVerified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}
            {user.role === "admin" ? <Badge tone="info">Admin</Badge> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {user.role === "admin" ? (
            <Button asChild variant="secondary">
              <Link href="/admin">Admin dashboard</Link>
            </Button>
          ) : null}
          <Button type="button" variant="quiet" pending={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      </div>

      {user.emailVerified ? null : <VerifyBanner email={user.email} />}

      <nav
        aria-label="Account"
        className="no-scrollbar -mx-4 mt-8 flex scroll-px-4 gap-2 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1.5rem),transparent)] sm:mx-0 sm:scroll-px-0 sm:px-0 sm:[mask-image:none]"
      >
        {NAV.map((item) => (
          <Link key={item.id} href={item.href} className="chip" aria-current={item.id === section ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-10">{children(user)}</div>
    </main>
  );
}
