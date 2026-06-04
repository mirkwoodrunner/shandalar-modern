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

### Mobile/Desktop Isolation
All mobile UI changes must be scoped behind `isMobile` guards or `@media` rules.
Mobile changes must not impact the desktop experience. Desktop changes must not break mobile.
The `useIsMobile` hook lives at `src/hooks/useIsMobile.ts` (640px breakpoint).

### Emoji in JSX
Emoji in JSX must use Unicode escape expressions to survive rewrites without corruption.
Example: `{'\u{1F480}'}` not the raw emoji character.

---

## System Separation

World Map, Duel Engine, and Card Database logic must remain strictly separated.
State transitions between systems (e.g., overworld → duel) must be explicitly defined.
Do not blur these boundaries.

---

## Documentation — Required on Every Feature Prompt

Update the following docs when completing any feature or fix:

| Doc | What to update |
|---|---|
| `docs/gdd.md` | Add changelog entry; update phase completion status |
| `docs/SYSTEMS.md` | Add or update the relevant system section |
| `docs/CURRENT_SPRINT.md` | Mark deliverables complete; update "Up Next" |
| `docs/MECHANICS_INDEX.md` | Add traceability entry for new mechanics |
| `docs/COMPONENT_REGISTRY.md` | Update if new components are added or changed |

Skipping documentation updates is a failure condition — not optional.

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
src/DuelScreen.jsx           — active duel screen (jsx; .tsx cutover pending)
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

## Confirmed Architectural Decisions (Do Not Revisit)

- **Power Surge upkeep:** snapshot tapped-land count into `turnState.powerSurgeUntappedCount`
  during UNTAP; consume at UPKEEP. (Option A)
- **Holy Ground:** `hasKw()` suppresses landwalk keywords when the defending player controls
  Holy Ground. (Option B)
- **Priority window phases:** `PRIORITY_WINDOW_PHASES` whitelist = `Set(['MAIN_1', 'MAIN_2', 'END'])`
- **Enemy grace period:** `GRACE_MOVE_THRESHOLD = 3` in `EnemyAI.js`
- **Mulligan latch:** `mulliganDismissed` ref prevents modal reappearing on orientation change
- **Lord effect pattern:** Cards with `effect:"lordEffect"` or `effect:"globalPump"` are continuous static abilities, NOT resolved via `resolveEff`. Bonuses are computed by `getPow`, `getTou`, and `hasKw` at read time by scanning the battlefield.
- **Mana tap undo snapshot:** Created on first `TAP_LAND`/`TAP_ART_MANA` when `stack.length === 0` (not `spellsThisTurn === 0`). Resets after stack drains to zero, enabling undo for post-resolution taps.
- **AI-turn spell priority:** `useEffect([s.stack?.length])` in both DuelScreen files
  opens a priority window when the stack grows (prev === 0, cur > 0) while
  `active === 'o'`. This is the hook that gives the player a response window after the
  AI casts. The AI loop's inner `setTimeout(() => requestPhaseAdvance())` is retained
  but is a no-op while the stack is non-empty.
- **AI mana simulation:** The AI's virtual state tracks mana spent and produced during multi-spell planning. `evaluateAndCast` maintains a `poolAfterCast` that deducts each spell's cost after crediting tapped sources; `applyVirtualPlay` credits mana-producing spells via the card's `mana` array. If a new `addMana` spell is added to `cards.js`, its `mana` field must be a flat array of color characters (e.g. `["B","B","B"]`) for `applyVirtualPlay` to credit it correctly.
- **Mobile targeting mode:** `needsExplicitTarget()` (module-level in `DuelScreenMobile.tsx`) gates the targeting flow. Tapping a qualifying spell sets `targetingFor` state; subsequent tap on creature/life-total sets `pendingTarget`. `Banner.onLifeClick` prop enables life-total tap targets. Cast fires via `castSpell(targetingFor, pendingTarget, xVal)`.
- **Battlefield click routing:** `handleBfClick(card)` in `useDuelController.ts` is the single entry point for all combat-phase battlefield clicks. It owns COMBAT_BLOCKERS two-click flow (`pendingBlockerIid` state, isolated from `selTgt`) and COMBAT_ATTACKERS attacker toggle. Both `DuelScreen` and `DuelScreenMobile` call `handleBfClick` first; if it returns `false` (non-combat click), the screen component handles the interaction locally. Do not add combat click logic to either screen component.

---

## Lord Effect Pattern

Cards with `effect:"lordEffect"` or `effect:"globalPump"` are NOT resolved via `resolveEff`.
They are continuous static abilities read by `getPow`, `getTou`, and `hasKw` at compute time.
Do not add mutations for these effects in `resolveEff`. The lord layer in these three
functions scans the full battlefield each call -- keep this read-only.

Color targets (`"white"`, `"black"`, etc.) match against `card.color` (single-letter uppercase).
Subtype targets (`"goblin"`, etc.) match via word-split of `card.subtype.toLowerCase()`.

---

## Layer System

`src/engine/layers.js` implements the CR 613 continuous-effect layer engine. All
P/T, keyword, type, and color computations for permanents route through
`computeCharacteristics(card, state)`.

`getPow(c, state)`, `getTou(c, state)`, and `hasKw(c, kw, state)` in `DuelCore.js`
are thin wrappers: when called with `state`, they delegate to `computeCharacteristics`;
when called without `state` (legacy callers), they fall back to reading raw card fields.

Key concepts:
- **`card.layerDef`**: Static ability record on a card definition. `layer:"7a"` for CDAs
  (Plague Rats, Nightmare, Keldon Warlord, etc.), `layer:"7b"` for absolute P/T sets.
  `powerFn`/`toughnessFn` keys into `CDA_EVALUATORS` in `layers.js`.
- **`card.enterTs`**: Timestamp integer assigned when a permanent enters the battlefield
  via `zMove`. `layerClock` on GameState is the monotonic counter. Permanents cast
  normally (via `RESOLVE_STACK`) default to `enterTs: 0` (consistent base ordering).
- **`eotBuffs[].layerDef`**: Transient layer records added by effects (e.g. Sorceress Queen
  stores `{ layerDef: { layer: "7b", setPower: 0, setToughness: 2 } }` -- evaluated fresh
  each call, never baked at activation time).
- **Holy Ground**: Implemented as a synthetic Layer 6 `removeKeywords` effect with
  `enterTs: Number.MAX_SAFE_INTEGER` so it applies after all other Layer 6 grants.
- **Lord effects** (`effect:"lordEffect"` / `effect:"globalPump"`): Emit Layer 7c delta
  records and Layer 6 keyword grants via `collectEffects` in `layers.js`.

Do not add P/T mutation to `resolveEff` for cards with `layerDef`. Do not call
`getPow`/`getTou`/`hasKw` with a stale snapshot -- always pass the live state object.

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

## MCTS Candidate Shape (TD-002)

scoreMoves() in MCTS.js accepts an optional `nextState` field on candidate objects:

  { action: <any valid action>, nextState?: GameState, label: string }

When `nextState` is present, it is used as the rollout start state directly.
When absent, start state is derived via duelReducer(state, candidate.action).

planMain() uses the nextState path (passing primaryVirtual / altVirtual).
planAttack() uses the action path (passing DECLARE_ATTACKER / ADVANCE_PHASE).
Never pass { type: 'PLAN' } or other unrecognized action types as candidates.

---

## Pump / Flying Keyword -- Activated Ability Routing
All activated-ability pump and flying effects must route through eotBuffs via the
effectOverride map in DuelCore.js. Direct mutation of card.power, card.toughness,
or card.keywords is prohibited for activated effects.

effectOverride map covers: pumpPower->pumpPowerEOT, pumpToughness->pumpToughnessEOT,
pumpSelf->pumpSelfEOT, pumpX->pumpXEOT, gainFlying->gainFlyingEOT, grantFlying->grantFlyingEOT

## Spirit Link
Implemented as mod:{spiritLink:true} on the aura. Triggers inline at combat damage
sites in DuelCore.js (not via triggeredAbilities pipeline -- auras are not standalone
battlefield permanents and are not iterated by emitEvent).

## Keldon Warlord
CDA counts non-Wall creatures you control (including itself). Wall check uses
x.subtype?.includes('Wall') in the keldonWarlord CDA_EVALUATORS entry in layers.js.

## Gaea's Liege
CDA uses forestCountLiege evaluator in layers.js. When card.attacking is true, counts
defending player's Forests; otherwise counts controller's Forests.

---

## Reference Documents

- [`docs/SYSTEMS.md`](docs/SYSTEMS.md) -- mechanical truth
- [`docs/AI.md`](docs/AI.md) -- full AI role definitions
- [`docs/ENGINE_CONTRACT_SPEC.md`](docs/ENGINE_CONTRACT_SPEC.md) -- system contracts
- [`CONTRIBUTING.md`](CONTRIBUTING.md) -- contribution guidelines
