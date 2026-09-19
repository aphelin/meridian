import type { ReturnDto } from "@meridian/contracts";
import { CLOCK, type Clock, DomainError, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { OrderRepository } from "../../domain";
import { toReturnDto } from "../mappers/order-dto.mapper";
import { MessageOutbox, OrderAccessTokens, UnitOfWork } from "../ports";
import { actsAsCustomer, retryOnConflict } from "../services";
import { RequestReturnCommand } from "./request-return.command";

/**
 * Shopper asks to return items of a delivered order (within 30 days; quantities above purchased minus open or approved
 * returns are ORDER_NOT_RETURNABLE). ReturnRequested is written with the return in one transaction.
 */
@CommandHandler(RequestReturnCommand)
export class RequestReturnHandler implements ICommandHandler<RequestReturnCommand, ReturnDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly tokens: OrderAccessTokens,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(command: RequestReturnCommand): Promise<ReturnDto> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findById(command.orderId, tx);
        if (!order) throw new NotFoundError("Order not found.");
        if (!actsAsCustomer(order, command.viewer, command.accessToken, this.tokens)) throw new DomainError("FORBIDDEN", "You do not have access to this order.");
        const request = order.requestReturn({ lines: command.lines, reason: command.reason }, this.clock.now());
        await this.orders.save(order, tx);
        await this.outbox.events(tx, order.pullEvents());
        return toReturnDto(order.id, request);
      }),
    );
  }
}
