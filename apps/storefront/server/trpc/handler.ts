import { HttpHeaders } from "@meridian/contracts";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { forwardableClientIp, resolveCorrelationId, runInScope, type RequestScope } from "../context";
import { CookieJar, headersWriter, type CookieWriter } from "../cookies";
import { appRouter } from "./router";

export const TRPC_ENDPOINT = "/api/trpc";
const MAX_BODY_BYTES = 1024 * 1024;

function rejection(status: number, code: string, message: string, correlationId: string): Response {
  return new Response(JSON.stringify({ error: { json: { message, code: -32600, data: { code, status, httpStatus: status, correlationId } } } }), {
    status,
    headers: { "content-type": "application/json", [HttpHeaders.correlationId]: correlationId },
  });
}

/** Reads a request body up to `max` bytes; null when it is larger (without buffering the rest). */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The BFF entry point: resolves the correlation id, rejects cross-site and non-JSON mutations, runs tRPC inside the
 * request scope (correlation id, forwardable client IP, cookie jar) and echoes `x-correlation-id` on every response.
 */
export async function handleTrpcRequest(incoming: Request): Promise<Response> {
  let req = incoming;
  const correlationId = resolveCorrelationId(req.headers.get(HttpHeaders.correlationId));

  if (req.method === "POST") {
    // CSRF defence in depth on top of SameSite=Lax cookies: browsers label cross-site requests, and a JSON content
    // type cannot be sent cross-site without a CORS preflight this app never grants.
    if (req.headers.get("sec-fetch-site") === "cross-site") return rejection(403, "FORBIDDEN", "Cross-site requests are not allowed.", correlationId);
    const type = req.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type)) return rejection(415, "VALIDATION_FAILED", "Requests must be JSON.", correlationId);
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return rejection(413, "VALIDATION_FAILED", "The request is too large.", correlationId);
    const body = await readLimited(req, MAX_BODY_BYTES);
    if (body === null) return rejection(413, "VALIDATION_FAILED", "The request is too large.", correlationId);
    req = new Request(req.url, { method: req.method, headers: req.headers, body });
  }

  let target: CookieWriter | null = null;
  const scope: RequestScope = {
    correlationId,
    forwardedFor: forwardableClientIp(req.headers.get(HttpHeaders.forwardedFor)),
    cookies: new CookieJar(req.headers.get("cookie"), { replaceSetCookies: (values) => target?.replaceSetCookies(values) }),
  };

  const res = await runInScope(scope, () =>
    fetchRequestHandler({
      endpoint: TRPC_ENDPOINT,
      req,
      router: appRouter,
      createContext: ({ resHeaders }) => {
        target = headersWriter(resHeaders);
        target.replaceSetCookies(scope.cookies.setCookieHeaders());
        resHeaders.set(HttpHeaders.correlationId, correlationId);
        resHeaders.set("cache-control", "no-store");
        return { scope };
      },
    }),
  );

  const headers = new Headers(res.headers);
  headers.set(HttpHeaders.correlationId, correlationId);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  if (!headers.getSetCookie().length) for (const cookie of scope.cookies.setCookieHeaders()) headers.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
