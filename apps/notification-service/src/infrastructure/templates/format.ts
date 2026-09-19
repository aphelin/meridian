import { Money } from "@meridian/kernel";

const EUR = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** "€2,160.00" from integer cents (kernel Money guards against fractional cents). */
export function formatCents(cents: number): string {
  return EUR.format(Money.cents(cents).cents / 100);
}

/** Subjects are single-line and bounded; nodemailer encodes them, this only keeps them readable. */
export function subjectText(text: string, max = 180): string {
  const single = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

export function firstName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

export const greeting = (name: string | null | undefined) => (firstName(name) ? `Hi ${firstName(name)},` : "Hi,");
