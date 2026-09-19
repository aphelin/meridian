"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { Icon } from "../ui/Icon";

/** Map pin in the house icon style (1.6 stroke, round caps). */
function PinIcon() {
  return (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 20.75s-6.25-5.4-6.25-10.5a6.25 6.25 0 0 1 12.5 0c0 5.1-6.25 10.5-6.25 10.5Z" />
      <circle cx="12" cy="10.25" r="2.25" />
    </svg>
  );
}

export type AccountUser = { name: string; email: string; role: string };

/** The signed-in shopper's places, shared by the header account menu and the mobile menu sheet. */
export function accountPlaces(user: AccountUser): { href: string; label: string; icon: ReactNode }[] {
  return [
    { href: "/account", label: "Your account", icon: <Icon name="user" size={19} /> },
    { href: "/orders", label: "Your orders", icon: <Icon name="package" size={19} /> },
    { href: "/account/addresses", label: "Addresses", icon: <PinIcon /> },
    { href: "/saved", label: "Saved items", icon: <Icon name="heart" size={19} /> },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin dashboard", icon: <Icon name="sliders" size={19} /> }] : []),
  ];
}

export function firstName(user: AccountUser) {
  return user.name.trim().split(/\s+/)[0] || user.email;
}

/** The shopper's initial in an ink circle. */
export function InitialAvatar({ user, className = "size-7 text-[0.8125rem]" }: { user: AccountUser; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-ink font-semibold uppercase text-paper ${className}`}>
      {firstName(user).charAt(0)}
    </span>
  );
}

/** Name (with the Admin badge when relevant) over the email in stone. */
export function AccountIdentity({ user }: { user: AccountUser }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{user.name}</span>
        {user.role === "admin" ? <span className="status status-info shrink-0 !py-0.5 text-xs">Admin</span> : null}
      </span>
      <span className="block truncate text-sm font-normal text-stone">{user.email}</span>
    </>
  );
}

/** Signs out, clears cached private data and leaves private pages. */
export function useSignOut(onDone?: () => void) {
  const router = useRouter();
  const utils = trpc.useUtils();
  return trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();
      // Leave private pages (account, orders, admin) rather than showing them half signed out.
      if (/^\/(account|orders|admin)(\/|$)/.test(window.location.pathname)) router.push("/account");
      onDone?.();
      toast("You’re signed out", { description: "Your cart stays on this device." });
    },
  });
}

/** Signed-in account button: the shopper's initial in an ink circle, opening a menu of their places and sign out. */
export function AccountMenu({ user, className = "" }: { user: AccountUser; className?: string }) {
  const logout = useSignOut();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={`icon-btn ${className}`} aria-label={`Account, signed in as ${firstName(user)}`}>
        <InitialAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>
          <AccountIdentity user={user} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {accountPlaces(user).map((place) => (
            <DropdownMenuItem key={place.href} asChild>
              <Link href={place.href}>
                {place.icon}
                {place.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <Icon name="logout" size={19} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
