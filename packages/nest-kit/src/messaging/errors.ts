/**
 * Thrown by a message handler when retrying cannot help (invalid payload, business rule that will never pass).
 * RabbitMQ commands go straight to the DLQ and Kafka events straight to the group's DLT, skipping retry tiers.
 */
export class PermanentError extends Error {
  /** Marker that survives duplicated module copies, where `instanceof` would fail. */
  readonly permanent = true;

  constructor(
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PermanentError";
  }
}

export function isPermanentError(error: unknown): boolean {
  if (error instanceof PermanentError) return true;
  return typeof error === "object" && error !== null && (error as { permanent?: unknown }).permanent === true;
}

/** Raised when a message body cannot be decoded into a valid envelope. Retrying never fixes it. */
export class InvalidEnvelopeError extends PermanentError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEnvelopeError";
  }
}

/** Human-readable, bounded error text for headers and outbox rows. */
export function errorText(error: unknown, max = 1000): string {
  const text = error instanceof Error ? (error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message) : String(error);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
