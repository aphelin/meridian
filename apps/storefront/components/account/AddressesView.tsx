"use client";

import type { AddressDto, AddressInput } from "@meridian/contracts";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { COUNTRIES, countryName } from "./countries";
import { ErrorState, FormError, TextField } from "./shared";

export const MAX_ADDRESSES = 10;

type Draft = { label: string; fullName: string; line1: string; line2: string; postalCode: string; city: string; country: string; phone: string; isDefault: boolean };

const EMPTY: Draft = { label: "", fullName: "", line1: "", line2: "", postalCode: "", city: "", country: "DE", phone: "", isDefault: false };

const toDraft = (a: AddressDto): Draft => ({
  label: a.label ?? "",
  fullName: a.fullName,
  line1: a.line1,
  line2: a.line2 ?? "",
  postalCode: a.postalCode,
  city: a.city,
  country: a.country,
  phone: a.phone ?? "",
  isDefault: a.isDefault,
});

const toInput = (d: Draft): AddressInput => ({
  label: d.label.trim() || null,
  fullName: d.fullName.trim(),
  line1: d.line1.trim(),
  line2: d.line2.trim() || null,
  postalCode: d.postalCode.trim(),
  city: d.city.trim(),
  country: d.country,
  phone: d.phone.trim() || null,
  isDefault: d.isDefault,
});

const title = (a: AddressDto) => a.label || a.fullName;

/** Required address lines, plus identity's 32-character limit on phone numbers (the BFF allows 40). */
const ADDRESS_RULES = {
  fullName: [rules.required("Enter the name for delivery.")],
  line1: [rules.required("Enter the street address.")],
  postalCode: [rules.required("Enter the postal code.")],
  city: [rules.required("Enter the city.")],
  phone: [rules.maxLength(32, "Phone numbers can be at most 32 characters.")],
};

type DraftText = Exclude<keyof Draft, "isDefault">;

/** Server field names for the draft: zod paths from add and update, and identity's `details.field` labels. */
const SERVER_FIELDS: Record<string, DraftText> = {};
for (const [key, label] of [
  ["label", "Label"],
  ["fullName", "Full name"],
  ["line1", "Address line 1"],
  ["line2", "Address line 2"],
  ["postalCode", "Postal code"],
  ["city", "City"],
  ["country", "country"],
  ["phone", "Phone"],
] as [DraftText, string][]) {
  SERVER_FIELDS[key] = key;
  SERVER_FIELDS[`patch.${key}`] = key;
  SERVER_FIELDS[label] = key;
}

function CountrySelect({ value, onChange, error }: { value: string; onChange: (code: string) => void; error?: string | null }) {
  const id = useId();
  const options = COUNTRIES.some((c) => c.code === value) ? [...COUNTRIES] : [...COUNTRIES, { code: value, label: value }];
  return (
    <div>
      <span className="label" id={id}>
        Country
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-labelledby={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-[50px] w-full rounded-[12px] text-[0.9375rem]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Add or edit dialog. `address` null = add. */
function AddressDialog({ open, onOpenChange, address, forceDefault }: { open: boolean; onOpenChange: (open: boolean) => void; address: AddressDto | null; forceDefault: boolean }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Draft>(address ? toDraft(address) : { ...EMPTY, isDefault: forceDefault });
  const defaultId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors<DraftText>(draft, ADDRESS_RULES);
  const done = async (saved: AddressDto) => {
    await utils.account.addresses.list.invalidate();
    onOpenChange(false);
    toast(address ? "Address updated" : "Address saved", { description: `${title(saved)}, ${saved.city}` });
  };
  const onError = (error: Parameters<typeof fieldErrorsOf>[0]) => fields.showServer(fieldErrorsOf(error, SERVER_FIELDS), formRef.current);
  const add = trpc.account.addresses.add.useMutation({ onSuccess: done, onError });
  const update = trpc.account.addresses.update.useMutation({ onSuccess: done, onError });
  const active = address ? update : add;
  const set = (key: keyof Draft) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (active.isError) active.reset();
  };
  // The only address is always the default; an existing default is moved by choosing another one.
  const lockedDefault = forceDefault || Boolean(address?.isDefault);

  return (
    <Dialog open={open} onOpenChange={(value) => !active.isPending && onOpenChange(value)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-xl sm:p-8">
        <DialogTitle>{address ? "Edit address" : "Add an address"}</DialogTitle>
        <DialogDescription className="mt-1">Saved addresses appear at checkout.</DialogDescription>
        <form
          ref={formRef}
          className="mt-6 grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (active.isPending || !fields.check(e.currentTarget)) return;
            const input = toInput(draft);
            if (address) update.mutate({ id: address.id, patch: input });
            else add.mutate(input);
          }}
        >
          <TextField className="sm:col-span-2" label="Label (optional)" placeholder="Home, Studio…" maxLength={40} value={draft.label} onChange={set("label")} error={fields.errors.label} />
          <TextField className="sm:col-span-2" label="Full name" aria-required maxLength={120} autoComplete="name" value={draft.fullName} onChange={set("fullName")} error={fields.errors.fullName} />
          <TextField className="sm:col-span-2" label="Address" aria-required maxLength={200} autoComplete="address-line1" value={draft.line1} onChange={set("line1")} error={fields.errors.line1} />
          <TextField className="sm:col-span-2" label="Apartment, floor (optional)" maxLength={200} autoComplete="address-line2" value={draft.line2} onChange={set("line2")} error={fields.errors.line2} />
          <TextField label="Postal code" aria-required maxLength={20} autoComplete="postal-code" value={draft.postalCode} onChange={set("postalCode")} error={fields.errors.postalCode} />
          <TextField label="City" aria-required maxLength={100} autoComplete="address-level2" value={draft.city} onChange={set("city")} error={fields.errors.city} />
          <CountrySelect value={draft.country} onChange={set("country")} error={fields.errors.country} />
          <TextField label="Phone (optional)" type="tel" maxLength={40} autoComplete="tel" value={draft.phone} onChange={set("phone")} error={fields.errors.phone} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <Checkbox
              id={defaultId}
              checked={draft.isDefault || lockedDefault}
              disabled={lockedDefault}
              onCheckedChange={(checked) => setDraft((d) => ({ ...d, isDefault: checked === true }))}
            />
            <label htmlFor={defaultId} className={`text-[0.9375rem] ${lockedDefault ? "text-stone" : "cursor-pointer"}`}>
              Use as my default address
            </label>
          </div>
          {hasErrors(fieldErrorsOf(active.error, SERVER_FIELDS)) ? null : <FormError error={active.error} className="sm:col-span-2" />}
          <div className="flex flex-wrap justify-end gap-2.5 sm:col-span-2">
            <DialogClose asChild>
              <Button type="button" variant="quiet" disabled={active.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" pending={active.isPending}>
              {address ? "Save address" : "Add address"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ address, onOpenChange }: { address: AddressDto | null; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const remove = trpc.account.addresses.remove.useMutation({
    onSuccess: async () => {
      await utils.account.addresses.list.invalidate();
      onOpenChange(false);
      toast("Address deleted");
    },
  });
  return (
    <Dialog
      open={Boolean(address)}
      onOpenChange={(value) => {
        if (remove.isPending) return;
        if (!value) remove.reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="p-6 sm:p-8">
        <DialogTitle>Delete this address?</DialogTitle>
        <DialogDescription className="mt-2">
          {address ? `${title(address)}, ${address.line1}, ${address.city} will be removed from your address book.` : null}
          {address?.isDefault ? " Your oldest remaining address becomes the default." : null}
        </DialogDescription>
        <FormError error={remove.error} className="mt-5" />
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <DialogClose asChild>
            <Button type="button" variant="quiet" disabled={remove.isPending}>
              Keep address
            </Button>
          </DialogClose>
          <Button type="button" pending={remove.isPending} onClick={() => address && remove.mutate({ id: address.id })}>
            Delete address
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddressCard({ address, onEdit, onRemove }: { address: AddressDto; onEdit: () => void; onRemove: () => void }) {
  const utils = trpc.useUtils();
  const makeDefault = trpc.account.addresses.update.useMutation({
    onSuccess: async () => {
      await utils.account.addresses.list.invalidate();
      toast("Default address updated", { description: title(address) });
    },
  });
  const name = title(address);
  return (
    <li className="flex flex-col rounded-[14px] bg-raised p-5 shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{name}</h3>
        {address.isDefault ? <Badge tone="ok">Default</Badge> : null}
      </div>
      <address className="mt-2 flex-1 text-[0.9375rem] not-italic text-stone">
        {address.label ? <span className="block">{address.fullName}</span> : null}
        <span className="block">{address.line1}</span>
        {address.line2 ? <span className="block">{address.line2}</span> : null}
        <span className="block">
          {address.postalCode} {address.city}
        </span>
        <span className="block">{countryName(address.country)}</span>
        {address.phone ? <span className="block tabular">{address.phone}</span> : null}
      </address>
      <FormError error={makeDefault.error} className="mt-3" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onEdit} aria-label={`Edit ${name}`}>
          Edit
        </Button>
        <Button type="button" variant="quiet" size="sm" onClick={onRemove} aria-label={`Delete ${name}`}>
          Delete
        </Button>
        {address.isDefault ? null : (
          <Button
            type="button"
            variant="quiet"
            size="sm"
            pending={makeDefault.isPending}
            onClick={() => makeDefault.mutate({ id: address.id, patch: { isDefault: true } })}
            aria-label={`Make ${name} the default address`}
          >
            Make default
          </Button>
        )}
      </div>
    </li>
  );
}

/** Address book: list, add, edit, delete and choose the default (at most 10). */
export function AddressesView() {
  const addresses = trpc.account.addresses.list.useQuery();
  // `editing`: undefined = closed, null = adding, AddressDto = editing. Remounted per open so the form starts fresh.
  const [editing, setEditing] = useState<AddressDto | null | undefined>(undefined);
  const [openCount, setOpenCount] = useState(0);
  const [removing, setRemoving] = useState<AddressDto | null>(null);
  const list = addresses.data ?? [];
  const full = list.length >= MAX_ADDRESSES;
  const open = (address: AddressDto | null) => {
    setOpenCount((n) => n + 1);
    setEditing(address);
  };

  return (
    <section aria-labelledby="addresses-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="addresses-title" className="section-title">
            Addresses
          </h2>
          <p className="mt-2 text-stone">
            {addresses.data ? `${list.length} of ${MAX_ADDRESSES} saved. ` : null}Your default address is picked first at checkout.
          </p>
        </div>
        {addresses.data && list.length ? (
          <Button type="button" onClick={() => open(null)} disabled={full}>
            <Icon name="plus" size={18} />
            Add address
          </Button>
        ) : null}
      </div>
      {full ? <p className="hint mt-3">You’ve saved the maximum of {MAX_ADDRESSES} addresses. Delete one to add another.</p> : null}

      <div className="mt-8">
        {addresses.isPending ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading addresses">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton className="h-[212px] !rounded-[14px]" />
              </li>
            ))}
          </ul>
        ) : addresses.error ? (
          <ErrorState title="We couldn’t load your addresses" error={addresses.error} onRetry={() => void addresses.refetch()} />
        ) : list.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Saved addresses">
            {list.map((a) => (
              <AddressCard key={a.id} address={a} onEdit={() => open(a)} onRemove={() => setRemoving(a)} />
            ))}
          </ul>
        ) : (
          <div className="panel px-6 py-14 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
              <Icon name="package" size={24} />
            </span>
            <h3 className="heading mt-5">No saved addresses yet</h3>
            <p className="mx-auto mt-1 max-w-[42ch] text-stone">Save where your pieces should go, and checkout fills it in for you.</p>
            <Button type="button" className="mt-6" onClick={() => open(null)}>
              <Icon name="plus" size={18} />
              Add address
            </Button>
          </div>
        )}
      </div>

      {editing !== undefined ? (
        <AddressDialog
          key={openCount}
          open
          onOpenChange={(value) => !value && setEditing(undefined)}
          address={editing}
          forceDefault={editing === null && list.length === 0}
        />
      ) : null}
      <RemoveDialog key={removing?.id ?? "none"} address={removing} onOpenChange={(value) => !value && setRemoving(null)} />
    </section>
  );
}
