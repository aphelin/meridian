import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, DemoNotice, HelpCard, POLICIES_UPDATED } from "@/components/content/ContentPage";
import { pageMetadata } from "@/components/shop/seo";
import { money } from "@/lib/format";

export const metadata: Metadata = pageMetadata({
  title: "Shipping & returns",
  description: "Delivery options and prices for Meridian furniture (standard, express, white-glove or studio collection) and 30-day returns after delivery.",
  path: "/shipping-returns",
});

/** Mirrors checkout-service `ShippingPolicies.standardSet()`: the same methods, prices and delivery windows as checkout. */
const METHODS = [
  { name: "Standard delivery", cents: 4900, eta: "5–10 working days", note: `Free when your order comes to ${money(100_000)} or more after any discount.` },
  { name: "Express delivery", cents: 9900, eta: "2–4 working days", note: "Our fastest option." },
  { name: "White-glove delivery", cents: 14_900, eta: "7–14 working days", note: "Two-person delivery to the room of your choice, unpacked and assembled." },
  { name: "Collect from the studio", cents: 0, eta: "When ready", note: "We let you know once your order is ready to collect." },
];

/** checkout-service `RETURN_WINDOW_DAYS`. */
const RETURN_WINDOW_DAYS = 30;

export default function ShippingReturnsPage() {
  return (
    <ContentPage
      title="Shipping & returns"
      lede={
        <p>
          Four ways to get your furniture home, with prices shown at checkout before you pay, and {RETURN_WINDOW_DAYS} days after delivery to send something
          back.
        </p>
      }
      updated={POLICIES_UPDATED}
      intro={<DemoNotice>Checkout and delivery options work exactly as described here, but payments run in a sandbox and no real orders are fulfilled: nothing is shipped, delivered or collected.</DemoNotice>}
      aside={<HelpCard />}
      sections={[
        {
          id: "delivery",
          title: "Delivery options",
          body: (
            <>
              <p>Choose a delivery option at checkout. Prices are in euros and include VAT.</p>
              <div className="overflow-hidden rounded-[14px] bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]">
                <table className="w-full text-left text-[0.9375rem]">
                  <caption className="sr-only">Delivery options, prices and delivery times</caption>
                  <thead className="bg-plaster text-sm text-ink">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Option
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Price
                      </th>
                      <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
                        Delivery time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {METHODS.map((m) => (
                      <tr key={m.name} className="border-t border-line align-top">
                        <th scope="row" className="px-4 py-4 font-normal">
                          <span className="block font-medium text-ink">{m.name}</span>
                          <span className="mt-1 block text-sm text-stone sm:hidden">{m.eta}</span>
                          <span className="mt-1 block text-sm text-stone">{m.note}</span>
                        </th>
                        <td className="tabular px-4 py-4 whitespace-nowrap text-ink">{m.cents === 0 ? "Free" : money(m.cents)}</td>
                        <td className="hidden px-4 py-4 whitespace-nowrap sm:table-cell">{m.eta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <strong>Free standard delivery</strong> applies when your order subtotal, after any discount code, is {money(100_000)} or more. Checkout shows the
                delivery price and the VAT included in your total before you pay.
              </p>
            </>
          ),
        },
        {
          id: "cancelling",
          title: "Changing your mind before it ships",
          body: (
            <>
              <p>
                You can cancel an order from its order page until it has shipped. If you’ve already paid, the full amount is refunded to your original payment
                method.
              </p>
            </>
          ),
        },
        {
          id: "returns",
          title: `${RETURN_WINDOW_DAYS}-day returns`,
          body: (
            <>
              <p>
                You can return pieces within <strong>{RETURN_WINDOW_DAYS} days of delivery</strong>. You can return a whole order or just some of the pieces in it.
              </p>
              <ul>
                <li>
                  Open your order from <Link href="/orders">your orders</Link>, or from the link in your order email if you checked out as a guest.
                </li>
                <li>Choose “Request a return”, pick the pieces and quantities, and tell us why.</li>
                <li>We email you when your request arrives, and again once we’ve approved or declined it.</li>
              </ul>
            </>
          ),
        },
        {
          id: "refunds",
          title: "Refunds",
          body: (
            <>
              <p>
                When we approve a return, we refund the returned pieces to your original payment method. The refund is based on what you paid for those pieces:
                if your order used a discount code, the discount is shared across the pieces in it.
              </p>
              <p>You’ll get an email once the refund goes through, and your order page shows every refund and return.</p>
            </>
          ),
        },
      ]}
    />
  );
}
