import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Cart, CartRepository, newId, type TransactionContext } from "../../domain";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Finds the cart a request addresses: the signed-in user's cart, or the guest cart named by x-cart-id. A missing cart
 * is opened (not yet stored). A guest never reaches a user's cart through its id.
 */
@Injectable()
export class CartResolver {
  constructor(
    private readonly carts: CartRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolve(userId: string | null, cartId: string | null, tx?: TransactionContext): Promise<Cart> {
    const now = this.clock.now();
    if (userId) return (await this.carts.findByUserId(userId, tx)) ?? Cart.open(newId(), userId, now);
    if (cartId) {
      const cart = await this.carts.findById(cartId, tx);
      if (cart?.isGuest) return cart;
      // A client may keep a cart id it was handed before the first write, but only server-style random UUIDs are
      // accepted as new ids, so nobody can pre-create carts under guessable names.
      if (!cart && UUID.test(cartId)) return Cart.open(cartId, null, now);
    }
    return Cart.open(newId(), null, now);
  }

  /** The existing cart only (never opens one). */
  async existing(userId: string | null, cartId: string | null, tx?: TransactionContext): Promise<Cart | null> {
    if (userId) return this.carts.findByUserId(userId, tx);
    if (!cartId) return null;
    const cart = await this.carts.findById(cartId, tx);
    return cart?.isGuest ? cart : null;
  }
}
