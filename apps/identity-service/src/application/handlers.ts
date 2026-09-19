import { AddAddressHandler } from "./commands/add-address.handler";
import { ChangePasswordHandler } from "./commands/change-password.handler";
import { DeleteAccountHandler } from "./commands/delete-account.handler";
import { LoginHandler } from "./commands/login.handler";
import { LogoutHandler } from "./commands/logout.handler";
import { RefreshSessionHandler } from "./commands/refresh-session.handler";
import { RegisterUserHandler } from "./commands/register-user.handler";
import { RemoveAddressHandler } from "./commands/remove-address.handler";
import { RequestPasswordResetHandler } from "./commands/request-password-reset.handler";
import { ResendVerificationHandler } from "./commands/resend-verification.handler";
import { ResetPasswordHandler } from "./commands/reset-password.handler";
import { SeedAdminHandler } from "./commands/seed-admin.handler";
import { UpdateAddressHandler } from "./commands/update-address.handler";
import { UpdateProfileHandler } from "./commands/update-profile.handler";
import { VerifyEmailHandler } from "./commands/verify-email.handler";
import { GetCurrentUserHandler } from "./queries/get-current-user.handler";
import { ListAddressesHandler } from "./queries/list-addresses.handler";
import { ListCustomersHandler } from "./queries/list-customers.handler";
import { AccountEmails } from "./services/account-emails";
import { SessionIssuer } from "./services/session-issuer";

export const CommandHandlers = [
  RegisterUserHandler,
  LoginHandler,
  RefreshSessionHandler,
  LogoutHandler,
  VerifyEmailHandler,
  ResendVerificationHandler,
  RequestPasswordResetHandler,
  ResetPasswordHandler,
  UpdateProfileHandler,
  ChangePasswordHandler,
  AddAddressHandler,
  UpdateAddressHandler,
  RemoveAddressHandler,
  DeleteAccountHandler,
  SeedAdminHandler,
];

export const QueryHandlers = [GetCurrentUserHandler, ListAddressesHandler, ListCustomersHandler];

export const ApplicationServices = [AccountEmails, SessionIssuer];
