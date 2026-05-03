#!/usr/bin/env bash
set -euo pipefail

# Tundra one-line installer
# Usage: curl -fsSL https://tundra.dev/install.sh | sudo bash

TUNDRA_VERSION="${TUNDRA_VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
TUNDRA_HOME="${TUNDRA_HOME:-/var/lib/tundra}"

# Minimal stub — full installer ships with the v1.0 release binary.
echo "Tundra installer — v${TUNDRA_VERSION}"
echo "This script will install tundrad, tundra-agent, and supporting utilities."
echo ""
echo "See docs/02-operations/tundra-deployment-runbook-v1.md §2 for manual install."
exit 0
