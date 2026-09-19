import type { AddressInput, PostalAddress } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";
import { optionalText, requiredText } from "../shared/text";

const COUNTRY = /^[A-Z]{2}$/;

export interface AddressDetails extends PostalAddress {
  label: string | null;
}

/** Validated postal address fields (value object). Country is ISO 3166-1 alpha-2 in upper case. */
export function parseAddressDetails(input: Omit<AddressInput, "isDefault">): AddressDetails {
  const country = typeof input.country === "string" ? input.country.trim().toUpperCase() : "";
  if (!COUNTRY.test(country)) throw new ValidationError("Country must be a two-letter ISO code, e.g. GE.", { field: "country" });
  return {
    label: optionalText(input.label, "Label", 40),
    fullName: requiredText(input.fullName, "Full name", 120),
    line1: requiredText(input.line1, "Address line 1", 200),
    line2: optionalText(input.line2, "Address line 2", 200),
    city: requiredText(input.city, "City", 100),
    postalCode: requiredText(input.postalCode, "Postal code", 20),
    country,
    phone: optionalText(input.phone, "Phone", 32),
  };
}

export interface AddressState extends AddressDetails {
  id: string;
  isDefault: boolean;
  createdAt: Date;
}

/** A saved address. An entity inside the User aggregate: only `User` creates, changes and removes it. */
export class Address {
  private constructor(private state: AddressState) {}

  static create(id: string, details: AddressDetails, now: Date): Address {
    return new Address({ ...details, id, isDefault: false, createdAt: now });
  }

  static rehydrate(state: AddressState): Address {
    return new Address({ ...state });
  }

  get id() {
    return this.state.id;
  }

  get isDefault() {
    return this.state.isDefault;
  }

  get details(): AddressDetails {
    const { id: _id, isDefault: _default, createdAt: _created, ...details } = this.state;
    return details;
  }

  /** @internal Called by User, which maintains the single-default invariant. */
  setDefault(value: boolean) {
    this.state.isDefault = value;
  }

  /** @internal Called by User. */
  replaceDetails(details: AddressDetails) {
    this.state = { ...this.state, ...details };
  }

  snapshot(): AddressState {
    return { ...this.state };
  }
}
