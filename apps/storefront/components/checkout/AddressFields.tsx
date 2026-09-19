"use client";

import type { AddressDto, PostalAddress } from "@meridian/contracts";
import { useId } from "react";
import { Field, FieldError, FieldLabel, useFieldIds } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { rules, type FieldErrors } from "@/lib/validation";

export const COUNTRIES = [
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Belgium" },
  { code: "DK", label: "Denmark" },
  { code: "FR", label: "France" },
  { code: "GE", label: "Georgia" },
  { code: "DE", label: "Germany" },
  { code: "IE", label: "Ireland" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "PL", label: "Poland" },
  { code: "ES", label: "Spain" },
  { code: "SE", label: "Sweden" },
  { code: "GB", label: "United Kingdom" },
  { code: "US", label: "United States" },
];

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.label ?? code;

export type AddressDraft = { fullName: string; line1: string; line2: string; city: string; postalCode: string; country: string; phone: string };

export const EMPTY_ADDRESS: AddressDraft = { fullName: "", line1: "", line2: "", city: "", postalCode: "", country: "DE", phone: "" };

/** Checks matching checkout-service's postal address schema. */
export const ADDRESS_RULES = {
  fullName: [rules.required("Enter the name for delivery.")],
  line1: [rules.required("Enter the street address.")],
  postalCode: [rules.required("Enter the postal code.")],
  city: [rules.required("Enter the city.")],
  phone: [rules.pattern(/^[0-9+()\-.\s]*$/, "Use only digits, spaces and + ( ) - . in the phone number.")],
};

export function toPostal(a: AddressDraft | AddressDto): PostalAddress {
  const text = (v: string | null) => (v ?? "").trim();
  return {
    fullName: text(a.fullName),
    line1: text(a.line1),
    line2: text(a.line2) || null,
    city: text(a.city),
    postalCode: text(a.postalCode),
    country: a.country.toUpperCase(),
    phone: text(a.phone) || null,
  };
}

function TextField({
  label,
  value,
  onChange,
  error,
  className,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void; error?: string; className?: string } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "className">) {
  return (
    <Field className={className} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <FieldInput value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function FieldInput(props: React.ComponentProps<"input">) {
  return <Input {...useFieldIds()} {...props} />;
}

export function CountrySelect({ value, onChange, label = "Country", error }: { value: string; onChange: (code: string) => void; label?: string; error?: string }) {
  const id = useId();
  const options = COUNTRIES.some((c) => c.code === value) ? COUNTRIES : [...COUNTRIES, { code: value, label: value }];
  return (
    <div>
      <span className="label" id={id}>
        {label}
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

/** Shipping address form; the address is only checked while these fields are shown (not behind a saved address). */
export function AddressFields({ value, onChange, errors = {} }: { value: AddressDraft; onChange: (next: AddressDraft) => void; errors?: FieldErrors<keyof AddressDraft> }) {
  const set = (key: keyof AddressDraft) => (v: string) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 min-[480px]:grid-cols-2">
      <TextField className="min-[480px]:col-span-2" label="Full name" aria-required maxLength={120} autoComplete="shipping name" value={value.fullName} onChange={set("fullName")} error={errors.fullName} />
      <TextField className="min-[480px]:col-span-2" label="Address" aria-required maxLength={200} autoComplete="shipping address-line1" value={value.line1} onChange={set("line1")} error={errors.line1} />
      <TextField className="min-[480px]:col-span-2" label="Apartment, floor (optional)" maxLength={200} autoComplete="shipping address-line2" value={value.line2} onChange={set("line2")} error={errors.line2} />
      <TextField label="Postal code" aria-required maxLength={20} autoComplete="shipping postal-code" value={value.postalCode} onChange={set("postalCode")} error={errors.postalCode} />
      <TextField label="City" aria-required maxLength={100} autoComplete="shipping address-level2" value={value.city} onChange={set("city")} error={errors.city} />
      <CountrySelect value={value.country} onChange={set("country")} error={errors.country} />
      <TextField label="Phone (optional)" type="tel" maxLength={40} autoComplete="shipping tel" value={value.phone} onChange={set("phone")} error={errors.phone} />
    </div>
  );
}

const cardClass =
  "flex cursor-pointer gap-3 rounded-[14px] bg-raised p-4 shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-ink)] has-[[data-state=checked]]:shadow-[inset_0_0_0_2px_var(--color-ink)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt";

export const NEW_ADDRESS = "new";

/** Radio cards of the signed-in shopper's saved addresses, plus "Use a new address". */
export function SavedAddressPicker({ addresses, value, onChange }: { addresses: AddressDto[]; value: string; onChange: (id: string) => void }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-label="Saved addresses" className="sm:grid-cols-2">
      {addresses.map((a) => (
        <label key={a.id} htmlFor={`address-${a.id}`} className={cardClass}>
          <RadioGroupItem id={`address-${a.id}`} value={a.id} className="mt-0.5" aria-label={`${a.label ? `${a.label}: ` : ""}${a.fullName}, ${a.line1}, ${a.city}`} />
          <span className="min-w-0 flex-1 text-[0.9375rem]">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {a.label || a.fullName}
              {a.isDefault ? <span className="status status-muted !py-0.5">Default</span> : null}
            </span>
            {a.label ? <span className="block text-stone">{a.fullName}</span> : null}
            <span className="block text-stone">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}
            </span>
            <span className="block text-stone">
              {a.postalCode} {a.city}, {countryName(a.country)}
            </span>
          </span>
        </label>
      ))}
      <label htmlFor="address-new" className={cardClass}>
        <RadioGroupItem id="address-new" value={NEW_ADDRESS} className="mt-0.5" aria-label="Use a new address" />
        <span className="font-medium">Use a new address</span>
      </label>
    </RadioGroup>
  );
}

export function SavedAddressSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading saved addresses">
      <Skeleton className="h-28 !rounded-[14px]" />
      <Skeleton className="h-28 !rounded-[14px]" />
    </div>
  );
}
