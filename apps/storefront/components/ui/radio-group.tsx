"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

/** A 20px ring; when chosen it fills with ink around a paper centre that pops in. */
function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full bg-raised shadow-[inset_0_0_0_1.5px_var(--color-line-strong)] transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out)] data-[state=checked]:bg-ink data-[state=checked]:shadow-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-paper data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 data-[state=checked]:duration-200"
      />
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
