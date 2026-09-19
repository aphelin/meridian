/** Someone asked to receive the newsletter (double opt-in: a confirmation mail is sent unless already confirmed). */
export class SubscribeNewsletterCommand {
  constructor(readonly email: string) {}
}

/** The subscriber clicked the confirmation link. */
export class ConfirmNewsletterCommand {
  constructor(readonly token: string) {}
}

/** The subscriber clicked the unsubscribe link. */
export class UnsubscribeNewsletterCommand {
  constructor(readonly token: string) {}
}

export interface NewsletterStatusResult {
  status: "pending" | "confirmed" | "unsubscribed";
}
