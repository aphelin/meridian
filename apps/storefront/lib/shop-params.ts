import type { Sort } from "@/components/shop/ShopView";

export type SearchParams = Record<string, string | string[] | undefined>;

export function parseShopParams(params: SearchParams) {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const sort = one("sort");
  return {
    material: one("material"),
    inStock: one("stock") === "in",
    sort: (["price-asc", "price-desc", "name"].includes(sort ?? "") ? sort : "featured") as Sort,
  };
}
