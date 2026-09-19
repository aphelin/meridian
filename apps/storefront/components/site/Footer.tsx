import type { CategoryDto } from "@meridian/contracts";
import Link from "next/link";
import { Wordmark } from "../ui/Wordmark";
import { NewsletterForm } from "./NewsletterForm";

const help = [
  { href: "/account", label: "Account & orders" },
  { href: "/saved", label: "Saved items" },
  { href: "/cart", label: "Cart" },
  { href: "/search", label: "Search" },
  { href: "/shipping-returns", label: "Shipping & returns" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

const legal = [
  { href: "/terms", label: "Terms of use" },
  { href: "/privacy", label: "Privacy policy" },
];

export function Footer({ categories }: { categories: CategoryDto[] }) {
  return (
    <footer className="mt-24 border-t border-line bg-plaster">
      <div className="shell grid gap-12 py-14 md:grid-cols-12 md:py-20">
        <div className="md:col-span-12 lg:col-span-4">
          <Wordmark />
          <p className="mt-5 max-w-sm text-stone [text-wrap:pretty]">
            Sofas, tables, lighting and storage in wool, oak and walnut. This is a demo store: the checkout works, but payments run in a sandbox.
          </p>
          <NewsletterForm />
        </div>
        {/* Link groups share one row of three from sm; beside the brand column only from lg, where they take one more column until xl. */}
        <div className="grid grid-cols-2 gap-10 min-[480px]:grid-cols-3 md:col-span-12 lg:col-span-8 lg:col-start-5 xl:col-span-7 xl:col-start-6">
          <nav aria-label="Shop">
            <p className="text-sm font-medium">Shop</p>
            <ul className="mt-4 grid gap-2.5 text-stone">
              <li>
                <Link href="/shop" className="transition-colors hover:text-ink">
                  Shop all
                </Link>
              </li>
              {[...categories].sort((a, b) => a.position - b.position).map((c) => (
                <li key={c.id}>
                  <Link href={`/shop/${c.id}`} className="transition-colors hover:text-ink">
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Help">
            <p className="text-sm font-medium">Help</p>
            <ul className="mt-4 grid gap-2.5 text-stone">
              {help.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="About">
            <p className="text-sm font-medium">About</p>
            <ul className="mt-4 grid gap-2.5 text-stone">
              <li>
                <Link href="/#how-it-works" className="transition-colors hover:text-ink">
                  How this store works
                </Link>
              </li>
              <li>
                <Link href="/admin" className="transition-colors hover:text-ink">
                  Admin dashboard
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-line-strong/60">
        <div className="shell flex flex-col gap-2 py-6 text-sm text-stone sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Meridian. A demo store: products and photography are illustrative.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
            {legal.map((l) => (
              <Link key={l.href} href={l.href} className="-my-2.5 py-2.5 transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
            <span>Prices in EUR · Payments in sandbox</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
