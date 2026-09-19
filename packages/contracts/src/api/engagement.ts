import type { IsoDateTime, Page } from "../common";
import type { EmailTemplate } from "../events";

export interface NewsletterSubscribeRequest {
  email: string;
}

export interface ContactRequest {
  name: string;
  email: string;
  topic: "order" | "product" | "returns" | "other";
  orderNumber?: string | null;
  message: string;
}

export interface StockAlertRequest {
  email: string;
  sku: string;
  slug: string;
}

export interface EmailDeliveryDto {
  id: string;
  template: EmailTemplate;
  to: string;
  subject: string;
  status: "queued" | "sent" | "failed" | "dead-lettered" | "suppressed";
  attempts: number;
  lastError: string | null;
  correlationId: string;
  createdAt: IsoDateTime;
  sentAt: IsoDateTime | null;
}

export interface ContactMessageDto {
  id: string;
  name: string;
  email: string;
  topic: ContactRequest["topic"];
  orderNumber: string | null;
  message: string;
  createdAt: IsoDateTime;
}

export type EmailDeliveryListDto = Page<EmailDeliveryDto>;
export type ContactMessageListDto = Page<ContactMessageDto>;
