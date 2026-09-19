import type { Role } from "../../domain";

/** Signs short-lived access tokens (JWT) for a user. */
export abstract class AccessTokenIssuer {
  abstract issue(subject: { id: string; email: string; role: Role }): Promise<string>;
}
