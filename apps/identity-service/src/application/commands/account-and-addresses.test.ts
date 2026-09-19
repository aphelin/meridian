import { beforeEach, describe, expect, it } from "vitest";
import { ListAddressesHandler } from "../queries/list-addresses.handler";
import { ListAddressesQuery } from "../queries/list-addresses.query";
import { ListCustomersHandler } from "../queries/list-customers.handler";
import { ListCustomersQuery } from "../queries/list-customers.query";
import { GetCurrentUserHandler } from "../queries/get-current-user.handler";
import { GetCurrentUserQuery } from "../queries/get-current-user.query";
import { identityHarness, sampleAddress } from "../testing/in-memory";
import { AddAddressCommand } from "./add-address.command";
import { AddAddressHandler } from "./add-address.handler";
import { DeleteAccountCommand } from "./delete-account.command";
import { DeleteAccountHandler } from "./delete-account.handler";
import { RegisterUserCommand } from "./register-user.command";
import { RegisterUserHandler } from "./register-user.handler";
import { RemoveAddressCommand } from "./remove-address.command";
import { RemoveAddressHandler } from "./remove-address.handler";
import { SeedAdminHandler } from "./seed-admin.handler";
import { UpdateAddressCommand } from "./update-address.command";
import { UpdateAddressHandler } from "./update-address.handler";
import { UpdateProfileCommand } from "./update-profile.command";
import { UpdateProfileHandler } from "./update-profile.handler";

describe("profile, addresses, account deletion, seed and customer queries", () => {
  let h: ReturnType<typeof identityHarness>;
  let register: RegisterUserHandler;
  let userId: string;

  beforeEach(async () => {
    h = identityHarness();
    register = new RegisterUserHandler(h.uow, h.hasher, h.sessions, h.emails, h.clock);
    userId = (await register.execute(new RegisterUserCommand("nino@example.com", "longenough1", "Nino"))).user.id;
  });

  it("updates the profile name and writes UserProfileUpdated", async () => {
    const dto = await new UpdateProfileHandler(h.uow, h.clock).execute(new UpdateProfileCommand(userId, "  Nino B. "));
    expect(dto.name).toBe("Nino B.");
    expect(h.store.events("UserProfileUpdated")).toMatchObject([{ payload: { userId, name: "Nino B." } }]);
  });

  it("manages saved addresses with a single default through add, patch and remove", async () => {
    const add = new AddAddressHandler(h.uow, h.clock);
    const a1 = await add.execute(new AddAddressCommand(userId, sampleAddress({ label: "Home" })));
    const a2 = await add.execute(new AddAddressCommand(userId, sampleAddress({ label: "Work", isDefault: true, country: "DE" })));
    const list = new ListAddressesHandler(h.readModel);
    expect((await list.execute(new ListAddressesQuery(userId))).filter((a) => a.isDefault).map((a) => a.id)).toEqual([a2.id]);
    const patched = await new UpdateAddressHandler(h.uow).execute(new UpdateAddressCommand(userId, a1.id, { isDefault: true, city: "Batumi" }));
    expect(patched).toMatchObject({ id: a1.id, city: "Batumi", isDefault: true, label: "Home" });
    expect((await list.execute(new ListAddressesQuery(userId))).filter((a) => a.isDefault)).toHaveLength(1);
    await new RemoveAddressHandler(h.uow).execute(new RemoveAddressCommand(userId, a2.id));
    expect(await list.execute(new ListAddressesQuery(userId))).toHaveLength(1);
  });

  it("cannot touch another user's address (NOT_FOUND) and rolls back on a failed address change", async () => {
    const other = (await register.execute(new RegisterUserCommand("other@example.com", "longenough1", "Other"))).user.id;
    const mine = await new AddAddressHandler(h.uow, h.clock).execute(new AddAddressCommand(userId, sampleAddress()));
    await expect(new RemoveAddressHandler(h.uow).execute(new RemoveAddressCommand(other, mine.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new UpdateAddressHandler(h.uow).execute(new UpdateAddressCommand(userId, mine.id, { country: "Georgia" }))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(h.store.users.get(userId)?.addresses[0].country).toBe("GE");
  });

  it("delete account with a wrong password is FORBIDDEN and keeps the account", async () => {
    const del = new DeleteAccountHandler(h.users, h.uow, h.hasher, h.emails, h.clock);
    await expect(del.execute(new DeleteAccountCommand(userId, "wrong"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.store.users.has(userId)).toBe(true);
  });

  it("delete account erases the user, sessions and tokens and writes UserDeleted with an account-deleted email", async () => {
    await new DeleteAccountHandler(h.users, h.uow, h.hasher, h.emails, h.clock).execute(new DeleteAccountCommand(userId, "longenough1"));
    expect(h.store.users.has(userId)).toBe(false);
    expect([...h.store.sessions.values()].filter((s) => s.userId === userId)).toHaveLength(0);
    expect([...h.store.tokens.values()].filter((t) => t.userId === userId)).toHaveLength(0);
    expect(h.store.events("UserDeleted")).toMatchObject([{ aggregateId: userId, payload: { userId, email: "nino@example.com" } }]);
    expect(h.store.emails("account-deleted")).toMatchObject([{ to: { email: "nino@example.com", name: "Nino" }, dedupeKey: `account-deleted:${userId}` }]);
    await expect(new GetCurrentUserHandler(h.readModel).execute(new GetCurrentUserQuery(userId))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("every account email command carries a unique dedupeKey", async () => {
    await register.execute(new RegisterUserCommand("third@example.com", "longenough1", "Third"));
    const keys = h.store.emails().map((m) => m.dedupeKey);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("seeds a verified admin idempotently and corrects a drifted password", async () => {
    const seed = new SeedAdminHandler(h.uow, h.hasher, h.settings, h.clock);
    const first = await seed.execute();
    expect(first.admin).toMatchObject({ email: "admin@example.com", role: "admin", created: true });
    const outbox = h.store.outbox.length;
    const again = await seed.execute();
    expect(again.admin).toMatchObject({ id: first.admin.id, created: false });
    expect(h.store.outbox).toHaveLength(outbox);
    h.settings.admin = { email: "admin@example.com", password: "rotated-password-9" };
    await seed.execute();
    const admin = h.store.users.get(first.admin.id);
    expect(admin).toMatchObject({ role: "admin", passwordHash: "hashed:rotated-password-9" });
    expect(admin?.emailVerifiedAt).not.toBeNull();
  });

  it("lists customers newest first with search and cursor pagination, excluding admins", async () => {
    await new SeedAdminHandler(h.uow, h.hasher, h.settings, h.clock).execute();
    for (const name of ["Ana", "Beka", "Cira"]) {
      h.clock.advance(1000);
      await register.execute(new RegisterUserCommand(`${name.toLowerCase()}@example.com`, "longenough1", name));
    }
    const list = new ListCustomersHandler(h.readModel);
    const page1 = await list.execute(new ListCustomersQuery(null, null, 2));
    expect(page1.items.map((u) => u.name)).toEqual(["Cira", "Beka"]);
    const page2 = await list.execute(new ListCustomersQuery(null, page1.nextCursor, 2));
    expect(page2.items.map((u) => u.name)).toEqual(["Ana", "Nino"]);
    expect(page2.nextCursor).toBeNull();
    expect((await list.execute(new ListCustomersQuery("BEK", null, 500))).items.map((u) => u.email)).toEqual(["beka@example.com"]);
    await expect(list.execute(new ListCustomersQuery(null, "garbage", 10))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
