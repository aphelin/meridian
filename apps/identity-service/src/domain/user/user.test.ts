import { Email } from "@meridian/kernel";
import { describe, expect, it } from "vitest";
import { sampleAddress } from "../../application/testing/in-memory";
import { PlainPassword } from "./password";
import { User } from "./user";
import { UserName } from "./user-name";

const now = new Date("2026-09-17T10:00:00.000Z");
const newUser = () => User.register({ id: "u1", email: Email.parse("  Nino@Example.COM "), name: UserName.parse(" Nino "), passwordHash: "hash", now });

describe("User aggregate", () => {
  it("registers an unverified customer with a normalised email and raises UserRegistered", () => {
    const user = newUser();
    expect(user.email).toBe("nino@example.com");
    expect(user.name).toBe("Nino");
    expect(user.role).toBe("customer");
    expect(user.emailVerified).toBe(false);
    expect(user.pullEvents()).toEqual([
      { name: "UserRegistered", aggregateType: "User", aggregateId: "u1", payload: { userId: "u1", email: "nino@example.com", name: "Nino" }, occurredAt: now },
    ]);
  });

  it("verifies the email once and raises UserEmailVerified only the first time", () => {
    const user = newUser();
    user.pullEvents();
    expect(user.verifyEmail(now)).toBe(true);
    expect(user.verifyEmail(now)).toBe(false);
    expect(user.emailVerified).toBe(true);
    expect(user.pullEvents().map((e) => e.name)).toEqual(["UserEmailVerified"]);
  });

  it("raises UserProfileUpdated on rename but not when the name is unchanged", () => {
    const user = newUser();
    user.pullEvents();
    expect(user.rename(UserName.parse("Nino"), now)).toBe(false);
    expect(user.rename(UserName.parse("Nino B."), now)).toBe(true);
    expect(user.pullEvents()).toMatchObject([{ name: "UserProfileUpdated", payload: { userId: "u1", name: "Nino B." } }]);
  });

  it("rejects invalid names and passwords outside 8..256 characters", () => {
    expect(() => UserName.parse("   ")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => PlainPassword.parse("short")).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(() => PlainPassword.parse("x".repeat(257))).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(PlainPassword.parse("longenough").value).toBe("longenough");
    expect(JSON.stringify({ p: PlainPassword.parse("longenough") })).not.toContain("longenough");
  });

  it("makes the first address the default and moves the default when a new default address is added", () => {
    const user = newUser();
    const home = user.addAddress("a1", sampleAddress({ label: "Home" }), now);
    expect(home.isDefault).toBe(true);
    const work = user.addAddress("a2", sampleAddress({ label: "Work", isDefault: true }), now);
    expect(work.isDefault).toBe(true);
    expect(user.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["a2"]);
  });

  it("keeps at most one default address when an address is patched to default", () => {
    const user = newUser();
    user.addAddress("a1", sampleAddress(), now);
    user.addAddress("a2", sampleAddress({ isDefault: true }), now);
    const patched = user.updateAddress("a1", { isDefault: true, city: "Batumi" });
    expect(patched.details.city).toBe("Batumi");
    expect(user.addresses.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["a1"]);
    user.updateAddress("a1", { isDefault: false });
    expect(user.addresses.filter((a) => a.isDefault)).toHaveLength(0);
  });

  it("refuses an 11th address", () => {
    const user = newUser();
    for (let i = 0; i < User.MAX_ADDRESSES; i++) user.addAddress(`a${i}`, sampleAddress(), now);
    expect(() => user.addAddress("a10", sampleAddress(), now)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("validates address country as ISO alpha-2 and upper-cases it", () => {
    const user = newUser();
    expect(() => user.addAddress("a1", sampleAddress({ country: "Georgia" }), now)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(user.addAddress("a1", sampleAddress({ country: "de" }), now).details.country).toBe("DE");
    expect(() => user.updateAddress("a1", { postalCode: "  " })).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("promotes the oldest remaining address when the default address is removed", () => {
    const user = newUser();
    user.addAddress("a1", sampleAddress(), now);
    user.addAddress("a2", sampleAddress(), now);
    user.addAddress("a3", sampleAddress({ isDefault: true }), now);
    user.removeAddress("a3");
    expect(user.addresses.find((a) => a.isDefault)?.id).toBe("a1");
    expect(() => user.removeAddress("missing")).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("raises UserDeleted on deletion and refuses further changes", () => {
    const user = newUser();
    user.pullEvents();
    user.delete(now);
    expect(user.pullEvents()).toMatchObject([{ name: "UserDeleted", payload: { userId: "u1", email: "nino@example.com" } }]);
    expect(() => user.rename(UserName.parse("Other"), now)).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("round-trips through its snapshot", () => {
    const user = newUser();
    user.addAddress("a1", sampleAddress({ label: "Home" }), now);
    const copy = User.rehydrate(user.snapshot());
    expect(copy.snapshot()).toEqual(user.snapshot());
    expect(copy.peekEvents()).toHaveLength(0);
  });
});
