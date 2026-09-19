"use client";

import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";

/** Paddle.js overlay checkout, sandbox only. Live Paddle is never initialised by the storefront. */

type Listener = (event: PaddleEventData) => void;

let listener: Listener | null = null;
let loaded: { token: string; paddle: Promise<Paddle | undefined> } | null = null;

function load(token: string) {
  if (!loaded || loaded.token !== token) {
    loaded = {
      token,
      paddle: initializePaddle({ environment: "sandbox", token, eventCallback: (event) => listener?.(event) }),
    };
  }
  return loaded.paddle;
}

export async function openPaddleSandboxCheckout({
  paddle: intent,
  email,
  onEvent,
}: {
  paddle: { transactionId: string; clientToken: string; environment: "sandbox" };
  email?: string;
  onEvent: Listener;
}) {
  if (intent.environment !== "sandbox") throw new Error("Only Paddle sandbox payments are enabled in this shop.");
  const paddle = await load(intent.clientToken);
  if (!paddle) throw new Error("The Paddle checkout could not load. Check your connection and try again.");
  // Belt and braces: whatever initialised Paddle before, this checkout always runs against the sandbox.
  paddle.Environment.set("sandbox");
  listener = onEvent;
  paddle.Checkout.open({
    transactionId: intent.transactionId,
    settings: { displayMode: "overlay", theme: "light", allowLogout: false },
    ...(email ? { customer: { email } } : {}),
  });
  return () => {
    if (listener === onEvent) listener = null;
  };
}
