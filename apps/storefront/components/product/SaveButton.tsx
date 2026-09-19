"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/catalog-context";
import { productBySlug, variantImage } from "@/lib/product";
import { isSaved, toggleSaved, useSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import type { WishlistDto } from "@meridian/contracts";
import { referenceOf } from "../shop/states";
import { Icon } from "../ui/Icon";

export function SaveButton({ slug, name, variant = "float" }: { slug: string; name: string; variant?: "float" | "outline" }) {
  const router = useRouter();
  const catalog = useCatalog();
  const saved = useSaved();
  const on = saved.includes(slug);
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const [pop, setPop] = useState(0);
  const onSynced = (wishlist: WishlistDto) => utils.wishlist.get.setData(undefined, wishlist);
  const onFailed = (next: boolean) => (error: { message: string; data?: { correlationId?: string } | null }) => {
    // Put the device list back the way the account has it, and say why.
    if (isSaved(slug) === next) toggleSaved(slug);
    const reference = referenceOf(error);
    toast(next ? `Couldn’t save ${name}` : `Couldn’t remove ${name}`, { id: `saved-${slug}`, description: reference ? `${error.message} ${reference}` : error.message, action: undefined });
  };
  const add = trpc.wishlist.add.useMutation({ onSuccess: onSynced, onError: onFailed(true) });
  const remove = trpc.wishlist.remove.useMutation({ onSuccess: onSynced, onError: onFailed(false) });

  // Signed-in shoppers keep the wishlist on their account; guests keep it on the device until they sign in.
  const sync = (next: boolean) => {
    if (!me.data) return;
    if (next) add.mutate({ slug });
    else remove.mutate({ slug });
  };

  const toggle = () => {
    const next = toggleSaved(slug);
    sync(next);
    if (next) setPop((n) => n + 1);
    const piece = productBySlug(catalog, slug);
    // eslint-disable-next-line @next/next/no-img-element -- 40px thumbnail inside a toast
    const thumb = piece ? <img src={variantImage(piece)} alt="" className="size-full object-cover" /> : undefined;
    if (next) {
      toast(`Saved ${name}`, {
        id: `saved-${slug}`,
        description: "You can find it under Saved.",
        icon: thumb,
        action: { label: "View", onClick: () => router.push("/saved") },
      });
    } else {
      toast(`Removed ${name} from saved`, {
        id: `saved-${slug}`,
        // The toast id is reused, so clear the saved description instead of inheriting it.
        description: null,
        icon: thumb,
        action: {
          label: "Undo",
          onClick: () => {
            if (!isSaved(slug)) {
              toggleSaved(slug);
              sync(true);
            }
          },
        },
      });
    }
  };

  const base =
    variant === "float"
      ? "grid size-10 place-items-center rounded-full bg-paper/90 text-ink shadow-[0_6px_18px_-8px_rgb(27_26_23/0.35)] transition-[background-color,transform] duration-200 hover:bg-paper active:scale-90"
      : "grid size-12 shrink-0 place-items-center rounded-full bg-raised text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-[box-shadow,transform] duration-200 hover:shadow-[inset_0_0_0_1px_var(--color-ink)] active:scale-95";

  return (
    <button type="button" className={base} aria-pressed={on} aria-label={on ? `Remove ${name} from saved` : `Save ${name}`} onClick={toggle}>
      <Icon
        key={pop}
        name="heart"
        size={variant === "float" ? 18 : 20}
        filled={on}
        className={`${on ? "text-cobalt" : ""} ${pop ? "bump" : ""}`}
      />
    </button>
  );
}
