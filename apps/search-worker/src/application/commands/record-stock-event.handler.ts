import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { SkuAvailability, SkuAvailabilityRepository, type ChangeResult } from "../../domain";
import { RecordStockEventCommand } from "./record-stock-event.command";

@CommandHandler(RecordStockEventCommand)
export class RecordStockEventHandler implements ICommandHandler<RecordStockEventCommand, ChangeResult> {
  constructor(private readonly availability: SkuAvailabilityRepository) {}

  async execute({ name, payload, meta }: RecordStockEventCommand): Promise<ChangeResult> {
    const stated = SkuAvailability.fromStockEvent(name, payload, meta);
    if (!stated) return "unchanged";
    return this.availability.change(stated.sku, (current) => (stated.supersedes(current) ? stated : null));
  }
}
