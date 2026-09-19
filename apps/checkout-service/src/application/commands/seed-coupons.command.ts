import { Command } from "@nestjs/cqrs";

export class SeedCouponsCommand extends Command<{ created: string[]; existing: string[] }> {
  constructor() {
    super();
  }
}
