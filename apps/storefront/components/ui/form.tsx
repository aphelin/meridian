import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * Form helpers without a form library: a field wrapper that wires label, hint and error ids to its control through
 * `useFieldIds`, so `aria-describedby` and `aria-invalid` stay correct.
 */

const FieldContext = React.createContext<{ id: string; hintId: string; errorId: string; invalid: boolean } | null>(null);

function Field({ className, id, invalid = false, children, ...props }: React.ComponentProps<"div"> & { id?: string; invalid?: boolean }) {
  const generated = React.useId();
  const base = id ?? generated;
  const value = React.useMemo(() => ({ id: base, hintId: `${base}-hint`, errorId: `${base}-error`, invalid }), [base, invalid]);
  return (
    <FieldContext.Provider value={value}>
      <div data-slot="field" className={cn("grid content-start", className)} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
}

/** Props to spread on the field's control: id, aria-invalid and aria-describedby. */
function useFieldIds() {
  const field = React.useContext(FieldContext);
  if (!field) throw new Error("useFieldIds must be used inside <Field>");
  return { id: field.id, "aria-invalid": field.invalid || undefined, "aria-describedby": field.invalid ? `${field.errorId} ${field.hintId}` : field.hintId };
}

function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  const field = React.useContext(FieldContext);
  return <label data-slot="field-label" htmlFor={field?.id} className={cn("label", className)} {...props} />;
}

function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  const field = React.useContext(FieldContext);
  return <p data-slot="field-hint" id={field?.hintId} className={cn("hint", className)} {...props} />;
}

function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  const field = React.useContext(FieldContext);
  if (!children) return null;
  return (
    <p data-slot="field-error" id={field?.errorId} className={cn("field-error", className)} {...props}>
      <Icon name="alert" size={15} />
      <span>{children}</span>
    </p>
  );
}

export { Field, FieldError, FieldHint, FieldLabel, useFieldIds };
