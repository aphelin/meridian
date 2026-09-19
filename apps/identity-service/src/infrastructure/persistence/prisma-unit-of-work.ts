import { OutboxWriter, type PrismaTx } from "@meridian/nest-kit";
import { Inject, Injectable } from "@nestjs/common";
import { type TransactionScope, UnitOfWork } from "../../application/ports";
import { PrismaMessageOutbox } from "./prisma-message-outbox";
import { PrismaOneTimeTokenRepository } from "./prisma-one-time-token.repository";
import { PrismaRefreshTokenRepository } from "./prisma-refresh-token.repository";
import { PrismaUserRepository } from "./prisma-user.repository";
import { PrismaService } from "./prisma.service";

/** One interactive Prisma transaction per command: aggregate rows, tokens and outbox rows commit together. */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxWriter) private readonly writer: OutboxWriter,
  ) {
    super();
  }

  run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (tx) =>
        work({
          users: new PrismaUserRepository(tx, true),
          tokens: new PrismaOneTimeTokenRepository(tx),
          sessions: new PrismaRefreshTokenRepository(tx),
          outbox: new PrismaMessageOutbox(tx as unknown as PrismaTx, this.writer),
        }),
      { maxWait: 5_000, timeout: 15_000 },
    );
  }
}
