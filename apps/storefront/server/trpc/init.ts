import type { UserDto } from "@meridian/contracts";
import { initTRPC, TRPCError } from "@trpc/server";
import { transformer } from "@/lib/transformer";
import { currentScope, type RequestScope } from "../context";
import { ServiceError, toBrowserError, trpcCodeForStatus } from "../errors";
import { currentUser, withSession } from "../session";

export interface Context {
  scope: RequestScope;
}

const t = initTRPC.context<Context>().create({
  transformer,
  errorFormatter({ shape, error, ctx }) {
    const correlationId = ctx?.scope.correlationId ?? currentScope()?.correlationId ?? "unknown";
    const { message, data } = toBrowserError(error, correlationId);
    // Never ship stack traces or tRPC internals: only the contracts error data and the procedure path.
    return { message, code: shape.code, data: { ...data, httpStatus: data.status, path: shape.data.path } };
  },
});

function log(level: "warn" | "error", fields: Record<string, unknown>) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), service: "storefront-bff", ...fields });
  if (level === "error") console.error(line);
  else console.warn(line);
}

/** Turns ServiceErrors into TRPCErrors whose HTTP status matches the contracts status, and logs server-side failures. */
const errorMapping = t.middleware(async ({ next, path, ctx }) => {
  const result = await next();
  if (result.ok) return result;
  const cause = result.error.cause instanceof ServiceError ? result.error.cause : null;
  if (cause) {
    if (cause.status >= 500) log("warn", { msg: "procedure failed upstream", path, code: cause.code, upstream: cause.service, reason: cause.reason, correlationId: ctx.scope.correlationId });
    throw new TRPCError({ code: trpcCodeForStatus(cause.status), message: cause.message, cause });
  }
  if (result.error.code === "INTERNAL_SERVER_ERROR") {
    log("error", { msg: "procedure crashed", path, correlationId: ctx.scope.correlationId, error: result.error.cause instanceof Error ? `${result.error.cause.name}: ${result.error.cause.message}` : result.error.message });
  }
  return result;
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Anyone. Calls that need the session use `ctx.session` helpers. */
export const publicProcedure = t.procedure.use(errorMapping);

/** Requires a session; `ctx.call` runs an upstream call with a valid access token (rotating when needed). */
export const authedProcedure = publicProcedure.use(async ({ next, ctx }) => {
  const call = <T>(fn: (token: string) => Promise<T>) => withSession((token) => fn(token as string), { required: true, jar: ctx.scope.cookies });
  return next({ ctx: { call } });
});

/** Requires a session whose user has role admin (identity is asked, so revoked or demoted users are refused). */
export const adminProcedure = publicProcedure.use(async ({ next, ctx }) => {
  const user: UserDto | null = await currentUser(ctx.scope.cookies);
  if (!user) throw ServiceError.unauthorized("Please sign in with an admin account.");
  if (user.role !== "admin") throw ServiceError.forbidden("This area is for admins only.");
  const call = <T>(fn: (token: string) => Promise<T>) => withSession((token) => fn(token as string), { required: true, jar: ctx.scope.cookies });
  return next({ ctx: { user, call } });
});
