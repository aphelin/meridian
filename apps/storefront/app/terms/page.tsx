import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, DemoNotice, HelpCard, POLICIES_UPDATED } from "@/components/content/ContentPage";
import { pageMetadata } from "@/components/shop/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of use",
  description: "The terms for using Meridian, a demo furniture shop: sandbox payments and emails, no real orders fulfilled, accounts, prices and returns.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <ContentPage
      title="Terms of use"
      lede={<p>The short version: Meridian looks and works like a furniture shop, but it’s a demo. You can’t buy anything real here, and you can’t be charged.</p>}
      updated={POLICIES_UPDATED}
      intro={<DemoNotice />}
      aside={<HelpCard />}
      sections={[
        {
          id: "demo",
          title: "A demo shop, not a real one",
          body: (
            <>
              <p>Meridian is a portfolio project that shows how a commerce platform is built. By using the site you accept that:</p>
              <ul>
                <li>
                  <strong>Payments are sandbox only.</strong> Checkout uses a payment sandbox. No card is charged and no money changes hands, whatever you enter.
                </li>
                <li>
                  <strong>Emails are sandbox only.</strong> Order, account and newsletter emails go to a sandbox mailbox and are not delivered to real inboxes.
                </li>
                <li>
                  <strong>No real orders are fulfilled.</strong> Placing an order doesn’t form a contract of sale. Nothing is made, shipped, delivered or collected,
                  and refunds are simulated in the same sandbox.
                </li>
                <li>
                  <strong>Products are illustrative.</strong> Product names, descriptions, prices, stock levels and photography exist to demonstrate the shop.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <>
              <p>
                You don’t need an account to check out. If you create one, keep your password to yourself. You can change your details and password, or delete
                your account, from <Link href="/account">your account</Link> at any time.
              </p>
              <p>Please don’t use a password you use anywhere else, and don’t enter card details or personal information you wouldn’t want in a demo.</p>
            </>
          ),
        },
        {
          id: "prices",
          title: "Prices, discount codes and checkout",
          body: (
            <>
              <p>
                Prices are in euros and include VAT. Checkout calculates the VAT for your delivery country and shows it, together with the delivery price, before
                you pay.
              </p>
              <p>Discount codes apply only when their conditions are met, such as a minimum basket, dates or one use per customer. Checkout tells you if a code can’t be used.</p>
            </>
          ),
        },
        {
          id: "delivery",
          title: "Delivery, cancellations and returns",
          body: (
            <p>
              Delivery options, cancellations and the 30-day return window are described on <Link href="/shipping-returns">Shipping &amp; returns</Link>. As a demo
              shop, Meridian runs these flows end to end without anything leaving a warehouse.
            </p>
          ),
        },
        {
          id: "fair-use",
          title: "Fair use",
          body: (
            <p>
              Forms on the site are protected by a security check and rate limits. Please don’t try to overload the site, get around those protections or access
              other shoppers’ orders or accounts.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Questions",
          body: (
            <p>
              Something unclear? <Link href="/contact">Send us a message</Link>. You can read how we handle your data in our <Link href="/privacy">privacy policy</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
