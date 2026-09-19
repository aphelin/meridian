import { createLogger } from "@meridian/nest-kit";
import { CLOCK, type Clock } from "@meridian/kernel";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EmailAddress, NewsletterSubscription, SecretToken, TokenInvalidError } from "../../domain";
import { IdGenerator, SiteLinks, UnitOfWork } from "../ports";
import { ConfirmNewsletterCommand, SubscribeNewsletterCommand, UnsubscribeNewsletterCommand, type NewsletterStatusResult } from "./newsletter.commands";

const log = createLogger("Newsletter");

/**
 * Starts or restarts double opt-in. Always answers "accepted" so the endpoint never reveals whether an address is
 * already subscribed; only unconfirmed addresses get a (new) confirmation link.
 */
@CommandHandler(SubscribeNewsletterCommand)
export class SubscribeNewsletterHandler implements ICommandHandler<SubscribeNewsletterCommand, { accepted: true }> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: SiteLinks,
    private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ email }: SubscribeNewsletterCommand): Promise<{ accepted: true }> {
    const address = EmailAddress.parse(email);
    await this.uow.run(async (tx) => {
      const now = this.clock.now();
      const fresh = NewsletterSubscription.start(this.ids.next("nls"), address, now);
      let subscription: NewsletterSubscription | null = null;
      let token: SecretToken | null = null;
      if (await tx.subscriptions.insertIfMissing(fresh.subscription)) {
        subscription = fresh.subscription;
        token = fresh.confirmToken;
      } else {
        subscription = await tx.subscriptions.lockByEmail(address.value);
        if (!subscription) throw new Error("newsletter subscription vanished inside its transaction");
        token = subscription.request(now);
        if (!token) return;
        await tx.subscriptions.save(subscription);
      }
      await tx.enqueueEmail({
        template: "newsletter-confirm",
        to: { email: address.value, name: null },
        data: { confirmUrl: this.links.newsletterConfirmUrl(token.value) },
        // One mail per issued token: a new request mails a new link, a redelivered command never mails twice.
        dedupeKey: `newsletter-confirm:${subscription.id}:${token.hash.slice(0, 32)}`,
      });
    });
    return { accepted: true };
  }
}

@CommandHandler(ConfirmNewsletterCommand)
export class ConfirmNewsletterHandler implements ICommandHandler<ConfirmNewsletterCommand, NewsletterStatusResult> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly links: SiteLinks,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ token }: ConfirmNewsletterCommand): Promise<NewsletterStatusResult> {
    if (!SecretToken.isWellFormed(token)) throw new TokenInvalidError();
    const hash = SecretToken.hashOf(token);
    return this.uow.run(async (tx) => {
      const subscription = await tx.subscriptions.lockByConfirmTokenHash(hash);
      if (!subscription) throw new TokenInvalidError();
      const unsubscribe = subscription.confirm(hash, this.clock.now());
      await tx.subscriptions.save(subscription);
      await tx.enqueueEmail({
        template: "newsletter-welcome",
        to: { email: subscription.email, name: null },
        data: { unsubscribeUrl: this.links.newsletterUnsubscribeUrl(unsubscribe.value) },
        dedupeKey: `newsletter-welcome:${subscription.id}:${unsubscribe.hash.slice(0, 32)}`,
      });
      log.info("newsletter subscription confirmed", { subscriptionId: subscription.id });
      return { status: subscription.status };
    });
  }
}

@CommandHandler(UnsubscribeNewsletterCommand)
export class UnsubscribeNewsletterHandler implements ICommandHandler<UnsubscribeNewsletterCommand, NewsletterStatusResult> {
  constructor(
    private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ token }: UnsubscribeNewsletterCommand): Promise<NewsletterStatusResult> {
    if (!SecretToken.isWellFormed(token)) throw new TokenInvalidError();
    const hash = SecretToken.hashOf(token);
    return this.uow.run(async (tx) => {
      const subscription = await tx.subscriptions.lockByUnsubscribeTokenHash(hash);
      if (!subscription) throw new TokenInvalidError();
      subscription.unsubscribe(hash, this.clock.now());
      await tx.subscriptions.save(subscription);
      log.info("newsletter unsubscribed", { subscriptionId: subscription.id });
      return { status: subscription.status };
    });
  }
}
