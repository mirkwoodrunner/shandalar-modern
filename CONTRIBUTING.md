# Contributing to Shandalar Modern

This is a solo hobby project. Development is driven by the owner using **Claude Code** as an AI implementation agent.

## How Development Works

1. The owner designs features and writes detailed prompt files (in `/prompts/` or ad-hoc).
2. Claude Code executes those prompts against the codebase.
3. Results are reviewed and iterated on by the owner.

## Key Rules for AI Agents (Claude Code)

These rules apply to any AI working in this repo:

- **Never modify engine files** without explicit instruction: `DuelCore.js`, `cards.js`, `AI.js`, and state reducers are off-limits for feature work.
- **SYSTEMS.md is authoritative.** All mechanic implementation must reference a SYSTEMS.md section. Do not invent behavior not defined there.
- **No unsolicited refactoring.** Only change what the prompt explicitly requests.
- **Non-breaking by default.** All changes must include graceful fallbacks. Do not break existing functionality.
- **Determinism required.** All game logic must be fully deterministic given `GameState` + `rngSeed`. No hidden randomness.
- **Encoding hygiene.** Do not introduce smart quotes, em-dashes, or non-ASCII characters into `.js` or `.jsx` files.

## Architecture Constraints

- World Map, Duel Engine, and Card Database logic must remain strictly separated.
- State transitions between systems (e.g., overworld → duel) must be explicitly defined.
- New features should use the event/listener system rather than hard-coded if/else chains for card effects.

## Documentation

Update the following docs when completing a feature:
- `docs/gdd.md` — add a changelog entry and update phase completion status
- `docs/SYSTEMS.md` — add or update the relevant system section
- `docs/CURRENT_SPRINT.md` — mark deliverables complete; update "Up Next"
- `docs/MECHANICS_INDEX.md` — add traceability entry for new mechanics

## Reference Documents

- [`docs/gdd.md`](docs/gdd.md) — Design intent and phase history
- [`docs/SYSTEMS.md`](docs/SYSTEMS.md) — Mechanical specifications (source of truth)
- [`docs/AI.md`](docs/AI.md) — Full AI coordination rules and role definitions
