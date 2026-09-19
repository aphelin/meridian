import { describe, expect, it } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("keeps whole cents through arithmetic", () => {
    expect(Money.euros(2400).multiply(2).subtract(Money.cents(10)).cents).toBe(479_990);
  });

  it("rounds percentages half away from zero", () => {
    expect(Money.cents(2_401).percent(10).cents).toBe(240);
    expect(Money.cents(2_405).percent(10).cents).toBe(241);
  });

  it("extracts VAT contained in an inclusive price", () => {
    expect(Money.euros(120).containedTax(20).cents).toBe(2_000);
    expect(Money.euros(100).containedTax(0).cents).toBe(0);
  });

  it("refuses fractional cents and mixed currencies", () => {
    expect(() => Money.cents(1.5)).toThrow(/whole number/);
    expect(() => Money.euros(1).multiply(1.5)).toThrow(/whole quantities/);
  });

  it("floors subtraction at zero when asked", () => {
    expect(Money.euros(10).subtractFloor(Money.euros(25)).cents).toBe(0);
  });
});
