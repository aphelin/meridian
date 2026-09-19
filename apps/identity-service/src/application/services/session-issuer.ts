import type { AuthResultDto } from "@meridian/contracts";
import { type Clock, CLOCK } from "@meridian/kernel";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RefreshToken, type User } from "../../domain";
import { AccessTokenIssuer } from "../ports/access-token-issuer";
import { IdentitySettings } from "../ports/identity-settings";
import type { TransactionScope } from "../ports";
import { toUserDto } from "./mappers";

/** Mints an access token plus a refresh token in a new or continuing family. */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(AccessTokenIssuer) private readonly accessTokens: AccessTokenIssuer,
    @Inject(IdentitySettings) private readonly settings: IdentitySettings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(scope: TransactionScope, user: User, familyId: string = randomUUID()): Promise<AuthResultDto> {
    const { token, secret } = RefreshToken.issue({ id: randomUUID(), familyId, userId: user.id, now: this.clock.now(), ttlMs: this.settings.refreshTokenTtlMs });
    await scope.sessions.add(token);
    const accessToken = await this.accessTokens.issue({ id: user.id, email: user.email, role: user.role });
    return { accessToken, refreshToken: secret, user: toUserDto(user) };
  }
}
