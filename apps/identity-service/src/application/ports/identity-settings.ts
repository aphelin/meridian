/** Runtime configuration the application layer needs, resolved from the environment by infrastructure. */
export abstract class IdentitySettings {
  /** Storefront origin used to build email links, without a trailing slash. */
  abstract readonly publicSiteUrl: string;
  abstract readonly refreshTokenTtlMs: number;
  /** Seed administrator; `null` when not configured. */
  abstract readonly admin: { email: string; password: string } | null;
}
