import { createLogger, isShuttingDown, onShutdown, RequestContext } from "@meridian/nest-kit";
import { randomUUID } from "node:crypto";

const log = createLogger("PeriodicJob");

/**
 * setInterval-based job that never overlaps itself, runs each tick in its own correlation context, and stops in the
 * "consumers" shutdown phase after the in-flight run finishes.
 */
export class PeriodicJob {
  private timer: NodeJS.Timeout | null = null;
  private starter: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly name: string,
    private readonly intervalMs: number,
    private readonly work: () => Promise<unknown>,
    private readonly firstRunDelayMs = intervalMs,
  ) {}

  start(): void {
    onShutdown(this.name, "consumers", () => this.stop());
    this.starter = setTimeout(() => {
      this.tick();
      this.timer = setInterval(() => this.tick(), this.intervalMs);
      this.timer.unref();
    }, this.firstRunDelayMs);
    this.starter.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.starter) clearTimeout(this.starter);
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private tick(): void {
    if (this.running || this.stopped || isShuttingDown()) return;
    this.running = RequestContext.run({ correlationId: `${this.name}-${randomUUID()}` }, () => this.work())
      .then(
        () => undefined,
        (error: unknown) => log.error("periodic job failed", { job: this.name, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        this.running = null;
      });
  }
}
