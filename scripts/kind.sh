#!/usr/bin/env bash
# Creates (once) a kind cluster named meridian, loads the local images into it and installs the Helm chart
# into namespace meridian. Images are <image.repository>/<service>:<image.tag> (default meridian/<service>:local),
# built by `npm run docker:build` (infra/docker/Dockerfile.service and Dockerfile.storefront).
# usage: scripts/kind.sh [--build] [--skip-load] [extra helm args, e.g. -f my-values.yaml --set secrets.JWT_SECRET=...]
#   --build      build every image first (docker compose --profile apps build, in parallel)
#   --skip-load  do not `kind load docker-image` (images already in the cluster or pulled from a registry)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_cmd kind helm kubectl docker

IMAGES=(
  identity-service catalog-service inventory-service checkout-service payment-service
  notification-service search-worker analytics-service storefront migrate
)
TAG="${IMAGE_TAG:-local}"

build=false
load=true
helm_args=()
while (($#)); do
  case "$1" in
    --build) build=true ;;
    --skip-load) load=false ;;
    -h | --help)
      sed -n '2,7p' "$0"
      exit 0
      ;;
    *) helm_args+=("$1") ;;
  esac
  shift
done

if $build; then
  log "building images (parallel)"
  docker compose -f "$COMPOSE_FILE" --profile core --profile apps build
fi

CLUSTER="${KIND_CLUSTER:-meridian}"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  log "kind cluster $CLUSTER already exists"
else
  kind create cluster --name "$CLUSTER"
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

if $load; then
  refs=()
  for name in "${IMAGES[@]}"; do
    ref="meridian/$name:$TAG"
    docker image inspect "$ref" >/dev/null 2>&1 || die "image $ref not found; run with --build or npm run docker:build"
    refs+=("$ref")
  done
  log "loading ${#refs[@]} images into kind cluster $CLUSTER"
  kind load docker-image --name "$CLUSTER" "${refs[@]}"
fi

helm upgrade --install meridian "$ROOT/infra/k8s/helm/meridian" --namespace meridian --create-namespace \
  --set image.tag="$TAG" ${helm_args[@]+"${helm_args[@]}"}
log "kind chart applied; watch with: kubectl -n meridian get pods -w"
log "schemas: run meridian/migrate:$TAG once against the cluster database (see README, Docker section)"
