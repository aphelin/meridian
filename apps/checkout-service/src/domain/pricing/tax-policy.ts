import { Money, ValidationError } from "@meridian/kernel";

/** VAT rates (percent) by ISO 3166-1 alpha-2 destination. Prices are VAT-inclusive. */
export const VAT_RATES: Readonly<Record<string, number>> = Object.freeze({ DE: 19, FR: 20, NL: 21, GE: 18, GB: 20, US: 0 });
export const DEFAULT_VAT_RATE = 20;

export interface TaxAssessment {
  ratePercent: number;
  /** VAT contained in the VAT-inclusive amount. */
  tax: Money;
}

/** Destination-based VAT: the rate for the shipping country, otherwise the default rate. */
export class TaxPolicy {
  constructor(
    private readonly rates: Readonly<Record<string, number>> = VAT_RATES,
    private readonly defaultRate: number = DEFAULT_VAT_RATE,
  ) {}

  static normalizeCountry(country: string): string {
    const code = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new ValidationError("Country must be a two-letter ISO code.", { country });
    return code;
  }

  rateFor(country: string): number {
    return this.rates[TaxPolicy.normalizeCountry(country)] ?? this.defaultRate;
  }

  /** VAT contained in a VAT-inclusive total shipped to `country`. */
  assess(total: Money, country: string): TaxAssessment {
    const ratePercent = this.rateFor(country);
    return { ratePercent, tax: total.containedTax(ratePercent) };
  }
}
