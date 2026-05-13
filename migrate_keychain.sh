#!/usr/bin/env bash
# Migrates passwords from the 'openvault' keychain service to 'ledgeragent'.
# Reads institutions from ~/.ledgeragent/institutions.json.
# Requires: jq

set -euo pipefail

OLD_SERVICE="openvault"
INSTITUTIONS_FILE="$HOME/.ledgeragent/institutions.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$INSTITUTIONS_FILE" ]]; then
  echo "Error: $INSTITUTIONS_FILE not found." >&2
  exit 1
fi

length=$(jq 'length' "$INSTITUTIONS_FILE")

for i in $(seq 0 $((length - 1))); do
  name=$(jq -r ".[$i].name" "$INSTITUTIONS_FILE")
  url=$(jq -r ".[$i].url" "$INSTITUTIONS_FILE")
  username=$(jq -r ".[$i].username" "$INSTITUTIONS_FILE")
  account_key="$(echo "$name" | tr '[:upper:]' '[:lower:]'):${username}"

  echo "[$name] Reading from '$OLD_SERVICE' (account: $account_key)..."
  password=$(security find-generic-password -s "$OLD_SERVICE" -a "$account_key" -w 2>/dev/null || true)

  if [[ -z "$password" ]]; then
    echo "[$name] WARNING: No password found in '$OLD_SERVICE' — skipping."
    continue
  fi

  echo "[$name] Adding via CLI..."
  npm run --prefix "$SCRIPT_DIR" cli -- institution add \
    --name "$name" \
    --url "$url" \
    --username "$username" \
    --password "$password"
done

echo ""
echo "Migration complete."
