export class HandlePaddleWebhookCommand {
  constructor(
    readonly rawBody: Buffer | undefined,
    readonly signature: string | undefined,
  ) {}
}

export interface WebhookResult {
  received: true;
  outcome: "processed" | "duplicate" | "ignored";
}
