import * as React from "react";
import { cn } from "@/lib/utils";

const tones = { ok: "status-ok", warn: "status-warn", muted: "status-muted", info: "status-info" } as const;

/** Status pill on the house `.status` style. */
function Badge({ className, tone = "muted", ...props }: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return <span data-slot="badge" className={cn("status", tones[tone], className)} {...props} />;
}

export { Badge };
