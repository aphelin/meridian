import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Content e2e helpers: BFF queries, Mailhog lookups by content, and page metadata. */

type TrpcError = { message: string; data?: { code?: string } };

export async function trpcQuery<T>(api: APIRequestContext, path: string, input: unknown = null): Promise<T> {
  const res = await api.get(`/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`, { timeout: 30_000 });
  const body = (await res.json().catch(() => null)) as { result?: { data?: { json?: T } }; error?: { json?: TrpcError } } | null;
  if (!res.ok() || body?.error) throw new Error(`${path} failed (${res.status()}): ${body?.error?.json?.data?.code ?? ""} ${body?.error?.json?.message ?? ""}`);
  return body?.result?.data?.json as T;
}

type MailhogItem = {
  Content: { Headers: Record<string, string[]>; Body: string };
  MIME?: { Parts?: { Headers?: Record<string, string[]>; Body?: string }[] } | null;
};

export interface Mail {
  to: string;
  subject: string;
  replyTo: string;
  body: string;
}

function decode(message: MailhogItem): string {
  const parts = message.MIME?.Parts?.length ? message.MIME.Parts : [{ Headers: message.Content.Headers, Body: message.Content.Body }];
  return parts
    .map((part) => {
      const encoding = (part.Headers?.["Content-Transfer-Encoding"]?.[0] ?? "").toLowerCase();
      const body = part.Body ?? "";
      if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
      if (encoding === "quoted-printable") {
        const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
        return Buffer.from(bytes, "latin1").toString("utf8");
      }
      return body;
    })
    .join("\n");
}

/** Waits for an email to `to` whose subject matches and whose body contains every `contains` string. */
export async function waitForMail(to: string, { subject, contains = [], timeoutMs = 60_000 }: { subject: RegExp; contains?: string[]; timeoutMs?: number }): Promise<Mail> {
  const api = process.env.MAILHOG_API_URL ?? "http://localhost:8025";
  // Search by a distinctive string from the message (the unique sender address) so a busy shared mailbox can't hide it.
  const needle = contains[0] ?? to;
  const kind = contains[0] ? "containing" : "to";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${api}/api/v2/search?kind=${kind}&query=${encodeURIComponent(needle)}&limit=50`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    const items = res?.ok ? (((await res.json()) as { items?: MailhogItem[] }).items ?? []) : [];
    for (const item of items) {
      const headers = item.Content.Headers;
      const mail: Mail = { to: (headers.To ?? []).join(", "), subject: headers.Subject?.[0] ?? "", replyTo: (headers["Reply-To"] ?? []).join(", "), body: decode(item) };
      if (mail.to.toLowerCase().includes(to.toLowerCase()) && subject.test(mail.subject) && contains.every((c) => mail.body.includes(c))) return mail;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no email to ${to} with subject ${subject} containing ${JSON.stringify(contains)}`);
}

/** Asserts title, description and canonical of an indexable content page. */
export async function expectIndexableMetadata(page: Page, { title, path }: { title: RegExp; path: string }) {
  await expect(page).toHaveTitle(title);
  // After a client-side navigation Next can keep the root layout's description next to the page's own, which comes last.
  await expect(page.locator('meta[name="description"]').last()).toHaveAttribute("content", /^(?!Sofas, tables, lighting).{40,}$/);
  await expect(page.locator('link[rel="canonical"]').last()).toHaveAttribute("href", new RegExp(`^https?://[^/]+${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
}
