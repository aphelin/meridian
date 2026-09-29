#!/usr/bin/env bash
# One-time (and re-runnable) local setup:
#   compose core up -> wait healthy/ready -> init jobs (schemas, buckets, topics) -> sync .env
#   -> prisma generate + db push for all eight databases -> build shared packages -> next steps.
# usage: scripts/bootstrap.sh [--recreate] [--skip-infra] [--skip-build] [--strict] [--seed]
#   --recreate    let compose recreate core containers whose definition changed (e.g. new healthchecks)
#   --skip-infra  assume compose services and init jobs are already done
#   --skip-build  do not build @meridian/contracts, kernel and nest-kit
#   --strict      fail (instead of warn) when a service has no Prisma schema
#   --seed        run scripts/seed.sh at the end (services must be running)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"

recreate=false skip_infra=false skip_build=false strict=false seed=false
while (($#)); do
  case "$1" in
    --recreate) recreate=true ;;
    --skip-infra) skip_infra=true ;;
    --skip-build) skip_build=true ;;
    --strict) strict=true ;;
    --seed) seed=true ;;
    -h | --help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

require_cmd node npm
node scripts/sync-env.mjs
load_env

if ! $skip_infra; then
  require_cmd docker
  if $recreate; then infra_up --recreate; else infra_up; fi
  infra_wait "${INFRA_WAIT_SECONDS:-240}" || die "core services are not ready; inspect with: docker compose -f infra/docker/compose.yml --profile core ps"
  infra_init
fi

# service workspace -> database env var (schema)
DATABASES=(
  "identity-service IDENTITY_DATABASE_URL"
  "catalog-service CATALOG_DATABASE_URL"
  "inventory-service INVENTORY_DATABASE_URL"
  "checkout-service CHECKOUT_DATABASE_URL"
  "payment-service PAYMENT_DATABASE_URL"
  "notification-service NOTIFICATION_DATABASE_URL"
  "search-worker SEARCH_DATABASE_URL"
  "analytics-service ANALYTICS_DATABASE_URL"
)

mkdir -p "$LOG_DIR"
missing=()
for entry in "${DATABASES[@]}"; do
  read -r svc var <<<"$entry"
  if [[ ! -d "apps/$svc/prisma/schema" && ! -f "apps/$svc/prisma/schema.prisma" ]]; then
    missing+=("$svc")
    continue
  fi
  [[ -n "${!var:-}" ]] || die "$var is empty; set it in .env"
  prisma_log="$LOG_DIR/prisma-$svc.log"
  log "$svc: prisma generate"
  npm run prisma:generate -w "$svc" >"$prisma_log" 2>&1 || die "$svc: prisma generate failed, see $prisma_log"
  log "$svc: prisma db push"
  npm run prisma:push -w "$svc" >>"$prisma_log" 2>&1 ||
    die "$svc: prisma db push failed, see $prisma_log (destructive changes need a manual 'npx prisma db push --accept-data-loss' in apps/$svc)"
done
if ((${#missing[@]})); then
  if $strict; then
    die "no Prisma schema for: ${missing[*]}"
  fi
  warn "no Prisma schema yet (skipped): ${missing[*]}"
fi

if ! $skip_build; then
  log "building shared packages (contracts, kernel, nest-kit)"
  npm run build:packages >"$LOG_DIR/build-packages.log" 2>&1 || die "package build failed, see $LOG_DIR/build-packages.log"
fi

if $seed; then
  bash scripts/seed.sh
fi

cat <<'NEXT'

Bootstrap complete. Next steps:
  npm run dev:api        build and start the eight services (logs in /tmp/meridian-logs)
  npm run seed           seed admin user, catalog, coupons (stock follows via Kafka)
  npm run dev:store      storefront on http://localhost:3100
  npm run stop:api       graceful shutdown of the services
UIs: RabbitMQ http://localhost:15672  Mailhog http://localhost:8025  S3 (SeaweedFS) http://localhost:9000
     Jaeger http://localhost:16686   Kafka UI (optional): docker compose -f infra/docker/compose.yml --profile tools up -d kafka-ui
NEXT
