"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** A 40 by 24 track that fills with ink when on; the thumb glides across on the house ease. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-line-strong p-[3px] transition-colors duration-300 ease-[var(--ease-out)] hover:bg-[color-mix(in_srgb,var(--color-line-strong),var(--color-ink)_14%)] data-[state=checked]:bg-ink data-[state=checked]:hover:bg-ink-hover disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[18px] rounded-full bg-raised shadow-[0_1px_3px_rgb(27_26_23/0.25)] transition-transform duration-300 ease-[var(--ease-out)] data-[state=checked]:translate-x-4"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
