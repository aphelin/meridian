import { z } from "zod";
import { services } from "../../services";
import { publicProcedure, router } from "../init";
import { captchaToken, contactRequest, email, oneTimeToken } from "../schemas";
import { requireCaptcha } from "./shop";

type NewsletterStatus = { status: string };

export const newsletterRouter = router({
  subscribe: publicProcedure.input(z.object({ email, captchaToken })).mutation(async ({ input }) => {
    await services.notification.post("/newsletter/subscriptions", { body: { email: input.email }, captchaToken: requireCaptcha(input.captchaToken) });
    return { ok: true as const };
  }),

  confirm: publicProcedure.input(z.object({ token: oneTimeToken })).mutation(async ({ input }) => {
    const res = await services.notification.post<NewsletterStatus | undefined>("/newsletter/confirm", { body: { token: input.token } });
    return { ok: true as const, status: res?.status ?? "confirmed" };
  }),

  unsubscribe: publicProcedure.input(z.object({ token: oneTimeToken })).mutation(async ({ input }) => {
    const res = await services.notification.post<NewsletterStatus | undefined>("/newsletter/unsubscribe", { body: { token: input.token } });
    return { ok: true as const, status: res?.status ?? "unsubscribed" };
  }),
});

export const contactRouter = router({
  send: publicProcedure.input(contactRequest.extend({ captchaToken })).mutation(async ({ input }) => {
    const { captchaToken: token, ...body } = input;
    await services.notification.post("/contact", { body: { ...body, orderNumber: body.orderNumber ?? null }, captchaToken: requireCaptcha(token) });
    return { ok: true as const };
  }),
});
