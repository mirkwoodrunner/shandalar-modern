#!/usr/bin/env bash
# pre-edit-engine-guard.sh
#
# Blocks writes to protected engine/data files unless the prompt contains
# an explicit opt-in phrase. Non-zero exit blocks the tool call.
#
# Opt-in phrase (case-insensitive, anywhere in the prompt context):
#   "ENGINE FILE EDIT APPROVED"
#
# Protected files (partial path match):
#   src/engine/DuelCore.js
#   src/engine/AI.js
#   src/engine/cardHandlers.js
#   src/engine/phases.js
#   src/engine/layers.js
#   src/data/cards.js
#   src/hooks/useDuel.js
#   src/hooks/useDuelController.ts

set -euo pipefail

# Claude Code passes the tool input as JSON on stdin.
INPUT=$(cat)

# Extract the file path from the tool input.
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Works for Edit, Write, and Create tool schemas
print(data.get('path') or data.get('file_path') or data.get('target_file') or '')
" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalise to forward slashes for matching.
NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

PROTECTED_PATTERNS=(
  "src/engine/DuelCore.js"
  "src/engine/AI.js"
  "src/engine/cardHandlers.js"
  "src/engine/phases.js"
  "src/engine/layers.js"
  "src/data/cards.js"
  "src/hooks/useDuel.js"
  "src/hooks/useDuelController.ts"
)

IS_PROTECTED=0
for PATTERN in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$NORM_PATH" == *"$PATTERN"* ]]; then
    IS_PROTECTED=1
    break
  fi
done

if [ "$IS_PROTECTED" -eq 0 ]; then
  exit 0
fi

# Check for opt-in phrase in the environment context Claude Code provides.
# CLAUDE_PROMPT contains the active system prompt + conversation context.
PROMPT_CONTEXT="${CLAUDE_PROMPT:-}${CLAUDE_TASK:-}${CLAUDE_SYSTEM:-}"

if echo "$PROMPT_CONTEXT" | grep -qi "ENGINE FILE EDIT APPROVED"; then
  echo "[engine-guard] Opt-in phrase found. Allowing edit to: $NORM_PATH" >&2
  exit 0
fi

echo ""
echo "==================================================================="
echo "  BLOCKED: Protected engine/data file"
echo "==================================================================="
echo ""
echo "  File:  $NORM_PATH"
echo ""
echo "  This file is off-limits without an explicit instruction from the"
echo "  project owner. See CLAUDE.md > Protected Files."
echo ""
echo "  To proceed, include the following phrase in your prompt:"
echo "    ENGINE FILE EDIT APPROVED"
echo ""
echo "  If you found a bug in this file while working on something else,"
echo "  log the observation in a comment and do not fix it."
echo "==================================================================="
echo ""

exit 2
