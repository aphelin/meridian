import type { AddressDto, AuthResultDto, UserDto } from "@meridian/contracts";
import { z } from "zod";
import { seg, services } from "../../services";
import { clearSessionCookies, COOKIE, currentUser, forgetGuestCart, setSessionCookies } from "../../session";
import { authedProcedure, publicProcedure, router } from "../init";
import { addressInput, addressPatch, captchaToken, email, existingPassword, id, newPassword, oneTimeToken } from "../schemas";
import { requireCaptcha } from "./shop";

export const authRouter = router({
  me: publicProcedure.query(({ ctx }): Promise<UserDto | null> => currentUser(ctx.scope.cookies)),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().min(1, "Enter your email address.").max(254), password: existingPassword }))
    .mutation(async ({ input, ctx }): Promise<UserDto> => {
      const result = await services.identity.post<AuthResultDto>("/auth/login", { body: input });
      setSessionCookies(ctx.scope.cookies, result);
      return result.user;
    }),

  register: publicProcedure
    .input(z.object({ name: z.string().trim().min(1, "Tell us your name.").max(100), email, password: newPassword, captchaToken }))
    .mutation(async ({ input, ctx }): Promise<UserDto> => {
      const { captchaToken: token, ...body } = input;
      const result = await services.identity.post<AuthResultDto>("/auth/register", { body, captchaToken: requireCaptcha(token) });
      setSessionCookies(ctx.scope.cookies, result);
      return result.user;
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const refreshToken = ctx.scope.cookies.get(COOKIE.refresh);
    if (refreshToken) {
      // Revoke server-side when possible; the cookies are cleared regardless.
      await services.identity.post("/auth/logout", { body: { refreshToken } }).catch(() => undefined);
    }
    clearSessionCookies(ctx.scope.cookies);
    return { ok: true as const };
  }),

  verifyEmail: publicProcedure.input(z.object({ token: oneTimeToken })).mutation(({ input }): Promise<UserDto> =>
    services.identity.post<UserDto>("/auth/verify-email", { body: { token: input.token } }),
  ),

  resendVerification: authedProcedure.input(z.object({ captchaToken })).mutation(async ({ input, ctx }) => {
    const token = requireCaptcha(input.captchaToken);
    await ctx.call((access) => services.identity.post("/auth/resend-verification", { token: access, captchaToken: token }));
    return { ok: true as const };
  }),

  forgotPassword: publicProcedure.input(z.object({ email, captchaToken })).mutation(async ({ input }) => {
    await services.identity.post("/auth/forgot-password", { body: { email: input.email }, captchaToken: requireCaptcha(input.captchaToken) });
    return { ok: true as const };
  }),

  resetPassword: publicProcedure.input(z.object({ token: oneTimeToken, password: newPassword })).mutation(async ({ input }) => {
    await services.identity.post("/auth/reset-password", { body: input });
    return { ok: true as const };
  }),
});

export const accountRouter = router({
  updateProfile: authedProcedure.input(z.object({ name: z.string().trim().min(1, "Tell us your name.").max(100) })).mutation(({ input, ctx }): Promise<UserDto> =>
    ctx.call((token) => services.identity.patch<UserDto>("/me", { token, body: input })),
  ),

  changePassword: authedProcedure.input(z.object({ currentPassword: existingPassword, newPassword })).mutation(async ({ input, ctx }) => {
    await ctx.call((token) =>
      services.identity.post("/me/password", {
        token,
        // The refresh token identifies this session's family, which identity keeps while revoking the others.
        body: { ...input, refreshToken: ctx.scope.cookies.get(COOKIE.refresh) },
      }),
    );
    return { ok: true as const };
  }),

  deleteAccount: authedProcedure.input(z.object({ password: existingPassword })).mutation(async ({ input, ctx }) => {
    await ctx.call((token) => services.identity.delete("/me", { token, body: { password: input.password } }));
    clearSessionCookies(ctx.scope.cookies);
    forgetGuestCart(ctx.scope.cookies);
    return { ok: true as const };
  }),

  addresses: router({
    list: authedProcedure.query(({ ctx }): Promise<AddressDto[]> => ctx.call((token) => services.identity.get<AddressDto[]>("/me/addresses", { token }))),

    add: authedProcedure.input(addressInput).mutation(({ input, ctx }): Promise<AddressDto> =>
      ctx.call((token) => services.identity.post<AddressDto>("/me/addresses", { token, body: input })),
    ),

    update: authedProcedure.input(z.object({ id, patch: addressPatch })).mutation(({ input, ctx }): Promise<AddressDto> =>
      ctx.call((token) => services.identity.patch<AddressDto>(`/me/addresses/${seg(input.id)}`, { token, body: input.patch })),
    ),

    remove: authedProcedure.input(z.object({ id })).mutation(async ({ input, ctx }) => {
      await ctx.call((token) => services.identity.delete(`/me/addresses/${seg(input.id)}`, { token }));
      return { ok: true as const };
    }),
  }),
});
