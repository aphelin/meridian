# shellcheck shell=bash
# Shared helpers for scripts/*.sh. Source it; it does not change shell options of the caller.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --profile core)
LOG_DIR="${MERIDIAN_LOG_DIR:-/tmp/meridian-logs}"
PID_DIR="$LOG_DIR/pids"
INFRA_SERVICES=(postgres redis rabbitmq kafka s3 mailhog jaeger)
INIT_JOBS=(postgres-init kafka-init)

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '[%s] warning: %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() {
  printf '[%s] error: %s\n' "$(date +%H:%M:%S)" "$*" >&2
  exit 1
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not installed"
  done
}

# Exports KEY=VALUE lines from an env file without evaluating them as shell code (values may
# contain &, ?, spaces or $). Variables already set in the environment win, so callers and CI
# can override single values. Surrounding single or double quotes are stripped.
load_env() {
  local file="${1:-$ROOT/.env}" line key value
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    if [[ -z "${!key+x}" ]]; then
      export "$key=$value"
    fi
  done <"$file"
}

# Milliseconds from an env var with a default, validated as a non-negative integer.
env_ms() {
  local name="$1" default="$2" value
  value="${!name:-$default}"
  [[ "$value" =~ ^[0-9]+$ ]] || die "$name must be an integer number of milliseconds"
  printf '%s' "$value"
}

port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# Polls a URL until it answers 2xx or the timeout (seconds) elapses.
wait_http() {
  local url="$1" timeout="${2:-60}" deadline=$((SECONDS + ${2:-60}))
  while ((SECONDS < deadline)); do
    if curl -fsS -m 3 -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  warn "$url did not answer within ${timeout}s"
  return 1
}

# ---- process management (dev-api.sh, ci-local.sh, stop-api.sh) ------------------------------

pid_file() { printf '%s/%s.pid' "$PID_DIR" "$1"; }

# Start time of a process; recorded next to the pid so a reused pid is never mistaken for ours.
proc_signature() { ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' || true; }

# True while any non-zombie process remains in the process group led by $1.
group_alive() {
  local pgid="$1"
  ps -e -o pgid=,stat= 2>/dev/null | awk -v g="$pgid" '$1 == g && $2 !~ /^Z/ { found = 1 } END { exit !found }'
}

# Prints the recorded pid of <name> when its process group is still ours and alive.
# Pid file format: line 1 pid, line 2 start-time signature of the group leader.
live_pid() {
  local pidf pid="" sig="" now
  pidf="$(pid_file "$1")"
  [[ -f "$pidf" ]] || return 1
  { read -r pid || true; read -r sig || true; } <"$pidf"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  group_alive "$pid" || return 1
  now="$(proc_signature "$pid")"
  # Leader still present with another start time: the pid was reused by an unrelated process.
  if [[ -n "$sig" && -n "$now" && "$now" != "$sig" ]]; then
    return 1
  fi
  printf '%s' "$pid"
}

# start_detached <name> <workdir> <command...>
# Runs the command in its own session/process group (so stop-api.sh can signal the whole tree),
# logs to $LOG_DIR/<name>.log and writes the leader pid to $PID_DIR/<name>.pid.
# Per-process env (PORT, SERVICE_NAME, ...) can be given as assignments before the call.
start_detached() {
  local name="$1" workdir="$2" pid
  shift 2
  mkdir -p "$LOG_DIR" "$PID_DIR"
  if pid="$(live_pid "$name")"; then
    log "$name already running (pid $pid), leaving it alone"
    return 0
  fi
  (
    cd "$workdir"
    exec setsid "$@"
  ) >"$LOG_DIR/$name.log" 2>&1 </dev/null &
  pid=$!
  printf '%s\n%s\n' "$pid" "$(proc_signature "$pid")" >"$(pid_file "$name")"
  log "$name started (pid $pid), log $LOG_DIR/$name.log"
}

# ---- infrastructure (bootstrap.sh, ci-local.sh) ----------------------------------------------

# infra_up [--recreate]: start the core profile backing services. Without --recreate, existing
# containers are kept as they are (safe while other processes use them).
infra_up() {
  local mode=(--no-recreate)
  [[ "${1:-}" == "--recreate" ]] && mode=()
  log "starting compose core services: ${INFRA_SERVICES[*]}"
  "${COMPOSE[@]}" up -d "${mode[@]}" "${INFRA_SERVICES[@]}"
}

# Waits until every core service is healthy. Containers created before healthchecks existed
# report no health status; they count as started and the init jobs verify reachability.
infra_wait() {
  local timeout="${1:-240}" deadline=$((SECONDS + ${1:-240})) svc cid status pending
  while :; do
    pending=()
    for svc in "${INFRA_SERVICES[@]}"; do
      cid="$("${COMPOSE[@]}" ps -q "$svc" 2>/dev/null || true)"
      if [[ -z "$cid" ]]; then
        pending+=("$svc:missing")
        continue
      fi
      status="$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown/unknown)"
      case "$status" in
        running/healthy | running/none) ;;
        *) pending+=("$svc:$status") ;;
      esac
    done
    if ((${#pending[@]} == 0)); then
      log "core services ready"
      return 0
    fi
    if ((SECONDS >= deadline)); then
      warn "core services not ready after ${timeout}s: ${pending[*]}"
      return 1
    fi
    sleep 3
  done
}

# Runs each one-shot init job attached (exit code propagates, no race with fast jobs) and removes
# its container. --no-deps keeps compose from touching the backing services.
infra_init() {
  local job
  for job in "${INIT_JOBS[@]}"; do
    log "running $job"
    "${COMPOSE[@]}" run --rm --no-deps -T "$job" || die "$job failed"
  done
}
