import type { ReleaseReason } from "../../domain";

export interface ReleaseOptions {
  /** Inbox dedupe when the release arrives as a RabbitMQ command. */
  messageId?: string;
  /**
   * Message-driven releases are compensations: an unknown order (nothing was reserved) or an already committed order
   * is a no-op instead of an error, so the command is acknowledged rather than dead-lettered.
   */
  lenient?: boolean;
}

export class ReleaseReservationCommand {
  constructor(
    readonly orderId: string,
    readonly reason: ReleaseReason,
    readonly options: ReleaseOptions = {},
  ) {}
}

export const RELEASE_CONSUMER = "inventory.release-reservation";
