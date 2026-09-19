import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "./argon2-password-hasher";

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();

  it("hashes passwords with argon2id and a per-hash salt", async () => {
    const [a, b] = await Promise.all([hasher.hash("longenough1"), hasher.hash("longenough1")]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, "longenough1")).toBe(true);
    expect(await hasher.verify(a, "longenough2")).toBe(false);
  });

  it("never throws for a malformed hash and always fails the decoy email check", async () => {
    expect(await hasher.verify("not-a-hash", "longenough1")).toBe(false);
    expect(await hasher.verifyDecoy("anything")).toBe(false);
  });
});
