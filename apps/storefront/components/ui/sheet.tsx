"use client";

import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/** The warm veil behind every sheet: it fades in with the panel and out after it. */
function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "veil fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-250",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A full-height paper panel from the left or right. It slides 28px and fades on the house ease when it opens,
 * and slips back out faster when it closes, so dismissal never feels like a hard cut.
 */
function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed inset-y-0 z-50 flex flex-col bg-paper text-ink outline-none",
          side === "right"
            ? "right-0 w-[min(460px,100vw)] shadow-[var(--shadow-drawer)] data-[state=open]:slide-in-from-right-7 data-[state=closed]:slide-out-to-right-10"
            : "left-0 w-[min(420px,100vw)] shadow-[24px_0_64px_-16px_rgb(27_26_23/0.22)] data-[state=open]:slide-in-from-left-7 data-[state=closed]:slide-out-to-left-10",
          "data-[state=open]:animate-in data-[state=open]:fade-in-40 data-[state=open]:duration-[420ms] data-[state=open]:ease-[var(--ease-out)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-250 data-[state=closed]:ease-in",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("heading", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-stone", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
