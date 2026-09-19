import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PasswordHasher } from "../../application/ports";

/** OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane). */
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  /** Hash of a random secret nobody knows, with the same parameters as real hashes. */
  private readonly decoy: Promise<string> = argon2.hash(randomBytes(32).toString("base64url"), ARGON2_OPTIONS);

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async verifyDecoy(plain: string): Promise<false> {
    await this.verify(await this.decoy, plain);
    return false;
  }
}
