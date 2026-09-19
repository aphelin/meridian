import { describe, expect, it } from "vitest";
import { smtpConfigFromEnv } from "./smtp-mailer";

describe("sandbox SMTP guard", () => {
  it("smtp guard accepts local mail catchers", () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "localhost", SMTP_PORT: "1025" })).toEqual({ host: "localhost", port: 1025 });
    expect(smtpConfigFromEnv({ SMTP_HOST: "mailhog" }).port).toBe(1025);
  });

  it("sandbox smtp guard refuses a real relay with SANDBOX_ONLY", () => {
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587" })).toThrow(expect.objectContaining({ code: "SANDBOX_ONLY" }));
    expect(() => smtpConfigFromEnv({})).toThrow(expect.objectContaining({ code: "SANDBOX_ONLY" }));
  });

  it("smtp guard honours the explicit SMTP_SANDBOX_HOSTS allow-list only", () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "mailpit.internal", SMTP_SANDBOX_HOSTS: "mailpit.internal" }).host).toBe("mailpit.internal");
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "smtp.sendgrid.net", SMTP_SANDBOX_HOSTS: "mailpit.internal" })).toThrow(/not a sandbox/);
  });
});
