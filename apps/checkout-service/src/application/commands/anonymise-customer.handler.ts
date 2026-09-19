import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CartRepository, OrderRepository } from "../../domain";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { AnonymiseCustomerCommand } from "./anonymise-customer.command";

export const CHECKOUT_IDENTITY_GROUP = "checkout-identity";

/** UserDeleted: strips personal data from the user's orders and deletes their cart, once per message. */
@CommandHandler(AnonymiseCustomerCommand)
export class AnonymiseCustomerHandler implements ICommandHandler<AnonymiseCustomerCommand, { orders: number }> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly carts: CartRepository,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
  ) {}

  execute(command: AnonymiseCustomerCommand): Promise<{ orders: number }> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        let changed = 0;
        await this.outbox.once(tx, CHECKOUT_IDENTITY_GROUP, command.messageId, async () => {
          for (const order of await this.orders.findByUserId(command.userId, tx)) {
            if (!order.anonymiseCustomer()) continue;
            await this.orders.save(order, tx);
            changed++;
          }
          await this.carts.deleteByUserId(command.userId, tx);
        });
        return { orders: changed };
      }),
    );
  }
}
