import type { Metadata } from "next";
import Link from "next/link";
import { HelpCard } from "@/components/content/ContentPage";
import { FAQ } from "@/components/content/faq";
import { jsonLdHtml, pageMetadata } from "@/components/shop/seo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = pageMetadata({
  title: "Frequently asked questions",
  description: "Answers about Meridian orders, sandbox payments, delivery prices, 30-day returns, the newsletter and your account.",
  path: "/faq",
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.flatMap((group) =>
    group.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
    })),
  ),
};

export default function FaqPage() {
  return (
    <main className="shell pb-8 pt-10 md:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(structuredData)} />
      <header className="max-w-3xl">
        <h1 className="title">Frequently asked questions</h1>
        <p className="lede mt-5 max-w-[60ch]">
          Quick answers about ordering, delivery and your account. Meridian is a demo shop, so payments and emails run in a sandbox.
        </p>
      </header>

      {/* From lg the rule sits over the questions column only, ending where the accordion rules do. */}
      <div className="mt-12 grid gap-12 border-t border-line pt-10 md:mt-16 md:pt-14 lg:grid-cols-12 lg:border-t-0 lg:pt-0">
        <div className="grid gap-14 lg:col-span-8 lg:border-t lg:border-line lg:pt-14">
          {FAQ.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="scroll-mt-28">
              <h2 id={`${group.id}-title`} className="section-title">
                {group.title}
              </h2>
              <Accordion type="multiple" className="mt-4 border-t border-line">
                {group.items.map((item) => (
                  <AccordionItem key={item.id} value={item.id} id={item.id} className="scroll-mt-28">
                    <AccordionTrigger className="cursor-pointer text-[1.0625rem]">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="grid max-w-[64ch] gap-3">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {item.link ? (
                        <Link href={item.link.href} className="link inline-flex w-fit items-center gap-1.5 font-medium">
                          {item.link.label}
                          <Icon name="arrowRight" size={16} />
                        </Link>
                      ) : null}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
        <aside className="lg:col-span-3 lg:col-start-10 lg:pt-14" aria-label="More help">
          <div className="grid gap-4 md:grid-cols-2 lg:sticky lg:top-28 lg:grid-cols-1">
            <HelpCard />
            <nav aria-label="Help pages" className="panel p-5">
              <p className="font-medium">More help</p>
              <ul className="mt-3 grid gap-2 text-sm">
                <li>
                  <Link href="/shipping-returns" className="link">
                    Shipping &amp; returns
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="link">
                    Terms of use
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="link">
                    Privacy policy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </aside>
      </div>
    </main>
  );
}
