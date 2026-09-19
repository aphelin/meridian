import { HttpHeaders } from "@meridian/contracts";
import { breakerFor, type BffBreaker } from "./breaker";
import { scopeOrDetached } from "./context";
import { ServiceError } from "./errors";

/** Upstream services the BFF talks to, with the service name they report and their dev port default. */
export const SERVICE_DEFS = {
  identity: { service: "identity-service", env: "IDENTITY_URL", fallback: "http://localhost:3001" },
  catalog: { service: "catalog-service", env: "CATALOG_URL", fallback: "http://localhost:3012" },
  inventory: { service: "inventory-service", env: "INVENTORY_URL", fallback: "http://localhost:3003" },
  checkout: { service: "checkout-service", env: "CHECKOUT_URL", fallback: "http://localhost:3004" },
  payment: { service: "payment-service", env: "PAYMENT_URL", fallback: "http://localhost:3005" },
  notification: { service: "notification-service", env: "NOTIFICATION_URL", fallback: "http://localhost:3006" },
  search: { service: "search-worker", env: "SEARCH_URL", fallback: "http://localhost:3007" },
  analytics: { service: "analytics-service", env: "ANALYTICS_URL", fallback: "http://localhost:3008" },
} as const;

export type ServiceKey = keyof typeof SERVICE_DEFS;
export const SERVICE_KEYS = Object.keys(SERVICE_DEFS) as ServiceKey[];

export const DEFAULT_TIMEOUT_MS = 5000;
export const SEARCH_TIMEOUT_MS = 2500;
export const LONG_TIMEOUT_MS = 15_000;

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

export interface CallOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Access token sent as `authorization: Bearer …`. */
  token?: string;
  cartId?: string;
  idempotencyKey?: string;
  captchaToken?: string;
  orderAccess?: string;
  timeoutMs?: number;
  /** Error statuses returned as a value instead of thrown (e.g. a 503 health body). */
  acceptStatuses?: number[];
  /**
   * Read through Next's data cache instead of `no-store`: for the ISR pages only. A `no-store` fetch during a background
   * refresh of a static page makes Next abort that refresh ("changed from static to dynamic"), so the page never updates.
   */
  renderCache?: { revalidate: number; tags: string[] };
}

export interface RawResult<T> {
  status: number;
  body: T;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ServiceClientOptions {
  key: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function buildQuery(query: CallOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Encodes one path segment; ids and slugs never reach an upstream route unescaped. */
export const seg = (value: string) => encodeURIComponent(value);

/**
 * HTTP client for one upstream service: per-call AbortSignal timeout, one opossum breaker per service, correlation id,
 * browser IP forwarding (never loopback) and the session/cart/idempotency/captcha/order-access headers.
 */
export class ServiceClient {
  readonly key: string;
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly breaker: BffBreaker;

  constructor(options: ServiceClientOptions) {
    this.key = options.key;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.breaker = breakerFor(options.key);
  }

  get<T>(path: string, options?: CallOptions) {
    return this.request<T>("GET", path, options);
  }
  post<T>(path: string, options?: CallOptions) {
    return this.request<T>("POST", path, options);
  }
  put<T>(path: string, options?: CallOptions) {
    return this.request<T>("PUT", path, options);
  }
  patch<T>(path: string, options?: CallOptions) {
    return this.request<T>("PATCH", path, options);
  }
  delete<T>(path: string, options?: CallOptions) {
    return this.request<T>("DELETE", path, options);
  }

  async request<T>(method: Method, path: string, options: CallOptions = {}): Promise<T> {
    return (await this.raw<T>(method, path, options)).body;
  }

  /** Like `request`, but also returns the status (useful with `acceptStatuses`). */
  async raw<T>(method: Method, path: string, options: CallOptions = {}): Promise<RawResult<T>> {
    const scope = scopeOrDetached();
    const correlationId = scope.correlationId;
    const headers: Record<string, string> = { accept: "application/json", [HttpHeaders.correlationId]: correlationId };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.cartId) headers[HttpHeaders.cartId] = options.cartId;
    if (options.idempotencyKey) headers[HttpHeaders.idempotencyKey] = options.idempotencyKey;
    if (options.captchaToken) headers[HttpHeaders.captchaToken] = options.captchaToken;
    if (options.orderAccess) headers[HttpHeaders.orderAccess] = options.orderAccess;
    if (scope.forwardedFor) headers[HttpHeaders.forwardedFor] = scope.forwardedFor;

    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}${buildQuery(options.query)}`;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);

    return this.breaker.fire(async () => {
      let res: Response;
      let text: string;
      try {
        const caching: RequestInit = options.renderCache ? { next: { revalidate: options.renderCache.revalidate, tags: options.renderCache.tags } } : { cache: "no-store" };
        res = await this.fetchImpl(url, { method, headers, body, ...caching, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
        text = await res.text();
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        const reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
        throw ServiceError.unavailable(this.key, reason, correlationId, error);
      }
      if (res.status >= 400 && !options.acceptStatuses?.includes(res.status)) {
        throw ServiceError.fromUpstream(this.key, res.status, text, res.headers.get(HttpHeaders.correlationId) ?? correlationId);
      }
      if (!text || res.status === 204) return { status: res.status, body: undefined as T };
      try {
        return { status: res.status, body: JSON.parse(text) as T };
      } catch (error) {
        throw new ServiceError({ status: 502, code: "UPSTREAM_UNAVAILABLE", message: "Something went wrong on our side.", correlationId, service: this.key, cause: error });
      }
    });
  }
}

const KEY = Symbol.for("meridian.bff.services");
type Registry = Map<ServiceKey, ServiceClient>;
const clients: Registry = ((globalThis as Record<symbol, unknown>)[KEY] as Registry | undefined) ?? new Map();
(globalThis as Record<symbol, unknown>)[KEY] = clients;

export function serviceUrl(key: ServiceKey, env: Record<string, string | undefined> = process.env): string {
  const def = SERVICE_DEFS[key];
  return (env[def.env]?.trim() || def.fallback).replace(/\/+$/, "");
}

/** The process-wide client for a service, created from `<SVC>_URL` on first use. */
export function service(key: ServiceKey): ServiceClient {
  let client = clients.get(key);
  if (!client) {
    client = new ServiceClient({ key, baseUrl: serviceUrl(key) });
    clients.set(key, client);
  }
  return client;
}

export const services = {
  get identity() {
    return service("identity");
  },
  get catalog() {
    return service("catalog");
  },
  get inventory() {
    return service("inventory");
  },
  get checkout() {
    return service("checkout");
  },
  get payment() {
    return service("payment");
  },
  get notification() {
    return service("notification");
  },
  get search() {
    return service("search");
  },
  get analytics() {
    return service("analytics");
  },
};

/** Test helper: forget the cached clients (their breakers live in the breaker registry). */
export function resetServiceClients(): void {
  clients.clear();
}
