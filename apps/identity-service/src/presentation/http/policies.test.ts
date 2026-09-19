import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";
import { MeController } from "./me.controller";
import { CaptchaActions, RateLimits } from "./policies";
import { AddressBody, ChangePasswordBody, RegisterBody } from "./schemas";

const RATE_LIMIT_KEY = "meridian:rate-limit-policy";
const CAPTCHA_KEY = "meridian:captcha";
const meta = (key: string, target: object, method: string) => Reflect.getMetadata(key, (target as Record<string, object>)[method]);

describe("HTTP captcha and rate limit policies", () => {
  it("rate limit policies match the contract table", () => {
    expect(RateLimits).toEqual({
      login: { name: "login", limit: 10, windowSec: 60, by: ["ip", "body:email"] },
      register: { name: "register", limit: 5, windowSec: 600, by: ["ip"] },
      resend: { name: "resend", limit: 3, windowSec: 600, by: ["user"] },
      forgot: { name: "forgot", limit: 5, windowSec: 900, by: ["ip", "body:email"] },
      token: { name: "token", limit: 20, windowSec: 600, by: ["ip"] },
      password: { name: "password", limit: 5, windowSec: 600, by: ["user"] },
    });
  });

  it("applies the rate limit policy to each identity route", () => {
    const auth = AuthController.prototype;
    expect(meta(RATE_LIMIT_KEY, auth, "login")).toEqual(RateLimits.login);
    expect(meta(RATE_LIMIT_KEY, auth, "register")).toEqual(RateLimits.register);
    expect(meta(RATE_LIMIT_KEY, auth, "resendVerification")).toEqual(RateLimits.resend);
    expect(meta(RATE_LIMIT_KEY, auth, "forgotPassword")).toEqual(RateLimits.forgot);
    expect(meta(RATE_LIMIT_KEY, auth, "verifyEmail")).toEqual(RateLimits.token);
    expect(meta(RATE_LIMIT_KEY, auth, "resetPassword")).toEqual(RateLimits.token);
    expect(meta(RATE_LIMIT_KEY, MeController.prototype, "changePassword")).toEqual(RateLimits.password);
    expect(meta(RATE_LIMIT_KEY, MeController.prototype, "deleteAccount")).toEqual(RateLimits.password);
    for (const method of ["me", "updateProfile", "addresses", "addAddress", "updateAddress", "removeAddress"]) expect(meta(RATE_LIMIT_KEY, MeController.prototype, method)).toBeUndefined();
  });

  it("requires captcha on register, resend-verification and forgot-password only", () => {
    const auth = AuthController.prototype;
    expect(meta(CAPTCHA_KEY, auth, "register")).toMatchObject({ action: CaptchaActions.register });
    expect(meta(CAPTCHA_KEY, auth, "resendVerification")).toMatchObject({ action: CaptchaActions.resendVerification });
    expect(meta(CAPTCHA_KEY, auth, "forgotPassword")).toMatchObject({ action: CaptchaActions.forgotPassword });
    for (const method of ["login", "refresh", "logout", "verifyEmail", "resetPassword"]) expect(meta(CAPTCHA_KEY, auth, method)).toBeUndefined();
  });

  it("validates request bodies: short passwords, non-ISO countries and a lower-cased email", () => {
    expect(RegisterBody.safeParse({ email: "a@b.co", password: "short", name: "A" }).success).toBe(false);
    expect(RegisterBody.parse({ email: " A@B.co ", password: "longenough", name: " A " })).toEqual({ email: "a@b.co", password: "longenough", name: "A" });
    const address = { fullName: "A", line1: "1 St", line2: "", city: "Tbilisi", postalCode: "0105", phone: null };
    expect(AddressBody.safeParse({ ...address, country: "Georgia" }).success).toBe(false);
    expect(AddressBody.parse({ ...address, country: "ge" })).toMatchObject({ country: "GE", line2: null, label: null });
    expect(ChangePasswordBody.safeParse({ currentPassword: "x", newPassword: "longenough", refreshToken: "t" }).success).toBe(true);
  });
});
