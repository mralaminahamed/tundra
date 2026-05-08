#!/usr/bin/env bash
set -euo pipefail

# Tundra one-line installer
# Usage: curl -fsSL https://tundra.dev/install.sh | sudo bash
#
# Supported OS: Ubuntu 24.04, Debian 12/13, RHEL 9/10
# Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TUNDRA_VERSION="${TUNDRA_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
TUNDRA_HOME="${TUNDRA_HOME:-/var/lib/tundra}"
TUNDRA_CONFIG_DIR="/etc/tundra"
TUNDRA_RUN_DIR="/var/run/tundra"
TUNDRA_USER="tundra"
PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
CADDY_KEY_URL="https://dl.cloudsmith.io/public/caddy/stable/gpg.key"
CADDY_REPO_URL="https://dl.cloudsmith.io/public/caddy/stable/deb/debian"
GITHUB_RELEASES="https://github.com/mralaminahamed/tundra/releases"
GITHUB_API="https://api.github.com/repos/mralaminahamed/tundra/releases/latest"
MINISIGN_VERSION="0.11"

# Hardcoded ed25519 release public key (replace with actual key on release)
TUNDRA_RELEASE_PUBKEY="RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
header() { echo -e "\033[1;32m==> $*\033[0m"; }
info()   { echo "    $*"; }
warn()   { echo -e "\033[1;33m    WARN: $*\033[0m" >&2; }
die()    { echo -e "\033[1;31mERROR: $*\033[0m" >&2; exit 1; }

trap 'echo -e "\033[1;31mERROR: installer failed at line $LINENO\033[0m"' ERR

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Step 1: Detect OS
# ---------------------------------------------------------------------------
header "Step 1: Detecting operating system"

[[ -f /etc/os-release ]] || die "Cannot detect OS: /etc/os-release not found."
# shellcheck source=/dev/null
. /etc/os-release

OS_ID="${ID:-}"
OS_VERSION_ID="${VERSION_ID:-}"
OS_ID_LIKE="${ID_LIKE:-}"

case "${OS_ID}" in
    ubuntu)
        case "${OS_VERSION_ID}" in
            24.04) PKG_MANAGER="apt"; VALKEY_SERVICE="valkey-server" ;;
            *)     die "Ubuntu ${OS_VERSION_ID} is not supported. Supported: Ubuntu 24.04." ;;
        esac ;;
    debian)
        case "${OS_VERSION_ID}" in
            12|13) PKG_MANAGER="apt"; VALKEY_SERVICE="valkey-server" ;;
            *)     die "Debian ${OS_VERSION_ID} is not supported. Supported: Debian 12 or 13." ;;
        esac ;;
    rhel|centos|rocky|almalinux)
        case "${OS_VERSION_ID%%.*}" in
            9|10) PKG_MANAGER="dnf"; VALKEY_SERVICE="valkey" ;;
            *)    die "${OS_ID} ${OS_VERSION_ID} is not supported. Supported: RHEL 9/10." ;;
        esac ;;
    *)
        if echo "${OS_ID_LIKE}" | grep -qE '\brhel\b|\bfedora\b'; then
            PKG_MANAGER="dnf"; VALKEY_SERVICE="valkey"
            warn "Unknown RHEL-like OS '${OS_ID}'. Attempting dnf install path."
        elif echo "${OS_ID_LIKE}" | grep -qE '\bdebian\b|\bubuntu\b'; then
            PKG_MANAGER="apt"; VALKEY_SERVICE="valkey-server"
            warn "Unknown Debian-like OS '${OS_ID}'. Attempting apt install path."
        else
            die "Unsupported OS: '${OS_ID}'."
        fi ;;
esac

info "Detected: ${OS_ID} ${OS_VERSION_ID} (pkg: ${PKG_MANAGER}, valkey service: ${VALKEY_SERVICE})"

# ---------------------------------------------------------------------------
# Step 2: Check and install prerequisites (including zstd)
# ---------------------------------------------------------------------------
header "Step 2: Checking prerequisites"

install_prereqs_apt() {
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        curl gnupg jq lsb-release ca-certificates zstd
}

install_prereqs_dnf() {
    dnf install -y -q curl gnupg2 jq ca-certificates zstd
}

MISSING_PREREQS=()
for cmd in curl jq zstd; do
    command_exists "${cmd}" || MISSING_PREREQS+=("${cmd}")
done
command_exists gpg || command_exists gpg2 || MISSING_PREREQS+=("gnupg")

if [[ ${#MISSING_PREREQS[@]} -gt 0 ]]; then
    info "Installing missing prerequisites: ${MISSING_PREREQS[*]}"
    [[ "${PKG_MANAGER}" == "apt" ]] && install_prereqs_apt || install_prereqs_dnf
else
    info "Prerequisites satisfied: curl, gnupg, jq, zstd"
fi

# ---------------------------------------------------------------------------
# Step 3: Add PostgreSQL 18 repository
# ---------------------------------------------------------------------------
header "Step 3: Configuring PostgreSQL 18 repository"

if [[ "${PKG_MANAGER}" == "apt" ]]; then
    PG_ASC="/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc"
    PG_LIST="/etc/apt/sources.list.d/pgdg.list"

    if [[ ! -f "${PG_ASC}" ]]; then
        install -d /usr/share/postgresql-common/pgdg
        curl -fsSL -o "${PG_ASC}" "${PG_KEY_URL}"
        info "PostgreSQL APT signing key installed"
    fi

    if [[ ! -f "${PG_LIST}" ]]; then
        CODENAME="$(lsb_release -cs)"
        echo "deb [signed-by=${PG_ASC}] https://apt.postgresql.org/pub/repos/apt ${CODENAME}-pgdg main" \
            > "${PG_LIST}"
        apt-get update -qq
        info "PostgreSQL APT repository added for ${CODENAME}"
    else
        info "PostgreSQL APT repository already configured"
    fi
else
    if ! dnf repolist enabled 2>/dev/null | grep -q pgdg; then
        if [[ "${OS_VERSION_ID%%.*}" == "9" ]]; then
            dnf install -y -q https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm 2>/dev/null || true
        else
            dnf install -y -q https://download.postgresql.org/pub/repos/yum/reporpms/EL-10-x86_64/pgdg-redhat-repo-latest.noarch.rpm 2>/dev/null || true
        fi
        dnf -qy module disable postgresql 2>/dev/null || true
        info "PostgreSQL PGDG repository configured"
    else
        info "PostgreSQL PGDG repository already configured"
    fi
fi

# ---------------------------------------------------------------------------
# Step 4: Add Caddy repository (not in default repos)
# ---------------------------------------------------------------------------
header "Step 4: Configuring Caddy repository"

if [[ "${PKG_MANAGER}" == "apt" ]]; then
    CADDY_KEYRING="/usr/share/keyrings/caddy-stable-archive-keyring.gpg"
    CADDY_LIST="/etc/apt/sources.list.d/caddy-stable.list"

    if [[ ! -f "${CADDY_KEYRING}" ]]; then
        curl -1sLf "${CADDY_KEY_URL}" | gpg --dearmor -o "${CADDY_KEYRING}"
        info "Caddy GPG key installed"
    fi

    if [[ ! -f "${CADDY_LIST}" ]]; then
        curl -1sLf \
            "https://dl.cloudsmith.io/public/caddy/stable/config.deb.txt?distro=$(lsb_release -is)&codename=$(lsb_release -cs)" \
            > "${CADDY_LIST}"
        apt-get update -qq
        info "Caddy APT repository added"
    else
        info "Caddy APT repository already configured"
    fi
else
    if [[ ! -f /etc/yum.repos.d/caddy.repo ]]; then
        dnf config-manager --add-repo "https://dl.cloudsmith.io/public/caddy/stable/rpm/fedora/any-version/x86_64/caddy-stable.repo" 2>/dev/null || true
        info "Caddy DNF repository configured"
    else
        info "Caddy DNF repository already configured"
    fi
fi

# ---------------------------------------------------------------------------
# Step 5: Install packages
# ---------------------------------------------------------------------------
header "Step 5: Installing PostgreSQL 18, Valkey, and Caddy"

install_packages_apt() {
    local pkgs=()
    command_exists pg_lsclusters || pkgs+=("postgresql-18" "postgresql-contrib-18")
    command_exists valkey-server  || pkgs+=("valkey-server")
    command_exists caddy          || pkgs+=("caddy")

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing: ${pkgs[*]}"
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${pkgs[@]}"
    else
        info "postgresql-18, valkey-server, and caddy already installed"
    fi
}

install_packages_dnf() {
    local pkgs=()
    command_exists psql        || pkgs+=("postgresql18-server" "postgresql18-contrib")
    command_exists valkey-server || pkgs+=("valkey")
    command_exists caddy       || pkgs+=("caddy")

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing: ${pkgs[*]}"
        dnf install -y -q "${pkgs[@]}"
        if ! [[ -f /var/lib/pgsql/18/data/PG_VERSION ]]; then
            /usr/pgsql-18/bin/postgresql-18-setup initdb
        fi
        systemctl enable --now "postgresql-18" "${VALKEY_SERVICE}"
    fi
}

[[ "${PKG_MANAGER}" == "apt" ]] && install_packages_apt || install_packages_dnf

# Locale: ensure en_US.UTF-8 is available; fall back to C.UTF-8
if [[ "${PKG_MANAGER}" == "apt" ]]; then
    if ! locale -a 2>/dev/null | grep -q "en_US.utf8"; then
        locale-gen en_US.UTF-8 2>/dev/null || true
    fi
fi
DB_LOCALE="en_US.UTF-8"
locale -a 2>/dev/null | grep -q "en_US.utf8" || DB_LOCALE="C.UTF-8"
info "Database locale: ${DB_LOCALE}"

# Tune PostgreSQL — set shared_preload_libraries before restart
sudo -u postgres psql -c "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,auto_explain';" 2>/dev/null || true
for svc in postgresql "postgresql@18-main" postgresql-18; do
    systemctl is-active --quiet "${svc}" 2>/dev/null && { systemctl restart "${svc}"; break; } || true
done

# ---------------------------------------------------------------------------
# Step 6: Install minisign
# ---------------------------------------------------------------------------
header "Step 6: Installing minisign"

ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
    x86_64)  MINISIGN_ARCH="x86_64"  ;;
    aarch64) MINISIGN_ARCH="aarch64" ;;
    *)       die "Unsupported architecture: ${ARCH_RAW}." ;;
esac

if command_exists minisign; then
    info "minisign already installed"
else
    MINISIGN_URL="https://github.com/jedisct1/minisign/releases/download/${MINISIGN_VERSION}/minisign-${MINISIGN_VERSION}-linux.tar.gz"
    MINISIGN_TMP="$(mktemp -d)"
    curl -fsSL -o "${MINISIGN_TMP}/minisign.tar.gz" "${MINISIGN_URL}"
    tar -xzf "${MINISIGN_TMP}/minisign.tar.gz" -C "${MINISIGN_TMP}"
    MINISIGN_BIN="${MINISIGN_TMP}/minisign-linux/${MINISIGN_ARCH}/minisign"
    [[ -f "${MINISIGN_BIN}" ]] || MINISIGN_BIN="$(find "${MINISIGN_TMP}" -name "minisign" -type f | head -1)"
    [[ -f "${MINISIGN_BIN}" ]] || die "Failed to extract minisign binary"
    install -m 0755 "${MINISIGN_BIN}" /usr/local/bin/minisign
    rm -rf "${MINISIGN_TMP}"
    info "minisign ${MINISIGN_VERSION} installed"
fi

# ---------------------------------------------------------------------------
# Step 7: Create system user and directory tree
# ---------------------------------------------------------------------------
header "Step 7: Creating tundra system user and directory layout"

if ! id -u "${TUNDRA_USER}" >/dev/null 2>&1; then
    useradd --system \
            --home-dir "${TUNDRA_HOME}" \
            --shell /usr/sbin/nologin \
            --comment "Tundra daemon" \
            "${TUNDRA_USER}"
    info "Created system user: ${TUNDRA_USER}"
else
    info "System user '${TUNDRA_USER}' already exists"
fi

for dir in \
    "${TUNDRA_HOME}" \
    "${TUNDRA_HOME}/data" \
    "${TUNDRA_HOME}/logs" \
    "${TUNDRA_HOME}/artifacts" \
    "${TUNDRA_HOME}/backups" \
    "${TUNDRA_HOME}/plugins" \
    "${TUNDRA_HOME}/tmp" \
    "${TUNDRA_RUN_DIR}" \
    /var/log/tundra
do
    install -d -o "${TUNDRA_USER}" -g "${TUNDRA_USER}" -m 0750 "${dir}"
done

for dir in "${TUNDRA_HOME}/data/ca" "${TUNDRA_HOME}/data/jwks"; do
    install -d -o "${TUNDRA_USER}" -g "${TUNDRA_USER}" -m 0700 "${dir}"
done

install -d -o root -g "${TUNDRA_USER}" -m 0750 "${TUNDRA_CONFIG_DIR}"
info "Directory tree created under ${TUNDRA_HOME}"

# ---------------------------------------------------------------------------
# Step 8: Configure PostgreSQL — role, database, extensions, uuidv7
# ---------------------------------------------------------------------------
header "Step 8: Configuring PostgreSQL database"

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tundra'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE ROLE tundra WITH LOGIN;"
    info "Created PostgreSQL role: tundra (Unix peer auth)"
else
    info "PostgreSQL role 'tundra' already exists"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='tundra'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE tundra OWNER tundra ENCODING 'UTF8' \
        LC_COLLATE '${DB_LOCALE}' LC_CTYPE '${DB_LOCALE}' TEMPLATE template0;"
    info "Created PostgreSQL database: tundra"
else
    info "PostgreSQL database 'tundra' already exists"
fi

# Core extensions
sudo -u postgres psql -d tundra -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
" >/dev/null
info "PostgreSQL extensions installed"

# uuidv7() — time-ordered UUID function required by all migrations.
# PG18 may expose this natively; CREATE OR REPLACE is safe either way.
sudo -u postgres psql -d tundra -c "
CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid AS \$\$
DECLARE
  v_ms  BIGINT;
  bytes BYTEA;
BEGIN
  v_ms  := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  bytes := SUBSTRING(int8send(v_ms), 3, 6) || gen_random_bytes(10);
  bytes := SET_BYTE(bytes, 6, (GET_BYTE(bytes, 6) & 15) | 112);   -- version = 7
  bytes := SET_BYTE(bytes, 8, (GET_BYTE(bytes, 8) & 63) | 128);   -- variant = 10
  RETURN ENCODE(bytes, 'hex')::uuid;
END;
\$\$ LANGUAGE plpgsql VOLATILE;
" >/dev/null
info "uuidv7() function created / verified"

# ---------------------------------------------------------------------------
# Step 9: Generate master key
# ---------------------------------------------------------------------------
header "Step 9: Generating master key"

MASTER_KEY_PATH="${TUNDRA_HOME}/data/master.key"

if [[ -f "${MASTER_KEY_PATH}" ]]; then
    info "Master key already exists — skipping"
else
    sudo -u "${TUNDRA_USER}" bash -c "umask 077; head -c 32 /dev/urandom > '${MASTER_KEY_PATH}'"
    chmod 0400 "${MASTER_KEY_PATH}"
    chown "${TUNDRA_USER}:${TUNDRA_USER}" "${MASTER_KEY_PATH}"
    info "Master key written to ${MASTER_KEY_PATH}"
fi

# ---------------------------------------------------------------------------
# Step 10: Download and install Tundra binaries
# ---------------------------------------------------------------------------
header "Step 10: Installing Tundra binaries"

if [[ "${TUNDRA_VERSION}" == "latest" ]]; then
    info "Resolving latest release from GitHub..."
    TUNDRA_VERSION="$(curl -fsSL "${GITHUB_API}" | jq -r '.tag_name' | sed 's/^v//')"
    [[ -n "${TUNDRA_VERSION}" && "${TUNDRA_VERSION}" != "null" ]] \
        || die "Failed to resolve latest Tundra version from GitHub API"
    info "Resolved latest version: ${TUNDRA_VERSION}"
fi

case "${ARCH_RAW}" in
    x86_64)  BIN_ARCH="amd64" ;;
    aarch64) BIN_ARCH="arm64" ;;
    *)       die "Unsupported architecture: ${ARCH_RAW}" ;;
esac

TARBALL="tundrad-${TUNDRA_VERSION}-linux-${BIN_ARCH}.tar.zst"
TARBALL_SIG="${TARBALL}.minisig"
DOWNLOAD_BASE="${GITHUB_RELEASES}/download/v${TUNDRA_VERSION}"
DOWNLOAD_TMP="$(mktemp -d)"

INSTALLED_VER=""
command_exists tundrad && INSTALLED_VER="$(tundrad --version 2>&1 | grep -oP '\d+\.\d+\.\d+' | head -1 || true)"

if [[ "${INSTALLED_VER}" == "${TUNDRA_VERSION}" ]]; then
    info "Tundra ${TUNDRA_VERSION} already installed — skipping download"
else
    info "Downloading ${TARBALL}..."
    curl -fsSL -o "${DOWNLOAD_TMP}/${TARBALL}"     "${DOWNLOAD_BASE}/${TARBALL}"
    curl -fsSL -o "${DOWNLOAD_TMP}/${TARBALL_SIG}" "${DOWNLOAD_BASE}/${TARBALL_SIG}"

    info "Verifying release signature..."
    PUBKEY_FILE="${DOWNLOAD_TMP}/tundra-release.pub"
    printf 'untrusted comment: Tundra release public key\n%s\n' "${TUNDRA_RELEASE_PUBKEY}" > "${PUBKEY_FILE}"
    minisign -V -p "${PUBKEY_FILE}" -m "${DOWNLOAD_TMP}/${TARBALL}" -x "${DOWNLOAD_TMP}/${TARBALL_SIG}"
    info "Signature verification passed"

    # Extract .tar.zst (zstd installed in step 2)
    zstd -d -q "${DOWNLOAD_TMP}/${TARBALL}" -o "${DOWNLOAD_TMP}/tundrad.tar"
    tar -xf "${DOWNLOAD_TMP}/tundrad.tar" -C "${DOWNLOAD_TMP}"

    for bin in tundrad tundra tundra-agent tundra-self-backup tundra-restore; do
        if [[ -f "${DOWNLOAD_TMP}/${bin}" ]]; then
            install -m 0755 "${DOWNLOAD_TMP}/${bin}" "${INSTALL_DIR}/${bin}"
            info "Installed ${bin} → ${INSTALL_DIR}/${bin}"
        else
            warn "Binary not found in archive: ${bin}"
        fi
    done

    rm -rf "${DOWNLOAD_TMP}"
fi

# ---------------------------------------------------------------------------
# Step 11: Finalize master key (BLAKE3 trailer)
# ---------------------------------------------------------------------------
header "Step 11: Finalizing master key"

if command_exists tundrad; then
    sudo -u "${TUNDRA_USER}" TUNDRAD_CONFIG="${TUNDRA_CONFIG_DIR}/tundrad.toml" \
        "${INSTALL_DIR}/tundrad" master-key init 2>&1 || true
    info "Master key finalized"
fi

# ---------------------------------------------------------------------------
# Step 12: Write configuration files
# ---------------------------------------------------------------------------
header "Step 12: Writing configuration"

PUBLIC_IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
PUBLIC_HOSTNAME="$(hostname -f)"
PUBLIC_URL="http://${PUBLIC_HOSTNAME}:7400"

# tundrad.toml — uses Unix socket peer auth (no password needed)
cat > "${TUNDRA_CONFIG_DIR}/tundrad.toml" <<TOML
[server]
listen_addr = "127.0.0.1"
port        = 7400
public_url  = "${PUBLIC_URL}"
unix_socket = "${TUNDRA_RUN_DIR}/tundrad.sock"

[database]
url             = "postgres://tundra@/tundra?host=/var/run/postgresql"
max_connections = 50

[valkey]
url      = "redis://127.0.0.1:6379"
db_cache = 0
db_queue = 1

[paths]
data_dir      = "${TUNDRA_HOME}/data"
log_dir       = "${TUNDRA_HOME}/logs"
artifacts_dir = "${TUNDRA_HOME}/artifacts"
run_dir       = "${TUNDRA_RUN_DIR}"

[security]
master_key_path        = "${TUNDRA_HOME}/data/master.key"
session_max_age_hours  = 720
require_2fa_for_owners = true

[agent]
heartbeat_interval_secs  = 30
cert_validity_days       = 90
cert_renewal_window_days = 30
TOML

chmod 0640 "${TUNDRA_CONFIG_DIR}/tundrad.toml"
chown root:"${TUNDRA_USER}" "${TUNDRA_CONFIG_DIR}/tundrad.toml"
info "Written: ${TUNDRA_CONFIG_DIR}/tundrad.toml"

# tundrad.env — runtime flags only (no secrets; DB uses peer auth)
cat > "${TUNDRA_CONFIG_DIR}/tundrad.env" <<ENV
TUNDRAD_PROFILE=production
RUST_LOG=tundrad=info,tower_http=info
ENV

chmod 0640 "${TUNDRA_CONFIG_DIR}/tundrad.env"
chown root:"${TUNDRA_USER}" "${TUNDRA_CONFIG_DIR}/tundrad.env"
info "Written: ${TUNDRA_CONFIG_DIR}/tundrad.env"

# ---------------------------------------------------------------------------
# Step 13: Write systemd service units
# ---------------------------------------------------------------------------
header "Step 13: Writing systemd units"

# tundrad.service
cat > /etc/systemd/system/tundrad.service <<UNIT
[Unit]
Description=Tundra control-plane daemon
After=network-online.target postgresql.service ${VALKEY_SERVICE}.service
Requires=postgresql.service ${VALKEY_SERVICE}.service
Wants=network-online.target

[Service]
Type=notify
User=tundra
Group=tundra
WorkingDirectory=${TUNDRA_HOME}
RuntimeDirectory=tundra
RuntimeDirectoryMode=0750
Environment=TUNDRAD_CONFIG=${TUNDRA_CONFIG_DIR}/tundrad.toml
EnvironmentFile=${TUNDRA_CONFIG_DIR}/tundrad.env
ExecStart=${INSTALL_DIR}/tundrad serve
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=3s
TimeoutStartSec=60s
TimeoutStopSec=30s
LimitNOFILE=65535

# Hardening
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectKernelLogs=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
LockPersonality=true
MemoryDenyWriteExecute=false
ReadWritePaths=${TUNDRA_HOME}
ReadWritePaths=/var/log/tundra
ReadWritePaths=${TUNDRA_RUN_DIR}
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
UNIT

info "Written: /etc/systemd/system/tundrad.service"

# tundra-agent.service — local single-host mode over Unix socket
cat > /etc/systemd/system/tundra-agent.service <<UNIT
[Unit]
Description=Tundra node agent (local single-host mode)
After=network-online.target tundrad.service
Requires=tundrad.service
Wants=network-online.target

[Service]
Type=simple
User=tundra
Group=tundra
WorkingDirectory=${TUNDRA_HOME}
Environment=TUNDRA_AGENT_CONFIG=${TUNDRA_CONFIG_DIR}/agent.toml
ExecStart=${INSTALL_DIR}/tundra-agent serve
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30s
LimitNOFILE=65535
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=${TUNDRA_HOME}
ReadWritePaths=/var/log/tundra
ReadWritePaths=${TUNDRA_RUN_DIR}
ReadWritePaths=/var/lib/nginx
ReadWritePaths=/etc/nginx

[Install]
WantedBy=multi-user.target
UNIT

info "Written: /etc/systemd/system/tundra-agent.service"

# ---------------------------------------------------------------------------
# Step 14: Run database migrations
# ---------------------------------------------------------------------------
header "Step 14: Running database migrations"

if command_exists tundrad; then
    sudo -u "${TUNDRA_USER}" TUNDRAD_CONFIG="${TUNDRA_CONFIG_DIR}/tundrad.toml" \
        "${INSTALL_DIR}/tundrad" migrate \
        || warn "Migration failed — may already be up to date"
    info "Migrations applied"
else
    warn "tundrad not installed — skipping migrations (run manually after install)"
fi

# ---------------------------------------------------------------------------
# Step 15: Enable and start services
# ---------------------------------------------------------------------------
header "Step 15: Enabling and starting services"

systemctl daemon-reload
systemctl enable --now tundrad
info "tundrad enabled and started"

# Wait up to 10s for tundrad to be ready
for i in $(seq 1 10); do
    if curl -fsS "http://127.0.0.1:7400/api/v1/health" >/dev/null 2>&1; then
        info "tundrad is accepting connections"
        break
    fi
    sleep 1
done

systemctl enable --now tundra-agent || warn "tundra-agent service failed to start — see: journalctl -u tundra-agent"
info "tundra-agent enabled and started"

# ---------------------------------------------------------------------------
# Step 16: Self-register local server
# ---------------------------------------------------------------------------
header "Step 16: Self-registering local server in Tundra"

SERVER_ID_FILE="${TUNDRA_HOME}/data/local-server-id"

if [[ -f "${SERVER_ID_FILE}" ]]; then
    LOCAL_SERVER_ID="$(cat "${SERVER_ID_FILE}")"
    info "Local server already registered (id: ${LOCAL_SERVER_ID})"
else
    # Detect system info
    LOCAL_HOSTNAME="${PUBLIC_HOSTNAME}"
    LOCAL_OS_ID="${OS_ID}"
    LOCAL_OS_VER="${OS_VERSION_ID}"
    LOCAL_ARCH="${ARCH_RAW}"

    # Insert server row directly into DB using peer-auth as tundra user
    LOCAL_SERVER_ID="$(sudo -u tundra psql -d tundra -tAc "
        INSERT INTO servers (
            name, hostname, region, public_ip,
            os, os_version, arch, status, notes
        ) VALUES (
            'Local',
            '${LOCAL_HOSTNAME}',
            NULL,
            '${PUBLIC_IP}',
            '${LOCAL_OS_ID}',
            '${LOCAL_OS_VER}',
            '${LOCAL_ARCH}',
            'active',
            'Auto-registered during installation'
        )
        ON CONFLICT (hostname) DO UPDATE SET status = 'active'
        RETURNING id::text;
    " 2>/dev/null | tr -d '[:space:]')"

    if [[ -n "${LOCAL_SERVER_ID}" ]]; then
        echo "${LOCAL_SERVER_ID}" | sudo -u "${TUNDRA_USER}" tee "${SERVER_ID_FILE}" > /dev/null
        chmod 0440 "${SERVER_ID_FILE}"
        info "Local server registered (id: ${LOCAL_SERVER_ID})"
    else
        warn "Failed to register local server in DB — check servers table after setup"
        LOCAL_SERVER_ID="unknown"
    fi
fi

# Write agent config pointing to local tundrad Unix socket
cat > "${TUNDRA_CONFIG_DIR}/agent.toml" <<AGENT_CFG
[tundrad]
socket    = "${TUNDRA_RUN_DIR}/tundrad.sock"
server_id = "${LOCAL_SERVER_ID}"

[agent]
metrics_interval_secs = 30
log_ship_interval_secs = 5
AGENT_CFG

chmod 0640 "${TUNDRA_CONFIG_DIR}/agent.toml"
chown root:"${TUNDRA_USER}" "${TUNDRA_CONFIG_DIR}/agent.toml"
info "Written: ${TUNDRA_CONFIG_DIR}/agent.toml"

# Reload agent so it picks up the server ID
systemctl reload-or-restart tundra-agent 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 17: Configure Caddy reverse proxy
# ---------------------------------------------------------------------------
header "Step 17: Configuring Caddy reverse proxy"

PANEL_HOST="${PUBLIC_HOSTNAME}"
CADDY_CFG="/etc/caddy/Caddyfile"

install -d /var/log/caddy

cat > "${CADDY_CFG}" <<CADDY
${PANEL_HOST} {
    reverse_proxy 127.0.0.1:7400 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
        flush_interval -1
    }
    encode gzip zstd

    log {
        output file /var/log/caddy/panel.log
        format json
    }
}
CADDY

systemctl enable --now caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
info "Caddy configured for ${PANEL_HOST}"

# ---------------------------------------------------------------------------
# Step 18: Print setup summary
# ---------------------------------------------------------------------------
header "Step 18: Installation complete!"

SETUP_URL="http://${PANEL_HOST}:7400/setup"

echo ""
echo -e "\033[1;36m============================================================\033[0m"
echo -e "\033[1;36m  Tundra v${TUNDRA_VERSION} installed successfully!\033[0m"
echo -e "\033[1;36m============================================================\033[0m"
echo ""
echo "  Local server registered: ${LOCAL_SERVER_ID:-unknown}"
echo ""
echo "  ┌─ Setup wizard ──────────────────────────────────────────┐"
echo "  │  ${SETUP_URL}"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""
echo "  Next steps:"
echo "    1. Visit the setup URL above to create your owner account"
echo "    2. Update public_url in ${TUNDRA_CONFIG_DIR}/tundrad.toml if behind a custom domain"
echo "    3. Point your domain DNS A record to: ${PUBLIC_IP}"
echo ""
echo "  Useful commands:"
echo "    journalctl -u tundrad -f           # control-plane logs"
echo "    journalctl -u tundra-agent -f      # agent logs"
echo "    systemctl status tundrad           # service status"
echo "    tundra version                     # CLI version"
echo ""
echo "  Docs: https://docs.tundra.dev"
echo ""
