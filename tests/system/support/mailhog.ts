import { cfg } from "./env";
import { waitFor } from "./wait";

export interface Mail {
  id: string;
  subject: string;
  to: string;
  from: string;
  /** Decoded text of every MIME part (HTML and plain text). */
  body: string;
  created: string;
}

interface MailhogItem {
  ID: string;
  Created: string;
  Content: { Headers: Record<string, string[]>; Body: string };
  MIME?: { Parts?: { Headers?: Record<string, string[]>; Body?: string }[] } | null;
}

function decodePart(headers: Record<string, string[]> | undefined, body: string): string {
  const enc = (headers?.["Content-Transfer-Encoding"]?.[0] ?? "").toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (enc === "quoted-printable") {
    const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bytes, "latin1").toString("utf8");
  }
  return body;
}

function decodeSubject(raw: string): string {
  // RFC 2047 encoded words (nodemailer encodes non-ASCII subjects)
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset: string, kind: string, text: string) =>
    kind.toUpperCase() === "B"
      ? Buffer.from(text, "base64").toString("utf8")
      : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__: string, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8"),
  ).replace(/\?=\s+=\?/g, "");
}

function toMail(m: MailhogItem): Mail {
  const parts = m.MIME?.Parts?.length ? m.MIME.Parts : [{ Headers: m.Content.Headers, Body: m.Content.Body }];
  return {
    id: m.ID,
    subject: decodeSubject(m.Content.Headers.Subject?.[0] ?? ""),
    to: (m.Content.Headers.To ?? []).join(","),
    from: (m.Content.Headers.From ?? []).join(","),
    body: parts.map((p) => decodePart(p.Headers, p.Body ?? "")).join("\n"),
    created: m.Created,
  };
}

/** Every message Mailhog holds for an exact recipient address. */
export async function mailsTo(address: string): Promise<Mail[]> {
  const res = await fetch(`${cfg.mailhogUrl}/api/v2/search?kind=to&query=${encodeURIComponent(address)}&limit=250`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`mailhog search ${res.status}`);
  const data = (await res.json()) as { items: MailhogItem[] };
  return data.items.map(toMail).filter((m) => m.to.toLowerCase().includes(address.toLowerCase()));
}

export async function waitForMail(address: string, predicate: (m: Mail) => boolean, what: string, timeoutMs = 45_000): Promise<Mail> {
  return waitFor(async () => (await mailsTo(address)).find(predicate), `email to ${address}: ${what}`, { timeoutMs, intervalMs: 700 });
}

/** Extracts a query parameter from the first link in the body matching `pathPart`. */
export function linkToken(mail: Mail, pathPart: string, param = "token"): string {
  const re = new RegExp(`${pathPart.replace(/[/?.]/g, (c) => `\\${c}`)}\\?(?:[^"'\\s<>]*&(?:amp;)?)?${param}=([A-Za-z0-9_\\-.]+)`);
  const match = mail.body.match(re);
  if (!match) throw new Error(`no ${pathPart}?${param}= link in email "${mail.subject}": ${mail.body.slice(0, 400)}`);
  return match[1];
}
