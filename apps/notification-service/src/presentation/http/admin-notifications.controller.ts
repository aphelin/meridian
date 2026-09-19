import type { ContactMessageListDto, EmailDeliveryListDto } from "@meridian/contracts";
import { AdminOnly, parseWith } from "@meridian/nest-kit";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { ListContactMessagesQuery, ListEmailDeliveriesQuery } from "../../application/queries";
import { contactMessagesQuerySchema, deliveriesQuerySchema } from "./schemas";

@Controller("admin")
@AdminOnly()
export class AdminNotificationsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get("emails")
  emails(@Query() query: unknown): Promise<EmailDeliveryListDto> {
    return this.queryBus.execute(new ListEmailDeliveriesQuery(parseWith(deliveriesQuerySchema, query)));
  }

  @Get("contact-messages")
  contactMessages(@Query() query: unknown): Promise<ContactMessageListDto> {
    return this.queryBus.execute(new ListContactMessagesQuery(parseWith(contactMessagesQuerySchema, query)));
  }
}
