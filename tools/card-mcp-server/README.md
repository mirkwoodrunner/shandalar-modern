# Shandalar Card Tools MCP Server

Local stdio MCP server providing five card-database tools for use by Claude Code during
implementation sessions.

## Prerequisites

- Node.js 18+
- `scryfall/shandalar-card-pool.json` present at repo root (run `node scryfall/process-card-pool.js` to generate)

## Setup

```bash
cd tools/card-mcp-server
npm install
npm run build
```

## Claude Code Config

Add to `.claude/settings.json` in the repo root (create the file if absent):

```json
{
  "mcpServers": {
    "shandalar-cards": {
      "command": "node",
      "args": ["tools/card-mcp-server/dist/index.js"],
      "cwd": "/workspaces/shandalar-modern"
    }
  }
}
```

Adjust `cwd` to match your local repo path if not using Codespaces.

## Tools

### `shandalar_card_lookup`

Look up oracle text and metadata for any card. Checks `shandalar-card-pool.json` first;
falls back to the Scryfall API if not found.

```
card: "Serra Angel"          # card name or slug ID
response_format: "markdown"  # or "json"
```

### `shandalar_audit_crossref`

Return every card in a handler group (A–P) from `docs/audit/card-effect-audit.md`,
with oracle text pulled from the pool cache.

```
group: "A"                   # letter A–P
include_oracle: true
response_format: "markdown"  # or "json"
```

### `shandalar_stub_validator`

Cross-check all `effect:"STUB"` entries in `src/data/cards.js` against
`shandalar-card-pool.json`. Reports name, cmc, and type mismatches.

```
filter: "mismatch_only"      # or "all"
response_format: "markdown"  # or "json"
```

### `shandalar_rules_conflict`

Show oracle text and official Scryfall rulings alongside a proposed implementation
description. Surfaces discrepancies for manual review without auto-judging.

```
card: "Serra Angel"
proposed_implementation: "Gains flying at start of combat..."
response_format: "markdown"  # or "json"
```

### `shandalar_missing_card_gen`

Generate a correctly-shaped `cards.js` entry for a card not yet in the database.

```
card: "Serra Angel"
effect_hint: "GROUP_A_PROTECTION"   # optional; defaults to "STUB"
response_format: "js_snippet"       # or "json"
```

## Development

```bash
npm run dev   # watch mode
npm start     # run built server
```

## Data Sources

- **Primary:** `scryfall/shandalar-card-pool.json` — loaded at startup, never re-read
- **Fallback:** `https://api.scryfall.com` — used when a card is not in the local pool (75 ms rate-limit delay per call)
- **Audit file:** `docs/audit/card-effect-audit.md` — read from disk on each `shandalar_audit_crossref` call
- **Cards DB:** `src/data/cards.js` — read from disk on each `shandalar_stub_validator` call
