import * as React from "react";
import { cn } from "@/lib/utils";

/** Text field on the house `.field` style; `aria-invalid` turns the ring brick. */
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={cn("field", className)} {...props} />;
}

export { Input };
