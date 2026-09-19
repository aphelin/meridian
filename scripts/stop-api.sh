#!/usr/bin/env bash
# Gracefully stops processes started by dev-api.sh / ci-local.sh (pid files in /tmp/meridian-logs/pids).
# Sends SIGTERM to each process group, waits up to SHUTDOWN_TIMEOUT_MS (default 30000) plus a
# small margin for the in-process shutdown sequence, reports every exit, and SIGKILLs only stragglers.
# usage: scripts/stop-api.sh [name ...]   (default: every pid file)
# exit: 0 all exited gracefully, 2 at least one process had to be killed
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
cd "$ROOT"
load_env

timeout_ms="$(env_ms SHUTDOWN_TIMEOUT_MS 30000)"
margin_ms="$(env_ms STOP_MARGIN_MS 5000)"
deadline_ms=$((timeout_ms + margin_ms))

names=("$@")
if ((${#names[@]} == 0)) && [[ -d "$PID_DIR" ]]; then
  for f in "$PID_DIR"/*.pid; do
    [[ -e "$f" ]] || continue
    names+=("$(basename "$f" .pid)")
  done
fi
if ((${#names[@]} == 0)); then
  log "nothing to stop (no pid files in $PID_DIR)"
  exit 0
fi

declare -A pids=()
for name in "${names[@]}"; do
  pidf="$(pid_file "$name")"
  if [[ ! -f "$pidf" ]]; then
    warn "$name: no pid file"
    continue
  fi
  if ! pid="$(live_pid "$name")"; then
    log "$name: not running"
    rm -f "$pidf"
    continue
  fi
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  pids["$name"]="$pid"
  log "$name: SIGTERM sent (pid $pid)"
done

start_s=$(date +%s%N)
killed=0
while ((${#pids[@]})); do
  elapsed_ms=$((($(date +%s%N) - start_s) / 1000000))
  for name in "${!pids[@]}"; do
    pid="${pids[$name]}"
    if ! group_alive "$pid"; then
      log "$name: exited gracefully after ${elapsed_ms}ms"
      rm -f "$(pid_file "$name")"
      unset 'pids[$name]'
    fi
  done
  ((${#pids[@]})) || break
  if ((elapsed_ms >= deadline_ms)); then
    for name in "${!pids[@]}"; do
      pid="${pids[$name]}"
      warn "$name: still running after ${deadline_ms}ms, sending SIGKILL (pid $pid)"
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
      rm -f "$(pid_file "$name")"
      killed=$((killed + 1))
    done
    break
  fi
  sleep 0.25
done

if ((killed)); then
  warn "$killed process(es) did not shut down gracefully"
  exit 2
fi
log "all stopped"
