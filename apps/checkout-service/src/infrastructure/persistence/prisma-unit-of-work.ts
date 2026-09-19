import { Injectable } from "@nestjs/common";
import { UnitOfWork } from "../../application/ports";
import type { TransactionContext } from "../../domain";
import type { Prisma } from "../../generated/prisma";
import { type Db, PrismaService } from "./prisma.service";

/** The Prisma client behind a TransactionContext (or the root client outside a unit of work). */
export const dbOf = (prisma: PrismaService, tx?: TransactionContext): Db => (tx ? (tx as unknown as Prisma.TransactionClient) : prisma);

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(tx as unknown as TransactionContext));
  }
}
