#!/usr/bin/env bash
# post-edit-encoding-hygiene.sh
#
# After any edit to a .js, .jsx, or .ts/.tsx file, scans the file for:
#   1. Raw emoji characters (Unicode ranges U+1F300-U+1FAFF and common blocks)
#   2. Smart quotes (U+201C, U+201D, U+2018, U+2019)
#   3. Em-dashes (U+2014) and en-dashes (U+2013)
#
# These characters corrupt JSX output when Claude Code rewrites files and
# must be replaced with Unicode escape sequences or ASCII equivalents.
#
# Prints offending lines with line numbers. Does not block.

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('path') or data.get('file_path') or data.get('target_file') or '')
" 2>/dev/null || echo "")

NORM_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# Only scan JS/TS source files.
if [[ "$NORM_PATH" != *.js && "$NORM_PATH" != *.jsx && \
      "$NORM_PATH" != *.ts && "$NORM_PATH" != *.tsx ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TARGET="$REPO_ROOT/$NORM_PATH"
if [ ! -f "$TARGET" ]; then
  # Try absolute path as-is.
  TARGET="$NORM_PATH"
fi
if [ ! -f "$TARGET" ]; then
  exit 0
fi

# Python does the Unicode scanning -- bash can't reliably handle multi-byte.
VIOLATIONS=$(python3 - "$TARGET" << 'PYEOF'
import sys, re

path = sys.argv[1]
try:
    content = open(path, encoding='utf-8', errors='replace').read()
except Exception as e:
    sys.exit(0)

lines = content.split('\n')
violations = []

# Patterns to flag
PATTERNS = {
    'raw emoji': re.compile(
        r'[\U0001F300-\U0001F9FF'   # Misc symbols, emoticons
        r'\U00002600-\U000027BF'     # Misc symbols
        r'\U0001F000-\U0001F02F'     # Mahjong tiles
        r'\U0001F0A0-\U0001F0FF'     # Playing cards
        r'\U0001F100-\U0001F1FF'     # Enclosed alphanumeric supplement
        r'\U0001F200-\U0001F2FF'     # Enclosed ideographic supplement
        r'\U00002702-\U000027B0'     # Dingbats
        r']'
    ),
    'smart quotes': re.compile(r'[“”‘’]'),
    'em/en dash': re.compile(r'[—–]'),
}

for i, line in enumerate(lines, 1):
    for label, pattern in PATTERNS.items():
        if pattern.search(line):
            preview = line.strip()[:80]
            violations.append(f'  Line {i:4d} [{label}]: {preview}')

if violations:
    print('\n'.join(violations))
PYEOF
)

if [ -z "$VIOLATIONS" ]; then
  exit 0
fi

echo ""
echo "==================================================================="
echo "  WARNING: Encoding hygiene violation detected"
echo "==================================================================="
echo ""
echo "  File: $NORM_PATH"
echo ""
echo "  The following lines contain raw emoji, smart quotes, or dashes"
echo "  that will corrupt JSX output when Claude Code rewrites the file."
echo ""
echo "$VIOLATIONS"
echo ""
echo "  Fix:"
echo "    Raw emoji  -- Unicode escape in JSX: {'\u{1F525}'} not the raw character"
echo "    Smart quotes -- plain ASCII quotes: \" or '"
echo "    Em-dash -- ASCII double-hyphen: --"
echo "    En-dash -- ASCII hyphen: -"
echo ""
echo "  See CLAUDE.md > Encoding Hygiene."
echo "==================================================================="
echo ""

exit 0
