#!/usr/bin/env bash
# installer/test.sh — Build the Ubuntu installer-test image, inject stub/real
# binaries, run install.sh inside the container, and verify the result.
#
# Usage:
#   ./installer/test.sh                 # stubs only (fast, no Rust build)
#   ./installer/test.sh --real-bins     # build Rust debug binaries first
#   ./installer/test.sh --shell         # open a shell after the test
#
# Requires: docker, docker compose v2

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker/docker-compose.installer-test.yml"
CONTAINER_NAME="tundra-installer-test"

USE_REAL_BINS=false
OPEN_SHELL=false

for arg in "$@"; do
    case "${arg}" in
        --real-bins) USE_REAL_BINS=true ;;
        --shell)     OPEN_SHELL=true ;;
        --help|-h)
            echo "Usage: $0 [--real-bins] [--shell]"
            echo "  --real-bins  Build actual Rust debug binaries (cargo build)"
            echo "  --shell      Open a shell in the container after install"
            exit 0 ;;
        *) echo "Unknown option: ${arg}"; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
ok()   { echo -e "\033[1;32m  ✓ $*\033[0m"; }
fail() { echo -e "\033[1;31m  ✗ $*\033[0m"; exit 1; }
step() { echo -e "\033[1;34m==> $*\033[0m"; }

# ---------------------------------------------------------------------------
# Step 1: Prepare binaries
# ---------------------------------------------------------------------------
step "Preparing binaries"

BINS_DIR="$(mktemp -d)"
trap 'rm -rf "${BINS_DIR}"' EXIT

if [[ "${USE_REAL_BINS}" == "true" ]]; then
    echo "  Building Rust debug binaries (cargo build)..."
    cargo build --workspace --bins 2>&1 | tail -3
    for bin in tundrad tundra tundra-agent; do
        cp "${REPO_ROOT}/target/debug/${bin}" "${BINS_DIR}/"
    done
    # Stub out the optional binaries if not built
    for bin in tundra-self-backup tundra-restore; do
        if [[ ! -f "${REPO_ROOT}/target/debug/${bin}" ]]; then
            printf '#!/bin/sh\necho "%s stub v0.0.0-test"\n' "${bin}" > "${BINS_DIR}/${bin}"
            chmod +x "${BINS_DIR}/${bin}"
        else
            cp "${REPO_ROOT}/target/debug/${bin}" "${BINS_DIR}/"
        fi
    done
    ok "Real debug binaries ready"
else
    # Generate minimal shell stubs. They respond to --version and subcommands
    # just enough for the installer to proceed without crashing.
    for bin in tundrad tundra tundra-agent tundra-self-backup tundra-restore; do
        cat > "${BINS_DIR}/${bin}" <<'STUB'
#!/bin/bash
# Stub binary for installer testing
CMD="${1:-}"
case "${CMD}" in
    --version|version)
        echo "0.0.0-test"
        ;;
    serve)
        # Pretend to be a long-running daemon; systemd will manage it
        echo "${0##*/} serve: stub — sleeping forever"
        exec sleep infinity
        ;;
    migrate)
        echo "${0##*/} migrate: stub — no-op"
        ;;
    master-key|init-master-key)
        echo "${0##*/} master-key: stub — no-op"
        ;;
    setup)
        shift
        case "${1:-}" in
            print-link|wizard-url) echo "http://$(hostname -f):7400/setup" ;;
            *) echo "${0##*/} setup ${*}: stub" ;;
        esac
        ;;
    *)
        echo "${0##*/} ${CMD:-}: stub"
        ;;
esac
STUB
        chmod +x "${BINS_DIR}/${bin}"
    done
    ok "Stub binaries ready (use --real-bins for actual Rust binaries)"
fi

# ---------------------------------------------------------------------------
# Step 2: Build the Docker image
# ---------------------------------------------------------------------------
step "Building Docker image"
docker compose -f "${COMPOSE_FILE}" build --quiet
ok "Image built: tundra-installer-test:latest"

# ---------------------------------------------------------------------------
# Step 3: Start the container (systemd init)
# ---------------------------------------------------------------------------
step "Starting container"
docker compose -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true
docker compose -f "${COMPOSE_FILE}" up -d

# Wait for systemd to be ready
echo "  Waiting for systemd..."
for i in $(seq 1 20); do
    if docker exec "${CONTAINER_NAME}" \
            systemctl is-system-running 2>/dev/null \
            | grep -qE "running|degraded"; then
        break
    fi
    sleep 1
done
ok "Container running with systemd"

# ---------------------------------------------------------------------------
# Step 4: Inject binaries into the named volume
# ---------------------------------------------------------------------------
step "Injecting binaries into container"
for bin in tundrad tundra tundra-agent tundra-self-backup tundra-restore; do
    if [[ -f "${BINS_DIR}/${bin}" ]]; then
        docker cp "${BINS_DIR}/${bin}" "${CONTAINER_NAME}:/tundra-bins/${bin}"
    fi
done
docker exec "${CONTAINER_NAME}" chmod +x /tundra-bins/* 2>/dev/null || true
ok "Binaries injected"

# ---------------------------------------------------------------------------
# Step 5: Run the installer
# ---------------------------------------------------------------------------
step "Running install.sh inside the container"
docker exec \
    -e TUNDRA_BINARIES_DIR=/tundra-bins \
    -e TUNDRA_VERSION=0.0.0-test \
    "${CONTAINER_NAME}" \
    bash /installer/install.sh 2>&1 | tee /tmp/tundra-install-test.log

INSTALL_EXIT=${PIPESTATUS[0]}
if [[ "${INSTALL_EXIT}" -ne 0 ]]; then
    fail "install.sh exited with code ${INSTALL_EXIT}"
fi
ok "install.sh completed without errors"

# ---------------------------------------------------------------------------
# Step 6: Verify installation
# ---------------------------------------------------------------------------
step "Verifying installation"

# Helper: run a command inside the container
cx() { docker exec "${CONTAINER_NAME}" "$@"; }
cx_pg() { docker exec "${CONTAINER_NAME}" sudo -u tundra psql -d tundra -tAc "$1"; }

# --- Binaries installed ---
for bin in tundrad tundra tundra-agent; do
    cx test -x "/usr/local/bin/${bin}" \
        && ok "Binary present: ${bin}" \
        || fail "Binary missing: ${bin}"
done

# --- Config files ---
for f in /etc/tundra/tundrad.toml /etc/tundra/tundrad.env /etc/tundra/agent.toml; do
    cx test -f "${f}" \
        && ok "Config present: ${f}" \
        || fail "Config missing: ${f}"
done

# --- systemd units enabled ---
for svc in tundrad tundra-agent; do
    cx systemctl is-enabled "${svc}" 2>/dev/null | grep -q enabled \
        && ok "Service enabled: ${svc}" \
        || fail "Service not enabled: ${svc}"
done

# --- PostgreSQL database ---
cx sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='tundra'" \
    | grep -q 1 \
    && ok "PostgreSQL database 'tundra' exists" \
    || fail "PostgreSQL database 'tundra' missing"

# --- uuidv7 function ---
cx_pg "SELECT uuidv7()::text" | grep -qE '^[0-9a-f-]{36}$' \
    && ok "uuidv7() function works" \
    || fail "uuidv7() function missing or broken"

# --- Migrations ran (check for operators table from first migration) ---
cx_pg "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='operators'" \
    | grep -q 1 \
    && ok "Migrations applied (operators table exists)" \
    || fail "Migrations did not run (operators table missing)"

# --- Local server registered ---
SERVER_COUNT="$(cx_pg "SELECT COUNT(*) FROM servers" 2>/dev/null || echo 0)"
[[ "${SERVER_COUNT}" -ge 1 ]] \
    && ok "Local server registered (${SERVER_COUNT} server row(s))" \
    || fail "No server rows in DB — self-registration failed"

SERVER_STATUS="$(cx_pg "SELECT status FROM servers LIMIT 1" 2>/dev/null || echo unknown)"
[[ "${SERVER_STATUS}" == "active" ]] \
    && ok "Server status: active" \
    || fail "Server status: ${SERVER_STATUS} (expected: active)"

# --- Master key ---
cx test -f "/var/lib/tundra/data/master.key" \
    && ok "Master key present" \
    || fail "Master key missing"

# --- Directory tree ---
for dir in /var/lib/tundra/data /var/lib/tundra/logs /var/lib/tundra/artifacts \
           /var/lib/tundra/plugins /etc/tundra /var/run/tundra; do
    cx test -d "${dir}" \
        && ok "Directory exists: ${dir}" \
        || fail "Directory missing: ${dir}"
done

# ---------------------------------------------------------------------------
# Step 7: Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "\033[1;32m============================================================\033[0m"
echo -e "\033[1;32m  All installer checks passed!\033[0m"
echo -e "\033[1;32m============================================================\033[0m"
echo ""
echo "  Install log: /tmp/tundra-install-test.log"
echo "  Container:   ${CONTAINER_NAME}"
echo ""

if [[ "${OPEN_SHELL}" == "true" ]]; then
    step "Opening shell in test container (type 'exit' to quit)"
    docker exec -it "${CONTAINER_NAME}" bash
fi

step "Cleaning up"
docker compose -f "${COMPOSE_FILE}" down --remove-orphans
ok "Done"
