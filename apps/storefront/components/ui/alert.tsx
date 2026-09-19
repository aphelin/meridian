import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/** Inline message on the house `.alert` style; error alerts can show the request reference for support. */
function Alert({
  className,
  tone = "error",
  reference,
  children,
  ...props
}: React.ComponentProps<"div"> & { tone?: "error" | "ok"; reference?: string | null }) {
  return (
    <div data-slot="alert" role={tone === "error" ? "alert" : "status"} className={cn("alert", tone === "error" ? "alert-error" : "alert-ok", className)} {...props}>
      <Icon name={tone === "error" ? "info" : "check"} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {children}
        {reference ? <p className="mt-1 text-xs opacity-80 tabular">{reference}</p> : null}
      </div>
    </div>
  );
}

export { Alert };
