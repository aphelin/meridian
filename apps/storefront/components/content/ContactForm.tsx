"use client";

import type { ContactRequest } from "@meridian/contracts";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { fieldErrorsOf } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import { hasErrors } from "@/lib/validation";
import { FormError } from "./forms";

type Topic = ContactRequest["topic"];

export const CONTACT_TOPICS: { value: Topic; label: string }[] = [
  { value: "order", label: "An order" },
  { value: "product", label: "A product" },
  { value: "returns", label: "Returns" },
  { value: "other", label: "Something else" },
];

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "name" | "email" | "topic" | "message";

const SERVER_FIELDS: Record<string, Field> = { name: "name", email: "email", topic: "topic", message: "message" };

/** Contact form: topic, optional order number, message and Turnstile; sends through `contact.send`. */
export function ContactForm() {
  const uid = useId();
  const ids = { name: `${uid}-name`, email: `${uid}-email`, topic: `${uid}-topic`, order: `${uid}-order`, message: `${uid}-message` };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic | "">("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [sent, setSent] = useState<{ name: string; email: string } | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const topicRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const send = trpc.contact.send.useMutation({
    onSuccess: (_, input) => setSent({ name: input.name, email: input.email }),
    onError: (error) => {
      const found = fieldErrorsOf(error, SERVER_FIELDS);
      if (!hasErrors(found)) return;
      setErrors(found);
      const first = (["name", "email", "topic", "message"] as const).find((f) => found[f]);
      if (first) ({ name: nameRef, email: emailRef, topic: topicRef, message: messageRef })[first].current?.focus();
    },
    onSettled: () => turnstile.current?.reset(),
  });

  if (sent) {
    return (
      <div className="panel grid justify-items-start gap-4 p-6 md:p-8" role="status" aria-labelledby={`${uid}-sent`}>
        <span className="grid size-12 place-items-center rounded-full bg-paper" aria-hidden="true">
          <Icon name="check" size={22} />
        </span>
        <h2 id={`${uid}-sent`} className="heading">
          Thanks, {sent.name.split(/\s+/)[0]}. Your message is with us
        </h2>
        <p className="max-w-[52ch] text-stone">
          We’ve sent a receipt to <span className="font-medium text-ink break-all">{sent.email}</span>. In this demo shop it lands in the sandbox mailbox rather
          than your real inbox.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              send.reset();
              setSent(null);
              setMessage("");
              setOrderNumber("");
              setTopic("");
            }}
          >
            Send another message
          </Button>
          <Button asChild variant="quiet">
            <Link href="/shop">Continue shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = "Tell us your name.";
    if (!EMAIL_SHAPE.test(email.trim())) next.email = "Enter a valid email address, like you@example.com.";
    if (!topic) next.topic = "Choose what your message is about.";
    if (message.trim().length < MESSAGE_MIN) next.message = `Tell us a little more (at least ${MESSAGE_MIN} characters).`;
    setErrors(next);
    const first = (["name", "email", "topic", "message"] as const).find((f) => next[f]);
    if (first) ({ name: nameRef, email: emailRef, topic: topicRef, message: messageRef })[first].current?.focus();
    return !first;
  };

  const describedBy = (field: Field, extra?: string) => [errors[field] ? `${uid}-${field}-error` : null, extra].filter(Boolean).join(" ") || undefined;
  const fieldError = (field: Field) => <FieldError id={`${uid}-${field}-error`}>{errors[field]}</FieldError>;
  const clear = (field: Field) => errors[field] && setErrors((e) => ({ ...e, [field]: undefined }));
  const orderRelevant = topic === "order" || topic === "returns";

  return (
    <form
      noValidate
      aria-label="Contact us"
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (send.isPending || !captcha || !validate() || !topic) return;
        send.mutate({
          name: name.trim(),
          email: email.trim(),
          topic,
          orderNumber: orderNumber.trim().toUpperCase() || null,
          message: message.trim(),
          captchaToken: captcha,
        });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.name} className="label">
            Name
          </label>
          <Input
            ref={nameRef}
            id={ids.name}
            autoComplete="name"
            maxLength={100}
            aria-required
            value={name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
          />
          {fieldError("name")}
        </div>
        <div>
          <label htmlFor={ids.email} className="label">
            Email
          </label>
          <Input
            ref={emailRef}
            id={ids.email}
            type="email"
            autoComplete="email"
            maxLength={254}
            aria-required
            value={email}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy("email")}
            onChange={(e) => {
              setEmail(e.target.value);
              clear("email");
            }}
          />
          {fieldError("email")}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label id={`${ids.topic}-label`} htmlFor={ids.topic} className="label">
            Topic
          </label>
          <Select
            value={topic}
            onValueChange={(v) => {
              setTopic(v as Topic);
              clear("topic");
            }}
          >
            <SelectTrigger
              ref={topicRef}
              id={ids.topic}
              aria-labelledby={`${ids.topic}-label`}
              aria-invalid={errors.topic ? true : undefined}
              aria-describedby={describedBy("topic")}
              className={`!h-[50px] w-full cursor-pointer !rounded-[12px] ${errors.topic ? "!shadow-[inset_0_0_0_1px_var(--color-brick)]" : ""}`}
            >
              <SelectValue placeholder="What is it about?" />
            </SelectTrigger>
            <SelectContent align="start">
              {CONTACT_TOPICS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("topic")}
        </div>
        <div>
          <label htmlFor={ids.order} className="label">
            Order number <span className="font-normal text-stone">(optional)</span>
          </label>
          <Input
            id={ids.order}
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            placeholder="M-XXXXXXXX"
            className="uppercase placeholder:normal-case"
            value={orderNumber}
            aria-describedby={`${ids.order}-hint`}
            onChange={(e) => setOrderNumber(e.target.value)}
          />
          <p id={`${ids.order}-hint`} className="hint">
            {orderRelevant ? "Adding it helps us find your order straight away." : "It’s in your order confirmation email."}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={ids.message} className="label">
          Message
        </label>
        <Textarea
          ref={messageRef}
          id={ids.message}
          rows={6}
          maxLength={MESSAGE_MAX}
          aria-required
          value={message}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy("message", `${ids.message}-count`)}
          onChange={(e) => {
            setMessage(e.target.value);
            clear("message");
          }}
        />
        <div className="flex items-start justify-between gap-4">
          <div>{fieldError("message")}</div>
          <p id={`${ids.message}-count`} className="hint tabular shrink-0" aria-live="off">
            {message.length.toLocaleString("en-IE")} / {MESSAGE_MAX.toLocaleString("en-IE")}
          </p>
        </div>
      </div>

      <Turnstile ref={turnstile} action="contact" onToken={setCaptcha} />
      {hasErrors(fieldErrorsOf(send.error, SERVER_FIELDS)) ? null : <FormError error={send.error} />}
      <div className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone">{!captcha && !send.isPending ? "Running a quick security check…" : "We’ll email you a receipt of your message."}</p>
        <Button type="submit" className="w-full sm:w-auto" pending={send.isPending} disabled={!captcha}>
          Send message
        </Button>
      </div>
    </form>
  );
}
