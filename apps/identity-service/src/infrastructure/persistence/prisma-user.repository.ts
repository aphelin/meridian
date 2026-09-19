import { ConflictError, type Email } from "@meridian/kernel";
import type { Address as AddressRow, User as UserRow } from "../../generated/prisma";
import { isRole, User, UserRepository } from "../../domain";
import { type Db, isUniqueViolation } from "./prisma-types";

type Row = UserRow & { addresses: AddressRow[] };

function toDomain(row: Row): User {
  return User.rehydrate({
    id: row.id,
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : "customer",
    passwordHash: row.passwordHash,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    addresses: [...row.addresses]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        id: a.id,
        label: a.label,
        fullName: a.fullName,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        postalCode: a.postalCode,
        country: a.country,
        phone: a.phone,
        isDefault: a.isDefault,
        createdAt: a.createdAt,
      })),
  });
}

/**
 * Prisma adapter for the User aggregate. With `lock` (inside a unit of work) every load takes a row lock
 * (`SELECT … FOR UPDATE`) so commands on one account serialise and invariants hold under concurrency.
 */
export class PrismaUserRepository extends UserRepository {
  constructor(
    private readonly db: Db,
    private readonly lock: boolean,
  ) {
    super();
  }

  async findById(id: string): Promise<User | null> {
    if (this.lock) {
      const locked = await this.db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      if (!locked.length) return null;
    }
    const row = await this.db.user.findUnique({ where: { id }, include: { addresses: true } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    if (this.lock) {
      const locked = await this.db.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "email" = ${email.value} FOR UPDATE`;
      if (!locked.length) return null;
    }
    const row = await this.db.user.findUnique({ where: { email: email.value }, include: { addresses: true } });
    return row ? toDomain(row) : null;
  }

  async add(user: User): Promise<void> {
    const state = user.snapshot();
    try {
      await this.db.user.create({
        data: {
          id: state.id,
          email: state.email,
          name: state.name,
          role: state.role,
          passwordHash: state.passwordHash,
          emailVerifiedAt: state.emailVerifiedAt,
          createdAt: state.createdAt,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("An account with this email already exists.");
      throw error;
    }
    await this.saveAddresses(user);
  }

  async save(user: User): Promise<void> {
    const state = user.snapshot();
    await this.db.user.update({
      where: { id: state.id },
      data: { name: state.name, role: state.role, passwordHash: state.passwordHash, emailVerifiedAt: state.emailVerifiedAt },
    });
    await this.saveAddresses(user);
  }

  async remove(user: User): Promise<void> {
    // Addresses, refresh tokens and one-time tokens cascade with the user row.
    await this.db.user.deleteMany({ where: { id: user.id } });
  }

  private async saveAddresses(user: User) {
    const addresses = user.snapshot().addresses;
    await this.db.address.deleteMany({ where: { userId: user.id, id: { notIn: addresses.map((a) => a.id) } } });
    for (const [position, a] of addresses.entries()) {
      const fields = {
        label: a.label,
        fullName: a.fullName,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        postalCode: a.postalCode,
        country: a.country,
        phone: a.phone,
        isDefault: a.isDefault,
        position,
      };
      await this.db.address.upsert({
        where: { id: a.id },
        create: { id: a.id, userId: user.id, createdAt: a.createdAt, ...fields },
        update: fields,
      });
    }
  }
}
