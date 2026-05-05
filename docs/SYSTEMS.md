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

# End of SYSTEMS v1.0

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

### 17.5.1 Game State Shape

```js
pendingChoice: {
  id: string,
  type: "triggered_ability_choice",
  sourceCardId: CardID,
  controller: PlayerID,
  options: [
    { id: string, label: string, effect: EffectDefinition }
  ],
  required: true
}
```

### 17.5.2 Behavior

- When resolving a trigger with `requiresChoice = true`:
1. Populate `pendingChoice`
1. Suspend Trigger Queue processing
- Player selection dispatches: `RESOLVE_CHOICE(optionId)`
- Upon resolution: execute selected effect, clear `pendingChoice`, resume Trigger Queue

### 17.5.3 Determinism Requirement

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

- **Sengir Vampire**: ON_DAMAGE_DEALT → populate damageLog; ON_CREATURE_DIES → check damageLog → enqueue counter trigger
- **Force of Nature**: ON_UPKEEP_START → pendingChoice (pay GGGG or take 8 damage)
- **Protection**: enforced during targeting, blocking, and damage; no trigger registration

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
2. `requestPhaseAdvance()` performs a smart-suppression check (see 18.4). If suppressed, it dispatches `ADVANCE_PHASE` directly.
3. If not suppressed, it dispatches `OPEN_PRIORITY_WINDOW`. The reducer sets `priorityWindow: true, priorityPasser: null`.
4. Each side passes via `PASS_PRIORITY({ who })`. The reducer records the first passer in `priorityPasser`. When the second distinct side passes, it sets `priorityWindow: false, priorityPasser: null`.
5. A `useRef`-guarded `useEffect([s.priorityWindow])` in DuelScreen detects the `true -> false` transition and dispatches `ADVANCE_PHASE`.

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

The `ADVANCE_PHASE` reducer case returns state unchanged (with a console warning) while `s.priorityWindow === true`. This prevents the phase from advancing while a priority decision is still pending.

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
