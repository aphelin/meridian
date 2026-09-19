import { HttpHeaders } from "@meridian/contracts";
import { Injectable } from "@nestjs/common";
import { RequestContext } from "../core/context";
import { createLogger } from "../core/logger";
import { createBreaker, type KitBreaker } from "./breaker";
import { UpstreamHttpError, UpstreamUnavailableError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ResilientHttpClientOptions {
  /** Breaker name and chaos target suffix (`http:<name>`), e.g. "inventory". */
  name: string;
  /** Prefix for relative paths; absolute http(s) URLs bypass it. */
  baseUrl: string;
  timeoutMs: number;
  /** Authorization header value per call, e.g. a freshly signed service token. */
  auth?: () => string | undefined;
  /** Extra attempts for GET requests on timeouts, network errors and 5xx. Never applied to other methods. */
  retries?: number;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

interface Outgoing {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}


const RETRY_BASE_MS = 100;
/** Grace between the breaker timeout and the socket abort, so the breaker reports the timeout and the socket is still released. */
const ABORT_GRACE_MS = 100;
const log = createLogger("HttpClient");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP client for one upstream: per-client circuit breaker, timeout, correlation id propagation, GET-only retries.
 * Upstream 4xx responses reject with UpstreamHttpError without counting as breaker failures; 5xx count as failures;
 * timeouts, network errors and an open breaker reject with UpstreamUnavailableError.
 */
export class ResilientHttpClient {
  readonly name: string;
  private readonly breaker: KitBreaker<[Outgoing], unknown>;

  constructor(private readonly options: ResilientHttpClientOptions) {
    this.name = options.name;
    this.breaker = createBreaker(options.name, `http:${options.name}`, (request: Outgoing) => this.send(request), {
      timeoutMs: options.timeoutMs,
      isNeutral: (error) => error instanceof UpstreamHttpError && error.status < 500,
    });
  }

  get<T = unknown>(path: string, body?: undefined, options?: HttpRequestOptions): Promise<T> {
    if (body !== undefined) throw new TypeError("GET requests cannot carry a body");
    return this.request<T>("GET", path, undefined, options);
  }

  post<T = unknown>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  put<T = unknown>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  patch<T = unknown>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  delete<T = unknown>(path: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, body, options);
  }

  async request<T = unknown>(method: HttpMethod, path: string, body?: unknown, options: HttpRequestOptions = {}): Promise<T> {
    const outgoing: Outgoing = { method, url: this.resolve(path), headers: this.headers(body, options) };
    if (body !== undefined) outgoing.body = JSON.stringify(body);
    const attempts = method === "GET" ? 1 + Math.max(0, Math.floor(this.options.retries ?? 0)) : 1;

    for (let attempt = 1; ; attempt++) {
      try {
        return (await this.breaker.fire(outgoing)) as T;
      } catch (error) {
        if (attempt >= attempts || !retryable(error)) throw error;
        const delay = RETRY_BASE_MS * 2 ** (attempt - 1) * (0.5 + Math.random());
        log.warn("upstream call failed; retrying", { upstream: this.name, method, url: outgoing.url, attempt, delayMs: Math.round(delay), error: describe(error) });
        await sleep(delay);
      }
    }
  }

  private resolve(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = this.options.baseUrl.replace(/\/+$/, "");
    if (!base) throw new TypeError(`ResilientHttpClient "${this.name}" has no baseUrl; pass an absolute URL`);
    return `${base}/${path.replace(/^\/+/, "")}`;
  }

  private headers(body: unknown, options: HttpRequestOptions): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const correlationId = RequestContext.correlationId();
    if (correlationId) headers[HttpHeaders.correlationId] = correlationId;
    const authorization = this.options.auth?.();
    if (authorization) headers.authorization = authorization;
    if (options.idempotencyKey) headers[HttpHeaders.idempotencyKey] = options.idempotencyKey;
    return { ...headers, ...options.headers };
  }

  private async send(request: Outgoing): Promise<unknown> {
    let res: Response;
    let text: string;
    try {
      res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(this.options.timeoutMs + ABORT_GRACE_MS),
      });
      text = await res.text();
    } catch (error) {
      const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "network";
      throw new UpstreamUnavailableError(this.name, reason, { cause: error });
    }
    if (res.status >= 400) throw UpstreamHttpError.fromResponse(this.name, res.status, text);
    return parseBody(this.name, res.status, res.headers.get("content-type") ?? "", text);
  }
}

/** JSON bodies are parsed; a body that claims JSON but is not counts as an upstream failure (502), not a local crash. */
function parseBody(upstream: string, status: number, contentType: string, text: string): unknown {
  if (status === 204 || !text) return undefined;
  const claimsJson = /[/+]json\b/i.test(contentType);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!claimsJson) return text;
    throw new UpstreamHttpError(502, "INTERNAL", "A service we depend on returned an invalid response.", text, upstream);
  }
}

function retryable(error: unknown): boolean {
  if (error instanceof UpstreamUnavailableError) return error.reason === "timeout" || error.reason === "network";
  return error instanceof UpstreamHttpError && error.status >= 500;
}

function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Injectable factory: one client (and breaker) per upstream name for the whole process. */
@Injectable()
export class ResilientHttpClientFactory {
  private readonly clients = new Map<string, ResilientHttpClient>();

  create(options: ResilientHttpClientOptions): ResilientHttpClient {
    const existing = this.clients.get(options.name);
    if (existing) return existing;
    const client = new ResilientHttpClient(options);
    this.clients.set(options.name, client);
    return client;
  }
}
