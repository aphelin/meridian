import { AggregateRoot, ensure } from "@meridian/kernel";
import { parseSlug } from "../shared/slug";

export const MAX_WISHLIST_ITEMS = 100;

/** A signed-in shopper's saved products, by slug, in the order they were added. No duplicates, bounded size. */
export class Wishlist extends AggregateRoot {
  private constructor(
    readonly userId: string,
    private items: string[],
  ) {
    super();
  }

  static empty(userId: string): Wishlist {
    ensure(typeof userId === "string" && userId.length > 0, "UNAUTHORIZED", "Sign in to use a wishlist.");
    return new Wishlist(userId, []);
  }

  static restore(userId: string, slugs: readonly string[]): Wishlist {
    return new Wishlist(userId, [...slugs]);
  }

  get slugs(): readonly string[] {
    return this.items;
  }

  add(slug: string): boolean {
    const parsed = parseSlug(slug);
    if (this.items.includes(parsed)) return false;
    ensure(this.items.length < MAX_WISHLIST_ITEMS, "CONFLICT", `A wishlist holds at most ${MAX_WISHLIST_ITEMS} products.`);
    this.items = [...this.items, parsed];
    return true;
  }

  remove(slug: string): boolean {
    if (!this.items.includes(slug)) return false;
    this.items = this.items.filter((s) => s !== slug);
    return true;
  }

  /** Replaces the list (used to push a local wishlist on sign-in); duplicates collapse, first occurrence wins. */
  replace(slugs: readonly string[]): void {
    const next = [...new Set(slugs.map((s) => parseSlug(s)))];
    ensure(next.length <= MAX_WISHLIST_ITEMS, "VALIDATION_FAILED", `A wishlist holds at most ${MAX_WISHLIST_ITEMS} products.`);
    this.items = next;
  }
}
