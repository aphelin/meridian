#!/usr/bin/env bash
# Safety net: service builds already place the Prisma client at dist/generated/prisma (contract revision 1c).
# This copies src/generated/prisma there only when a build left it out. Run after service builds.
# usage: scripts/copy-prisma.sh [service ...]   (default: every service with a database)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

services=("$@")
if ((${#services[@]} == 0)); then
  services=(identity-service catalog-service inventory-service checkout-service payment-service notification-service search-worker analytics-service)
fi

for svc in "${services[@]}"; do
  src="$ROOT/apps/$svc/src/generated/prisma"
  dist="$ROOT/apps/$svc/dist"
  if [[ ! -d "$src" ]]; then
    warn "$svc: no generated Prisma client in src/generated/prisma (run prisma:generate), skipped"
    continue
  fi
  if [[ ! -d "$dist" ]]; then
    continue
  fi
  dest="$dist/generated/prisma"
  [[ -d "$dest" ]] && continue
  mkdir -p "$(dirname "$dest")"
  cp -a "$src" "$dest"
done
