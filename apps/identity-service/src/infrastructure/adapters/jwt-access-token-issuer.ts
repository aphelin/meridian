import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccessTokenIssuer } from "../../application/ports";
import type { Role } from "../../domain";

/** HS256 access tokens via the platform JwtModule (secret policy and 15 minute lifetime come from nest-kit). */
@Injectable()
export class JwtAccessTokenIssuer extends AccessTokenIssuer {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {
    super();
  }

  issue(subject: { id: string; email: string; role: Role }): Promise<string> {
    return this.jwt.signAsync({ sub: subject.id, email: subject.email, role: subject.role });
  }
}
