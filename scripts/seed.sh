#!/usr/bin/env bash
# Idempotent dev seed through the services' DevOnly POST /seed endpoints:
#   identity (admin user), catalog (products; publishes ProductPublished), checkout (coupons).
# Inventory stock is created by inventory-service's `inventory-catalog-sync` consumer group from
# ProductPublished. Fallback: if GET /stock is still empty after STOCK_WAIT_SECONDS, stock is
# seeded explicitly from the catalog snapshot, then /stock must become non-empty.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"
load_env
require_cmd curl node

IDENTITY_URL="${IDENTITY_URL:-http://localhost:3001}"
CATALOG_URL="${CATALOG_URL:-http://localhost:3012}"
INVENTORY_URL="${INVENTORY_URL:-http://localhost:3003}"
CHECKOUT_URL="${CHECKOUT_URL:-http://localhost:3004}"
READY_WAIT="${SEED_READY_WAIT_SECONDS:-60}"
STOCK_WAIT="${STOCK_WAIT_SECONDS:-45}"
ON_HAND="${DEFAULT_STOCK_ON_HAND:-8}"

for url in "$IDENTITY_URL" "$CATALOG_URL" "$INVENTORY_URL" "$CHECKOUT_URL"; do
  wait_http "$url/health/ready" "$READY_WAIT" || die "seed: $url is not ready"
done

post() {
  local url="$1" body="${2:-"{}"}" code
  code="$(curl -sS -m 60 -o "$LOG_DIR/seed-response.json" -w '%{http_code}' -X POST \
    -H 'content-type: application/json' --data "$body" "$url")" || die "seed: POST $url failed to connect"
  [[ "$code" =~ ^2 ]] || die "seed: POST $url answered $code: $(head -c 500 "$LOG_DIR/seed-response.json")"
  log "seeded $url ($code)"
}

mkdir -p "$LOG_DIR"
post "$IDENTITY_URL/seed"
post "$CATALOG_URL/seed"
post "$CHECKOUT_URL/seed"

stock_count() {
  curl -fsS -m 10 "$INVENTORY_URL/stock" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{try{const v=JSON.parse(s);process.stdout.write(String(Array.isArray(v)?v.length:0))}catch{process.stdout.write("0")}})'
}

wait_stock() {
  local seconds="$1" deadline=$((SECONDS + $1)) count
  while ((SECONDS < deadline)); do
    count="$(stock_count || true)"
    if [[ "$count" =~ ^[0-9]+$ ]] && ((count > 0)); then
      printf '%s' "$count"
      return 0
    fi
    sleep 2
  done
  return 1
}

log "waiting up to ${STOCK_WAIT}s for inventory-catalog-sync to create stock"
if count="$(wait_stock "$STOCK_WAIT")"; then
  log "inventory has $count SKU(s) from the catalog sync consumer"
else
  warn "GET $INVENTORY_URL/stock still empty; seeding stock explicitly from the catalog snapshot"
  payload="$(curl -fsS -m 20 "$CATALOG_URL/catalog/snapshot" | ON_HAND="$ON_HAND" node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const { products = [] } = JSON.parse(s);
      const onHand = Number(process.env.ON_HAND);
      const skus = products.flatMap((p) => p.variants.map((v) => ({ sku: v.sku, onHand: p.soldOut ? 0 : onHand })));
      if (!skus.length) { console.error("catalog snapshot has no SKUs"); process.exit(1); }
      process.stdout.write(JSON.stringify({ skus }));
    });
  ')" || die "seed: could not read SKUs from $CATALOG_URL/catalog/snapshot"
  post "$INVENTORY_URL/seed" "$payload"
  count="$(wait_stock 20)" || die "seed: $INVENTORY_URL/stock is still empty after the explicit stock seed"
  log "inventory has $count SKU(s) after the explicit stock seed"
fi

log "seed ok: admin ${ADMIN_EMAIL:-admin@meridian.local}"
