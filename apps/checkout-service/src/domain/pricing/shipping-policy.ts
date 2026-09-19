import type { ShippingMethodId } from "@meridian/contracts";
import { Money, ValidationError } from "@meridian/kernel";

export interface ShippingQuote {
  id: ShippingMethodId;
  label: string;
  description: string;
  price: Money;
  etaDays: [number, number] | null;
}

/** Strategy: one shipping method's label, delivery window and price for a basket. */
export abstract class ShippingPolicy {
  abstract readonly id: ShippingMethodId;
  abstract readonly label: string;
  abstract readonly etaDays: [number, number] | null;

  /** Price for a basket whose subtotal after discount is `subtotalAfterDiscount`. */
  abstract priceFor(subtotalAfterDiscount: Money): Money;

  abstract describe(): string;

  quote(subtotalAfterDiscount: Money): ShippingQuote {
    return { id: this.id, label: this.label, description: this.describe(), price: this.priceFor(subtotalAfterDiscount), etaDays: this.etaDays };
  }
}

/** Standard delivery: €49, free once the discounted subtotal reaches €1000. */
export class StandardShipping extends ShippingPolicy {
  readonly id = "standard" as const;
  readonly label = "Standard delivery";
  readonly etaDays: [number, number] = [5, 10];
  static readonly PRICE = Money.cents(4900);
  static readonly FREE_FROM = Money.cents(100_000);

  priceFor(subtotalAfterDiscount: Money): Money {
    return subtotalAfterDiscount.greaterThanOrEqual(StandardShipping.FREE_FROM) ? Money.zero() : StandardShipping.PRICE;
  }

  describe() {
    return "Delivered in 5–10 working days. Free on orders of €1,000 or more.";
  }
}

/** A method with one price regardless of the basket. */
export class FlatRateShipping extends ShippingPolicy {
  constructor(
    readonly id: ShippingMethodId,
    readonly label: string,
    private readonly price: Money,
    readonly etaDays: [number, number] | null,
    private readonly description: string,
  ) {
    super();
  }

  priceFor(): Money {
    return this.price;
  }

  describe() {
    return this.description;
  }
}

/** The shipping methods on offer, in display order. */
export class ShippingPolicies {
  private readonly byId: Map<ShippingMethodId, ShippingPolicy>;

  constructor(private readonly policies: ShippingPolicy[]) {
    this.byId = new Map(policies.map((policy) => [policy.id, policy]));
    if (this.byId.size !== policies.length) throw new Error("ShippingPolicies: duplicate method id");
  }

  static standardSet(): ShippingPolicies {
    return new ShippingPolicies([
      new StandardShipping(),
      new FlatRateShipping("express", "Express delivery", Money.cents(9900), [2, 4], "Delivered in 2–4 working days."),
      new FlatRateShipping("white-glove", "White-glove delivery", Money.cents(14_900), [7, 14], "Two-person delivery to the room of your choice, unpacked and assembled, in 7–14 working days."),
      new FlatRateShipping("collect", "Collect from the studio", Money.zero(), null, "Collect from our studio once we let you know your order is ready."),
    ]);
  }

  get(id: string): ShippingPolicy {
    const policy = this.byId.get(id as ShippingMethodId);
    if (!policy) throw new ValidationError("Choose a valid shipping method.", { shippingMethod: id });
    return policy;
  }

  has(id: string): id is ShippingMethodId {
    return this.byId.has(id as ShippingMethodId);
  }

  quoteAll(subtotalAfterDiscount: Money): ShippingQuote[] {
    return this.policies.map((policy) => policy.quote(subtotalAfterDiscount));
  }
}
