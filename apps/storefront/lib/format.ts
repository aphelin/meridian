const whole = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats integer euro cents: whole euros without decimals (€2,400), anything else with two (€19.16). */
export function money(cents: number) {
  const value = Math.round(cents);
  return value % 100 === 0 ? whole.format(value / 100) : exact.format(value / 100);
}

const day = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" });

export function shortDate(value: string | Date) {
  return day.format(typeof value === "string" ? new Date(value) : value);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function statusTone(status: string) {
  if (status === "cancelled" || status === "refunded") return "status-muted";
  if (status === "placed" || status === "partially_refunded") return "status-warn";
  return "status-ok";
}

const labels: Record<string, string> = {
  placed: "Awaiting payment",
  paid: "Paid",
  fulfilling: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export function statusLabel(status: string) {
  return labels[status] ?? status;
}

const colours: Record<string, string> = {
  neutral: "Neutral",
  white: "White",
  black: "Black",
  grey: "Grey",
  brown: "Brown",
  green: "Green",
  blue: "Blue",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  pink: "Pink",
  metal: "Metal",
};

/** Shopper label for a catalog colour family. */
export function colourLabel(family: string) {
  return colours[family] ?? family;
}
