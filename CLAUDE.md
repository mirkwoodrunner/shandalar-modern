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

`useOverworldController.js` is the shared orchestration hook for both overworld
layouts. It owns all overworld state, movement logic, encounter dispatching,
duel bridging, dungeon progression, and viewport computation. Any change to
overworld game behaviour must be made here and only here. Do not add game
logic, state declarations, or `useCallback` handlers directly to
`OverworldGameDesktop.jsx` or `OverworldGameMobile.jsx`. These files are
presentation-only and receive the controller result object as a `ctrl` prop.

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
- `src/hooks/useOverworldController.js`
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

### Background Process Hygiene
Before committing or ending a session, check for stray background processes left
over from test runs or polling loops: `ps -ef | grep -E "node|vite|playwright|chrome"`
(excluding the harness's own process). Kill anything left over that isn't doing
active work.

Do not write `while pgrep -f "<pattern>"; do sleep N; done`-style polling loops to
wait on another background command. The harness runs each backgrounded command
inside a wrapper shell whose own command line contains the full command text, so
a `pgrep -f` pattern matching the target process (e.g. `run-targeted.js`,
`workerProcessEntry`) also matches the polling loop's own wrapper -- the loop
never sees its target exit and spins forever, even after the real process is
long gone. Instead:
- Prefer waiting on the background task's own completion notification (the
  harness delivers one automatically) over polling for it yourself.
- If a wait is unavoidable, capture the target's PID at spawn time (`cmd & pid=$!`)
  and poll `kill -0 "$pid"`, never a `pgrep -f` command-line substring.

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

### License & Third-Party Provenance Policy

This project is GPL-3.0-or-later. The following rules are binding for all future prompts:

1. Any code adapted, translated, or closely derived from a GPL-3.0 source
   (currently: Card-Forge/forge) must carry a comment at the point of
   adaptation identifying the source, e.g.:
   `// Adapted from Card-Forge/forge (<path>), GPL-3.0. See THIRD_PARTY_NOTICES.md.`
2. Every such adaptation must have a corresponding entry added to
   `THIRD_PARTY_NOTICES.md` in the same prompt that introduces it — not
   deferred to a later cleanup pass.
3. Card oracle text/rules correctness is still governed exclusively by
   Scryfall's current oracle text (existing project rule, unchanged). Forge
   source is a reference for implementation *pattern* only — Forge's own
   `Oracle:` annotations can be stale and must never be trusted as the
   authoritative effect text.

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

### Milestone doc (outside the per-prompt cadence)

`docs/ROADMAP.md` — milestone-level planning doc. Updated only at milestone boundaries (not per-feature, per-card-batch, or per-sprint). Not part of the Tier 1/2/3 per-prompt update cadence.

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

### Default testing policy -- targeted, not full-suite

**Targeted testing is mandatory, not optional.** For any prompt that edits files under
`src/`, run `npm run test:targeted -- <tag1> <tag2> ...` for the tag(s) that match the
files changed (see the lookup table below, or `node scripts/list-test-tags.js`), then
`npm run test:audit -- <same tags>` once targeted passes. This is the default for every
scoped change -- do not skip straight to a full-suite run because it "feels safer."

`npm test` and `npm run test:e2e` run the **entire** suite unscoped (~1,000 Vitest cases
plus ~82 Playwright spec files, ~53 of them doubled again by the `mobile-chrome`
project). Do not run these bare commands by default. Only run the full suite when Chris
explicitly asks for it -- a full-suite or pre-merge/pre-release validation request. A
`test:audit` failure is NOT itself permission to run the full suite. See the escalation
path below.

Doc-only changes (nothing under `src/` touched) need no test run at all.

### Unit tests (Vitest)
```
npm run test:targeted -- @engine-combat-1 @overworld-generation   # DEFAULT: run only tagged tests
npm run test:audit -- @engine-combat-1                            # DEFAULT: audit a related untouched tag
npm test                     # full suite -- audit-failure escalation or explicit user request only
npm run test:e2e             # full Playwright suite -- same restriction
npm run test:e2e:ui          # Playwright UI mode
```

### Test locations

All Playwright e2e specs now live in `tests/e2e/` (consolidated 2026-06-24 from the former `e2e/` split). Vitest unit tests are in `src/engine/__tests__/`, `src/hooks/__tests__/`, and `tests/scenarios/`.

### Tag taxonomy

`scripts/test-tags.json` is the single source of truth for tags -- it maps every test
file to exactly one tag. Do not hand-maintain a tag list here; it would go stale the
moment a tag splits. Instead:

- **Run `node scripts/list-test-tags.js`** to see every current tag, its family, live
  test count, and related tags. Filter with `--family <family>` or find a specific
  file's tag with `--file <path>`.
- **Every tag is capped at 50 live test cases** (Vitest + Playwright combined, since
  `test:targeted`/`test:audit` always run both suites for a tag together).
  `scripts/validate-test-tags.js` enforces this -- run it any time you suspect a tag has
  grown past cap, or let `test:targeted`/`test:audit` catch it for you.
- **When a tag grows past 50**, split it: move some of its files into a new
  `@<family>-N` leaf tag in `scripts/test-tags.json` (bump the trailing number, add a
  `related` entry pointing back at its siblings). `scripts/build-test-tags.js` can
  regenerate the whole manifest by filename classification if you'd rather start over
  for a family than hand-split it.
- **Families** group leaf tags by subject area (`engine-ai`, `engine-combat`,
  `overworld-visual`, `premodern`, etc.) -- a tag's `family` field in the manifest is
  what `test:audit`'s related-tag network uses (see below). Every describe/test.describe
  title carries its tag as a literal string prefix (e.g. `@engine-combat-1 Scenario:
  ...`), same convention as before, just at finer granularity.
- **`@mobile` is not a standalone selectable tag.** Mobile-viewport Playwright tests
  stay bundled with their subject-area tag (most already share a file with their desktop
  counterpart) -- the literal `@mobile` word stays in the title as a marker only, and is
  cross-checked against `playwright.config.js`'s `mobile-chrome` `testMatch` array by
  `scripts/validate-test-tags.js`.
- **`@premodern`** (premodern card pool structural integrity tests) is small enough
  (16 tests) to stay a single un-split tag.

Persistence tests (`@persistence`) were removed pending a save-state retool; see `src/hooks/usePersistence.ts` for the untested hook they used to cover.

### File path -> tag family lookup

Use this to pick the *family* for `test:targeted`/`test:audit`, then run
`node scripts/list-test-tags.js --family <family>` to pick the specific leaf tag(s)
matching your change (a family often has 2-3 leaf tags). If a touched file isn't
covered here, `node scripts/list-test-tags.js --file <test-file-path>` finds the tag for
any specific test file directly.

| Path pattern | Family |
|---|---|
| `src/engine/DuelCore.js`, `AI.js`, `MCTS.js`, `cardHandlers.js`, `phases.js`, `layers.js` | one of the `engine-*` families -- see `list-test-tags.js` |
| `src/hooks/useDuel.js`, `useDuelController.ts`, `usePhaseAdvance.ts` | `engine-cast-flow-ui` |
| `src/DuelScreen.tsx`, `src/ui/duel/*`, `src/ui/Battlefield/*`, `src/ui/Card/*`, `src/ui/Hand/*`, `src/ui/Stack/*`, `src/ui/ActionBar/*`, `src/ui/Phase/*` | `engine-cast-flow-ui`, `engine-phases-priority` |
| `src/engine/MapGenerator.js`, `DungeonGenerator.js`, `EnemyAI.js` | `overworld-generation` |
| `src/hooks/useOverworldController.js` | `overworld-generation` |
| `src/OverworldGame.jsx`, `src/ui/overworld/*`, `src/ui/dungeon/*` | `overworld-visual` |
| `src/hooks/useIsMobile.ts`, `src/ui/Mobile/*`, `DuelScreenMobile.tsx`, `OverworldGameMobile.jsx`, any `isMobile`/`@media`-guarded code | whichever family owns the affected screen/feature -- `@mobile` is not its own family, see above |
| `src/data/cardsPremodern.js`, premodern pool structural files | `premodern` |
| `src/data/cards.js`, `src/data/keywords.js` | depends on which cards/handlers changed -- use `list-test-tags.js --file` against the relevant scenario test, or target several `engine-*` families for a broad change |

### Targeted and audit scripts

`npm run test:targeted -- @tag1 @tag2` resolves each tag against `scripts/test-tags.json`
to an explicit file list (union across multiple tags) and runs Vitest + Playwright
directly against those files. This is the default command for scoped changes -- see
policy above.

`npm run test:audit -- @tag1` picks one tag at random from the tags **related** to
whatever was just targeted -- every other leaf tag in the same family, plus any tag
explicitly listed in `@tag1`'s `related` array in the manifest -- and only falls back to
a fully random pick across all tags if `@tag1` has no family peers and no declared
relations. This replaces the old pure-random pick: after an engine-only change, the
audit exercises another engine-ish area, not an unrelated overworld tag. It runs that
tag's full file set and exits non-zero with a **STOP** message if anything fails. **An
audit failure is a hard stop** -- it means the current change has a side effect outside
its declared scope:

```
1. STOP. Do not run the full suite automatically.
2. Report to Chris: which tag failed, which specific test(s), and your
   diagnosis if you have one.
3. Wait for Chris's permission before running `npm test && npm run
   test:e2e` or any broader diagnostic command.
4. Only resume the original task once Chris has responded.
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
