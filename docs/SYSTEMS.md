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

1. Untap Phase
   - untap permanents (if applicable)

2. Upkeep Phase
   - Specific to task referencing the upkeep Phase

3. Draw Phase
   - active player draws 1 card

4. First Main Phase
   - player may play cards (via GameActions)

5. Combat Phase
   - attackers declared
   - blockers assigned
   - damage resolved via DuelCore

6. Second Main Phase
   - player may play cards (via GameActions)

7. End Phase
   - cleanup effects
   - expire temporary modifiers

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

### Sorcery-Speed Enforcement

`CAST_SPELL` enforces casting restrictions before deducting mana. A card is considered sorcery-speed if `type !== 'Instant'` and `type !== 'Interrupt'`. For sorcery-speed cards the reducer enforces three conditions, returning the unchanged state (no-op) if any fails:

1. The caster (`action.who`) must be the active player (`s.active`).
2. The current phase must be in `SORCERY_SPEED_PHASES` (`MAIN_1` or `MAIN_2`).
3. The stack must be empty (`s.stack.length === 0`).

Instants and Interrupts bypass all three checks and may be cast at any time priority is held, including when the stack is non-empty (responses/counter-spells).

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

### `selectPlayableCards(state, phase)` → `{ card, effectiveCost, xVal }[]`

Pure legality filter. Iterates `state.o.hand`, skips lands (handled separately), enforces sorcery-speed timing against an empty stack, respects `castRestriction`, and rejects cards whose CMC exceeds the total available mana ceiling. For X spells, computes the maximum X value and substitutes it into `effectiveCost`. Returns entries sorted CMC-descending.

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

### `planMain(state, profile, phase)` → `AITurnPlan`

Coordinator. Sequentially: (1) Channel top-up if active and helpful; (2) play a land if in hand and not yet played; (3) iterate `selectPlayableCards` → `selectTarget` → `evaluateAndCast` for each card; (4) append activated abilities; (5) append `PASS_PRIORITY`.

No `Math.random()` calls exist in the spell-casting pipeline. Profile weights are knobs that modulate deterministic thresholds, not coin-flip gates.

## 6.5 Blocking Model

### Multi-Blocker Lethal Prevention

Before the per-attacker blocking loop, `planBlock` computes `totalIncoming` (sum of all attacking powers). If `totalIncoming >= state.o.life`, the AI enters forced-chump mode: attackers are sorted by power descending, and chumps are assigned until remaining damage drops below lethal. These chumps are recorded in `alreadyBlocking` so the subsequent per-attacker loop skips them.

### Per-Attacker Priority

For each unblocked attacker the loop checks in order: favorable trade → survives → prevents lethal → skip.

## 6.6 Activated Abilities

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

## 6.8 AI Instant-Speed Response

`planInstantResponse(state, profile)` is invoked by `getAIPlan` when `priorityWindow === true && active === 'p'` (the player holds priority). The hook in `DuelScreen.tsx` triggers a 200 ms delayed call to `aiDecide` when those conditions hold and the AI has not already passed (`priorityPasser !== 'o'`).

### Trigger Conditions

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
| `usePhaseAdvance` | `src/hooks/usePhaseAdvance.ts` | Encapsulates the priority-window suppression heuristic (skip window when no instant/activated ability is available). Returns a stable `requestPhaseAdvance` callback. Shared by `DuelScreen` and `DuelScreenMobile` — logic is defined once. |
| `useMedia` | `src/hooks/useMedia.ts` | Generic `matchMedia` wrapper with SSR guard. Returns a boolean that updates on viewport change. Used by `OverworldGame` to gate `DuelScreenMobile` at ≤ 640px. |
| `useIsMobile` | `src/hooks/useIsMobile.js` | ResizeObserver-based breakpoint detector (≤ 768px). Used for OverworldGame layout adjustments and within DuelScreen for tablet-width tweaks. |

### 11.3 UI/Overworld — Dynamic Tile Size

`WorldMap` (`src/ui/overworld/WorldMap.jsx`) accepts an optional `tileSize` prop (default `34`). All grid template dimensions, tile element sizes, canvas dimensions, and empty-tile placeholders are derived from this prop so the grid scales uniformly.

In `OverworldGame`, `tileSize` is computed via `useMemo`: when `isMobile` is true, it calculates the largest integer tile size that fits both the available viewport height (screen height − 88 px for toolbar and HUD) and available viewport width (screen width − 16 px), divided by the mobile viewport tile counts (`viewH = 9`, `viewW = 12`), clamped to a minimum of 18 px. On desktop `tileSize` is always `34`. This eliminates the black void below the map on portrait mobile.

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
6. A `useRef`-guarded `useEffect([s.priorityWindow])` in DuelScreen detects the `true -> false` transition and dispatches `ADVANCE_PHASE`.

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

When `s.priorityWindow` transitions to `true`, a `useEffect([s.priorityWindow])` in DuelScreen evaluates the AI's options:

1. Search `s.o.hand` for the first card with `type === 'Instant'` and `canPay(s.o.mana, c.cost) === true`.
2. If found, dispatch `CAST_SPELL { who: 'o', iid, tgt: 'p', xVal: 1 }`.
3. Always dispatch `PASS_PRIORITY { who: 'o' }` immediately after (no added delay).

The AI casts at most one instant per window. If the AI has no affordable instant, it passes immediately.

## 18.7 InstantPriorityBar UI

Component: `src/ui/ActionBar/InstantPriorityBar.tsx`

Rendered in DuelScreen above the `ActionBar` when `s.priorityWindow === true && s.priorityPasser !== 'p'` (i.e., the player still holds priority).

- Displays each `type === 'Instant'` card from `s.p.hand` as a clickable button (name + formatted cost). Clicking calls `selectCard(iid)` to enter the standard cast flow.
- Displays each non-mana activated card from `s.p.bf` as a clickable button. Clicking calls `handleActivate(card)`.
- Grayed color (but still clickable) when `canAffordCost(mana, card.cost)` returns false.
- Always shows a "Pass Priority" button that dispatches `PASS_PRIORITY({ who: 'p' })`.
- Positioned at `z-index: 200` so it does not obscure targeting overlays (which use higher z-index values).

## 18.8 System Files

| File | Role |
|------|------|
| `src/engine/DuelCore.js` | State fields, reducer cases, ADVANCE_PHASE guard |
| `src/hooks/useDuel.js` | `openPriorityWindow`, `passPriority` dispatchers |
| `src/ui/ActionBar/InstantPriorityBar.tsx` | Player priority UI |
| `src/DuelScreen.tsx` | `requestPhaseAdvance`, auto-advance effect, AI handler, render |

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

| File | Role |
|------|------|
| `src/OverworldGame.jsx` | Read on mount (lazy initializer); write on every artifact state change |

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
Defined in MapGenerator.js. Tiers 1–3 indexed by terrain type.
Tier selected in doMove based on move count: <20 → tier 1; <60 → tier 1–2; else → tier 2–3.

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
- `rollout(state, depthLimit=20)` — simulates a random game from the given state up to depthLimit turns; returns 'p' or 'o' (winner).
- `scoreMoves(state, candidateMoves, budgetMs=800)` — runs rollouts for each candidate move within the time budget; returns moves sorted by win rate.
- `getBestMove(state, candidateMoves, budgetMs=800)` — returns the single highest-scoring candidate.

## 28.4 Constraints
- Read-only: no mutation of the passed state. All rollouts operate on deep-copied state.
- Random play policy: uses `randomMainAction`, `randomAttack`, `randomBlock` — not the full AI heuristic.
- Heuristic fallback: if game is not `over` after depthLimit turns, `heuristicWinner` estimates the winner by comparing life + board power.
- Budget enforcement: per-candidate time budget = totalBudgetMs / candidateCount.

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

# End of SYSTEMS v1.1
