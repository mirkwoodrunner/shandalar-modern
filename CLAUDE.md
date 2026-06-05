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

## MCTS Unit Test Seam (TD-003 — RESOLVED)

`stepOnce` and `policyMainAction` in `MCTS.js` are exported solely for unit testing.
Do not call them from production code outside of MCTS.js itself.

`src/engine/__tests__/mcts-rollout.test.js` holds three test groups:
- Group A: post-fix assertions -- rollout taps exact cost and casts one spell per main
  phase, then resolves the stack. Life assertion guards against mana-burn regression.
- Group B: determinism proof -- rollout returns the same winner from identical state.
- Group C: KARAG-only gate guard -- asserts KARAG is the only profile with
  aggression >= 0.9; protects ARZAKON/MORTIS from silent MCTS exposure after the fix.

### Rollout behavior (post-TD-003 fix)

Rollouts now tap exact cost and cast one spell per main phase, then resolve the stack.
Deliberate speed tradeoffs:
- **One cast per main phase** — no multi-cast loop (future fidelity upgrade).
- **`tgt: null`** — no targeted-spell fidelity in rollout (targeted removal/burn may no-op).
- **Immediate `RESOLVE_STACK`** — no in-rollout opponent responses.
- **`computeTaps` uses `produces[0]`** — dual lands treated as their first color only.

Exact-cost tapping is required for mana-burn safety: `burnMana` fires at every phase
boundary; over-tapping would burn KARAG in live games. The factory ruleset has `manaBurn`
off, so a "tap all lands" refactor would pass unit tests while burning KARAG in real games.
The Group A life assertion (`next.o.life === 20`) is the primary regression guard for this.

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

## Aura ETB Side-Effects (enchantCreature handler)
ETB side-effects on enchantCreature mods are handled inline in the enchantCreature
case in DuelCore.js, after the aura is attached. Current mod flags with ETB logic:
  paralyzed       -- taps the host on entry
  regenerationAura -- grants {G}:regenerate activated ability to host
  earthbind       -- if host has flying: deal 2 damage, mutate aura mod to add
                    removeKeywords:[FLYING]

## Aura Death Triggers (checkDeath)
Aura mods that trigger on host death are scanned inline in checkDeath BEFORE zMove
fires, while dyingCard.enchantments is still intact.
  creatureBond    -- deal damage equal to host's toughness to its controller

## Venom (end-of-combat destruction)
Tracked via turnState.venomTargets[]. Populated in DECLARE_BLOCKER when either
attacker or blocker has a venom aura mod. Destroyed in advPhase at COMBAT_END.
Regeneration suppresses venom destruction (vic.regenerating check). Cleared each
COMBAT_END regardless of whether destruction succeeded.

## Invisibility (blocking restriction)
Checked inline in canBlockDuel via enchantments[].mod.invisibility. Only Walls
(subtype includes 'Wall') may block invisible creatures.

## Animate Wall (Wall-only target restriction)
Enforced in enchantCreature handler via mod.enchantWallOnly guard before attachment.
Uses mod:{removeKeywords:[DEFENDER_ID], enchantWallOnly:true}. Layer 6 removeKeywords
from aura mods is now supported by collectEffects in layers.js.

## Keldon Warlord
CDA counts non-Wall creatures you control (including itself). Wall check uses
x.subtype?.includes('Wall') in the keldonWarlord CDA_EVALUATORS entry in layers.js.

## Gaea's Liege
CDA uses forestCountLiege evaluator in layers.js. When card.attacking is true, counts
defending player's Forests; otherwise counts controller's Forests.

---

## Protection Enforcement
Protection on permanents is read through computeCharacteristics() in canBlockDuel
when state is available. Do NOT read card.protection directly in blocking validation --
aura-granted protection (Ward cycle, etc.) only exists in the layers output.

Protection color values use single-char keys: B, U, G, R, W, C.
Aura protection is declared as mod:{protection:["X"]} in cards.js.
collectEffects() in layers.js picks this up via aura.mod.protection and routes
it to Layer 6 addProtection.

Ward self-exemption clause: aura detachment on protection gain is not implemented.
The "this effect doesn't remove this Aura" clause is satisfied by the absence of
auto-detach logic, not by explicit code.

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

## Bug Fixes

### Fix: Tapped creatures cannot block (rule 509.1a)
- `canBlockDuel` in `DuelCore.js` now returns `false` immediately when `bl.tapped` is true.
- This is the first guard in the function, before any keyword checks.
- AI.js already pre-filtered tapped creatures; this fix closes the gap for player-declared blocks.
- Regression test: `src/engine/__tests__/blocking.test.js`

### Fix: AI taps summoning-sick mana dorks for mana (B-SS1)
- `computeAvailableMana` and `buildTapActions` filtered non-land activated-mana sources with `!c.tapped` only; `planActivatedAbilities` also lacked the check.
- Added `!c.summoningSick` / `c.summoningSick` guard to all three sites in `AI.js`.
- Regression test: `src/engine/__tests__/AI.summoningSick.tap.test.js`

---

## Group P -- Oracle-verified batch (2026-06-04)
~60 Group P stubs wired in cards.js. New resolveEff cases added to DuelCore.js.
Key patterns added: pumpAttackersEOT, debuffNonwhiteEOT, destroyAllArtifacts, inferno6,
damageAttackers1, jovialEvil, destroyAllBlack, ashesToAshes, stormSeeker, destroyForests,
typhoon, bloodLust, detonate, pumpWallsEOT, energyTap, gainFirstStrikeEOT, removeFlying,
destroyBlueCreature, damage4Any, untapTarget, psionicEntity, globalDebuffPower1EOT,
debuffTargetPower1EOT, preventDamage1Any, ebonyHorse, fightTargets, warBarge, jadeStatue,
grantBandingEOT, addManaWithSelfDamage. Per-creature cantAttackTurn field added for Wall of Dust.
Deferred to higher group: jandors_ring, leviathan, jade_monolith.

---

## Tutor Framework

Cards with `effect:"tutor"` trigger `pendingTutor` on resolution.
Optional card data fields (default if absent):
- `tutorFilter`: `'any'|'artifact'|'creature'|'instant'|'sorcery'|'enchantment'|'land'`
- `tutorDestination`: `'hand'|'top'`  (`'top'`: reshuffle remaining, chosen goes to `lib[0]`)
- `tutorReveal`: `boolean`  (`true` = opponent sees card name in log; use for type-restricted tutors)

Player resolves via `TutorModal` (search+filter+sort UI matching DeckManager visual language).
AI auto-resolves via `scoreLibCard()` in `useDuelController.ts`.
Transmute Artifact: three-step flow -- `pendingTransmuteSacrifice` -> `pendingTutor(_transmuteMode)` -> `pendingTransmutePay`.
"Decline to Find" is always available; logs `"caster declines to find a card."`.

### State fields (tutor/transmute)

```
pendingTutor: null | {
  caster: 'p'|'o', filter: TutorFilter, destination: 'hand'|'top',
  reveal: boolean, shuffledLib: Card[],
  _transmuteMode: boolean, _sacrificedCmc: number
}
pendingTransmuteSacrifice: null | { caster: 'p'|'o' }
pendingTransmutePay: null | { caster: 'p'|'o', tutored: Card, required: number }
```

### Action types (tutor/transmute)

| Action | Payload | Description |
|--------|---------|-------------|
| `CHOOSE_TUTOR` | `{ iid }` | Player picks card from library |
| `DECLINE_TUTOR` | `{}` | Player declines to find; library stays shuffled; logged |
| `CHOOSE_TUTOR_TRANSMUTE` | `{ iid }` | Player picks artifact during Transmute search |
| `CONFIRM_TRANSMUTE_SACRIFICE` | `{ iid }` | Player selects artifact to sacrifice |
| `DECLINE_TRANSMUTE_SACRIFICE` | `{}` | Player declines; spell fizzles; logged |
| `CONFIRM_TRANSMUTE_PAY` | `{}` | Player pays mana difference; drains pool; artifact ETBs |
| `DECLINE_TRANSMUTE_PAY` | `{}` | Player declines payment; mana restored; tutored card -> GY |

### TransmutePayModal display
- Layout: compact `position: fixed; top: 0; left: 0; right: 0` banner. No full-screen overlay -- battlefield remains tappable behind it.
- Paid counter: shows `totalNow` (sum of all mana currently in pool). Pre-existing pool mana counts toward payment, matching the engine's `CONFIRM_TRANSMUTE_PAY` validation (`totalMana >= required`).
- `canConfirm = paid >= required`. Aligns with engine check -- no divergence possible.
- `snapshotMana` is still passed and used to gate the Undo Tap button (non-null means taps exist to undo). It is no longer used for the paid/available calculation.

---

## Reference Documents

- [`docs/SYSTEMS.md`](docs/SYSTEMS.md) -- mechanical truth
- [`docs/AI.md`](docs/AI.md) -- full AI role definitions
- [`docs/ENGINE_CONTRACT_SPEC.md`](docs/ENGINE_CONTRACT_SPEC.md) -- system contracts
- [`docs/LVL5_MTG_JUDGE.md`](docs/LVL5_MTG_JUDGE.md) -- rules arbiter protocol
- [`CONTRIBUTING.md`](CONTRIBUTING.md) -- contribution guidelines
