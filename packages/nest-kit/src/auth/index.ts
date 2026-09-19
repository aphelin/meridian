import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { DomainError, NotFoundError } from "@meridian/kernel";
import { RequestContext } from "../core/context";
import { jwtSecret } from "./secrets";

export { orderAccessToken, orderLinkSecret, verifyOrderAccessToken } from "./order-access";
export { isDevelopmentEnv, jwtSecret } from "./secrets";

export type Principal = { sub: string; email?: string; role?: string };

type AuthRequest = { headers: Record<string, string | string[] | undefined>; principal?: Principal | null };

const ROLES = "meridian:roles";
const OPTIONAL = "meridian:optional-auth";

export function jwtModule() {
  return JwtModule.register({
    secret: jwtSecret(),
    signOptions: { algorithm: "HS256", expiresIn: "15m" },
    verifyOptions: { algorithms: ["HS256"] },
  });
}

/** Resolves the bearer principal: null when no header, throws UNAUTHORIZED when the header or token is invalid. */
export async function verifyBearer(jwt: JwtService, header: string | string[] | undefined): Promise<Principal | null> {
  if (header === undefined || header === "") return null;
  const match = typeof header === "string" ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  if (!match) throw new DomainError("UNAUTHORIZED", "Malformed authorization header");
  try {
    const claims = await jwt.verifyAsync<Principal>(match[1]);
    if (typeof claims.sub !== "string" || !claims.sub) throw new Error("token has no subject");
    return claims;
  } catch {
    throw new DomainError("UNAUTHORIZED", "Invalid or expired token");
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const principal = await verifyBearer(this.jwt, req.headers.authorization);
    req.principal = principal;
    if (!principal) {
      if (this.reflector.getAllAndOverride<boolean>(OPTIONAL, targets)) return true;
      throw new DomainError("UNAUTHORIZED", "Sign in required");
    }
    RequestContext.patch({ principalId: principal.sub });
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(principal.role ?? "")) throw new DomainError("FORBIDDEN", "You do not have access to this resource");
    return true;
  }
}

@Injectable()
class DevOnlyGuard implements CanActivate {
  canActivate() {
    if (process.env.NODE_ENV === "production") throw new NotFoundError("Not found");
    return true;
  }
}

export const Authenticated = () => UseGuards(JwtAuthGuard);
export const OptionalAuth = () => applyDecorators(SetMetadata(OPTIONAL, true), UseGuards(JwtAuthGuard));
export const Roles = (...roles: string[]) => applyDecorators(SetMetadata(ROLES, roles), UseGuards(JwtAuthGuard));
export const AdminOnly = () => Roles("admin");
export const ServiceOnly = () => Roles("service");
export const DevOnly = () => UseGuards(DevOnlyGuard);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthRequest>().principal ?? null,
);

export function serviceAuthorization(jwt: JwtService, service: string) {
  return `Bearer ${jwt.sign({ sub: service, role: "service" }, { expiresIn: "1m" })}`;
}
