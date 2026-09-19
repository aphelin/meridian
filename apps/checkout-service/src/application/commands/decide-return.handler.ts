import type { ReturnDto } from "@meridian/contracts";
import { CLOCK, type Clock, NotFoundError } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { AuditLog, auditEntry, OrderRepository } from "../../domain";
import { toReturnDto } from "../mappers/order-dto.mapper";
import { MessageOutbox, UnitOfWork } from "../ports";
import { retryOnConflict } from "../services";
import { refundCommandPayload } from "./refund-payload";
import { DecideReturnCommand } from "./decide-return.command";

/**
 * Admin decision on a requested return, atomically:
 *   - approve: ReturnApproved + `payment.refund` (default amount = returned line totals with the discount pro-rated)
 *     + `inventory.restock` for the returned lines unless `restock: false`;
 *   - reject: ReturnRejected with the note; nothing is refunded or restocked.
 * A decided return cannot be decided again (409).
 */
@CommandHandler(DecideReturnCommand)
export class DecideReturnHandler implements ICommandHandler<DecideReturnCommand, ReturnDto> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly audit: AuditLog,
    private readonly uow: UnitOfWork,
    private readonly outbox: MessageOutbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute({ returnId, actorId, decision }: DecideReturnCommand): Promise<ReturnDto> {
    return retryOnConflict(() =>
      this.uow.run(async (tx) => {
        const order = await this.orders.findByReturnId(returnId, tx);
        if (!order) throw new NotFoundError("Return not found.");
        const now = this.clock.now();
        const outcome = order.decideReturn({ returnId, approve: decision.approve, refundCents: decision.refundCents, restock: decision.restock, note: decision.note }, now);
        await this.orders.save(order, tx);
        await this.outbox.events(tx, order.pullEvents());
        const aggregate = { type: "Order", id: order.id };
        if (outcome.refund) await this.outbox.command(tx, "payment.refund", refundCommandPayload(order.id, outcome.refund), aggregate);
        if (outcome.restockLines.length) await this.outbox.command(tx, "inventory.restock", { orderId: order.id, returnId, lines: outcome.restockLines }, aggregate);
        await this.audit.append(
          auditEntry({
            action: outcome.approved ? "return.approve" : "return.reject",
            actorId,
            subjectType: "order",
            subjectId: order.id,
            at: now,
            meta: outcome.approved
              ? { returnId, refundId: outcome.refund?.id ?? null, refundCents: outcome.return.refundCents, restock: outcome.return.restock }
              : { returnId, note: outcome.return.note },
          }),
          tx,
        );
        return toReturnDto(order.id, outcome.return);
      }),
    );
  }
}
