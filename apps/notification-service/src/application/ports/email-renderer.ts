import type { EmailTemplate } from "@meridian/contracts";
import { ValidationError } from "@meridian/kernel";

export interface RenderedEmail {
  /** Complete subject, including the sandbox prefix. Single line. */
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** The template data does not match the template's documented keys: retrying can never succeed. */
export class TemplateDataError extends ValidationError {
  constructor(template: EmailTemplate, issues: string[]) {
    super(`Invalid data for email template ${template}`, { template, issues });
    this.name = "TemplateDataError";
  }
}

/** Renders a template (HTML + text) from its data. Pure; throws TemplateDataError on invalid data. */
export abstract class EmailRenderer {
  abstract render(template: EmailTemplate, data: Record<string, unknown>, recipient: { email: string; name: string | null }): RenderedEmail;
}
