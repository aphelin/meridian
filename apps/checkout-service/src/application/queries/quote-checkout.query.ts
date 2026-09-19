import type { QuoteDto, QuoteRequest } from "@meridian/contracts";
import { Query } from "@nestjs/cqrs";

export class QuoteCheckoutQuery extends Query<QuoteDto> {
  constructor(
    readonly request: QuoteRequest,
    readonly userId: string | null,
    readonly cartId: string | null,
  ) {
    super();
  }
}
