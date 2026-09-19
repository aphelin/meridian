"use client";

import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Icon } from "./Icon";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive data-slot="command" className={cn("flex size-full flex-col overflow-hidden text-ink", className)} {...props} />;
}

/** The search palette shell: a dialog pinned near the top of the viewport so results grow downward. */
function CommandDialog({
  title,
  description,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Dialog> & { title: string; description: string; className?: string }) {
  return (
    <Dialog {...props}>
      <DialogContent className={cn("top-[max(4.5rem,12vh)] max-w-[640px] translate-y-0 overflow-hidden p-0", className)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ className, children, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex items-center gap-3 border-b border-line px-5">
      <Icon name="search" className="shrink-0 text-stone" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn("h-16 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-stone", className)}
        {...props}
      />
      {children}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[min(60vh,480px)] scroll-py-2 overflow-y-auto overscroll-contain p-2 transition-[height] duration-200 ease-[var(--ease-out)] [height:var(--cmdk-list-height)]",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty data-slot="command-empty" className={cn("px-4 py-10 text-center", className)} {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn("pb-1.5 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-2.5 **:[[cmdk-group-heading]]:text-[0.8125rem] **:[[cmdk-group-heading]]:text-stone", className)}
      {...props}
    />
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn("mx-3 my-1 h-px bg-line", className)} {...props} />;
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-pointer items-center gap-3.5 rounded-[14px] px-3 py-2.5 text-[0.9375rem] outline-hidden select-none transition-colors duration-150 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-plaster",
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator };
