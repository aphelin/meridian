import type { CreateIntentRequest } from "@meridian/contracts";

export class CreatePaymentIntentCommand {
  constructor(readonly request: CreateIntentRequest) {}
}
