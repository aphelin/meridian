#!/bin/sh
# One-shot schema sync for the containerised stack (compose service `migrate`, image meridian/migrate:local).
# Same as scripts/bootstrap.sh: `prisma db push --skip-generate` per service, which creates the database
# and the service schema when missing and applies additive changes. It never resets data: no
# --force-reset and no --accept-data-loss, so a destructive schema change fails here and must be
# applied by hand. Afterwards init-schemas.sql (schemas + pg_trgm in public) runs, which is idempotent.
set -eu

ATTEMPTS="${MIGRATE_ATTEMPTS:-30}"

# service directory : env var holding its DATABASE_URL
SERVICES="identity-service:IDENTITY_DATABASE_URL
catalog-service:CATALOG_DATABASE_URL
inventory-service:INVENTORY_DATABASE_URL
checkout-service:CHECKOUT_DATABASE_URL
payment-service:PAYMENT_DATABASE_URL
notification-service:NOTIFICATION_DATABASE_URL
search-worker:SEARCH_DATABASE_URL
analytics-service:ANALYTICS_DATABASE_URL"

first_url=""
for entry in $SERVICES; do
  svc="${entry%%:*}"
  var="${entry#*:}"
  eval "url=\${$var:-}"
  if [ -z "$url" ]; then
    echo "migrate: $var is not set" >&2
    exit 1
  fi
  [ -n "$first_url" ] || first_url="$url"
  i=1
  echo "migrate: $svc (prisma db push)"
  until prisma db push --skip-generate --schema "/app/apps/$svc/prisma/schema"; do
    if [ "$i" -ge "$ATTEMPTS" ]; then
      echo "migrate: $svc failed after $ATTEMPTS attempts (destructive changes are never applied automatically)" >&2
      exit 1
    fi
    i=$((i + 1))
    sleep 2
  done
done

echo "migrate: init-schemas.sql (schemas, pg_trgm)"
prisma db execute --url "$first_url" --file /app/init-schemas.sql
echo "migrate: done"
