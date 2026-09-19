import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { USER_AGGREGATE, type OneTimeToken, type User } from "../../domain";
import { IdentitySettings } from "../ports/identity-settings";
import type { SendEmailPayload, TransactionScope } from "../ports";

/**
 * Builds the account emails. Every one is a `notification.send-email` command written to the outbox in the caller's
 * transaction, with a unique dedupe key and links rooted at PUBLIC_SITE_URL.
 */
@Injectable()
export class AccountEmails {
  constructor(@Inject(IdentitySettings) private readonly settings: IdentitySettings) {}

  link(path: string, secret: string): string {
    return `${this.settings.publicSiteUrl}${path}?token=${encodeURIComponent(secret)}`;
  }

  verifyEmail(scope: TransactionScope, user: User, token: OneTimeToken, secret: string) {
    return this.send(scope, user, {
      template: "verify-email",
      data: { name: user.name, verifyUrl: this.link("/account/verify-email", secret) },
      dedupeKey: `verify-email:${token.id}`,
    });
  }

  passwordReset(scope: TransactionScope, user: User, token: OneTimeToken, secret: string) {
    return this.send(scope, user, {
      template: "password-reset",
      data: { name: user.name, resetUrl: this.link("/account/reset-password", secret) },
      dedupeKey: `password-reset:${token.id}`,
    });
  }

  passwordChanged(scope: TransactionScope, user: User) {
    return this.send(scope, user, { template: "password-changed", data: { name: user.name }, dedupeKey: `password-changed:${user.id}:${randomUUID()}` });
  }

  accountDeleted(scope: TransactionScope, user: User) {
    return this.send(scope, user, { template: "account-deleted", data: { name: user.name }, dedupeKey: `account-deleted:${user.id}` });
  }

  private send(scope: TransactionScope, user: User, email: Pick<SendEmailPayload, "template" | "data" | "dedupeKey">) {
    return scope.outbox.sendEmail({ ...email, to: { email: user.email, name: user.name } }, { type: USER_AGGREGATE, id: user.id });
  }
}
