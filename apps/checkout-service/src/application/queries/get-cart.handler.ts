import type { CartDto } from "@meridian/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { toCartDto } from "../mappers/cart-dto.mapper";
import { CartResolver } from "../services";
import { GetCartQuery } from "./get-cart.query";

/** The addressed cart, or an empty unsaved one (its id becomes the guest's cart id on first write). */
@QueryHandler(GetCartQuery)
export class GetCartHandler implements IQueryHandler<GetCartQuery, CartDto> {
  constructor(private readonly resolver: CartResolver) {}

  async execute(query: GetCartQuery): Promise<CartDto> {
    return toCartDto(await this.resolver.resolve(query.userId, query.cartId));
  }
}
