import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ValidationError } from "@meridian/kernel";
import type { z } from "zod";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

/** Shape of `details` on a 400 VALIDATION_FAILED response. */
export interface ValidationDetails {
  issues: ValidationIssue[];
}

export function toValidationIssues(issues: readonly z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
    message: issue.message,
  }));
}

export function validationFailed(issues: readonly z.core.$ZodIssue[]): ValidationError {
  const mapped = toValidationIssues(issues);
  const first = mapped[0];
  const message = first ? `Invalid request: ${first.path ? `${first.path}: ` : ""}${first.message}` : "Invalid request";
  return new ValidationError(message, { issues: mapped } satisfies ValidationDetails);
}

/** Parses `value` with a zod schema; throws a 400 VALIDATION_FAILED DomainError listing every issue. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationFailed(result.error.issues);
  return result.data;
}

const zodBodyParam = createParamDecorator((data: { schema: z.ZodType }, ctx: ExecutionContext) =>
  parseWith(data.schema, ctx.switchToHttp().getRequest<{ body?: unknown }>().body),
);

/** Controller parameter decorator: the request body parsed with `schema`. */
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  // Wrapped because zod schemas expose `transform`, which Nest would mistake for a pipe instead of decorator data.
  return zodBodyParam({ schema });
}
