import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContextState {
  correlationId: string;
  /** messageId of the message being handled, when the work was triggered by Kafka or RabbitMQ. */
  causationId: string | null;
  principalId: string | null;
}

const storage = new AsyncLocalStorage<RequestContextState>();

/**
 * Per-request / per-message context carried through async code.
 * HTTP middleware and message consumers open it; the HTTP client, outbox and logger read it.
 */
export const RequestContext = {
  run<T>(state: Partial<RequestContextState>, fn: () => T): T {
    return storage.run(
      {
        correlationId: state.correlationId || randomUUID(),
        causationId: state.causationId ?? null,
        principalId: state.principalId ?? null,
      },
      fn,
    );
  },

  get(): RequestContextState | undefined {
    return storage.getStore();
  },

  /** Current correlation id, or undefined outside a request or message. */
  correlationId(): string | undefined {
    return storage.getStore()?.correlationId;
  },

  /** Updates fields on the current context, e.g. once auth has resolved the principal. No-op outside a context. */
  patch(partial: Partial<RequestContextState>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, partial);
  },
};
