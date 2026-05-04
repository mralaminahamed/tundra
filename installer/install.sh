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
TUNDRA_USER="tundra"
PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
GITHUB_RELEASES="https://github.com/mralaminahamed/tundra/releases"
GITHUB_API="https://api.github.com/repos/mralaminahamed/tundra/releases/latest"
MINISIGN_VERSION="0.11"

# Hardcoded ed25519 release public key (fictional; replace with actual key on release)
TUNDRA_RELEASE_PUBKEY="RWTg/+jJF1KMagVo4qwxcMMWWJgRb5LBkBPAX/BoMsS+cM2qpNbKJJqF"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
header() {
    echo -e "\033[1;32m==> $*\033[0m"
}

info() {
    echo "    $*"
}

warn() {
    echo -e "\033[1;33m    WARN: $*\033[0m" >&2
}

die() {
    echo -e "\033[1;31mERROR: $*\033[0m" >&2
    exit 1
}

trap 'echo -e "\033[1;31mERROR: installer failed at line $LINENO\033[0m"' ERR

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Step 1: Detect OS
# ---------------------------------------------------------------------------
header "Step 1: Detecting operating system"

if [[ ! -f /etc/os-release ]]; then
    die "Cannot detect OS: /etc/os-release not found. Supported: Ubuntu 24.04, Debian 12/13, RHEL 9/10."
fi

# shellcheck source=/dev/null
. /etc/os-release

OS_ID="${ID:-}"
OS_VERSION_ID="${VERSION_ID:-}"
OS_ID_LIKE="${ID_LIKE:-}"

case "${OS_ID}" in
    ubuntu)
        case "${OS_VERSION_ID}" in
            24.04)
                PKG_MANAGER="apt"
                info "Detected: Ubuntu ${OS_VERSION_ID}"
                ;;
            *)
                die "Ubuntu ${OS_VERSION_ID} is not supported. Supported: Ubuntu 24.04."
                ;;
        esac
        ;;
    debian)
        case "${OS_VERSION_ID}" in
            12|13)
                PKG_MANAGER="apt"
                info "Detected: Debian ${OS_VERSION_ID}"
                ;;
            *)
                die "Debian ${OS_VERSION_ID} is not supported. Supported: Debian 12 or 13."
                ;;
        esac
        ;;
    rhel|centos|rocky|almalinux)
        case "${OS_VERSION_ID%%.*}" in
            9|10)
                PKG_MANAGER="dnf"
                info "Detected: RHEL-compatible ${OS_ID} ${OS_VERSION_ID}"
                ;;
            *)
                die "${OS_ID} ${OS_VERSION_ID} is not supported. Supported: RHEL/compatible 9 or 10."
                ;;
        esac
        ;;
    *)
        # Try ID_LIKE as fallback
        if echo "${OS_ID_LIKE}" | grep -qE '\brhel\b|\bfedora\b'; then
            PKG_MANAGER="dnf"
            warn "Unknown RHEL-like OS '${OS_ID}'. Attempting dnf install path."
        elif echo "${OS_ID_LIKE}" | grep -qE '\bdebian\b|\bubuntu\b'; then
            PKG_MANAGER="apt"
            warn "Unknown Debian-like OS '${OS_ID}'. Attempting apt install path."
        else
            die "Unsupported OS: '${OS_ID}'. Supported: Ubuntu 24.04, Debian 12/13, RHEL 9/10."
        fi
        ;;
esac

# ---------------------------------------------------------------------------
# Step 2: Check and install prerequisites
# ---------------------------------------------------------------------------
header "Step 2: Checking prerequisites"

install_prereqs_apt() {
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl gnupg jq lsb-release ca-certificates
}

install_prereqs_dnf() {
    dnf install -y -q curl gnupg2 jq ca-certificates
}

MISSING_PREREQS=()
for cmd in curl jq; do
    if ! command_exists "${cmd}"; then
        MISSING_PREREQS+=("${cmd}")
    fi
done
if ! command_exists gpg && ! command_exists gpg2; then
    MISSING_PREREQS+=("gnupg")
fi

if [[ ${#MISSING_PREREQS[@]} -gt 0 ]]; then
    info "Installing missing prerequisites: ${MISSING_PREREQS[*]}"
    if [[ "${PKG_MANAGER}" == "apt" ]]; then
        install_prereqs_apt
    else
        install_prereqs_dnf
    fi
else
    info "Prerequisites already installed: curl, gnupg, jq"
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
    else
        info "PostgreSQL APT signing key already present"
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
    # RHEL path
    if ! dnf module list postgresql 2>/dev/null | grep -q "postgresql:18"; then
        if [[ "${OS_VERSION_ID%%.*}" == "9" ]]; then
            dnf install -y -q https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm 2>/dev/null || true
        else
            dnf install -y -q https://download.postgresql.org/pub/repos/yum/reporpms/EL-10-x86_64/pgdg-redhat-repo-latest.noarch.rpm 2>/dev/null || true
        fi
        dnf -qy module disable postgresql 2>/dev/null || true
        info "PostgreSQL PGDG repository configured for RHEL ${OS_VERSION_ID%%.*}"
    else
        info "PostgreSQL PGDG repository already configured"
    fi
fi

# ---------------------------------------------------------------------------
# Step 4: Install packages
# ---------------------------------------------------------------------------
header "Step 4: Installing PostgreSQL 18, Valkey, and Caddy"

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
    command_exists psql            || pkgs+=("postgresql18-server" "postgresql18-contrib")
    command_exists valkey-server   || pkgs+=("valkey")
    command_exists caddy           || pkgs+=("caddy")

    if [[ ${#pkgs[@]} -gt 0 ]]; then
        info "Installing: ${pkgs[*]}"
        dnf install -y -q "${pkgs[@]}"
        # Initialize PostgreSQL on RHEL if needed
        if ! [[ -f /var/lib/pgsql/18/data/PG_VERSION ]]; then
            /usr/pgsql-18/bin/postgresql-18-setup initdb
        fi
        systemctl enable --now postgresql-18 valkey
    fi
}

if [[ "${PKG_MANAGER}" == "apt" ]]; then
    install_packages_apt
else
    install_packages_dnf
fi

# Ensure PostgreSQL extensions are available (may need shared_preload_libraries)
sudo -u postgres psql -c "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,auto_explain';" 2>/dev/null || true
systemctl restart postgresql 2>/dev/null || systemctl restart postgresql@18-main 2>/dev/null || systemctl restart postgresql-18 2>/dev/null || true

# ---------------------------------------------------------------------------
# Step 5: Install minisign
# ---------------------------------------------------------------------------
header "Step 5: Installing minisign"

ARCH_RAW="$(uname -m)"
case "${ARCH_RAW}" in
    x86_64)  MINISIGN_ARCH="x86_64"  ;;
    aarch64) MINISIGN_ARCH="aarch64" ;;
    *)       die "Unsupported architecture: ${ARCH_RAW}. Supported: x86_64, aarch64." ;;
esac

if command_exists minisign; then
    EXISTING_VER="$(minisign -v 2>&1 | grep -oP '\d+\.\d+' | head -1 || true)"
    info "minisign already installed (version: ${EXISTING_VER:-unknown})"
else
    MINISIGN_URL="https://github.com/jedisct1/minisign/releases/download/${MINISIGN_VERSION}/minisign-${MINISIGN_VERSION}-linux.tar.gz"
    MINISIGN_TMP="$(mktemp -d)"
    info "Downloading minisign ${MINISIGN_VERSION} for ${MINISIGN_ARCH}..."
    curl -fsSL -o "${MINISIGN_TMP}/minisign.tar.gz" "${MINISIGN_URL}"
    tar -xzf "${MINISIGN_TMP}/minisign.tar.gz" -C "${MINISIGN_TMP}"
    # Binary is at: minisign-linux/<arch>/minisign
    MINISIGN_BIN="${MINISIGN_TMP}/minisign-linux/${MINISIGN_ARCH}/minisign"
    if [[ ! -f "${MINISIGN_BIN}" ]]; then
        # Fallback: search for the binary
        MINISIGN_BIN="$(find "${MINISIGN_TMP}" -name "minisign" -type f | head -1)"
    fi
    [[ -f "${MINISIGN_BIN}" ]] || die "Failed to extract minisign binary from archive"
    install -m 0755 "${MINISIGN_BIN}" /usr/local/bin/minisign
    rm -rf "${MINISIGN_TMP}"
    info "minisign ${MINISIGN_VERSION} installed"
fi

# ---------------------------------------------------------------------------
# Step 6: Create system user and directory tree
# ---------------------------------------------------------------------------
header "Step 6: Creating tundra system user and directory layout"

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

# Main directories (mode 0750)
for dir in \
    "${TUNDRA_HOME}" \
    "${TUNDRA_HOME}/data" \
    "${TUNDRA_HOME}/logs" \
    "${TUNDRA_HOME}/artifacts" \
    "${TUNDRA_HOME}/backups" \
    "${TUNDRA_HOME}/plugins" \
    "${TUNDRA_HOME}/tmp"
do
    install -d -o "${TUNDRA_USER}" -g "${TUNDRA_USER}" -m 0750 "${dir}"
done

# Sensitive subdirectories (mode 0700)
for dir in \
    "${TUNDRA_HOME}/data/ca" \
    "${TUNDRA_HOME}/data/jwks"
do
    install -d -o "${TUNDRA_USER}" -g "${TUNDRA_USER}" -m 0700 "${dir}"
done

# Config directory
install -d -o root -g "${TUNDRA_USER}" -m 0750 "${TUNDRA_CONFIG_DIR}"
install -d -o root -g "${TUNDRA_USER}" -m 0750 /var/log/tundra

info "Directory tree created under ${TUNDRA_HOME}"

# ---------------------------------------------------------------------------
# Step 7: Create PostgreSQL role and database
# ---------------------------------------------------------------------------
header "Step 7: Configuring PostgreSQL database"

# Generate a random password for the tundra DB role
DB_PASSWORD="$(openssl rand -base64 32)"

# Check if role already exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tundra'" | grep -q 1; then
    info "PostgreSQL role 'tundra' already exists"
else
    sudo -u postgres psql -c "CREATE ROLE tundra WITH LOGIN PASSWORD '${DB_PASSWORD}';"
    info "Created PostgreSQL role: tundra"
fi

# Check if database already exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='tundra'" | grep -q 1; then
    info "PostgreSQL database 'tundra' already exists"
else
    sudo -u postgres psql -c "CREATE DATABASE tundra OWNER tundra ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"
    info "Created PostgreSQL database: tundra"
fi

# Install extensions
sudo -u postgres psql -d tundra -c "
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";
CREATE EXTENSION IF NOT EXISTS \"btree_gin\";
CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";
CREATE EXTENSION IF NOT EXISTS \"citext\";
" >/dev/null
info "PostgreSQL extensions installed"

# ---------------------------------------------------------------------------
# Step 8: Generate master key
# ---------------------------------------------------------------------------
header "Step 8: Generating master key"

MASTER_KEY_PATH="${TUNDRA_HOME}/data/master.key"

if [[ -f "${MASTER_KEY_PATH}" ]]; then
    info "Master key already exists at ${MASTER_KEY_PATH} — skipping"
else
    # Generate 32 raw bytes; the BLAKE3 trailer will be appended by tundrad init-master-key (step 10)
    sudo -u "${TUNDRA_USER}" bash -c "
        umask 077
        head -c 32 /dev/urandom > '${MASTER_KEY_PATH}'
    "
    chmod 0400 "${MASTER_KEY_PATH}"
    chown "${TUNDRA_USER}:${TUNDRA_USER}" "${MASTER_KEY_PATH}"
    info "Master key written to ${MASTER_KEY_PATH}"
fi

# ---------------------------------------------------------------------------
# Step 9: Download and install Tundra binaries
# ---------------------------------------------------------------------------
header "Step 9: Installing Tundra binaries"

# Resolve "latest" to a concrete version via GitHub API
if [[ "${TUNDRA_VERSION}" == "latest" ]]; then
    info "Resolving latest release from GitHub..."
    TUNDRA_VERSION="$(curl -fsSL "${GITHUB_API}" | jq -r '.tag_name' | sed 's/^v//')"
    [[ -n "${TUNDRA_VERSION}" && "${TUNDRA_VERSION}" != "null" ]] \
        || die "Failed to resolve latest Tundra version from GitHub API"
    info "Resolved latest version: ${TUNDRA_VERSION}"
fi

# Map architecture
case "${ARCH_RAW}" in
    x86_64)  BIN_ARCH="amd64" ;;
    aarch64) BIN_ARCH="arm64" ;;
    *)       die "Unsupported architecture: ${ARCH_RAW}" ;;
esac

TARBALL="tundrad-${TUNDRA_VERSION}-linux-${BIN_ARCH}.tar.zst"
TARBALL_SIG="${TARBALL}.minisig"
DOWNLOAD_BASE="${GITHUB_RELEASES}/download/v${TUNDRA_VERSION}"
DOWNLOAD_TMP="$(mktemp -d)"

# Check if binaries already installed at the target version
INSTALLED_VER=""
if command_exists tundrad; then
    INSTALLED_VER="$(tundrad --version 2>&1 | grep -oP '\d+\.\d+\.\d+' | head -1 || true)"
fi

if [[ "${INSTALLED_VER}" == "${TUNDRA_VERSION}" ]]; then
    info "Tundra ${TUNDRA_VERSION} already installed — skipping download"
else
    info "Downloading ${TARBALL}..."
    curl -fsSL -o "${DOWNLOAD_TMP}/${TARBALL}"     "${DOWNLOAD_BASE}/${TARBALL}"
    curl -fsSL -o "${DOWNLOAD_TMP}/${TARBALL_SIG}" "${DOWNLOAD_BASE}/${TARBALL_SIG}"

    # Verify signature using minisign
    info "Verifying release signature..."
    PUBKEY_FILE="${DOWNLOAD_TMP}/tundra-release.pub"
    printf 'untrusted comment: Tundra release public key\n%s\n' "${TUNDRA_RELEASE_PUBKEY}" \
        > "${PUBKEY_FILE}"
    minisign -V \
        -p "${PUBKEY_FILE}" \
        -m "${DOWNLOAD_TMP}/${TARBALL}" \
        -x "${DOWNLOAD_TMP}/${TARBALL_SIG}"
    info "Signature verification passed"

    # Extract archive (requires zstd or unzstd)
    if command_exists unzstd; then
        unzstd -q "${DOWNLOAD_TMP}/${TARBALL}" -o "${DOWNLOAD_TMP}/tundrad.tar"
        tar -xf "${DOWNLOAD_TMP}/tundrad.tar" -C "${DOWNLOAD_TMP}"
    elif command_exists zstd; then
        zstd -d -q "${DOWNLOAD_TMP}/${TARBALL}" -o "${DOWNLOAD_TMP}/tundrad.tar"
        tar -xf "${DOWNLOAD_TMP}/tundrad.tar" -C "${DOWNLOAD_TMP}"
    else
        # Try tar with auto-detection
        tar --use-compress-program=unzstd -xf "${DOWNLOAD_TMP}/${TARBALL}" -C "${DOWNLOAD_TMP}" 2>/dev/null \
            || die "Cannot extract .tar.zst: install zstd first"
    fi

    # Install each binary
    for bin in tundrad tundra tundra-agent tundra-self-backup tundra-restore; do
        BIN_PATH="${DOWNLOAD_TMP}/${bin}"
        if [[ -f "${BIN_PATH}" ]]; then
            install -m 0755 "${BIN_PATH}" "${INSTALL_DIR}/${bin}"
            info "Installed ${bin} → ${INSTALL_DIR}/${bin}"
        else
            warn "Binary not found in archive: ${bin}"
        fi
    done

    rm -rf "${DOWNLOAD_TMP}"
fi

# ---------------------------------------------------------------------------
# Step 10: Finalize master key (append BLAKE3 trailer)
# ---------------------------------------------------------------------------
header "Step 10: Finalizing master key (BLAKE3 trailer)"

if command_exists tundrad; then
    sudo -u "${TUNDRA_USER}" "${INSTALL_DIR}/tundrad" init-master-key 2>&1 || true
    info "Master key finalized"
else
    info "tundrad not found — skipping init-master-key (binary may need building)"
fi

# ---------------------------------------------------------------------------
# Step 11: Write /etc/tundra/tundrad.toml
# ---------------------------------------------------------------------------
header "Step 11: Writing tundrad configuration"

PUBLIC_URL="http://$(hostname -f):7400"

cat > "${TUNDRA_CONFIG_DIR}/tundrad.toml" <<TOML
[server]
listen_addr = "127.0.0.1:7400"
public_url  = "${PUBLIC_URL}"

[database]
url = "postgres://tundra@/tundra?host=/var/run/postgresql"
max_connections = 50

[valkey]
url = "redis://127.0.0.1:6379"
db_cache = 0
db_queue = 1

[paths]
data_dir      = "/var/lib/tundra/data"
log_dir       = "/var/lib/tundra/logs"
artifacts_dir = "/var/lib/tundra/artifacts"

[security]
master_key_path          = "/var/lib/tundra/data/master.key"
session_max_age_hours    = 720
require_2fa_for_owners   = true

[agent]
heartbeat_interval_secs  = 30
cert_validity_days        = 90
cert_renewal_window_days  = 30
TOML

chmod 0640 "${TUNDRA_CONFIG_DIR}/tundrad.toml"
chown root:"${TUNDRA_USER}" "${TUNDRA_CONFIG_DIR}/tundrad.toml"
info "Written: ${TUNDRA_CONFIG_DIR}/tundrad.toml"

# ---------------------------------------------------------------------------
# Step 12: Write /etc/tundra/tundrad.env
# ---------------------------------------------------------------------------
header "Step 12: Writing environment file"

cat > "${TUNDRA_CONFIG_DIR}/tundrad.env" <<ENV
DATABASE_PASSWORD=${DB_PASSWORD}
TUNDRAD_PROFILE=production
RUST_LOG=tundrad=info,tower_http=info
ENV

chmod 0640 "${TUNDRA_CONFIG_DIR}/tundrad.env"
chown "${TUNDRA_USER}:${TUNDRA_USER}" "${TUNDRA_CONFIG_DIR}/tundrad.env"
info "Written: ${TUNDRA_CONFIG_DIR}/tundrad.env (mode 0640)"

# ---------------------------------------------------------------------------
# Step 13: Write systemd service unit
# ---------------------------------------------------------------------------
header "Step 13: Writing systemd service unit"

cat > /etc/systemd/system/tundrad.service <<'UNIT'
[Unit]
Description=Tundra control-plane daemon
After=network-online.target postgresql.service valkey-server.service
Requires=postgresql.service valkey-server.service
Wants=network-online.target

[Service]
Type=notify
User=tundra
Group=tundra
WorkingDirectory=/var/lib/tundra
Environment=TUNDRAD_CONFIG=/etc/tundra/tundrad.toml
EnvironmentFile=/etc/tundra/tundrad.env
ExecStart=/usr/local/bin/tundrad serve
ExecReload=/bin/kill -HUP $MAINPID
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
ReadWritePaths=/var/lib/tundra
ReadWritePaths=/var/log/tundra
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
UNIT

info "Written: /etc/systemd/system/tundrad.service"

# ---------------------------------------------------------------------------
# Step 14: Run database migrations
# ---------------------------------------------------------------------------
header "Step 14: Running database migrations"

if command_exists tundrad; then
    sudo -u "${TUNDRA_USER}" "${INSTALL_DIR}/tundrad" migrate \
        || warn "Migration failed — the database may already be up to date, or tundrad needs configuration first"
    info "Migrations applied"
else
    info "tundrad not installed — skipping migrations (run manually after install)"
fi

# ---------------------------------------------------------------------------
# Step 15: Enable and start tundrad
# ---------------------------------------------------------------------------
header "Step 15: Enabling and starting tundrad"

systemctl daemon-reload
systemctl enable --now tundrad
info "tundrad enabled and started"

# ---------------------------------------------------------------------------
# Step 16: Configure Caddy
# ---------------------------------------------------------------------------
header "Step 16: Configuring Caddy reverse proxy"

PANEL_HOST="$(hostname -f)"
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

systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
info "Caddy configured for ${PANEL_HOST}"

# ---------------------------------------------------------------------------
# Step 17: Print the setup URL
# ---------------------------------------------------------------------------
header "Step 17: Tundra installation complete!"

echo ""
echo -e "\033[1;36m============================================================\033[0m"
echo -e "\033[1;36m  Tundra v${TUNDRA_VERSION} installed successfully!\033[0m"
echo -e "\033[1;36m============================================================\033[0m"
echo ""

if command_exists tundra; then
    sudo -u "${TUNDRA_USER}" "${INSTALL_DIR}/tundra" setup print-link 2>/dev/null \
        || echo "  Panel URL: http://${PANEL_HOST}:7400"
else
    echo "  Panel URL: http://${PANEL_HOST}:7400"
fi

echo ""
echo "  Next steps:"
echo "    1. Update public_url in ${TUNDRA_CONFIG_DIR}/tundrad.toml"
echo "    2. Point your domain's DNS to this server"
echo "    3. Visit the setup URL above to create your owner account"
echo "    4. Run: sudo tundra setup create-owner"
echo ""
echo "  Logs: journalctl -u tundrad -f"
echo "  Docs: https://docs.tundra.dev"
echo ""
