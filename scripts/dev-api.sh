#!/usr/bin/env bash
# Builds the shared packages, then starts every backend service detached on its contract port.
#   logs : /tmp/meridian-logs/<service>.log     pids : /tmp/meridian-logs/pids/<service>.pid
# usage: scripts/dev-api.sh [--skip-build] [--no-wait] [service ...]
#   --skip-build  reuse existing dist output (packages and services)
#   --no-wait     do not wait for /health/ready
#   service ...   start only these (default: all eight)
# Stop with scripts/stop-api.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"

# name  port  (contract: .unlazy PLAN "Environment and ports")
SERVICES=(
  "identity-service 3001"
  "catalog-service 3012"
  "inventory-service 3003"
  "checkout-service 3004"
  "payment-service 3005"
  "notification-service 3006"
  "search-worker 3007"
  "analytics-service 3008"
)

skip_build=false
wait_ready=true
selected=()
while (($#)); do
  case "$1" in
    --skip-build) skip_build=true ;;
    --no-wait) wait_ready=false ;;
    -h | --help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    -*) die "unknown option $1" ;;
    *) selected+=("$1") ;;
  esac
  shift
done

require_cmd node npm curl setsid
load_env
mkdir -p "$LOG_DIR" "$PID_DIR"

wanted() {
  local name="$1" s
  ((${#selected[@]} == 0)) && return 0
  for s in "${selected[@]}"; do [[ "$s" == "$name" ]] && return 0; done
  return 1
}

for s in "${selected[@]}"; do
  known=false
  for entry in "${SERVICES[@]}"; do [[ "${entry%% *}" == "$s" ]] && known=true; done
  $known || die "unknown service '$s'"
done

if ! $skip_build; then
  # Services resolve workspace packages from dist at runtime; never start them on a stale kit.
  build_log="$LOG_DIR/build-packages.log"
  : >"$build_log"
  build_package() {
    log "building $1"
    npm run build -w "$1" >>"$build_log" 2>&1 || die "build of $1 failed, see $build_log"
  }
  # Order matters: kernel and nest-kit compile against contracts' dist.
  build_package @meridian/contracts
  build_package @meridian/kernel
  build_package @meridian/nest-kit
  for entry in "${SERVICES[@]}"; do
    read -r name _ <<<"$entry"
    wanted "$name" || continue
    log "building $name"
    npm run build -w "$name" >"$LOG_DIR/build-$name.log" 2>&1 || die "build of $name failed, see $LOG_DIR/build-$name.log"
  done
  bash "$ROOT/scripts/copy-prisma.sh"
fi

started=()
failed=()
for entry in "${SERVICES[@]}"; do
  read -r name port <<<"$entry"
  wanted "$name" || continue
  main="apps/$name/dist/main.js"
  if [[ ! -f "$ROOT/$main" ]]; then
    warn "$name: $main not found (build it first or drop --skip-build)"
    failed+=("$name")
    continue
  fi
  if pid="$(live_pid "$name")"; then
    log "$name already running (pid $pid)"
    started+=("$name $port")
    continue
  fi
  if port_in_use "$port"; then
    warn "$name: port $port is already in use by another process, not starting"
    failed+=("$name")
    continue
  fi
  PORT="$port" SERVICE_NAME="$name" start_detached "$name" "$ROOT/apps/$name" node "dist/main.js"
  started+=("$name $port")
done

if $wait_ready; then
  for entry in "${started[@]}"; do
    read -r name port <<<"$entry"
    if wait_http "http://localhost:$port/health/ready" "${SERVICE_READY_TIMEOUT_S:-90}"; then
      log "$name ready on :$port"
    else
      warn "$name not ready on :$port; last log lines:"
      tail -n 20 "$LOG_DIR/$name.log" >&2 || true
      failed+=("$name")
    fi
  done
fi

if ((${#failed[@]})); then
  die "services failed to start: ${failed[*]}"
fi
log "api started: ${#started[@]} service(s); stop with scripts/stop-api.sh"
