"use client";

import { toast } from "sonner";
import { Icon } from "../ui/Icon";

export function CopyCode({ code }: { code: string }) {
  return (
    <button
      type="button"
      aria-label={`Copy code ${code}`}
      className="group inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 font-semibold transition-colors hover:bg-paper/12 active:scale-[0.97]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          toast.success(`Code ${code} copied`, { description: "Paste it at checkout for 10% off." });
        } catch {
          toast(`Your code is ${code}`, { description: "Copying is blocked here, so type it in at checkout." });
        }
      }}
    >
      {code}
      <Icon name="copy" size={14} className="opacity-70 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
