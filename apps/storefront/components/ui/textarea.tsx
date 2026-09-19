import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, rows = 4, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" rows={rows} className={cn("field min-h-28 resize-y py-3", className)} {...props} />;
}

export { Textarea };
