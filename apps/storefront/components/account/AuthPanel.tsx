"use client";

import type { UserDto } from "@meridian/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { fieldErrorsOf } from "@/lib/errors";
import { syncAfterSignIn } from "@/lib/sync";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { codeOf, FormError, MIN_PASSWORD, newPasswordRules, passwordEntered, PasswordField, TextField, safeNext, type ClientError } from "./shared";

type Mode = "signin" | "register";

/** Server field names (zod paths and identity's `details.field`) for the form's fields. */
const SERVER_FIELDS = { name: "name", Name: "name", email: "email", password: "password" } as const;

/** Field messages from a failed sign in or sign up; an email that is already registered belongs under Email. */
function serverFieldErrors(error: ClientError) {
  if (codeOf(error) === "CONFLICT" && error) return { email: error.message };
  return fieldErrorsOf(error, SERVER_FIELDS);
}

const HEADINGS: Record<Mode, { title: string; lede: string }> = {
  signin: { title: "Welcome back", lede: "Sign in to see your orders, addresses and saved pieces." },
  register: { title: "Create your account", lede: "Keep orders, addresses and saved pieces in one place." },
};

/**
 * Demo admin credentials hint: never in production builds, and only when both values are configured. Next inlines
 * these at build time, so production bundles don't contain the values.
 */
const DEMO_ADMIN = (() => {
  if (process.env.NODE_ENV === "production") return null;
  const email = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL?.trim();
  const password = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD?.trim();
  return email && password ? { email, password } : null;
})();

/**
 * Sign in / create account. After either succeeds the guest cart and the device's saved pieces are merged into the
 * account (`cart.merge` + `wishlist.merge`), then every query refetches as the signed-in shopper.
 */
export function AuthPanel({ next: rawNext, lede }: { next?: string | null; lede?: string }) {
  const router = useRouter();
  const next = safeNext(rawNext);
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Sign in only asks for something in each field, as the BFF does; creating an account checks the email and password.
  const fields = useFieldErrors(
    { name, email, password },
    mode === "signin"
      ? { email: [rules.required("Enter your email address.")], password: [passwordEntered("Enter your password.")] }
      : {
          name: [rules.required("Tell us your name.")],
          email: [rules.required("Enter your email address."), rules.email()],
          password: newPasswordRules("Choose a password."),
        },
  );
  const onServerError = (error: ClientError) => fields.showServer(serverFieldErrors(error), formRef.current);

  const done = async (user: UserDto, created: boolean) => {
    await syncAfterSignIn(utils.client).catch(() => undefined);
    utils.auth.me.setData(undefined, user);
    await utils.invalidate();
    const first = user.name.trim().split(/\s+/)[0];
    toast(created ? `Welcome to Meridian, ${first}` : `Welcome back, ${first}`, {
      description: created ? "We sent you an email to confirm your address." : undefined,
    });
    if (next) router.push(next);
  };
  const login = trpc.auth.login.useMutation({ onSuccess: (user) => done(user, false), onError: onServerError });
  const register = trpc.auth.register.useMutation({
    onSuccess: (user) => done(user, true),
    onError: (error) => {
      // Captcha tokens are single use: ask for a fresh one before the next attempt.
      turnstile.current?.reset();
      onServerError(error);
    },
  });
  const active = mode === "signin" ? login : register;

  return (
    <main className="shell grid place-items-center pb-24 pt-10 md:pt-16">
      <div className="w-full max-w-[440px]">
        {/*
          Both headings and ledes share one grid cell, so the block keeps the taller one's height and the tabs never move.
          The inactive copy is drawn from a data attribute through ::before, so its text is never duplicated in the DOM.
        */}
        <div className="relative left-1/2 grid w-[min(calc(100vw-2rem),40rem)] -translate-x-1/2 text-center">
          {(["signin", "register"] as const).map((id) =>
            id === mode ? (
              <div key={id} className="col-start-1 row-start-1">
                <h1 className="title">{HEADINGS[id].title}</h1>
                <p className="mt-3 text-stone">{lede ?? HEADINGS[id].lede}</p>
              </div>
            ) : (
              <div key={id} className="invisible col-start-1 row-start-1" aria-hidden="true">
                <span className="title block before:content-[attr(data-text)]" data-text={HEADINGS[id].title} />
                <span className="mt-3 block before:content-[attr(data-text)]" data-text={lede ?? HEADINGS[id].lede} />
              </div>
            ),
          )}
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as Mode);
            login.reset();
            register.reset();
            fields.reset();
          }}
          className="mt-8"
        >
          <TabsList aria-label="Account">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Create account</TabsTrigger>
          </TabsList>
          {(["signin", "register"] as const).map((id) => (
            <TabsContent key={id} value={id}>
              <form
                ref={id === mode ? formRef : undefined}
                className="mt-6 grid gap-5"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (active.isPending || !fields.check(e.currentTarget)) return;
                  if (id === "signin") login.mutate({ email, password });
                  else if (captcha) register.mutate({ name, email, password, captchaToken: captcha });
                }}
              >
                {id === "register" ? <TextField label="Name" autoComplete="name" aria-required maxLength={100} value={name} onChange={setName} error={fields.errors.name} /> : null}
                <TextField label="Email" type="email" autoComplete="email" aria-required maxLength={254} value={email} onChange={setEmail} error={fields.errors.email} />
                <div>
                  <PasswordField
                    label="Password"
                    autoComplete={id === "signin" ? "current-password" : "new-password"}
                    aria-required
                    maxLength={256}
                    value={password}
                    onChange={setPassword}
                    error={fields.errors.password}
                    hint={id === "register" ? `At least ${MIN_PASSWORD} characters.` : undefined}
                  />
                  {id === "signin" ? (
                    <p className="mt-2 text-right text-sm">
                      <Link href="/account/forgot-password" className="link text-stone hover:text-ink">
                        Forgot password?
                      </Link>
                    </p>
                  ) : null}
                </div>

                {id === "register" ? <Turnstile ref={turnstile} action="register" onToken={setCaptcha} /> : null}

                {hasErrors(serverFieldErrors(active.error)) ? null : <FormError error={active.error} />}

                <Button type="submit" className="w-full" pending={active.isPending} disabled={id === "register" && !captcha}>
                  {id === "signin" ? "Sign in" : "Create account"}
                </Button>
                {id === "register" ? (
                  <p className="text-center text-xs text-stone">
                    By creating an account you agree to our{" "}
                    <Link href="/terms" className="link text-stone">
                      terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="link text-stone">
                      privacy notice
                    </Link>
                    .
                  </p>
                ) : null}
              </form>
            </TabsContent>
          ))}
        </Tabs>

        {mode === "signin" && DEMO_ADMIN ? (
          <p className="mt-8 rounded-[14px] bg-plaster px-4 py-3 text-sm text-stone">
            Demo store: to see the admin side, sign in with <span className="font-medium text-ink">{DEMO_ADMIN.email}</span> and password{" "}
            <span className="font-medium text-ink">{DEMO_ADMIN.password}</span>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
