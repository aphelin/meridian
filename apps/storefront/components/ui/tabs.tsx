"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

/** A plaster capsule; the active tab is a raised paper pill inside it. */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("grid auto-cols-fr grid-flow-col rounded-full bg-plaster p-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "h-11 rounded-full px-4 text-[0.9375rem] text-stone transition-[color,background-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:text-ink data-[state=active]:bg-raised data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-[0_6px_16px_-10px_rgb(27_26_23/0.45)]",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-300", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
