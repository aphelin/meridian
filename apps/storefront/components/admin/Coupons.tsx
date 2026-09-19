"use client";

import type { CouponDto, CouponInput } from "@meridian/contracts";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, shortDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { focusFirstInvalid } from "@/lib/validation";
import { EmptyState, ErrorState, eurosInput, Field, PageHeader, parseEuros, StateChip, TableSkeleton, useNow } from "./kit";

/** ISO timestamp to the value of a `datetime-local` input in the viewer's time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function couponValueLabel(c: Pick<CouponDto, "type" | "value">) {
  return c.type === "percent" ? `${c.value}% off` : `${money(c.value)} off`;
}

function CouponDialog({ coupon, onClose }: { coupon: CouponDto | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const editing = Boolean(coupon);
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<CouponDto["type"]>(coupon?.type ?? "percent");
  const [value, setValue] = useState(coupon ? (coupon.type === "percent" ? String(coupon.value) : eurosInput(coupon.value)) : "");
  const [minBasket, setMinBasket] = useState(coupon ? eurosInput(coupon.minBasketCents) : "0");
  const [maxRedemptions, setMaxRedemptions] = useState(coupon?.maxRedemptions ? String(coupon.maxRedemptions) : "");
  const [oncePerCustomer, setOncePerCustomer] = useState(coupon?.oncePerCustomer ?? false);
  const [active, setActive] = useState(coupon?.active ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(coupon?.expiresAt ?? null));
  const [touched, setTouched] = useState(false);

  const done = (saved: CouponDto) => {
    toast.success(editing ? `Coupon ${saved.code} updated` : `Coupon ${saved.code} created`);
    void utils.admin.coupons.list.invalidate();
    onClose();
  };
  const create = trpc.admin.coupons.create.useMutation({ onSuccess: done });
  const update = trpc.admin.coupons.update.useMutation({ onSuccess: done });
  const pending = create.isPending || update.isPending;

  const errors: Record<string, string | null> = {
    code: /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code) ? null : "Use 2–32 capital letters, numbers, hyphens or underscores.",
    value:
      type === "percent"
        ? /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100
          ? null
          : "Enter a whole percentage from 1 to 100."
        : (parseEuros(value) ?? 0) >= 1
          ? null
          : "Enter an amount in euros, like 50.",
    minBasket: parseEuros(minBasket) === null ? "Enter an amount in euros, or 0 for no minimum." : null,
    maxRedemptions: !maxRedemptions || (/^\d+$/.test(maxRedemptions) && Number(maxRedemptions) >= 1) ? null : "Enter a whole number, or leave empty for no limit.",
    window: startsAt && expiresAt && fromLocalInput(startsAt)! >= fromLocalInput(expiresAt)! ? "The coupon must end after it starts." : null,
  };
  const shown = (key: string) => (touched ? errors[key] : null);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-xl">
        <DialogTitle>{editing ? `Edit ${coupon!.code}` : "New coupon"}</DialogTitle>
        <DialogDescription className="mt-2">Coupons apply at checkout; the quote explains why one doesn’t apply.</DialogDescription>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (Object.values(errors).some(Boolean)) return focusFirstInvalid(e.currentTarget);
            const terms: Omit<CouponInput, "code"> = {
              type,
              value: type === "percent" ? Number(value) : parseEuros(value)!,
              minBasketCents: parseEuros(minBasket)!,
              maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
              oncePerCustomer,
              active,
              startsAt: fromLocalInput(startsAt),
              expiresAt: fromLocalInput(expiresAt),
            };
            if (coupon) update.mutate({ code: coupon.code, patch: terms });
            else create.mutate({ code, ...terms });
          }}
        >
          <Field label="Code" htmlFor="coupon-code" error={editing ? null : shown("code")} hint={editing ? "Codes can’t be changed." : undefined}>
            <Input id="coupon-code" className="uppercase tabular" value={code} disabled={editing} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={!editing && !!shown("code")} />
          </Field>
          <Field label="Discount type" htmlFor="coupon-type">
            <Select value={type} onValueChange={(v) => setType(v as CouponDto["type"])}>
              <SelectTrigger id="coupon-type" className="h-[50px] rounded-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="percent">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={type === "percent" ? "Discount (%)" : "Discount (€)"} htmlFor="coupon-value" error={shown("value")}>
            <Input id="coupon-value" inputMode="decimal" className="tabular" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!shown("value")} />
          </Field>
          <Field label="Minimum basket (€)" htmlFor="coupon-min" error={shown("minBasket")}>
            <Input id="coupon-min" inputMode="decimal" className="tabular" value={minBasket} onChange={(e) => setMinBasket(e.target.value)} aria-invalid={!!shown("minBasket")} />
          </Field>
          <Field label="Maximum redemptions" htmlFor="coupon-max" error={shown("maxRedemptions")} hint="Empty for no limit.">
            <Input id="coupon-max" inputMode="numeric" className="tabular" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} aria-invalid={!!shown("maxRedemptions")} />
          </Field>
          <div className="grid content-center gap-3">
            <Label className="flex cursor-pointer items-center gap-2.5 font-normal">
              <Checkbox checked={oncePerCustomer} onCheckedChange={(v) => setOncePerCustomer(v === true)} />
              Once per customer
            </Label>
            <div className="flex items-center gap-2.5">
              <Switch id="coupon-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="coupon-active" className="mb-0 cursor-pointer font-normal">
                Active
              </Label>
            </div>
          </div>
          <Field label="Starts (optional)" htmlFor="coupon-starts">
            <Input id="coupon-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends (optional)" htmlFor="coupon-ends" error={shown("window")}>
            <Input id="coupon-ends" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-invalid={!!shown("window")} />
          </Field>
          <ErrorState className="sm:col-span-2" error={create.error ?? update.error} what="The coupon was not saved" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="quiet" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" pending={pending}>
              {editing ? "Save coupon" : "Create coupon"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CouponsPage() {
  const utils = trpc.useUtils();
  const coupons = trpc.admin.coupons.list.useQuery();
  const now = useNow(60_000);
  const [editing, setEditing] = useState<CouponDto | "new" | null>(null);
  const toggle = trpc.admin.coupons.update.useMutation({
    onSuccess: (saved) => {
      toast.success(`Coupon ${saved.code} ${saved.active ? "activated" : "deactivated"}`);
      void utils.admin.coupons.list.invalidate();
    },
  });

  return (
    <div>
      <PageHeader
        title="Coupons"
        description="Discount codes, their limits and how often they’ve been redeemed."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            New coupon
          </Button>
        }
      />
      <ErrorState className="mt-5" error={coupons.error ?? toggle.error} what={coupons.error ? "Coupons could not be loaded" : "Coupon not updated"} />
      <div className="mt-6">
        {coupons.isPending ? (
          <TableSkeleton rows={4} />
        ) : coupons.data && !coupons.data.length ? (
          <EmptyState title="No coupons yet" body="Create one to offer a discount at checkout." />
        ) : coupons.data ? (
          <Table className="min-w-[860px]" aria-label="Coupons">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Min. basket</TableHead>
                <TableHead className="text-right">Redeemed</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Active</TableHead>
                <TableHead aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...coupons.data]
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((c) => {
                  const expired = c.expiresAt ? Date.parse(c.expiresAt) < now : false;
                  return (
                    <TableRow key={c.code}>
                      <TableCell>
                        <span className="font-medium tabular">{c.code}</span>
                        {c.oncePerCustomer ? <span className="block text-sm text-stone">Once per customer</span> : null}
                      </TableCell>
                      <TableCell>{couponValueLabel(c)}</TableCell>
                      <TableCell className="text-right tabular">{c.minBasketCents ? money(c.minBasketCents) : "—"}</TableCell>
                      <TableCell className="text-right tabular">
                        {c.redemptions}
                        {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-stone">
                        {c.startsAt || c.expiresAt ? `${c.startsAt ? shortDate(c.startsAt) : "Now"} – ${c.expiresAt ? shortDate(c.expiresAt) : "open"}` : "Always"}
                        {expired ? (
                          <span className="ml-2">
                            <StateChip tone="muted">Expired</StateChip>
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={c.active}
                          disabled={toggle.isPending && toggle.variables?.code === c.code}
                          onCheckedChange={(active) => toggle.mutate({ code: c.code, patch: { active } })}
                          aria-label={`${c.code} active`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="secondary" size="sm" className="!min-h-9" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        ) : null}
      </div>
      {editing ? <CouponDialog key={editing === "new" ? "new" : editing.code} coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
