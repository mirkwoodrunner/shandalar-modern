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
- keywords.js (ability interpretation — imported as of 2026-05-11 remediation)
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

### Traceability
- Implemented: Phase 6 Deliverable 2
- Source: `src/engine/DuelCore.js` (`OPEN_PRIORITY_WINDOW`, `PASS_PRIORITY` cases)
- Hook exposure: `src/hooks/useDuel.js` (`openPriorityWindow`, `passPriority`)

### Status
ACTIVE (Phase 6)

---

# End of MECHANICS INDEX v1.0
