import { CLOCK, SystemClock } from "@meridian/kernel";
import { KitModule, MessagingModule } from "@meridian/nest-kit";
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import {
  AccessTokenIssuer,
  ApplicationServices,
  CommandHandlers,
  IdentityReadModel,
  IdentitySettings,
  PasswordHasher,
  QueryHandlers,
  UnitOfWork,
} from "./application";
import { OneTimeTokenRepository, RefreshTokenRepository, UserRepository } from "./domain";
import { Argon2PasswordHasher } from "./infrastructure/adapters/argon2-password-hasher";
import { JwtAccessTokenIssuer } from "./infrastructure/adapters/jwt-access-token-issuer";
import { EnvIdentitySettings } from "./infrastructure/config/env-identity-settings";
import { PrismaIdentityReadModel } from "./infrastructure/persistence/prisma-identity-read-model";
import { PrismaOneTimeTokenRepository } from "./infrastructure/persistence/prisma-one-time-token.repository";
import { PrismaRefreshTokenRepository } from "./infrastructure/persistence/prisma-refresh-token.repository";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user.repository";
import { PrismaService } from "./infrastructure/persistence/prisma.service";
import { Controllers } from "./presentation/http";

export const SERVICE_NAME = "identity-service";

@Module({
  imports: [
    CqrsModule.forRoot(),
    KitModule.forRoot({ service: SERVICE_NAME }),
    // Identity only produces: events to Kafka (meridian.identity) and send-email commands to RabbitMQ, via the relay.
    MessagingModule.forRoot({ service: SERVICE_NAME, prisma: PrismaService, kafka: true, rabbit: true, relay: true }),
  ],
  controllers: Controllers,
  providers: [
    PrismaService,
    { provide: CLOCK, useClass: SystemClock },
    { provide: IdentitySettings, useFactory: () => new EnvIdentitySettings() },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: AccessTokenIssuer, useClass: JwtAccessTokenIssuer },
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    { provide: IdentityReadModel, useClass: PrismaIdentityReadModel },
    // Non-transactional repositories for reads that precede a unit of work (no row locks).
    { provide: UserRepository, useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma, false), inject: [PrismaService] },
    { provide: OneTimeTokenRepository, useFactory: (prisma: PrismaService) => new PrismaOneTimeTokenRepository(prisma), inject: [PrismaService] },
    { provide: RefreshTokenRepository, useFactory: (prisma: PrismaService) => new PrismaRefreshTokenRepository(prisma), inject: [PrismaService] },
    ...ApplicationServices,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class AppModule {}
