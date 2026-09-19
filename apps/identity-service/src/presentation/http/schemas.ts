import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ message: "Enter a valid email address." }));
const newPassword = z
  .string()
  .min(8, { message: "Password must be at least 8 characters." })
  .max(256, { message: "Password must be at most 256 characters." })
  .refine((value) => value.trim().length > 0, { message: "Password cannot be only spaces." });
/** Existing passwords are checked, not validated: any non-empty string up to the hashing bound. */
const existingPassword = z.string().min(1, { message: "Password is required." }).max(256);
const bearerSecret = z.string().min(1).max(512);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const RegisterBody = z.object({ email, password: newPassword, name: z.string().trim().min(1).max(100) });
export const LoginBody = z.object({ email: z.string().trim().min(1).max(254), password: existingPassword });
export const RefreshBody = z.object({ refreshToken: bearerSecret });
export const LogoutBody = z.object({ refreshToken: bearerSecret.optional() }).optional().default({});
export const TokenBody = z.object({ token: bearerSecret });
export const ForgotPasswordBody = z.object({ email });
export const ResetPasswordBody = z.object({ token: bearerSecret, password: newPassword });
export const UpdateProfileBody = z.object({ name: z.string().trim().min(1).max(100) });
export const ChangePasswordBody = z.object({ currentPassword: existingPassword, newPassword, refreshToken: bearerSecret.optional() });
export const DeleteAccountBody = z.object({ password: existingPassword });

const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { message: "Country must be a two-letter ISO code, e.g. GE." });

const addressFields = {
  fullName: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: nullableText(200),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country,
  phone: nullableText(32),
  label: nullableText(40),
  isDefault: z.boolean().optional(),
};

export const AddressBody = z.object(addressFields);
export const AddressPatchBody = z
  .object({
    fullName: addressFields.fullName.optional(),
    line1: addressFields.line1.optional(),
    line2: z.string().trim().max(200).nullable().optional(),
    city: addressFields.city.optional(),
    postalCode: addressFields.postalCode.optional(),
    country: country.optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    label: z.string().trim().max(40).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Nothing to update." });

export const AddressIdParam = z.string().min(1).max(64);

export const CustomerListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
