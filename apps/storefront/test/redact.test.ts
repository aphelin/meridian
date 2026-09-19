import { describe, expect, it } from "vitest";
import { redact, REDACTED } from "@/server/redact";

describe("dead-letter redaction", () => {
  it("redacts one-time links, tokens, secrets and passwords recursively", () => {
    const payload = {
      template: "password-reset",
      to: "a@b.test",
      data: { name: "Ann", resetUrl: "https://site/account/reset-password?token=abc", verifyUrl: "x" },
      nested: [{ refreshToken: "r", clientSecret: "s", password: "p", count: 2 }],
    };
    const out = redact(payload) as typeof payload;
    expect(out.data).toEqual({ name: "Ann", resetUrl: REDACTED, verifyUrl: REDACTED });
    expect(out.nested[0]).toEqual({ refreshToken: REDACTED, clientSecret: REDACTED, password: REDACTED, count: 2 });
    expect(out.template).toBe("password-reset");
    expect(JSON.stringify(out)).not.toMatch(/token=/);
  });

  it("redacts strings that embed a credential in a query string under any key", () => {
    expect(redact({ html: "<a href='https://s/orders/1?access=XYZ'>" })).toEqual({ html: REDACTED });
  });

  it("does not mutate the input", () => {
    const input = { token: "t" };
    redact(input);
    expect(input.token).toBe("t");
  });
});
