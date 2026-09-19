import { ConsumerGroups, type AnalyticsOverviewDto } from "@meridian/contracts";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { ReportingWindow, SalesReport } from "../../domain";
import { AnalyticsReadModel, ProjectorControl } from "../ports";
import { GetAnalyticsOverviewQuery } from "./get-overview.query";

/** projectionLag is -1 when the broker could not report the group's offsets in time. */
export const UNKNOWN_LAG = -1;

@QueryHandler(GetAnalyticsOverviewQuery)
export class GetAnalyticsOverviewHandler implements IQueryHandler<GetAnalyticsOverviewQuery, AnalyticsOverviewDto> {
  constructor(
    private readonly readModel: AnalyticsReadModel,
    private readonly control: ProjectorControl,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ days }: GetAnalyticsOverviewQuery): Promise<AnalyticsOverviewDto> {
    const window = ReportingWindow.lastDays(days, this.clock.now());
    const from = window.from.value;
    const to = window.to.value;
    const [daily, cancellations, lastEventAt, lag] = await Promise.all([
      this.readModel.dailySales(from, to),
      this.readModel.cancellations(from, to),
      this.readModel.lastEventAt(ConsumerGroups.analyticsProjector),
      this.control.lag(),
    ]);
    const rows = daily.filter((row) => window.contains(row.day));
    return {
      days: window.days,
      totals: SalesReport.totals(rows),
      daily: SalesReport.fillDays(
        window.eachDay().map((day) => day.value),
        rows,
      ).map(({ day, ordersPlaced, ordersPaid, grossCents, refundsCents }) => ({ day, ordersPlaced, ordersPaid, grossCents, refundsCents })),
      cancellations: SalesReport.cancellationsByReason(cancellations),
      projectionLag: lag ?? UNKNOWN_LAG,
      lastEventAt: lastEventAt ? lastEventAt.toISOString() : null,
    };
  }
}
