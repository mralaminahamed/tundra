#!/usr/bin/env bash
# ============================================================================
#  Tundra prod compose — secret bootstrap
#  Generates the three secret files the production stack expects in
#  prod/secrets/.  Run once on first install; back up the master key offline.
#  Author: Al Amin Ahamed  <github.com/mralaminahamed>
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -d secrets && -f secrets/master_key.bin ]]; then
    echo "secrets/ already populated. Refusing to overwrite."
    echo "If you really mean to rotate, follow the master-key rotation"
    echo "procedure in tundra-deployment-runbook-v1.md §4.2 instead."
    exit 1
fi

mkdir -p secrets
chmod 0700 secrets

echo "Generating Postgres password..."
openssl rand -base64 32 | tr -d '\n' > secrets/postgres_password.txt

echo "Generating Valkey password..."
openssl rand -base64 32 | tr -d '\n' > secrets/valkey_password.txt

echo "Generating master key (32 bytes)..."
head -c 32 /dev/urandom > secrets/master_key.bin

chmod 0400 secrets/postgres_password.txt secrets/valkey_password.txt secrets/master_key.bin

echo
echo "✓ Secrets generated in $(pwd)/secrets/"
echo
echo "IMPORTANT NEXT STEP:"
echo "  Back up secrets/master_key.bin off-host, encrypted to a separate GPG key."
echo "  See tundra-deployment-runbook-v1.md §4.1 for the procedure."
echo
echo "Add secrets/ to your .gitignore. Do not commit it."
