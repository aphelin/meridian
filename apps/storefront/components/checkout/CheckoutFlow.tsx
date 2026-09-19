"use client";

import type { PlaceOrderRequest, PricingBreakdown, ShippingMethodId } from "@meridian/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { resolveLines } from "@/components/cart/CartLines";
import { OutOfStockAlert, outOfStockLine } from "@/components/cart/OutOfStockAlert";
import { blockingLines, useCartStock } from "@/components/cart/stock";
import { ErrorAlert, referenceOf } from "@/components/orders/ErrorState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { Field, FieldError, FieldLabel, useFieldIds } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Turnstile, type TurnstileHandle } from "@/components/ui/Turnstile";
import { useCatalog } from "@/lib/catalog-context";
import { errorCode, errorMessage, fieldErrorsOf } from "@/lib/errors";
import { money } from "@/lib/format";
import { bySku, variantImage } from "@/lib/product";
import { clearCart, setCartQty, useCart } from "@/lib/stores";
import { CartSyncError, flushCartSync } from "@/lib/sync";
import { trpc } from "@/lib/trpc";
import { useFieldErrors } from "@/lib/use-field-errors";
import { hasErrors, rules } from "@/lib/validation";
import { ADDRESS_RULES, AddressFields, EMPTY_ADDRESS, NEW_ADDRESS, SavedAddressPicker, SavedAddressSkeleton, toPostal, type AddressDraft } from "./AddressFields";
import { CouponField } from "./CouponField";
import { PricingList, SummaryLines, type SummaryLine } from "./OrderSummary";
import { PaymentPanel } from "./PaymentPanel";
import { recallLastIntent, rememberIntent, type StoredIntent } from "./payment-intent";
import { ShippingMethods } from "./ShippingMethods";

const STEPS = ["Details", "Payment", "Confirmation"];

export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Checkout progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${i < current ? "bg-ink text-paper" : i === current ? "bg-cobalt text-paper" : "bg-plaster text-stone"}`} aria-hidden="true">
            {i < current ? <Icon name="check" size={14} /> : i + 1}
          </span>
          <span className={i === current ? "font-medium" : "sr-only text-stone sm:not-sr-only"}>
            {label}
            {i < current ? <span className="sr-only"> (done)</span> : null}
          </span>
          {i < STEPS.length - 1 ? <span className="mx-1 h-px w-5 bg-line-strong sm:w-10" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

const noop = () => () => undefined;
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Errors after which the same request can be retried with the same idempotency key (the first attempt may have landed). */
const RETRY_SAME_KEY = new Set(["UPSTREAM_UNAVAILABLE", "IDEMPOTENCY_IN_FLIGHT", "INTERNAL", "RATE_LIMITED", "CHAOS_INJECTED"]);

type CheckoutField = "email" | "name" | keyof AddressDraft;

/** Server field names for the checkout form: BFF zod paths (`request.…`) and checkout-service's own paths. */
function serverFields(guest: boolean): Record<string, CheckoutField> {
  const map: Record<string, CheckoutField> = {};
  const add = (path: string, key: CheckoutField) => {
    map[path] = key;
    map[`request.${path}`] = key;
  };
  if (guest) add("customer.email", "email");
  add("customer.name", "name");
  for (const key of Object.keys(EMPTY_ADDRESS) as (keyof AddressDraft)[]) add(`shippingAddress.${key}`, key);
  return map;
}

function TextField({ label, value, onChange, error, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <FieldInput value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function FieldInput(props: React.ComponentProps<"input">) {
  return <Input {...useFieldIds()} {...props} />;
}

function CheckoutSkeleton() {
  return (
    <main className="shell pt-8 md:pt-12" aria-busy="true">
      <h1 className="sr-only">Checkout</h1>
      <Skeleton className="h-6 w-72" />
      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="grid content-start gap-5 lg:col-span-7">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-[50px] w-full" />
          <Skeleton className="h-[50px] w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-96 !rounded-[18px] lg:col-span-5" />
      </div>
    </main>
  );
}

export function CheckoutFlow() {
  const hydrated = useHydrated();
  const catalog = useCatalog();
  const lines = resolveLines(useCart(), catalog);
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const user = me.data ?? null;
  const guest = !me.isPending && !user;
  const addresses = trpc.account.addresses.list.useQuery(undefined, { enabled: Boolean(user) });
  const place = trpc.checkout.place.useMutation();
  const turnstile = useRef<TurnstileHandle>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [addressChoice, setAddressChoice] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [method, setMethod] = useState<ShippingMethodId>("standard");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [flushing, setFlushing] = useState(false);
  const [syncError, setSyncError] = useState<{ reference: string | null; detail: string | null } | null>(null);
  const [placed, setPlaced] = useState<{ stored: StoredIntent; lines: SummaryLine[]; pricing: PricingBreakdown; couponCode: string | null; shippingLabel: string } | null>(null);
  const [unpaid, setUnpaid] = useState<StoredIntent | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (hydrated) setUnpaid(recallLastIntent());
  }, [hydrated]);

  const saved = addresses.data ?? [];
  const defaultChoice = saved.find((a) => a.isDefault)?.id ?? saved[0]?.id ?? NEW_ADDRESS;
  const choice = user && addresses.data ? (addressChoice && (addressChoice === NEW_ADDRESS || saved.some((a) => a.id === addressChoice)) ? addressChoice : defaultChoice) : NEW_ADDRESS;
  const savedAddress = saved.find((a) => a.id === choice) ?? null;
  const country = savedAddress?.country ?? draft.country;
  const formRef = useRef<HTMLFormElement>(null);
  // The order name falls back to the address's full name, so Name only needs attention when both are empty.
  const fallbackName = (savedAddress?.fullName ?? draft.fullName).trim();
  const fields = useFieldErrors<CheckoutField>(
    { ...draft, email, name: name ?? user?.name ?? "" },
    {
      ...(guest ? { email: [rules.required("Enter your email address."), rules.email()] } : {}),
      name: [(value) => (value.trim() || fallbackName ? null : "Tell us your name.")],
      ...(savedAddress ? {} : ADDRESS_RULES),
    },
  );

  const quoteLines = lines.map((l) => ({ sku: l.sku, variantId: l.variantId, qty: l.qty }));
  const quote = trpc.checkout.quote.useQuery(
    { lines: quoteLines, shippingMethod: method, country, couponCode: coupon },
    { enabled: hydrated && quoteLines.length > 0 && !placed, placeholderData: (previous) => previous, retry: false },
  );
  const stock = useCartStock(lines.map((l) => l.sku));
  const blockedLines = blockingLines(lines, stock);
  const blocked = blockedLines.length;

  if (!hydrated || me.isPending) return <CheckoutSkeleton />;

  if (placed) {
    return (
      <main className="shell pt-8 md:pt-12">
        <CheckoutSteps current={1} />
        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <h1 className="title">Pay for order {placed.stored.number}</h1>
            <p className="lede mt-3 max-w-[52ch]">Your order is placed and the pieces are reserved. Complete the test payment below to confirm it.</p>
            <PaymentPanel className="mt-8" stored={placed.stored} />
          </div>
          <aside className="lg:col-span-5" aria-labelledby="summary-title">
            <div className="panel p-6 sm:p-8 lg:sticky lg:top-28">
              <h2 id="summary-title" className="heading">
                Order summary
              </h2>
              <div className="mt-6">
                <SummaryLines lines={placed.lines} />
              </div>
              <div className="mt-6 border-t border-line-strong/60 pt-5">
                <PricingList pricing={placed.pricing} couponCode={placed.couponCode} shippingLabel={placed.shippingLabel} />
              </div>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  if (!lines.length) {
    return (
      <main className="shell pt-8 md:pt-14">
        <h1 className="title">Checkout</h1>
        {unpaid ? (
          <div className="panel mt-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <p>
              Order <span className="font-medium">{unpaid.number}</span> is waiting for payment of <span className="tabular">{money(unpaid.totalCents)}</span>.
            </p>
            <Button asChild>
              <Link href={`/orders/${unpaid.orderId}`}>Continue to payment</Link>
            </Button>
          </div>
        ) : null}
        <div className="panel mt-8 grid place-items-center px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-paper" aria-hidden="true">
            <Icon name="bag" size={24} />
          </span>
          <p className="heading mt-5">There is nothing to check out yet</p>
          <p className="mt-2 max-w-[40ch] text-stone">Add a piece to your cart first, then come back here to pay.</p>
          <Button asChild className="mt-6">
            <Link href="/shop">Browse the shop</Link>
          </Button>
        </div>
      </main>
    );
  }

  const couponResult = quote.data?.coupon && coupon && quote.data.coupon.code.toUpperCase() === coupon ? quote.data.coupon : null;
  const couponApplied = couponResult?.applied ? coupon : null;
  const pricing = quote.data?.pricing ?? null;
  const options = quote.data?.shippingOptions ?? null;
  const summary: SummaryLine[] = lines.map((l) => ({
    key: l.sku,
    name: l.piece.name,
    label: l.variant.label,
    qty: l.qty,
    totalCents: (quote.data?.lines.find((q) => q.sku === l.sku)?.lineTotalCents ?? l.piece.priceCents * l.qty),
    image: variantImage(l.piece, l.variantId),
  }));
  const customerName = (name ?? user?.name ?? "").trim();

  const submit = async () => {
    if (place.isPending || flushing) return;
    const shippingAddress = savedAddress ? toPostal(savedAddress) : toPostal(draft);
    const request: PlaceOrderRequest = {
      customer: { email: user?.email ?? email.trim(), name: customerName || shippingAddress.fullName },
      shippingAddress,
      shippingMethod: method,
      couponCode: couponApplied,
    };
    const signature = JSON.stringify({ request, lines: quoteLines });
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    const key = attempt.current.key;
    // Orders are placed from the server cart, so push pending device changes first and stop if that fails.
    setSyncError(null);
    setFlushing(true);
    try {
      await flushCartSync();
    } catch (error) {
      const sync = error instanceof CartSyncError ? error : null;
      // A rejected cart (e.g. stock) says why; network and server failures ask for another try.
      setSyncError({ reference: sync?.correlationId ? `Reference: ${sync.correlationId}` : null, detail: sync && !sync.retryable ? sync.message : null });
      return;
    } finally {
      setFlushing(false);
    }
    place.mutate(
      { request, idempotencyKey: key, captchaToken: guest ? (captcha ?? undefined) : undefined },
      {
        onSuccess: (result) => {
          const stored: StoredIntent = {
            orderId: result.order.id,
            number: result.order.number,
            totalCents: result.order.pricing.totalCents,
            email: result.order.customer.email,
            deadline: result.order.paymentDeadline,
            intent: result.payment,
          };
          rememberIntent(stored);
          setPlaced({
            stored,
            pricing: result.order.pricing,
            couponCode: result.order.couponCode,
            shippingLabel: result.order.shippingMethod.label,
            lines: result.order.lines.map((l) => {
              const hit = bySku(catalog, l.sku);
              return { key: l.sku, name: l.productName, label: l.variantLabel, qty: l.qty, totalCents: l.lineTotalCents, image: hit ? variantImage(hit.product, hit.variant.id) : null };
            }),
          });
          attempt.current = null;
          clearCart();
          void utils.cart.get.invalidate();
          void utils.orders.list.invalidate();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (error) => {
          fields.showServer(fieldErrorsOf(error, serverFields(guest)), formRef.current);
          // Captcha tokens are single use; a definitive rejection gets a fresh key for the corrected attempt.
          turnstile.current?.reset();
          if (!RETRY_SAME_KEY.has(errorCode(error) ?? "") && (error.data?.status ?? 500) < 500) attempt.current = null;
          if (errorCode(error) === "OUT_OF_STOCK") void utils.catalog.stock.invalidate();
          if (errorCode(error)?.startsWith("COUPON_")) void quote.refetch();
        },
      },
    );
  };

  // Errors the server tied to a field show under that field instead.
  const placeError = hasErrors(fieldErrorsOf(place.error, serverFields(guest))) ? null : place.error;
  const placeErrorText = (() => {
    const code = errorCode(placeError);
    if (!placeError) return null;
    if (code === "OUT_OF_STOCK") return null; // OutOfStockAlert names the piece and offers to remove it
    if (code === "CAPTCHA_INVALID" || code === "CAPTCHA_REQUIRED") return "The security check expired. It has been refreshed, so try again.";
    if (code === "IDEMPOTENCY_IN_FLIGHT") return "Your order is still being placed. Wait a moment, then try again.";
    return errorMessage(placeError) ?? "The order could not be placed.";
  })();

  const needsCaptcha = guest && !captcha;

  return (
    <main className="shell pt-8 md:pt-12">
      <CheckoutSteps current={0} />
      <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <h1 className="title">Checkout</h1>
          <form
            ref={formRef}
            className="mt-8 grid gap-10"
            aria-label="Checkout"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (place.isPending || flushing || !fields.check(e.currentTarget)) return;
              void submit();
            }}
          >
            <fieldset className="grid gap-4">
              <legend className="heading mb-3">Contact</legend>
              {user ? (
                <>
                  <p className="rounded-[12px] bg-plaster px-4 py-3 text-[0.9375rem]">
                    Signed in as <span className="font-medium">{user.email}</span>. The order will appear in your account.
                  </p>
                  <TextField label="Name" aria-required maxLength={120} autoComplete="name" value={name ?? user.name} onChange={setName} error={fields.errors.name} />
                </>
              ) : (
                <>
                  <TextField label="Email" type="email" aria-required maxLength={254} autoComplete="email" value={email} onChange={setEmail} error={fields.errors.email} />
                  <TextField label="Name" aria-required maxLength={120} autoComplete="name" value={name ?? ""} onChange={setName} error={fields.errors.name} />
                  <p className="hint -mt-2">
                    Checking out as a guest: the confirmation email carries a private link to your order.{" "}
                    <Link href="/account?next=/checkout" className="link">
                      Sign in
                    </Link>{" "}
                    to keep it in your account.
                  </p>
                </>
              )}
            </fieldset>

            <fieldset className="grid gap-4">
              <legend className="heading mb-3">Shipping address</legend>
              {user ? (
                addresses.isPending ? (
                  <SavedAddressSkeleton />
                ) : addresses.error ? (
                  <ErrorAlert error={addresses.error}>Your saved addresses could not load. Enter the address below.</ErrorAlert>
                ) : saved.length ? (
                  <SavedAddressPicker addresses={saved} value={choice} onChange={setAddressChoice} />
                ) : null
              ) : null}
              {!savedAddress && !(user && addresses.isPending) ? <AddressFields value={draft} onChange={setDraft} errors={fields.errors} /> : null}
            </fieldset>

            <fieldset>
              <legend className="heading">Shipping method</legend>
              <ShippingMethods options={options} value={method} onChange={setMethod} />
            </fieldset>

            <fieldset>
              <legend className="sr-only">Discount</legend>
              <CouponField applied={coupon} result={couponResult} checking={quote.isFetching} onApply={setCoupon} />
            </fieldset>

            {guest ? (
              <div>
                <Turnstile ref={turnstile} action="place-order" onToken={setCaptcha} />
                {needsCaptcha ? <p className="hint">Running a quick security check…</p> : null}
              </div>
            ) : null}

            {blocked ? (
              <Alert>
                <ul className="grid gap-2">
                  {blockedLines.map((l) => {
                    const left = stock?.get(l.sku) ?? 0;
                    const soldOut = l.piece.soldOut || left <= 0;
                    return (
                      <li key={l.sku}>
                        {l.piece.name} ({l.variant.label}) {soldOut ? "is sold out." : `has only ${left} left.`}{" "}
                        {soldOut ? (
                          <button type="button" className="font-medium underline underline-offset-4" onClick={() => setCartQty(l.sku, 0)}>
                            Remove {l.piece.name}
                          </button>
                        ) : (
                          <Link href="/cart" className="font-medium underline underline-offset-4">
                            Lower the quantity
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Alert>
            ) : null}

            {syncError ? (
              <Alert reference={syncError.reference}>
                Your latest cart changes couldn’t be saved, so the order wasn’t placed. {syncError.detail ?? "Check your connection and try again."}
              </Alert>
            ) : null}

            {outOfStockLine(placeError, catalog) ? (
              <OutOfStockAlert error={placeError} catalog={catalog} onRemoved={() => place.reset()} />
            ) : placeError ? (
              <Alert reference={referenceOf(placeError)}>{placeErrorText}</Alert>
            ) : null}

            <div className="grid gap-3 sm:flex sm:items-center sm:gap-5">
              <Button type="submit" className="w-full sm:w-auto sm:px-8" pending={place.isPending || flushing} disabled={needsCaptcha || !pricing || blocked > 0 || Boolean(outOfStockLine(quote.error, catalog))}>
                {place.isPending ? "Placing order…" : pricing ? `Place order · ${money(pricing.totalCents)}` : "Place order"}
              </Button>
              <p className="text-sm text-stone">You pay on the next step. It’s a test payment, so nothing is charged.</p>
            </div>
          </form>
        </div>

        <aside className="lg:col-span-5" aria-labelledby="summary-title">
          <div className="panel p-6 sm:p-8 lg:sticky lg:top-28">
            <h2 id="summary-title" className="heading">
              Order summary
            </h2>
            <div className="mt-6">
              <SummaryLines lines={summary} />
            </div>
            <div className="mt-6 border-t border-line-strong/60 pt-5">
              {outOfStockLine(quote.error, catalog) ? <OutOfStockAlert className="mb-4" error={quote.error} catalog={catalog} /> : null}
              {quote.error && !pricing && !outOfStockLine(quote.error, catalog) ? (
                <ErrorAlert error={quote.error}>
                  {errorMessage(quote.error)}{" "}
                  <button type="button" className="underline underline-offset-4" onClick={() => void quote.refetch()}>
                    Try again
                  </button>
                </ErrorAlert>
              ) : (
                <PricingList pricing={pricing} couponCode={couponApplied} shippingLabel={options?.find((o) => o.id === method)?.label} loading={quote.isFetching} />
              )}
              {quote.error && pricing && !outOfStockLine(quote.error, catalog) ? <ErrorAlert className="mt-4" error={quote.error} /> : null}
            </div>
            <Link href="/cart" className="mt-5 inline-block text-sm text-stone underline underline-offset-4 hover:text-ink">
              Edit cart
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
