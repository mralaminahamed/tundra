#!/bin/sh
# Reads Docker secret files and exports DATABASE_URL + VALKEY_URL before
# handing off to tundrad. Runs as the tundra user inside the container.
set -eu

if [ -f "${DATABASE_PASSWORD_FILE:-}" ]; then
  DB_PASS=$(cat "$DATABASE_PASSWORD_FILE")
  export DATABASE_URL="postgres://${DATABASE_USER}:${DB_PASS}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"
fi

if [ -f "${VALKEY_PASSWORD_FILE:-}" ]; then
  VK_PASS=$(cat "$VALKEY_PASSWORD_FILE")
  export VALKEY_URL="redis://:${VK_PASS}@${VALKEY_HOST}:${VALKEY_PORT}"
else
  export VALKEY_URL="redis://${VALKEY_HOST}:${VALKEY_PORT}"
fi

if [ -f "${MASTER_KEY_FILE:-}" ]; then
  export TUNDRA_MASTER_KEY__PATH="$MASTER_KEY_FILE"
fi

exec tundrad "$@"
