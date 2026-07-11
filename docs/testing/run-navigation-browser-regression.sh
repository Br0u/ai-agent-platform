#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3100}"
BASE_URL="${BASE_URL%/}"
PWCLI="${PWCLI:-${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh}"
SESSION="navigation-browser-regression-$$"
RUN_OUTPUT="$(mktemp "${TMPDIR:-/tmp}/navigation-browser-regression.XXXXXX")"

cleanup() {
  bash "$PWCLI" --session "$SESSION" close >/dev/null 2>&1 || true
  rm -f "$RUN_OUTPUT"
}
trap cleanup EXIT

curl --noproxy '*' \
  --retry 20 \
  --retry-delay 1 \
  --retry-connrefused \
  --fail \
  "$BASE_URL/api/health/live"

bash "$PWCLI" --session "$SESSION" open "$BASE_URL"
bash "$PWCLI" --session "$SESSION" snapshot
xargs -0 bash "$PWCLI" --session "$SESSION" run-code \
  < "$SCRIPT_DIR/navigation-browser-regression.js" | tee "$RUN_OUTPUT"

if grep -q '^### Error' "$RUN_OUTPUT"; then
  exit 1
fi
