# CLAUDE.md — Agent Operating Rules for Shandalar Modern

This file is read automatically by Claude Code at session start.
All rules here are mandatory. Do not deviate without explicit instruction from the project owner.

---

## Project Overview

Shandalar Modern is a browser-based reimplementation of the 1996 MicroProse Magic: The Gathering
roguelike. Stack: React + TypeScript + Vite. Hosted on GitHub Codespaces.

The game loop mirrors the original: overworld exploration → ante-based duels → dungeon crawling.
Card effects use an event/listener system — not hard-coded if/else chains.

---

## Source of Truth Hierarchy

In order of authority:

1. `docs/SYSTEMS.md` — mechanical specifications for this codebase (authoritative).
   Defines which rules are implemented, simplified, or deliberately omitted.
   Do not implement behavior not defined in `docs/SYSTEMS.md`.

2. Codebase implementation

3. `docs/CURRENT_SPRINT.md` — active work scope

4. `docs/gdd.md` — design intent (non-binding)

5. `docs/DECISIONS.md` — closed architectural decisions (non-binding on new work)

If any conflict exists between these sources, `docs/SYSTEMS.md` wins.

## Magic: The Gathering Rules Reference

The file `docs/MagicCompRules*.pdf` contains the official Magic: The Gathering
Comprehensive Rules. The filename begins with "MagicCompRules" followed by a date
stamp; the exact name may change as new versions are released. Always locate it by
glob pattern, not hardcoded name.

This PDF is the reference for understanding how MTG rules work. When a rules question
arises during implementation, consult the relevant section before deciding on an
approach. It is not an authority on what this codebase implements — that is
`docs/SYSTEMS.md`. SYSTEMS.md simplifications and omissions are intentional.

For rules verification during planning, see `docs/LVL5_MTG_JUDGE.md`.

---

## Engine Architecture — Mandatory Boundaries

| System | Can Mutate GameState | Can Create Actions | Can Resolve Rules |
|---|---|---|---|
| `DuelCore.js` | YES | YES | YES |
| `AI.js` | NO | YES (read-only) | NO |
| `useDuel.js` | NO | YES (player only) | NO |
| `useDuelController.ts` | NO | NO | NO |
| UI components | NO | YES (via input) | NO |

### Hard Rules

- `DuelCore.js` is the **sole authority** for all GameState mutation.
- `AI.js` is **strictly read-only** — it produces `GameAction` objects only. It never mutates state.
- UI components are **presentation-only** — no game logic.
- `useDuel.js` dispatches `GameAction` objects to DuelCore only — no rule resolution.

`useDuelController.ts` is the shared orchestration hook for both duel screens. It owns the AI loop,
priority window effects, mulligan state, game-over timer, and battlefield click routing for combat
phases. `handleBfClick(card)` is the canonical entry point for COMBAT_BLOCKERS and COMBAT_ATTACKERS
interactions. Any change to AI behaviour, priority handling, or combat click behaviour must be made
here and only here. Do not add AI, priority, or combat click logic directly to
`DuelScreen.tsx` or `DuelScreenMobile.tsx`.

### Stack Resolution (Universal)
As of Sprint 7, all non-land spells use the stack. CAST_SPELL pushes every spell
to s.stack and opens a priority window. RESOLVE_STACK handles ETB for permanents.
The priority loop: cast -> window opens -> both players pass -> RESOLVE_STACK ->
window reopens if more items remain -> repeat until stack empty -> ADVANCE_PHASE.

### Protected Files (Off-Limits Without Explicit Instruction)

Do not modify these files unless the prompt explicitly names them:

- `src/engine/DuelCore.js`
- `src/engine/layers.js`
- `src/engine/AI.js`
- `src/data/cards.js`
- `src/hooks/useDuel.js`
- `src/hooks/useDuelController.ts`
- `src/engine/cardHandlers.js`
- `src/engine/phases.js`
- State reducers

If you identify a bug in one of these files while working on something else, log the observation
in a comment — do not fix it.

---

## Operational Rules

### No Unsolicited Work
Only modify files or implement features explicitly requested by the prompt.
Do not refactor for cleanliness, rename variables, or restructure modules unless that work is
the explicit goal of the prompt.

### Non-Breaking by Default
All changes must include graceful fallbacks. Do not break existing functionality.
If a change is breaking by nature, flag it explicitly before proceeding.

### Determinism Required
All game logic must be fully deterministic given `GameState` + `rngSeed`.
Never use `Math.random()` in gameplay logic. All randomness routes through the seeded RNG.

### Encoding Hygiene
Do not introduce smart quotes (`""`), em-dashes (`—`), or any non-ASCII characters
into `.js` or `.jsx` files.

## CLAUDE.md Scope Policy

CLAUDE.md contains only agent operating rules and session-start constraints.
It is not a feature spec, implementation log, or decision archive.

**What belongs here:**
- Mandatory constraints on agent behavior (boundaries, anti-patterns, encoding rules)
- File scope and protection rules
- Hook behavior and override protocols
- Testing infrastructure and escape hatches
- Cross-references to authoritative docs

**What does not belong here:**
- Mechanical specs for individual cards or systems -> `docs/SYSTEMS.md`
- Closed architectural decisions -> `docs/DECISIONS.md`
- Completed feature summaries or batch notes -> `docs/CURRENT_SPRINT.md`
- Bug fix records -> `docs/MECHANICS_INDEX.md`

**Trim rule:** When a feature merges, any CLAUDE.md entry for it is replaced with a
one-line cross-reference to the doc where the spec now lives. The prompt that closes
a feature is responsible for this migration -- not a future cleanup pass.

### Claude Code Hooks

Five hooks enforce project rules automatically. They live in `.claude/hooks/` and are
registered in `.claude/settings.json`. All hooks are shell scripts; make them executable
with `chmod +x .claude/hooks/*.sh`.

| Hook | Type | Fires on | Behaviour |
|---|---|---|---|
| `pre-edit-engine-guard.sh` | PreToolUse | Edit/Write/Create | Blocks writes to protected engine/data files. To override, include `ENGINE FILE EDIT APPROVED` (case-insensitive) in the prompt. Hard block (exit 2). |
| `pre-edit-screen-controller-redirect.sh` | PreToolUse | Edit/Write/Create | Warns when controller-scope logic (AI loop, priority window, phase dispatch) is detected in `DuelScreen.tsx` or `DuelScreenMobile.tsx`. Non-blocking -- a confirmation prompt. |
| `post-edit-dual-screen-parity.sh` | PostToolUse | Edit/Write/Create | After edits to either screen file, diffs their `useDuelController` import lists and emits a parity checklist on divergence. Non-blocking. |
| `post-edit-documentation-gate.sh` | PostToolUse | Edit/Write/Create | After any `src/` edit, checks git working tree for doc file changes. Prints the documentation checklist if none are found. Non-blocking. |
| `post-edit-encoding-hygiene.sh` | PostToolUse | Edit/Write/Create | After any JS/TS file edit, scans for raw emoji, smart quotes, and em/en-dashes. Prints offending lines with line numbers. Non-blocking. |

**Engine guard opt-in:** When a prompt legitimately requires editing a protected file,
include the phrase `ENGINE FILE EDIT APPROVED` anywhere in the prompt text. The hook
reads prompt context from `$CLAUDE_PROMPT` / `$CLAUDE_TASK` / `$CLAUDE_SYSTEM`.

**Hook failure:** If a hook script errors internally, Claude Code logs the error and
continues -- hooks are advisory infrastructure, not a hard dependency of the build.

**Adding hooks:** Register new scripts in `.claude/settings.json` under the appropriate
`PreToolUse` or `PostToolUse` array. Use the `matcher` field to scope by tool name.

### Mobile/Desktop Isolation
All mobile UI changes must be scoped behind `isMobile` guards or `@media` rules.
Mobile changes must not impact the desktop experience. Desktop changes must not break mobile.
The `useIsMobile` hook lives at `src/hooks/useIsMobile.ts` (640px breakpoint).

### Player Targeting

See `docs/MOBILE_VS_PC.md` — Player-target effects (draw3 / Ancestral Recall).

### TutorModal

See `docs/COMPONENT_REGISTRY.md` — TutorModal and `docs/SYSTEMS.md` — Tutor Framework.

### Emoji in JSX
Emoji in JSX must use Unicode escape expressions to survive rewrites without corruption.
Example: `{'\u{1F480}'}` not the raw emoji character.

---

## System Separation

World Map, Duel Engine, and Card Database logic must remain strictly separated.
State transitions between systems (e.g., overworld → duel) must be explicitly defined.
Do not blur these boundaries.

### Overworld Structure Types

See `docs/SYSTEMS.md` -- Section 22: Overworld Structure Types.

---

## Documentation — Tiered Update Policy

Not every change requires updating every doc. Use the trigger conditions below.
Updating a doc when its trigger condition is not met is as wrong as skipping it when it is.

### Tier 1 — Update only on structural/architectural changes

| Doc | Update when... |
|---|---|
| `CLAUDE.md` | Agent operating rules change, protected file list changes, or architectural boundaries are formally revised. **Never** update for card implementations, bug fixes, or UI work. |
| `docs/SYSTEMS.md` | A new mechanical system is added, or an existing system's behavior is formally changed. Not for individual card implementations or bug fixes. |
| `docs/ENGINE_CONTRACT_SPEC.md` | System boundary contracts between DuelCore, AI, or UI layers change. |

### Tier 2 — Update on most feature work

| Doc | Update when... |
|---|---|
| `docs/MECHANICS_INDEX.md` | Any new mechanic, card effect handler, or card group is implemented. Add a traceability entry. |
| `docs/CURRENT_SPRINT.md` | A sprint deliverable is completed or the "Up Next" list changes. |

### Tier 3 — Update only for structural changes

| Doc | Update when... |
|---|---|
| `docs/gdd.md` | A phase completes or design intent formally changes. Routine card work does not warrant a changelog entry. |
| `docs/COMPONENT_REGISTRY.md` | A new component is added, renamed, or removed. |

### Quick Reference for Card Implementation Prompts

Card implementation prompts (handler groups, stub fills, missing card entries) should typically
update **only** `docs/MECHANICS_INDEX.md` and `docs/CURRENT_SPRINT.md`. No other docs unless
a trigger condition above is explicitly met.

---

## Key File Map
```

src/engine/DuelCore.js       — sole GameState mutation authority
src/engine/AI.js             — read-only AI planner; outputs GameAction[]
src/engine/cardHandlers.js   — card effect resolution (called by DuelCore)
src/engine/phases.js         — phase constants and sequence
src/engine/MapGenerator.js   — overworld map generation
src/engine/EnemyAI.js        — overworld enemy movement
src/data/cards.js            — card database (CARD_DB + ARCHETYPES)
src/data/keywords.js         — authoritative keyword string registry
src/data/rulesets.js         — ruleset config objects (read-only)
src/hooks/useDuel.js         — React ↔ DuelCore adapter (dispatch only)
src/hooks/useIsMobile.ts     — 640px breakpoint mobile detection hook
src/utils/scryfallArt.js     — Scryfall art fetch/cache pipeline
src/utils/useCardArt.js      — React hook for card art
src/OverworldGame.jsx        — overworld game loop
src/DuelScreen.tsx           — active duel screen (design-system component tree)
tests/scenarios/                        — scenario-based regression tests (one file per bug/feature)
tests/scenarios/_template.test.js       — copy this to start a new scenario
src/engine/__tests__/_factory.js        — shared test factories; import from here, do not duplicate
docs/SYSTEMS.md              — mechanical specifications (source of truth)
docs/gdd.md                  — design intent and phase history
docs/CURRENT_SPRINT.md       — active sprint state
docs/MECHANICS_INDEX.md      — mechanic-to-code traceability
docs/COMPONENT_REGISTRY.md   — component inventory
docs/ENGINE_CONTRACT_SPEC.md — system boundary contracts
docs/AI.md                   — AI role definitions

```
---

## Anti-Patterns — Never Do These

- Invent new mechanics not defined in `docs/SYSTEMS.md`
- Modify `SYSTEMS.md` without an explicit architecture proposal
- Mix design intent with implementation logic
- Use `Math.random()` in gameplay code
- Hard-code if/else chains for card effects instead of using the handler system
- Assume "common sense" MTG rules not defined in `docs/SYSTEMS.md`
- Touch engine files while working on a UI bug
- Skip documentation updates
- Introduce raw emoji characters into JSX files
- Duplicate makeState/makeCreature/makeLand/makeSpell factory functions in test files
  instead of importing from `src/engine/__tests__/_factory.js`

---

## Testing

### Unit tests (Vitest)
```
npm test                     # run all unit + snapshot tests
npm run test:e2e             # run Playwright e2e suite
npm run test:e2e:ui          # Playwright UI mode
```

### Playwright setup (one-time)
```
npx playwright install chromium
```

### Sandbox entry point
Navigate to `/?duel=sandbox` to bypass the title screen and boot directly
into a duel using `public/sandbox-decklist.txt`.

URL params:
- `?duel=sandbox` -- required to activate sandbox mode
- `?aiSpeed=0` -- set AI delay to 0 ms (use in all e2e tests)
- `?cards=card_id,card_id` -- prepend specific card IDs to the player deck;
  basic lands to cover their mana costs are automatically prepended alongside them

### Escape hatches (sandbox mode only)
```
window.__duelDispatch(action)   // drive the engine directly from page.evaluate
window.__duelState()            // read current GameState snapshot
```

### data-testid inventory
| testid | element |
|---|---|
| `duel-screen` | DuelScreen wrapper div |
| `sandbox-loading` | loading placeholder during decklist fetch |
| `phase-bar` | PhaseBar container |
| `phase-active` | currently active phase pill |
| `phase-pip-<PHASE>` | inactive phase pill |
| `cast-button` | Cast / Play action button |
| `cancel-button` | Cancel action button |
| `undo-taps-button` | Undo Taps action button |
| `pass-priority-button` | Pass Priority action button |
| `end-turn-button` | End Turn action button |
| `hand-card-<iid>` | individual card in player hand |

---

## Card Tools MCP Server

Located at `tools/card-mcp-server/`. Provides five tools for card database work:

| Tool | Purpose |
|------|---------|
| `shandalar_card_lookup` | Oracle text + metadata for any card; pool cache first, Scryfall fallback |
| `shandalar_audit_crossref` | All cards in a handler group (A-P) with oracle text |
| `shandalar_stub_validator` | Cross-check cards.js stubs against pool JSON; flag drift |
| `shandalar_rules_conflict` | Card oracle text + rulings alongside a proposed implementation |
| `shandalar_missing_card_gen` | Generate a cards.js entry for a missing card |

**Setup:** `cd tools/card-mcp-server && npm install && npm run build`

**Claude Code config:** See `tools/card-mcp-server/README.md` for `.claude/settings.json` snippet.

**Note:** Server reads `scryfall/shandalar-card-pool.json` at startup. If the file is missing, it fails immediately with a clear error message.

**Browser artifact:** `tools/card-mcp-server/artifact/shandalar-card-tools.jsx`
A Claude.ai artifact providing a browser UI for all five tools above. Uses the Anthropic
API with a live Scryfall tool-use loop — no local server required. Use this for ad-hoc
card validation, stub checking, and missing card generation directly in Claude.ai.

---

## Reference Documents

- [`docs/SYSTEMS.md`](docs/SYSTEMS.md) -- mechanical truth
- [`docs/AI.md`](docs/AI.md) -- full AI role definitions
- [`docs/ENGINE_CONTRACT_SPEC.md`](docs/ENGINE_CONTRACT_SPEC.md) -- system contracts
- [`docs/LVL5_MTG_JUDGE.md`](docs/LVL5_MTG_JUDGE.md) -- rules arbiter protocol
- [`CONTRIBUTING.md`](CONTRIBUTING.md) -- contribution guidelines
- [`docs/DECISIONS.md`](docs/DECISIONS.md) -- closed architectural decisions

See [docs/DECISIONS.md](docs/DECISIONS.md) for confirmed architectural decisions and MCTS design records.

See [docs/SYSTEMS.md](docs/SYSTEMS.md) -- Continuous Effects and Aura Mechanics for layer system, aura patterns, lord effects, protection, pump routing, and individual card mechanic specs.

See [docs/SYSTEMS.md](docs/SYSTEMS.md) -- Tutor Framework.

See [docs/CURRENT_SPRINT.md](docs/CURRENT_SPRINT.md) -- Completed Work Archive.

See [docs/MECHANICS_INDEX.md](docs/MECHANICS_INDEX.md) -- Bug Fix Log.
