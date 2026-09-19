import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, DemoNotice, HelpCard, POLICIES_UPDATED } from "@/components/content/ContentPage";
import { pageMetadata } from "@/components/shop/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: "What Meridian, a demo furniture shop, stores about you, which cookies it sets, and how to unsubscribe or delete your account.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy policy"
      lede={<p>Meridian keeps only what the shop needs to work. Because this is a demo shop, please don’t share anything you’d want to keep private.</p>}
      updated={POLICIES_UPDATED}
      intro={<DemoNotice />}
      aside={<HelpCard />}
      sections={[
        {
          id: "demo",
          title: "A demo shop",
          body: (
            <ul>
              <li>
                <strong>Payments are sandbox only.</strong> No card is charged, and Meridian’s own servers never receive card details: any card form is the
                payment provider’s sandbox checkout.
              </li>
              <li>
                <strong>Emails are sandbox only.</strong> Every email the shop sends goes to a sandbox mailbox and is never delivered to a real inbox.
              </li>
              <li>
                <strong>No real orders are fulfilled.</strong> Your address is used to demonstrate checkout, not to deliver anything.
              </li>
            </ul>
          ),
        },
        {
          id: "what-we-store",
          title: "What we store",
          body: (
            <ul>
              <li>
                <strong>Account:</strong> your name, email address and a one-way hash of your password (we never store the password itself), plus any saved
                addresses, saved items and reviews.
              </li>
              <li>
                <strong>Orders:</strong> your name, email, delivery address, the pieces you ordered, prices and the order’s history, for signed-in and guest
                orders alike.
              </li>
              <li>
                <strong>Newsletter:</strong> your email address and whether you’ve confirmed or unsubscribed.
              </li>
              <li>
                <strong>Stock alerts:</strong> your email address and the piece you want to hear about.
              </li>
              <li>
                <strong>Messages:</strong> what you send through the <Link href="/contact">contact form</Link>, including your name and email.
              </li>
            </ul>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and local storage",
          body: (
            <>
              <p>We use only the cookies the shop needs, and no advertising or tracking cookies. They can’t be read by scripts on the page.</p>
              <ul>
                <li>
                  <strong>Sign-in:</strong> a short-lived session cookie (15 minutes) and a refresh cookie that keeps you signed in for up to 30 days.
                </li>
                <li>
                  <strong>Cart:</strong> an identifier for a guest cart, so your basket survives a reload.
                </li>
                <li>
                  <strong>Guest orders:</strong> an access key for each order you place as a guest (30 days), so you can reopen it in this browser.
                </li>
              </ul>
              <p>Your browser’s local storage also keeps your cart lines, saved items and recently viewed pieces on this device.</p>
            </>
          ),
        },
        {
          id: "security-check",
          title: "Security check",
          body: (
            <p>
              Forms that send email or place a guest order use Cloudflare Turnstile to tell people from bots. Turnstile runs a check in your browser and Cloudflare
              processes the result. The footer newsletter form only loads it once you start using the form.
            </p>
          ),
        },
        {
          id: "emails",
          title: "Emails",
          body: (
            <p>
              We send emails about your account and orders, and newsletter emails only after you confirm your subscription through the link we send. Every
              welcome email carries a link to unsubscribe.
            </p>
          ),
        },
        {
          id: "choices",
          title: "Your choices",
          body: (
            <ul>
              <li>Update your name and addresses, or change your password, in <Link href="/account">your account</Link>.</li>
              <li>
                Delete your account from your account page. Your orders are kept for the shop’s records but anonymised, your newsletter subscription ends and
                your stock alerts are removed.
              </li>
              <li>Unsubscribe from the newsletter with the link in the welcome email.</li>
              <li>
                Anything else? <Link href="/contact">Send us a message</Link>.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
