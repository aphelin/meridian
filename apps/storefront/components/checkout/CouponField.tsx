"use client";

import type { QuoteDto } from "@meridian/contracts";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";

/**
 * Discount code applied on Enter (or the Apply button). The live quote validates it and answers with an inline message;
 * quotes never fail for coupon problems.
 */
export function CouponField({
  applied,
  result,
  checking,
  onApply,
}: {
  /** The code the shopper asked for, or null. */
  applied: string | null;
  /** The quote's answer for `applied` (null while it is being checked or when nothing is applied). */
  result: QuoteDto["coupon"];
  checking: boolean;
  onApply: (code: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(applied ?? "");
  const submit = () => onApply(draft.trim().toUpperCase() || null);
  const invalid = Boolean(result && !result.applied);

  return (
    <div>
      <label htmlFor={id} className="label">
        Discount code
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          className="uppercase placeholder:normal-case"
          placeholder="Enter code"
          autoComplete="off"
          maxLength={64}
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-message`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        {result?.applied && draft.trim().toUpperCase() === applied ? (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              setDraft("");
              onApply(null);
            }}
          >
            Remove
          </Button>
        ) : (
          <Button type="button" variant="secondary" className="shrink-0" onClick={submit} pending={checking && Boolean(applied)}>
            Apply
          </Button>
        )}
      </div>
      {invalid && result ? (
        <FieldError id={`${id}-message`} aria-live="polite">
          {result.message}
        </FieldError>
      ) : (
        <p id={`${id}-message`} className="hint flex items-center gap-1.5" aria-live="polite">
          {applied && checking && !result ? (
            "Checking the code…"
          ) : result ? (
            result.applied ? (
              <>
                <Icon name="check" size={16} className="shrink-0" />
                <span>
                  {/applied/i.test(result.message) ? result.message : `${result.code} applied: ${result.message}`}
                  <span className="sr-only"> Discount {money(result.discountCents)}.</span>
                </span>
              </>
            ) : null
          ) : (
            "Codes are checked as soon as you press Enter."
          )}
        </p>
      )}
    </div>
  );
}
