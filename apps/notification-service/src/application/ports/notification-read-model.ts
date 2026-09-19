import type { ContactMessageDto, EmailDeliveryDto, EmailTemplate, Page } from "@meridian/contracts";

export interface DeliveryFilter {
  status?: EmailDeliveryDto["status"];
  template?: EmailTemplate;
  cursor?: string;
  limit: number;
}

/** Admin read side: lists straight from the delivery log and contact inbox, newest first, cursor paginated. */
export abstract class NotificationReadModel {
  abstract listDeliveries(filter: DeliveryFilter): Promise<Page<EmailDeliveryDto>>;
  abstract listContactMessages(filter: { cursor?: string; limit: number }): Promise<Page<ContactMessageDto>>;
}
