import type { EmailTemplate } from "@meridian/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { EmailRenderer, NOTIFICATION_SETTINGS, TemplateDataError, type NotificationSettings, type RenderedEmail } from "../../application/ports";
import { renderHtml, renderText } from "./blocks";
import { sandboxSubject, TEMPLATES, type TemplateContext } from "./templates";

/** Brand-consistent HTML + text emails from typed template data. Every subject carries the sandbox prefix. */
@Injectable()
export class TemplateEmailRenderer extends EmailRenderer {
  private readonly siteOrigin: string;

  constructor(@Inject(NOTIFICATION_SETTINGS) private readonly settings: NotificationSettings) {
    super();
    this.siteOrigin = new URL(settings.publicSiteUrl).origin;
  }

  render(template: EmailTemplate, data: Record<string, unknown>, recipient: { email: string; name: string | null }): RenderedEmail {
    const definition = TEMPLATES[template];
    if (!definition) throw new TemplateDataError(template, [`unknown template ${String(template)}`]);
    const ctx: TemplateContext = { siteOrigin: this.siteOrigin, recipient };
    const parsed = definition.schema(ctx).safeParse(data);
    if (!parsed.success) throw new TemplateDataError(template, parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
    const content = definition.build(parsed.data, ctx);
    const subject = sandboxSubject(content.subject);
    const brand = { siteUrl: this.settings.publicSiteUrl };
    const full = { ...content, subject };
    return { subject, html: renderHtml(full, brand), text: renderText(full, brand), ...(content.replyTo ? { replyTo: content.replyTo } : {}) };
  }
}
