import { Command } from "@nestjs/cqrs";

export interface SeedAdminResult {
  ok: true;
  admin: { id: string; email: string; role: "admin"; created: boolean };
}

export class SeedAdminCommand extends Command<SeedAdminResult> {}
