import { ensure } from "@meridian/kernel";
import { newId } from "../shared/ids";
import type { TransactionContext } from "../shared/transaction";

export type AuditAction =
  | "order.transition"
  | "order.refund"
  | "order.cancel"
  | "return.approve"
  | "return.reject"
  | "coupon.create"
  | "coupon.update";

export type AuditSubject = "order" | "coupon";

/** Who did what to which record, when. Written in the same transaction as the change it describes. */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  subjectType: AuditSubject;
  subjectId: string;
  /** Order the entry belongs to (lists the order's audit trail); null for coupon changes. */
  orderId: string | null;
  at: Date;
  meta: Record<string, unknown>;
}

export function auditEntry(input: Omit<AuditEntry, "id" | "orderId"> & { orderId?: string | null }): AuditEntry {
  ensure(input.actorId.trim().length > 0, "UNAUTHORIZED", "An audited change needs an actor.");
  return {
    id: newId(),
    action: input.action,
    actorId: input.actorId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    orderId: input.orderId ?? (input.subjectType === "order" ? input.subjectId : null),
    at: input.at,
    meta: structuredClone(input.meta),
  };
}

export abstract class AuditLog {
  abstract append(entry: AuditEntry, tx: TransactionContext): Promise<void>;
  /** The order's entries, oldest first. */
  abstract forOrder(orderId: string): Promise<AuditEntry[]>;
}
