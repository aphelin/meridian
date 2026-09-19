"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ErrorState } from "./kit";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/returns", label: "Returns" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/system", label: "System" },
] as const;

function isCurrent(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Gate({ title, body, action, code }: { title: string; body: string; action: { href: string; label: string }; code?: string }) {
  return (
    <main className="shell pt-10 pb-24 md:pt-16">
      <div className="panel mx-auto grid max-w-2xl place-items-center px-6 py-16 text-center md:py-20">
        <span className="grid size-14 place-items-center rounded-full bg-paper">
          <Icon name="user" size={24} />
        </span>
        {code ? <p className="mt-5 text-sm text-stone tabular">{code}</p> : null}
        <h1 className="heading mt-2 !text-[1.75rem]">{title}</h1>
        <p className="mt-2 max-w-[46ch] text-stone">{body}</p>
        <Link href={action.href} className="btn btn-primary mt-6">
          {action.label}
        </Link>
      </div>
    </main>
  );
}

/**
 * Admin frame: renders the console only for a signed-in admin. Visitors get a sign-in prompt and customers a 403
 * state; neither mounts any admin component, so no admin query is ever issued for them (the BFF refuses them too).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin";
  const me = trpc.auth.me.useQuery();
  const navRef = useRef<HTMLUListElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const isAdmin = me.data?.role === "admin";

  // On narrow screens the nav scrolls sideways (edges fade to hint at more): keep the current page's chip in view.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, isAdmin]);

  // The left edge only fades once the strip has scrolled, so the first chip is never dimmed at rest.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setScrolled(nav.scrollLeft > 0);
    update();
    nav.addEventListener("scroll", update, { passive: true });
    return () => nav.removeEventListener("scroll", update);
  }, [isAdmin]);

  if (me.isPending) {
    return (
      <main className="shell pt-10" aria-busy="true">
        <h1 className="sr-only">Checking your access</h1>
        <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
          <Skeleton className="hidden h-96 lg:block" />
          <div className="grid content-start gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </main>
    );
  }
  if (me.error) {
    return (
      <main className="shell pt-10">
        <h1 className="section-title">Admin</h1>
        <ErrorState className="mt-6 max-w-2xl" error={me.error} what="We couldn’t check your access" />
      </main>
    );
  }
  if (!me.data) {
    return (
      <Gate
        title="Sign in to use the admin console"
        body="Orders, products, stock and the system page are for staff. Sign in with an admin account to continue."
        action={{ href: `/account?next=${encodeURIComponent(pathname)}`, label: "Sign in" }}
      />
    );
  }
  if (me.data.role !== "admin") {
    return (
      <Gate
        code="403 · Forbidden"
        title="Admins only"
        body={`You’re signed in as ${me.data.email}, a customer account. Sign out and use an admin account to open the console.`}
        action={{ href: "/account", label: "Go to your account" }}
      />
    );
  }

  return (
    <div className="shell pt-6 pb-24 md:pt-10">
      <div className="grid gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Admin" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 hidden items-center gap-2 text-sm text-stone lg:flex">
            Admin console
            <span className="status status-info">Admin</span>
          </p>
          <ul
            ref={navRef}
            className={cn(
              "no-scrollbar -mx-4 flex scroll-px-10 gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:scroll-px-0 lg:gap-0.5 lg:overflow-visible lg:px-0 lg:[mask-image:none]",
              scrolled
                ? "[mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%-1.5rem),transparent)]"
                : "[mask-image:linear-gradient(to_right,#000,#000_calc(100%-1.5rem),transparent)]",
            )}
          >
            {NAV.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "chip lg:flex lg:w-full",
                      !current && "lg:bg-transparent lg:shadow-none lg:hover:bg-plaster lg:hover:shadow-none",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
