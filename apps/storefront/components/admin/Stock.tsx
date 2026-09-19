"use client";

import type { AdminStockDto } from "@meridian/contracts";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Icon } from "@/components/ui/Icon";
import { useCatalog } from "@/lib/catalog-context";
import { bySku } from "@/lib/product";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { compactDateTime, dateTime, EmptyState, ErrorState, Field, PageHeader, RowCard, RowCards, StateChip, TableFrom, TableSkeleton } from "./kit";

function AdjustDialog({ item, name, onClose }: { item: AdminStockDto; name: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"delta" | "onHand">("delta");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const adjust = trpc.admin.stock.adjust.useMutation({
    onSuccess: (saved) => {
      toast.success(`${saved.sku} now has ${saved.onHand} on hand`, { description: `${saved.available} available to sell` });
      void utils.admin.stock.invalidate();
      onClose();
    },
  });
  const n = Number(value);
  const valueError = !/^-?\d+$/.test(value.trim())
    ? "Enter a whole number."
    : mode === "onHand" && n < 0
      ? "On hand can’t be negative."
      : mode === "delta" && n === 0
        ? "Enter a change other than zero."
        : mode === "delta" && item.onHand + n < 0
          ? `You can remove at most ${item.onHand}.`
          : null;
  const reasonError = reason.trim() ? null : "Give a reason; it is kept in the movement log.";

  return (
    <Dialog open onOpenChange={(open) => !open && !adjust.isPending && onClose()}>
      <DialogContent className="p-6">
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription className="mt-2">
          {name} · <span className="tabular">{item.sku}</span> · {item.onHand} on hand, {item.reserved} reserved
        </DialogDescription>
        <form
          className="mt-5 grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valueError || reasonError) return focusFirstInvalid(e.currentTarget);
            adjust.mutate(mode === "delta" ? { sku: item.sku, delta: n, reason: reason.trim() } : { sku: item.sku, onHand: n, reason: reason.trim() });
          }}
        >
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "delta" | "onHand")} className="flex flex-wrap gap-4" aria-label="Adjustment type">
            <Label className="flex cursor-pointer items-center gap-2 font-normal">
              <RadioGroupItem value="delta" /> Change by
            </Label>
            <Label className="flex cursor-pointer items-center gap-2 font-normal">
              <RadioGroupItem value="onHand" /> Set on hand to
            </Label>
          </RadioGroup>
          <Field label={mode === "delta" ? "Change (use a minus sign to remove)" : "New on-hand quantity"} htmlFor="stock-value" error={touched ? valueError : null}>
            <Input id="stock-value" inputMode="numeric" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={touched && !!valueError} />
          </Field>
          <Field label="Reason" htmlFor="stock-reason" error={touched ? reasonError : null}>
            <Input id="stock-reason" placeholder="Cycle count, damaged in warehouse…" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={touched && !!reasonError} />
          </Field>
          <ErrorState error={adjust.error} what="Adjustment refused" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="quiet" size="sm" onClick={onClose} disabled={adjust.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" pending={adjust.isPending}>
              Save adjustment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Movements({ sku, name, onClose }: { sku: string; name: string; onClose: () => void }) {
  const movements = trpc.admin.stock.movements.useQuery({ sku });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[min(520px,100vw)]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <SheetTitle>Stock movements</SheetTitle>
            <SheetDescription>
              {name} · <span className="tabular">{sku}</span>
            </SheetDescription>
          </div>
          <SheetClose className="icon-btn" aria-label="Close">
            <Icon name="close" size={20} />
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ErrorState error={movements.error} what="Movements could not be loaded" />
          {movements.isPending ? (
            <div className="grid gap-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : movements.data && !movements.data.length ? (
            <EmptyState title="No movements yet" body="Adjustments, reservations and returns are logged here." />
          ) : (
            <ol className="divide-y divide-line" aria-label="Movements">
              {movements.data?.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.reason}</p>
                    <p className="text-sm text-stone">
                      {dateTime(m.createdAt)}
                      {m.actorId ? ` · admin ${m.actorId.slice(0, 8)}` : ""}
                      {m.orderId ? ` · order ${m.orderId.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular">
                    <p className={m.delta < 0 ? "text-ink" : "font-medium"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</p>
                    <p className="text-sm text-stone">{m.onHandAfter} after</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StockPage() {
  const catalog = useCatalog();
  const stock = trpc.admin.stock.list.useQuery();
  const [filter, setFilter] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<AdminStockDto | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const nameOf = (sku: string) => {
    const meta = bySku(catalog, sku);
    return meta ? `${meta.product.name}, ${meta.variant.label}` : "Unpublished piece";
  };

  const needle = filter.trim().toLowerCase();
  const rows = (stock.data ?? [])
    .map((s) => ({ ...s, name: nameOf(s.sku) }))
    .filter((s) => (!needle || `${s.sku} ${s.name}`.toLowerCase().includes(needle)) && (!lowOnly || s.available <= 2))
    .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
  const low = (stock.data ?? []).filter((s) => s.available <= 2).length;

  return (
    <div>
      <PageHeader title="Stock" description="On hand, reserved by unpaid orders and available to sell, per SKU. Every change is logged as a movement." />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">Filter stock</span>
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone" />
          <input type="search" className="field !min-h-10 w-full sm:w-64 !rounded-full !pl-10 text-sm" placeholder="Name or SKU" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <button type="button" className="chip" aria-pressed={lowOnly} onClick={() => setLowOnly((v) => !v)}>
          Low stock{stock.data ? ` (${low})` : ""}
        </button>
      </div>
      <ErrorState className="mt-5" error={stock.error} what="Stock could not be loaded" />
      <div className="mt-5">
        {stock.isPending ? (
          <TableSkeleton rows={8} />
        ) : stock.data && !rows.length ? (
          <EmptyState title="No SKUs match" body={needle || lowOnly ? "Clear the filter to see every SKU." : "Stock items are created when products are published."} />
        ) : stock.data ? (
          <>
            {/* Below xl each SKU is a card with its numbers and actions; the table needs xl before its action column fits. */}
            <RowCards at="xl" label="Stock levels">
              {rows.map((s) => (
                <RowCard key={s.sku}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="break-all text-sm text-stone tabular">{s.sku}</p>
                    </div>
                    <StateChip tone={s.available <= 0 ? "muted" : s.available <= 2 ? "warn" : "ok"}>
                      <span className="tabular">{s.available}</span> available
                    </StateChip>
                  </div>
                  <p className="flex flex-wrap justify-between gap-x-3 text-sm text-stone">
                    <span>
                      On hand <span className="text-ink tabular">{s.onHand}</span> · Reserved <span className="text-ink tabular">{s.reserved}</span>
                    </span>
                    <span className="whitespace-nowrap tabular">{compactDateTime(s.updatedAt)}</span>
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" className="!min-h-9" onClick={() => setAdjusting(s)} aria-label={`Adjust ${s.sku}`}>
                      Adjust
                    </Button>
                    <Button variant="quiet" size="sm" className="!min-h-9" onClick={() => setViewing(s.sku)} aria-label={`Movements for ${s.sku}`}>
                      Movements
                    </Button>
                  </div>
                </RowCard>
              ))}
            </RowCards>
            <TableFrom at="xl">
              <Table compact className="min-w-[780px]" aria-label="Stock levels">
                <TableHeader>
                  <TableRow>
                    <TableHead>Piece</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => (
                    <TableRow key={s.sku}>
                      <TableCell className="min-w-[10rem] font-medium">{s.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-stone tabular">{s.sku}</TableCell>
                      <TableCell className="text-right tabular">{s.onHand}</TableCell>
                      <TableCell className="text-right tabular">{s.reserved}</TableCell>
                      <TableCell className="text-right">
                        <StateChip tone={s.available <= 0 ? "muted" : s.available <= 2 ? "warn" : "ok"}>
                          <span className="tabular">{s.available}</span>
                        </StateChip>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-stone tabular" title={dateTime(s.updatedAt)}>
                        {compactDateTime(s.updatedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="secondary" size="sm" className="!min-h-9" onClick={() => setAdjusting(s)} aria-label={`Adjust ${s.sku}`}>
                            Adjust
                          </Button>
                          <Button variant="quiet" size="sm" className="!min-h-9" onClick={() => setViewing(s.sku)} aria-label={`Movements for ${s.sku}`}>
                            Movements
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrom>
          </>
        ) : null}
      </div>
      {adjusting ? <AdjustDialog item={adjusting} name={nameOf(adjusting.sku)} onClose={() => setAdjusting(null)} /> : null}
      {viewing ? <Movements sku={viewing} name={nameOf(viewing)} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
