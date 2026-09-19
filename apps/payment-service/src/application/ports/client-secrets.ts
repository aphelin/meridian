/**
 * Client secrets authorise local sandbox completion for the session that placed the order. Only a hash is stored;
 * `issue` is deterministic per payment so an idempotent intent replay can hand the same secret back.
 */
export abstract class ClientSecrets {
  abstract issue(paymentId: string): string;
  abstract hash(secret: string): string;
  /** Timing-safe comparison against a stored hash. */
  abstract matches(secret: string, storedHash: string): boolean;
}
