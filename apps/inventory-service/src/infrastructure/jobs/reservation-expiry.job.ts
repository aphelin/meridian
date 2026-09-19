import { createLogger, isShuttingDown, onShutdown, RequestContext } from "@meridian/nest-kit";
import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { ExpireReservationsCommand } from "../../application/commands";
import { INVENTORY_SETTINGS, type InventorySettings } from "../../application/ports";

const log = createLogger("ReservationExpiryJob");

/**
 * Runs the expiry sweep every RESERVATION_SWEEP_MS without overlapping runs. On shutdown ("consumers" phase) it stops
 * scheduling and waits for the in-flight sweep. Safe with several replicas: each release re-checks under its lock.
 */
@Injectable()
export class ReservationExpiryJob implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(INVENTORY_SETTINGS) private readonly settings: InventorySettings,
  ) {}

  onApplicationBootstrap() {
    onShutdown("reservation-expiry", "consumers", () => this.stop());
    this.schedule();
    log.info("reservation expiry sweep scheduled", { everyMs: this.settings.sweepMs, holdSeconds: this.settings.holdSeconds, graceSeconds: this.settings.graceSeconds });
  }

  async onModuleDestroy() {
    await this.stop();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopped || isShuttingDown()) return;
      this.running = this.sweep().finally(() => {
        this.running = null;
        this.schedule();
      });
    }, this.settings.sweepMs);
    this.timer.unref();
  }

  private async sweep() {
    try {
      await RequestContext.run({}, () => this.commandBus.execute(new ExpireReservationsCommand()));
    } catch (error) {
      log.error("reservation expiry sweep failed", { error });
    }
  }
}
