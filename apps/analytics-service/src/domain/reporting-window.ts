import { ensure } from "@meridian/kernel";
import { UtcDay } from "./utc-day";

export const MAX_REPORTING_DAYS = 366;

/** The last `days` UTC days, today included: [today - (days - 1), today]. */
export class ReportingWindow {
  private constructor(
    readonly days: number,
    readonly from: UtcDay,
    readonly to: UtcDay,
  ) {}

  static lastDays(days: number, now: Date): ReportingWindow {
    ensure(Number.isInteger(days) && days >= 1 && days <= MAX_REPORTING_DAYS, "VALIDATION_FAILED", `days must be a whole number between 1 and ${MAX_REPORTING_DAYS}`);
    const to = UtcDay.of(now);
    return new ReportingWindow(days, to.minusDays(days - 1), to);
  }

  contains(day: string): boolean {
    return day >= this.from.value && day <= this.to.value;
  }

  /** Every day of the window in chronological order. */
  eachDay(): UtcDay[] {
    return Array.from({ length: this.days }, (_, index) => this.from.plusDays(index));
  }
}
