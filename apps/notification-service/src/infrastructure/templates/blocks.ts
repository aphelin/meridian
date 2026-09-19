/** Presentation-neutral email content; rendered once as brand HTML and once as plain text from the same blocks. */
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "button"; label: string; url: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "rows"; rows: Array<{ label: string; value: string; strong?: boolean }> }
  | { kind: "quote"; text: string }
  | { kind: "note"; text: string };

export interface EmailContent {
  subject: string;
  preheader: string;
  blocks: Block[];
}

export interface Brand {
  siteUrl: string;
}

const C = {
  paper: "#faf7f2",
  raised: "#fffdf9",
  plaster: "#f1eadf",
  ink: "#1b1a17",
  stone: "#655f57",
  line: "#e8e0d4",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** Only http(s) URLs ever reach an href; anything else was rejected by the template schemas already. */
function href(url: string): string {
  return escapeHtml(/^https?:\/\//i.test(url) ? url : "#");
}

const multiline = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");

function blockHtml(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `<h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:normal;color:${C.ink}">${escapeHtml(block.text)}</h1>`;
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.ink}">${multiline(block.text)}</p>`;
    case "button":
      return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px"><tr><td style="background:${C.ink};border-radius:999px"><a href="${href(block.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${C.paper};text-decoration:none">${escapeHtml(block.label)}</a></td></tr></table><p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${C.stone}">Or paste this link into your browser:<br><a href="${href(block.url)}" style="color:${C.stone};word-break:break-all">${escapeHtml(block.url)}</a></p>`;
    case "link":
      return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><a href="${href(block.url)}" style="color:${C.ink}">${escapeHtml(block.label)}</a></p>`;
    case "rows":
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-top:1px solid ${C.line}">${block.rows
        .map(
          (row) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:15px;line-height:1.4;color:${row.strong ? C.ink : C.stone}${row.strong ? ";font-weight:600" : ""}">${multiline(row.label)}</td><td align="right" style="padding:10px 0 10px 16px;border-bottom:1px solid ${C.line};font-size:15px;line-height:1.4;white-space:nowrap;color:${C.ink}${row.strong ? ";font-weight:600" : ""}">${escapeHtml(row.value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "quote":
      return `<div style="margin:0 0 20px;padding:14px 16px;background:${C.plaster};border-radius:8px;font-size:15px;line-height:1.6;color:${C.ink}">${multiline(block.text)}</div>`;
    case "note":
      return `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${C.stone}">${multiline(block.text)}</p>`;
  }
}

export function renderHtml(content: EmailContent, brand: Brand): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px;font-family:${SERIF};font-size:22px;letter-spacing:0.08em;color:${C.ink}"><a href="${href(brand.siteUrl)}" style="color:${C.ink};text-decoration:none">MERIDIAN</a></td></tr>
<tr><td style="padding:32px 28px;background:${C.raised};border:1px solid ${C.line};border-radius:14px">
${content.blocks.map(blockHtml).join("\n")}
</td></tr>
<tr><td style="padding:20px 4px;font-size:12px;line-height:1.5;color:${C.stone}">Sent from the Meridian sandbox: no real orders, payments or deliveries are involved.<br><a href="${href(brand.siteUrl)}" style="color:${C.stone}">${escapeHtml(brand.siteUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table>
</body></html>`;
}

export function renderText(content: EmailContent, brand: Brand): string {
  const parts: string[] = ["MERIDIAN", ""];
  for (const block of content.blocks) {
    switch (block.kind) {
      case "heading":
        parts.push(block.text, "=".repeat(Math.min(60, block.text.length)), "");
        break;
      case "paragraph":
      case "note":
        parts.push(block.text, "");
        break;
      case "button":
      case "link":
        parts.push(`${block.label}: ${block.url}`, "");
        break;
      case "rows":
        for (const row of block.rows) parts.push(`${row.label.replace(/\n/g, " / ")}: ${row.value}`);
        parts.push("");
        break;
      case "quote":
        parts.push(...block.text.split("\n").map((line) => `> ${line}`), "");
        break;
    }
  }
  parts.push("--", "Sent from the Meridian sandbox: no real orders, payments or deliveries are involved.", brand.siteUrl);
  return parts.join("\n");
}
