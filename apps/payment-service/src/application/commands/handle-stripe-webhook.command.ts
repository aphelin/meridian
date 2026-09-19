export class HandleStripeWebhookCommand {
  constructor(
    readonly rawBody: Buffer | undefined,
    readonly signature: string | undefined,
  ) {}
}
