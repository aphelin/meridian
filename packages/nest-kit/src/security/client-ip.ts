import { HttpHeaders } from "@meridian/contracts";
import { isIP } from "node:net";

export interface IpRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

/** Canonical form: IPv4-mapped IPv6 unwrapped, brackets and ports removed. Undefined when not an IP address. */
export function normalizeIp(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  let ip = value.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.replace(/%.*$/, "");
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip.toLowerCase() : undefined;
}

/**
 * Client IP: the first `x-forwarded-for` hop when present, else the socket address. Services sit behind the BFF,
 * which is the only component that sets the header, so the first hop is the browser address it observed.
 */
export function clientIp(req: IpRequest): string | undefined {
  const header = req.headers[HttpHeaders.forwardedFor];
  const forwarded = Array.isArray(header) ? header[0] : header;
  const first = normalizeIp(forwarded?.split(",")[0]);
  return first ?? normalizeIp(req.socket?.remoteAddress);
}

export function isLoopbackIp(ip: string | undefined): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return normalized === "::1" || /^127\./.test(normalized);
}
