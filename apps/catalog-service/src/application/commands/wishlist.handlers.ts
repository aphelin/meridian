import type { WishlistDto } from "@meridian/contracts";
import { NotFoundError } from "@meridian/kernel";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ProductRepository } from "../../domain/product/product.repository";
import { WishlistRepository } from "../../domain/wishlist/wishlist.repository";
import { CatalogReadModel } from "../ports/catalog-read-model";
import { TransactionRunner } from "../ports/transaction";
import { AddToWishlistCommand, RemoveFromWishlistCommand, ReplaceWishlistCommand } from "./wishlist.commands";

async function wishlistDto(readModel: CatalogReadModel, userId: string): Promise<WishlistDto> {
  return { slugs: await readModel.wishlist(userId) };
}

/**
 * Replaces the wishlist (the storefront pushes its local list on sign-in). Slugs that are not published products are
 * dropped rather than rejected, so a stale local list never blocks the merge.
 */
@CommandHandler(ReplaceWishlistCommand)
export class ReplaceWishlistHandler implements ICommandHandler<ReplaceWishlistCommand, WishlistDto> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly wishlists: WishlistRepository,
    private readonly products: ProductRepository,
    private readonly readModel: CatalogReadModel,
  ) {}

  async execute({ userId, slugs }: ReplaceWishlistCommand): Promise<WishlistDto> {
    await this.transactions.run(async (tx) => {
      const wishlist = await this.wishlists.loadForUpdate(userId, tx);
      wishlist.replace(slugs);
      const published = await this.products.publishedSlugs(wishlist.slugs, tx);
      wishlist.replace(wishlist.slugs.filter((slug) => published.has(slug)));
      await this.wishlists.save(wishlist, tx);
    });
    return wishlistDto(this.readModel, userId);
  }
}

@CommandHandler(AddToWishlistCommand)
export class AddToWishlistHandler implements ICommandHandler<AddToWishlistCommand, WishlistDto> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly wishlists: WishlistRepository,
    private readonly products: ProductRepository,
    private readonly readModel: CatalogReadModel,
  ) {}

  async execute({ userId, slug }: AddToWishlistCommand): Promise<WishlistDto> {
    await this.transactions.run(async (tx) => {
      const published = await this.products.publishedSlugs([slug], tx);
      if (!published.has(slug)) throw new NotFoundError("Product not found.");
      const wishlist = await this.wishlists.loadForUpdate(userId, tx);
      if (wishlist.add(slug)) await this.wishlists.save(wishlist, tx);
    });
    return wishlistDto(this.readModel, userId);
  }
}

@CommandHandler(RemoveFromWishlistCommand)
export class RemoveFromWishlistHandler implements ICommandHandler<RemoveFromWishlistCommand, WishlistDto> {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly wishlists: WishlistRepository,
    private readonly readModel: CatalogReadModel,
  ) {}

  async execute({ userId, slug }: RemoveFromWishlistCommand): Promise<WishlistDto> {
    await this.transactions.run(async (tx) => {
      const wishlist = await this.wishlists.loadForUpdate(userId, tx);
      if (wishlist.remove(slug)) await this.wishlists.save(wishlist, tx);
    });
    return wishlistDto(this.readModel, userId);
  }
}
