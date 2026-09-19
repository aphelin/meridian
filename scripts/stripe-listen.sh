#!/usr/bin/env bash
# Forwards Stripe test-mode events to a local payment-service with the Stripe CLI (`stripe listen`).
#   usage: scripts/stripe-listen.sh [--port N] [--write-secret | --print-secret]
#     (no flag)       forward events to http://localhost:<port>/webhooks/stripe (default port 3005; Docker: 13005)
#     --write-secret  store the listener's signing secret as STRIPE_WEBHOOK_SECRET in .env and
#                     infra/docker/apps.env.local (never printed); restart payment-service afterwards
#     --print-secret  print the signing secret (whsec_...) to stdout
# Reads STRIPE_SECRET_KEY from the environment or .env and passes it to the CLI through STRIPE_API_KEY, so the key
# never appears in the process list. Test keys only. Install the CLI with `npm i -g @stripe/cli`.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"

port="${STRIPE_LISTEN_PORT:-3005}"
mode=listen
while (($#)); do
  case "$1" in
    --port)
      port="${2:?--port needs a value}"
      shift
      ;;
    --write-secret) mode=write ;;
    --print-secret) mode=print ;;
    -h | --help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) die "unknown option $1" ;;
  esac
  shift
done
[[ "$port" =~ ^[0-9]+$ ]] || die "--port must be a number"

load_env
key="${STRIPE_SECRET_KEY:-}"
[[ -n "$key" ]] || die "STRIPE_SECRET_KEY is not set (.env)"
[[ "$key" =~ ^(sk|rk)_test_ ]] || die "STRIPE_SECRET_KEY must be a Stripe test key (sk_test_ or rk_test_); live keys are refused"

stripe_bin="$(command -v stripe || true)"
[[ -z "$stripe_bin" && -x "$HOME/.local/bin/stripe" ]] && stripe_bin="$HOME/.local/bin/stripe"
[[ -n "$stripe_bin" ]] || die "the Stripe CLI is not installed: npm i -g @stripe/cli"

# The events payment-service acts on (see HandleStripeWebhookHandler); everything else is noise.
EVENTS="payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,refund.created,refund.updated,refund.failed,charge.refund.updated"

signing_secret() {
  STRIPE_API_KEY="$key" "$stripe_bin" listen --print-secret 2>/dev/null | tr -d '[:space:]'
}

# set_env_line <file> <name> <value>: replaces or appends NAME=value without echoing the value.
set_env_line() {
  local file="$1" name="$2" value="$3" tmp
  [[ -f "$file" ]] || return 0
  tmp="$(mktemp)"
  awk -v n="$name" -v v="$value" 'BEGIN { done = 0 } $0 ~ "^" n "=" { print n "=" v; done = 1; next } { print } END { if (!done) print n "=" v }' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

case "$mode" in
  print) signing_secret ;;
  write)
    secret="$(signing_secret)"
    [[ "$secret" == whsec_* ]] || die "the Stripe CLI did not return a signing secret (is the key valid?)"
    set_env_line "$ROOT/.env" STRIPE_WEBHOOK_SECRET "$secret"
    set_env_line "$ROOT/infra/docker/apps.env.local" STRIPE_WEBHOOK_SECRET "$secret"
    log "STRIPE_WEBHOOK_SECRET written to .env and infra/docker/apps.env.local; restart payment-service to use it"
    ;;
  listen)
    log "forwarding Stripe test events to http://localhost:$port/webhooks/stripe"
    STRIPE_API_KEY="$key" exec "$stripe_bin" listen --events "$EVENTS" --forward-to "localhost:$port/webhooks/stripe"
    ;;
esac
