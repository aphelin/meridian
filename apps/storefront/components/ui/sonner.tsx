"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Icon } from "./Icon";

/** Ink toasts that rise from the bottom-left corner, clear of the right-hand cart sheet: a short sentence, an optional thumbnail and one action. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-left"
      gap={10}
      offset={24}
      mobileOffset={16}
      visibleToasts={3}
      icons={{ success: <Icon name="check" size={18} />, error: <Icon name="info" size={18} /> }}
      toastOptions={{
        unstyled: true,
        duration: 3600,
        classNames: {
          toast:
            "group/toast flex w-full items-center gap-3 rounded-[18px] bg-ink py-3 pl-3.5 pr-3 text-paper shadow-[0_24px_48px_-20px_rgb(27_26_23/0.55)] sm:w-[360px] font-sans",
          icon: "grid size-10 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-paper/10 text-paper [&>*]:!m-0",
          content: "min-w-0 flex-1",
          title: "text-[0.9375rem] font-medium leading-snug",
          description: "mt-0.5 text-[0.8125rem] leading-snug text-paper/70",
          actionButton:
            "shrink-0 cursor-pointer rounded-full bg-paper px-3.5 py-2 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-plaster",
          cancelButton: "shrink-0 cursor-pointer rounded-full px-3 py-2 text-[0.8125rem] text-paper/75 hover:text-paper",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
