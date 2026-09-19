import type { CustomerRef, PostalAddress } from "@meridian/contracts";

/** What the dispatcher remembers about an order from OrderPlaced (later events do not repeat the address). */
export interface OrderRecipient {
  orderId: string;
  number: string;
  customer: CustomerRef;
  shippingAddress: PostalAddress;
}

export abstract class OrderRecipientRepository {
  /** Stores the recipient once per order; a redelivered OrderPlaced never overwrites. */
  abstract remember(recipient: OrderRecipient, now: Date): Promise<void>;
  abstract find(orderId: string): Promise<OrderRecipient | null>;
  /** Account deletion: drops stored addresses of that customer. */
  abstract forgetCustomer(userId: string, email: string): Promise<number>;
}
