import { CookieJar } from "@/server/cookies";
import { runInScope, type RequestScope } from "@/server/context";

export type Handler = (req: { method: string; url: URL; headers: Headers; body: unknown }) => Response | Promise<Response>;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json(status, { statusCode: status, code, message, correlationId: "upstream-corr", ...extra });
}

/** A fake `fetch` that records every call and routes it to `handler`, honouring the abort signal. */
export function fakeFetch(handler: Handler) {
  const calls: { method: string; url: URL; headers: Headers; body: unknown }[] = [];
  const impl = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const call = { method: init.method ?? "GET", url, headers, body };
    calls.push(call);
    const signal = init.signal;
    if (signal?.aborted) throw signal.reason;
    return await new Promise<Response>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      Promise.resolve(handler(call)).then(resolve, reject);
    });
  };
  return { impl: impl as typeof fetch, calls };
}

export function scope(cookieHeader: string | null = null, extra: Partial<RequestScope> = {}): RequestScope {
  return { correlationId: "test-corr-1", forwardedFor: undefined, cookies: new CookieJar(cookieHeader), ...extra };
}

export function inScope<T>(s: RequestScope, fn: () => T): T {
  return runInScope(s, fn);
}

export const never = () => new Promise<Response>(() => undefined);
