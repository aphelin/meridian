"use client";

import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

/** Raised paper card with a soft warm drop, growing out of its trigger. */
function DropdownMenuContent({ className, align = "end", sideOffset = 8, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[20px] bg-raised p-1.5 text-ink shadow-[var(--shadow-menu)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-96 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200 data-[state=open]:ease-[var(--ease-out)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-[0.9375rem] outline-hidden select-none transition-colors duration-150 focus:bg-plaster data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:text-stone focus:[&_svg]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" className={cn("px-3 pb-2 pt-2.5", className)} {...props} />;
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("mx-2 my-1.5 h-px bg-line", className)} {...props} />;
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger };
