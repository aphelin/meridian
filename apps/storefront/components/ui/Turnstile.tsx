"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export interface TurnstileHandle {
  /** Clears the current token and asks the widget for a new one (after a failed submit: tokens are single use). */
  reset: () => void;
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Cloudflare's always-pass test site key; used when no key is configured. */
export const TEST_SITE_KEY = "1x00000000000000000000AA";
/** Token Cloudflare's test secrets accept. Only ever used with a test site key. */
export const TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const FALLBACK_AFTER_MS = 5000;

export const siteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || TEST_SITE_KEY;
const isTestKey = (key: string) => /^[123]x0{20}A[AB]$/.test(key);

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget. Calls `onToken` with a token when the check passes and with null when it expires or
 * fails. The token is also mirrored into a hidden `captchaToken` field for form posts and tests. With a Cloudflare
 * test site key and no reachable Cloudflare script (offline CI), the documented test token is used instead.
 */
export function Turnstile({
  onToken,
  action,
  className,
  ref,
}: {
  onToken: (token: string | null) => void;
  action?: string;
  className?: string;
  ref?: Ref<TurnstileHandle>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fieldId = useId();
  const key = siteKey();

  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    const emit = (value: string | null) => {
      if (cancelled) return;
      setToken(value);
      callback.current(value);
    };
    const fallback = window.setTimeout(() => {
      if (!widget.current && isTestKey(key) && key.startsWith("1x")) emit(TEST_TOKEN);
    }, FALLBACK_AFTER_MS);

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widget.current = window.turnstile.render(container.current, {
          sitekey: key,
          action,
          theme: "light",
          appearance: "interaction-only",
          callback: (value: string) => emit(value),
          "expired-callback": () => emit(null),
          "error-callback": () => {
            emit(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (isTestKey(key) && key.startsWith("1x")) emit(TEST_TOKEN);
        else setFailed(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [key, action]);

  useImperativeHandle(ref, () => ({
    reset() {
      setToken(null);
      callback.current(null);
      setFailed(false);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
      else if (isTestKey(key) && key.startsWith("1x")) {
        setToken(TEST_TOKEN);
        callback.current(TEST_TOKEN);
      }
    },
  }));

  return (
    <div className={className} data-slot="turnstile">
      <div ref={container} />
      <input type="hidden" id={fieldId} name="captchaToken" value={token ?? ""} data-testid="turnstile-token" readOnly />
      {failed ? (
        <p className="hint !text-brick" role="alert">
          The security check could not load. Refresh the page and try again.
        </p>
      ) : null}
    </div>
  );
}
