import type { Cents, CurrencyCode } from "@meridian/contracts";
import { ValidationError } from "./errors";

/** An amount of money in integer minor units. Immutable; arithmetic never produces fractions of a cent. */
export class Money {
  private constructor(
    readonly cents: Cents,
    readonly currency: CurrencyCode,
  ) {}

  static cents(cents: number, currency: CurrencyCode = "EUR"): Money {
    if (!Number.isSafeInteger(cents)) throw new ValidationError(`Money must be a whole number of cents, got ${cents}`);
    return new Money(cents, currency);
  }

  static euros(euros: number, currency: CurrencyCode = "EUR"): Money {
    return Money.cents(Math.round(euros * 100), currency);
  }

  static zero(currency: CurrencyCode = "EUR"): Money {
    return new Money(0, currency);
  }

  static sum(values: Money[], currency: CurrencyCode = "EUR"): Money {
    return values.reduce((total, value) => total.add(value), Money.zero(currency));
  }

  add(other: Money): Money {
    this.sameCurrency(other);
    return Money.cents(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.sameCurrency(other);
    return Money.cents(this.cents - other.cents, this.currency);
  }

  /** Subtracts but never goes below zero. */
  subtractFloor(other: Money): Money {
    return Money.cents(Math.max(0, this.subtract(other).cents), this.currency);
  }

  multiply(factor: number): Money {
    if (!Number.isInteger(factor)) throw new ValidationError(`Money can only be multiplied by whole quantities, got ${factor}`);
    return Money.cents(this.cents * factor, this.currency);
  }

  /** `percent`% of this amount, rounded half away from zero. */
  percent(percent: number): Money {
    return Money.cents(Math.round((this.cents * percent) / 100), this.currency);
  }

  /** VAT contained in a VAT-inclusive amount at `ratePercent`, rounded half away from zero. */
  containedTax(ratePercent: number): Money {
    if (ratePercent <= 0) return Money.zero(this.currency);
    return Money.cents(Math.round((this.cents * ratePercent) / (100 + ratePercent)), this.currency);
  }

  min(other: Money): Money {
    this.sameCurrency(other);
    return this.cents <= other.cents ? this : other;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  greaterThanOrEqual(other: Money): boolean {
    this.sameCurrency(other);
    return this.cents >= other.cents;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.cents === other.cents;
  }

  toJSON() {
    return { cents: this.cents, currency: this.currency };
  }

  toString() {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }

  private sameCurrency(other: Money) {
    if (other.currency !== this.currency) throw new ValidationError(`Cannot combine ${this.currency} with ${other.currency}`);
  }
}
