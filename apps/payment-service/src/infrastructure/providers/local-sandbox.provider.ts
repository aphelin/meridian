import { injectChaos } from "@meridian/nest-kit";
import type { PaymentProvider, ProviderRefundResult } from "../../application/ports";

/** Default provider: no external calls, completion through the client-secret sandbox endpoint, instant refunds. */
export class LocalSandboxProvider implements PaymentProvider {
  readonly id = "local-sandbox" as const;
  readonly supportsSandboxCompletion = true;

  async createTransaction() {
    return null;
  }

  async refund(): Promise<ProviderRefundResult> {
    await injectChaos("payment.local-sandbox");
    return { status: "succeeded", providerRefundId: null };
  }

  async cancelTransaction(): Promise<void> {}

  clientToken() {
    return null;
  }
}
