/** Capability tokens that let a guest read and act on one order. */
export abstract class OrderAccessTokens {
  abstract issue(orderId: string): string;
  abstract verify(orderId: string, token: string | null | undefined): boolean;
}
