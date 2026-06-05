#!/usr/bin/env bash
# post-edit-dual-screen-parity.sh
#
# After any edit to DuelScreen.tsx or DuelScreenMobile.tsx, checks whether
# the two files import the same set of hooks from useDuelController.
# Emits a parity checklist if they diverge.

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('path') or data.get('file_path') or data.get('target_file') or '')
" 2>/dev/null || echo "")

NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

if [[ "$NORM_PATH" != *"DuelScreen.tsx"* && "$NORM_PATH" != *"DuelScreenMobile.tsx"* ]]; then
  exit 0
fi

# Determine repo root (two levels up from .claude/hooks/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DESKTOP="$REPO_ROOT/src/DuelScreen.tsx"
MOBILE="$REPO_ROOT/src/ui/Mobile/DuelScreenMobile.tsx"

if [ ! -f "$DESKTOP" ] || [ ! -f "$MOBILE" ]; then
  echo "[parity] Could not locate both screen files. Skipping parity check." >&2
  exit 0
fi

# Extract named imports from useDuelController in each file.
extract_controller_imports() {
  local file="$1"
  grep "from.*useDuelController" "$file" \
    | grep -oP '\{[^}]+\}' \
    | tr -d '{}' \
    | tr ',' '\n' \
    | tr -d ' ' \
    | sort
}

DESKTOP_IMPORTS=$(extract_controller_imports "$DESKTOP")
MOBILE_IMPORTS=$(extract_controller_imports "$MOBILE")

DIFF=$(diff <(echo "$DESKTOP_IMPORTS") <(echo "$MOBILE_IMPORTS") || true)

if [ -z "$DIFF" ]; then
  echo "[parity] Hook imports match between DuelScreen.tsx and DuelScreenMobile.tsx. OK." >&2
  exit 0
fi

echo ""
echo "==================================================================="
echo "  WARNING: Dual-screen hook import divergence detected"
echo "==================================================================="
echo ""
echo "  You edited: $NORM_PATH"
echo ""
echo "  The two duel screen files import different things from"
echo "  useDuelController. This is the root cause of mobile/desktop"
echo "  AI loop divergence bugs."
echo ""
echo "  Diff (< desktop  > mobile):"
echo "$DIFF" | sed 's/^/    /'
echo ""
echo "  CHECKLIST:"
echo "    [ ] Mirror any new hook return values to the other screen file"
echo "    [ ] Mirror any removed hook return values to the other screen file"
echo "    [ ] Verify both screens pass identical props to shared components"
echo "    [ ] Run: npm test -- --grep 'DuelScreen parity' if parity tests exist"
echo "    [ ] Run: npm run test:e2e -- --grep 'priority' on both desktop and"
echo "        mobile sandbox to confirm AI loop behaviour matches"
echo "==================================================================="
echo ""

exit 0
