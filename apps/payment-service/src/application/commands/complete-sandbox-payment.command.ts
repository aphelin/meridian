export class CompleteSandboxPaymentCommand {
  constructor(
    readonly transactionId: string,
    readonly clientSecret: string,
  ) {}
}

export interface SandboxCompletionResult {
  status: string;
}
