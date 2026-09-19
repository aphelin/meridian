/**
 * Client-side form checks that replace the browser's validation bubbles. Forms set `noValidate`, run their rules on
 * submit, show each message under its field (FieldError) and move focus to the first field that needs attention.
 * The server still validates everything; these only save a round trip and speak in the site's voice.
 */

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

type Rule = (value: string) => string | null;

// Close to the server's zod email check: a dotted domain whose last label has at least two letters.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

export const rules = {
  required:
    (message: string): Rule =>
    (v) =>
      v.trim() ? null : message,
  email:
    (message = "Enter an email address like name@example.com."): Rule =>
    (v) =>
      !v.trim() || EMAIL.test(v.trim()) ? null : message,
  minLength:
    (min: number, message: string): Rule =>
    (v) =>
      !v || v.trim().length >= min ? null : message,
  maxLength:
    (max: number, message: string): Rule =>
    (v) =>
      v.trim().length <= max ? null : message,
  pattern:
    (re: RegExp, message: string): Rule =>
    (v) =>
      !v.trim() || re.test(v.trim()) ? null : message,
};

/** Runs each field's rules in order and keeps the first message per field. */
export function validate<K extends string>(values: Record<K, string>, schema: Partial<Record<K, Rule[]>>): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const key of Object.keys(schema) as K[]) {
    for (const rule of schema[key] ?? []) {
      const message = rule(values[key] ?? "");
      if (message) {
        errors[key] = message;
        break;
      }
    }
  }
  return errors;
}

export const hasErrors = (errors: FieldErrors<string>) => Object.values(errors).some(Boolean);

/** Focuses the first control inside `form` that is marked invalid, after React has rendered the messages. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
