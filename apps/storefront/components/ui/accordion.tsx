"use client";

import { Accordion as AccordionPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

function Accordion({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props} />;
}

function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn("border-b border-line", className)} {...props} />;
}

/** A full-width row with a round plaster chevron that turns over when the section opens. */
function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex [text-wrap:pretty]">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion flex flex-1 items-center justify-between gap-4 py-5 text-left text-base font-medium text-ink transition-colors",
          className,
        )}
        {...props}
      >
        {children}
        <span className="grid size-8 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-300 ease-[var(--ease-out)] group-hover/accordion:bg-plaster group-data-[state=open]/accordion:rotate-180">
          <Icon name="chevronDown" size={18} />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:ease-[var(--ease-out)]"
      {...props}
    >
      <div className={cn("pb-6 text-stone", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
