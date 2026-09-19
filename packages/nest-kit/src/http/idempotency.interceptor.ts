import { HttpHeaders } from "@meridian/contracts";
import { DomainError, ValidationError } from "@meridian/kernel";
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import { createHash } from "node:crypto";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { createLogger } from "../core/logger";

export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; response: unknown }
  | { state: "mismatch" }
  | { state: "in-flight" };

/** Persistence for idempotent requests; implemented by the owning service (e.g. checkout in Postgres). */
export type IdempotencyStore = {
  claim(key: string, fingerprint: string): Promise<IdempotencyClaim>;
  complete(key: string, response: unknown): Promise<void>;
  release(key: string): Promise<void>;
};

export const IDEMPOTENCY_STORE = Symbol("IDEMPOTENCY_STORE");

const MAX_KEY_LENGTH = 128;
const log = createLogger("Idempotency");

type IdempotentRequest = {
  method: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  principal?: { sub: string } | null;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const header = (req: IdempotentRequest, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Replays the stored response for a repeated Idempotency-Key. The key is scoped by method, route and caller;
 * reusing it with a different body is 422 IDEMPOTENCY_MISMATCH, while the first request still runs 409 IDEMPOTENCY_IN_FLIGHT.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<IdempotentRequest>();
    const idempotencyKey = header(req, HttpHeaders.idempotencyKey);
    if (!idempotencyKey) return next.handle();
    if (idempotencyKey.length > MAX_KEY_LENGTH) throw new ValidationError(`Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`);
    const scope = req.principal?.sub ?? header(req, HttpHeaders.cartId) ?? "anonymous";
    const key = sha256(`${req.method} ${req.route?.path ?? ""} ${scope} ${idempotencyKey}`);
    const claim = await this.store.claim(key, sha256(JSON.stringify(req.body ?? {})));
    if (claim.state === "mismatch") throw new DomainError("IDEMPOTENCY_MISMATCH", "This Idempotency-Key was already used with a different request");
    if (claim.state === "in-flight") throw new DomainError("IDEMPOTENCY_IN_FLIGHT", "A request with this Idempotency-Key is still being processed");
    if (claim.state === "replay") {
      ctx.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>().setHeader("idempotent-replayed", "true");
      return of(claim.response);
    }
    return next.handle().pipe(
      // Only a failed handler releases the claim; once the work succeeded a retry must replay, never re-run it.
      catchError((err) => from(this.store.release(key).catch((error) => log.error("idempotency release failed", { error }))).pipe(mergeMap(() => throwError(() => err)))),
      mergeMap(async (response) => {
        const snapshot = JSON.parse(JSON.stringify(response ?? null)) as unknown;
        await this.store.complete(key, snapshot).catch((error) => log.error("idempotency completion failed; retries will see the key as in flight", { error }));
        return snapshot;
      }),
    );
  }
}
