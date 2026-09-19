"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Range slider: a thin line track, ink range, and raised thumbs (one per value). */
function Slider({ className, value, defaultValue, min = 0, max = 100, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (value ?? defaultValue ?? [min]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className={cn("relative flex h-6 w-full touch-none items-center select-none data-disabled:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-line-strong">
        <SliderPrimitive.Range className="absolute h-full bg-ink" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block size-5 cursor-grab rounded-full bg-raised shadow-[0_1px_4px_rgb(27_26_23/0.3),inset_0_0_0_1px_var(--color-line-strong)] transition-transform duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt active:cursor-grabbing"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
