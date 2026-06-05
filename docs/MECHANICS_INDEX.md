# Shandalar Mechanics Index (v1.0)

## Overview

This document maps every gameplay mechanic in Shandalar to:

1. Design intent (GDD.md)
2. Mechanical definition (SYSTEMS.md)
3. Implementation (actual code in /src)
4. System ownership (authoritative engine boundary)

This is the **traceability layer of the entire architecture**.

It ensures:
- no orphan mechanics
- no hidden logic
- no duplicate system ownership
- no UI-driven rule drift

---

# 1. ENGINE CORE SYSTEMS

---

## 1.2 Triggered Ability System

### Description
Card-triggered event pipeline within DuelCore. Detects, enqueues, and resolves card-specific triggered abilities at explicit state transitions. Currently implemented card-specifically (no general registry).

### SYSTEMS.md Reference
- Section 17 (Triggered Ability Pipeline)
- Section 17.1 (Data Model / damageLog shape)
- Section 17.5 (Upkeep Choice UI Contract)

### Implementation
```
/src/engine/DuelCore.js   — emitEvent, processTriggerQueue, resolveTrigger, RESOLVE_CHOICE, UPKEEP_CHOICE_RESOLVE
/src/data/cards.js        — triggeredAbilities declarations
/src/hooks/useDuel.js     — resolveChoice, resolveUpkeepChoice dispatchers
/src/ui/DuelScreen.jsx    — ChoiceModal, ForceOfNatureUpkeepModal components
```

### Active Card Triggers

#### Spirit Link (inline combat trigger)
```
Status: ACTIVE
Data model: mod:{spiritLink:true} on aura card definition (not a keyword grant)
Trigger site: Inline at three combat damage points in DuelCore.js combat resolution block.
  - Unblocked attacker hits player: after hurt(ns, defW, ap)
  - Attacker deals damage to blocker: after lifelink line (same guard conditions)
  - Blocker deals damage to attacker: after blocker damage application
Implementation note: Auras live in card.enchantments[] on the host creature, NOT as
standalone battlefield permanents. emitEvent loop over bf cannot find them. spiritLinkGain(c)
helper checks enchantments array inline. Does not use triggeredAbilities pipeline.
```

#### Sengir Vampire (+1/+1 counter)
```
Status: ACTIVE (card-specific implementation; general registry deferred)
Event flow: ON_DAMAGE_DEALT -> sengirDamagedIids[] -> ON_CREATURE_DIES -> sengirCounter trigger -> P1P1 counter
Tracking field: turnState.sengirDamagedIids  (cleared each UNTAP)
```

#### Force of Nature (upkeep choice)
```
Status: ACTIVE
Event flow: UPKEEP forceOfNatureUpkeep case -> pendingUpkeepChoice (human) | inline resolution (AI)
Action: UPKEEP_CHOICE_RESOLVE { choice: "PAY_GGGG" | "TAKE_DAMAGE" }
```

### Status
ACTIVE (Phase 5 Completion Sprint)

---

## 1.1 DuelCore System (Combat + Turn Engine)

### Description
The central simulation engine responsible for all game state mutation, turn resolution, and combat execution.

---

### GDD Reference
- Combat system design section
- Turn-based gameplay loop

---

### SYSTEMS.md Reference
- Section 1 (Core Architecture Principle)
- Section 3 (Turn System)
- Section 4 (Action & Stack System)
- Section 5 (Combat System)
- Section 13 (Authority Hierarchy)

---

### Implementation
```
/src/engine/DuelCore.js
```

---

### Responsibilities
- Mutate GameState (ONLY authority)
- Execute turn phases
- Resolve LIFO stack (GameAction system)
- Process combat steps
- Apply state-based effects
- Enforce deterministic resolution

---

### Dependencies
- rulesets.js (mode modifiers)
- cards.js (data instantiation)

---

### Status
CORE SYSTEM (Critical)

---

# 2. AI SYSTEMS

---

## 2.1 Combat AI System

### Description
Generates decision actions for enemy entities during combat.

---

### GDD Reference
- Enemy behavior design
- Tactical decision-making systems

---

### SYSTEMS.md Reference
- Section 6 (AI System)
- Section 13 (Authority Hierarchy)

---

### Implementation
```
/src/engine/AI.js
```

---

### Responsibilities
- Evaluate GameState snapshots
- Score possible actions
- Emit GameAction objects
- Select optimal decisions

---

### Strict Constraints
- Cannot mutate GameState
- Cannot resolve combat logic
- Cannot bypass DuelCore
- Must be deterministic (rngSeed aware)

---

### Status
ACTIVE

---

# 3. WORLD SYSTEMS

---

## 3.1 World Grid System

### Description
Defines the spatial coordinate system for overworld navigation.

---

### GDD Reference
- Exploration system
- World traversal design

---

### SYSTEMS.md Reference
- Section 7 (World System)

---

### Implementation
```
/src/engine/MapGenerator.js
```

---

### Responsibilities
- Generate 32x22 grid
- Assign node types
- Compute spatial relationships
- Produce deterministic map layout

---

### Node Types
- Combat
- Event
- Merchant
- Boss
- Empty

---

### Status
ACTIVE

---

# 4. RULE SYSTEMS

---

## 4.1 Ruleset System (Classic vs Modern)

### Description
Defines global rule behavior variations between Classic and Modern gameplay modes.

---

### GDD Reference
- Rule philosophy section
- MTG-inspired variation design

---

### SYSTEMS.md Reference
- Section 8 (Ruleset System)

---

### Implementation
```
/src/data/rulesets.js
```

---

### Responsibilities
- Define Classic rules behavior
- Define Modern rules behavior
- Provide rule modifiers for DuelCore
- Influence gameplay interpretation

---

### Constraints
- Cannot mutate GameState
- Cannot execute logic independently
- Must be interpreted by DuelCore only

---

### Status
ACTIVE

---

## 4.2 Keyword System

### Description
Defines evergreen mechanical abilities used across all cards.

---

### GDD Reference
- Card mechanics section

---

### SYSTEMS.md Reference
- Section 9 (Keyword System)

---

### Implementation
```
/src/data/keywords.js
```

---

### Responsibilities
- Define reusable abilities (flying, trample, etc.)
- Provide interpretive hooks for DuelCore
- Standardize effect behavior

---

### Constraints
- Stateless definitions only
- No runtime mutation logic

---

### Status
ACTIVE

---

# 5. CARD SYSTEM

---

## 5.2 Power Surge Upkeep Trigger

### Description
Enchantment that deals X damage to the active player at upkeep, where X equals the number of untapped lands they controlled at the beginning of their previous upkeep. Uses a snapshot taken during UNTAP.

### SYSTEMS.md Reference
- Section 20 (Power Surge Upkeep System)

### Implementation
```
/src/engine/DuelCore.js  — turnState.powerSurgeUntappedCount; UNTAP snapshot; UPKEEP handler
```

### Mechanism
```
turnState field: powerSurgeUntappedCount
Snapshot timing: UNTAP phase (before untap loop), only when Power Surge is on either battlefield
Consumption: UPKEEP forceOfNatureUpkeep case reads snapshot -> hurt()
Reset: set to 0 at start of every UNTAP
```

### Status
ACTIVE (Phase 5 Completion Sprint)

---

## 5.1 Card Data System

### Description
Defines immutable card templates used in gameplay.

---

### GDD Reference
- Card design system

---

### SYSTEMS.md Reference
- Section 10 (Card System)

---

### Implementation
```
/src/data/cards.js
```

---

### Responsibilities
- Define card attributes
- Define cost structures
- Define keyword/effect references

---

### Status
ACTIVE

---

# 6. ENGINE BRIDGE SYSTEM

---

## 6.1 useDuel Hook (React ↔ Engine Adapter)

### Description
Bridge layer between React UI and DuelCore engine.

---

### GDD Reference
- UI interaction model

---

### SYSTEMS.md Reference
- Section 11 (Engine Bridge System)

---

### Implementation
```
/src/hooks/useDuel.js
```

---

### Responsibilities
- Dispatch player actions to DuelCore
- Subscribe to GameState updates
- Provide UI-safe state access

---

### STRICT PROHIBITIONS
- Cannot resolve game rules
- Cannot mutate GameState
- Cannot simulate combat outcomes
- Cannot bypass DuelCore

---

### Status
CRITICAL BOUNDARY LAYER

---

# 7. UI SYSTEMS

---

## 7.1 Combat UI Layer

### Implementation
```
/src/ui/duel/
  Battlefield.jsx
  Hand.jsx
  ManaPanel.jsx
  TargetingOverlay.jsx
```

### Responsibilities
- Render DuelCore state
- Capture player input
- Display combat progression

---

## 7.2 Overworld UI Layer

### Implementation
```
/src/ui/overworld/
  WorldMap.jsx
  EncounterModal.jsx
```

### Responsibilities
- Render MapGenerator output
- Display encounters
- Trigger exploration actions

---

## 7.3 Shared UI Components

### Implementation
```
/src/ui/shared/
  Card.jsx       — card rendering; hosts CardArtDisplay (see §7.5)
  Tooltip.jsx
```

---

## 7.5 Scryfall Art Display

### Description
Presentation-only subsystem that fetches card artwork from the Scryfall API and renders it inside card components. Falls back to emoji icons on any failure — the game is fully playable without network access.

### SYSTEMS.md Reference
- Section 16 (Scryfall Art Integration System)

### Implementation
```
/src/utils/scryfallArt.js    — fetch utility + session cache (no React)
/src/utils/useCardArt.js     — React hook: { url, loading, error }
/src/ui/shared/Card.jsx      — CardArtDisplay component (inline)
```

### Responsibilities
- Resolve oldest classic-set art_crop URL per card name
- Cache results for the browser session (max one request per card)
- Expose synchronous cache read to eliminate flicker on re-renders
- Render `<img>` when URL is available; render emoji fallback otherwise

### Strict Constraints
- No game state access or mutation
- No interaction with DuelCore, reducers, or any engine file
- Network failure must never throw or crash the UI

### Status
ACTIVE

---

## 7.4 Layout System

### Implementation
```
/src/ui/layout/
  GameWrapper.jsx
  TechnicalLog.jsx
```

---

# 8. CORE ENGINE ENTRY POINTS

---

## 8.1 Application Entry

```
/src/main.jsx
/src/App.jsx
```

### Responsibilities
- Initialize React app
- Mount UI tree
- Connect hook layer to engine

---

# 9. SYSTEM DEPENDENCY GRAPH

---

## 9.1 Core Dependencies

- DuelCore → rulesets, keywords, cards
- AI → DuelCore state snapshots
- MapGenerator → rngSeed system
- UI → useDuel only

---

## 9.2 Global Dependency

- rngSeed → ALL systems

---

# 10. SYSTEM OWNERSHIP MODEL

---

## 10.1 Absolute Authority

- DuelCore.js is the ONLY system that may mutate GameState

---

## 10.2 Decision Authority

- AI.js may only generate GameActions

---

## 10.3 Data Authority

- cards.js, keywords.js, rulesets.js are immutable definitions

---

## 10.4 Presentation Authority

- UI layer is strictly render + input only

---

# 11. ANTI-DRIFT RULES

---

The following are strictly forbidden:

### Outside DuelCore:
- GameState mutation
- turn progression
- combat resolution
- stack execution

### Inside AI:
- rule enforcement
- outcome simulation
- state mutation

### Inside UI:
- gameplay logic execution
- deterministic resolution

---

# 12. COMPLETENESS RULE

A mechanic is considered fully integrated ONLY if:

✔ Defined in GDD.md  
✔ Defined in SYSTEMS.md  
✔ Mapped here in MECHANICS_INDEX.md  
✔ Implemented in /src  
✔ Owned by exactly ONE system  

---

---

# 13. TRIGGERED ABILITY PIPELINE

---

## 13.1 Triggered Ability System

### Description
The deterministic event-driven system responsible for detecting, ordering, and resolving all triggered abilities. Operates entirely within the reducer-driven game state (DuelCore.js). No runtime listeners — triggers are evaluated at explicit state transitions.

---

### GDD Reference
- §3.2.3 Turn Structure (upkeep triggers: Juzam Djinn, Force of Nature, Sengir Vampire)
- §3.3 Special Mechanics (Sengir Vampire, Force of Nature)
- §8 Phase 6 Deliverable 1

---

### SYSTEMS.md Reference
- Section 17 (Triggered Ability Pipeline)
- Section 17.1 (Data Model)
- Section 17.2 (Trigger Registration)
- Section 17.3 (Supported Event Types)
- Section 17.4 (Trigger Queue and Resolution Order)
- Section 17.5 (Upkeep Choice UI Contract)
- Section 17.6 (Protection Enforcement)
- Section 17.7 (Example Mapping)

---

### Implementation
```
/src/engine/DuelCore.js   — event emission, trigger evaluation, queue processing, RESOLVE_CHOICE reducer
/src/data/cards.js        — triggeredAbilities declarations on Sengir Vampire and Force of Nature
/src/hooks/useDuel.js     — resolveChoice dispatcher exposed to UI
/src/ui/DuelScreen.jsx    — ChoiceModal component (triggered ability choice UI for player)
```

---

### Responsibilities
- Emit structured events at all trigger-eligible state transitions (`ON_UPKEEP_START`, `ON_CREATURE_DIES`, `ON_DAMAGE_DEALT`, `ON_BLOCK_DECLARED`)
- Evaluate `triggeredAbilities[]` declarations against emitted events
- Enqueue valid Trigger Instances; process queue before phase advance
- Suspend queue when `pendingChoice` is set (`requiresChoice: true`); resume after `RESOLVE_CHOICE`
- Maintain `turnState.damageLog` for source-tracking conditions (Sengir Vampire)

---

### Active Triggers

| Card | Event | Behavior |
|------|-------|---------|
| Sengir Vampire | `ON_DAMAGE_DEALT` → `ON_CREATURE_DIES` | Logs damage source; adds +1/+1 counter when a damaged creature dies this turn |
| Force of Nature | `ON_UPKEEP_START` | Opens `ChoiceModal`: pay GGGG or take 8 damage; AI auto-resolves; suppressed by SILENCE modifier |

---

### Strict Constraints
- All trigger evaluation is synchronous and deterministic
- No timers, defaults, or implicit auto-resolution for player choices (`Determinism Requirement` §17.5.3)
- SILENCE dungeon modifier suppresses `ON_UPKEEP_START` emission
- Protection is enforced inline (not through trigger queue) — see §17.6

---

### Status
ACTIVE (Phase 6 Deliverable 1 ✅ Complete)

---

---

# 14. HOLY GROUND — LANDWALK SUPPRESSION

---

## 14.1 Holy Ground System

### Description
Castle modifier for Delenia (White). Suppresses all landwalk-type keywords on opponent creatures when the defending player controls Holy Ground. Enforced statically at keyword evaluation points — no trigger queue involvement.

---

### GDD Reference
- §4 (The Five Mages — Delenia Holy Ground)
- §8 Phase 6 Deliverable 2

---

### SYSTEMS.md Reference
- Section 19 (Holy Ground — Landwalk Suppression)

---

### Implementation
```
/src/engine/DuelCore.js  — hasKw (optional state param); canBlockDuel (optional state param)
```

---

### Responsibilities
- Return `false` for any `*WALK` keyword when defending player has `holy_ground` on battlefield
- Thread `state` into `canBlockDuel` blocking-legality check
- No cascade into trigger queue; pure inline enforcement

---

### Strict Constraints
- Does NOT grant protection, prevent targeting, or affect non-landwalk keywords
- Backward-compatible: existing call sites without `state` arg behave identically

---

### Status
ACTIVE (Phase 6 ✅ Complete — Option B)

---

# 15. POWER SURGE UPKEEP SYSTEM

---

## 15.1 Power Surge System

### Description
Upkeep damage trigger for Power Surge enchantment. Damage equals the number of lands the active player controlled that were untapped at the start of their previous upkeep (snapshot taken during UNTAP before the untap loop runs).

---

### GDD Reference
- §3.3 Special Mechanics (Power Surge)
- §8 Phase 6 Deliverable 3

---

### SYSTEMS.md Reference
- Section 20 (Power Surge Upkeep System)

---

### Implementation
```
/src/engine/DuelCore.js  — turnState.powerSurgeUntappedCount; UNTAP snapshot; UPKEEP handler
```

---

### Responsibilities
- Snapshot untapped land count during UNTAP (only when Power Surge is in play)
- Apply snapshot as damage during UPKEEP via `hurt()`
- Reset snapshot to 0 each UNTAP regardless of Power Surge presence

---

### Active Trigger

| Card | Snapshot Event | Damage Event | Behavior |
|------|---------------|-------------|---------|
| Power Surge | UNTAP start | UPKEEP | Deals X damage where X = untapped lands at previous upkeep start |

---

### Status
ACTIVE (Phase 6 ✅ Complete)

---

---

# 16. PERSISTENCE SYSTEM

---

## 16.1 Unlockables Persistence

### Description
Cross-run persistence of artifact ownership flags via `localStorage`. Allows unlocked artifacts to survive browser refreshes and new runs. In-run game state is not persisted.

### GDD Reference
- §5 (Artifacts and Unlockables)

### SYSTEMS.md Reference
- Section 21 (Persistence System)

### Implementation
```
/src/OverworldGame.jsx   — lazy useState initializer reads on mount; useEffect([artifacts]) writes on every change
```

### Responsibilities
- Read `shandalar_unlockables` from `localStorage` on app mount
- Write updated owned flags on every `setArtifacts` call
- Fail silently on any `localStorage` error (quota, private browsing, malformed JSON)
- `OW_ARTS` remains source of truth for artifact metadata; only `owned` flags are persisted

### Strict Constraints
- UI-layer concern only — no DuelCore involvement
- No migration logic — `OW_ARTS` defaults are always the safe fallback
- No user-visible errors; `console.warn` is the maximum noise level

### Status
ACTIVE (Phase 5 Completion Sprint)

---

---

## §17 — Priority Window System

**Reducer actions:** `OPEN_PRIORITY_WINDOW`, `PASS_PRIORITY`  
**State fields:** `priorityWindow` (boolean), `priorityPasser` (null | 'p' | 'o')  
**UI component:** `src/ui/ActionBar/InstantPriorityBar.tsx`  
**SYSTEMS.md reference:** §18  

### How it works
When a phase advance is requested, `requestPhaseAdvance()` checks whether either player has an instant in hand or a non-mana activated ability on the battlefield. If neither player has options, `ADVANCE_PHASE` fires immediately. If either side has options, `OPEN_PRIORITY_WINDOW` is dispatched. The window blocks `ADVANCE_PHASE` until both players have passed via `PASS_PRIORITY`. Suppressed entirely when `castleMod.name === 'SILENCE'` or `dungeonMod === 'SILENCE'`.

### AI behavior
The AI evaluates its hand for affordable instants, casts the first one it finds targeting the player, then immediately dispatches `PASS_PRIORITY({ who: 'o' })`.

When the AI casts a spell on its own turn, a `useEffect([s.stack?.length])` in DuelScreen
(and DuelScreenMobile) detects the stack growing from 0 to N while `active === 'o'` and
opens a priority window. This ensures the player always gets a response window for AI casts,
regardless of whether `applyAiActionsWithPriority` already opened one (the early-return guard
`if (s.priorityWindow || s.over) return` prevents double-opens).

### Traceability
- Implemented: Phase 6 Deliverable 2
- Source: `src/engine/DuelCore.js` (`OPEN_PRIORITY_WINDOW`, `PASS_PRIORITY` cases)
- Hook exposure: `src/hooks/useDuel.js` (`openPriorityWindow`, `passPriority`)
- Fix PW-AI-01: `src/DuelScreen.tsx` and `src/ui/Mobile/DuelScreenMobile.tsx` stack-length useEffect grow case

### Status
ACTIVE (Phase 6 + PW-AI-01 fix)

---

## §18 — Channel Repeatable Mana

### Description
Channel sorcery grants the casting player a repeatable mana ability: pay 1 life, add 1 {C}. Usable any number of times during the caster's main phase as long as life > 1.

### GDD Reference
§3.2.5 Stub effects resolved — Channel row.

### SYSTEMS.md Reference
Section 22 — Channel Repeatable Mana Action.

### Traceability

| Feature | Action Type | Engine Location | Card Data |
|---------|-------------|-----------------|-----------|
| Channel repeatable mana | `USE_CHANNEL` action | `DuelCore.js` `USE_CHANNEL` case | `cards.js` channel entry (`effect: "channel"`) |

### Implementation
- `case "channel"` in `resolveEff` sets `channelActive: true` on the casting player.
- `USE_CHANNEL` reducer: guards `channelActive` and `life > 1`; applies `hurt()` for 1 damage; adds 1 `{C}` to mana pool.
- CLEANUP: `channelActive` set to `false` for both players.
- UI button: conditional render in `DuelScreen.tsx` adjacent to player Banner.
- AI: greedy `USE_CHANNEL` emissions in `planMain` before spell selection.

### Status
ACTIVE (Phase 6)

---

---

## 1.3 cardHandlers.js — Effect Execution

### Description
Card effect implementations extracted from DuelCore.js for maintainability.
Imported exclusively by DuelCore.js.

### SYSTEMS.md Reference
Section 29 (cardHandlers.js Effect Execution Module)

### Implementation
```
/src/engine/cardHandlers.js
```
### Status
ACTIVE

---

## 2.2 AI Virtual Mana Simulation

### Description
The AI's multi-spell planning loop (`planMain`) uses a virtual state to track mana spent and produced across sequential spell evaluations without mutating `GameState`.

**`evaluateAndCast`:** After `buildTapActions` selects which lands/artifacts to tap, their mana is credited into `vManaAfterTap`. The spell's cost (colored + generic) is then deducted into `poolAfterCast`, which is stored in `newVirtualState.o.mana`. Each subsequent spell evaluated in the loop starts from this post-cast pool, preventing double-counting of already-tapped sources.

**`applyVirtualPlay`:** When a played card has `effect === 'addMana'` and a `mana` array (e.g. `["B","B","B"]` for Dark Ritual), those characters are credited into the virtual pool. This allows `scoreTurnPlan` to correctly evaluate follow-up cast affordability after ramp spells.

### SYSTEMS.md Reference
- Section 6 (`evaluateAndCast` entry)

### Implementation
- `src/engine/AI.js` — `evaluateAndCast` (`poolAfterCast` block), `applyVirtualPlay` (`addMana` credit block)

### Invariant
New `addMana` cards added to `cards.js` must use a flat `mana` array of color characters for `applyVirtualPlay` to credit them. String-only `mana` fields are not credited.

---

## 2.3 MCTS Module

### Description
Monte Carlo rollout engine used by AI.js for move scoring. Simulates policy-guided play-outs
from candidate game states to estimate win probability.

Phase 7 (initial): random play policy (`randomMainAction`, `randomAttack`), life+power heuristic
fallback (`heuristicWinner`), even-split time budget across candidates.

Phase 7 upgrade (MCTS rollout quality audit): `policyMainAction` (land-first, highest-CMC
affordable spell), `policyAttack` (evasion-aware, avoids suicidal attacks), `evaluateBoard`
weighted board evaluator (life delta, board power/toughness with evasion weights, hand size,
mana development), UCB1 bandit budget allocator with 3-iteration seed phase per candidate.

### SYSTEMS.md Reference
Section 28 (MCTS Monte Carlo AI Module)

### Implementation
```
/src/engine/MCTS.js
```
### Status
ACTIVE

---

## 3.2 World Magic Spell System

### Description
Eight overworld power-up spells: 5 passive (always-on effects) and 3 active (player-triggered).
Found on the map or purchased from sages.

### SYSTEMS.md Reference
Section 23 (World Magic Spell System)

### Implementation
```
/src/engine/MapGenerator.js  — WORLD_MAGICS export (definitions)
/src/OverworldGame.jsx        — worldMagics[], wmCooldowns state; acquisition; activation handlers
/src/ui/overworld/WorldMagicPanel.jsx — inventory display + activate buttons
```
### Status
ACTIVE (Phase 7)

---

## 3.3 Dungeon Clue System

### Description
Dungeons are hidden (clued: false) at map generation. Two paths to reveal: sage purchase (25g)
or post-duel card-vs-clue choice. Unclued dungeons are invisible and non-interactive.

### SYSTEMS.md Reference
Section 24 (Dungeon Visibility)

### Implementation
```
/src/engine/MapGenerator.js   — dungeonData.clued initialization
/src/OverworldGame.jsx         — handleSage, postDuelChoice state, completeDelivery
/src/ui/overworld/PostDuelChoiceModal.jsx — choice UI
```
### Status
ACTIVE (Phase 7)

---

## 3.4 City Conquest & Liberation

### Description
Towns can be conquered when mana link events expire. Conquered towns disable services and
offer a Liberate fight option. Loss condition: ≥60% of towns conquered.

### SYSTEMS.md Reference
Section 25 (City Conquest & Liberation)

### Implementation
```
/src/engine/MapGenerator.js  — townData.conquered initialization
/src/OverworldGame.jsx        — conquest logic in expiredEvents loop; useEffect loss check;
liberate context in handleDuelResult
/src/ui/overworld/TownModal.jsx — conquered town UI, Liberate tab
```
### Status
ACTIVE (Phase 7)

---

## 3.5 Delivery Quest System

### Description
~40% of towns have delivery quests at map generation. Player carries an item to a destination
town for a reward (mana link, gold, or card). One active delivery at a time.

### SYSTEMS.md Reference
Section 26 (Delivery Quest System)

### Implementation
```
/src/engine/MapGenerator.js  — delivery quest generation in generateMap post-processing
/src/OverworldGame.jsx        — activeDelivery state; completeDelivery useCallback;
HUD delivery banner
```
### Status
ACTIVE (Phase 7)

---

## 3.6 Enemy Tier System

### Description
Three tiers of random encounter enemies (HP 10/14/18), plus henchman tier (HP 24–27,
unbribeable) that spawns after move 80. HP values match original MicroProse game.

### SYSTEMS.md Reference
Section 27 (Enemy Tier System)

### Implementation
```
/src/engine/MapGenerator.js  — MONSTER_TABLE (corrected HP), HENCHMAN_TABLE (new export)
/src/OverworldGame.jsx        — henchman spawn logic in doMove; canFlee override in
openEncounterPopup
```
### Status
ACTIVE (Phase 7)

---

## 7.6 Dual Land & Special Land UI

### Description
Color picker UI for dual lands and City of Brass. DualLandColorPicker renders when
a multi-producing land is tapped; player selects which color to add.
City of Brass additionally dispatches CITY_OF_BRASS_DAMAGE after the choice.
GraveyardPopover renders when player clicks their graveyard zone.

### SYSTEMS.md Reference
No dedicated section — presentation layer only.

### Implementation
```
/src/ui/duel/TargetingOverlay.jsx  — DualLandColorPicker, LotusColorPicker, BopColorPicker components
/src/DuelScreen.tsx                — pendingDualLand state; GraveyardPopover inline component; graveyardPopover state
```
### Status
ACTIVE (implemented during Phase 6 cutover)

---

---

# 6. UI / PLATFORM SYSTEMS

---

## 6.1 Mobile Responsive Layout System

### Description
Two breakpoints govern layout divergence:

- **768px** (`useIsMobile`) — OverworldGame viewport, D-pad sizing, toolbar.
- **640px** (`useMedia('(max-width: 640px)')`) — duel screen selection: `DuelScreenMobile` at ≤ 640px, `DuelScreen` above.

`DuelScreenMobile` is a fully separate component tree in `src/ui/Mobile/`. It reads from the same `useDuel` store — no game logic fork. Desktop layout is unmodified at all breakpoints above 640px.

### GDD Reference
N/A — presentational layer only.

### SYSTEMS.md Reference
See `docs/MOBILE_VS_PC.md` (authoritative reference for all platform layout divergence).

### Implementation
```
/src/hooks/useIsMobile.js        — OverworldGame layout gate (≤ 768px, ResizeObserver)
/src/hooks/useMedia.ts           — generic matchMedia hook; used for ≤ 640px duel gate
/src/hooks/usePhaseAdvance.ts    — phase-advance logic shared by DuelScreen + DuelScreenMobile
/src/DuelScreen.tsx              — desktop/tablet duel screen (> 640px)
/src/ui/Mobile/                  — compact phone duel layout (≤ 640px):
  DuelScreenMobile.tsx             root; engine wiring, AI loop, selection state
  Topbar.tsx / PhaseBar.tsx / PhaseRibbon.tsx
  Banner.tsx / ZoneChip.tsx
  Row.tsx / PipRow.tsx
  FieldCard.tsx / HandCard.tsx / LandPip.tsx
  ActionBar.tsx / LogSheet.tsx
  styles.module.css
/src/OverworldGame.jsx           — renders DuelScreenMobile ≤ 640px, DuelScreen above
/docs/MOBILE_VS_PC.md           — complete divergence table and future-change rules
```

### Strict Constraints
- Detection hooks are read-only from game-state perspective — they only read viewport dimensions
- Engine files (`DuelCore.js`, `AI.js`, etc.) must never be conditioned on any mobile flag
- Both duel screens read from the same `useDuel` store — data layer must never fork
- Compact-phone layout changes belong in `src/ui/Mobile/`; do not add `isMobile` branches inside `DuelScreen.tsx` for ≤ 640px concerns

### Status
ACTIVE (Phase 7 — Mobile Support; compact duel screen added post-Phase 7)

## Mana Tap Undo

- Trigger: Player taps a land (`TAP_LAND`) or mana artifact (`TAP_ART_MANA`) during `MAIN_1` or `MAIN_2` while `spellsThisTurn === 0`
- Available: Until the player casts a spell or the phase advances
- Effect: Untaps all sources tapped this turn, removes the mana from pool
- UI: "Undo Taps" button in `ActionBar`, visible only when undo is available (`canUndoMana === true`)
- Implementation: `UNDO_MANA_TAPS` action in `DuelCore.js`; `manaTapSnapshot` state field in `buildDuelState`

## §19 — Difficulty System

### §19.1 Difficulty config (`src/data/difficulties.js`)

Keys: `APPRENTICE`, `MAGICIAN`, `SORCERER`, `WIZARD`. Each entry defines: `startingLife`, `tierLife[3]`, `bossBase`, `bossPerKill`, `deckSize[2]`, `colorWeights[5]`, `offColorMultiplier`, `landRatio`, `landVariance`, `landColorVariance`.

### §19.2 Deck generation

Pure function `generateStartingDeck(color, difficultyId, seed)` returns `string[]` of card IDs. No engine imports. Depends on `CARD_DB` from `cards.js` only.

### §19.3 Life values

- Player start: `difficulty.startingLife` (set in `OverworldGame.jsx`, passed as `overworldHP` to `buildDuelState`)
- Monster: `difficulty.tierLife[tier-1]` (computed in `openEncounterPopup`, stored in `extraData.oppLife`, threaded to `buildDuelState` via `duelCfg.oppLife`)
- Boss: `difficulty.bossBase + magesDefeated.length * difficulty.bossPerKill` (computed in `handleChallenge`)

### §19.4 SYSTEMS.md reference

See `docs/SYSTEMS.md` §33.

---

## §20 StackDisplay Mobile Collapse (UI)

### Description
`StackDisplay` on mobile (`isMobile === true`) starts collapsed. A centered pill button shows the current stack depth. Tapping the pill expands the full card splay. A collapse button inside the expanded panel returns to the pill. A `useEffect` watching `stack.length` auto-expands the panel when a new item is pushed.

### SYSTEMS.md Reference
Section 4 (Action & Stack System) — stack visibility is a UI concern; engine state is unchanged.

### Implementation
```
src/ui/Stack/StackDisplay.tsx  — collapsed state, prevLenRef, auto-expand effect, pill render, collapse button
e2e/sandbox.spec.ts            — tests 7F (updated), 7G (new)
```

### data-testid inventory
| testid | state |
|---|---|
| `stack-display` | both collapsed (outer div) and expanded (outer div) |
| `stack-pill` | collapsed only — inner span inside the pill div |
| `stack-collapse-btn` | expanded mobile only — button in top-right of panel |
| `stack-top-card` | expanded only — top card full render |

### Status
ACTIVE (Sprint 7 — mobile collapse feature)

---

## E2E: Priority Window — AI Spell Cast

### Description
Tests 5 & 6 in `e2e/duel-controller.spec.ts` verify that when a spell lands
on the stack during the AI's turn, the player receives a priority window
before the spell resolves.

### GDD Reference
Phase 2 — Priority Window system.

### SYSTEMS.md Reference
Section 31.3 (E2E Testing Infrastructure).

### Traceability

| Feature | File | Mechanism |
|---|---|---|
| Stack push sets priorityWindow | `DuelCore.js` CAST_SPELL case | `priorityWindow: true` in returned state |
| Priority window close resolves stack | `useDuelController.ts` priorityWindow effect | `resolveStack()` after both players pass |
| AI direct cast in tests | `e2e/duel-controller.spec.ts` | `CAST_SPELL {who:'o'}` bypasses AI planner |

### Status
ACTIVE — covered by e2e tests 5 (desktop) and 6 (mobile)

## 1.3 Layer System

### Description
Pure function module that computes a permanent's characteristics by applying
continuous effects in CR 613 layer order (4 -> 5 -> 6 -> 7a -> 7b -> 7c -> 7d).

### SYSTEMS.md Reference
Section 18 (Layer System)

### Implementation

```
src/engine/layers.js          -- computeCharacteristics, CDA_EVALUATORS
src/engine/DuelCore.js        -- getPow, getTou, hasKw (thin wrappers)
src/data/cards.js             -- layerDef field on CDA/lord/pump cards
```

### Key Concepts
- `layerDef` field on permanents/auras describes their layer contribution
- `enterTs` on permanents provides timestamp ordering within a layer
- `layerClock` on GameState is the monotonic timestamp counter
- `eotBuffs[]` entries may carry `layerDef` for temporary layer effects

### CDA Card Traceability

| Card | Evaluator key | Oracle rule | Notes |
|---|---|---|---|
| Plague Rats | `plagueRats` | P/T = number of Plague Rats in play | Counts both players' copies |
| Nightmare | `swampCount` | P/T = number of Swamps you control | Controller's Swamps only |
| Gaea's Liege | `forestCountLiege` | Non-attacking: controller's Forests; Attacking: defending player's Forests | Uses `card.attacking` flag; corrected from `forestCount` (audit fix) |
| Keldon Warlord | `keldonWarlord` | P/T = number of non-Wall creatures you control (including itself) | Wall check: `x.subtype?.includes('Wall')`; corrected from !x.tapped/self-exclusion (audit fix) |

### Status
ACTIVE

## 5.X Ward / Protection Auras

### Description
Auras granting protection from a color. Protection prevents blocking, targeting,
and damage from sources of that color.

### Cards
black_ward, blue_ward, green_ward, red_ward, white_ward

### Implementation
```
cards.js:   effect:"enchantCreature", mod:{protection:["X"]}
layers.js:  collectEffects reads aura.mod.protection -> Layer 6 addProtection
DuelCore.js: canBlockDuel reads computeCharacteristics().protection when state present
```

### Status
ACTIVE (implemented this sprint)

---

## 5.Y Invisibility

### Description
Aura that makes the enchanted creature unblockable except by Walls.

### Cards
invisibility

### Implementation
```
cards.js:    effect:"enchantCreature", mod:{invisibility:true}
DuelCore.js: canBlockDuel checks at.enchantments[].mod.invisibility; returns false
             unless blocker subtype includes 'Wall'
```

### Status
ACTIVE

---

## 5.Z Animate Wall

### Description
Aura that enchants a Wall and removes its DEFENDER keyword, allowing it to attack.

### Cards
animate_wall

### Implementation
```
cards.js:    effect:"enchantCreature", mod:{removeKeywords:["DEFENDER"],enchantWallOnly:true}
layers.js:   collectEffects emits Layer 6 removeKeywords from aura.mod.removeKeywords
DuelCore.js: enchantCreature handler checks mod.enchantWallOnly before attachment;
             rejects non-Wall targets
```

### Status
ACTIVE

---

## 5.AA Earthbind

### Description
Aura that conditionally strips flying from a creature and deals 2 damage if it had flying at attach time.

### Cards
earthbind

### Implementation
```
cards.js:    effect:"enchantCreature", mod:{earthbind:true}
DuelCore.js: enchantCreature handler: if host has flying at attach time, deal 2 damage
             and mutate the newly-attached aura record to add removeKeywords:[FLYING].
             Damage checked via checkDeath. Layer engine removes FLYING via the
             mutated aura's removeKeywords field.
```

### Status
ACTIVE

---

## 5.AB Creature Bond

### Description
Aura that deals damage equal to the enchanted creature's toughness to its controller when it dies.

### Cards
creature_bond

### Implementation
```
cards.js:    effect:"enchantCreature", mod:{creatureBond:true}
DuelCore.js: checkDeath scans dyingCard.enchantments BEFORE zMove strips them.
             Calls hurt(ns, w, tou, 'Creature Bond') for each creatureBond aura.
             tou read via getTou(dyingCard, ns) at time of death.
```

### Status
ACTIVE

---

## 5.AC Venom

### Description
Aura that destroys the other creature in a block at end of combat when a non-Wall creature is involved.

### Cards
venom

### Implementation
```
cards.js:    effect:"enchantCreature", mod:{venom:true}
DuelCore.js: DECLARE_BLOCKER: if attacker or blocker has venom aura and the other
             creature is not a Wall, adds that creature's iid to
             turnState.venomTargets[].
             advPhase COMBAT_END: iterates venomTargets, calls zMove/gy on each
             creature not flagged regenerating, then clears venomTargets.
             turnState init: both full init and turn-change partial reset include
             venomTargets: [].
```

### Status
ACTIVE

---

---

## GROUP P BATCH (2026-06-04)

### pumpAttackersEOT
Morale: attacking creatures get +1/+1 until end of turn.
```
cards.js:    effect:"pumpAttackersEOT"
DuelCore.js: resolveEff case "pumpAttackersEOT" -- iterates both sides' bf,
             appends {power:1,toughness:1} to eotBuffs of all attacking creatures.
```
### Status: ACTIVE

---

### cantAttackTurn
Wall of Dust on-block trigger: blocked creature can't attack on its controller's next turn.
```
cards.js:    effect:null, onBlock:"banBlockedAttacker"
DuelCore.js: resolveCombat -- Wall of Dust checks c.blocking after damage, sets
             blocked.cantAttackTurn = ns.turn + 1.
             DECLARE_ATTACKER -- guard: if c.cantAttackTurn >= s.turn, reject.
```
### Status: ACTIVE

---

### Group P resolveEff batch
New cases: debuffNonwhiteEOT, destroyAllArtifacts, inferno6, damageAttackers1,
jovialEvil, destroyAllBlack, ashesToAshes, stormSeeker, destroyForests, typhoon,
bloodLust, detonate, pumpWallsEOT, mightstoneAttackPump, energyTap,
gainFirstStrikeEOT, removeFlying, destroyBlueCreature, damage4Any, untapTarget,
psionicEntity, globalDebuffPower1EOT, debuffTargetPower1EOT, preventDamage1Any,
preventDamage1Creature, ebonyHorse, fightTargets, warBarge, jadeStatue,
grantBandingEOT, addManaWithSelfDamage.
```
DuelCore.js: resolveEff switch, after case "fog"
```
### Status: ACTIVE

---

# End of MECHANICS INDEX v1.4
