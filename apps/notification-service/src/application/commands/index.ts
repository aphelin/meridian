import { CreateStockAlertHandler, DispatchOrderEmailHandler, ForgetCustomerHandler, NotifyStockAlertsHandler, ProjectProductHandler, RecordOrderRecipientHandler, SubmitContactMessageHandler } from "./engagement.handlers";
import { ConfirmNewsletterHandler, SubscribeNewsletterHandler, UnsubscribeNewsletterHandler } from "./newsletter.handlers";
import { SendEmailHandler } from "./send-email.handler";

export * from "./engagement.commands";
export * from "./engagement.handlers";
export * from "./newsletter.commands";
export * from "./newsletter.handlers";
export * from "./send-email.command";
export * from "./send-email.handler";

export const CommandHandlers = [
  SendEmailHandler,
  SubscribeNewsletterHandler,
  ConfirmNewsletterHandler,
  UnsubscribeNewsletterHandler,
  SubmitContactMessageHandler,
  CreateStockAlertHandler,
  NotifyStockAlertsHandler,
  ProjectProductHandler,
  RecordOrderRecipientHandler,
  DispatchOrderEmailHandler,
  ForgetCustomerHandler,
];
