import type { ContactMessageListDto, EmailDeliveryDto, EmailDeliveryListDto, EmailTemplate } from "@meridian/contracts";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotificationReadModel } from "../ports";

export class ListEmailDeliveriesQuery {
  constructor(readonly filter: { status?: EmailDeliveryDto["status"]; template?: EmailTemplate; cursor?: string; limit: number }) {}
}

export class ListContactMessagesQuery {
  constructor(readonly filter: { cursor?: string; limit: number }) {}
}

@QueryHandler(ListEmailDeliveriesQuery)
export class ListEmailDeliveriesHandler implements IQueryHandler<ListEmailDeliveriesQuery, EmailDeliveryListDto> {
  constructor(private readonly readModel: NotificationReadModel) {}

  execute({ filter }: ListEmailDeliveriesQuery): Promise<EmailDeliveryListDto> {
    return this.readModel.listDeliveries(filter);
  }
}

@QueryHandler(ListContactMessagesQuery)
export class ListContactMessagesHandler implements IQueryHandler<ListContactMessagesQuery, ContactMessageListDto> {
  constructor(private readonly readModel: NotificationReadModel) {}

  execute({ filter }: ListContactMessagesQuery): Promise<ContactMessageListDto> {
    return this.readModel.listContactMessages(filter);
  }
}

export const QueryHandlers = [ListEmailDeliveriesHandler, ListContactMessagesHandler];
