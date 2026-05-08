#!/usr/bin/env bash
# ============================================================================
#  Tundra e2e — production test runner
#
#  Commands:
#    up                  Build images + start stack, wait for healthy
#    down                Tear down stack and volumes
#    reset               POST /test/reset (reseed owner); stack must be up
#    test [--multi]      Run Playwright suite (stack must be up)
#    full [--multi]      up + test + down (full CI cycle)
#    logs [service]      Follow compose logs (tundrad by default)
#    status              Show container health
#
#  Environment (override via .env or shell):
#    TUNDRAD_URL         tundrad base URL        (default: http://localhost:7400)
#    E2E_BASE_URL        Panel URL for Playwright (default: http://localhost:5173)
#    TIMEOUT_SECS        Health-wait timeout      (default: 120)
#    PW_PROJECT          Playwright project       (default: chromium)
#    RUST_LOG            Log level for tundrad    (default: tundrad=info,...)
#
#  Author: Al Amin Ahamed  <github.com/mralaminahamed>
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$E2E_DIR/../../.." && pwd)"
PANEL_DIR="$REPO_ROOT/panel"

# Load .env if present
[[ -f "$E2E_DIR/.env" ]] && set -a && source "$E2E_DIR/.env" && set +a

TUNDRAD_URL="${TUNDRAD_URL:-http://localhost:7400}"
E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:5173}"
TIMEOUT_SECS="${TIMEOUT_SECS:-120}"
PW_PROJECT="${PW_PROJECT:-chromium}"
MULTI_SERVER="${MULTI_SERVER:-0}"

# ── helpers ──────────────────────────────────────────────────────────────────

log()  { echo "[e2e] $*"; }
err()  { echo "[e2e] ERROR: $*" >&2; exit 1; }

compose() {
  local args=()
  [[ "$MULTI_SERVER" == "1" ]] && args+=(--profile multi-server)
  docker compose -f "$E2E_DIR/docker-compose.yml" "${args[@]}" "$@"
}

wait_healthy() {
  log "Waiting for tundrad at $TUNDRAD_URL (timeout ${TIMEOUT_SECS}s)..."
  local deadline=$(( $(date +%s) + TIMEOUT_SECS ))
  until curl -fsS "$TUNDRAD_URL/api/v1/healthz" >/dev/null 2>&1; do
    if [[ $(date +%s) -ge $deadline ]]; then
      log "Tundrad logs (last 50 lines):"
      compose logs --tail=50 tundrad || true
      err "Timed out after ${TIMEOUT_SECS}s waiting for tundrad"
    fi
    sleep 2
  done
  log "tundrad is healthy"
}

reset_state() {
  local reseed="${1:-true}"
  log "Resetting state (reseed_owner=$reseed)..."
  curl -fsS -X POST "$TUNDRAD_URL/api/v1/test/reset" \
    -H "Content-Type: application/json" \
    -d "{\"reseed_owner\": $reseed}" >/dev/null
  log "State reset"
}

run_playwright() {
  log "Running Playwright suite (project=$PW_PROJECT)..."
  cd "$PANEL_DIR"

  local pw_args=(
    --project="$PW_PROJECT"
    --reporter=list,html
  )
  [[ "${CI:-}" == "true" ]] && pw_args+=(--reporter=github,html)

  E2E_BASE_URL="$E2E_BASE_URL" \
  TUNDRAD_URL="$TUNDRAD_URL" \
  pnpm playwright test "${pw_args[@]}"
}

# ── commands ─────────────────────────────────────────────────────────────────

cmd="${1:-help}"
shift || true

case "$cmd" in
  up)
    log "Building and starting e2e stack..."
    compose up -d --build
    wait_healthy
    reset_state true
    log "Stack ready. Panel: $E2E_BASE_URL  API: $TUNDRAD_URL"
    ;;

  down)
    log "Tearing down e2e stack..."
    compose down -v --remove-orphans
    log "Done"
    ;;

  reset)
    reset_state "${1:-true}"
    ;;

  test)
    [[ "$*" == *"--multi"* ]] && MULTI_SERVER=1
    run_playwright
    ;;

  full)
    [[ "$*" == *"--multi"* ]] && MULTI_SERVER=1
    EXIT_CODE=0

    log "=== full cycle: up → test → down ==="
    compose up -d --build
    wait_healthy
    reset_state true

    run_playwright || EXIT_CODE=$?

    compose down -v --remove-orphans
    log "=== full cycle complete (exit $EXIT_CODE) ==="
    exit $EXIT_CODE
    ;;

  logs)
    service="${1:-tundrad}"
    compose logs -f "$service"
    ;;

  status)
    compose ps
    ;;

  help|*)
    cat <<HELP
Usage: $0 <command> [options]

Commands:
  up              Build images, start stack, wait for healthy, seed owner
  down            Stop and remove containers + volumes
  reset [bool]    POST /test/reset (reseed_owner=true by default)
  test [--multi]  Run Playwright suite (stack must be running)
  full [--multi]  up → test → down (full CI cycle, returns Playwright exit code)
  logs [service]  Follow logs (default: tundrad)
  status          Show container health

Options:
  --multi         Also start agent-2 for @multi-server tests

Environment:
  TUNDRAD_URL     $TUNDRAD_URL
  E2E_BASE_URL    $E2E_BASE_URL
  TIMEOUT_SECS    $TIMEOUT_SECS
  PW_PROJECT      $PW_PROJECT
HELP
    ;;
esac
