#!/usr/bin/env bash
# The whole CI pipeline, locally and in GitHub Actions:
#   [npm ci] -> typecheck -> test:unit -> compose core up + init jobs -> prisma db push
#   -> build packages and services -> start services -> seed -> test:int
#   -> storefront build + start -> test:e2e -> graceful stop (must not need SIGKILL)
# A teardown trap always stops the processes this run started.
# usage: scripts/ci-local.sh [--npm-ci] [--playwright-install] [--recreate] [--down]
#   --npm-ci              run `npm ci` first
#   --playwright-install  install Playwright chromium (with system deps when running as CI)
#   --recreate            let compose recreate core containers whose definition changed
#   --down                `docker compose down` the core profile at the end (volumes are kept)
# Needs ports 3001, 3003-3008, 3012 and 3100 free: stop a running dev stack first.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"

npm_ci=false pw_install=false recreate=false down=false
while (($#)); do
  case "$1" in
    --npm-ci) npm_ci=true ;;
    --playwright-install) pw_install=true ;;
    --recreate) recreate=true ;;
    --down) down=true ;;
    -h | --help)
      sed -n '2,13p' "$0"
      exit 0
      ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

require_cmd node npm docker curl setsid
STORE_PORT="${STORE_PORT:-3100}"
PORTS=(3001 3012 3003 3004 3005 3006 3007 3008 "$STORE_PORT")
STARTED_NAMES=(identity-service catalog-service inventory-service checkout-service payment-service notification-service search-worker analytics-service storefront)

stage_started=0
stage() {
  local now=$SECONDS
  ((stage_started)) && log "stage done in $((now - stage_started))s"
  stage_started=$now
  printf '\n==== %s ====\n' "$*"
}

# Only processes started by this run are stopped on exit; a dev stack that made the port
# preflight fail is never touched.
owns_processes=false
stopped=false
teardown() {
  local status=$?
  set +e
  if $owns_processes && ! $stopped; then
    if ((status != 0)); then
      printf '\n==== failure: last service log lines ====\n'
      for name in "${STARTED_NAMES[@]}"; do
        [[ -f "$LOG_DIR/$name.log" ]] || continue
        printf -- '--- %s ---\n' "$name"
        tail -n 40 "$LOG_DIR/$name.log"
      done
    fi
    bash scripts/stop-api.sh "${STARTED_NAMES[@]}" >/dev/null 2>&1
  fi
  if $down; then
    "${COMPOSE[@]}" down --remove-orphans
  fi
  if ((status == 0)); then log "ci-local passed in ${SECONDS}s"; else warn "ci-local failed (exit $status) after ${SECONDS}s"; fi
  exit "$status"
}
trap teardown EXIT
trap 'exit 130' INT TERM

busy=()
for port in "${PORTS[@]}"; do
  port_in_use "$port" && busy+=("$port")
done
((${#busy[@]} == 0)) || die "ports already in use: ${busy[*]} (stop the dev stack: npm run stop:api)"
owns_processes=true

if $npm_ci; then
  stage "npm ci"
  npm ci --no-audit --no-fund
fi

stage "environment"
# CI-speed resilience settings (kept only when the caller has not set them): short Rabbit retry tiers so the e2e
# dead-letter flow finishes inside its test timeout, and a generous Turnstile timeout for the real Cloudflare call.
: "${RABBIT_RETRY_DELAYS_MS:=1000,2000,4000}"
: "${CAPTCHA_TIMEOUT_MS:=8000}"
export RABBIT_RETRY_DELAYS_MS CAPTCHA_TIMEOUT_MS
node scripts/sync-env.mjs
load_env

stage "typecheck"
npm run typecheck

stage "unit tests (test:unit)"
npm run test:unit

stage "infrastructure (compose core + init jobs)"
if $recreate; then infra_up --recreate; else infra_up; fi
infra_wait "${INFRA_WAIT_SECONDS:-300}"
infra_init

stage "databases (bootstrap: prisma generate + db push)"
bash scripts/bootstrap.sh --skip-infra --skip-build --strict

stage "build packages and services"
npm run build:packages
npm run build:services
bash scripts/copy-prisma.sh

stage "start services"
bash scripts/dev-api.sh --skip-build

stage "seed"
bash scripts/seed.sh

stage "integration tests (test:int)"
npm run test:int

stage "storefront build and start"
# .env sets NODE_ENV=development for the services; a Next production build and start must run as production.
NODE_ENV=production npm run build -w storefront
NODE_ENV=production PORT="$STORE_PORT" start_detached storefront "$ROOT/apps/storefront" npx --no-install next start --port "$STORE_PORT"
wait_http "http://localhost:$STORE_PORT/" "${STORE_READY_TIMEOUT_S:-120}" || die "storefront did not start"

stage "e2e tests (test:e2e)"
if $pw_install; then
  if [[ -n "${CI:-}" ]]; then
    npm exec -w storefront -- playwright install --with-deps chromium
  else
    npm exec -w storefront -- playwright install chromium
  fi
fi
# e2e helpers sign in as the seeded admin (ADMIN_EMAIL/ADMIN_PASSWORD from .env).
STACK_ADMIN_EMAIL="${STACK_ADMIN_EMAIL:-$ADMIN_EMAIL}" STACK_ADMIN_PASSWORD="${STACK_ADMIN_PASSWORD:-$ADMIN_PASSWORD}" \
  STORE_URL="http://localhost:$STORE_PORT" STORE_PORT="$STORE_PORT" npm run test:e2e

stage "graceful shutdown"
stopped=true
bash scripts/stop-api.sh "${STARTED_NAMES[@]}" || die "graceful shutdown failed (a process needed SIGKILL)"
