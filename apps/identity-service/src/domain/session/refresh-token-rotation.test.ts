import { describe, expect, it } from "vitest";
import { InMemoryRefreshTokenRepository, InMemoryStore } from "../../application/testing/in-memory";
import { RefreshToken } from "./refresh-token";
import { RefreshTokenRotation } from "./refresh-token-rotation";

const now = new Date("2026-09-17T10:00:00.000Z");

async function setup() {
  const repo = new InMemoryRefreshTokenRepository(new InMemoryStore());
  const first = RefreshToken.issue({ id: "r1", familyId: "f1", userId: "u1", now });
  const sibling = RefreshToken.issue({ id: "r2", familyId: "f1", userId: "u1", now });
  const other = RefreshToken.issue({ id: "r3", familyId: "f2", userId: "u1", now });
  for (const t of [first, sibling, other]) await repo.add(t.token);
  return { repo, rotation: new RefreshTokenRotation(repo), first, sibling, other };
}

describe("refresh token rotation", () => {
  it("rotates an active refresh token exactly once", async () => {
    const { repo, rotation, first } = await setup();
    expect(await rotation.rotate(first.secret, now)).toEqual({ kind: "rotated", userId: "u1", familyId: "f1" });
    expect((await repo.findByHash(first.token.tokenHash))?.isRevoked()).toBe(true);
  });

  it("treats reuse of a rotated refresh token as theft and revokes the whole family only", async () => {
    const { repo, rotation, first } = await setup();
    await rotation.rotate(first.secret, now);
    expect(await rotation.rotate(first.secret, now)).toEqual({ kind: "reused", familyId: "f1" });
    expect(repo.active("u1").map((t) => t.familyId)).toEqual(["f2"]);
  });

  it("rejects unknown and expired refresh tokens", async () => {
    const { rotation, other } = await setup();
    expect(await rotation.rotate("not-a-token", now)).toEqual({ kind: "unknown" });
    expect(await rotation.rotate(other.secret, new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000))).toEqual({ kind: "expired" });
  });

  it("keeps a family for the password change only while its refresh token is active for that user", () => {
    const { token } = RefreshToken.issue({ id: "r", familyId: "f", userId: "u1", now, ttlMs: 1000 });
    expect(token.isActiveFor("u1", now)).toBe(true);
    expect(token.isActiveFor("u2", now)).toBe(false);
    expect(token.isActiveFor("u1", new Date(now.getTime() + 1000))).toBe(false);
  });
});
