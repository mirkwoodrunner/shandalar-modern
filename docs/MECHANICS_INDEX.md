# Shandalar Mechanics Index (v1.0)

## Premodern Card Pool (data only)

`src/data/cardsPremodern.js` exports `CARD_DB_PREMODERN` -- a standalone card data array
covering the Premodern format (Fourth Edition through Scourge, 29 sets, 5408 unique cards).
Sourced from Scryfall oracle bulk data filtered by `legalities.premodern`. All entries have
`implemented:false` -- no effect handlers exist yet. Fully independent of `CARD_DB`/`cards.js`.
Ban list (33 cards) stored as `legal:false` entries. See `docs/CURRENT_SPRINT.md` for counts.

---

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

#### Counter-Spell Target Resolution
Status: ACTIVE (counter-targeting sprint)
`findStackTarget(stack, tgt, counterItemId)` resolves counter targets by id
with positional fallback. BEB/REB mode state lives in `useDuelController.ts`
as `pendingMode`. Stack item click-to-target wired in `StackDisplay` via
`onItemClick` prop.

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

## 5.3 Display P/T Helper

### Description
`getDisplayPT(card)` in `src/engine/DuelCore.js` computes UI-safe effective P/T by summing
`eotBuffs` power/toughness deltas and `counters.P1P1`/`M1M1` without requiring full game state.
Used by `FieldCard` (desktop and mobile) so pumped stats display correctly.
For combat/SBE accuracy, always use `getPow(c, state)` / `getTou(c, state)` instead.

### Implementation
```
src/engine/DuelCore.js        -- getDisplayPT() export
src/ui/Card/FieldCard.tsx     -- desktop creature P/T badge
src/ui/Mobile/FieldCard.tsx   -- mobile creature P/T badge
```

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
Three tiers of random encounter enemies (HP 10/14/18), plus henchman tier (HP 24-27,
unbribeable) that spawns after move 80. HP values match original MicroProse game.

Henchmen (HENCHMAN_TABLE) now spawn as tracked, fog-gated, chaseable map sprites
rather than triggering a blind unfleeable popup with no map presence. On spawn they
are placed 3-5 tiles from the player (outside the radius-2 vision box) so they are
always fogged at the moment of spawn but reachable as the player continues exploring.
The `isHenchman: true` marker on the enemy object prevents multiple concurrent henchmen
from stacking. `canFlee: false` is carried on the enemy object itself and is forwarded
to `openEncounterPopup` at both collision sites.

The `tickEnemyAI` chase trigger distance was reduced from 4 to 2 to match the player's
actual vision radius (`revealAround`'s 5x5 box). No enemy can begin closing distance
from a tile the player cannot see.

### SYSTEMS.md Reference
Section 27 (Enemy Tier System)

### Implementation
```
/src/engine/MapGenerator.js             -- MONSTER_TABLE (corrected HP), HENCHMAN_TABLE
/src/engine/EnemyAI.js                  -- chase threshold reduced from 4 to 2
/src/hooks/useOverworldController.js    -- henchman spawns into enemies[] as real sprite;
                                           canFlee threaded through both collision sites;
                                           __overworldState/__overworldSetEnemies/
                                           __overworldSetMoves sandbox test globals added
/src/ui/overworld/Sprite.jsx            -- spriteForHenchman(colorLetter) export (unchanged)
/tests/e2e/henchman-visibility.spec.ts  -- E2E regression suite (10 tests, 2 viewports)
```

### Monster variety (terrain-decoupled selection)
Encounter monster archetype/color/sprite is decoupled from the tile biome so the player sees a
variety of monsters everywhere (difficulty/tier unchanged).
```
/src/engine/MapGenerator.js          — pickMonster(tier, rand): tier-appropriate pick from a
                                        RANDOM biome list (rand injected; no ambient randomness)
/src/ui/overworld/Sprite.jsx         — KIND_BY_ARCH; spriteForMonster prefers archetype kind
                                        (terrain kind kept as fallback)
/src/hooks/useOverworldController.js — 5 encounter sites now call pickMonster(...) instead of
                                        MONSTER_TABLE[terrain.id] (initial/spontaneous spawn,
                                        ruin guardian, two collision lookups)
/tests/scenarios/monster-variety.test.js — tier clamping + cross-biome variety
```
See SYSTEMS.md 27.2.

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

---

## Mechanic: Tutor Modal System (2026-06-05)

### What it does
Interactive library search for cards with `effect:"tutor"`. Replaces the old random-pick behavior. Player sees full library filtered by type/color with search and sort. AI uses `scoreLibCard()` heuristic.

### Implementation
```
DuelCore.js: resolveEff case "tutor": → sets pendingTutor (shuffled lib)
DuelCore.js: CHOOSE_TUTOR, DECLINE_TUTOR → resolve or dismiss tutor
useDuelController.ts: AI pendingTutor block, scoreLibCard() helper
src/ui/duel/TutorModal.tsx: player-facing search UI
```

### Status: ACTIVE

---

## Mechanic: Transmute Artifact (2026-06-05)

### What it does
Three-step modal flow: sacrifice artifact → search for artifact → pay mana difference (if any) → ETB. Uses pendingTutor with _transmuteMode flag for the search step.

### Implementation
```
cardHandlers.js: "Transmute Artifact" onResolve → sets pendingTransmuteSacrifice
DuelCore.js: CONFIRM_TRANSMUTE_SACRIFICE, DECLINE_TRANSMUTE_SACRIFICE, CHOOSE_TUTOR_TRANSMUTE
DuelCore.js: CONFIRM_TRANSMUTE_PAY, DECLINE_TRANSMUTE_PAY
src/ui/duel/TransmuteSacrificeModal.tsx: sacrifice selection UI
src/ui/duel/TransmutePayModal.tsx: mana payment UI
```

### Status: ACTIVE

---

---

## Bug Fix Log

### Fix: Demonic Hordes upkeep drawback fires on wrong player's turn (DH-UPKEEP-1)

- `demonicHordesUpkeep` in `DuelCore.js` was missing the active-player guard present on sibling
  "your upkeep" triggers (`forceOfNatureUpkeep`, `landTax`, `erhnamsUpkeep`, `kudzuUpkeep`).
- Added `if (w !== ns.active) break;` as the first line of the case body to match the established pattern.
- Regression tests DH-01 through DH-04 added to `src/engine/__tests__/phase6.test.js`.
- E2E coverage (desktop + mobile) added to `e2e/sandbox.spec.ts` (describe block `DH-E2E-01`).

> **Skip log (Step 3):** Group P section for `docs/CURRENT_SPRINT.md` was skipped because "Group P" text already exists there (eject condition triggered).

### Fix: Tapped creatures cannot block (rule 509.1a)

- `canBlockDuel` in `DuelCore.js` now returns `false` immediately when `bl.tapped` is true.
- This is the first guard in the function, before any keyword checks.
- AI.js already pre-filtered tapped creatures; this fix closes the gap for player-declared blocks.
- Regression test: `src/engine/__tests__/blocking.test.js`

### Fix: AI taps summoning-sick mana dorks for mana (B-SS1)

- `computeAvailableMana` and `buildTapActions` filtered non-land activated-mana sources with `!c.tapped` only; `planActivatedAbilities` also lacked the check.
- Added `!c.summoningSick` / `c.summoningSick` guard to all three sites in `AI.js`.
- Regression test: `src/engine/__tests__/AI.summoningSick.tap.test.js`

### Fix: ACTIVATE_ABILITY stack + mana cost (ACT-STACK-1)

| System | Mechanic | Description |
|---|---|---|
| `DECLARE_ATTACKER` | DEFENDER keyword | Creatures with DEFENDER were not blocked from being declared as attackers. Guard added to `DuelCore.js` `DECLARE_ATTACKER` case. |
| Terror (AI) | restriction filter | AI `selectTarget` ignored `card.restriction`, allowing Terror to target black/artifact creatures. `restriction='nonArtifactNonBlack'` and `'nonBlack'` now filtered in `selectTarget` `isRemoval` branch. `destroyTapped` also restricted to tapped targets only. |
| Regrowth (AI) | targeting | `regrowth` was in `targetsSelf` list, returning `['o']` and logging "targeting Opponent". Moved to explicit guard: returns `null` if `state.o.gy` is empty, returns `[]` otherwise. DuelCore resolves from `caster.gy` directly, ignoring targets. |
| Dark Ritual (AI) | follow-up gate | AI cast Dark Ritual without a castable follow-up. `evaluateAndCast` now checks post-cast virtual state for at least one affordable non-mana spell before emitting `PLAY_CARD` for `addMana` effects. |
| `ACTIVATE_ABILITY` | stack + mana cost | Non-mana activated abilities now push to `s.stack` with `isAbility:true` and open `priorityWindow`. Mana cost (non-tap portion) is now parsed and paid via `canPay`/`payMana` at activation time. `RESOLVE_STACK` guards `isAbility` to prevent ability items entering battlefield or graveyard. |
| Goblin Balloon Brigade | combat-phase activation | Priority window now opens during `COMBAT_ATTACKERS` and `COMBAT_BLOCKERS` when non-mana activated abilities exist on the battlefield, enabling instant-speed use. |
| Prodigal Sorcerer / Royal Assassin | player targeting | `pendingActivate` ping-type abilities now enable Banner `onLifeClick` on both desktop and mobile, firing `ACTIVATE_ABILITY` with `'o'`/`'p'` as target. `pendingActivate` state moved to `useDuelController.ts`. |

### Combat Priority Windows (B33)

- `COMBAT_ATTACKERS` and `COMBAT_BLOCKERS` are declare-only phases. `TAP_LAND`, `TAP_ART_MANA`,
  and `ACTIVATE_ABILITY` are rejected at the engine level with a rule log entry.
- `COMBAT_AFTER_ATTACKERS` and `COMBAT_AFTER_BLOCKERS` are full priority windows. Instants and
  non-mana activated abilities are legal. Both phases are in `ABILITY_PRIORITY_PHASES`.
- Done Attacking (`COMBAT_ATTACKERS`, player's turn) and Done Blocking (`COMBAT_BLOCKERS`,
  opponent's turn) call `advancePhase()` directly, not `requestPhaseAdvance()`, so the
  priority window opens in the subsequent AFTER phase rather than the declare phase.
- AI uses `planInstantResponse()` for both AFTER phases.
- No-attacker skip (B14) extended: if `attackers` is empty, `advPhase` skips
  `COMBAT_AFTER_ATTACKERS`, `COMBAT_BLOCKERS`, and `COMBAT_AFTER_BLOCKERS` and jumps to `MAIN_2`.

### Fix: AI mulligan re-firing during priority windows (AI-MULL-1)

- Root cause: `shouldMulligan` in `AI.js` had no terminal pregame state. The instant-response
  priority effect in `useDuelController.ts` calls `aiDecide` every time a priority window opens
  during the player's turn, including on turn 1 after a spell cast. `shouldMulligan` re-evaluated
  on each call and could return true repeatedly, dispatching MULLIGAN actions that are not valid
  priority responses -- `priorityPasser` for 'o' was never set, stalling the window permanently.
- Fix:
  - `buildDuelState` (DuelCore.js): adds `mulliganDecided: false` to both player objects.
  - MULLIGAN reducer (DuelCore.js): sets `o.mulliganDecided: true` for `who === 'o'`; no-ops if
    already true. Player mulligans are unaffected.
  - New MULLIGAN_KEEP reducer (DuelCore.js): sets `o.mulliganDecided: true` with no other state
    change; used when the AI decides to keep its opening hand.
  - `shouldMulligan` (AI.js): bails immediately when `state.o.mulliganDecided` is true.
  - Instant-response priority effect (useDuelController.ts): rejects MULLIGAN/MULLIGAN_KEEP during
    an open priority window, falls back to PASS_PRIORITY as defense-in-depth.
- `mulliganDecided` uses strict `=== true` / `=== false` checks so old test states (where the
  field is `undefined`) are unaffected and existing tests remain valid.
- Regression test: `tests/scenarios/ai-mulligan-no-restall.test.js`

### Activated Mana Abilities (creature sources)

Cards with `activated: { cost: "T", effect: "addMana", mana: "<color>" }` route through
`ACTIVATE_ABILITY` -> `resolveEff`. The `manaItem` passed to `resolveEff` must explicitly
set `mana: act.mana` at the top level -- spreading `{ ...card }` is insufficient because
`mana` is nested under `activated` on creature cards, not at the card root.

### Fix: Black Lotus cancel sacrifices card before color pick (BL-CANCEL-1)

- `ACTIVATE_ABILITY` `addMana3Any` branch called `zMove` immediately, sacrificing Lotus before the color picker opened. Cancel had no way to restore it.
- Fix: removed `zMove` from `ACTIVATE_ABILITY`; sacrifice moved into `CHOOSE_LOTUS_COLOR` (after player confirms a color).
- New `CANCEL_LOTUS` action untaps the card and clears `pendingLotus`/`pendingLotusIid` with no mana added and no sacrifice.
- `UNDO_MANA_TAPS` now returns `s` unchanged when `pendingLotus === true`; cancel path owns rollback while picker is open.
- `manaTapSnapshot` now taken during `addMana3Any` tap so the undo button appears after Lotus activation.
- `handleLotusCancel` in `useDuelController.ts` dispatches `CANCEL_LOTUS` before closing the modal.
- Playwright tests: `tests/e2e/lotus-cancel-undo.spec.js` (T1, T3-T5 desktop; M1-M2 mobile).

### Fix: AI land destruction -- silent no-op on Sinkhole / Strip Mine / Demonic Hordes (AI-LAND-1)

Root cause (two-part):

1. `selectTarget()` in `AI.js` had no branch for `effect === 'destroyTargetLand'`. It fell through
   to the final `targetsSelf`/`targetsOpp` check, returned `[]` (not `null`), and the spell was
   cast with zero targets. `DuelCore.js`'s `destroyTargetLand` case was a silent no-op when `tgtC`
   was falsy (no `dlog` call on the failure path).

2. `ACTIVATE_ABILITY` in `DuelCore.js` hardcoded `s.p.bf` / `caster: "p"` throughout. The AI's
   `ACTIVATE_ABILITY` dispatch included no `who` field, so the card lookup always searched
   `s.p.bf` (the human's battlefield) and found nothing -- returning `s` unchanged.
   Additionally, no `sac` cost parsing existed, so Strip Mine could not pay its sacrifice cost.

Fixes:

| Site | Change |
|---|---|
| `AI.js` `selectLandToDestroy()` (new helper) | Picks the highest-value opposing land to destroy: nonbasics first, then scarcest-color basic, then any land. Returns `null` if no lands exist (causes caller to skip the cast). |
| `AI.js` `selectTarget()` | New `destroyTargetLand` branch calls `selectLandToDestroy`, returns `null` when no target exists (correctly skips cast). Covers Sinkhole, Stone Rain, Ice Storm. |
| `AI.js` `planActivatedAbilities()` | New Strip Mine branch (`isLand(c)` + `sac` cost) and Demonic Hordes branch (`!isLand(c)` + no `sac`) each call `selectLandToDestroy` and push `ACTIVATE_ABILITY` when a target exists. |
| `AI.js` `dcActions` translator | Added `who: 'o'` to `ACTIVATE_ABILITY` dispatch so DuelCore routes to the AI's battlefield. |
| `DuelCore.js` `ACTIVATE_ABILITY` | Now reads `w = action.who \|\| 'p'` and uses `s[w]` throughout the non-mana cost-payment and stack-push section. Defaults to `'p'` for backward compatibility. Added `sac` cost parsing (step 2): sacrifices the activating permanent before pushing the ability to the stack. |
| `DuelCore.js` `destroyTargetLand` resolution | Added `else` fizzle branch: `dlog(ns, "${card.name} fizzles -- no valid land target.", "effect")` when `tgtC` is absent or not a land. Matches the existing `destroyBlueOrCounter` fizzle pattern. |

Cards affected: Sinkhole (B, BB), Stone Rain (R, 2R), Ice Storm (G, 2G) -- spell path.
Strip Mine (colorless land, T+sac), Demonic Hordes (B, BBB+T) -- activated-ability path.

Follow-up (not in this fix): Mishra's Factory and Birds of Paradise activated abilities remain
player-only (`s.p` hardcoded) and are not yet planned by the AI. Any future AI ability planning
for those cards can rely on the `who`-aware `ACTIVATE_ABILITY` engine path without further
engine changes.

Regression tests: `tests/scenarios/ai-land-destruction.test.js` (18 Vitest unit tests -- Groups
A/B/C/D covering DuelCore resolution, ACTIVATE_ABILITY who-routing, sac cost, AI target
selection, and AI planActivatedAbilities for both Strip Mine and Demonic Hordes).

---

# 17. PRIORITY WINDOW SYSTEM

---

## 17.1 Priority Window

### Description
Interactive pause layer that opens after a spell is cast onto the stack, giving
both players the opportunity to respond with instants before the stack resolves.
The window closes when both players pass priority in succession. Restricted to
interactive phases (MAIN_1, MAIN_2, END) via a `PRIORITY_WINDOW_PHASES` whitelist.

### SYSTEMS.md Reference
- Section 18 (Priority Window)
- Section 18.10 (AI priority behavior)

### Implementation
```
/src/engine/DuelCore.js
-- OPEN_PRIORITY_WINDOW action: sets s.priorityWindow = true, s.priorityPasser = null
-- PASS_PRIORITY action: records passer; resolves stack when both players have passed
-- ADVANCE_PHASE guard: blocked while s.priorityWindow === true
-- Stack grow 0->N while active === 'o': triggers window open

/src/hooks/useDuelController.ts
-- Priority window close effect (lines 139-158)
-- AI priority response effect (lines 164-177)
-- Stack-length watcher (lines 182-192)
-- applyAiActionsWithPriority() (lines 198-207)

/src/ui/ActionBar/InstantPriorityBar.tsx
-- Player-facing "Pass Priority" / "Waiting..." UI element
```

### State Fields
```
s.priorityWindow: boolean        -- true while window is open
s.priorityPasser: 'p' | 'o' | null -- who has already passed; null = neither
```

### Resolution Flow
```
CAST_SPELL -> stack grows -> priorityWindow opens
-> player sees InstantPriorityBar
-> player passes (PASS_PRIORITY 'p') OR AI passes (PASS_PRIORITY 'o')
-> when both have passed -> RESOLVE_STACK fires -> window closes
-> if stack still non-empty -> window reopens
-> when stack empty -> ADVANCE_PHASE unblocked
```

### PRIORITY_WINDOW_PHASES Whitelist
```
MAIN_1, MAIN_2, END
```
Auto-opening is suppressed outside these phases to prevent spurious windows
during COMBAT_ATTACKERS, COMBAT_BLOCKERS, etc.

### AI Behavior (SYSTEMS.md §18.10)
AI passes priority immediately unless it has an instant-speed response available.
AI response is evaluated by `AI.js` planPriority(); result dispatched via
`applyAiActionsWithPriority()` in `useDuelController.ts`.

### Status
ACTIVE (Phase 6 Sprint 7)

---

## Gemini LLM Integration (ARZAKON AI)

| Entry | Location |
|---|---|
| Advisor | `src/engine/GeminiAdvisor.js` — Gemini API call wrapper; returns `{ index, reasoning, sentPayload }` |
| Hook integration | `src/hooks/useDuelController.ts` — reads `duelCfg.useGemini`; substitutes Gemini branch for sandbox+useGemini duels |
| Toggle | `src/ui/layout/GameWrapper.jsx` — `useGemini` state on choose step; passed through `startConfig` |
| Config threading | `src/hooks/useOverworldController.js` — derives `useGemini` from `startConfig`; passes into `launchArzakon` -> `setDuelCfg` |
| Legal actions | `src/engine/LegalActions.js` — `computeLegalActions(state, phase)` builds action array; index 0 is always PASS_PRIORITY |
| Diagnostic log action | `src/engine/DuelCore.js` — `GEMINI_LOG` appends `type:'gemini'` entries to `s.log` (sandbox/dev-gated) |
| Log rendering | `src/hooks/useDuelController.ts` `adaptLog` — maps `type:'gemini'` -> `LogKind 'gemini'` |
| Log styling | `src/ui/Mobile/LogSheet.tsx` + `styles.module.css` — steel-blue `logEntryGemini` style |
| Thinking indicator | `src/ui/Mobile/DuelScreenMobile.tsx` — `isGeminiThinking` div renders below opp banner |

### Behavior
- Only fires when `config.useGemini === true` AND `config.sandbox === true`.
- Phases gated: MAIN_1, MAIN_2, COMBAT_ATTACKERS, COMBAT_BLOCKERS.
- ATTACK_ALL action type expands to individual DECLARE_ATTACKER dispatches.
- On API failure (`null` result), heuristic `aiDecide` fallback fires automatically.
- Sandbox diagnostic: `console.group` with full payload + in-game GEMINI_LOG entries per decision.
- Default is OFF. Each session starts with Gemini disabled.
- Requires `VITE_GEMINI_API_KEY` env var. If absent, `GeminiAdvisor.js` errors and the heuristic fallback fires automatically.
- Toggle is not persisted to localStorage.

### Status
ACTIVE (Sprint — Gemini controller wiring complete)

## Overworld Tileset Rendering + Connected Terrain

Replaces flat CSS-color terrain backgrounds with layered pixel-art sprite rendering on a
**continuous grass base**, paired with a terrain-generation change that clusters biomes into
**connected regions**. Shared desktop/mobile render path (single `WorldMap`, no viewport branch).

| Entry | Location |
|---|---|
| Connected-region terrain gen | `src/engine/MapGenerator.js` — coherent value-noise field (`cerp`/`buildLattice`/`sampleLattice`), quantile-remapped to a cost-monotonic biome ladder, wavy water coast. See SYSTEMS.md 7.3.1 |
| Render data + helpers | `src/ui/overworld/terrainRenderer.js` — frozen coordinate tables, `hashTile`, `terrainGroup`, `getGroundLayers`, `getTint`, `getDecorations` |
| Tilesheet loader + per-tile canvas | `src/ui/overworld/WorldMap.jsx` — module-level singleton image loader (`useTilesheets`); `MapTile` draws grass base + tint + decorations on a per-tile canvas (taller by `OVERFLOW_TOP` so trees overflow upward) beneath all overlays |
| Neighbor-group computation | `src/ui/overworld/WorldMap.jsx` — `WorldMap` passes `groundNeighbors` (same-group N/S/E/W flags) per tile for water/swamp autotile edges |
| Assets | `src/assets/tiles/forest_tileset.png` (128x240), `src/assets/tiles/forest_decorations.png` (256x256) |
| Tests | `tests/e2e/overworld-tileset.spec.ts` (sprite-not-flat, determinism, fallback; 1280x800 + 390x844); `tests/scenarios/map-terrain-clustering.test.js` (determinism, proportions, connectivity, clustering) |

### Asset pack / license
TopDownFantasy-Forest (aamatniekss). Free license: commercial OK, no redistribution/resale,
no AI training.

### Grass-unified render + biome legibility
All LAND biomes (PLAINS, FOREST, MOUNTAIN, ISLAND, SWAMP) share one continuous grass base, so
the ground never breaks at tile edges. Biomes are conveyed by a subtle low-alpha per-biome tint
(`getTint`: FOREST green, MOUNTAIN grey-brown, ISLAND coastal blue, SWAMP faint murk) plus
decoration scatter (trees=forest, rocks=mountain, mushrooms+dark grass=swamp, blades/flowers=
plains). Only WATER (connected ponds/coast) and SWAMP's dark-grass overlay autotile via the
3x3 (9-slice) `blobSubOffset` (soft feather for swamp, center-fallback shoreline for water).

### Determinism
All sprite/tint/decoration selection is deterministic from tile (x,y) via `hashTile`. No
`Math.random()`. Decorations are 0-2 per tile with deterministic scale variation to avoid
repetition. The terrain field itself is deterministic from the map seed (SYSTEMS.md 7.3.1).

### Fallback
Until both PNGs settle (or if either fails to load), the per-tile canvas stays transparent
and the existing `TERRAIN_BG` flat color shows through — the map is never blank. `imageSmoothingEnabled = false`
and `image-rendering: pixelated` everywhere (16px source at 34px dest is an accepted 2.125x soft upscale).

### Known gaps (deferred art pass)
- MOUNTAIN has no matching tile — rendered as grass + grey tint + dense rock-cluster (reads as
  rocky highland, not a true mountain).
- Tint is a flat per-tile fill — region borders are not feathered (acceptable since regions are
  now connected; border feathering deferred).
- ISLAND has no distinct tile — grass + faint coastal tint.

### Status
ACTIVE (overworld presentation + terrain generation)

---

## Dungeon Map Tileset Rendering

Replaces flat CSS-color floor/wall tiles and emoji entity tokens in `DungeonMap.jsx` with
pixel-art sprites from the **0x72 DungeonTilesetII v1.7** pack (CC0 license — free for
commercial/AI-assisted use, no attribution required).

| Entry | Location |
|---|---|
| Floor tiles | `src/ui/dungeon/DungeonMap.jsx` — position-hash variant pick (`(x*31+y*17)%8+1`) across `floor_1..floor_8`; deterministic, no `Math.random()` |
| Wall autotiling | `src/ui/dungeon/DungeonMap.jsx` — exported pure function `getWallVariant(grid, x, y)` maps 4-neighbor adjacency (N/S/E/W WALL flags) to `wall_top_*`, `wall_left/mid/right`, `wall_outer_*` sprite names |
| Enemy tokens | `src/ui/dungeon/DungeonMap.jsx` — exported `ENEMY_SPRITE_MAP` const maps archKey+tier to sprite base name; 4-frame idle animation via `useAnimFrame` hook (~600ms/frame) |
| Treasure tokens | `src/ui/dungeon/DungeonMap.jsx` — `chest_full_open_anim` (cardRarity set) or `chest_empty_open_anim` (cardRarity null), 3-frame hold-on-last |
| Exit token | `src/ui/dungeon/DungeonMap.jsx` — `floor_ladder` sprite with existing `exitPulse` CSS opacity animation |
| Player token | `src/ui/dungeon/DungeonMap.jsx` — `wizzard_f_idle_anim_f0..f3` cycling with existing `wizPulse` glow filter |
| Assets | `public/assets/dungeon/sprites/` (135 individual frame PNGs), `public/assets/dungeon/atlas_floor.png`, `public/assets/dungeon/atlas_walls_low.png` |
| Dungeon sandbox | `src/App.jsx` — `?dungeon=sandbox` URL param renders `DungeonMap` directly with a fixed-seed dungeon; exposes `window.__dungeonState()` for tests |
| Tests | `tests/e2e/dungeon-tileset.spec.ts` (sprite rendering, fog-of-war guard, chest rarity, exit pulse, player frame cycling, 404 guard; 1280x800 + 390x844) |

### ENEMY_SPRITE_MAP — single edit point

`ENEMY_SPRITE_MAP` in `DungeonMap.jsx` maps each archKey to `[tier1_base, tier2_base, tier3_base]`
sprite base names. To remap a sprite, change only this const — the animator reads it at runtime.

### Fog-of-war
Unrevealed cells render as solid `#050302` with no sprite — fog behavior unchanged from the
flat-color implementation. The LOS/reveal logic lives entirely in `DungeonGenerator.js` and
`useOverworldController.js` and is untouched.

### Asset license
0x72 DungeonTilesetII v1.7 by 0x72. CC0 1.0 Universal. No attribution required.

### Status
ACTIVE (dungeon presentation only — no state, logic, or generator changes)

---

## Overworld Structure Icon Sprites (2026-06-20)

TOWN, DUNGEON, CASTLE, and RUIN structure tiles on the overworld map now render
via generated PNG icons instead of Unicode emoji inside a near-black gradient plaque.

| Aspect | Detail |
|---|---|
| Icons | 5 static 32x32 RGBA PNGs in `src/assets/sprites/structures/`: `town.png`, `dungeon.png`, `castle.png`, `castle-defeated.png`, `ruin.png` |
| Generator | `tools/gen-structures.py` -- same Pillow/4x-supersample/LANCZOS technique as `gen-sprites.py`; fully deterministic, CC0 |
| Castle color | Castles no longer vary icon by controlling mage color. Icon is the same for all active castles; defeated state uses a separate pre-rendered desaturated `castle-defeated.png` (not a runtime CSS filter) |
| Rendering | `<img>` element with `objectFit: contain`, `imageRendering: pixelated`, `filter: drop-shadow(...)`, sized to 70% of the tile. `castleColor` kept for the `ow-label` mage-name; `plaqueStyle` removed |
| Dead code | `.ow-plaque*` CSS rules and `@keyframes castleBreath` removed from `OW_STYLES` in `WorldMap.jsx` |
| License | Original generated art, CC0 1.0. See `src/assets/sprites/CREDITS.md` |

---

## Overworld Character Sprites + Directional Walk Cycle

Replaced the CSS-div/inline-SVG character renderer in `Sprite.jsx` with image-based
pixel-art sprite sheets, and revived `playerAnimRef` into a rendered directional walk
cycle on both desktop (keyboard) and mobile (tap-to-move).

| Aspect | Detail |
|---|---|
| Sheet format | One `<kind>.png` per creature (`mage`, `pegasus`, `spider`, `zombie`, `goblin`, `fish`). 128x128 = 4 rows (down, up, left, right) x 4 columns (idle, walk1, walk2, walk3), 32x32 cells, no padding |
| Asset location | `src/assets/sprites/<kind>.png`; provenance/license in `src/assets/sprites/CREDITS.md`; generator `tools/gen-sprites.py` |
| `dir`/`frame` semantics | `Sprite` gained props `dir` (`'up'|'down'|'left'|'right'`, default `'down'` -> sheet row) and `frame` (`0-3`, default `0` -> sheet column). Existing props (`kind`, `color`, `isPlayer`, `name`) unchanged |
| Color model | Each sheet's main mass (robe/body/wings) is grayscale; accents (skin, eyes, mane, staff, hooves, teeth, fins) are saturated intrinsic colors. So one sheet per kind serves all 6 palette colors while still looking multi-colored |
| Tint compositing | At first use of a `kind:color`, an offscreen canvas pixel-pass multiplies the palette color onto only the low-saturation (mass) pixels (`max-min < 38`), leaving saturated accents as-authored. Tinted full-sheet cached per `kind:color` |
| Sheet loader | Module-level singleton in `Sprite.jsx` (subscriber set, no per-render refetch), mirroring `WorldMap.jsx`'s tilesheet loader |
| Graceful fallback | Unknown/failed kind -> recolored `mage` sheet; all sheets failed -> flat color-tinted square. Never a crash or retry loop |
| Player animation | `useOverworldController.js` mirrors `playerAnimRef` (+ a shared enemy idle-bob frame) into `animState` React state, emitted from the rAF loop only when the visible frame changes; threaded `WorldMap` -> `MapTile` -> `Sprite` via `playerAnim`/`enemyAnim` props |
| Desktop walk | Keyboard keydown/keyup sets `dir`/`moving`; rAF loop cycles `frame` every 8 ticks while `moving` (unchanged path, now actually rendered) |
| Mobile parity fix | `handleTileClick` now derives `dir` from the first path-step delta, sets `moving=true`, and flips it back to `false` via a ~280ms timeout (mobile has no keyup). Independent code path from the keyboard handler -- explicit duplication, not a shared branch |
| Enemy idle-bob | Enemies use existing `dir` from `tickEnemyAI`; `frame` driven by a single shared idle counter cycling 0->3 on a fixed timer (no per-enemy walk-on-move logic) |
| Test global | `window.__overworldAnim()` returns `{ player:{frame,dir,moving}, enemyFrame }`; gated on sandbox mode like `__duelState` |
| Tests | `tests/e2e/overworld-sprites.spec.ts` (1280x800 + 390x844): canvas-backed render, old CSS gone, frame cycling, per-arrow dir, keyup clears moving, gold tint pixels, 404 fallback, mobile tap dir/moving toggle |

### Asset license
Original generated art, CC0 1.0. The task specified sourcing CC0 art from OpenGameArt/Kenney/
itch.io, but those hosts were unreachable from the execution environment (HTTP 403; only GitHub +
pip/npm on the egress allowlist). Sheets were generated deterministically instead -- see
`src/assets/sprites/CREDITS.md`.

### Status
ACTIVE (overworld presentation + animation wiring; no engine/combat/generator changes)

---

---

## Cast/Activate Flow Redesign (2026-06-19)

Replaced the old `pendingCast` one-shot state with a sequential `CastFlowState`
(targeting → mana → auto-dispatch). All prompts are inline in the player Banner;
no modals or overlays introduced.

| Aspect | Detail |
|---|---|
| Hook | `useDuelController.ts` owns `castFlow: CastFlowState | null`; exposes `beginCastFlow`, `beginActivateFlow`, `selectCastTarget`, `confirmCastTargets`, `cancelCastFlow` |
| Optional target | `optionalTarget: true` added to Twiddle in `cards.js`; `isOptionalTarget(card)` in `useDuelController.ts`; Banner shows Skip button instead of requiring a target |
| Required target | `needsAnyTarget(card)` = `needsExplicitTarget || isCounterEffect || isBebRebEffect`; Confirm button hidden at 0 targets |
| Mana shortfall | `getManaShortfall(pool, cost, xVal)` (exported from `useDuelController.ts`); Banner shows "NEED `<Cost>`" chip |
| Auto-fire | `useEffect` watching `[s.p.mana, castFlow]` casts automatically when pool becomes sufficient |
| Cancel/undo | `cancelCastFlow()` dispatches `UNDO_MANA_TAPS` when `manaTapSnapshot` is non-null |
| Bug fix — Icy Manipulator | `tapTarget` added to `ACTIVATE_TARGET_EFFECTS`; activated ability now opens a target prompt |
| Bug fix — Counterspell mobile | `castFlow.selectedTargets[0]` passed explicitly; StackDisplay receives `onItemClick` from flow (not top-of-stack fallback) |

### Tests
- Vitest: `src/hooks/__tests__/useDuelController.castFlow.test.ts` (CAST-FLOW-01 through CAST-FLOW-08, 27 tests)
- Playwright: `e2e/duel-controller.spec.ts` (E2E-CAST-01 through E2E-CAST-08, both desktop 1280x800 and mobile 390x844)

### Status
ACTIVE

---

## Bug Fix: Fog Edge Mask + Eager Tilesheet Preload (2026-06-19)

Two presentation-layer fixes in `src/ui/overworld/WorldMap.jsx`. No engine or
state changes.

| Fix | Detail |
|---|---|
| Eager preload | `_startSheetLoad()` now fires at module scope (line 60) in addition to inside `useTilesheets()`, so PNG loading begins at import time rather than first `MapTile` mount. Eliminates intermittent flat-color pop-in before sheets settle. |
| Directional fog edge | Replaced single `isFogEdge: boolean` with `fogSides: {w,e,n,s}` per-direction flags. `MapTile` builds a composite `mask-image` of linear-gradients — one per unrevealed side — composited with `mask-composite: intersect` so fades multiply at corners. Old radial `ellipse at center` mask removed. |
| Test hook | `data-fog-sides` attribute on revealed boundary tiles lists active sides as a comma-separated string for Playwright assertions. |

### Tests
- Playwright: `tests/e2e/overworld-tileset.spec.ts` — 3 new tests per viewport (desktop + mobile): eager-preload 2 s budget, directional gradient assertion via `data-fog-sides`, interior tile no-mask check.

### Status
CLOSED

---

# End of MECHANICS INDEX v1.5
