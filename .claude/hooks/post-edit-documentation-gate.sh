#!/usr/bin/env bash
# post-edit-documentation-gate.sh
#
# After any src/ edit, checks whether documentation files were also
# written in the current Claude Code session. Uses the session's
# written-files list if available; otherwise falls back to git status.
#
# Required doc files (at least one must be touched per feature/fix):
#   CLAUDE.md
#   docs/SYSTEMS.md
#   docs/CURRENT_SPRINT.md
#   docs/gdd.md
#   docs/MECHANICS_INDEX.md
#   docs/COMPONENT_REGISTRY.md

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('path') or data.get('file_path') or data.get('target_file') or '')
" 2>/dev/null || echo "")

NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# Only fire for src/ changes (not for doc edits themselves or config).
if [[ "$NORM_PATH" != *"src/"* ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DOC_FILES=(
  "CLAUDE.md"
  "docs/SYSTEMS.md"
  "docs/CURRENT_SPRINT.md"
  "docs/gdd.md"
  "docs/MECHANICS_INDEX.md"
  "docs/COMPONENT_REGISTRY.md"
)

# Check git working tree for uncommitted changes to doc files.
# A doc file counts as "touched" if it has staged or unstaged modifications.
DOC_TOUCHED=0
cd "$REPO_ROOT"

for DOC in "${DOC_FILES[@]}"; do
  if git status --short "$DOC" 2>/dev/null | grep -qE "^[MAD?]"; then
    DOC_TOUCHED=1
    break
  fi
done

if [ "$DOC_TOUCHED" -eq 1 ]; then
  exit 0
fi

echo ""
echo "==================================================================="
echo "  REMINDER: Documentation not yet updated"
echo "==================================================================="
echo ""
echo "  You edited: $NORM_PATH"
echo ""
echo "  No documentation files have been modified in the working tree."
echo "  Per CLAUDE.md, documentation updates are required for every"
echo "  feature or fix. Skipping docs is a failure condition."
echo ""
echo "  Required updates (update at least those relevant to this change):"
echo ""
echo "    CLAUDE.md               -- if operational rules or file map changed"
echo "    docs/SYSTEMS.md         -- if a mechanic was added or modified"
echo "    docs/CURRENT_SPRINT.md  -- mark deliverable complete; update Up Next"
echo "    docs/gdd.md             -- add changelog entry"
echo "    docs/MECHANICS_INDEX.md -- add traceability entry for new mechanics"
echo "    docs/COMPONENT_REGISTRY.md -- if components were added or changed"
echo ""
echo "  This is a reminder, not a block. Proceed only if docs will be"
echo "  updated before the session ends."
echo "==================================================================="
echo ""

exit 0
