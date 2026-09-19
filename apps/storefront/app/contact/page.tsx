import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/content/ContactForm";
import { pageMetadata } from "@/components/shop/seo";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = pageMetadata({
  title: "Contact us",
  description: "Send the Meridian team a message about an order, a product or a return. You’ll get an email receipt.",
  path: "/contact",
});

const SHORTCUTS = [
  { href: "/shipping-returns", title: "Shipping & returns", body: "Delivery prices, times and the 30-day return window." },
  { href: "/faq", title: "Frequently asked questions", body: "Payments, cancellations, invoices and your account." },
  { href: "/orders", title: "Your orders", body: "Track, cancel or request a return for an order." },
];

export default function ContactPage() {
  return (
    <main className="shell pb-8 pt-10 md:pt-16">
      <div className="grid gap-12 lg:grid-cols-12">
        {/* Tablets put the shortcuts beside the intro instead of leaving the right half empty above the form. */}
        <header className="md:grid md:grid-cols-2 md:gap-x-10 lg:col-span-4 lg:block">
          <div>
            <h1 className="title">Contact us</h1>
            <p className="lede mt-5 max-w-[42ch]">
              Questions about an order, a piece or a return? Send us a message and we’ll email you a receipt straight away.
            </p>
            <p className="mt-4 max-w-[42ch] text-sm text-stone">
              Meridian is a demo shop: your message reaches the support inbox, and every email stays in a sandbox mailbox rather than a real inbox.
            </p>
          </div>
          <nav aria-label="Before you write" className="mt-10 max-w-md md:mt-3 lg:mt-10">
            <p className="text-sm font-medium">You might find the answer here</p>
            <ul className="mt-3 grid gap-2">
              {SHORTCUTS.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className="group -mx-3 flex items-start justify-between gap-4 rounded-[14px] px-3 py-3 transition-colors hover:bg-plaster">
                    <span>
                      <span className="block font-medium">{s.title}</span>
                      <span className="mt-0.5 block text-sm text-stone">{s.body}</span>
                    </span>
                    <Icon name="arrowRight" size={18} className="mt-1 shrink-0 text-stone transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <div className="lg:col-span-7 lg:col-start-6">
          <div className="rounded-[22px] bg-raised p-5 shadow-[inset_0_0_0_1px_var(--color-line)] sm:p-8">
            <ContactForm />
          </div>
        </div>
      </div>
    </main>
  );
}
