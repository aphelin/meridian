"use client";

import { useState } from "react";
import { focusFirstInvalid, hasErrors, validate, type FieldErrors } from "./validation";

type Rule = (value: string) => string | null;
export type FieldSchema<K extends string> = Partial<Record<K, Rule[]>>;

/**
 * Field messages for a `noValidate` form. Nothing shows while the shopper types until the first submit; from then on a
 * field that showed a message re-checks on every change, so it clears as soon as it is fixed. Server messages for a
 * field stay until that field's value changes.
 */
export function useFieldErrors<K extends string>(values: Record<K, string>, schema: FieldSchema<K>) {
  const [checked, setChecked] = useState<ReadonlySet<K>>(() => new Set());
  const [server, setServer] = useState<Partial<Record<K, { message: string; value: string }>>>({});

  const errors: FieldErrors<K> = {};
  for (const key of checked) {
    const message = validate(values, { [key]: schema[key] } as FieldSchema<K>)[key];
    if (message) errors[key] = message;
  }
  for (const key of Object.keys(server) as K[]) {
    const entry = server[key];
    if (entry && !errors[key] && entry.value === values[key]) errors[key] = entry.message;
  }

  return {
    errors,
    /** Runs every rule. True when the form can be sent; otherwise shows the messages and focuses the first field. */
    check(form: HTMLFormElement | null) {
      const found = validate(values, schema);
      const failed = Object.keys(found) as K[];
      setChecked((prev) => new Set([...prev, ...failed]));
      setServer({});
      if (!hasErrors(found)) return true;
      focusFirstInvalid(form);
      return false;
    },
    /** Shows messages the server tied to fields, under those fields. */
    showServer(found: FieldErrors<K>, form?: HTMLFormElement | null) {
      const entries = (Object.keys(found) as K[]).filter((key) => found[key]).map((key) => [key, { message: found[key] as string, value: values[key] }]);
      setServer(Object.fromEntries(entries));
      if (entries.length && form !== undefined) focusFirstInvalid(form);
    },
    reset() {
      setChecked(new Set());
      setServer({});
    },
  };
}
