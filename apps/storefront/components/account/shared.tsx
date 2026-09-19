"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldHint, FieldLabel, useFieldIds } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";

/** Shared building blocks for the account area: fields, error alerts and states. */

export type ClientError = { message: string; data?: { code?: string; status?: number; correlationId?: string; details?: unknown } | null } | null | undefined;

/** "Reference: <correlationId>" for any BFF error, so a shopper can quote it to support. */
export function referenceOf(error: ClientError): string | null {
  const id = error?.data?.correlationId;
  return id && id !== "unknown" ? `Reference: ${id}` : null;
}

export function codeOf(error: ClientError): string | undefined {
  return error?.data?.code;
}

/** A one-line form error. Client mistakes (wrong password, invalid input) read cleanly; server failures carry the reference. */
export function FormError({ error, className, children }: { error: ClientError; className?: string; children?: ReactNode }) {
  if (!error) return null;
  const serverSide = (error.data?.status ?? 500) >= 500;
  return (
    <Alert className={className} reference={serverSide || codeOf(error) === "RATE_LIMITED" ? referenceOf(error) : null}>
      {children ?? errorMessage(error) ?? "Something went wrong on our side."}
    </Alert>
  );
}

export function Success({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Alert tone="ok" className={className}>
      {children}
    </Alert>
  );
}

/** Full-panel error state for a data view that could not load: message, request reference and a retry. */
export function ErrorState({ title, error, onRetry, headingLevel = "h2" }: { title: string; error: ClientError; onRetry?: () => void; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  const reference = referenceOf(error);
  return (
    <div className="panel grid place-items-center px-6 py-14 text-center" role="alert">
      <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
        <Icon name="info" size={24} />
      </span>
      <Heading className="heading mt-5">{title}</Heading>
      <p className="mt-2 max-w-[46ch] text-stone">{errorMessage(error) ?? "Something went wrong on our side."}</p>
      {reference ? <p className="mt-2 text-sm text-stone tabular">{reference}</p> : null}
      {onRetry ? (
        <Button type="button" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  className,
  ...rest
}: { label: string; value: string; onChange: (value: string) => void; hint?: ReactNode; error?: string | null; className?: string } & Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "className"
>) {
  return (
    <Field className={className} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <FieldInput value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      <FieldError>{error}</FieldError>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </Field>
  );
}

function FieldInput(props: React.ComponentProps<"input">) {
  return <Input {...useFieldIds()} {...props} />;
}

/** Password input with a show/hide toggle. The toggle's accessible name never contains the field label on its own. */
export function PasswordField({
  label,
  value,
  onChange,
  hint,
  error,
  className,
  ...rest
}: { label: string; value: string; onChange: (value: string) => void; hint?: ReactNode; error?: string | null; className?: string } & Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "className" | "type" | "id"
>) {
  return (
    <Field className={className} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <PasswordInput value={value} onChange={onChange} {...rest} />
      <FieldError>{error}</FieldError>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </Field>
  );
}

function PasswordInput({ onChange, ...rest }: { onChange: (value: string) => void } & Omit<React.ComponentProps<"input">, "onChange" | "type">) {
  const ids = useFieldIds();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...ids} type={show ? "text" : "password"} className="!pr-14" onChange={(e) => onChange(e.target.value)} {...rest} />
      <button
        type="button"
        className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 text-stone"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-controls={ids.id}
        aria-pressed={show}
      >
        <Icon name={show ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}

/** Centred narrow page for the signed-out flows (forgot, reset, verify). */
export function NarrowPage({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <main className="shell grid place-items-center pb-24 pt-10 md:pt-16">
      <div className="w-full max-w-xl">
        <h1 className="title text-center">{title}</h1>
        {lede ? <p className="mx-auto mt-3 max-w-[440px] text-center text-stone">{lede}</p> : null}
        <div className="mx-auto mt-8 max-w-[440px]">{children}</div>
      </div>
    </main>
  );
}

export function BackToSignIn() {
  return (
    <p className="mt-8 text-center text-sm text-stone">
      <Link href="/account" className="link">
        Back to sign in
      </Link>
    </p>
  );
}

/** Only same-site paths are accepted as a post sign-in destination (no protocol-relative or backslash tricks). */
export function safeNext(next: string | null | undefined): string | null {
  // Browsers drop tabs and newlines inside URLs, so "/\t/evil.example" would become protocol-relative.
  // eslint-disable-next-line no-control-regex
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) return null;
  if (next.replace(/[\s]/g, "").startsWith("//")) return null;
  return next;
}

export const MIN_PASSWORD = 8;

/** A password the shopper already has: the BFF only asks that it isn't empty (spaces count). */
export const passwordEntered = (message: string) => (value: string) => (value ? null : message);

/** Rules for a new password, matching the BFF (`newPassword`) and identity (at least 8 characters, not only spaces). */
export const newPasswordRules = (emptyMessage: string) => [
  passwordEntered(emptyMessage),
  (value: string) => (value.length >= MIN_PASSWORD ? null : `Passwords need at least ${MIN_PASSWORD} characters.`),
  (value: string) => (value.trim() ? null : "Passwords can’t be only spaces."),
];
