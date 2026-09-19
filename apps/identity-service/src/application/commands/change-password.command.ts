import { Command } from "@nestjs/cqrs";

export class ChangePasswordCommand extends Command<void> {
  constructor(
    readonly userId: string,
    readonly currentPassword: string,
    readonly newPassword: string,
    /** The caller's refresh token; its family survives the change. Without it every session is revoked. */
    readonly refreshToken: string | null,
  ) {
    super();
  }
}
