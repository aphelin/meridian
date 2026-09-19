import { envInt } from "@meridian/nest-kit";
import { EmailAddress } from "../../domain";
import type { NotificationSettings } from "../../application/ports";
import { SMTP_CALL_TIMEOUT_MS } from "../mail/smtp-mailer";

export function loadNotificationSettings(env: NodeJS.ProcessEnv = process.env): NotificationSettings {
  const rawSite = env.PUBLIC_SITE_URL?.trim() || "http://localhost:3100";
  let site: URL;
  try {
    site = new URL(rawSite);
  } catch {
    throw new Error(`PUBLIC_SITE_URL must be an absolute URL, got "${rawSite}"`);
  }
  if (!["http:", "https:"].includes(site.protocol)) throw new Error("PUBLIC_SITE_URL must use http or https");
  const publicSiteUrl = `${site.origin}${site.pathname.replace(/\/+$/, "")}`;
  const supportEmail = EmailAddress.parse(env.SUPPORT_EMAIL?.trim() || "support@meridian.local").value;
  const sendLeaseMs = envInt("EMAIL_SEND_LEASE_MS", SMTP_CALL_TIMEOUT_MS + 15_000, { min: SMTP_CALL_TIMEOUT_MS + 1_000, env });
  return { publicSiteUrl, supportEmail, sendLeaseMs };
}
