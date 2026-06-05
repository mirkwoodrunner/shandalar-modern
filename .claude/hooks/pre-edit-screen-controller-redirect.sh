#!/usr/bin/env bash
# pre-edit-screen-controller-redirect.sh
#
# Fires before edits to DuelScreen.tsx or DuelScreenMobile.tsx.
# Inspects the proposed new_content for patterns that belong in
# useDuelController.ts rather than in the screen files.
#
# If controller-scope patterns are found, prints a warning and prompts
# for confirmation. Does NOT hard-block (exit 0) -- the model must decide.
# Uses exit 0 with a warning message; the model is expected to respect it.
#
# Controller-scope patterns (any match triggers the warning):
#   - useEffect( with game-state dependencies (stack, phase, priorityWindow,
#     active, gameOver, applyAi, dispatch)
#   - References to applyAiActionsWithPriority
#   - References to priorityWindow
#   - AI loop logic markers: getAIActions, runAI, aiLoop, aiSpeed

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('path') or data.get('file_path') or data.get('target_file') or '')
" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# Only fire for the two duel screen files.
if [[ "$NORM_PATH" != *"DuelScreen.tsx"* && "$NORM_PATH" != *"DuelScreenMobile.tsx"* ]]; then
  exit 0
fi

# Extract the proposed content being written.
NEW_CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# For Edit tool: new_string. For Write/Create: content or file_text.
print(
  data.get('new_string') or
  data.get('content') or
  data.get('file_text') or
  data.get('new_content') or
  ''
)
" 2>/dev/null || echo "")

if [ -z "$NEW_CONTENT" ]; then
  exit 0
fi

# Pattern check -- look for controller-scope logic in the proposed content.
CONTROLLER_PATTERNS=(
  "applyAiActionsWithPriority"
  "priorityWindow"
  "getAIActions"
  "aiSpeed"
  "runAITurn"
  "aiLoop"
)

# Also check for useEffect with game-state deps -- more expensive, use grep.
FOUND_PATTERN=""

for PATTERN in "${CONTROLLER_PATTERNS[@]}"; do
  if echo "$NEW_CONTENT" | grep -q "$PATTERN"; then
    FOUND_PATTERN="$PATTERN"
    break
  fi
done

# Check for useEffect referencing core game state fields.
if [ -z "$FOUND_PATTERN" ]; then
  if echo "$NEW_CONTENT" | grep -P "useEffect\s*\(" | grep -qP "stack|priorityWindow|\.phase|applyAi|dispatch.*CAST|dispatch.*RESOLVE|dispatch.*ADVANCE"; then
    FOUND_PATTERN="useEffect with game-state dependency"
  fi
fi

if [ -z "$FOUND_PATTERN" ]; then
  exit 0
fi

echo ""
echo "==================================================================="
echo "  WARNING: Controller-scope logic detected in screen file"
echo "==================================================================="
echo ""
echo "  File:    $NORM_PATH"
echo "  Pattern: $FOUND_PATTERN"
echo ""
echo "  Logic touching AI behaviour, priority windows, stack resolution,"
echo "  or phase advancement belongs in:"
echo "    src/hooks/useDuelController.ts"
echo ""
echo "  Screen files (DuelScreen.tsx, DuelScreenMobile.tsx) are"
echo "  presentation-only. They call useDuelController() and render"
echo "  its return values. They do not own AI loops or priority effects."
echo ""
echo "  CONFIRM: Should this edit go in useDuelController.ts instead?"
echo "  If yes, stop and redirect the edit there."
echo "  If no (e.g. this is presentation logic that coincidentally"
echo "  references these terms), proceed -- this is a warning, not a block."
echo "==================================================================="
echo ""

# Exit 0 -- warning only, does not block.
exit 0
