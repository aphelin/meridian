import type { AuthResultDto, UserDto } from "@meridian/contracts";
import { Authenticated, CurrentUser, type Principal, RateLimit, RequireCaptcha, ZodBody } from "@meridian/nest-kit";
import { Controller, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { z } from "zod";
import {
  LoginCommand,
  LogoutCommand,
  RefreshSessionCommand,
  RegisterUserCommand,
  RequestPasswordResetCommand,
  ResendVerificationCommand,
  ResetPasswordCommand,
  VerifyEmailCommand,
} from "../../application";
import { CaptchaActions, RateLimits } from "./policies";
import { ForgotPasswordBody, LoginBody, LogoutBody, RefreshBody, RegisterBody, ResetPasswordBody, TokenBody } from "./schemas";

// Guards run bottom-up in decorator order: authentication, then the rate limit, then captcha verification, so
// throttled or anonymous requests never cost a Turnstile call.
@Controller("auth")
export class AuthController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post("register")
  @RequireCaptcha(CaptchaActions.register)
  @RateLimit(RateLimits.register)
  register(@ZodBody(RegisterBody) body: z.infer<typeof RegisterBody>): Promise<AuthResultDto> {
    return this.commandBus.execute(new RegisterUserCommand(body.email, body.password, body.name));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimits.login)
  login(@ZodBody(LoginBody) body: z.infer<typeof LoginBody>): Promise<AuthResultDto> {
    return this.commandBus.execute(new LoginCommand(body.email, body.password));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@ZodBody(RefreshBody) body: z.infer<typeof RefreshBody>): Promise<AuthResultDto> {
    return this.commandBus.execute(new RefreshSessionCommand(body.refreshToken));
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@ZodBody(LogoutBody) body: z.infer<typeof LogoutBody>): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(body.refreshToken ?? null));
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimits.token)
  verifyEmail(@ZodBody(TokenBody) body: z.infer<typeof TokenBody>): Promise<UserDto> {
    return this.commandBus.execute(new VerifyEmailCommand(body.token));
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCaptcha(CaptchaActions.resendVerification)
  @RateLimit(RateLimits.resend)
  @Authenticated()
  async resendVerification(@CurrentUser() user: Principal): Promise<void> {
    await this.commandBus.execute(new ResendVerificationCommand(user.sub));
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCaptcha(CaptchaActions.forgotPassword)
  @RateLimit(RateLimits.forgot)
  async forgotPassword(@ZodBody(ForgotPasswordBody) body: z.infer<typeof ForgotPasswordBody>): Promise<void> {
    await this.commandBus.execute(new RequestPasswordResetCommand(body.email));
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimits.token)
  async resetPassword(@ZodBody(ResetPasswordBody) body: z.infer<typeof ResetPasswordBody>): Promise<{ ok: true }> {
    await this.commandBus.execute(new ResetPasswordCommand(body.token, body.password));
    return { ok: true };
  }
}
