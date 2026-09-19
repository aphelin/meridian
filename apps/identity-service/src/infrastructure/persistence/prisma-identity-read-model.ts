import type { AddressDto, CustomerListDto, UserDto } from "@meridian/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { type CustomerListCriteria, CustomerCursorCodec, IdentityReadModel } from "../../application";
import type { Address as AddressRow, Prisma, User as UserRow } from "../../generated/prisma";
import { isRole } from "../../domain";
import { PrismaService } from "./prisma.service";

const userDto = (row: UserRow): UserDto => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: isRole(row.role) ? row.role : "customer",
  emailVerified: row.emailVerifiedAt !== null,
  createdAt: row.createdAt.toISOString(),
});

const addressDto = (row: AddressRow): AddressDto => ({
  id: row.id,
  label: row.label,
  fullName: row.fullName,
  line1: row.line1,
  line2: row.line2,
  city: row.city,
  postalCode: row.postalCode,
  country: row.country,
  phone: row.phone,
  isDefault: row.isDefault,
});

@Injectable()
export class PrismaIdentityReadModel extends IdentityReadModel {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async userById(id: string): Promise<UserDto | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? userDto(row) : null;
  }

  async addressesOf(userId: string): Promise<AddressDto[] | null> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { addresses: { orderBy: { position: "asc" } } } });
    return row ? row.addresses.map(addressDto) : null;
  }

  async customers({ q, cursor, limit }: CustomerListCriteria): Promise<CustomerListDto> {
    const and: Prisma.UserWhereInput[] = [{ role: "customer" }];
    if (q) and.push({ OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] });
    if (cursor) {
      const after = CustomerCursorCodec.decode(cursor);
      and.push({ OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] });
    }
    const rows = await this.prisma.user.findMany({ where: { AND: and }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page.map(userDto), nextCursor: rows.length > limit && last ? CustomerCursorCodec.encode(last) : null };
  }
}
