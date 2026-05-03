#!/usr/bin/env bash
# ============================================================================
#  Tundra e2e compose — test-runner helpers
#
#  Usage:
#    scripts/wait-ready.sh        # block until tundrad is ready, exit 0
#    scripts/reset-state.sh       # POST /test/reset, exit 0 on success
#    scripts/full-cycle.sh up     # bring up stack, wait, reset
#    scripts/full-cycle.sh down   # tear down with -v
#  Author: Al Amin Ahamed  <github.com/mralaminahamed>
# ============================================================================
set -euo pipefail

readonly TUNDRAD_URL="${TUNDRAD_URL:-http://localhost:7400}"
readonly TIMEOUT_SECS="${TIMEOUT_SECS:-90}"

cmd="${1:-help}"

case "$cmd" in
    wait-ready)
        echo "Waiting for tundrad at $TUNDRAD_URL..."
        deadline=$(( $(date +%s) + TIMEOUT_SECS ))
        until curl -fsS "$TUNDRAD_URL/api/v1/healthz" >/dev/null 2>&1; do
            if [[ $(date +%s) -ge $deadline ]]; then
                echo "TIMEOUT after ${TIMEOUT_SECS}s waiting for tundrad" >&2
                exit 1
            fi
            sleep 1
        done
        echo "✓ tundrad ready"
        ;;

    reset-state)
        echo "Resetting tundrad state via /test/reset..."
        curl -fsS -X POST "$TUNDRAD_URL/test/reset" \
            -H "Content-Type: application/json" \
            -d '{"reseed_owner": true}' \
            >/dev/null
        echo "✓ state reset"
        ;;

    full-cycle)
        sub="${2:-}"
        case "$sub" in
            up)
                docker compose up -d --build
                "$0" wait-ready
                "$0" reset-state
                ;;
            down)
                docker compose down -v
                ;;
            *)
                echo "Usage: $0 full-cycle {up|down}" >&2
                exit 2
                ;;
        esac
        ;;

    help|*)
        cat <<HELP
Tundra e2e helpers

Commands:
  wait-ready                 Block until tundrad health endpoint returns 200.
                             Honours TUNDRAD_URL (default http://localhost:7400)
                             and TIMEOUT_SECS (default 90).

  reset-state                POST /test/reset to truncate state and reseed
                             the deterministic Owner.

  full-cycle up|down         Bring the compose stack up (build, wait, reset)
                             or tear it down with volumes.
HELP
        ;;
esac
