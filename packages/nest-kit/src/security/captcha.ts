import { HttpHeaders } from "@meridian/contracts";
import { DomainError } from "@meridian/kernel";
import { applyDecorators, CanActivate, ExecutionContext, Inject, Injectable, Optional, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { verifyBearer } from "../auth";
import { createLogger } from "../core/logger";
import { counter } from "../core/metrics";
import { createBreaker, type KitBreaker } from "../http/breaker";
import { clientIp, type IpRequest, isLoopbackIp } from "./client-ip";

export const TURNSTILE_DEFAULT_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's documented always-pass test secret; real deployments set TURNSTILE_SECRET_KEY. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const CAPTCHA_BREAKER = "captcha";
export const CAPTCHA_CHAOS_TARGET = "captcha.verify";

export interface TurnstileOptions {
  secretKey: string;
  verifyUrl: string;
  timeoutMs: number;
}

export const TURNSTILE_OPTIONS = Symbol("TURNSTILE_OPTIONS");

export interface CaptchaVerification {
  success: boolean;
  errorCodes: string[];
  action: string | null;
  hostname: string | null;
}

interface SiteverifyResponse {
  success?: unknown;
  "error-codes"?: unknown;
  action?: unknown;
  hostname?: unknown;
}

type CaptchaResult = "success" | "invalid" | "missing" | "unavailable";

const MAX_TOKEN_LENGTH = 2048;
/** Error codes that mean our configuration or Cloudflare is at fault, not the visitor's token. */
const SERVER_SIDE_ERRORS = new Set(["missing-input-secret", "invalid-input-secret", "internal-error", "bad-request"]);
const log = createLogger("Captcha");
const verifications = () => counter("captcha_verifications_total", "Captcha verifications by outcome", ["result"]);

export function turnstileOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): TurnstileOptions {
  const timeout = Number(env.CAPTCHA_TIMEOUT_MS);
  return {
    secretKey: env.TURNSTILE_SECRET_KEY?.trim() || TURNSTILE_TEST_SECRET,
    verifyUrl: env.TURNSTILE_VERIFY_URL?.trim() || TURNSTILE_DEFAULT_VERIFY_URL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 3000,
  };
}

export class CaptchaUnavailableError extends DomainError {
  constructor(cause?: unknown) {
    super("CAPTCHA_UNAVAILABLE", "We could not verify the security check right now. Please try again shortly.");
    this.name = "CaptchaUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Cloudflare Turnstile siteverify client: form-encoded POST with timeout and the "captcha" breaker.
 * Resolves with Cloudflare's verdict; rejects with CaptchaUnavailableError when no verdict could be obtained.
 */
@Injectable()
export class TurnstileVerifier {
  private readonly options: TurnstileOptions;
  private readonly breaker: KitBreaker<[URLSearchParams], SiteverifyResponse>;

  constructor(@Optional() @Inject(TURNSTILE_OPTIONS) options?: Partial<TurnstileOptions>) {
    this.options = { ...turnstileOptionsFromEnv(), ...options };
    this.breaker = createBreaker(CAPTCHA_BREAKER, CAPTCHA_CHAOS_TARGET, (form: URLSearchParams) => this.post(form), {
      timeoutMs: this.options.timeoutMs,
    });
  }

  async verify(token: string, context: { remoteIp?: string; idempotencyKey?: string } = {}): Promise<CaptchaVerification> {
    const form = new URLSearchParams({ secret: this.options.secretKey, response: token, idempotency_key: context.idempotencyKey ?? randomUUID() });
    if (context.remoteIp) form.set("remoteip", context.remoteIp);
    let body: SiteverifyResponse;
    try {
      body = await this.breaker.fire(form);
    } catch (error) {
      throw new CaptchaUnavailableError(error);
    }
    const errorCodes = Array.isArray(body["error-codes"]) ? body["error-codes"].map(String) : [];
    if (body.success !== true && errorCodes.some((code) => SERVER_SIDE_ERRORS.has(code))) {
      log.error("turnstile rejected the verification request itself", { errorCodes });
      throw new CaptchaUnavailableError();
    }
    return {
      success: body.success === true,
      errorCodes,
      action: typeof body.action === "string" && body.action ? body.action : null,
      hostname: typeof body.hostname === "string" ? body.hostname : null,
    };
  }

  private async post(form: URLSearchParams): Promise<SiteverifyResponse> {
    // The abort fires just after the breaker timeout so the breaker records a timeout and the socket is still released.
    const res = await fetch(this.options.verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(this.options.timeoutMs + 100),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object") throw new Error("siteverify answered with a non-object body");
    return parsed as SiteverifyResponse;
  }
}

export interface RequireCaptchaOptions {
  /** Skip verification for this request, e.g. `(req) => Boolean(req.principal)` for signed-in shoppers. */
  skipWhen?: (req: CaptchaRequest) => boolean;
}

export type CaptchaRequest = IpRequest & { body?: unknown; principal?: { sub: string; role?: string } | null };

interface CaptchaMetadata {
  action: string;
  options: RequireCaptchaOptions;
}

const CAPTCHA_METADATA = "meridian:captcha";

/** Requires a valid Turnstile token (`x-captcha-token` header or body `captchaToken`) for this route. Fails closed. */
export function RequireCaptcha(action: string, options: RequireCaptchaOptions = {}) {
  return applyDecorators(SetMetadata(CAPTCHA_METADATA, { action, options } satisfies CaptchaMetadata), UseGuards(CaptchaGuard));
}

export function captchaToken(req: CaptchaRequest): string | undefined {
  const header = req.headers[HttpHeaders.captchaToken];
  const fromHeader = (Array.isArray(header) ? header[0] : header)?.trim();
  if (fromHeader) return fromHeader;
  const body = req.body !== null && typeof req.body === "object" ? (req.body as { captchaToken?: unknown }) : {};
  return typeof body.captchaToken === "string" && body.captchaToken.trim() ? body.captchaToken.trim() : undefined;
}

@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TurnstileVerifier,
    @Optional() private readonly jwt?: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<CaptchaMetadata | undefined>(CAPTCHA_METADATA, [ctx.getHandler(), ctx.getClass()]);
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest<CaptchaRequest>();
    if (meta.options.skipWhen) {
      await this.resolvePrincipal(req);
      if (meta.options.skipWhen(req)) return true;
    }

    const token = captchaToken(req);
    if (!token) return this.reject("missing", meta.action, new DomainError("CAPTCHA_REQUIRED", "Please complete the security check."));
    if (token.length > MAX_TOKEN_LENGTH) return this.reject("invalid", meta.action, invalidCaptcha());

    let verdict: CaptchaVerification;
    try {
      const ip = clientIp(req);
      verdict = await this.verifier.verify(token, { remoteIp: ip && !isLoopbackIp(ip) ? ip : undefined });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      log.warn("captcha verification unavailable; failing closed", { action: meta.action, error: cause instanceof Error ? cause.message : String(cause) });
      return this.reject("unavailable", meta.action, error instanceof DomainError ? error : new CaptchaUnavailableError(error));
    }
    if (!verdict.success) return this.reject("invalid", meta.action, invalidCaptcha(), { errorCodes: verdict.errorCodes });
    // Widgets without an explicit action report none; only a conflicting action is a replayed token from another form.
    if (verdict.action && verdict.action !== meta.action) {
      return this.reject("invalid", meta.action, invalidCaptcha(), { expectedAction: meta.action, tokenAction: verdict.action });
    }
    verifications().inc({ result: "success" });
    return true;
  }

  /** Guards run in decorator order, so skipWhen may be evaluated before the auth guard has attached the principal. */
  private async resolvePrincipal(req: CaptchaRequest) {
    if (req.principal !== undefined || !this.jwt) return;
    try {
      const principal = await verifyBearer(this.jwt, req.headers.authorization);
      if (principal) req.principal = principal;
    } catch {
      // An invalid token earns no exemption; the auth guard reports it.
    }
  }

  private reject(result: CaptchaResult, action: string, error: DomainError, fields: Record<string, unknown> = {}): never {
    verifications().inc({ result });
    if (result === "invalid") log.info("captcha rejected", { action, ...fields });
    throw error;
  }
}

const invalidCaptcha = () => new DomainError("CAPTCHA_INVALID", "The security check failed. Please try again.");
