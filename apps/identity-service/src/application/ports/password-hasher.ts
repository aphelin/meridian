/** Password hashing (argon2id in production). */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  /** False for a wrong password or a malformed hash; never throws for bad input. */
  abstract verify(hash: string, plain: string): Promise<boolean>;
  /** Spends the same work as `verify` against a decoy hash so unknown emails take as long as wrong passwords. */
  abstract verifyDecoy(plain: string): Promise<false>;
}
