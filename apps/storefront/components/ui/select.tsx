"use client";

import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/** A pill that opens a listbox: raised paper, 1px ring, chevron that turns when open. */
function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "group/select inline-flex h-10 items-center justify-between gap-2 rounded-full bg-raised pl-4 pr-3 text-sm whitespace-nowrap text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-[box-shadow,transform] duration-200 ease-[var(--ease-out)] select-none hover:shadow-[inset_0_0_0_1px_var(--color-ink)] active:scale-[0.98] data-[state=open]:shadow-[inset_0_0_0_1px_var(--color-ink)] data-placeholder:text-stone disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon
          name="chevronDown"
          size={16}
          className="shrink-0 text-stone transition-transform duration-300 ease-[var(--ease-out)] group-data-[state=open]/select:rotate-180"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "end",
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[max(var(--radix-select-trigger-width),13rem)] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[18px] bg-raised p-1.5 text-ink shadow-[var(--shadow-menu)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:ease-[var(--ease-out)]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="grid gap-0.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center justify-between gap-6 rounded-[12px] py-2.5 pl-3 pr-2.5 text-[0.9375rem] outline-hidden select-none transition-colors duration-150 focus:bg-plaster data-[state=checked]:font-medium data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Icon name="check" size={17} className="text-ink" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue };
