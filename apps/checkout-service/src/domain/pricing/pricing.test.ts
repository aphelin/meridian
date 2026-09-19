import { Money } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { CatalogOffer } from "./catalog-offer";
import { PricedLine } from "./priced-line";
import { PricingCalculator } from "./pricing-calculator";
import { ShippingPolicies, StandardShipping } from "./shipping-policy";
import { TaxPolicy } from "./tax-policy";

const holt = (qty = 1) => PricedLine.create({ sku: "HOLT-CHA-3", variantId: "charcoal", slug: "holt-sofa", productName: "Holt", variantLabel: "Charcoal wool", qty, unitPriceCents: 240_000 });
const kite = (qty = 1) => PricedLine.create({ sku: "KITE-OCH", variantId: "ochre", slug: "kite-lamp", productName: "Kite", variantLabel: "Ochre linen", qty, unitPriceCents: 54_000 });
const calculator = new PricingCalculator(ShippingPolicies.standardSet(), new TaxPolicy());

describe("ShippingPolicy strategies", () => {
  const policies = ShippingPolicies.standardSet();

  it("standard shipping costs €49 below €1000 and is free from €1000 after discount", () => {
    expect(policies.get("standard").priceFor(Money.cents(99_999)).cents).toBe(4900);
    expect(policies.get("standard").priceFor(Money.cents(100_000)).cents).toBe(0);
    expect(new StandardShipping().etaDays).toEqual([5, 10]);
  });

  it("express, white-glove and collect shipping have flat prices and delivery windows", () => {
    const quotes = policies.quoteAll(Money.cents(500_000));
    expect(quotes.map((q) => [q.id, q.price.cents, q.etaDays])).toEqual([
      ["standard", 0, [5, 10]],
      ["express", 9900, [2, 4]],
      ["white-glove", 14_900, [7, 14]],
      ["collect", 0, null],
    ]);
  });

  it("rejects an unknown shipping method", () => {
    expect(() => policies.get("drone")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});

describe("TaxPolicy VAT by destination", () => {
  const tax = new TaxPolicy();

  it("uses the destination VAT rate and the default rate elsewhere", () => {
    expect([tax.rateFor("DE"), tax.rateFor("fr"), tax.rateFor("NL"), tax.rateFor("GE"), tax.rateFor("GB"), tax.rateFor("US"), tax.rateFor("SE")]).toEqual([19, 20, 21, 18, 20, 0, 20]);
  });

  it("computes the VAT contained in a VAT-inclusive total", () => {
    expect(tax.assess(Money.cents(216_000), "DE").tax.cents).toBe(Math.round((216_000 * 19) / 119));
    expect(tax.assess(Money.cents(216_000), "US").tax.cents).toBe(0);
  });

  it("rejects a malformed tax country", () => {
    expect(() => tax.rateFor("Germany")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});

describe("PricingCalculator quote composition", () => {
  it("quote applies discount before the shipping threshold and VAT on the total", () => {
    const priced = calculator.price({ lines: [holt()], shippingMethod: "standard", country: "DE", discount: (subtotal) => subtotal.percent(10) });
    expect(priced.pricing).toEqual({ subtotalCents: 240_000, discountCents: 24_000, shippingCents: 0, taxCents: Math.round((216_000 * 19) / 119), taxRatePercent: 19, totalCents: 216_000, currency: "EUR" });
    expect(priced.shippingOptions).toHaveLength(4);
  });

  it("quote charges standard shipping when the discount takes the basket below the threshold", () => {
    const priced = calculator.price({ lines: [kite(2)], shippingMethod: "standard", country: "US", discount: () => Money.cents(10_000) });
    expect(priced.pricing.subtotalCents).toBe(108_000);
    expect(priced.pricing.shippingCents).toBe(4900);
    expect(priced.pricing.totalCents).toBe(108_000 - 10_000 + 4900);
    expect(priced.pricing.taxCents).toBe(0);
    expect(priced.lines[0]).toMatchObject({ sku: "KITE-OCH", qty: 2, lineTotalCents: 108_000 });
  });

  it("rejects line quantities above 20", () => {
    expect(() => kite(21)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });
});

describe("CatalogOffer purchasability (amendment 1p)", () => {
  const offer = { sku: "KILN-SMO", productName: "Kiln", status: "published", soldOut: false };
  it("allows a published product that is not sold out", () => {
    expect(() => CatalogOffer.assertPurchasable(offer)).not.toThrow();
  });
  it("refuses a sold-out product with OUT_OF_STOCK and details.sku", () => {
    const error = (() => {
      try {
        CatalogOffer.assertPurchasable({ ...offer, soldOut: true });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toMatchObject({ code: "OUT_OF_STOCK", details: { sku: "KILN-SMO" } });
  });
  it("an unpublished product stays a CONFLICT", () => {
    expect(() => CatalogOffer.assertPurchasable({ ...offer, status: "archived", soldOut: true })).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });
});
