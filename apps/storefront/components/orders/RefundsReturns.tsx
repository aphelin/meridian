import type { OrderDto, RefundDto, ReturnDto } from "@meridian/contracts";
import { money, shortDate } from "@/lib/format";

const returnStatus: Record<ReturnDto["status"], { label: string; tone: string }> = {
  requested: { label: "Awaiting review", tone: "status-warn" },
  approved: { label: "Approved", tone: "status-ok" },
  refunded: { label: "Refunded", tone: "status-ok" },
  rejected: { label: "Rejected", tone: "status-muted" },
};

const refundStatus: Record<RefundDto["status"], { label: string; tone: string }> = {
  pending: { label: "Processing", tone: "status-warn" },
  succeeded: { label: "Refunded", tone: "status-ok" },
  failed: { label: "Failed", tone: "status-muted" },
};

export function ReturnsList({ order }: { order: OrderDto }) {
  if (!order.returns.length) return null;
  const names = new Map(order.lines.map((l) => [l.sku, `${l.productName} (${l.variantLabel})`]));
  return (
    <section aria-labelledby="returns-title">
      <h2 id="returns-title" className="heading">
        Returns
      </h2>
      <ul className="mt-5 grid gap-3" aria-label="Returns">
        {order.returns.map((r) => (
          <li key={r.id} className="rounded-[14px] bg-raised p-4 shadow-[inset_0_0_0_1px_var(--color-line)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">Return requested {shortDate(r.createdAt)}</p>
              <span className={`status ${returnStatus[r.status].tone}`}>{returnStatus[r.status].label}</span>
            </div>
            <ul className="mt-2 text-[0.9375rem]">
              {r.lines.map((l) => (
                <li key={l.sku}>
                  <span className="tabular">{l.qty}</span> × {names.get(l.sku) ?? l.sku}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm text-stone">Reason: {r.reason}</p>
            {r.refundCents !== null && r.status !== "rejected" ? (
              <p className="mt-1 text-sm">
                Refund <span className="tabular">{money(r.refundCents)}</span>
              </p>
            ) : null}
            {r.note ? <p className="mt-1 text-sm text-stone">Note from the shop: {r.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RefundsList({ order }: { order: OrderDto }) {
  if (!order.refunds.length) return null;
  return (
    <section aria-labelledby="refunds-title">
      <h2 id="refunds-title" className="heading">
        Refunds
      </h2>
      <ul className="mt-5 divide-y divide-line border-y border-line" aria-label="Refunds">
        {order.refunds.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular">{money(r.amountCents)}</p>
              <p className="text-sm text-stone">
                {r.reason} · {shortDate(r.createdAt)}
              </p>
            </div>
            <span className={`status ${refundStatus[r.status].tone}`}>{refundStatus[r.status].label}</span>
          </li>
        ))}
      </ul>
      {order.refunds.some((r) => r.status === "failed") ? <p className="hint">A failed refund is retried by our team. Contact us if it doesn’t arrive.</p> : null}
    </section>
  );
}
