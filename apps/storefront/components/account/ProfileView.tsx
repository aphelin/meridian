"use client";

import type { UserDto } from "@meridian/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fieldErrorsOf } from "@/lib/errors";
import { clearCart, replaceSaved } from "@/lib/stores";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { FormError, MIN_PASSWORD, newPasswordRules, passwordEntered, PasswordField, Success, TextField, type ClientError } from "./shared";

/** A form-level error only when the server didn't tie it to a field shown under that field. */
const formLevel = (error: ClientError, fields: Record<string, string>) => (hasErrors(fieldErrorsOf(error, fields)) ? null : error);

const PROFILE_FIELDS = { name: "name", Name: "name" } as const;
const PASSWORD_FIELDS = { currentPassword: "current", newPassword: "next", password: "next" } as const;
const DELETE_FIELDS = { password: "password" } as const;

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid-cols-12 md:gap-10">
      <div className="md:col-span-4">
        <h2 id={id} className="heading">
          {title}
        </h2>
        {description ? <p className="mt-2 max-w-[40ch] text-sm text-stone">{description}</p> : null}
      </div>
      <div className="md:col-span-8 lg:col-span-6">{children}</div>
    </section>
  );
}

function ProfileForm({ user }: { user: UserDto }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(user.name);
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors({ name }, { name: [rules.required("Tell us your name.")] });
  const update = trpc.account.updateProfile.useMutation({
    onSuccess: (next) => {
      utils.auth.me.setData(undefined, next);
      setName(next.name);
    },
    onError: (error) => fields.showServer(fieldErrorsOf(error, PROFILE_FIELDS), formRef.current),
  });
  const trimmed = name.trim();
  const unchanged = trimmed === user.name;

  return (
    <form
      ref={formRef}
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (unchanged || update.isPending || !fields.check(e.currentTarget)) return;
        update.mutate({ name: trimmed });
      }}
    >
      <TextField
        label="Full name"
        autoComplete="name"
        aria-required
        maxLength={100}
        value={name}
        error={fields.errors.name}
        onChange={(v) => {
          setName(v);
          if (update.isSuccess || update.isError) update.reset();
        }}
      />
      <div>
        <p className="label">Email</p>
        <p className="flex min-h-[50px] flex-wrap items-center gap-3 break-all rounded-[12px] bg-plaster px-4 py-2.5">
          {user.email}
          {user.emailVerified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}
        </p>
        <p className="hint">Your email is your sign-in. Contact us if you need to change it.</p>
      </div>
      {update.isSuccess ? <Success>Profile saved.</Success> : null}
      <FormError error={formLevel(update.error, PROFILE_FIELDS)} />
      <div>
        <Button type="submit" pending={update.isPending} disabled={unchanged}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors(
    { current, next, confirm },
    {
      current: [passwordEntered("Enter your current password.")],
      next: newPasswordRules("Enter a new password."),
      confirm: [passwordEntered("Enter the new password again."), (value) => (value === next ? null : "The passwords don’t match.")],
    },
  );
  const change = trpc.account.changePassword.useMutation({
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      fields.reset();
    },
    onError: (error) => fields.showServer(fieldErrorsOf(error, PASSWORD_FIELDS), formRef.current),
  });
  const reset = () => {
    if (change.isSuccess || change.isError) change.reset();
  };

  return (
    <form
      ref={formRef}
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (change.isPending || !fields.check(e.currentTarget)) return;
        change.mutate({ currentPassword: current, newPassword: next });
      }}
    >
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        aria-required
        maxLength={256}
        value={current}
        error={fields.errors.current}
        onChange={(v) => {
          setCurrent(v);
          reset();
        }}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        aria-required
        maxLength={256}
        value={next}
        error={fields.errors.next}
        onChange={(v) => {
          setNext(v);
          reset();
        }}
        hint={`At least ${MIN_PASSWORD} characters.`}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        aria-required
        maxLength={256}
        value={confirm}
        onChange={(v) => {
          setConfirm(v);
          reset();
        }}
        error={fields.errors.confirm}
      />
      {change.isSuccess ? <Success>Password changed. You’re still signed in here, and other devices were signed out.</Success> : null}
      <FormError error={formLevel(change.error, PASSWORD_FIELDS)} />
      <div>
        <Button type="submit" pending={change.isPending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const fields = useFieldErrors({ password }, { password: [passwordEntered("Enter your password.")] });
  const remove = trpc.account.deleteAccount.useMutation({
    onError: (error) => fields.showServer(fieldErrorsOf(error, DELETE_FIELDS), formRef.current),
    onSuccess: async () => {
      setOpen(false);
      // The account's cart and saved pieces went with it; don't leave copies on this device.
      clearCart();
      replaceSaved([]);
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();
      toast("Your account has been deleted", { description: "We’ve signed you out and sent a confirmation email." });
      router.push("/");
    },
  });

  return (
    <>
      <p className="text-sm text-stone">
        Deleting your account removes your profile, saved addresses, saved pieces and sign-in. Past orders stay on record for accounting, without your name
        or contact details. This can’t be undone.
      </p>
      <Button type="button" variant="secondary" className="mt-5" onClick={() => setOpen(true)}>
        Delete account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (remove.isPending) return;
          setOpen(value);
          if (!value) {
            setPassword("");
            remove.reset();
            fields.reset();
          }
        }}
      >
        <DialogContent className="p-6 sm:p-8">
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription className="mt-2">Enter your password to confirm. Your account is deleted straight away and you’ll be signed out.</DialogDescription>
          <form
            ref={formRef}
            className="mt-6 grid gap-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (remove.isPending || !fields.check(e.currentTarget)) return;
              remove.mutate({ password });
            }}
          >
            <PasswordField
              label="Your password"
              autoComplete="current-password"
              aria-required
              maxLength={256}
              value={password}
              error={fields.errors.password}
              onChange={(v) => {
                setPassword(v);
                if (remove.isError) remove.reset();
              }}
              autoFocus
            />
            <FormError error={formLevel(remove.error, DELETE_FIELDS)} />
            <div className="flex flex-wrap justify-end gap-2.5">
              <DialogClose asChild>
                <Button type="button" variant="quiet" disabled={remove.isPending}>
                  Keep my account
                </Button>
              </DialogClose>
              <Button type="submit" pending={remove.isPending}>
                Delete permanently
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Profile & security: name, password change and account deletion. */
export function ProfileView({ user }: { user: UserDto }) {
  return (
    <div>
      <Section id="profile-title" title="Profile" description="How we address you in emails and on orders.">
        <ProfileForm user={user} />
      </Section>
      <Section id="password-title" title="Password" description="Changing your password signs you out everywhere else.">
        <PasswordForm />
      </Section>
      <Section id="delete-title" title="Delete account">
        <DeleteAccount />
      </Section>
    </div>
  );
}
