/** FAQ content. Every answer describes how the running shop actually behaves; plain text so it also feeds FAQPage JSON-LD. */
export interface FaqItem {
  id: string;
  question: string;
  answer: string[];
  link?: { href: string; label: string };
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

export const FAQ: FaqGroup[] = [
  {
    id: "orders",
    title: "Orders and payment",
    items: [
      {
        id: "real-shop",
        question: "Is Meridian a real shop?",
        answer: [
          "No. Meridian is a demo shop built to show how a commerce platform works. Browsing, checkout, emails and returns all run for real, but payments and emails stay in a sandbox and no real orders are fulfilled.",
        ],
        link: { href: "/terms", label: "Read the terms" },
      },
      {
        id: "charged",
        question: "Will I be charged if I place an order?",
        answer: [
          "No. Payments run in a sandbox, so no card is charged and no money changes hands. Try the code NORTH-10 at checkout for 10% off.",
        ],
      },
      {
        id: "vat",
        question: "Do prices include VAT?",
        answer: ["Yes. Prices are in euros with VAT included. Checkout works out the VAT for your delivery country and shows it before you pay."],
      },
      {
        id: "guest",
        question: "Do I need an account to order?",
        answer: [
          "No, you can check out as a guest. Your order email has a link back to the order. With an account you also get your order history and saved addresses in one place.",
        ],
        link: { href: "/account", label: "Create an account" },
      },
      {
        id: "invoice",
        question: "Where do I find my invoice?",
        answer: ["Once your order is paid, we issue an invoice and email you. You can download it from your order page."],
      },
    ],
  },
  {
    id: "delivery",
    title: "Delivery and returns",
    items: [
      {
        id: "delivery-cost",
        question: "How much does delivery cost?",
        answer: [
          "Standard delivery is €49 and takes 5–10 working days. It’s free when your order comes to €1,000 or more after any discount.",
          "Express delivery is €99 (2–4 working days), white-glove delivery is €149 (7–14 working days) and collecting from the studio is free.",
        ],
        link: { href: "/shipping-returns", label: "Shipping & returns" },
      },
      {
        id: "cancel",
        question: "Can I cancel my order?",
        answer: ["Yes, until it ships. Use “Cancel order” on the order page. If you’ve already paid, the full amount is refunded."],
      },
      {
        id: "returns",
        question: "Can I return something?",
        answer: [
          "Yes, within 30 days of delivery. Choose “Request a return” on your order page, pick the pieces and tell us why. We email you when we’ve approved or declined it, and refund approved returns to your original payment method.",
        ],
        link: { href: "/shipping-returns#returns", label: "How returns work" },
      },
      {
        id: "sold-out",
        question: "A piece is sold out. Can you tell me when it’s back?",
        answer: ["Yes. Choose the sold-out option on the product page, enter your email address and select “Notify me”. We email you once it’s back in stock."],
      },
    ],
  },
  {
    id: "account",
    title: "Account and emails",
    items: [
      {
        id: "emails",
        question: "Why haven’t I received an email?",
        answer: ["Meridian is a demo shop, so every email goes to a sandbox mailbox rather than your real inbox."],
      },
      {
        id: "newsletter",
        question: "How do I join or leave the newsletter?",
        answer: [
          "Enter your address in the form at the bottom of any page, then open the confirmation link we send. The link works for 48 hours. The welcome email has a link to unsubscribe whenever you like.",
        ],
      },
      {
        id: "delete",
        question: "How do I delete my account?",
        answer: [
          "Go to your account and choose to delete it, then confirm with your password. Your orders are anonymised, your newsletter subscription ends and your stock alerts are removed.",
        ],
        link: { href: "/account", label: "Go to your account" },
      },
    ],
  },
];
