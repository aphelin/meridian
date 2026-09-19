import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/** Date the policy texts were last reviewed against the running services. */
export const POLICIES_UPDATED = "17 September 2026";

export interface ContentSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Long-form help and policy page: a Fraunces title with a lede, a sticky "On this page" index on wide screens and
 * sections that stay at a readable measure.
 */
export function ContentPage({
  title,
  lede,
  updated,
  intro,
  sections,
  aside,
}: {
  title: string;
  lede: ReactNode;
  updated?: string;
  intro?: ReactNode;
  sections: ContentSection[];
  aside?: ReactNode;
}) {
  return (
    <main className="shell pb-8 pt-10 md:pt-16">
      <header className="max-w-3xl">
        <h1 className="title">{title}</h1>
        <div className="lede mt-5 max-w-[60ch]">{lede}</div>
        {updated ? (
          <p className="mt-4 text-sm text-stone">Last updated {updated}</p>
        ) : null}
      </header>
      {intro ? <div className="mt-10 max-w-3xl">{intro}</div> : null}
      {/* From lg the grid is index + 62ch measure, so the rule ends where the prose and tables do. */}
      <div className="mt-12 grid gap-10 border-t border-line pt-10 md:mt-16 md:pt-14 lg:max-w-[calc(15rem+5rem+62ch)] lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-20">
        <div>
          <div className="lg:sticky lg:top-28">
            <nav aria-label="On this page">
              <p className="text-sm font-medium">On this page</p>
              <ol className="mt-3 grid gap-1 text-[0.9375rem] text-stone">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-mx-2 flex gap-3 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-plaster hover:text-ink"
                    >
                      <span className="tabular w-5 shrink-0 text-stone/80">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            {aside ? <div className="mt-8 hidden lg:block">{aside}</div> : null}
          </div>
        </div>
        <div className="grid gap-12 md:gap-14">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className="scroll-mt-28"
            >
              <h2 id={`${s.id}-title`} className="heading">
                {s.title}
              </h2>
              <div className="mt-4 grid max-w-[62ch] gap-4 text-stone [&_a]:text-ink [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-2 hover:[&_a]:decoration-ink [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
          {aside ? <div className="max-w-[62ch] lg:hidden">{aside}</div> : null}
        </div>
      </div>
    </main>
  );
}

/** The plain statement every policy page carries: this is a demo shop. */
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div
      className="panel flex gap-4 p-5 md:p-6"
      role="note"
      aria-label="Demo shop"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full bg-paper"
        aria-hidden="true"
      >
        <Icon name="info" size={20} />
      </span>
      <div className="grid gap-2">
        <p className="font-medium">Meridian is a demo shop</p>
        <p className="text-stone">
          {children ??
            "Payments run in a sandbox and no card is ever charged. Emails are sent to a sandbox mailbox, not to real inboxes. No real orders are fulfilled: nothing is made, shipped or collected."}
        </p>
      </div>
    </div>
  );
}

/** Small "still have a question?" card linking to the contact form. */
export function HelpCard() {
  return (
    <div className="panel p-5">
      <p className="font-medium">Still have a question?</p>
      <p className="mt-1.5 text-sm text-stone">
        Send us a message and we’ll email you a receipt.
      </p>
      <Link href="/contact" className="btn btn-secondary btn-sm mt-4">
        Contact us
        <Icon name="arrowRight" size={16} />
      </Link>
    </div>
  );
}
