"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/** A 20px rounded square that fills with ink when checked. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-5 shrink-0 cursor-pointer place-items-center rounded-[6px] bg-raised text-paper shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-[background-color,box-shadow] duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-ink)] data-[state=checked]:bg-ink data-[state=checked]:shadow-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        <Icon name="check" size={14} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
