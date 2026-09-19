import { randomUUID } from "node:crypto";
import { type ServiceName, serviceUrl } from "./env";

export interface ApiResponse<T = any> {
  status: number;
  json: T;
  text: string;
  headers: Headers;
  /** Correlation id sent with the request. */
  correlationId: string;
  /** Correlation id echoed by the service. */
  echoedCorrelationId: string | null;
  ms: number;
}

export interface RequestOptions {
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  correlationId?: string;
  timeoutMs?: number;
}

export const newCorrelationId = (tag = "sys") => `${tag}-${randomUUID()}`;

/** One HTTP call; every request carries an `x-correlation-id` (generated unless given). */
export async function request<T = any>(baseUrl: string, method: string, path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const headers: Record<string, string> = { "x-correlation-id": correlationId, ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const started = Date.now();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers, correlationId, echoedCorrelationId: res.headers.get("x-correlation-id"), ms: Date.now() - started };
}

export interface Client {
  baseUrl: string;
  get<T = any>(path: string, opts?: RequestOptions): Promise<ApiResponse<T>>;
  post<T = any>(path: string, body?: unknown, opts?: RequestOptions): Promise<ApiResponse<T>>;
  put<T = any>(path: string, body?: unknown, opts?: RequestOptions): Promise<ApiResponse<T>>;
  patch<T = any>(path: string, body?: unknown, opts?: RequestOptions): Promise<ApiResponse<T>>;
  delete<T = any>(path: string, opts?: RequestOptions): Promise<ApiResponse<T>>;
}

export function client(baseUrl: string): Client {
  return {
    baseUrl,
    get: (path, opts) => request(baseUrl, "GET", path, opts),
    post: (path, body, opts) => request(baseUrl, "POST", path, { ...opts, body }),
    put: (path, body, opts) => request(baseUrl, "PUT", path, { ...opts, body }),
    patch: (path, body, opts) => request(baseUrl, "PATCH", path, { ...opts, body }),
    delete: (path, opts) => request(baseUrl, "DELETE", path, opts),
  };
}

/** Clients for the stack services (URLs from the stack env). */
export const svc = (name: ServiceName) => client(serviceUrl(name));
export const identity = () => svc("identity-service");
export const catalog = () => svc("catalog-service");
export const inventory = () => svc("inventory-service");
export const checkout = () => svc("checkout-service");
export const payment = () => svc("payment-service");
export const notification = () => svc("notification-service");
export const search = () => svc("search-worker");
export const analytics = () => svc("analytics-service");

/** Compact description of a response for assertion messages. */
export const show = (r: ApiResponse) => `${r.status} ${r.text.slice(0, 600)}`;
