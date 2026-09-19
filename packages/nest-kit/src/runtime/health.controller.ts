import type { HealthDto } from "@meridian/contracts";
import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { liveness, readiness } from "../core/health";
import { metricsRegistry } from "../core/metrics";

/** Kubernetes-style probes and the Prometheus scrape endpoint; mounted by bootstrapService for every service. */
@Controller()
export class HealthController {
  @Get("health/live")
  live(): HealthDto {
    return liveness();
  }

  /** 503 while shutting down or when any registered dependency check fails, so load balancers stop routing here. */
  @Get("health/ready")
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const report = await readiness();
    if (report.status !== "ok") res.status(503);
    return report;
  }

  @Get("health")
  health(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    return this.ready(res);
  }

  @Get("metrics")
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader("content-type", metricsRegistry.contentType);
    res.setHeader("cache-control", "no-store");
    res.send(await metricsRegistry.metrics());
  }
}
