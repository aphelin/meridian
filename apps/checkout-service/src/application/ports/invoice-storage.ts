/** Private object storage for invoice PDFs. */
export abstract class InvoiceStorage {
  /** Stores (or overwrites) the PDF. Bounded by a timeout and a circuit breaker; rejects when storage is unavailable. */
  abstract put(objectKey: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Short-lived download link. */
  abstract downloadUrl(objectKey: string, expiresInSec: number): Promise<{ url: string; expiresAt: Date }>;
}
