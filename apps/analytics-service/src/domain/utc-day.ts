import { ValidationError } from "@meridian/kernel";

const DAY_MS = 86_400_000;
const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A UTC calendar day, "YYYY-MM-DD". Sorts lexically in chronological order. */
export class UtcDay {
  private constructor(readonly value: string) {}

  static of(date: Date): UtcDay {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new ValidationError("Invalid date for a UTC day");
    return new UtcDay(date.toISOString().slice(0, 10));
  }

  static fromIso(iso: string): UtcDay {
    return UtcDay.of(new Date(iso));
  }

  static parse(value: string): UtcDay {
    if (!PATTERN.test(value)) throw new ValidationError(`Invalid UTC day "${value}"`);
    const day = UtcDay.of(new Date(`${value}T00:00:00.000Z`));
    if (day.value !== value) throw new ValidationError(`Invalid UTC day "${value}"`);
    return day;
  }

  minusDays(days: number): UtcDay {
    return UtcDay.of(new Date(this.startOfDay().getTime() - days * DAY_MS));
  }

  plusDays(days: number): UtcDay {
    return this.minusDays(-days);
  }

  startOfDay(): Date {
    return new Date(`${this.value}T00:00:00.000Z`);
  }

  isAfter(other: UtcDay): boolean {
    return this.value > other.value;
  }

  equals(other: UtcDay): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
