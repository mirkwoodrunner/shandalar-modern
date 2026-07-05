# Shandalar Systems Document (v1.0)

## Overview

This document defines the complete mechanical ruleset and system architecture for Shandalar.

It is the authoritative specification for:
- gameplay simulation rules
- combat resolution
- AI decision structure
- world generation logic
- state mutation authority

This document is designed to be **implementation-agnostic but execution-precise**, meaning:
- It does not describe UI or narrative intent
- It defines exact system behavior and boundaries
- It ensures deterministic simulation when implemented

---

# 1. Core Architecture Principle

Shandalar is built on a strict separation of concerns:

## 1.1 Simulation Kernel

> DuelCore.js is the single source of truth for all game state mutation.

Only DuelCore may:
- mutate GameState
- advance turns
- resolve combat
- apply effects
- execute stack (LIFO) resolution

All other systems are non-authoritative.

---

## 1.2 System Layers

### Layer 1 — Engine (Authoritative Simulation)
- DuelCore.js (combat + turn engine)
- AI.js (decision generation only)
- MapGenerator.js (world grid math)
<!-- corrected: phases.js is a first-class engine file consumed by DuelCore, AI, and cardHandlers; was missing from Layer 1 -->
- phases.js (PHASE enum and PHASE_SEQUENCE constants; consumed by DuelCore, AI, and cardHandlers)

### Layer 2 — Rules Definition
- rulesets.js (Classic vs Modern rule modes)
- keywords.js (evergreen ability definitions)
- cards.js (static card data definitions)

### Layer 3 — Application Bridge
- useDuel.js (React ↔ Engine adapter)

### Layer 4 — Presentation
- React UI components

---

# 2. Game State Model

## 2.1 GameState (central simulation object)

```json
GameState {
  player: PlayerState,
  world: WorldState,
  encounter: EncounterState | null,
  rngSeed: number,
  turnNumber: number,
  phase: string,
  stack: GameAction[]
}
```

---

## 2.2 PlayerState

```json
PlayerState {
  health: number,
  maxHealth: number,
  manaPool: ManaPool,
  deck: Card[],
  hand: Card[],
  battlefield: Permanent[],
  graveyard: Card[],
  exile: Card[]
}
```

> `exile` — Always exists as a mechanical zone. `ruleset.exileZone` is a
> UI display flag only and does not gate exile as a destination.

---

## 2.3 ManaPool

```json
ManaPool {
  white: number,
  blue: number,
  black: number,
  red: number,
  green: number,
  colorless: number
}
```

---

# 3. Turn System

Each turn is fully deterministic and processed in order:

## 3.1 Turn Phases

<!-- corrected: original listed 7 phases; phases.js PHASE_SEQUENCE defines 12 — combat is split into 5 sub-phases and CLEANUP is a separate final phase -->
1. Untap Phase (`UNTAP`)
   - untap permanents (if applicable)

2. Upkeep Phase (`UPKEEP`)
   - upkeep-triggered abilities resolved; Power Surge damage applied

3. Draw Phase (`DRAW`)
   - active player draws 1 card

4. First Main Phase (`MAIN_1`)
   - player may play cards (via GameActions)

5. Combat Begin (`COMBAT_BEGIN`)
   - priority window; instants may be cast before attackers are named

6. Declare Attackers (`COMBAT_ATTACKERS`)
   - attacking creatures declared

7. Declare Blockers (`COMBAT_BLOCKERS`)
   - blocking creatures assigned

8. Combat Damage (`COMBAT_DAMAGE`)
   - damage assigned and resolved simultaneously

9. Combat End (`COMBAT_END`)
   - end-of-combat effects expire; priority window

10. Second Main Phase (`MAIN_2`)
    - player may play cards (via GameActions)

11. End Phase (`END`)
    - cleanup effects; "until end of turn" modifiers expire

12. Cleanup (`CLEANUP`)
    - discard to hand size; damage counters removed; channelActive cleared

---

# 4. Action & Stack System (LIFO Core)

## 4.1 GameAction Structure

All gameplay events are represented as actions:

```json
GameAction {
  type: string,
  payload: object,
  source: string,
  timestamp: number
}
```

---

## 4.2 Stack Rules

- All actions are pushed into a LIFO stack
- DuelCore resolves actions in reverse order
- Resolution is deterministic and seed-based
- No action resolves outside DuelCore

## S-STACK: Universal Stack Priority

All non-land spells are placed on the stack when cast. No spell resolves immediately.

Stack entry shape: { id: string, card: CardDef, caster: 'p'|'o', targets: string[], xVal: number }
Future fields (not yet active): isAbility: boolean, abilityText: string

Priority loop:
1. Spell cast -> stack.push + priorityWindow opens
2. Both players pass priority -> RESOLVE_STACK fires (top item resolves)
3. If stack still non-empty -> priorityWindow reopens
4. Repeat until stack empty -> ADVANCE_PHASE

During a priority window, only instants and instant-speed abilities may be cast.
Sorcery-speed spells are blocked by the existing guard when stack.length > 0.

Activated abilities: currently resolve immediately (not yet stacked). Stack entry
shape extended fields reserved for future implementation.

### Sorcery-Speed Enforcement

`CAST_SPELL` enforces casting restrictions before deducting mana. A card is considered sorcery-speed if `type !== 'Instant'` and `type !== 'Interrupt'`. For sorcery-speed cards the reducer enforces three conditions, returning the unchanged state (no-op) if any fails:

1. The caster (`action.who`) must be the active player (`s.active`).
2. The current phase must be in `SORCERY_SPEED_PHASES` (`MAIN_1` or `MAIN_2`).
3. The stack must be empty (`s.stack.length === 0`).

Instants and Interrupts bypass all three checks and may be cast at any time priority is held, including when the stack is non-empty (responses/counter-spells).

### Counter-Spell Targeting

Counter-effect spells (`counter`, `counterCreature`, `powerSink`,
`destroyRedOrCounter`, `destroyBlueOrCounter`) require an explicit target at
cast time:

- `targets[0]` is the `id` of a stack item (for spell-counter mode) or the
  `iid` of a battlefield permanent (for BEB/REB destroy mode).
- `resolveEff` looks up the target by id via `findStackTarget`. If the target
  is no longer on the stack at resolution, the spell fizzles.
- BEB/REB present a two-button mode picker in the UI; unavailable modes are
  greyed out. The AI prefers counter mode when a valid stack target exists.
- Spell Blast enforces CMC match against `xVal` at both cast time and
  resolution.
- Force Spike counters unconditionally (known simplification).

---

# 5. Combat System

## 5.1 Combat Flow

Combat is resolved entirely by DuelCore:

1. Attack declaration phase
2. Block assignment phase
3. Damage assignment calculation
4. Simultaneous damage resolution
5. State-based effect cleanup
6. Death processing (move to graveyard)

---

## 5.2 Damage Rules

- Damage is applied simultaneously
- A creature is destroyed if damage ≥ toughness
- Excess damage does NOT carry over unless explicitly defined by keyword or effect
- Unblocked attackers deal damage directly to player

---

## 5.3 Timing Rules

- All combat steps are atomic within DuelCore
- No external system may interrupt resolution
- AI decisions occur before execution only

---

# 6. AI System

## 6.1 AI Role Definition

AI.js is a **decision generator only**.

It is responsible for:
- evaluating GameState snapshots
- selecting optimal actions
- producing GameAction objects

It is NOT responsible for:
- applying rules
- resolving outcomes
- mutating state

---

## 6.2 AI Decision Model

AI behavior follows:

1. Evaluate board state
2. Score possible actions
3. Select highest value action
4. Emit GameAction list to DuelCore

---

## 6.3 AI Constraints

- AI must be deterministic given GameState + rngSeed
- AI must not simulate combat outcomes directly
- AI must not mutate state
- AI must not bypass DuelCore stack

## 6.4 AI Module Structure (Tier 4)

`planMain` is a thin coordinator. All decisions are made by four single-responsibility helpers:

### `selectPlayableCards(state, phase)` → `{ card, effectiveCost, xVal, effectiveCmc }[]`

Pure legality filter. Iterates `state.o.hand`, skips lands (handled separately), enforces sorcery-speed timing against an empty stack, respects `castRestriction`, and rejects cards whose CMC exceeds the total available mana ceiling. For X spells, computes the maximum X value and substitutes it into `effectiveCost` and `effectiveCmc`. Returns entries ordered by `selectBestCurve` to maximise mana utilisation (Tier 5; previously sorted CMC-descending).

### `selectTarget(card, state, profile, xVal)` → `string[] | null`

Per-effect target selection. Returns `null` if the spell has no valid target or should not be cast in the current board state (returns null = skip without tapping mana). Per-effect rules:

- **Counter-spells**: requires an opponent spell on the stack (`top.controller === 'p'`).
- **Removal** (`destroy`, `exileCreature`, `bounce`, etc.): targets the highest-scoring threat via `scoreThreat`. Expensive removal (CMC ≥ 4) is withheld against trivial threats (score < 5) unless the opponent's life is ≤ 8.
- **Pump spells**: requires `profile.greedySpells >= 0.5` and an AI creature on the battlefield; targets the highest-power creature.
- **Berserk**: prefers an opposing attacker (they die EOT, making this removal); falls back to own attackers.
- **Disintegrate / Drain Life**: kills the highest-threat creature it can kill within the X budget; otherwise fires at the opponent's face.
- **Generic spells**: returns `['o']`, `['p']`, or `[]` depending on targeting direction.

### `evaluateAndCast(playable, spellTargets, virtualState, profile)` → `{ actions, newVirtualState } | null`

Scoring gate and tap-action construction. Applies `scoreSpellValue(card, virtualState, profile) * profile.greedySpells < 0.35` to skip low-value generic spells (removal and counter-spells bypass the gate). Calls `buildTapActions` and returns `null` if unaffordable. On success, immutably marks tapped sources in the returned `newVirtualState` so subsequent spells in the same plan don't over-commit mana.

**Virtual mana tracking (planMain):** `evaluateAndCast` maintains a running `poolAfterCast` that (1) credits each tapped land/artifact's mana contribution, (2) deducts the spell's full cost (colored + generic), and (3) credits any mana the spell itself produces (`effect:'addMana'`, `card.mana` array). The resulting pool is stored in `newVirtualState.o.mana`. Subsequent spells in the loop call `buildTapActions` against this post-cast pool, correctly seeing remaining mana and preventing double-counting of already-tapped sources. `applyVirtualPlay` also credits `addMana` spells for `scoreTurnPlan` scoring purposes.

**Ramp re-selection (planMain):** `selectPlayableCards` evaluates affordability at a single point in time based on `computeAvailableMana`. After an `addMana` spell is successfully cast in the primary or alt planning loop, `planMain` calls `selectPlayableCards` again on the updated virtual state (which now has the produced mana in its pool) and appends any newly-affordable candidates to the active iteration list. This allows a single-pass planner to chain Dark Ritual → follow-up spell within the same main phase.

### `planMain(state, profile, phase)` → `AITurnPlan`

Coordinator. Sequentially: (1) Channel top-up if active and helpful; (2) play a land if in hand and not yet played; (3) iterate `selectPlayableCards` → `selectTarget` → `evaluateAndCast` for each card; (4) append activated abilities; (5) append `PASS_PRIORITY`.

No `Math.random()` calls exist in the spell-casting pipeline. Profile weights are knobs that modulate deterministic thresholds, not coin-flip gates.

## 6.5 Blocking Model

### Multi-Blocker Lethal Prevention

Before the per-attacker blocking loop, `planBlock` computes `totalIncoming` (sum of all attacking powers). If `totalIncoming >= state.o.life`, the AI enters forced-chump mode: attackers are sorted by power descending, and chumps are assigned until remaining damage drops below lethal. These chumps are recorded in `alreadyBlocking` so the subsequent per-attacker loop skips them.

### Per-Attacker Priority

For each unblocked attacker the loop checks in order: favorable trade → survives → prevents lethal → skip.

<!-- corrected: risky-attack MCR call site (AI.js >= 0.8) was undocumented -->
When `profile.aggression >= 0.8` (currently KARAG at 1.0, ARZAKON at 0.8), risky attacks are evaluated via `getBestMove(state, candidateMoves, 400)` before committing. Lower-aggression profiles use a probabilistic coin-flip (`Math.random() < profile.aggression`).

## 6.6 Activated Abilities

### Activated Ability Timing and Stack

Non-mana activated abilities (all `activated` fields except `addMana`, `addManaAny`, `addMana3Any`)
push to the stack and open the priority window exactly like spells. Cost payment (tap + mana)
happens at activation time. Resolution occurs when both players pass priority.

Mana abilities (`addMana*`) continue to resolve immediately without using the stack, per MTG rules
(rule 605.3b).

Activated abilities may be used whenever the player has priority. The priority window opens during
`COMBAT_ATTACKERS` and `COMBAT_BLOCKERS` phases when the player has non-mana activated abilities on
the battlefield, in addition to the existing `MAIN_1`, `MAIN_2`, and `END` phases.

Stack items representing resolved abilities carry `isAbility: true`. `RESOLVE_STACK` must not
attempt to place them onto the battlefield or into the graveyard.

### AI Activated Ability Planning

`planActivatedAbilities(state, profile)` is called from `planMain` immediately before `PASS_PRIORITY`. Currently handles:

- **Triskelion-style ping** (`activated.effect === 'triskelionPing'`): spends a `P1P1` counter to kill the highest-threat creature with exactly 1 remaining toughness. If no creature can be one-shot, fires at the opponent's face only when their life is ≤ 5.

Mishra's Factory animation and regenerate are deferred to Tier 5 (require deeper turn planning).

## 6.7 Mulligan

`shouldMulligan(state)` is evaluated at the top of `aiDecide` before any phase dispatch. Rules:

- Only fires on turn 1 when the AI battlefield is empty and no lands have been played.
- Mulligan if the opening hand has 0 or 1 lands.
- Mulligan if the opening hand has `handSize - 1` or more lands (e.g. 6 of 7, or 5 of 6).
- Capped at 2 mulligans total (`state.o.mulls < 2`).
- Never mulligans below 5 cards.
- Returns a single `{ type: 'MULLIGAN', who: 'o' }` action; no PASS_PRIORITY is appended.

## 6.9 AI Strategic Depth (Tier 5)

### Curve Fitting

`selectPlayableCards` returns candidates ordered by `selectBestCurve`. The greedy descending pass selects the highest-CMC affordable card, subtracts its cost from the budget, and repeats. A secondary pass then tries dropping each of the three most expensive candidates in turn and re-running the greedy fit; if any alternative uses more total mana than the greedy result, that alternative is returned instead. This is O(n²) on hand size (bounded at 7), so worst-case is negligible.

Note: `effectiveCmc` is a generic-mana proxy. Color requirements are enforced downstream by `buildTapActions`; if a chosen combination cannot actually be paid, `evaluateAndCast` returns null and the card is skipped.

### Plan Scoring

`planMain` generates two candidate turn plans from the same `selectBestCurve` card set:

1. **Primary (greedy)**: cards executed in the order returned by `selectBestCurve` (highest-CMC first after budget optimisation).
2. **Alternative (tempo)**: same cards executed cheapest-first.

Each plan is simulated against a virtual state using `applyVirtualPlay` and scored with `evaluateBoard`. The plan with the higher score is executed. Because both plans use the same card set (just different order), the difference in score reflects target selection ordering and mana-availability differences across the two sequences.

### MCTS Expansion

Profiles with `aggression >= 0.9` (currently KARAG at 1.0) use `getBestMove(virtualState, candidates, 600)` to pick between the two plans instead of direct score comparison. The `candidates` array wraps each plan as a `{ action: { type: 'PLAN', actions }, label }` object. If MCTS does not recognise the `PLAN` action type and returns null, the selector falls back to `evaluateBoard` score comparison automatically.

### Performance Constraint

Turn calculation is budgeted at 500ms p95 on a mid-range device. If profiling shows this exceeded: (1) lower MCTS iterations from 600 to 300 or remove the MCTS branch; (2) if still exceeded, evaluate only one plan (drop the alternative-plan generation).

## 6.10 Creature Evaluation (Forge CreatureEvaluator Port)

`evaluateCreatureValue(card, state)` (AI.js) replaces the old flat `getPow()` sum inside `sumCreaturePower()` / `evaluateBoard()`. It scores a single creature's board value with per-keyword nuance instead of treating all same-power creatures as equal, ported from Card-Forge/forge's `CreatureEvaluator.java` (GPL-3.0; see `THIRD_PARTY_NOTICES.md`). Only the algorithm and point weights were ported -- the Java is not mechanically translated line-for-line.

Base value 80 + 20 (this engine has no token concept, so every creature counts as "non-token"), then:
- Power * 15, toughness * 10, cmc * 5.
- Evasion: flying (power*10), fear (power*6), menace (power*4). Horsemanship/intimidate/skulk are not in this engine's keyword set and are not scored.
- Double strike (10 + power*15) else first strike (10 + power*5), deathtouch (+25 flat), lifelink (power*10), trample when power>1 ((power-1)*5), vigilance (power*5 + toughness*5).
- Reach (+5, only when the creature does not also have flying, matching Forge's own condition).
- Indestructible (+70); hexproof (+35) else shroud (+30); protection (+20).
- Defender: `-(power*9 + 40)`.
- Untapped: +1.

Deliberately not ported (no Shandalar equivalent -- verified against `src/data/keywords.js` and the engine's combat/SBE code, not assumed from the Forge source): token/counter-based scoring (shielded counters, stun counters, paired/soulbond, encode), energy/detain/goad, cumulative upkeep/echo/fading/vanishing upkeep triggers, infect/wither/toxic (the `INFECT` keyword exists in `keywords.js` but has no combat-damage implementation in `DuelCore.js` -- not "live" in this engine), and Eldrazi/bushido/flanking/exalted/melee/prowess/absorb/outlast (no counterpart keywords at all).

`evaluateBoard(state)` itself is unchanged in shape -- still `(myPower * 2) + lifeDelta + (cardDelta * 1.5) - (theirPower * 1.5)` -- only `sumCreaturePower()`'s per-creature term changed from raw power to `evaluateCreatureValue()`. Both functions are exported for direct testability; no other AI.js call site changed.

## 6.8 AI Instant-Speed Response

`planInstantResponse(state, profile)` is invoked by `getAIPlan` when `priorityWindow === true && active === 'p'` (the player holds priority). The hook in `DuelScreen.tsx` triggers a 200 ms delayed call to `aiDecide` when those conditions hold and the AI has not already passed (`priorityPasser !== 'o'`).

### Trigger Conditions

<!-- corrected: effect lives in useDuelController.ts, not DuelScreen.tsx; extracted per TD-001 resolution -->
The effect that triggers this response lives in `useDuelController.ts` (AI priority window effect).

- `state.priorityWindow === true`
- `state.active === 'p'` (player's turn — AI is the reactive side)
- `state.priorityPasser !== 'o'` (AI has not already passed this window)
- `state.over === null`

### Instant Selection Rules (evaluated in order)

1. **Counter-spells**: cast if there is an opponent spell on the stack (`stackTop.caster === 'p'`), the counter type matches the spell's color/type, and `spellThreat ≥ 3` OR `profile.greedySpells ≥ 0.7`. Threat = `card.cmc + (creature ? 2 : 0) + (burn effect ? 3 : 0) + (wrathAll ? 10 : 0)`.
2. **Instant removal** (`destroy`, `exileCreature`, `bounce`, `destroyTapped`): cast during `COMBAT_BLOCKERS` phase if attacking threats exist; targets the highest-scoring threat via `scoreThreat`.
3. **Burn at face**: cast only when damage would be lethal to the player (`dmg >= state.p.life`). Held otherwise.
4. **Fog**: cast if incoming attack damage ≥ 4 or AI life ≤ 8.

At most **one instant is cast per priority window**. After casting (or if no action is taken), `PASS_PRIORITY { who: 'o' }` is always appended.

### Infinite-Loop Guard

`DuelScreen.tsx` gates the effect on `s.priorityPasser !== 'o'`. After the AI's `PASS_PRIORITY` is processed by DuelCore, `priorityPasser` becomes `'o'`, re-triggering the effect with a failing guard. The prior `setTimeout` is cancelled by cleanup, preventing a second dispatch.

---

# 7. World System

## 7.1 World Grid

MapGenerator.js defines a fixed coordinate system:

- Grid size: 32 x 22
- Each cell represents a node in overworld space

---

## 7.2 Node Types

- Combat
- Event
- Merchant
- Boss
- Empty / Travel

---

## 7.3 Generation Rules

- Map generation is deterministic from rngSeed
- Node placement is mathematically derived
- No runtime randomness outside seed system

### 7.3.1 Terrain Distribution (coherent value noise)

Terrain biomes are assigned from a deterministic low-frequency **value-noise field**
(two cosine-interpolated lattice octaves, cell sizes 8 and 4), not per-tile random.
This clusters biomes into **connected regions** so the renderer can autotile them.

- The terrain step consumes a fixed **241 rng() draws** (the two lattices: 54 + 187),
  all up front; field sampling and biome assignment use no rng. Determinism preserved.
- Land biome proportions are made exact by **quantile-remapping** the field over land
  tiles against cumulative cut points `[0.28, 0.48, 0.68, 0.82]`, mapped to a
  **cost-monotonic ladder**: ISLAND -> PLAINS -> FOREST -> SWAMP -> MOUNTAIN. This keeps
  high-cost SWAMP a thin band rather than a basin.
- The outer **water ring** persists, with a noise-perturbed (wavy, connected) coast.
- Connectivity is still enforced by the existing flood-fill pass: any land unreachable
  from the player start is converted to water, so clustered terrain never traps the player.

---

# 8. Ruleset System

## 8.1 Purpose

rulesets.js defines global rule behavior variations:

- Classic ruleset (original MTG-inspired behavior)
- Modern ruleset (updated mechanics and simplifications)

---

## 8.2 Scope of Influence

rulesets may modify:
- turn structure rules
- resource generation behavior
- keyword interpretation
- combat edge cases

---

## 8.3 Constraints

- rulesets do NOT directly mutate GameState
- rulesets are read-only configuration layers for DuelCore

---

# 9. Keyword System

keywords.js defines reusable mechanical primitives:

Examples:
- flying
- trample
- first strike
- haste

## Rules:
- Keywords are stateless definitions
- Keywords are interpreted by DuelCore during resolution
- Keywords do not contain logic that mutates state directly

---

# 10. Card System

cards.js defines immutable card templates:

Each card contains:
- cost
- type
- power/toughness (if applicable)
- keyword references
- effect definitions

Cards are instantiated into gameplay objects by DuelCore.

---

# 11. Engine Bridge System (React Integration)

## 11.1 useDuel.js Role

useDuel.js is a **pure adapter layer**.

It:
- subscribes to DuelCore state updates
- dispatches player actions to DuelCore
- provides UI-friendly state access

It must NOT:
- resolve rules
- calculate outcomes
- store authoritative state

## 11.2 Additional UI Adapter Hooks

Thin hooks that live alongside `useDuel.js` and share its constraints (no rules resolution, no state mutation):

| Hook | File | Purpose |
|------|------|---------|
| `useDuelController` | `src/hooks/useDuelController.ts` | Shared orchestration hook for both duel screens. Owns the AI loop (including `applyAiActionsWithPriority`), three priority-window effects, sandbox escape hatch, game-over timer, and mulligan state. Both `DuelScreen` and `DuelScreenMobile` delegate all orchestration here. Accepts optional `aiSpeed` parameter (default 800ms; desktop passes `tweaks.aiSpeed`). |
| `usePhaseAdvance` | `src/hooks/usePhaseAdvance.ts` | Encapsulates the priority-window suppression heuristic (skip window when no instant/activated ability is available). Returns a stable `requestPhaseAdvance` callback. Called internally by `useDuelController`. |
| `useMedia` | `src/hooks/useMedia.ts` | Generic `matchMedia` wrapper with SSR guard. Returns a boolean that updates on viewport change. Used by `OverworldGame` to gate `DuelScreenMobile` at ≤ 640px. |
<!-- corrected: file is .ts not .js; implementation uses matchMedia not ResizeObserver; breakpoint is 640px not 768px -->
| `useIsMobile` | `src/hooks/useIsMobile.ts` | `matchMedia`-based breakpoint detector (≤ 640px). Returns `true` when viewport width ≤ 640 px; updates on resize. Used for presentation sizing only — no game logic. |
| `useFlash` | `src/hooks/useFlash.ts` | Tracks a `Set<string>` of card iids to flash; clears after configurable duration (default 200 ms). |
| `useKeyboardShortcuts` | `src/hooks/useKeyboardShortcuts.ts` | Binds Space (pass priority), Enter (end turn), Escape (cancel), and digit keys (quick-cast) to provided handler callbacks. No-ops when an INPUT or TEXTAREA is focused. |
| `useTweaks` | `src/hooks/useTweaks.ts` | Manages dev-tweak values (arrow style, `aiSpeed`). `readAiSpeedParam()` parses `?aiSpeed=` from the URL; default is **400 ms** when the param is absent. |
| `usePersistence` | `src/hooks/usePersistence.ts` | Writes the full duel GameState to `localStorage` key `shandalar:duel` on every state change (write-only; key is never read back). See OPEN DESIGN QUESTION in Section 21. |

#### Battlefield Click Routing

`handleBfClick(card)` in `useDuelController.ts` is the single shared handler for all battlefield
card clicks during combat phases. Both `DuelScreen` and `DuelScreenMobile` delegate to it before
applying any screen-local logic.

**Routing order:**

1. **COMBAT_BLOCKERS** (`s.active !== 'p'`): two-click flow. First click on a player creature sets
   `pendingBlockerIid`. Second click on an attacking opponent creature dispatches `DECLARE_BLOCKER`
   and clears `pendingBlockerIid`. `pendingBlockerIid` is isolated from `s.selTgt` — do not use
   `selTgt` as a blocker vessel.
2. **COMBAT_ATTACKERS** (`s.active === 'p'`): click on a player creature toggles attacker
   declaration via `declareAttacker`.
3. **All other clicks**: `handleBfClick` returns `false`; the screen component handles the
   interaction (mana taps, ability activation, spell targeting).

Do not add combat click logic to `DuelScreen.tsx` or `DuelScreenMobile.tsx`.

### 11.2.1 Blocker Declaration Routing (post-B32)

The defender (non-active player) always declares blockers. Because `s.active` is the
attacking player's side:

- **AI attacks** (`active === 'o'`): player is defender. `handleBfClick` enables the
  two-click blocker flow (`pendingBlockerIid`). Desktop `ActionBar` shows "Done Blocking"
  when `phase === COMBAT_BLOCKERS && !isPlayerTurn`. Mobile `ActionBar` shows its blocker
  UI when `phase === COMBAT_BLOCKERS && !isPlayerTurn`. Clicking "Done Blocking" calls
  `advancePhase()` directly.

- **Player attacks** (`active === 'p'`): AI is defender. The AI main loop's outer guard
  (`s.active !== 'o'`) bails, preventing any AI action during COMBAT_BLOCKERS on the
  player's turn. The player clicks "End Turn" (enabled when `isPlayerTurn === true`) to
  advance past blockers.

The AI main loop guard in `useDuelController.ts` retains the COMBAT_BLOCKERS bail:
```typescript
if (s.phase === 'COMBAT_BLOCKERS') return;
```
This prevents the AI from calling `requestPhaseAdvance` during blocker declaration when
`active === 'o'`. The "Done Blocking" button (not the AI loop) is the mechanism that
advances the phase. Removing this bail would race the AI past the blocker window.

### 11.3 UI/Overworld -- Controller and Layout Split

`useOverworldController` (`src/hooks/useOverworldController.js`) is the shared
orchestration hook for both overworld layouts. It owns all state, movement
callbacks, encounter dispatching, duel bridging, dungeon progression, and
viewport computation. It accepts `isCompactMobile: boolean` from the shell
component and uses it to compute viewport dimensions.

**Viewport computation (mobile <= 640px):**
- `viewW = 14`, `viewH = 16` (portrait-optimised: taller than wide)
- `tileSize` = largest integer fitting `(innerHeight - 68) / 16` and `(innerWidth - 8) / 14`, clamped min 16px
- 68px chrome = 44px topbar + 24px tile strip

**Viewport computation (desktop > 640px):**
- `viewW = VIEW_W (22)`, `viewH = VIEW_H (14)`, `tileSize = 34` (unchanged)

`OverworldGame.jsx` snapshots the breakpoint at mount into `overworldIsCompact`
(same pattern as `duelScreenIsCompact`) to prevent layout component swaps on
orientation change. The live `isCompactMobile` value from `useMedia` feeds only
the controller's viewport `useMemo`.

`WorldMap` (`src/ui/overworld/WorldMap.jsx`) accepts an optional `tileSize` prop (default `34`). All grid template dimensions, tile element sizes, canvas dimensions, and empty-tile placeholders are derived from this prop so the grid scales uniformly.

---

# 12. Determinism System

All gameplay must be fully deterministic:

- All randomness derived from rngSeed
- No Math.random usage in gameplay systems
- AI decisions must be reproducible
- Map generation must be reproducible

---

# 13. System Authority Hierarchy

In order of precedence:

1. DuelCore.js (absolute authority)
2. SYSTEMS.md (design truth)
3. rulesets.js (mode modifiers)
4. keywords.js (mechanic definitions)
5. cards.js (static data)
6. UI layer (non-authoritative)

---

# 14. Anti-Drift Rules

The following are forbidden outside DuelCore:

- mutating GameState
- resolving combat outcomes
- advancing turn state
- executing stack logic

The following are forbidden in AI.js:

- state mutation
- rule enforcement
- outcome resolution

The following are forbidden in UI:

- gameplay simulation
- deterministic logic execution

---

# 15. Non-Goals

This system does NOT define:
- UI layout or styling
- narrative content
- visual effects
- audio design
- player emotional design

---

# 16. Scryfall Art Integration System

## 16.1 Purpose

Fetches real card artwork from the Scryfall API and displays it in card UI components. This is a **pure presentation enhancement** — it has no effect on game state, rules, or determinism.

---

## 16.2 System Files

```
/src/utils/scryfallArt.js   — fetch + cache utility (no React)
/src/utils/useCardArt.js    — React hook wrapping the utility
```

`CardArtDisplay` (defined inline in `Card.jsx`) is the rendering component that consumes the hook.

---

## 16.3 Art Resolution Priority

For each card name, the system queries Scryfall in this order:

1. **Classic-set search** — oldest printing from Alpha (lea), Beta (leb), Unlimited (2ed), Revised (3ed), or 4th Edition (4ed), sorted by release date ascending.
2. **Named fallback** — if no classic printing exists, `cards/named?exact=` returns whatever printing Scryfall has on file.

`image_uris.art_crop` is extracted from the result. For double-faced cards where `image_uris` is absent, `card_faces[0].image_uris.art_crop` is used instead.

---

## 16.4 Cache Behaviour

A module-level `Map` (`cardName → { url, status }`) persists for the lifetime of the browser session.

- `status: 'resolved'` — a valid art URL was found; returned immediately on all subsequent calls.
- `status: 'error'` — the fetch or parse failed; the card is never retried this session.

This guarantees at most one Scryfall request per unique card name per session, keeping usage well within Scryfall's 10 req/sec rate limit.

---

## 16.5 Failure & Fallback Rules

- Any network error, non-OK HTTP status, or missing `image_uris` field → `null` is returned and the error status is cached.
- Malformed JSON or missing expected fields → `console.error` logs the card name and raw response, then `null` is returned.
- The UI falls back to the emoji icon (`CARD_ICON`) at reduced opacity during loading and on any failure.
- **Zero crashes on network failure.** The game renders and plays normally without art.

---

## 16.6 System Constraints

- No game logic. No state mutation. No interaction with DuelCore, reducers, or any engine file.
- The `<img>` element in `CardArtDisplay` does not use `position: absolute` — existing absolutely-positioned overlays (damage badge, summoning sick, ACT button) remain on top via their existing z-ordering.
- No loading spinners or skeleton frames — the emoji at reduced opacity (0.3) is the only loading indicator.

---

# 9. Dungeon System

## 9.1 Authority
DungeonGenerator.js owns dungeon layout generation.
OverworldGame.jsx owns dungeon runtime state (playerPos, entity defeated/collected flags).
DungeonMap.jsx is presentation only.

## 9.2 State Lifecycle
- Dungeon state created on enter; discarded on exit.
- Player HP and gold persist bidirectionally (overworld → dungeon → overworld).
- Cards gained from treasure go directly to binder (not deck).
- No dungeon state survives exit. Re-entering a dungeon tile generates a new dungeon.

## 9.3 Line of Sight
- Raycast from playerPos using Bresenham's line algorithm.
- Any FLOOR or CORRIDOR tile with an unobstructed ray (no WALL tile crossed) becomes revealed.
- Revealed state is permanent for the duration of the dungeon instance.

## 9.4 Entity Rules
- Enemies are stationary. They do not move.
- Stepping onto an enemy tile triggers a duel via the existing DuelScreen bridge (context: `dungeon_entity`).
- Winning the duel returns the player to the dungeon map; the enemy entity is marked defeated.
- Losing the duel applies the standard overworld soft-permadeath rule (HP → 1, ante card lost)
  and ejects the player from the dungeon (dungeonScreen → null).
- Treasure is collected automatically on tile entry; TreasureModal shows the result.
- Exit tile is always in the final generated room.

## 9.5 Dungeon Modifier
- The modifier from MapGenerator (POWER_STRUGGLE, CURSED_GROUND, etc.) is passed through
  to every duel triggered inside the dungeon, identical to the existing dungeon duel flow.

---

# 17. Triggered Ability Pipeline

The Triggered Ability Pipeline is the deterministic system responsible for detecting, ordering, and resolving all triggered abilities in the game. It operates entirely within the reducer-driven game state (DuelCore.js) and must not rely on timing, async behavior, or external I/O.

This system is event-driven and processes triggers as a consequence of explicit game state transitions.

---

## 17.1 Data Model

Cards that possess triggered abilities MUST declare them explicitly in their static definition.

**Card Object Requirements:**

Each card MAY include:

```js
triggeredAbilities: [
  {
    id: string,
    trigger: TriggerDefinition,
    condition?: ConditionDefinition,
    effect: EffectDefinition,
    optional?: boolean,
    requiresChoice?: boolean
  }
]
```

**TriggerDefinition:**

```js
{
  event: EventType,
  scope?: "self" | "controller" | "global",
  source?: "self" | "any" | "controlled"
}
```

**ConditionDefinition (optional):**
Declarative constraints evaluated at trigger time (e.g., "was dealt damage by this source this turn").

**EffectDefinition:**
Declarative description of state mutation (resolved later via effect executor).

**State Tracking Requirements:**

To support abilities like Sengir Vampire, the engine MUST maintain turn-scoped metadata:

```js
turnState: {
  damageLog: [
    {
      sourceId: CardID,
      targetId: CardID,
      amount: number,
      turnId: number
    }
  ]
}
```

This log MUST persist until end-of-turn cleanup.

---

## 17.2 Trigger Registration

The system does NOT use runtime listeners. Instead, triggers are evaluated deterministically whenever an event is emitted.

**Event Emission Contract:**

All state transitions that may produce triggers MUST emit a structured event:

```js
event: {
  type: EventType,
  payload: {...},
  gameStateSnapshot: reference
}
```

**Trigger Evaluation Process:**

Upon event emission:

1. Scan all cards in all relevant zones (battlefield minimum)
1. For each `triggeredAbilities` entry:
- Match `event.type` with `trigger.event`
- Validate `scope` and `source`
- Evaluate `condition` (if present)
1. If valid, enqueue a Trigger Instance into the Trigger Queue

**Trigger Instance Shape:**

```js
{
  triggerId: string,
  sourceCardId: CardID,
  controller: PlayerID,
  eventPayload: object,
  timestamp: integer
}
```

---

## 17.3 Supported Event Types

### 17.3.1 ON_DAMAGE_DEALT

Emitted whenever damage is successfully assigned and applied.

Payload: `{ sourceId, targetId, amount, combat: boolean }`

Used by: Sengir Vampire (tracking condition only)

### 17.3.2 ON_CREATURE_DIES

Emitted when a creature moves from battlefield to graveyard.

Payload: `{ cardId, previousController: PlayerID }`

Used by: Sengir Vampire

### 17.3.3 ON_UPKEEP_START

Emitted at the beginning of each player's upkeep step.

Payload: `{ activePlayer: PlayerID }`

Used by: Force of Nature

### 17.3.4 ON_BLOCK_DECLARED

Emitted during combat when blockers are declared.

Payload: `{ attackerId, blockerId }`

Used by: Protection enforcement (validation phase)

### 17.3.5 ON_ATTACKS_DECLARED

Emitted once when the active player commits attackers, at the transition out of
`PHASE.COMBAT_ATTACKERS` (the same boundary the B14 skip logic uses to count
declared attackers). Not emitted when zero attackers were declared.

Payload: `{ attackerIids: CardID[], attackingPlayer: PlayerID }`

`trigger.scope: 'self'` is NOT usable with this event (that scope value only
resolves against `dyingCardId`, which is `ON_CREATURE_DIES`-specific). Cards that
need "whenever this creature attacks" must use `condition: { type: 'selfIsAttacker' }`,
which checks `payload.attackerIids.includes(card.iid)`.

Used by: Cave People, Hasran Ogress.

### 17.3.6 ON_SPELL_CAST

Emitted in the `CAST_SPELL` reducer after the spell is legally placed on the
stack (not at resolution). Fires for both players' spells.

Payload: `{ casterId: PlayerID, cardIid: CardID, cardType: string, isArtifact: boolean, isCreature: boolean, colors: string[] }`

`colors` splits the card's single-string `color` field (e.g. `"UB"` for
multicolor) into an array so `condition: { type: 'spellColorIncludes', color: 'B' }`
can test membership. `condition: { type: 'spellIsArtifact' }` and
`condition: { type: 'opponentCastArtifactSpell' }` (artifact spell AND
`payload.casterId !== card.controller`) are also supported.

Used by: Citanul Druid, Throne of Bone, Urza's Chalice.

### 17.3.7 ON_PERMANENT_LEAVES_BF

A generic leaves-the-battlefield event. `zMove()` (`src/engine/DuelCore.js`) is
the single choke point for every battlefield -> graveyard/exile/hand move, so
this event is emitted from inside `zMove()` itself whenever the origin zone is
`'bf'` and the destination zone is not `'bf'` (control changes, which move
bf -> bf, do not emit it). This covers lands, artifacts, enchantments, and
creatures in one shot -- no per-card-effect call sites needed.

**Fires alongside `ON_CREATURE_DIES`, not instead of it.** `ON_CREATURE_DIES`
continues to be emitted separately by `checkDeath()` and the Venom combat-end
special case; both events fire for a creature's death.

Payload: `{ cardIid: CardID, previousController: PlayerID, wasLand: boolean, wasArtifact: boolean, wasCreature: boolean, destination: 'gy'|'exile'|'hand' }`

Condition helpers (all require `payload.destination === 'gy'` in addition to
their named check, matching "put into a graveyard" Oracle phrasing):
- `{ type: 'permanentWasLand' }` -- Dingus Egg.
- `{ type: 'ownArtifactLeftBf' }` -- artifact you control died -- Tablet of Epityr.
- `{ type: 'ownArtifactDiedNotSacrificed' }` -- as above, plus the permanent's iid
  is absent from `turnState.sacrificedIids` (see 17.3.7.1) -- Urza's Miter.

Used by: Dingus Egg, Tablet of Epityr, Urza's Miter.

#### 17.3.7.1 Sacrifice tracking (`turnState.sacrificedIids`)

Urza's Miter's Oracle text ("if it wasn't sacrificed") requires distinguishing
a sacrifice from any other graveyard-bound zone change. `turnState.sacrificedIids`
is an array of card iids sacrificed during the current turn, reset at CLEANUP
alongside the other per-turn tracking arrays. It is populated immediately
before the corresponding `zMove(..., "gy")` call at every explicit sacrifice
site: the generic `sac`/`sacArt`/`sacCre` activated-ability cost handling in
`ACTIVATE_ABILITY`, Lord of the Pit's upkeep devour, Ball Lightning's
`sacrificeSelf` upkeep effect, the `sacrificeForMana` spell effect, and Ashnod's
Transmogrant's `CONFIRM_TRANSMUTE_SACRIFICE` handler. Marking happens on the
state passed into `zMove()`, so it is already present by the time `zMove()`
emits `ON_PERMANENT_LEAVES_BF`.

### 17.3.8 ON_END_STEP

Emitted at the `next === PHASE.END` block, after the existing beginning-of-end-step
delayed-effect processing (Rakalite return-to-hand, Xenic Poltergeist revert).
Unscoped, following the same "single event per turn cycle, `activePlayer` payload"
simplification as `ON_UPKEEP_START` (this engine has one `END` phase per turn, not
a separate end step per player).

Payload: `{ activePlayer: PlayerID }`

Used by: Khabál Ghoul.

---

## 17.4 Trigger Queue and Resolution Order

All valid triggers are added to a centralized Trigger Queue.

### 17.4.1 Queue Behavior

- The queue is processed to completion before advancing game phases
- No new player actions may occur while the queue is non-empty

### 17.4.2 Ordering Rules (APNAP)

1. Group triggers by controller
1. AP triggers ordered first, then NAP
1. Within each group, maintain deterministic insertion order

### 17.4.3 Resolution Rules

Each Trigger Instance resolves as follows:

1. Re-validate source existence (if required)
1. Re-check conditions if necessary
1. Execute effect
1. Remove from queue
1. Emit any resulting events (may enqueue new triggers)

---

## 17.5 Upkeep Choice UI Contract (Modal Decisions)

Force of Nature uses a **dedicated upkeep choice path** separate from the general triggered-ability choice path.

### 17.5.1 Upkeep Choice State Shape (`pendingUpkeepChoice`)

```js
pendingUpkeepChoice: {
  cardName: string,
  handlerKey: "forceOfNatureUpkeep",
  options: [
    { id: "PAY_GGGG",    label: "Pay {G}{G}{G}{G}" },
    { id: "TAKE_DAMAGE", label: "Take 8 damage"     }
  ]
}
```

`pendingUpkeepChoice` is set during the UPKEEP phase when the human player controls Force of Nature. AI resolves the same `forceOfNatureUpkeep` case inline without setting this field.

### 17.5.2 Action

Player selection dispatches: `UPKEEP_CHOICE_RESOLVE { choice: "PAY_GGGG" | "TAKE_DAMAGE" }`

- `PAY_GGGG`: deducts 4G from `p.manaPool`; falls back to 8 damage if < 4G available.
- `TAKE_DAMAGE`: calls `hurt(state, 'p', 8, 'Force of Nature')`.
- In both cases `pendingUpkeepChoice` is cleared and the reducer returns the new state.

### 17.5.3 ADVANCE_PHASE Blockade

`ADVANCE_PHASE` returns state unchanged while `pendingUpkeepChoice !== null`. This prevents phase skipping before the player resolves the modal.

### 17.5.4 General Triggered-Ability Choice (RESOLVE_CHOICE)

For triggered abilities with `requiresChoice: true` (not Force of Nature), the general path uses:

```js
pendingChoice: {
  id: string,
  type: "triggered_ability_choice",
  sourceCardId: CardID,
  controller: PlayerID,
  options: [{ id: string, label: string, effect: EffectDefinition }],
  required: true
}
```

Player selection dispatches: `RESOLVE_CHOICE { choiceId, optionId }`. Clears `pendingChoice` and resumes the Trigger Queue.

### 17.5.5 Determinism Requirement

No timers, defaults, or implicit selections allowed. Game cannot advance without explicit input.

---

## 17.6 Protection Enforcement (Combat Integration)

Protection is NOT a triggered ability. It is a static rule enforced at validation points.

### 17.6.1 Definition

Protection from a quality enforces:

- Cannot be targeted by sources of that quality
- Cannot be blocked by creatures of that quality
- Damage from sources of that quality is prevented

### 17.6.2 Enforcement Points

A. **Target Validation** — reject illegal targets before resolution  
B. **Block Declaration** — if `attacker.hasProtectionFrom(blocker.color)`, reject block  
C. **Damage Assignment** — if `target.hasProtectionFrom(source.color)`, prevent damage

### 17.6.3 No Trigger Queue Interaction

Protection is enforced inline. It MUST NOT use the Trigger Queue.

---

## 17.7 Example Mapping

- **Sengir Vampire**: ON_DAMAGE_DEALT → append to `turnState.sengirDamagedIids`; ON_CREATURE_DIES → check `sengirDamagedIids` for `cardId` → enqueue `sengirCounter` trigger → add `P1P1` counter if still on battlefield. **Implementation is card-specific** (checks `card.triggered === 'sengirCounter'`), not a general trigger registry. General registry is deferred.
- **Force of Nature**: upkeep switch case `forceOfNatureUpkeep` → sets `pendingUpkeepChoice` for human player; AI resolves inline. Dispatches `UPKEEP_CHOICE_RESOLVE`.
- **Protection**: enforced during targeting, blocking, and damage; no trigger registration

### damageLog shape

```js
turnState: {
  damageLog: [{ sourceId: string, targetId: string, amount: number, turnId: number }],
  sengirDamagedIids: string[],   // IIDs of creatures Sengir damaged this turn
  powerSurgeUntappedCount: number
}
```

All three fields are cleared / reset at UNTAP (sengirDamagedIids, powerSurgeUntappedCount) or CLEANUP (damageLog).

---

## 17.8 Determinism Guarantees

- All triggers derived from explicit events
- No race conditions or timing dependencies
- Fully reproducible given identical inputs
- Strict phase blocking until all triggers and choices resolve

---

## 17.9 hurt() Damage-Source Meta and Redirection

`hurt(s, who, amt, src = "", meta = null)` in `src/engine/DuelCore.js` optionally
accepts a structured `meta` object describing the damage source, in addition to
the pre-existing display-string `src`. All 81 pre-existing call sites omit `meta`
and are unaffected -- `meta` defaults to `null` and every consumer of it is
optional-chained or null-checked.

### 17.9.1 meta shape

```js
{ sourceIid: CardID, sourceType: 'creature' | 'artifact' | 'spell' | 'ability' | null, combat: boolean, unblocked?: boolean }
```

`sourceType` is the only field consulted by damage tracking or redirection;
`sourceIid` is informational.

### 17.9.2 Call sites that pass meta

- **Combat damage** (`resolveCombat()`): the four `hurt()` calls that deal
  attacker damage to a defending player (unblocked-attacker damage and trample
  overflow, in both the first-strike and regular damage passes) pass
  `{ sourceIid, sourceType: 'creature', combat: true, unblocked }`. `unblocked`
  is `true` only for the `!blockers.length` branch; trample overflow (attacker
  was blocked) passes `unblocked: false`. Lifelink/Spirit Link self-heal calls
  and Wall-of-Dust/Giant-Badger/Murk-Dwellers pump effects are unaffected.
- **Artifact-sourced damage in `resolveEff()`**: a single `srcMeta` is computed
  once per call (`isArt(card) ? { sourceIid: card.iid, sourceType: 'artifact', combat: false } : null`)
  and passed to the `"ping"`, `"damage1"`, `"damage2"`, and `"damage4Any"` cases.
  Because it's keyed off `isArt(card)` rather than a hardcoded card list, any
  future artifact reusing one of these effect keys is automatically tagged;
  non-artifact cards reusing the same keys (Witch Hunter, Prodigal Sorcerer,
  Pirate Ship's `"ping"`) are unaffected since `isArt()` is false for them.
- **Dingus Egg** (`damagePermanentControllerFromArtifact` triggered effect) and
  **Hasran Ogress** (`dealFixedDamageToController` triggered effect) pass meta
  directly at their own new call sites.

**Not tagged (explicit scope limit):** upkeep-switch artifact damage (e.g.
Black Vise) is a separate dispatch path from `resolveEff`/`resolveTriggeredEffect`
and was out of scope for this pass. Reverse Polarity and Martyrs of Korlis will
not see/redirect Black Vise's damage.

### 17.9.3 damageBySourceType tracking (Reverse Polarity)

`turnState.damageBySourceType: { p: { artifact: number, creature: number, ... }, o: {...} }`
is incremented inside `hurt()` whenever `amt > 0` and `meta?.sourceType` is
present, and reset to `{}` at CLEANUP alongside `damageTakenThisTurn`. Reverse
Polarity reads `turnState.damageBySourceType[caster]?.artifact ?? 0`.

Redirected damage (17.9.4) does NOT increment this tracker -- a replacement
effect changes what event occurs, so the player was never actually dealt that
damage (CR 616).

### 17.9.4 damageRedirect hook

Before applying life loss, `hurt()` scans `s[who].bf` for an **untapped**
permanent with a `damageRedirect` flag matching `meta`. If found, the damage is
applied to that permanent as creature damage (`c.damage += amt`) instead of
player life loss, and `checkDeath()` runs immediately so lethal redirected
damage kills the redirect target within the same `hurt()` call.

Two flag shapes are supported (this is a targeted, minimal hook -- not a
general replacement-effect framework):

```js
damageRedirect: { from: 'artifacts' }            // Martyrs of Korlis
damageRedirect: { from: 'unblockedCreatures' }    // Veteran Bodyguard
```

`from: 'artifacts'` matches `meta.sourceType === 'artifact'`. `from: 'unblockedCreatures'`
matches `meta.sourceType === 'creature' && meta.combat && meta.unblocked`. Both
cards' Oracle text reads "as long as this creature is untapped", so the redirect
target is filtered to `!c.tapped` before either shape is checked; a card can opt
out simply by being tapped.

Set directly as a static field on the card-data entry (same pattern as
`lifeFloor`/`preventsDesertDamage`) -- no `triggeredAbilities` registration needed.

---

# 18. Priority Window System

Implements instant-speed interaction at phase transitions. Both players receive a window to cast instants or activate battlefield abilities before the phase advances.

## 18.1 State Shape

Two fields added to GameState (initialized in `buildDuelState`):

| Field | Type | Description |
|-------|------|-------------|
| `priorityWindow` | `boolean` | `true` while a priority window is open |
| `priorityPasser` | `'p' \| 'o' \| null` | which player has already passed this window |

## 18.2 Open/Close/Pass Flow

1. A phase-advance request goes through `requestPhaseAdvance()` (DuelScreen) rather than dispatching `ADVANCE_PHASE` directly.
2. `requestPhaseAdvance()` short-circuits immediately (no-op) if `s.stack.length > 0` — unresolved spells must be resolved before the phase can advance.
3. `requestPhaseAdvance()` performs a smart-suppression check (see 18.4). If suppressed, it dispatches `ADVANCE_PHASE` directly.
4. If not suppressed, it dispatches `OPEN_PRIORITY_WINDOW`. The reducer sets `priorityWindow: true, priorityPasser: null`.
5. Each side passes via `PASS_PRIORITY({ who })`. The reducer records the first passer in `priorityPasser`. When the second distinct side passes, it sets `priorityWindow: false, priorityPasser: null`.
<!-- corrected: effect lives in useDuelController.ts, not DuelScreen directly; extracted per TD-001 resolution -->
6. A `useRef`-guarded `useEffect([s.priorityWindow])` in `useDuelController.ts` detects the `true -> false` transition and calls `resolveStack()` (if items remain) or `advancePhase()` (if stack is empty).

## 18.3 SILENCE Suppression

`OPEN_PRIORITY_WINDOW` is a no-op (returns state unchanged) when:

```
s.castleMod?.name === 'SILENCE'  OR  s.dungeonMod === 'SILENCE'
```

The window is silently skipped; `requestPhaseAdvance()` will have dispatched nothing, so the caller must handle this case. In practice DuelScreen's `useEffect` auto-advance does not fire (window never opened), so a separate direct `ADVANCE_PHASE` must follow. This is handled inside `requestPhaseAdvance()` which falls back to direct advance when the dispatcher no-ops.

## 18.4 Smart Suppression Rule

Before opening a window, `requestPhaseAdvance()` checks:

- Either player's hand contains a card with `type === 'Instant'` or `type === 'Interrupt'`
- Either player's battlefield contains a card with an `activated` property whose `effect` is not in `{ addMana, addManaAny, addMana3Any }`

If neither condition holds for either player, the window is skipped entirely and `ADVANCE_PHASE` fires immediately. This prevents unnecessary pauses when no instant-speed options exist.

## 18.5 ADVANCE_PHASE Blockade

The `ADVANCE_PHASE` reducer case returns state unchanged (with a console warning) under two conditions, checked in order:

1. `s.priorityWindow === true` — a priority decision is still pending.
2. `s.stack.length > 0` — one or more spells are waiting to resolve.

Both conditions must be false before the phase can advance. The `advPhase()` helper function enforces the same stack-length check independently as its first guard, ensuring phase advance is blocked even if called directly rather than through the reducer case.

## 18.6 AI Behavior

<!-- corrected: effect lives in useDuelController.ts, not DuelScreen directly; extracted per TD-001 resolution -->
When `s.priorityWindow` transitions to `true`, a `useEffect([s.priorityWindow, s.active, s.priorityPasser, s.over])` in
`useDuelController.ts` evaluates the AI's options:

1. Search `s.o.hand` for the first card with `type === 'Instant'` and
   `canPay(s.o.mana, c.cost) === true`.
2. If found, dispatch `CAST_SPELL { who: 'o', iid, tgt: 'p', xVal: 1 }`.
3. Always dispatch `PASS_PRIORITY { who: 'o' }` immediately after (no added delay).

The AI casts at most one instant per window. If the AI has no affordable instant, it
passes immediately.

## 18.6b AI Turn — Spell Cast Priority Window

<!-- corrected: stack-length watcher lives in useDuelController.ts, not DuelScreen directly; extracted per TD-001 resolution -->
When the AI casts a spell on its own turn (`active === 'o'`), a separate
`useEffect([s.stack?.length])` in `useDuelController.ts` detects the stack growing from 0 → N and opens a priority
window. This gives the player a chance to respond with instants or interrupts before the
spell resolves. The existing priority-window close → auto-advance path (`priorityWindow
false` transition) then handles `RESOLVE_STACK` and phase advance after both players pass.

**Invariant:** A spell cast by either player must never resolve without offering both
players a priority window first. The `s.stack.length` effect enforces this for AI casts;
`requestPhaseAdvance` → `OPEN_PRIORITY_WINDOW` enforces it for player-initiated phase
advances.

## 18.7 ActionBar Cast Button During Priority Windows

When a priority window is open and the player holds priority, selecting an Instant or Interrupt from hand causes the Cast button in `ActionBar` to appear regardless of the current phase. The Cast Instant button has been removed; the standard ActionBar cast flow handles all speeds.

`ActionBar` condition: `hasSelection && isPlayerTurn && (inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard)))`

- In MAIN_1 or MAIN_2: the Cast button appears for any selected card (sorcery, instant, land).
- In any other phase with a priority window open: the Cast button appears only when the selected card is an Instant or Interrupt.

## 18.8 System Files

<!-- corrected: AI handler, auto-advance effect, and stack-length watcher extracted to useDuelController.ts per TD-001 resolution -->
| File | Role |
|------|------|
| `src/engine/DuelCore.js` | State fields, reducer cases, ADVANCE_PHASE guard |
| `src/hooks/useDuel.js` | `openPriorityWindow`, `passPriority` dispatchers |
| `src/hooks/useDuelController.ts` | Priority window close effect, stack-length watcher, AI priority response, `applyAiActionsWithPriority`, `requestPhaseAdvance` |
| `src/ui/ActionBar/InstantPriorityBar.tsx` | Player priority UI |
| `src/DuelScreen.tsx` | Render only; delegates all orchestration to `useDuelController` |

## 18.10 AI Spell Cast Priority

<!-- corrected: all three AI loop effects extracted to useDuelController.ts per TD-001 resolution; neither DuelScreen.tsx nor DuelScreenMobile.tsx owns these effects directly -->
Both desktop and mobile delegate AI spell cast priority entirely to `useDuelController.ts`. Neither `DuelScreen.tsx` nor `DuelScreenMobile.tsx` owns the AI loop, priority window close effect, or stack-length watcher directly.

### Desktop path (via `useDuelController.ts`)

When the AI casts a sorcery-speed spell during its main phase, `applyAiActionsWithPriority()`
intercepts the AI action array, dispatches tap actions and `CAST_SPELL` as a partial batch,
then calls `openPriorityWindow()`. The `RESOLVE_STACK` that `AI.js` appends is dropped --
the priority window close effect handles resolution once both players pass.

The `hasCast` flag prevents the inner `requestPhaseAdvance()` timer from starting when a
spell was cast. `aiRef.current` is cleared in the priority window close effect, and
`s.stack?.length` is included in the AI loop dependency array so the loop re-runs when
the stack drains after `resolveStack()`.

### Mobile path (via `useDuelController.ts`)

Mobile uses the same `useDuelController.ts` hook. `applyAiActionsWithPriority` is the
single implementation inside the hook; both screens call it identically.

The same three invariants apply:
1. `hasCast` check in the AI loop skips the inner timer when a spell was cast, avoiding
   the race where the timer fires and clears `aiRef.current` while the window is still open.
2. `aiRef.current = false` is set in the priority window close effect (before `resolveStack()`).
3. `s.stack?.length` is in the AI loop dependency array so the loop re-runs when
   the stack drains after `resolveStack()`.

The AI's own priority handler (active !== 'p') passes immediately via 0ms setTimeout,
so on the AI's turn the player sees the window and must click Pass Priority once for the
spell to resolve.

---

## 18.9 ActionBar Turn Guard

`ActionBar` receives three additional props: `isPlayerTurn` (bool), `isWaitingForAI` (bool), and `priorityWindowOpen` (bool).

- **End Turn** is `disabled` when `isPlayerTurn === false`.
- **Pass Priority** is `disabled` when:
  - `isWaitingForAI === true` (priorityWindow open AND `priorityPasser === 'p'`): also relabeled "Waiting..."
  - `!isPlayerTurn && !priorityWindowOpen`: AI turn with no active priority window (nothing for the player to pass)
- **Pass Priority stays enabled** when `!isPlayerTurn && priorityWindowOpen`: the player must still explicitly pass for `'p'` to close an AI-turn priority window (DuelCore's `PASS_PRIORITY` reducer requires both players to pass).
- Cast button is also gated behind `isPlayerTurn` to prevent UI inconsistency.

`requestPhaseAdvance()` (from `usePhaseAdvance`) is shared by both the player UI and the AI loop. The UI guard is in the button `disabled` prop and the `isIdle` keyboard shortcut check — not in `usePhaseAdvance` itself (which must remain unconstrained for the AI loop).

---

# 19. Holy Ground — Landwalk Suppression

Castle modifier for Delenia (White). Implemented as Option B: suppresses all landwalk-type keywords on opponent creatures when the defending player controls Holy Ground.

## 19.1 Implementation Approach

Holy Ground does not use the Trigger Queue. It is enforced statically at two inline evaluation points:

1. **`hasKw(card, keyword, state?)`** — optional third param added. If `keyword` ends in `"WALK"` (e.g. `FORESTWALK`, `ISLANDWALK`, `PLAINSWALK`) and the defending player's battlefield contains a card with `id === "holy_ground"`, the function returns `false` regardless of the card's keyword list.
2. **`canBlockDuel(attacker, blocker, attackerController, blockerController, state?)`** — optional fourth param threads `state` into the LANDWALK blocking-legality check so illegal landwalk-based blocking is also correctly suppressed.

Existing call sites that omit the `state` argument are fully backward-compatible.

## 19.2 Scope

- Suppresses landwalk advantage (cannot be blocked due to landwalk is negated).
- Does NOT grant protection from colors, prevent targeting, or suppress other keywords.
- Applies only when the defending player controls Holy Ground on their battlefield.

## 19.3 System File

| File | Change |
|------|--------|
| `src/engine/DuelCore.js` | `hasKw` + `canBlockDuel` updated with optional `state` param |

---

# 20. Power Surge Upkeep System

Implements the upkeep damage trigger for the Power Surge enchantment. Damage equals the number of untapped lands the active player controlled at the start of their previous upkeep.

## 20.1 State Shape

```js
turnState: {
  powerSurgeUntappedCount: number  // snapshot taken during UNTAP; 0 when Power Surge not in play
}
```

## 20.2 Snapshot and Damage Flow

1. **UNTAP phase**: Before the untap loop runs, if Power Surge is present on either player's battlefield, `turnState.powerSurgeUntappedCount` is set to the count of the active player's currently-untapped lands.
2. **UPKEEP phase**: The `powerSurgeUpkeep` handler reads `turnState.powerSurgeUntappedCount` and calls `hurt(state, controller, count)`. If count is 0, a log entry is added and no damage is dealt.
3. `turnState.powerSurgeUntappedCount` is reset to 0 at the start of each UNTAP phase (whether or not Power Surge is present).

## 20.3 System File

| File | Change |
|------|--------|
| `src/engine/DuelCore.js` | `turnState.powerSurgeUntappedCount` field; UNTAP snapshot logic; UPKEEP handler reads snapshot and calls `hurt()` |

---

# 21. Persistence System

Cross-run unlockables are persisted via `localStorage`. In-run game state is not persisted.

<!-- corrected: usePersistence.ts writes full duel GameState to shandalar:duel on every state change; contradicts the claim above; key is never read back -->
> **OPEN DESIGN QUESTION:** `usePersistence.ts` writes full duel GameState to `localStorage` key `shandalar:duel` on every state change (imported in `DuelScreen.tsx` line 28). This key is never read back. Either (a) document this as an in-run crash-recovery stub and add a read path, or (b) delete `usePersistence.ts` and remove the import. Current behavior contradicts Section 21.1.

## 21.1 Scope

Cross-run unlockables only. In-run state is ephemeral — closing the browser mid-run discards it.

## 21.2 Storage Key

`shandalar_unlockables` in `localStorage`.

## 21.3 Data Shape

```js
{
  magesDefeated:       string[],  // color codes e.g. ["W", "B"]
  powerNineFound:      string[],  // card ids
  arzakonDefeated:     boolean,
  chaosStarterUnlocked: boolean
}
```

In the current implementation, artifact ownership is stored as a flat `{ [id]: boolean }` object keyed by artifact id, merged onto the canonical `OW_ARTS` definitions on load. `OW_ARTS` remains the source of truth for id, name, icon, and description.

## 21.4 Error Handling

All read/write operations are wrapped in `try/catch`. Failure is silent — `console.warn` is the maximum noise level. The game falls back to `OW_ARTS` defaults on any `localStorage` error (quota exceeded, private browsing, malformed JSON).

## 21.5 Implementation

`src/OverworldGame.jsx` — `artifacts` state uses a lazy `useState` initializer that reads from `localStorage` on mount. A `useEffect([artifacts])` writes updated owned flags on every `setArtifacts` call.

## 21.6 System File

<!-- corrected: usePersistence.ts is an additional file writing duel state; undocumented -->
| File | Role |
|------|------|
| `src/OverworldGame.jsx` | Read on mount (lazy initializer); write on every artifact state change |
| `src/hooks/usePersistence.ts` | Writes full duel GameState to `shandalar:duel` on every state change (write-only). See OPEN DESIGN QUESTION above. |

> **OPEN DESIGN QUESTION:** `usePersistence.ts` writes full duel GameState to `localStorage` key `shandalar:duel` on every state change (imported in `DuelScreen.tsx` line 28). This key is never read back. Either (a) document this as an in-run crash-recovery stub and add a read path, or (b) delete `usePersistence.ts` and remove the import. Current behavior contradicts Section 21.1.

---

# Section 22 — Channel Repeatable Mana Action

## 22.1 Overview

Channel is a sorcery that grants the casting player a repeatable mana ability for the rest of the turn: pay 1 life, add 1 {C}. The ability is encoded as a discrete `USE_CHANNEL` action dispatched by the UI or AI, rather than a triggered ability or a passive mana rule.

## 22.2 USE_CHANNEL Action Contract

**Action shape:** `{ type: "USE_CHANNEL", who: "p" | "o" }`

**Preconditions (both must hold; otherwise state is returned unchanged):**
- `state[who].channelActive === true`
- `state[who].life > 1`

**Effect:**
- `life -= 1` (applied via `hurt()` so `lifeAnim: "damage"` fires on the life counter)
- `mana.C += 1`
- Log entry appended: `"${who} pays 1 life to add {C} (Channel)."` (type `"mana"`)

**Cleared at:** `CLEANUP` phase — `channelActive` is set to `false` for both players when `ADVANCE_PHASE` transitions to `CLEANUP`.

## 22.3 UI Contract

The Channel button is rendered in `DuelScreen.tsx` adjacent to the player's Banner (mana pool area) when ALL of the following are true:
- `state.p.channelActive === true`
- `state.active === "p"`
- `state.phase === "MAIN_1" || state.phase === "MAIN_2"`
- `state.p.life > 1`

Clicking dispatches `useChannel()` from `useDuel.js`, which emits `USE_CHANNEL` for `who: "p"`.

## 22.4 AI Behavior

In `planMain` (`AI.js`), after computing available mana and before the spell-selection loop:
1. If `state.o.channelActive && state.o.life > 2`, find the highest-CMC non-land card in hand.
2. Call `buildTapActions` for that spell. If unaffordable, compute `shortfall = max(0, bestSpell.cmc - totalMana)`.
3. Push `min(shortfall, state.o.life - 2)` `USE_CHANNEL` actions to the front of the actions array.
4. Update `virtualState`, `availMana`, and `totalMana` to reflect the extra C mana for subsequent spell planning.

## 22.5 System Files

| File | Role |
|------|------|
| `src/engine/DuelCore.js` | `USE_CHANNEL` reducer case; `case "channel"` sets `channelActive`; CLEANUP clearing |
| `src/hooks/useDuel.js` | `useChannel` dispatcher |
| `src/DuelScreen.tsx` | Channel button (conditional render) |
| `src/engine/AI.js` | Channel greedy top-up in `planMain` |

---

# 23. World Magic Spell System

## 23.1 Authority
MapGenerator.js owns WORLD_MAGICS definitions.
OverworldGame.jsx owns worldMagics[] state and activation logic.
WorldMagicPanel.jsx is presentation only.

## 23.2 Data Shape
Each World Magic in WORLD_MAGICS has:
- id: string (snake_case)
- name: string
- icon: string (emoji)
- type: 'passive' | 'active'
- desc: string
- rarity: 'C' | 'U' | 'R'
- activeCost?: { amuletColor: string, amount: number } | null
- cooldownMoves?: number

## 23.3 Passive Effect Wiring
Passive effects are checked inline at their relevant call site via worldMagics.includes(id).
No event emission — passives are synchronous reads.

## 23.4 Active Effect Wiring
Active effects are triggered via WorldMagicPanel onActivate(id) callback.
Cooldowns are stored in wmCooldowns state (id → movesRemaining) and decremented in doMove.

## 23.5 Acquisition
- Random map event: 3% per step on non-water tiles; only if player does not already own it
- Sage purchase: 150g; only if undiscovered World Magics remain
- No World Magic can be owned in duplicate

---

# 24. Dungeon Visibility (Clue System)

## 24.1 Authority
MapGenerator.js initializes dungeonData.clued = false on all dungeons.
OverworldGame.jsx owns the clue-granting logic.
Tile render is presentation only — reads clued flag.

## 24.2 Visibility Rules
- Unclued dungeon: renders as terrain; walking onto tile has no special effect
- Clued dungeon: shows dungeon icon; walking onto tile opens DungeonModal as normal

## 24.3 Clue Sources
1. Sage tab (25g) — handleSage sets clued = true on a random unclued dungeon
2. Post-duel choice — player selects clue instead of card reward after overworld monster win

## 24.4 Post-Duel Choice Flow
Monster win → compute cardReward + pick random unclued dungeon as dungeonClue →
setPostDuelChoice({cardReward, dungeonClue}) → PostDuelChoiceModal shown →
player chooses → setBinder (card) or setTiles clued=true (clue) → setPostDuelChoice(null)
Gold reward is granted immediately regardless of choice.

---

# 25. City Conquest & Liberation

## 25.1 Authority
OverworldGame.jsx owns conquest state and loss condition check.
MapGenerator.js initializes townData.conquered = false.
TownModal is presentation only.

## 25.2 Conquest Trigger
Mana link event countdown expires → expiredEvents loop marks townData.conquered = true
and sets tile.manaLink = ev.color. Both the manaLink color and conquered flag are
required; manaLink is the color identity, conquered is the service-gate flag.

## 25.3 Loss Condition
useEffect watching tiles: if (conqueredCount / totalTowns >= 0.6) → trigger defeat screen.

## 25.4 Liberation
Entering a conquered town shows Liberate tab instead of normal services.
Liberate fight: tier-3 archetype of conquering color; canFlee = false; no ante.
Win: clears conquered flag, clears manaLink, decrements mana link count.
Loss: no penalty beyond HP loss; town remains conquered.

## 25.5 Context
context = 'liberate' in handleDuelResult is handled before the 'monster' fallback.

---

# 26. Delivery Quest System

## 26.1 Authority
MapGenerator.js generates delivery quest data at map creation time.
OverworldGame.jsx owns activeDelivery state and completeDelivery logic.
TownModal Guild Hall tab is presentation only.

## 26.2 Quest Shape
Delivery quests on townData have conditionType: 'delivery' and additional fields:
- destTownName: string
- item: string
- accepted: boolean
- completed: boolean
- rewardType: 'manalink' | 'gold' | 'card'
- rewardGold: number

## 26.3 Acceptance
Guild Hall onAcceptQuest sets activeDelivery state and marks quest.accepted = true on
source town tile. Only one delivery quest can be active at a time.

## 26.4 Completion
On opening any town modal: if activeDelivery && tile.townData.name === activeDelivery.destTownName
→ completeDelivery() called automatically. No player action required.

## 26.5 Reward Resolution
manalink → increment random alive color mana link count
gold → add rewardGold to player.gold
card → add random non-land card from CARD_DB to binder

## 26.6 HUD Indicator
Active delivery renders a persistent banner in the HUD:
📦 Delivering: [item] → [destTownName]
Cleared when activeDelivery = null.

---

# 27. Enemy Tier System

## 27.1 Tier HP Values
| Tier | Role | HP | Bribeable |
|------|------|-----|-----------|
| 1 | Weak | 10 | Yes |
| 2 | Typical | 14 | Yes |
| 3 | Strong | 18 | Yes |
| 4 (Henchman) | Elite | 24–27 | No |
| Castle Boss | Boss | 38–42 | No |

## 27.2 MONSTER_TABLE
Defined in MapGenerator.js. Tiers 1–3 grouped by biome key (one color/archetype per biome).

Encounter monster selection is **decoupled from terrain**: `pickMonster(tier, rand)`
(MapGenerator.js) returns a tier-appropriate monster from a **random biome list** (uniform
across all five), so the player sees a variety of archetypes/colors everywhere regardless of
the tile they stand on. The biome key is no longer used as a lookup index at encounter time.

Tier (difficulty) is still set at spawn by distance/move count: initial spawns scale tier by
distance from center; spontaneous spawns are tier 1–2; ruin guardians are tier 2. Sprite
appearance follows the chosen archetype (`spriteForMonster` -> `KIND_BY_ARCH`/`COLOR_BY_ARCH`),
not the terrain. `rand` is injected by the caller (overworld uses `Math.random`).

## 27.3 HENCHMAN_TABLE
Defined in MapGenerator.js. One per color. Spawns at moves > 80, ~4% per step.
canFlee: false — henchmen cannot be bribed.
Alive henchmen filtered by magesDefeated before spawn selection.

## 27.4 openEncounterPopup canFlee override
monsterMeta.canFlee takes priority over the default (true) when explicitly set.

## 27.5 Enemy Movement Tick Rate

Enemy AI movement is driven by the RAF loop in `OverworldGame.jsx`. `tickEnemyAI()` is called every `TICK_INTERVAL` frames (not every frame), controlling movement speed without affecting movement distance per step.

| Constant | Value | Effective speed (60 fps) |
|----------|-------|--------------------------|
| `TICK_INTERVAL` | `36` | ~0.6 s per step |

Only `TICK_INTERVAL` controls speed. Movement distance per step, pathfinding logic, and collision detection are independent and must not be changed to adjust speed.

## 27.6 Enemy Grace Period

`graceMoves` prop (number): counts player steps since last overworld entry. Enemy AI tick is suppressed while `graceMoves < GRACE_MOVE_THRESHOLD (3)`. Reset to 0 on every overworld entry event.

- `GRACE_MOVE_THRESHOLD = 3` — exported constant from `src/engine/EnemyAI.js`
- `graceMoves` state lives in `OverworldGame.jsx`; incremented in `doMove` (capped at threshold to prevent unbounded growth), reset to 0 in `handleDuelEnd` and `handleDungeonExit`
- `tickEnemyAI(enemies, playerPos, tiles, TERRAIN, graceMoves)` — 5th parameter; defaults to `GRACE_MOVE_THRESHOLD` (no freeze) when omitted for backwards compatibility
- Applies to all platforms equally (not mobile-only)

---

# 28. MCTS (Monte Carlo Tree Search) AI Module

## 28.1 Authority
src/engine/MCTS.js is read-only with respect to game state.
All state transitions use duelReducer directly.
AI.js calls MCTS.js for high-stakes decisions when budget allows.

## 28.2 Purpose
Provides rollout-based move scoring as a complement to the heuristic AI in AI.js.
Used for candidate move evaluation when the AI has multiple plausible actions.

## 28.3 API
- `rollout(state, depthLimit=20)` — simulates a game from the given state up to depthLimit turns; returns 'p' or 'o' (winner).
- `scoreMoves(state, candidateMoves, budgetMs=800)` — runs UCB1-allocated rollouts for each candidate move within the time budget; returns moves sorted by win rate.
- `getBestMove(state, candidateMoves, budgetMs=800)` — returns the single highest-scoring candidate.

## 28.4 Constraints
- Read-only: no mutation of the passed state. All rollouts operate on deep-copied state.
- Policy play: uses `policyMainAction` (highest-CMC affordable spell, land-first) and `policyAttack` (evasion-aware, avoids suicidal attacks). Blocking retains the existing `randomBlock` heuristic (favorable-trade or life-threat block).
- Board evaluator: `evaluateBoard(s, who)` replaces the old `heuristicWinner`. Scores life delta (*1.5), board power/toughness with evasion weights (flying *1.4, trample *1.1, toughness *0.3) times 2.0, hand size delta (*1.2), and mana development delta (untapped lands + pool) times 0.5. Used at rollout terminal/fallback.
- Budget enforcement: UCB1 bandit allocator — each candidate is seeded with 3 rollouts before UCB1 selects the most promising candidate for each remaining iteration within the time budget. Exploration constant C = sqrt(2).

## 28.5 Known Limitations
- Rollout fidelity is intentionally capped (TD-003 resolved): one cast per main phase (no multi-cast loop), tgt:null (untargeted), immediate RESOLVE_STACK (no in-rollout opponent responses). Multi-cast looping is a future fidelity upgrade.
- Exact-cost tapping via computeTaps uses produces[0] only; dual lands are treated as their first color. Fine for current land pool.
- planMain MCTS call (AI.js:603) passes { type: 'PLAN' } actions not recognized by duelReducer; both candidates evaluate from identical states. That call site's MCTS output is statistically meaningless (deferred fix, not in MCTS.js scope).

---

# 29. cardHandlers.js — Effect Execution Module

## 29.1 Authority
src/engine/cardHandlers.js is imported exclusively by DuelCore.js.
It owns the implementation of individual card effect functions.
DuelCore.js calls handlers; handlers mutate state via pure functions and return new state.

## 29.2 Purpose
Splits card effect logic out of the main DuelCore reducer to keep file size manageable.
Each exported function corresponds to one or more card effect identifiers.

## 29.3 Constraints
- Cannot import from UI files.
- Cannot dispatch actions — returns state directly.
- Must remain deterministic given the same input state.
- All random decisions must use the seeded RNG from state (not Math.random directly).

---

# 30. Mana Tap Undo

## 30.1 State Field

**`manaTapSnapshot`** — `{ pBfTapped: [{iid, tapped}], pMana: ManaPool } | null`

Snapshot of player battlefield tap states and mana pool taken immediately before the first player mana tap of the turn. Cleared when a spell is cast, when the phase advances, or when `UNDO_MANA_TAPS` is dispatched. `null` = undo unavailable.

## 30.2 UNDO_MANA_TAPS Action

- **Who:** Player only (p)
- **Preconditions:** `manaTapSnapshot !== null`, stack is empty. The Undo Mana Taps button is visible whenever `state.active === 'p'`, `state.stack.length === 0`, and `state.manaTapSnapshot !== null`. It is not restricted to main phases.
- **Effect:** Restores `p.bf` tapped states and `p.mana` from `manaTapSnapshot`; clears `manaTapSnapshot`
- **Purpose:** Allows the player to un-tap mana sources tapped this turn (before or after casting a spell, as long as the stack has drained)

## 30.3 Snapshot Lifecycle

- Taken on the first `TAP_LAND` or `TAP_ART_MANA` action by the player when `stack.length === 0` (stack must be empty; replaces the old `spellsThisTurn === 0` guard)
- Also taken by `ACTIVATE_ABILITY` `addMana3Any` (Black Lotus) at tap time, before the color picker opens
- Cleared by: `CAST_SPELL`, `ADVANCE_PHASE`, `CLEANUP` phase entry, `UNDO_MANA_TAPS`, `CHOOSE_LOTUS_COLOR`, or `CANCEL_LOTUS`
- A new snapshot is taken after any spell resolves and drains the stack to zero, enabling undo for subsequent taps
- AI taps (`action.who === 'o'`) never create or affect the snapshot
- `UNDO_MANA_TAPS` is blocked (returns state unchanged) when `pendingLotus === true`; `CANCEL_LOTUS` owns rollback in that window

## 30.4 Black Lotus Activation Flow

| Action | Effect on Lotus | Effect on manaTapSnapshot |
|---|---|---|
| `ACTIVATE_ABILITY` (addMana3Any) | Taps card; sets `pendingLotus`, `pendingLotusIid` | Created (if null) |
| `CHOOSE_LOTUS_COLOR` | Sacrifices via zMove; clears `pendingLotus` | Cleared (set to null) |
| `CANCEL_LOTUS` | Untaps card; clears `pendingLotus` | Cleared (set to null) |
| `UNDO_MANA_TAPS` | Blocked while `pendingLotus === true` | Unchanged |

---

# 32. Lord Effect System (Continuous Static Abilities)

## Description
Lord effects (Goblin King, Crusade, Bad Moon) are continuous static abilities evaluated
at read time via `getPow`/`getTou`/`hasKw`, not one-time state mutations.

## State Shape
No new state fields. Lords are identified by `effect: "lordEffect"` or legacy
`effect: "globalPump"` on battlefield permanents.

## Matching Rules
- Color targets (`"white"`, `"black"`, etc.): match `card.color` via COLOR_MAP (`white` -> `W`, etc.)
- Subtype targets (`"goblin"`, etc.): match `card.subtype` via lowercase word split
- Lords do not affect themselves (iid guard)
- Multiple lords of the same type stack additively

## Keyword Grants
Lords may grant keywords via `lordKeywords: string[]` on the card data.
`hasKw()` reads this layer last, after `enchantments[]` and `eotBuffs[]`.

## Landwalk Evaluation
All landwalk checks in `canBlockDuel` use specific keyword IDs (MOUNTAINWALK, FORESTWALK, etc.)
with `land.subtype?.toLowerCase().includes(type)` matching to correctly handle dual lands.
Dual lands must have `subtype` set (e.g. `"Island Mountain"` for Volcanic Island).

---

# 31. Test Infrastructure

## 31.1 Shared Factory Module

Shared test factories live in `src/engine/__tests__/_factory.js`.
All `__tests__` files and scenario files import from this module.
Do not duplicate `makePlayerState`, `makeState`, `makeCreature`, `makeLand`, or `makeSpell` in individual test files.

Exported factories:
- `makePlayerState(overrides = {})` -- default 20-life player with empty zones and zero mana
- `makeState(overrides = {})` -- minimal valid GameState; defaults to `PHASE.MAIN_1`, active `'p'`, turn 1
- `makeCreature(iid, overrides = {})` -- 2/2 Green Grizzly Bears, controller `'o'`
- `makeLand(iid, overrides = {})` -- Forest, produces G, controller `'p'`
- `makeSpell(iid, overrides = {})` -- Lightning Bolt, Instant, Red, cmc 1, controller `'p'`

## 31.2 Scenario Tests

Scenario-based regression tests live in `tests/scenarios/`.
Each file covers exactly one bug or feature. Use `tests/scenarios/_template.test.js` as a starting point.
Both the `__tests__` files and `tests/scenarios/` files import factories from the same shared module.

---

## 31.3 E2E Testing Infrastructure

Playwright config lives at `playwright.config.js`. All E2E tests now live in `tests/e2e/`. The `e2e/` directory was consolidated into `tests/e2e/` on 2026-06-24; the prior "new/legacy" framing (e2e/ = new, tests/e2e/ = legacy) is superseded and no longer applies.

Sandbox mode (`?duel=sandbox`) is the required entry point for all e2e tests.
It loads `public/sandbox-decklist.txt` at runtime and is completely inert in
normal builds -- no URL param, no sandbox behaviour.

<!-- corrected: default aiSpeed is 400ms from useTweaks.ts readAiSpeedParam(), not 800ms (800ms is useDuelController's hook parameter default when caller omits the argument) -->
The `?aiSpeed=<ms>` param overrides the initial value of `tweaks.aiSpeed`
(defined in `useTweaks.ts`). When the param is absent, `readAiSpeedParam()` returns **400 ms** (not 800 ms; 800 ms is the `useDuelController` hook-parameter default used only when the caller does not pass `tweaks.aiSpeed`). Set to 0 in all e2e tests to eliminate AI timing
non-determinism.

<!-- corrected: only tests/e2e/sandbox.spec.ts was previously documented; additional spec files exist -->
### E2E Spec Inventory

| File | Description |
|------|-------------|
| `tests/e2e/sandbox.spec.ts` | Core sandbox smoke tests |
| `tests/e2e/duel-controller.spec.ts` | `useDuelController` integration scenarios |
| `tests/e2e/enchanted-slot.spec.ts` | Enchanted-slot rendering and interaction |
| `tests/e2e/mobile-targeting.spec.ts` | Mobile explicit-target flow |
| `tests/e2e/ai-mana-tracking.spec.js` | AI virtual mana tracking across multi-spell turns |
| `tests/e2e/difficulty.spec.js` | Difficulty system (life totals, deck generation) |
| `tests/e2e/instant-cast-priority-window.spec.js` | Instant-speed cast priority window |
| `tests/e2e/undo-mana-taps-all-phases.spec.js` | Mana tap undo across all eligible phases |

`window.__duelDispatch` and `window.__duelState` are exposed only when
`config.sandbox === true`. They are cleaned up on unmount.

`SANDBOX_FORCE_HAND` is the only engine action added for sandbox purposes. It
moves named card iids from `p.lib` into `p.hand` with no game rules evaluated.
It lives in `DuelCore.js` `duelReducer` and is the only permitted engine touch in
this feature set. Hand size limits are not enforced for this action.
`SANDBOX_FORCE_HAND` appends to the target player's hand; it does not replace
it. To test stack/priority-window behavior involving a specific AI spell,
dispatch CAST_SPELL with `who: 'o'` directly after injecting the card rather
than relying on the AI planner loop to select and cast it.

`data-testid` attributes exist on: ActionBar buttons, Hand cards, PhaseBar pills,
and the DuelScreen wrapper. They carry no runtime overhead.

---

# 33. Difficulty System

## 33.1 Overview

Difficulty is selected at game start and stored in `startConfig.difficulty` (string key of `DIFFICULTIES`). It is read-only for the duration of the campaign.

Source of truth: `src/data/difficulties.js`

## 33.2 Player life

`difficulty.startingLife` sets both overworld HP and duel starting life. Color choice does not affect life totals. Mana links can increase max/current HP above this base.

## 33.3 Enemy duel life

Enemy duel life = `difficulty.tierLife[tier - 1]`. Tier is 1-3 and is set at enemy spawn time in `MapGenerator.js`. The `hp` field on `MONSTER_TABLE` entries is legacy display only.

## 33.4 Boss life

Boss duel life = `difficulty.bossBase + (magesDefeated.length x difficulty.bossPerKill)`. Computed at encounter open time using current `magesDefeated` array length. Arzakon (fought after all 5 mages) receives the full 5-stack bonus.

## 33.5 Starting deck generation

`generateStartingDeck(primaryColor, difficultyId, seed)` in `difficulties.js` produces a randomized deck. Color distribution follows `difficulty.colorWeights`. Card draw is weighted by rarity (C: 10, U: 4, R: 1) with an off-color multiplier per difficulty. Colorless artifacts are eligible at all difficulties but treated as one rarity step up; rare artifacts are excluded. Land count targets ~42.5% of deck size with per-difficulty variance. Land color split is proportional to spell color counts with per-difficulty shift variance.

---

## Known Technical Debt

### TD-001: Duplicated AI priority logic across DuelScreen.tsx and DuelScreenMobile.tsx

DuelScreenMobile.tsx contained its own hand-rolled AI priority window handler that
dispatched CAST_SPELL directly rather than delegating to aiDecide(). This was partially
fixed in Sprint 7 (universal stack prompt) -- the priority window handler now delegates
to aiDecide() in both files.

However, both files still own separate copies of:
- Priority window close useEffect
- Stack-length watcher useEffect
- AI loop useEffect

**Resolved (Sprint 8):** All three effects, plus the sandbox escape hatch, game-over timer,
and mulligan state, have been extracted into `src/hooks/useDuelController.ts`. Both
`DuelScreen.tsx` and `DuelScreenMobile.tsx` now delegate entirely to this hook. The mobile
AI loop bug (calling `applyAiActions` with the full action list instead of slicing at
`CAST_SPELL`) is fixed — `applyAiActionsWithPriority` is the single implementation inside
the hook.

---

### TD-002: MCTS plan selection uses unrecognized action type — RESOLVED

**Was:** `planMain` wrapped candidate plans as `{ type: 'PLAN', actions }` objects.
`duelReducer` does not recognize `PLAN`; rollouts evaluated from identical states;
MCTS output was statistically meaningless for KARAG.

**Fix (applied):** `scoreMoves` in `MCTS.js` now accepts an optional `nextState` field
on candidate objects. When present, it is used as the rollout start state directly,
bypassing `duelReducer`. `planMain` now passes `nextState: primaryVirtual` and
`nextState: altVirtual` so each plan's rollout begins from the correct post-plan
position. The `planAttack` call site is unaffected (it passes valid engine action types
with no `nextState` field).

---

### TD-003: MCTS rollout pass-fest — rollout never taps lands — RESOLVED

`policyMainAction` now builds `available` mana (pool + untapped-land production) to
correctly filter castable spells. `stepOnce` calls `computeTaps()` to dispatch exact-cost
`TAP_LAND` actions before each `CAST_SPELL`, then drains the stack with `RESOLVE_STACK`.

**Residual note (not a bug):** Rollout fidelity is intentionally capped for speed:
one cast per main phase (no multi-cast loop), `tgt: null` (untargeted), immediate
`RESOLVE_STACK` (no in-rollout opponent responses). Multi-cast looping is a future
fidelity upgrade, not a bug fix.

---

# 18. Layer System

## 18.1 Purpose

`src/engine/layers.js` is the single authority for computing a permanent's
characteristics. It applies continuous effects in CR 613 layer order.
`getPow`, `getTou`, and `hasKw` in DuelCore.js are thin wrappers that call
`computeCharacteristics(card, state)`.

## 18.2 Layer Order

| Layer | What it changes |
|-------|----------------|
| 4 | Card types and subtypes |
| 5 | Color |
| 6 | Keywords and protection (add/remove) |
| 7a | CDA power/toughness (e.g. Plague Rats, Keldon Warlord) |
| 7b | Set power/toughness to a specific value (e.g. Sorceress Queen) |
| 7c | Modify power/toughness by delta (counters, auras, lord effects, eotBuffs) |
| 7d | Switch power and toughness |

## 18.3 Timestamp

Permanents receive an `enterTs` integer when they enter the battlefield via `zMove`.
`layerClock` on GameState is a monotonic counter that provides this value.
Within each layer, effects are applied in ascending `enterTs` order.
Permanents that enter via `RESOLVE_STACK` receive `enterTs: undefined`, which
defaults to 0 in the layer engine.

## 18.4 Adding New Layer Effects

To implement a card that modifies characteristics:

1. For static aura effects: add `layerDef` to the `mod` object in the aura's
   card definition in `cards.js`.
2. For static enchantment/permanent effects: add `layerDef` directly to the
   card definition.
3. For temporary effects from spell resolution: push a `{ layerDef: {...} }`
   entry to the target permanent's `eotBuffs` in the DuelCore action handler.
4. The `computeCharacteristics` function picks up all three sources automatically.

## 18.5 Constraints

- `layers.js` is a pure module: no GameState mutation, no side effects.
- `layers.js` imports `isLand`, `isCre`, `isArt` from `DuelCore.js` (circular import, safe).
- `DuelCore.js` imports `computeCharacteristics` from `layers.js`.
- No other file imports from `layers.js` directly; go through `getPow`/`getTou`/`hasKw`.

## 18.6 Layer 1 — Copiable-Values Snapshot (Copy Artifact)

Layer 1 (copy effects) is handled at resolution time in `DuelCore.js`, not as a continuous
pass in `computeCharacteristics`. When Copy Artifact resolves:

- `resolveEff` looks up the target artifact's static record in `CARD_DB` by `id`.
- A `newPerm` object is built from the CARD_DB entry (printed values only: name, cost, cmc,
  color, type, subtype, power, toughness, text, keywords, effect, layerDef, activated, mod).
  Live battlefield state (counters, auras/enchantments[], eotBuffs) is NOT copied.
- The type string is extended to include "Enchantment" (Copy Artifact retains its Enchantment
  type in addition to the copied types).
- `newPerm` is placed on the bf directly from `resolveEff`. RESOLVE_STACK's normal ETB push
  is skipped by the `alreadyOnBf` guard added in Sprint A1.
- If no legal artifact target exists, Copy Artifact enters as a plain inert Enchantment.

## 18.7 Layer 2 — Conditional Control Change (Aladdin, Old Man of the Sea, Guardian Beast)

Layer 2 (control-changing effects) uses a `controlGrant` field stored directly on the
stolen permanent (not in `eotBuffs`, which expire at cleanup).

### controlGrant shape

```js
controlGrant: {
  grantorIid:        string,   // iid of the granting permanent (Aladdin or Old Man)
  grantorController: string,   // 'p' | 'o' -- original owner, target of revert
  condition:         string,   // 'whileGrantorControlled' | 'whileTappedAndPowerLte'
  maxPower?:         number,   // Old Man only: power of Old Man at activation time
}
```

### revertControlGrant(state, stolenIid)

Module-level helper in DuelCore.js. Moves the permanent back to `grantorController`'s bf,
strips `controlGrant`, resets `tapped:false, summoningSick:false, attacking:false, blocking:null`.

### checkControlGrants(state)

Called at the end of every `checkDeath` pass. Evaluates each bf permanent with a
`controlGrant`:
- `whileGrantorControlled`: if the grantor is no longer on any bf, revert.
- `whileTappedAndPowerLte`: if the grantor is not tapped, or if the stolen creature's
  computed power exceeds `maxPower`, revert. (Real-time P/T recheck simplified to SBE-pass
  only -- no hook for mid-turn P/T mutations.)

### Old Man of the Sea pre-untap hook

Before the untap `.map()` in the UNTAP phase block (DuelCore.js), a loop checks if Old Man
would untap this step (not blocked by Meekstone or Paralyze). If so, any creatures stolen
under `whileTappedAndPowerLte` are reverted first, then Old Man untaps normally.
The optional "choose not to untap" clause is not implemented (no UI mechanism).

### Guardian Beast (static prevention)

`effect:"guardianBeast"` on the card causes `collectEffects` in `layers.js` to grant
`INDESTRUCTIBLE` (Layer 6) to all same-controller noncreature artifacts while it is untapped.

In `DuelCore.js`:
- `aladdinsSteal` case: fizzles if the target is a noncreature artifact protected by an
  untapped Guardian Beast controlled by the same player.
- `enchantCreature` case: returns early if the target is a noncreature artifact protected
  by an untapped Guardian Beast. The pre-existing-aura exception is handled by this being an
  "at-enchant-time" check only; auras already attached before Guardian Beast entered are
  unaffected.

## 18.8 Layer 3 — Persistent Text Substitution (Sleight of Mind, Magical Hack)

Layer 3 effects use **baked-in field mutation** at resolve time so that direct `.color` and
`.keywords` reads in DuelCore.js and AI.js see the substituted value without going through
`computeCharacteristics`.

### Sleight of Mind (color substitution)

At resolution: mutates `card.color` in state if `card.color === fromColor`. Stores
`textSwap: { type:'color', from, to, enterTs }` on the card for layer tracking.

### Magical Hack (land-type substitution)

At resolution: replaces `fromKw` with `toKw` in `card.keywords[]`. Stores
`textSwap: { type:'landtype', from, to, enterTs }` on the card.

### Layer 3 in computeCharacteristics

`collectEffects` reads `card.textSwap` and pushes a `{ layer:3, ... }` entry.
`computeCharacteristics` re-applies the substitution from `textSwap` (idempotent on an
already-mutated field; ensures correct computed output for all callers using the layer
pipeline). `from/to color` are processed in Layer 3 before Layer 5, and `from/to landtype`
keyword swaps are processed in Layer 3 before Layer 6.

### Passing from/to values through the stack

`CAST_SPELL` stores `fromColor`, `toColor`, `fromKw`, `toKw` from the dispatch action onto
the stack item so `resolveEff` can read them. The UI is responsible for populating these
fields when the player selects the substitution targets.

## 18.9 Layer 4 -- Baked Type-Effect Fields (Living Lands, Kormus Bell, Blood Moon, Evil Presence)

Deferral Sweep 2. Closes the gap where `computeCharacteristics` could compute a Layer-4
type change for display, but `isCre`/`isLand` and every hot-loop combat/death/AI predicate
read `card.type` directly and never saw it.

### Design: baked recompute, not per-call layers evaluation

`isCre`/`isLand` do **not** call `computeCharacteristics()`. That would walk every
battlefield effect on every invocation, and both predicates run in combat resolution,
`checkDeath`'s SBE loop, and AI/MCTS search -- multiplying cost and risking re-entrancy
(reading state that is mid-mutation). Instead, `DuelCore.js` bakes the computed result onto
each battlefield permanent as four optional fields, written by `recomputeTypeEffects(state)`
(exported from `DuelCore.js`):

| Field | Meaning when present |
|---|---|
| `typeEff` | Space-joined computed type string (e.g. `"Land Creature"`). Absent = use `card.type`. |
| `subtypeEff` | Space-joined computed subtype string (e.g. `"Swamp"`). Absent = use `card.subtype`. |
| `colorEff` | Computed color, only baked when a type-changing effect also sets it (Kormus Bell). Absent = use `card.color`. UI-only consumer (Card.jsx); state-aware callers should prefer `computeCharacteristics(card, state).color` directly (see `canBlockDuel` below). |
| `landTypeOverride` | Set to a basic land type name (`"Mountain"`, `"Swamp"`, etc.) when a Layer-4 effect **fully replaced** (not merely added to) a land's subtype down to exactly one recognized basic land type it didn't print. Drives the "lost its printed abilities, taps for only that color" simplification for Blood Moon and Evil Presence. |

```js
export const isLand = c => { const t = c?.typeEff ?? c?.type; return t === "Land" || !!t?.includes("Land"); };
export const isCre  = c => !!(c?.typeEff ?? c?.type)?.includes("Creature");
```

`isLand` keeps both the strict-equality and substring branches: Living Lands/Kormus Bell
produce a `typeEff` of `"Land Creature"`, which must still satisfy `isLand`.

**Audit result: no existing isLand call site's true/false answer changes.** `card.type` (the
raw printed field) is never mutated by this feature -- only the new `typeEff` field is added
-- so before this sweep every permanent's `isLand()` result was already computed from the
same raw field this sweep still falls back to when no type-changing effect is baked. The
only permanents that ever get a non-empty `typeEff` are Forests/Swamps animated by Living
Lands/Kormus Bell, and for those `isLand` still returns `true` (via the substring branch)
exactly as it did before (via the strict-equality branch on the still-unchanged
`card.type`). Blood Moon and Evil Presence only ever touch `subtypeEff`/`landTypeOverride`,
never `typeEff`, so they don't affect `isLand` at all. The substring branch is added for
forward compatibility (a future effect that changes a land's base *type*, not just
subtype) and is exercised by `tests/scenarios/type-eff-baking.test.js`.

### `globalTypeEffect` (Living Lands, Kormus Bell, Blood Moon)

A new `collectEffects` section in `layers.js`, structurally parallel to the existing
`lordEffect`/`globalPump` section but for LANDS matched by a fixed filter instead of
creatures matched by subtype/color, and modifying Layer 4 (type)/Layer 5 (color)/Layer 7b
(set P/T) instead of Layer 6/7c:

```js
{ effect: 'globalTypeEffect', globalTypeEffect: { filter: 'Forest'|'Swamp'|'nonBasicLand',
  addTypes?, setSubtypes?, setPower?, setToughness?, setColor? } }
```

`matchesGlobalTypeFilter(card, filter)` matches against the affected card's **base printed**
type/subtype, not any already-baked `typeEff`/`subtypeEff` -- `collectEffects` snapshots all
effects before applying them in timestamp order, so this intentionally does not chase
dependencies between two type-changing effects stacked on the same land (e.g. Evil Presence
+ Living Lands on one Forest). This is a documented SIMPLIFICATION consistent with this
codebase's existing precedent for layer edge cases.

`resolveEff`'s `case "globalTypeEffect"` is log-only (mirrors `lordEffect`/`globalPump`) --
the effect is entirely read-time, applied via `collectEffects` and baked by
`recomputeTypeEffects`.

### Evil Presence: existing `enchantLand` + `layerDef` machinery

Evil Presence needed no new mechanism -- it fits the existing per-permanent aura path:
`effect: 'enchantLand', mod: { layerDef: { layer: 4, setSubtypes: ['Swamp'] } }`.
`collectEffects` already reads `aura.mod.layerDef` for attached auras (see S18.4).

### `recomputeTypeEffects(state)` -- where it's called from and why

One choke point does not exist (permanents enter/leave the battlefield via several
different code paths), so it's called from three well-defined points, chosen because they
are the only places new type-changing effect *sources* can appear/disappear or a land can
enter under an existing one:

1. **`zMove`** (end of function, when `tz === 'bf' || fromZone === 'bf'`): the documented
   single choke point for every bf <-> gy/exile/hand/lib move. Covers `checkDeath` (a land
   dying while animated), destroy/bounce effects, and tutor-to-bf effects.
2. **`PLAY_LAND`** (end of case): a land entering while Living Lands/Kormus Bell/Blood Moon
   is already out must be baked immediately.
3. **`RESOLVE_STACK`** (end of case, after the ETB push and `onResolve`): covers Living
   Lands/Kormus Bell/Blood Moon themselves entering (animating every matching land already
   on the battlefield) and Evil Presence attaching (via `enchantLand`, invoked earlier in
   the same case through `resolveEff`).

`zMove`'s non-`bf` zone-reset branch (`tz === "gy"|"hand"|"exile"|"lib"`, broadened from the
previous `"gy"|"hand"`-only check to also cover `exile`/`lib`) now also resets
`typeEff`/`subtypeEff`/`colorEff`/`landTypeOverride` to `undefined` -- a land that dies while
animated by Living Lands must arrive in the graveyard as a plain land card, not a creature.

### Summoning sickness

`PLAY_LAND` previously hardcoded `summoningSick: false` (lands had no `{T}`-ability
sickness restriction). Now that a land can become a creature, it sets
`summoningSick: !hasKw(c, HASTE)` like every other zone-entering permanent. This is safe for
existing (non-animated) lands: nothing reads `summoningSick` on a land unless `isCre()` is
also true. The UNTAP-step pass already clears `summoningSick` for every permanent
(including lands) at the start of its controller's turn regardless of type, so "was this
land already under my control when the turn began" is tracked correctly for free.

### Mid-combat revert (CR 506.4-adjacent)

`recomputeTypeEffects` detects, per permanent, `isCre(before) && !isCre(after)`. If the
permanent was `attacking`/`blocking` when it lost creature-ness, it's cleared
(`attacking: false, blocking: null`) and spliced out of `state.attackers` -- the same
pattern the pre-existing `ebonyHorse` case uses for a creature that leaves combat alive
(untap-and-remove-from-combat), minus the untap (losing creature-ness doesn't untap it).
This deliberately does **not** also clean `state.blockers` map entries or other creatures'
`.blocking` pointers referencing the departed attacker -- `ebonyHorse` doesn't either, and a
blocker whose attack target is no longer iterated in `resolveCombat`'s `for (const attId of
state.attackers)` loop simply deals/receives no damage from that pairing, which is the
existing tolerated-dangling-reference behavior for a creature that dies mid-combat (see
`if (!att) continue` in the same loops, now broadened to `if (!att || !isCre(att)) continue`
as defense-in-depth).

### Blood Moon / Evil Presence: mana and ability loss (`landTypeOverride`)

Real Blood Moon does not remove a nonbasic land's non-type-derived printed abilities (per
Gatherer rulings) -- this project's Forge-derived design directive for both Blood Moon and
Evil Presence deliberately simplifies this: a land whose subtype is fully replaced down to
one basic type is treated as having lost its other printed abilities and having only that
basic type's mana ability. `landTypeOverride` (see table above) drives two targeted
overrides, not a new subsystem:

- `applyOvergrowthTap` (the actual land-tap-for-mana resolver, despite its name): if
  `c.landTypeOverride` is set, the tapped-for color is forced to that type's mana
  (`{Plains:W, Island:U, Swamp:B, Mountain:R, Forest:G}`), overriding both the caller's
  requested color and `c.produces`.
- `ACTIVATE_ABILITY`: a single guard at the top of the case (`if (card.landTypeOverride)
  return ...`) blocks every other printed ability. Safe as a single choke point because a
  land's basic-type mana ability is never itself routed through `ACTIVATE_ABILITY` (only
  `TAP_LAND`/`applyOvergrowthTap` is) -- so this guard can't accidentally block the one
  ability the land is supposed to keep.

### Color-aware combat legality

`canBlockDuel`'s protection and Fear checks previously compared against raw `at.color`/
`bl.color`. Fixed to read `computeCharacteristics(at/bl, state).color` (already computed
there for protection) so a Kormus-Bell-blackened Swamp is correctly recognized as black for
protection-from-black and Fear, matching the "still lands, still creatures" oracle intent
for the color Layer 5 sets. `layers.js`'s CDA evaluators (`swampCount`, `forestCount`,
`forestBonus`, etc.) similarly now read a peer permanent's `subtypeEff ?? subtype` so Evil
Presence turning a Forest into a Swamp is correctly reflected in Forest/Swamp-counting CDAs
(Nightmare, Kird Ape, etc.) -- these read another permanent's already-baked field from
state, which is safe (no self-reference), unlike `matchesGlobalTypeFilter`'s intentional
base-subtype snapshot above.

### UI consumption

`isCre`/`isLand` are the only sanctioned way for UI code to check creature/land-ness.
`useDuelController.ts`'s `pCreatures`/`pLands`/`pPerms` (and `o*` counterparts) and
`handleBfClick`'s combat-phase routing now use `isCre`/`isLand` instead of a raw
`card.type?.includes('Creature')` check, so an animated land is clickable to declare as an
attacker/blocker. `pLands`/`oLands` additionally exclude currently-creature lands
(`isLand(c) && !isCre(c)`) so an animated land renders once, in the creatures row, not
twice. `src/ui/Battlefield/Half.tsx` (desktop) had its own duplicate local
`isLandCard`/`isCreatureCard` helpers (previously keyed off `card.isAnimatedLand`, the
Mishra's Factory-only flag) reworked to delegate to the shared `isLand`/`isCre` (kept
`isAnimatedLand` as an additional OR-condition for Mishra's Factory, which does not use
`typeEff`). `FieldCard.tsx`'s local `isCre` check was fixed the same way.

**Known display gap (pre-existing, not introduced here):** `getDisplayPT` (used by
`FieldCard` to show P/T with no `state` available) only sums `eotBuffs`/counters -- it does
not reflect Layer 7a/7b baked P/T. Plague Rats, Keldon Warlord, and Sorceress Queen-style
cards already have this same gap; animated lands under Living Lands/Kormus Bell inherit it
(they display as 0/0 instead of 1/1 in the card frame, though `getPow`/`getTou` with state
are correct). Not fixed here -- would require passing computed P/T down from a
state-aware ancestor, out of scope for this sweep.

---

## 19. Card Tools MCP Server (`tools/card-mcp-server/`)

Local stdio MCP server for card database work. Five tools: card lookup, audit cross-reference,
stub validation, rules conflict check, missing card generation. Uses
`scryfall/shandalar-card-pool.json` as primary data source with Scryfall API fallback.
Not part of the game build.

---

---

## 20. Group P Card Handlers (2026-06-04)

~60 Group P cards wired. Effect strings in cards.js map to resolveEff cases in DuelCore.js.

### New resolveEff cases
- `pumpAttackersEOT` — Morale: attacking creatures +1/+1 until EOT
- `debuffNonwhiteEOT` — Holy Light: nonwhite creatures -1/-1 until EOT
- `destroyAllArtifacts` — Shatterstorm: all artifacts to graveyard
- `inferno6` — Inferno: 6 damage to all creatures and players
- `damageAttackers1` — Sandstorm: 1 damage to each attacker
- `jovialEvil` — deals 2*opponent_white_creatures to target opponent
- `destroyAllBlack` — Cleanse: all black creatures to graveyard
- `ashesToAshes` — exile 2 nonartifact creatures; caster loses 5 life
- `stormSeeker` — deals damage equal to target's hand size
- `destroyForests` — Acid Rain: all Forests to graveyard
- `typhoon` — deals opponent's island count as damage
- `bloodLust` — +4/-X where toughness floors at 1
- `detonate` — destroy artifact with mv=X; deal X to its controller
- `pumpWallsEOT` — Shield Wall: caster's Walls +0/+3 until EOT
- `mightstoneAttackPump` — log-only; Mightstone is a continuous static effect
- `energyTap` — tap creature, add colorless equal to its mv
- `gainFirstStrikeEOT` — Emerald Dragonfly: gain first strike until EOT
- `removeFlying` — Radjan Spirit: target loses flying until EOT (via layerDef eotBuff)
- `destroyBlueCreature` — Spinal Villain: destroy target blue creature
- `damage4Any` — Aladdin's Ring: 4 damage to any target
- `untapTarget` — Jandor's Saddlebags: untap target creature
- `psionicEntity` — 2 to any target; 3 to itself
- `globalDebuffPower1EOT` — Bone Flute: all creatures -1/-0 until EOT
- `debuffTargetPower1EOT` — Staff of Zegon: target creature -1/-0 until EOT
- `preventDamage1Any` / `preventDamage1Creature` — Amulet/Oasis: prevention shield
- `ebonyHorse` — untap attacker, remove from combat, set ebonyHorsed flag
- `fightTargets` — Arena: two creatures deal power damage to each other
- `warBarge` — target gains islandwalk EOT; marks warBargeTargeted
- `jadeStatue` — artifact becomes 3/6 Golem until EOC
- `grantBandingEOT` — Helm of Chatzuk: target gains banding until EOT
- `addManaWithSelfDamage` — Elves of Deep Shadow: add {B}, take 1 damage

### New creature fields
- `cantAttackTurn` — turn number through which the creature cannot attack (Wall of Dust)
- `ebonyHorsed` — flag set when a creature is removed from combat by Ebony Horse
- `warBargeTargeted` — tracks which War Barge artifact granted islandwalk

### Deferred (higher complexity)
- `jandors_ring` — requires tracking the last-drawn card identity
- `leviathan` — enters-tapped + no-untap + upkeep sacrifice + attack sacrifice cost
- `jade_monolith` — damage redirect from creature to player

---

## 21. Tutor Modal System + Transmute Artifact (2026-06-05)

### Tutor Effects

`resolveEff case "tutor":` immediately shuffles the library and sets `pendingTutor` (never picks randomly).

Player resolution: `TutorModal` (DeckManager visual language). Valid choices selectable; invalid grayed below divider.
- Search input, color filter buttons (hidden when filter is not 'any'), sort by CMC/Name/Type.
- "Decline to Find" always present in footer.
- Valid cards above divider (selectable, onClick dispatches CHOOSE_TUTOR or CHOOSE_TUTOR_TRANSMUTE).
- Invalid cards below divider (grayed, not clickable).

AI resolution: `scoreLibCard()` picker in `useDuelController.ts`. Declines if no valid choices exist.

`destination='top'`: remaining library reshuffled after choice; chosen card placed at `lib[0]`.
`reveal=true`: card name appears in log (opponent-visible). Use for type/color/CMC-restricted tutors only.

### Transmute Artifact

Three-step interactive flow:
1. **pendingTransmuteSacrifice**: Player chooses which artifact to sacrifice (`TransmuteSacrificeModal`). Decline fizzles spell.
2. **pendingTutor** (_transmuteMode=true): Player searches library for any artifact (`TutorModal` with filter='artifact'). Decline puts spell to graveyard.
3. **pendingTransmutePay** (if chosen artifact CMC > sacrificed CMC): Player taps mana for difference (`TransmutePayModal`). Confirm ETBs artifact; Decline puts chosen card to graveyard. Mana snapshot restored on decline.

If chosen artifact CMC <= sacrificed CMC: ETBs for free (no pay step).

### New UI Components
- `src/ui/duel/TutorModal.tsx` -- library search modal
- `src/ui/duel/TransmuteSacrificeModal.tsx` -- artifact sacrifice selection
- `src/ui/duel/TransmutePayModal.tsx` -- mana payment tracking

### New State Fields
- `pendingTutor: null | { caster, filter, destination, reveal, shuffledLib, _transmuteMode, _sacrificedCmc }`
- `pendingTransmuteSacrifice: null | { caster }`
- `pendingTransmutePay: null | { caster, tutored, required }`

### New Action Types
`CHOOSE_TUTOR`, `DECLINE_TUTOR`, `CHOOSE_TUTOR_TRANSMUTE`, `CONFIRM_TRANSMUTE_SACRIFICE`, `DECLINE_TRANSMUTE_SACRIFICE`, `CONFIRM_TRANSMUTE_PAY`, `DECLINE_TRANSMUTE_PAY`

---

## Continuous Effects and Aura Mechanics (Migrated from CLAUDE.md)

> **Skip log:** `Layer System` skipped -- `# 18. Layer System` already exists in SYSTEMS.md.
> **Skip log:** `Protection Enforcement` skipped -- `## 17.6 Protection Enforcement (Combat Integration)` already exists in SYSTEMS.md.

### Lord Effect Pattern

Cards with `effect:"lordEffect"` or `effect:"globalPump"` are NOT resolved via `resolveEff`.
They are continuous static abilities read by `getPow`, `getTou`, and `hasKw` at compute time.
Do not add mutations for these effects in `resolveEff`. The lord layer in these three
functions scans the full battlefield each call -- keep this read-only.

Color targets (`"white"`, `"black"`, etc.) match against `card.color` (single-letter uppercase).
Subtype targets (`"goblin"`, etc.) match via word-split of `card.subtype.toLowerCase()`.

---

### Pump / Flying Keyword -- Activated Ability Routing

All activated-ability pump and flying effects must route through eotBuffs via the
effectOverride map in DuelCore.js. Direct mutation of card.power, card.toughness,
or card.keywords is prohibited for activated effects.

effectOverride map covers: pumpPower->pumpPowerEOT, pumpToughness->pumpToughnessEOT,
pumpSelf->pumpSelfEOT, pumpX->pumpXEOT, gainFlying->gainFlyingEOT, grantFlying->grantFlyingEOT

---

### Spirit Link

Implemented as mod:{spiritLink:true} on the aura. Triggers inline at combat damage
sites in DuelCore.js (not via triggeredAbilities pipeline -- auras are not standalone
battlefield permanents and are not iterated by emitEvent).

---

### Aura ETB Side-Effects (enchantCreature handler)

ETB side-effects on enchantCreature mods are handled inline in the enchantCreature
case in DuelCore.js, after the aura is attached. Current mod flags with ETB logic:
  paralyzed       -- taps the host on entry
  regenerationAura -- grants {G}:regenerate activated ability to host
  earthbind       -- if host has flying: deal 2 damage, mutate aura mod to add
                    removeKeywords:[FLYING]

---

### Aura Death Triggers (checkDeath)

Aura mods that trigger on host death are scanned inline in checkDeath BEFORE zMove
fires, while dyingCard.enchantments is still intact.
  creatureBond    -- deal damage equal to host's toughness to its controller

---

### Venom (end-of-combat destruction)

Tracked via turnState.venomTargets[]. Populated in DECLARE_BLOCKER when either
attacker or blocker has a venom aura mod. Destroyed in advPhase at COMBAT_END.
Regeneration suppresses venom destruction (vic.regenerating check). Cleared each
COMBAT_END regardless of whether destruction succeeded.

---

### Invisibility (blocking restriction)

Checked inline in canBlockDuel via enchantments[].mod.invisibility. Only Walls
(subtype includes 'Wall') may block invisible creatures.

---

### Animate Wall (Wall-only target restriction)

Enforced in enchantCreature handler via mod.enchantWallOnly guard before attachment.
Uses mod:{removeKeywords:[DEFENDER_ID], enchantWallOnly:true}. Layer 6 removeKeywords
from aura mods is now supported by collectEffects in layers.js.

---

### Keldon Warlord

CDA counts non-Wall creatures you control (including itself). Wall check uses
x.subtype?.includes('Wall') in the keldonWarlord CDA_EVALUATORS entry in layers.js.

---

### Gaea's Liege

CDA uses forestCountLiege evaluator in layers.js. When card.attacking is true, counts
defending player's Forests; otherwise counts controller's Forests.

---

## Tutor Framework (Migrated from CLAUDE.md)

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

Permanents entering via CHOOSE_TUTOR_TRANSMUTE or CONFIRM_TRANSMUTE_PAY use
`summoningSick: !hasKw(card, 'HASTE')` -- do NOT hardcode false.

## 22. Overworld Structure Types

Map size: `MAP_W = 64`, `MAP_H = 40`.

Structure counts per run: towns 18-22, dungeons 14-16, castles 5, ruins 10-14.

### RUIN

- Tile shape: `tile.ruinData = { name, looted, hasGuardian }`
- Always visible (no `clued` gate)
- Guardian fight uses context `'ruin_guardian'`
- `handleDuelEnd` re-opens the ruin modal on win via `setActiveTile` + `setModal('ruin')`
- Loot draw uses weighted pool: common x3, uncommon x2, rare x1
- No dungeon screen -- single modal interaction only

# 24. Cast/Activate Flow Redesign (2026-06-19)

## 24.1 Overview

The player cast/activate flow is a five-step sequential process. All prompts
are rendered inline inside the player's own Banner strip. No modal or overlay
is used.

### Steps

1. Player selects a card in hand (or a permanent with an activated ability).
2. Player clicks **Cast** or **Activate**.
3. **[Target step]** If the spell/ability requires or offers targets, targeting
   mode opens inside the Banner. The player clicks a valid target (creature,
   player, or stack item) to select it.
4. **[Mana step]** If the player's mana pool does not already satisfy the cost,
   mana mode opens in the Banner showing the outstanding cost. The player taps
   lands/artifacts to fund it.
5. When the cost is fully satisfied the spell/ability is dispatched to the
   stack automatically.

## 24.2 Optional Targets

Cards with `optionalTarget: true` in their card-data entry open the targeting
step but include a **Skip** button. Skipping advances with `selectedTargets = []`
and `castSpell(..., null)`. Currently only Twiddle carries this flag.

`optionalTarget` is a card-data field consumed exclusively by the UI/hook layer
(`isOptionalTarget` helper in `useDuelController.ts`). DuelCore has no awareness
of it.

## 24.3 Required Targets

Cards whose `effect` is in `EXPLICIT_TARGET_EFFECTS` (or which trigger
`isCounterEffect`/`isBebRebEffect`) require at least one target before the flow
can advance. The **Confirm** button inside the Banner is hidden at 0 targets.

## 24.4 Shared State: `CastFlowState`

`castFlow: CastFlowState | null` in `useDuelController.ts` replaces the previous
`pendingCast` state. Fields:

| Field | Type | Description |
|---|---|---|
| `kind` | `'spell' \| 'ability'` | Cast or activate |
| `sourceIid` | `string` | IID of the card/permanent |
| `abilityId` | `string \| null` | Activated ability ID (null for spells) |
| `mode` | `'targeting' \| 'mana' \| null` | Current flow step |
| `selectedTargets` | `string[]` | Accumulated target IIDs |
| `requiresTarget` | `boolean` | `needsAnyTarget && !isOptionalTarget` |
| `maxTargets` | `number` | Max targets (always 1 in current impl) |
| `canTargetPlayers` | `boolean` | Whether player/opp life totals are valid targets |

## 24.5 Key Helpers (`useDuelController.ts`)

| Export | Purpose |
|---|---|
| `needsAnyTarget(card)` | `needsExplicitTarget || isCounterEffect || isBebRebEffect` |
| `isOptionalTarget(card)` | `Boolean(card?.optionalTarget)` |
| `getManaShortfall(pool, cost, xVal)` | Returns `{needed, have}` or null |
| `EXPLICIT_TARGET_EFFECTS` | Set of effect strings that require a target at cast time |
| `beginCastFlow(card)` | Opens the flow for a spell |
| `beginActivateFlow(card, abilityId)` | Opens the flow for an activated ability |
| `selectCastTarget(iid)` | Adds a target (creature IID, 'p', 'o', or stack item IID) |
| `confirmCastTargets()` | Advances from targeting to mana step (or casts if mana ready) |
| `cancelCastFlow()` | Cancels flow; dispatches `UNDO_MANA_TAPS` if mana was tapped |

## 24.6 Auto-fire

A `useEffect` watching `[s.p.mana, castFlow]` fires `castSpell`/`activateAbility`
automatically when mana becomes sufficient. This lets the player tap a single land
and have the spell cast without any extra click when that tap satisfies the cost.

## 24.7 Bug Fixes (delivered with this feature)

| Bug | Fix |
|---|---|
| Icy Manipulator activated ability opened no target prompt | Added `tapTarget` to `ACTIVATE_TARGET_EFFECTS` in `useDuelController.ts` |
| Counterspell/Force Spike on mobile lacked explicit stack-item selection UI | `castFlow.selectedTargets[0]` is used instead of a top-of-stack fallback; StackDisplay receives `selectedItemId` and `onItemClick` from the flow |

## 24.8 Banner Cast Prompt UI

Both `src/ui/Battlefield/Banner.tsx` (desktop) and `src/ui/Mobile/Banner.tsx`
(mobile) accept a `castPrompt?: CastPromptProps` prop. The castPrompt is rendered
as an inline flex container inside the Banner, right-aligned after the mana pool.

Targeting mode shows: label ("Select target" / "Select target (optional)") +
optional Confirm button (visible only when `targetsSelected >= 1`) + optional
Skip button (visible only when `canSkip`) + Cancel button.

Mana mode shows: "NEED" label + `<Cost>` chip for the outstanding cost + Cancel
button.

`data-testid` anchors: `cast-prompt`, `cast-prompt-label`, `cast-prompt-confirm`,
`cast-prompt-skip`, `cast-prompt-need`, `cast-prompt-cancel`.

## 24.9 System File Map

| File | Change |
|---|---|
| `src/hooks/useDuelController.ts` | `CastFlowState`, flow handlers, `ACTIVATE_TARGET_EFFECTS`, exported helpers |
| `src/ui/Battlefield/Banner.tsx` | `CastPromptProps`, `castPrompt` prop, inline UI |
| `src/ui/Mobile/Banner.tsx` | Same as desktop Banner |
| `src/DuelScreen.tsx` | Wires castFlow to Banner, ActionBar, StackDisplay |
| `src/ui/Mobile/DuelScreenMobile.tsx` | Same wiring; removed local `targetingFor`/`pendingTarget` state |
| `src/data/cards.js` | Added `optionalTarget: true` to Twiddle |
| `src/hooks/__tests__/useDuelController.castFlow.test.ts` | Vitest unit tests CAST-FLOW-01 through CAST-FLOW-08 |
| `tests/e2e/duel-controller.spec.ts` | Playwright e2e tests E2E-CAST-01 through E2E-CAST-08 |

---

# Section 25 — Cast-Triggered Optional Payment (pendingSphereTrigger)

## Overview

Batch A4 establishes a reusable pattern for artifacts that trigger an optional payment
whenever a spell of a specific color is cast by either player. This is distinct from
`pendingConditionalCounter` (which triggers on stack resolution for Force Spike/Power Sink)
because the trigger fires at cast time, before the spell resolves or is countered.

## State Shape

```
pendingSphereTrigger: {
  sphereCardId:   string,   // e.g. 'crystal_rod'
  sphereCardName: string,   // display name
  controller:     'p'|'o', // whose optional pay it is
  queue:          Array<{ sphereCardId, sphereCardName, controller }>,
}
```

Multiple spheres may trigger off the same cast (e.g. both players own Crystal Rod and a
blue spell is cast). The first trigger is in `pendingSphereTrigger`; the rest are in `queue`.
Resolving the first dequeues the next, and so on until the queue is empty (`null`).

## Trigger Site

`CAST_SPELL` reducer in `DuelCore.js`, after the spell item is pushed to the stack and
the priority window is opened. The scan covers both `s.p.bf` and `s.o.bf` in that order.
A sphere controller with 0 total mana is silently skipped (no decision to present).

## Resolution Action

`SPHERE_TRIGGER_RESOLVE { paid: boolean }` — handled in `DuelCore.js`.
- `paid: true`: deducts 1 generic mana from the trigger controller; gains 1 life via `hurt(ns, controller, -1, name)`.
- `paid: false`: no state change beyond clearing the trigger.

## Phase-Advance Gate

`ADVANCE_PHASE` is blocked while `pendingSphereTrigger` is set, parallel to the
`pendingUpkeepChoice` and `pendingConditionalCounter` guards.

## Human/AI Resolution

- Human controller (`'p'`): `SphereTriggerModal.tsx` renders on both `DuelScreen.tsx` and
  `DuelScreenMobile.tsx` (shared component, identical `data-testid`).
- AI controller (`'o'`): Auto-resolved in the `useDuelController.ts` AI main loop.
  Heuristic: always pay if able. No downside to paying, so no bluff-aware logic needed.

## Implemented Cards

| Card | Trigger Color | Card ID |
|---|---|---|
| Crystal Rod | Blue (U) | `crystal_rod` |
| Iron Star | Red (R) | `iron_star` |
| Ivory Cup | White (W) | `ivory_cup` |
| Wooden Sphere | Green (G) | `wooden_sphere` |

## Compatibility with Other Pending States

`pendingSphereTrigger` is set during `CAST_SPELL`. `pendingConditionalCounter` is set during
`RESOLVE_STACK`. `pendingUpkeepChoice` is set during upkeep. These three states cannot be
simultaneously active in a legal game sequence and do not conflict.

# Section 26 — Ante System (Complete)

## Overview

Ante is an opt-in, per-new-game toggle (title screen, default off) that stakes a
random card from each player's deck on every duel for the rest of that campaign
run. Threaded: `TitleScreen` toggle -> `onStart({ ..., anteEnabled })` ->
`startConfig.anteEnabled` -> `useOverworldController`'s `anteEnabled` state
(seeded once at mount, not re-toggleable mid-run) -> `duelCfg.anteEnabled` ->
`buildDuelState(..., anteEnabled, ...)`.

## Duel-State Shape

```
anteP:       Card | null   // player's forced pre-game ante (set once, in buildDuelState)
anteO:       Card | null   // opponent's forced pre-game ante
anteExtraP:  Card[]        // additional ante-zone cards the player contributes mid-game
anteExtraO:  Card[]        // additional ante-zone cards the opponent contributes mid-game
anteEnabled: boolean
ownershipChanges: { cardId, card, newOwner: 'p'|'o' }[]  // Section below
```

`buildDuelState` sets `anteP = pd[0]` / `anteO = od[0]` (when `anteEnabled` and a
library exists) immediately after hand-draw splicing, then **removes** that card
from `pd`/`od` before they become `p.lib`/`o.lib` -- the anted card is set aside
for the whole duel; it is never drawable or playable.

`anteP`/`anteO` remain single-card scalars (existing tests assert this shape).
`anteExtraP`/`anteExtraO` generalize the model to mid-game ante additions
(Contract from Below, Demonic Attorney, Rebirth, Jeweled Bird) without touching
the scalars.

## Reconciliation (`handleDuelEnd`, `useOverworldController.js`)

Real ante rules resolve as winner-takes-the-whole-ante-zone. The player's stake
is `anteP` + `anteExtraP`; the opponent's stake is `anteO` + `anteExtraO`.

- **Win**: the opponent's whole stake is added to `binder`. The player's own
  stake is untouched (nothing removes it from `deck`).
- **Loss**: each card in the player's own stake is removed from `deck` (matched
  by `id`). Nothing happens to the opponent's stake (opponents don't persist
  between duels).

This sweep runs inside the `if (won) {...} else {...}` branch, unlike
`ownershipChanges` below.

## Ownership Exchanges (Bronze Tablet, Tempest Efreet)

Bronze Tablet and Tempest Efreet exchange ownership of an arbitrary card
**unconditionally** -- not contingent on who wins the duel, and permanent per
their oracle text. The engine has no persistent `owner` field distinct from
`controller` (zone arrays are the implicit ownership record; `controller` is
reserved for temporary control grants that revert, e.g. Aladdin). Instead, both
cards push entries onto `ownershipChanges: { cardId, card, newOwner }[]` when
their exchange effect resolves.

`handleDuelEnd` sweeps `ownershipChanges` **unconditionally**, outside the
win/loss branch:
- `newOwner === 'p'`: the card is added to `binder`.
- `newOwner === 'o'`: the matching card (by id) is removed from `deck`.

Since AI opponents don't persist a collection between duels, an exchange in the
opponent's favor only has an observable lasting effect on the player's side
(the `deck` removal) -- there is no opponent-side collection to add to.

## New Ante Cards (Part 7 batch)

| Card | Effect key | Notes |
|---|---|---|
| Contract from Below | `contractFromBelow` | Discard hand, ante top of library to `anteExtraP`, draw 7. |
| Demonic Attorney | `demonicAttorney` | Each player antes their own top-of-library card to their own `anteExtra*`. |
| Jeweled Bird | `jeweledBirdAnte` (activated, `{T}`) | Antes itself (into `anteExtra*`, replacing the rest of that player's stake); all prior cards in that stake go to the controller's graveyard; draws 1. |
| Rebirth | `rebirthAnte` | SIMPLIFICATION: real card lets each player individually choose to ante for a life-reset to 20. No per-player yes/no UI exists for this niche decision; each player auto-antes only when `life < 20` (matches the "no UI to decline" convention already used for Brainwash/Hasran Ogress). |
| Bronze Tablet | `bronzeTabletExchange` (activated, `{4},{T}`, targets a nontoken permanent an opponent owns) | Enters tapped (`entersTapped: true` card flag, generalized alongside the existing Kismet enter-tapped hook in `RESOLVE_STACK`). Exiles both permanents. SIMPLIFICATION: the targeted player's "may pay 10 life" decision auto-resolves (pay if `life > 10`, same convention as Rebirth). Declining pushes both `ownershipChanges` entries; paying puts Bronze Tablet in its owner's graveyard and leaves the target exiled with no ownership change. |
| Tempest Efreet | `tempestEfreetExchange` (activated, `{T}, Sacrifice`) | Implicit single-opponent target (no target UI needed in a 2-player duel). SIMPLIFICATION: same auto-pay-if-`life > 10` convention. Declining reveals a random card from the opponent's hand (reusing the existing `Math.floor(Math.random() * hand.length)` idiom from `discardX`/`discardOne`), swaps it into the caster's hand, and pushes both `ownershipChanges` entries. |
| Darkpact | `darkpactExchange` | See Section 27.2 (`pendingAnteExchange`) -- "target card in the ante" no longer needs a `castFlow` targeting domain; it's picked via a reused `TutorModal` at resolution time, same as Demonic Tutor's search. |

All seven cards carry `anteOnly: true` in `cards.js` (not string-matched against
`text`). `generateStartingDeck` (`src/data/difficulties.js`) takes an
`anteEnabled` parameter and filters `c.anteOnly` out of both `CARD_DB.filter(...)`
pool-construction sites whenever ante is off (default). Opponent archetype decks
(`ARCHETYPES` in `cards.js`) are fixed lists that were verified to contain none
of the seven ante-only ids, so no separate filter was needed there.

## UI

Both `DuelScreen.tsx` (`data-testid="ante-banner"`) and
`DuelScreenMobile.tsx` (`data-testid="ante-banner-mobile"`) display the combined
stake (`anteP`/`anteO` plus `anteExtraP`/`anteExtraO`) whenever `anteEnabled` and
the combined stake is non-empty.

# Section 27 — Generalized Choice Mechanisms (2026-07-05)

Three narrow, single-use-case choice mechanisms were each generalized minimally
to unblock four deferred cards (Alchor's Tomb, Darkpact, Ashnod's Battle Gear,
Tawnos's Weaponry). No fourth mechanism was introduced.

## 27.1 `pendingChoice` — generic creation path + `kind` dispatch

Previously `pendingChoice` was only ever created by `resolveTrigger()` for
triggered abilities with `requiresChoice`. `createPendingChoice(state, {
sourceCardId, controller, options, kind, ...extra })` (`DuelCore.js`) is now
the single place that sets `state.pendingChoice`; `resolveTrigger()` is just
one caller (`kind: 'triggered_ability_choice'`).

`RESOLVE_CHOICE` dispatches on `choice.kind`:
- `'triggered_ability_choice'` (default): unchanged -- resolves back through
  the triggered ability's `effect.options` (Soul Net and any future
  `requiresChoice` card).
- `'colorChoice'` (Alchor's Tomb): resolves directly, setting
  `choice.targetIid`'s permanent `.color` to the chosen option id. Same field
  the `colorLace` effect (Chaoslace/Deathlace/etc.) mutates -- no new
  color-override mechanism was introduced.

`ChoiceModal` (`src/ui/duel/ChoiceModal.tsx`) was extracted out of
`DuelScreen.tsx` into its own file (matching where `TutorModal` /
`ForceOfNatureUpkeepModal` already live) so it could be imported and rendered
by `DuelScreenMobile.tsx` too -- it was previously desktop-only, a real parity
bug independent of this batch. Both screens render it under the same
`s.pendingChoice && s.pendingChoice.controller === 'p'` gate.

### Alchor's Tomb

`{2}, {T}: Target permanent you control becomes the color of your choice.`
Modeled as `activated: { cost: "2,T", effect: "colorChoiceTarget" }`. The
`colorChoiceTarget` resolveEff case (fires from `RESOLVE_STACK`, same as any
other activated ability) validates `tgtC.controller === caster`, then calls
`createPendingChoice` with a 5-option W/U/B/R/G list and `kind: 'colorChoice'`.
The color change is permanent (no `eotBuffs`, no expiry) -- matches the oracle
text "(This effect lasts indefinitely.)"

## 27.2 `pendingAnteExchange` — Darkpact

Darkpact's `darkpactExchange` resolveEff case (fires on `RESOLVE_STACK`, same
as any sorcery) reads "You own target card in the ante" as a **targeting
restriction** (only cards the caster already owns in the ante zone are legal
targets), not as a separate ownership-changing effect -- see the completion
summary for the Forge (`GainOwnership`) vs. Oracle-text naming discrepancy this
resolves, and why network access to verify against live Scryfall rulings was
unavailable. It sets:

```
pendingAnteExchange: { caster: 'p'|'o', cards: Card[] }  // caster's own anteP/anteExtraP or anteO/anteExtraO
```

The picker reuses `TutorModal` directly (`library={pendingAnteExchange.cards}`,
`filter="any"`, `titleOverride="Darkpact — Choose a Card in the Ante"`) --
no new picker component. Resolution is a new action, `RESOLVE_ANTE_EXCHANGE
{ iid }` / `DECLINE_ANTE_EXCHANGE`, not `CHOOSE_TUTOR` -- that action's
resolution (move to hand, remove from library) doesn't match Darkpact's
exchange semantics. The chosen ante card is appended to the caster's library
(not shuffled in -- position isn't meaningfully random since only the top
card of a library is ever an exchange target by any existing effect) and the
former top card of the library takes its place in whichever ante slot (scalar
`anteP`/`anteO` or the matching `anteExtraP`/`anteExtraO` array entry) the
chosen card occupied.

## 27.3 Upkeep-choice registry — Ashnod's Battle Gear / Tawnos's Weaponry

`pendingUpkeepChoice` (previously a single hardcoded Force of Nature slot) is
now backed by `UPKEEP_CHOICE_HANDLERS` (`DuelCore.js`), a `handlerKey`-keyed
registry mirroring the `CARD_HANDLERS` pattern in `cardHandlers.js`:

```
UPKEEP_CHOICE_HANDLERS = {
  forceOfNatureUpkeep: { resolve(s, choice, action) { ... } },  // unchanged behavior
  optionalUntap:       { resolve(s, choice, action) { ... } },  // new
}
```

`pendingUpkeepChoiceQueue: []` holds any additional choices queued in the same
untap step; `pendingUpkeepChoice` always holds the front slot.
`queueUpkeepChoice(state, choice)` appends to the queue if the front slot is
occupied, else fills it directly. **The gate did not need to change from a
null check to a queue-emptiness check** -- every existing
`if (s.pendingUpkeepChoice) ...` site (the `ADVANCE_PHASE` gate, both screens'
render gates, `useDuelController.ts`'s `endTurn` effect) stays a plain null
check, because `pendingUpkeepChoice` is non-null exactly when the queue is
non-empty (`UPKEEP_CHOICE_RESOLVE` shifts the next queued item into the front
slot on every resolve).

The UI mirrors this with `UPKEEP_CHOICE_MODALS` (`src/ui/duel/
upkeepChoiceRegistry.tsx`), keyed by `handlerKey`, replacing the hardcoded
`ForceOfNatureUpkeepModal` render in both `DuelScreen.tsx` and
`DuelScreenMobile.tsx` with a lookup.

### Ashnod's Battle Gear / Tawnos's Weaponry

Both are `optionalUntap: true` artifacts with a `{2},{T}` pump ability
(`pumpWhileTapped` resolveEff case) that sets `+X/+Y` on a target creature "for
as long as this artifact remains tapped." The pump is stored directly on the
source artifact (`whileTappedPump: { targetIid, power, toughness }`) and read
by `layers.js`'s `collectEffects` as a Layer 7c continuous effect gated on
`src.tapped` -- the bonus ends automatically the instant the artifact untaps;
no separate duration/expiry tracking exists or is needed (mirrors how Old Man
of the Sea's `whileTappedAndPowerLte` control grant is already tapped-gated
rather than duration-tracked).

The untap-step loop in `DuelCore.js` (the generic non-land/non-creature
fallthrough) computes `optionalUntapTargets` from permanents with
`c.optionalUntap && c.tapped && c.whileTappedPump` *before* the untap `.map()`
runs (keeping the map a pure per-card transform), leaves them tapped in the
map, then queues an `optionalUntap` upkeep choice per target -- but only when
`ns.active === 'p'`. For the opponent (`'o'`), the artifact is simply left
tapped with no queued choice (auto-decide: keep the bonus, since it was
activated in the first place because it's worth having -- same "no UI to
decline" convention as Brainwash/Hasran Ogress/Rebirth elsewhere in this
file). This is why no opponent-side AI wiring was added to
`useDuelController.ts` for this mechanism.

`pumpRequiresControl: true` (Ashnod's Battle Gear only) restricts the pump
target to a creature the caster controls; Tawnos's Weaponry omits it (targets
"target creature," either side).

# End of SYSTEMS v1.7
