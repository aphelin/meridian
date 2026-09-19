"use client";

import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const variants = { primary: "btn-primary", secondary: "btn-secondary", quiet: "btn-quiet" } as const;

/** The house pill button (`.btn`), with optional `asChild` to style a link, and a pending spinner. */
function Button({
  className,
  variant = "primary",
  size = "md",
  pending = false,
  asChild = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof variants; size?: "sm" | "md"; pending?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn("btn", variants[variant], size === "sm" && "btn-sm", className)}
      disabled={asChild ? undefined : disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button };
