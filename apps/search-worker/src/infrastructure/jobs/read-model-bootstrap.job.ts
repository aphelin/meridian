import { createLogger, isShuttingDown, onShutdown } from "@meridian/nest-kit";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import { EnsureReadModelCommand } from "../../application/commands";

const log = createLogger("ReadModelBootstrap");
const MAX_ATTEMPTS = 8;

/**
 * On startup, checks whether the read model must be rebuilt from the log (empty tables but committed offsets, e.g.
 * after the schema was recreated). Runs in the background so a slow or unavailable Kafka never blocks readiness;
 * failures retry with backoff.
 */
@Injectable()
export class ReadModelBootstrapJob implements OnApplicationBootstrap {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly commandBus: CommandBus) {}

  onApplicationBootstrap(): void {
    onShutdown("read-model-bootstrap", "consumers", () => this.stop());
    this.schedule(1, 0);
  }

  private schedule(attempt: number, delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.run(attempt), delayMs);
  }

  private async run(attempt: number): Promise<void> {
    if (this.stopped || isShuttingDown()) return;
    try {
      const result = await this.commandBus.execute(new EnsureReadModelCommand());
      log.info("read model checked", { result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_ATTEMPTS) {
        log.error("read model check gave up", { attempts: attempt, error: message });
        return;
      }
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      log.warn("read model check failed; retrying", { attempt, retryInMs: delayMs, error: message });
      this.schedule(attempt + 1, delayMs);
    }
  }

  private stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
