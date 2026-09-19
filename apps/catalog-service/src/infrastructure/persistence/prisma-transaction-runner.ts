import { ConflictError } from "@meridian/kernel";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma";
import { TransactionRunner, type Tx } from "../../application/ports/transaction";
import { PrismaService } from "./prisma.service";

/** Interactive Prisma transaction; unique-constraint races that slipped past the domain checks surface as 409. */
@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction((tx) => work(tx));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This change conflicts with existing catalog data.", { target: error.meta?.target });
      }
      throw error;
    }
  }
}

/** Repositories accept the opaque domain transaction handle; outside a unit of work they use the client directly. */
export function db(prisma: PrismaService, tx?: object): Prisma.TransactionClient {
  return (tx ?? prisma) as Prisma.TransactionClient;
}
