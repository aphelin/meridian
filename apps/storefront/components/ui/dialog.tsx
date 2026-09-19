"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "veil fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200",
        className,
      )}
      {...props}
    />
  );
}

/** A raised paper card that settles down from just above its resting place. */
function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-raised text-ink shadow-[0_40px_90px_-30px_rgb(27_26_23/0.45)] outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97 data-[state=open]:slide-in-from-top-2 data-[state=open]:duration-300 data-[state=open]:ease-[var(--ease-out)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("heading", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-stone", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogTitle };
