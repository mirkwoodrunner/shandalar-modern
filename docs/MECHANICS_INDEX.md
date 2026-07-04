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
Modal: src/ui/duel/ForceOfNatureUpkeepModal.tsx (shared desktop + mobile; desktop/mobile parity as of 2026-06-24)
```

#### Sphere Lifegain Cycle — Crystal Rod / Iron Star / Ivory Cup / Wooden Sphere (cast-triggered optional pay)
```
Status: ACTIVE (Batch A4, 2026-06-28)
Cards: crystal_rod (U), iron_star (R), ivory_cup (W), wooden_sphere (G)
Trigger site: CAST_SPELL reducer in DuelCore.js, fires on cast (not resolution)
State field: pendingSphereTrigger { sphereCardId, sphereCardName, controller, queue[] }
Action: SPHERE_TRIGGER_RESOLVE { paid: boolean }
  paid=true:  deducts 1 generic mana, gains 1 life via hurt(ns, controller, -1, name)
  paid=false: no effect
Human resolution: SphereTriggerModal.tsx (shared desktop + mobile; data-testid="sphere-trigger-modal")
AI resolution: useDuelController.ts AI main loop; always pays if able (no downside)
Multiple spheres: queued in pendingSphereTrigger.queue[], resolved serially
ADVANCE_PHASE gate: blocked while pendingSphereTrigger is set
Spec: docs/SYSTEMS.md Section 25
Tests: src/engine/__tests__/sphereCycle.test.js (SPHERE-01 through SPHERE-06 + per-color + queue)
       tests/e2e/batch-a4-sphere-cycle.spec.ts (A4-E01 through A4-E04, dual viewport)
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

## 4.3 First Strike -- Two-Step Combat Damage

### Description
Creatures with `FIRST_STRIKE` deal combat damage in an earlier sub-step than
non-first-strike combatants. This allows them to kill blockers (or attackers)
before taking damage back, which is the canonical Alpha/Beta-era MTG behavior.

### SYSTEMS.md Reference
- Section 9 (Keyword System)
- Section 5 (Combat System)

### Implementation
```
/src/data/keywords.js         -- FIRST_STRIKE keyword definition (id: "FIRST_STRIKE")
/src/data/cards.js            -- 40+ cards assigned KEYWORDS.FIRST_STRIKE.id in keywords[]
/src/engine/DuelCore.js       -- resolveCombat(): two-pass split
```

### Mechanism
`resolveCombat()` runs two ordered passes inside its attacker loop:

1. **First-strike pass** (`dlog "First strike damage."`) -- A combatant (attacker or
   individual blocker) deals damage only if `hasKw(combatant, KEYWORDS.FIRST_STRIKE.id)`
   is true. Trample, lifelink, Spirit Link, deathtouch, Sengir tracking all fire within
   this pass if the dealing combatant has first strike.

2. **`checkDeath(ns)`** is called between passes. Creatures killed by first-strike damage
   are removed from the battlefield before the regular pass runs.

3. **Regular pass** (`dlog "Combat damage resolving."`) -- A combatant deals damage only
   if it does NOT have first strike. Dead creatures (null from `getBF`) are skipped via
   the existing `if (!att) continue` guard; live blockers are re-derived from `ns[defW].bf`.

No ruleset gate -- first strike applies unconditionally across CLASSIC/MODERN/CONTEMPORARY.
`DOUBLE_STRIKE` is out of scope (no Alpha-era cards have it).

### Cards
White Knight, Black Knight, Elvish Archers, Tundra Wolves, Hornet Cobra, Cosmic Horror,
Yawgmoth Demon, Lance (aura grants first strike), Emerald Dragonfly (gainFirstStrikeEOT
activated ability), and others. Full list: grep `KEYWORDS.FIRST_STRIKE.id` in `cards.js`.

### Test Coverage
- `tests/scenarios/combat-damage.test.js` -- cases 4d through 4i
- `tests/e2e/first-strike-combat.spec.ts` -- FS-E2E-01 and FS-E2E-02 (desktop + mobile)

### Status
ACTIVE (implemented 2026-06-24)

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

## 16.2 Duel State Persistence (Save/Resume)

### Description
Full save-and-resume for in-progress duels. When the player closes or reloads the tab
mid-duel, the current GameState is stored under `shandalar:duel` in localStorage. On the
next load, a `ResumeDuelModal` prompts the player to resume or start fresh. Completing a
duel (win/lose/forfeit) automatically clears the save.

### GDD Reference
- Not in original GDD; added as a session-integrity improvement.

### SYSTEMS.md Reference
- Section 21 (Persistence System)

### Implementation
```
src/hooks/usePersistence.ts          -- saveDuel / loadDuel / clearDuel / usePersistence(state, enabled)
src/ui/duel/ResumeDuelModal.tsx      -- resume-or-discard modal (shared, desktop + mobile)
src/engine/DuelCore.js               -- LOAD_STATE reducer case (exempt from s.over guard)
src/DuelScreen.tsx                   -- resume flow wiring (desktop)
src/ui/Mobile/DuelScreenMobile.tsx   -- resume flow wiring (mobile)
src/hooks/__tests__/usePersistence.test.ts   -- 6 Vitest unit tests
tests/e2e/duel-persistence.spec.ts   -- 10 Playwright e2e tests (desktop + mobile)
```

### localStorage key
`shandalar:duel` -- stores the full JSON-serialized GameState.

### Responsibilities
- `saveDuel(state)`: serialize and write to localStorage; swallows any write error.
- `loadDuel()`: read and JSON.parse; returns null if key absent or JSON is malformed.
- `clearDuel()`: remove the key; swallows any error.
- `usePersistence(state, enabled)`: useEffect that calls saveDuel on every state change
  when `enabled` is true. `enabled` is false while the resume-decision modal is shown,
  preventing the fresh initial state from overwriting the saved duel before the player decides.
- `LOAD_STATE` action replaces the entire reducer state wholesale via `return action.state`.
- `handleDuelEndWithClear` wraps `onDuelEnd` in both screen components so clearDuel() is
  always called on any exit path (win/lose/forfeit/game-over timer).

### Strict Constraints
- Duel persistence only -- overworld state is NOT persisted here.
- `LOAD_STATE` is the sole engine coupling; it must remain a one-liner in DuelCore.js.
- No partial-state patching -- the entire GameState is serialized and restored as-is.
- Fail silently on any localStorage error (private browsing, quota exceeded).

### Status
ACTIVE (Sprint 8)

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

## Hooded Figure Sprite Variant (2026-06-23)

Overworld monster sprites now have a 50% chance per spawn to render as the shared
`hoodedFigure` sheet (in the monster's archetype color) instead of the archetype's
dedicated sprite kind, for visual variety.

| Aspect | Detail |
|---|---|
| Sheet | `src/assets/sprites/hoodedfigure.png` -- 128x128, 4x4 grid, 32x32 cells, 100% grayscale mass (tints correctly through existing `getTintedSheet()`) |
| Roll timing | Once at spawn time inside `spriteForMonster(archKey, terrainId)`. Result baked into `spriteKind` on the enemy state object; never re-rolled on render |
| `color` | Unchanged -- always resolved from `COLOR_BY_ARCH[archKey] ?? 'red'`, same as before |
| `spriteForHenchman` | Unchanged -- always returns `{ kind: 'mage', ... }` |
| Fallback | If the sheet fails to load, existing `getTintedSheet` falls back to `mage`, then to flat-square. No new fallback code needed |
| Tests | `tests/e2e/hooded-figure-sprites.spec.ts` (1280x800 + 390x844): variety check (both kinds present), tint-correctness (opaque pixels per color), henchman-unaffected regression |

### Status
DONE

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

## Power Sink Cost Fix + X-Select Pre-Payment UI (2026-06-23)

### Power Sink cost correction

Power Sink (`power_sink`) costs `{U}` to cast. Its `{X}` is not a caster-side
mana selection -- it is the *target spell controller's total available mana* at
resolution time (the worst-case-for-defender model of "pay any amount you choose").
The `ConditionalCounterModal` renders for the defender exactly as it does for Force Spike.

| Fix | Detail |
|---|---|
| `DuelCore.js` CAST_SPELL | `xSpend` excludes `power_sink` via `c.id !== 'power_sink'` guard |
| `DuelCore.js` `case "powerSink"` | `psX = totalMana` (defender's total mana at resolution) instead of `xVal \|\| 1` |
| `useDuelController.ts` | Three spell-side `xSpend` sites add `&& card.id !== 'power_sink'` guard |
| `AI.js` selectPlayableCards | Early exit for `power_sink` before `cmc > totalManaCeiling` filter; `effectiveCost = 'U'`, `effectiveCmc = 1` |

### X-Select pre-payment UI (`xSelect` cast-flow mode)

All free-choice-X spells now open a stepper modal before targeting and mana payment.
X is locked into `s.xVal` via `SET_X` when confirmed, so the rest of the cast-flow
reads it correctly from `s.xVal`.

Affected implemented cards: `braingeyser`, `mind_twist`, `drain_life`, `disintegrate`,
`consume_spirit`, `howl_from_beyond`, `fireball`, `earthquake`, `stream_of_life`,
`hurricane`, `detonate`, `rock_hydra`.

Exception: `spell_blast` uses `xLegalValues` (CMCs of opponent spells on the stack)
instead of a free range; stepper jumps only between those values.

| Aspect | Detail |
|---|---|
| New mode | `CastFlowMode` extended with `'xSelect'` (before `'targeting'` and `'mana'`) |
| New fields | `CastFlowState.xVal`, `xMax`, `xLegalValues` |
| New helpers | `getMaxAffordableX(pool, cost)`, `getSpellBlastLegalX(stack)` exported from `useDuelController.ts` |
| New callbacks | `adjustCastX(delta)`, `confirmCastX()` exported from `useDuelController` hook |
| New component | `src/ui/duel/XSelectModal.tsx` -- shared between `DuelScreen.tsx` and `DuelScreenMobile.tsx` |
| Spell Blast targeting | `getSpellBlastLegalX` filters `caster === 'p'` (only opponent spells are valid counter targets) |

### Tests
- Playwright: `tests/e2e/power-sink-x-select.spec.js` (T1-T7, both 1280x800 and 390x844 viewports)

### Mobile parity
`DuelScreenMobile.tsx` now renders `ConditionalCounterModal` with the same
`targetCaster === 'p'` guard as desktop (fixed 2026-06-23).

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

---

## Batch 1A: Desert / Landwalk Handler Family (2026-06-21)

Five cards implemented; one entry added.

### New effect cases in `DuelCore.js`

| Case | Location | Notes |
|---|---|---|
| `desertPing` | `ACTIVATE_ABILITY` activatedAbilities branch | Phase-gated to `COMBAT_END`; respects `preventsDesertDamage` and `preventsDesertDamageWhileAttacking` flags |
| `sandalsOfAbdallah` | main `resolveEff` switch | Grants islandwalk via `eotBuffs`; "destroy when target dies" clause deferred (no death-link hook exists — `warBargeTargeted` is set by `warBarge` but never consumed) |
| `destroyLandAura` | main `resolveEff` switch | Handles both BF-standalone auras (`enchantedLandIid`) and embedded aura records in `land.enchantments[]` |

### New data fields in `cards.js`

| Field | Cards | Meaning |
|---|---|---|
| `preventsDesertDamage:true` | `desert_nomads` | Checked by `desertPing`; prevents 1-damage ping |
| `preventsDesertDamageWhileAttacking:true` | `camel` | Checked by `desertPing` when target is attacking; banding-group extension TODO |
| `landwalkType:"Desert"` | `desert_nomads` | Used by generic landwalk check at DuelCore.js:181 |
| `activatedAbilities:[{id:"desert_damage",...}]` | `desert` | Array-schema activated ability for the ping |
| `activated:{cost:"2,T",effect:"sandalsOfAbdallah"}` | `sandals_of_abdallah` | Single-ability legacy schema |
| `activated:{cost:"GG,T",effect:"destroyLandAura"}` | `savaen_elves` | Single-ability legacy schema |

### New entry

`ali_from_cairo` — implemented (color:R, 2RR, 0/1). Static replacement effect: `lifeFloor:1` field on the card data entry. `getLifeFloor(s, who)` helper exported from `DuelCore.js` scans `bf` for any permanent with `lifeFloor` and returns the highest value (null if none). `hurt()` clamps the post-damage life total up to that floor when `amt > 0`. General reusable hook — any future card can opt in by setting `lifeFloor:<number>` with no further engine changes. Note: the {T} banding-grant clause was removed by Oracle errata and does not exist on the current card; it was not implemented.

### Tests
- Playwright: `e2e/batch1a-desert-landwalk.spec.ts` (1A, 1B, 1C; both desktop 1280x800 and mobile 390x844)
- Vitest: `tests/scenarios/life-floor.test.js` (LF-01 through LF-08; getLifeFloor and hurt() floor behaviour)
- Playwright: `tests/e2e/ali-from-cairo-life-floor.spec.ts` (ALI-01, ALI-02; both desktop 1280x800 and mobile 390x844)

### Status
IMPLEMENTED

---

---

## Batch 1B: Wall Destruction / Sacrifice-Cost Activated Abilities (2026-06-22)

Four cards implemented; Battering Ram deferred (miscategorized). Infrastructure note: the `"sac"` cost token was already present in the engine (Strip Mine, Black Lotus) -- no new token introduced.

### New effect cases in `DuelCore.js` (`resolveEff`)

| Case | Cards | Notes |
|---|---|---|
| `destroyWall` | `goblin_digging_team` | Checks `tgtC.subtype?.includes('Wall')`; fizzles with log if no legal Wall target |
| `destroyArtifactSac` | `scavenger_folk` | Uses `isArt(tgtC)` convention (same as `destroyArtifact`); fizzles with log if no legal artifact target |
| `pingCombatant` | `davenant_archer` | Checks `ns.attackers.includes(tgtC.iid)` (attacking) and `tgtC.blocking != null` (blocking); fizzles with log on non-combatant |
| `cuombajjWitches` | `cuombajj_witches` | Player-chosen first target (any: creature or player); second damage falls on highest-effective-toughness creature on caster's side (deterministic fallback -- opponent-choice UI deferred) |

### Sacrifice cost token convention

The engine already supports `"sac"` as a cost token in `act.cost` strings (line ~2803 of `DuelCore.js`). When `"sac"` is present, the activating permanent is moved to its owner's graveyard immediately upon activation (before the ability item is pushed to the stack), implementing the MTG rule that costs are paid before effects resolve. Cost `"T,sac"` = tap + sacrifice; `"G,T,sac"` = pay G + tap + sacrifice.

### cards.js schema changes

| Card | Old `effect` | New schema |
|---|---|---|
| `goblin_digging_team` | `"STUB"` | `effect:null, activated:{cost:"T,sac",effect:"destroyWall"}` |
| `scavenger_folk` | `"STUB"` | `effect:null, activated:{cost:"G,T,sac",effect:"destroyArtifactSac"}` |
| `davenant_archer` | `"STUB"` | `effect:null, activated:{cost:"T",effect:"pingCombatant"}` |
| `cuombajj_witches` | `"STUB"` | `effect:null, activated:{cost:"T",effect:"cuombajjWitches"}` |
| `battering_ram` | `"STUB"` | Remains STUB; miscategorization noted in comment |

### useDuelController.ts

`ACTIVATE_TARGET_EFFECTS` extended with: `destroyWall`, `destroyArtifactSac`, `pingCombatant`, `cuombajjWitches`.
`PLAYER_TARGETABLE_ABILITY_EFFECTS` extended with: `cuombajjWitches` (card can target players).

### AI.js

Not touched. AI will not intelligently target with the new activated abilities until a future AI targeting update.

### Deferred

- **Battering Ram**: needs begin-of-combat trigger + blocked-by-Wall trigger (Group C/D trigger batch)
- **Cuombajj Witches second target**: opponent-choice UI requires a pending-state prompt; deferred to a future batch

### Tests
- Playwright: `e2e/batch1b-wall-destruction-sacrifice.spec.ts` (1A through 1E; both desktop 1280x800 and mobile 390x844)

### Status
ACTIVE

---

## Bug Fix: COMBAT_BLOCKERS AI auto-advance (BLOCK-GUARD-1) — 2026-06-25

**Problem:** When the AI was the active/attacking player and the phase reached `COMBAT_BLOCKERS`, the AI driver `useEffect` in `useDuelController.ts` treated `COMBAT_BLOCKERS` as the AI's own turn to act. It called `planBlock` against `state.o.bf`, found zero available blockers (all AI creatures had `attacking: true`), and fell through to `requestPhaseAdvance()` — skipping the human defender's blocker-declaration window entirely.

**Fix:** Added `if (s.phase === 'COMBAT_BLOCKERS') return;` guard in the AI driver effect in `useDuelController.ts`, immediately after the `active !== 'o'` check. `COMBAT_BLOCKERS` is always the defending player's action window regardless of who is the active player.

**Files changed:**
- `src/hooks/useDuelController.ts` — guard added to AI driver useEffect

**Tests:**
- Vitest: `src/hooks/__tests__/ai-driver-blockers-gating.test.ts` (BLOCK-01/02/03)
- Playwright: `tests/e2e/combat-blockers-priority.spec.ts` (BLOCK-E2E-01/02/03 × desktop + mobile)

**Known related issue (not fixed here):** The Gemini path in `useDuelController.ts` includes `COMBAT_BLOCKERS` in `GEMINI_PHASES` — same bug gated behind `config.useGemini && config.sandbox`. Deferred to a separate fix batch.

---

## Bug Fix: Lava Axe / Psionic Blast creature-targeting crash (LAXA-PSIONIC-1) — 2026-06-25

**Problem:**
- `damage5` (Lava Axe): `hurt()` received a creature `iid` instead of `'p'`/`'o'`, causing a crash when the player clicked a creature during targeting mode.
- `psionicBlast` (Psionic Blast): had no creature-damage branch; clicking a creature caused the same crash.

**Fix:**
- `DuelCore.js` — `damage5` case: added defensive fallback `const t5 = tgt === "p" || tgt === "o" ? tgt : opp;` — invalid targets fall back to opponent damage, no crash.
- `DuelCore.js` — `psionicBlast` case: replaced one-liner with full creature-aware branch; creature targets mark `damage + 4` on the creature and call `checkDeath`, player/`'o'` targets use `hurt()`, caster always takes 2.
- `useDuelController.ts` — added `PLAYER_ONLY_TARGET_EFFECTS` set (`'damage5'`) and `isPlayerOnlyTarget(card)` export.
- `DuelScreen.tsx` — battlefield click handler: `if (isPlayerOnlyTarget(castingCard)) return;` guard rejects creature clicks during Lava Axe targeting.
- `DuelScreenMobile.tsx` — same guard in mobile battlefield click handler.

**Files changed:**
- `src/engine/DuelCore.js`
- `src/hooks/useDuelController.ts`
- `src/DuelScreen.tsx`
- `src/ui/Mobile/DuelScreenMobile.tsx`

**Tests:**
- Vitest: `src/engine/__tests__/lava-axe-psionic-blast.test.js` (LAVA-AXE-01/02, PSIONIC-01 through PSIONIC-05)
- Playwright: `tests/e2e/lava-axe-targeting.spec.ts` (LAVA-E2E-01/02 × desktop + mobile)

---

## Bug Fix: Ancestral Recall creature-targeting crash (ARCANE-1) — 2026-07-04

**Problem:** `draw3` (Ancestral Recall) was in `EXPLICIT_TARGET_EFFECTS` but missing from `PLAYER_ONLY_TARGET_EFFECTS`, so the creature-click guard shared by `DuelScreen.tsx` / `DuelScreenMobile.tsx` never fired for it. Clicking a creature during targeting set `selTgt` to the creature's `iid`, which `CARD_HANDLERS['Ancestral Recall'].onResolve` passed straight through to `drawN(state, who, 3)` via a truthy fallback, crashing on `ns[who].lib` since `who` was a creature iid. Same root cause and fix pattern as the earlier Lava Axe (`damage5`) crash above.

**Fix:**
- `useDuelController.ts` — added `'draw3'` to `PLAYER_ONLY_TARGET_EFFECTS`, making `draw3` player-only, consistent with `damage5` and the other player-only effects.
- `cardHandlers.js` — `'Ancestral Recall'` handler: replaced the truthy `(rawTgt || 'p')` fallback with an explicit `'p'`/`'o'` check, defaulting to `'p'` for any unrecognized target.

**Files changed:**
- `src/hooks/useDuelController.ts`
- `src/engine/cardHandlers.js`

**Tests:**
- Playwright: `tests/e2e/ancestral-recall-targeting.spec.ts` (ARCANE-E2E-01/02/03 × desktop + mobile)

---

## Bug Fix: Resume-duel modal removed (RESUME-REMOVE-1) — 2026-06-25

**Problem:** `LOAD_STATE` is an unreconciled state swap — unsafe for mid-stack or mid-priority saves. The resume-duel UI (`ResumeDuelModal`) offered to reload a partially-resolved duel state, which could put the engine into an inconsistent state.

**Fix:** Removed the resume UI entirely. Autosave (`usePersistence`/`saveDuel`/`clearDuel`) is retained as crash-recovery infrastructure; it saves every state transition and is cleared on clean exit (forfeit, game over). The `LOAD_STATE` reducer case is left in place as dead code for a future checkpoint-gated resume design (empty stack, safe phases only).

- `src/ui/duel/ResumeDuelModal.tsx` — deleted.
- `src/DuelScreen.tsx` — removed `ResumeDuelModal` import, `savedDuelRef`, `resumePending`/`setResumePending`, `loadDuel` import, `handleResume`, `handleDiscardSave`, JSX block; `usePersistence(s, true)` always enabled.
- `src/ui/Mobile/DuelScreenMobile.tsx` — same removals; `usePersistence(s_state, true)`.
- `tests/e2e/duel-persistence.spec.ts` — removed PERSIST-01/02/03 (resume modal tests); reworked PERSIST-06 (malformed save: duel mounts normally); added PERSIST-07 (stale mid-stack save does not resume, new game starts fresh).

**Files changed:**
- `src/ui/duel/ResumeDuelModal.tsx` (deleted)
- `src/DuelScreen.tsx`
- `src/ui/Mobile/DuelScreenMobile.tsx`
- `src/hooks/useDuelController.ts` (autosave gate removed)
- `tests/e2e/duel-persistence.spec.ts`

**Tests:** 12/12 `usePersistence.test.ts` unit tests pass. Playwright: PERSIST-04/05/06/07 × desktop + mobile.

## Bug Fix: Castle boss-deck routing (CASTLE-BOSS-1) — 2026-06-25

**Problem:** `handleChallenge` in `useOverworldController.js` passed `MAGE_ARCHS[col]` (a generic color archetype such as `WHITE_WEENIE`) to `openEncounterPopup` for castle encounters. The five `BOSS_*` archetypes (with unique 40-card decks and `profileId` fields) were never reached; every castle fight used a generic deck instead of the intended boss deck.

**Fix:** Added `MAGE_BOSS_ARCHS` (`{ W:"BOSS_WHITE", U:"BOSS_BLUE", ... }`) to `src/engine/MapGenerator.js` directly below `MAGE_ARCHS`. Swapped the import and call site in `useOverworldController.js` so `handleChallenge` passes `MAGE_BOSS_ARCHS[col]` to `openEncounterPopup`. `MAGE_ARCHS` is retained for non-castle encounters.

**Files changed:**
- `src/engine/MapGenerator.js` — added `export const MAGE_BOSS_ARCHS`
- `src/hooks/useOverworldController.js` — import swap + call-site swap

**Tests:** `tests/scenarios/castle-boss-routing.test.js` — 3/3 unit tests pass (`@overworld`). Playwright E2E ejected: no `__overworldSetPos` global exists to deterministically navigate to a castle tile; a follow-up should add this global and the E2E spec.

---

## Bug Fix: Gemini thinking indicator desktop parity (GEMINI-THINK-DESKTOP-1) -- 2026-06-25

**Problem:** `isGeminiThinking` was produced by `useDuelController` and rendered in `DuelScreenMobile.tsx` but never destructured or rendered in `DuelScreen.tsx`. Desktop players received no visual feedback while the Gemini AI opponent was deciding.

**Fix:** Added `isGeminiThinking` to the `useDuelController` destructure in `DuelScreen.tsx`. Renders `<div className="gemini-thinking">Gemini is thinking{'…'}</div>` immediately below the opponent Banner (the same structural position as the mobile indicator). Added `.gemini-thinking` CSS rule to `src/styles/global.css` mirroring the mobile `geminiThinking` intent (muted blue, small caps, centered).

**Files changed:**
- `src/DuelScreen.tsx` -- destructure + JSX render (desktop only)
- `src/styles/global.css` -- `.gemini-thinking` rule added
- `tests/e2e/gemini-thinking-parity.spec.ts` -- new spec (`@gemini @mobile`); covers not-visible default state for both desktop and mobile viewports. Thinking=true state cannot be forced deterministically without a live Gemini API call; noted as a spec limitation.

**Mobile impact:** None. Mobile files (`DuelScreenMobile.tsx`, `styles.module.css`) are unchanged. The new global class name (`gemini-thinking`, hyphenated) is distinct from the mobile CSS-module class (`geminiThinking`, camelCase scoped).

---

## Per-Mage Gemini System Prompts (GEMINI-MAGE-PROMPTS-1) -- 2026-06-25

**Feature:** `GeminiAdvisor.fetchGeminiMove` previously used a single global `SYSTEM_INSTRUCTION` for every opponent. This adds per-mage strategic personalities for a starter roster of 2-3 bosses, with a base-prompt fallback for all other opponents.

**Implementation:**
- `MAGE_PROMPTS` table (keyed by `profileId`) and `selectSystemInstruction(profileId)` pure selector live in a new sibling module `src/engine/geminiPrompts.js`. Separated from `GeminiAdvisor.js` to allow unit testing without the `@google/genai` client being instantiated.
- `fetchGeminiMove(serializedState, profileId = null)` accepts an optional `profileId` argument. Internally calls `selectSystemInstruction(profileId)` to pick the mage-specific or base instruction. All other behavior (empty-actions guard, single-action shortcut, out-of-bounds handling, null fallback) is unchanged.
- `useDuelController.ts` resolves `oppProfileId` from `ARCHETYPES[config.oppArchKey]?.profileId ?? null` and passes it as the second argument to `fetchGeminiMove`. Non-boss opponents (no `profileId` on the archetype) and unknown ids both yield `null`, which degrades to the base instruction.

**Mage roster (starter pass):**
- `DELENIA` -- white aggro-control: deploy early, protect creatures, push damage
- `XYLOS` -- blue control: hold counterspells, trade resources, win the long game
- `MORTIS` -- black attrition: life-for-advantage, one-for-one removal, resource denial

**Files changed:**
- `src/engine/geminiPrompts.js` -- new sibling module (`SYSTEM_INSTRUCTION`, `MAGE_PROMPTS`, `selectSystemInstruction`)
- `src/engine/GeminiAdvisor.js` -- imports from `geminiPrompts.js`; `fetchGeminiMove` gains optional `profileId` parameter
- `src/hooks/useDuelController.ts` -- imports `ARCHETYPES`; resolves `oppProfileId`; passes it to `fetchGeminiMove`
- `tests/scenarios/gemini-mage-prompts.test.js` -- 6/6 unit tests (`@gemini`)
- `tests/e2e/gemini-wiring.spec.ts` -- added no-regression E2E block (`@gemini`)

**Fallback contract:** `selectSystemInstruction` is total -- it never throws. A non-string, null, undefined, or unknown `profileId` returns `SYSTEM_INSTRUCTION` unchanged. The remaining four bosses (KARAG, SYLVARA, and the generic/Arzakon archetypes) continue to use the base prompt until a future expansion pass.

---

---

## Batch A1 -- Layer System Completion (Layers 1, 2, 3) -- 2026-06-29

Implements three CR 613 layer mechanisms for six Alpha-era cards. All six were previously `effect:"STUB"`.

See `docs/SYSTEMS.md` Sections 18.6, 18.7, 18.8 for authoritative specs.

**Files changed:**
- `src/data/cards.js` -- six card entries updated (effect strings, activated objects)
- `src/engine/DuelCore.js` -- resolveEff cases + revertControlGrant + checkControlGrants + checkDeath indestructible guard + RESOLVE_STACK alreadyOnBf guard + Old Man pre-untap hook
- `src/engine/layers.js` -- Layer 3 block in computeCharacteristics; Guardian Beast scan and textSwap collection in collectEffects
- `tests/scenarios/layer1-copy-artifact.test.js` -- 5 tests (@engine)
- `tests/scenarios/layer2-control-change.test.js` -- 9 tests (@engine)
- `tests/scenarios/layer3-text-substitution.test.js` -- 4 tests (@engine)

### copy_artifact

**Effect:** `copyPermanentCharacteristics` (Layer 1 -- copiable-values snapshot)

**Handler:** `resolveEff` case `"copyPermanentCharacteristics"` in `DuelCore.js`. Looks up the target artifact's static definition via `CARD_DB.find(c => c.id === tgtC.id)` and builds a new permanent from printed values only (no counters, no enchantments, no eotBuffs). Adds `"Enchantment"` to the type string. Pushed directly onto caster's bf; `RESOLVE_STACK`'s `alreadyOnBf` guard skips the normal ETB push so the original card object is never double-added. Fizzles (inert enchantment) when no legal artifact target exists. Throws if the target artifact has no CARD_DB entry.

**cards.js entry:** `effect: "copyPermanentCharacteristics"`

### sleight_of_mind

**Effect:** `textSwapColor` (Layer 3 -- color-word substitution)

**Handler:** `resolveEff` case `"textSwapColor"` in `DuelCore.js`. Stack item carries `fromColor` and `toColor`. If `tgtC.color === fromColor`, mutates `tgtC.color = toColor` in state (baked-in field mutation so AI.js and direct `.color` reads see the substituted value). Stores `textSwap: { type:'color', from, to, enterTs }` on the target card for layer tracking. `collectEffects` in `layers.js` reads `card.textSwap` and pushes `{ layer:3, ...textSwap }`. Layer 3 block in `computeCharacteristics` re-applies the substitution (idempotent). Recorded even when `fromColor` does not match (substitution persists; color just happened not to match).

**cards.js entry:** `effect: "textSwapColor"`

### magical_hack

**Effect:** `textSwapLandtype` (Layer 3 -- land-type-word substitution)

**Handler:** `resolveEff` case `"textSwapLandtype"` in `DuelCore.js`. Stack item carries `fromKw` and `toKw` (keyword ids). Bakes in: replaces `fromKw` with `toKw` in `tgtC.keywords` array. Stores `textSwap: { type:'landtype', from:fromKw, to:toKw, enterTs }` on the target card. `collectEffects` and Layer 3 block in `computeCharacteristics` re-apply the substitution (idempotent). Non-target keywords are unaffected.

**cards.js entry:** `effect: "textSwapLandtype"`

### aladdin

**Effect:** `aladdinsSteal` (Layer 2 -- conditional control change)

**Handler:** `resolveEff` case `"aladdinsSteal"` in `DuelCore.js`. Activated ability (`cost: "1RR,T"`). Checks Guardian Beast protection first: if the target is a noncreature artifact and the original controller has an untapped Guardian Beast on the battlefield, the ability fizzles. Otherwise removes the artifact from the original controller's bf and pushes it to the caster's bf with `controlGrant: { grantorIid: card.iid, grantorController: origCtrl, condition:'whileGrantorControlled' }`. Revert triggered by `checkControlGrants` (called at the end of every `checkDeath` pass): if the grantor iid is not found on any bf, `revertControlGrant` moves the artifact back, resets `tapped/summoningSick/attacking/blocking`, and strips `controlGrant`.

**cards.js entry:** `effect: null, activated: { cost: "1RR,T", effect: "aladdinsSteal", requiresTarget: true }`

### guardian_beast

**Effect:** `guardianBeast` (Layer 2 static prevention + Layer 6 indestructible grant)

**Handler (can't-be-controlled):** In `resolveEff` cases `"aladdinsSteal"` and `"oldManSteal"`, a check runs before the steal: if the target is a noncreature artifact and the original controller has an untapped Guardian Beast, the effect fizzles. Also enforced in `resolveEff` case `"enchantCreature"` (can't-be-enchanted guard for noncreature artifacts). In `collectEffects` in `layers.js`, the allBf loop checks `src.effect === 'guardianBeast'`: if the source is untapped and the subject card is a noncreature artifact of the same controller, pushes `{ layer:6, addKeywords:[INDESTRUCTIBLE] }`. `computeCharacteristics` Layer 6 block adds this keyword. `checkDeath` enforces indestructible by skipping lethal-damage death for cards with the INDESTRUCTIBLE keyword.

**cards.js entry:** `effect: "guardianBeast"`

### old_man_of_the_sea

**Effect:** `oldManSteal` (Layer 2 -- conditional control change with power gate)

**Handler:** `resolveEff` case `"oldManSteal"` in `DuelCore.js`. Activated ability (`cost: "T"`). Compares `getPow(tgtC, ns)` to `getPow(oldManCard, ns)`. If target power exceeds Old Man's power, the ability fizzles. Otherwise steals: removes target from original controller's bf, pushes to caster's bf with `controlGrant: { grantorIid, grantorController, condition:'whileTappedAndPowerLte', maxPower:oldManPow }`.

**Revert (SBE pass):** `checkControlGrants` evaluates: if grantor not found OR grantor not tapped, call `revertControlGrant`. Also checks `getPow(stolen, ns) > grant.maxPower` and reverts if exceeded (SBE-pass simplification -- real-time mid-turn recheck not implemented; fires at the next `checkDeath` call).

**Revert (pre-untap):** Before the untap `.map()` in the ADVANCE_PHASE -> UNTAP block, a loop finds all Old Man instances in the active player's bf that are tapped and would untap (not blocked by Meekstone or Paralyze). For each, any permanents with a matching `controlGrant.grantorIid` are reverted before the untap occurs. **Note:** the optional "choose not to untap" clause is not implemented (no UI mechanism); Old Man untaps normally.

**cards.js entry:** `effect: null, activated: { cost: "T", effect: "oldManSteal", requiresTarget: true }`

---

## Feature: End Turn skip-ahead (END-TURN-SKIP-1) — 2026-06-30

**Problem:** End Turn only advanced the duel by a single phase step per click, requiring repeated clicks (and manual Pass Priority presses) to actually finish a turn with no further player actions.

**Fix:** Added `endTurn()` to `useDuelController.ts`: sets `endTurnPending` and drives an effect loop that repeatedly calls the existing `passPriority('p')` (when the player owes priority) or `requestPhaseAdvance()` (otherwise), stopping the instant `s.turn` changes, `s.over` is set, or the engine raises a pending player choice (`pendingUpkeepChoice`, `pendingConditionalCounter`, `pendingSphereTrigger`, `pendingChoice`, `pendingTutor`, `pendingTransmuteSacrifice`, `pendingTransmutePay`, `pendingLotus`, `pendingBop`). It does not call any new dispatcher and does not touch `DuelCore.js` -- the opponent AI still acts exactly when it already does today via the existing priority-window and AI-loop effects. Declaring no attackers before pressing End Turn relies on the existing `advPhase` "Issue B14" auto-skip of empty-attacker combat sub-phases.

Both `DuelScreen.tsx` (desktop) and `DuelScreenMobile.tsx` (mobile) wire their End Turn button through `endTurn`/`endTurnPending` from the shared hook. While `endTurnPending` is true, `ActionBar` (`src/ui/ActionBar/ActionBar.tsx` and `src/ui/Mobile/ActionBar.tsx`) renders a disabled "Ending Turn..." bar in place of the normal Cast/Activate/Pass Priority/Done Attacking/Done Blocking/End Turn controls, so nothing can interleave with the auto-pass loop.

**Files changed:**
- `src/hooks/useDuelController.ts` — added `endTurn`, `endTurnPending` (state + driving effect); exported alongside `requestPhaseAdvance`
- `src/DuelScreen.tsx` — keyboard shortcut and `ActionBar` `onEndTurn` rewired to `endTurn`; `endTurnPending` passed through
- `src/ui/Mobile/DuelScreenMobile.tsx` — non-combat branch of `ActionBar`'s `onEnd` rewired to `endTurn`; `endTurnPending` passed through
- `src/ui/ActionBar/ActionBar.tsx` — `endTurnPending` prop; disabled "Ending Turn..." bar
- `src/ui/Mobile/ActionBar.tsx` — `endTurnPending` prop; disabled "Ending Turn..." bar

**Tests:** `tests/e2e/end-turn-skip-ahead.spec.ts` -- END-TURN-01 through 05, desktop (1280x800) + mobile (390x844).

---

## Feature: Cross-Blended Tint Boundary Dithering (TINT-BLEND-DITHER-1) -- 2026-06-30

**Problem:** Biome tints (forest green, mountain grey, island blue, swamp olive) were applied as a single flat `fillRect` per tile, producing hard rectangular seams wherever two differently-tinted (or tinted/untinted) biomes met. Both tiles on either side of a seam rendered independently with no awareness of their neighbor, so the boundary read as a sudden color jump.

**Fix:** Replaced the flat tint `fillRect` with `getTintCells()`, a pure-data function added to `terrainRenderer.js`. It returns an array of `{ sx, sy, w, h, tint }` fill instructions (tile-local pixel coordinates, draw-order safe) that `WorldMap.jsx` applies via `ctx.fillRect`.

Algorithm: each tile first lays down a full-tile base fill for its own tint (if any). Then for each edge whose neighbor tint differs, it paints a dithered band `TINT_BAND_CELLS` cell-rows deep inward. Each band cell rolls `hashTile(worldEdgeIndex, d, TINT_SIDE_SEED[side]) % 100` against a cutoff that increases with depth (100% own-tint at the inner row, mixed near the seam). Because `worldEdgeIndex` is computed from the tile's world coordinate along the shared axis, both tiles bordering a seam compute identical cell hashes -- the dither pattern interlocks, not drifts. The dithering is symmetric: both tiles produce blended band cells independently.

**Two tunables** (first things to adjust if the blend reads too soft or too noisy):
- `TINT_CELL_PX = 4` -- dither cell size in tile-local pixels
- `TINT_BAND_CELLS = 3` -- cell-rows deep the blend band extends inward

**Cheap path:** when all 4 neighbor tints equal the tile's own tint, `getTintCells` short-circuits to `[]` (untinted) or `[{sx:0,sy:0,w:tileSize,h:tileSize,tint}]` (tinted), producing pixel-identical output to the old flat `fillRect` for interior biome tiles (95%+ of the map).

**Distinct from WATER/SWAMP ground autotile:** `blobSubOffset` and `getGroundLayers` handle the WATER/SWAMP feathered-edge ground patch rendering and were not touched. Tint dithering operates on a separate canvas layer (the rgba fill pass) and does not interact with the ground sprite selection.

**Corner overlap simplification:** band draw order is n, e, s, w -- later side wins corner cells. This is not true 2-axis corner blending; corners may show a slight directional bias. Flagged as a known simplification.

**Files changed:**
- `src/ui/overworld/terrainRenderer.js` -- added `getTintCells()`, constants `TINT_CELL_PX`, `TINT_BAND_CELLS`, `TINT_SIDE_SEED` (all named exports), helper `tintsEqual()`; updated default export object
- `src/ui/overworld/WorldMap.jsx` -- import swapped from `getTint` to `getTintCells`; `MapTile` receives new `neighborTerrainIds` prop (separate from `groundNeighbors`); draw effect replaces flat `getTint`+`fillRect` block with a loop over `getTintCells(...)` instructions; `ntN/ntS/ntE/ntW` primitive deps added to effect dependency array

**Tests:** `tests/e2e/overworld-tileset.spec.ts` -- four tint-blend dithering tests per viewport (desktop 1280x800 + mobile 390x844): boundary tile produces band cells, interior tile hits cheap path, seam symmetry (both sides dither), determinism (repeated calls identical).

---

## Batch: Simple-Tier Stub Cards (Forge Reference) -- 2026-07-01

47 of 50 targeted Alpha/Beta stub cards implemented, adapted from Card-Forge/forge (GPL-3.0) implementation-pattern reference scripts; Scryfall oracle text (verified against `scryfall/shandalar-card-pool.json`) is the sole authority for effect text, and matched every Forge `Oracle:` line in this batch with no discrepancies. See `THIRD_PARTY_NOTICES.md` for the full per-card attribution table.

### New effect cases in `DuelCore.js` (`resolveEff`)

| Case | Cards | Notes |
|---|---|---|
| `tapTargetWall` | `ali_baba` | Restricts tap to `subtype.includes('Wall')` |
| `discardAllNonland` | `amnesia` | Target player keeps lands in hand, discards the rest to gy |
| `returnArtifactFromGYToHand` | `argivian_archaeologist` (ability), `reconstruction` (spell) | Shared case; defaults to most-recent artifact in gy if no explicit `tgt` (Regrowth-style fallback) |
| `preventDamage2ArtifactCreature` | `argivian_blacksmith` | Sets `damageShield += 2`, restricted to artifact creatures. Note: `damageShield` is set by this and the pre-existing `preventDamage1Any`/`preventDamage1Creature` cases but is never actually consumed/decremented anywhere in the engine (cleared to 0 at end of turn only) -- a pre-existing gap this batch inherits, not introduces |
| `pumpAttackersPower2EOT` | `army_of_allah` | Loops both `bf`, filters `ns.attackers.includes(c.iid)` |
| `counterArtifact` | `artifact_blast` | Mirrors `counterCreature` with `isArt(top.card)` check |
| `addMana3Red` | `coal_golem` | Routed through the general (stack-based) activated-ability flow rather than the immediate-mana-ability branch, since its cost (`3,sac`) needs generic-mana + sacrifice cost payment that the immediate branch doesn't handle |
| `preventDamage2Self` | `conservator` | No target -- always the caster |
| `colorLace` | `chaoslace`, `deathlace`, `lifelace`, `purelace`, `thoughtlace` | Shared case parameterized by `card.laceColor`. Mutates `.color` directly (permanent branch) or `stack[i].card.color` (spell branch) -- matches this codebase's existing convention of reading `.color` as a raw field everywhere (`canBlockDuel`, BEB/REB checks) rather than through a Layer 5 pipeline, which currently has no producers |
| `destroyBlackCreature` | `exorcist` | Existing `destroyBlack` case has no `isCre` check; this one does |
| `shuffleGYIntoLibrary` | `feldonss_cane` | Uses existing `shuffle()` helper (no new `Math.random()`) |
| `addManaReflected` | `fellwar_stone` | True mana ability (rule 605.3b) -- added to the immediate-resolve branch in `ACTIVATE_ABILITY` alongside `addMana`/`addManaAny`/`addMana3Any`. SIMPLIFICATION: deterministic first color in WUBRG order among colors an opponent's lands could produce, rather than a player-facing picker (no restricted-subset color-choice UI exists; `DualLandColorPicker`/`BopColorPicker` are either GameState-detached or hardcoded to all 5 colors) |
| `revealHand` | `glasses_of_urza` | Logged reveal, no modal |
| `damage1Flying` | `grapeshot_catapult` | Restricted to `hasKw(tgtC, FLYING)` |
| (reused `globalDebuffPower1EOT`) | `hell_swarm` | Oracle text is an exact match for the existing case |
| `tapOrUntapArtifact` | `hyperion_blacksmith` | Toggles `tapped`; restricted to `tgtC.controller !== caster` |
| (reused `draw1`) | `jandorss_ring` | See `discardLastDrawn` cost token below |
| `globalDebuffPower2EOT` | `marsh_gas` | Mirrors `globalDebuffPower1EOT` at -2/-0 |
| `destroyAuraOnOwnCreature` | `miracle_worker` | Mirrors the existing `destroyLandAura` embedded-aura-record search pattern, restricted to `ns[caster].bf` creatures |
| `scryTop3Reveal` | `natural_selection` | SIMPLIFICATION: reveals top 3 in the log; leaves library order unchanged (a legal choice of "any order") and offers no shuffle (also legal, since "may" permits declining) -- no reorder/shuffle-choice UI exists |
| `bouncePermanentControlled` | `obelisk_of_undoing` | SIMPLIFICATION: this engine has no separate owner-vs-controller tracking, so "you both own and control" is modeled as "a permanent you control" |
| `damage2Any` | `orcish_mechanics` | See `sacArt` cost token below |
| `pumpBlockersToughness3EOT` | `piety` | Filters `c.blocking != null`, both sides |
| `debuffTargetPower2EOT` | `pradesh_gypsies` | Mirrors existing `debuffTargetPower1EOT` at -2 |
| (reused `destroy`) | `desert_twister` | Existing case already has no restriction when `card.restriction` is unset |
| `untapAllOwnLands` | `reset` | Paired with a `CAST_SPELL` cast-timing restriction, see below |
| `tapAllBlueCreatures` | `riptide` | Filters `isCre(c) && c.color === 'U'`, both sides |
| `setAttackerPower0EOT` | `singing_tree` | Pushes an `eotBuff` with `layerDef: { layer: '7b', setPower: 0 }` (Layer 7b already supports `setPower`); restricted to `ns.attackers.includes(tgtC.iid)` |
| (reused `addMana`) | `sisters_of_the_flame` | `activated:{cost:"T",effect:"addMana",mana:"R"}`, same shape as `llanowar_elves` |
| (reused `destroyWall`) | `tunnel` | "Can't be regenerated" is already true for every existing `destroy*` case -- none of them consult the `regenerating` flag (only damage-based SBE in `checkDeath` does) |
| `fetchBasicToBf` | `untamed_wilds` | Deterministic first basic land found in library order (mirrors the existing `landTax` upkeep case's fetch pattern), `zMove`'d to `bf`, then `shuffle()`s the remainder |
| (reused `pumpCreature`) | `wyluli_wolf` | `activated:{cost:"T",effect:"pumpCreature"}` + top-level `mod:{power:1,toughness:1}` on the card entry -- reuses the existing data-driven `pumpCreature` case unchanged |

### New ACTIVATE_ABILITY cost tokens

Extends the existing `T` / `sac` cost-token convention (Batch 1B) in `DuelCore.js`:
- `sacArt` -- sacrifice an artifact you control (not necessarily the activating permanent itself). SIMPLIFICATION: no UI to choose which; sacrifices the first one found. Preflight-checked before any cost is paid (see Bug Fix note below).
- `exile` -- exile the activating permanent as a cost (Feldon's Cane).
- `discardLastDrawn` -- discard "the last card you drew this turn" (Jandor's Ring). SIMPLIFICATION: approximated as the last element of the `hand` array (draws are append-only), not a dedicated per-turn tracked field. Preflight-checked (hand non-empty) before any cost is paid.

**Bug fix during implementation:** the initial `sacArt`/`discardLastDrawn` cost blocks were placed after the unconditional tap-cost application, so a failed activation (no artifact / empty hand) still left the permanent tapped. Fixed with a preflight check (`act.cost.includes('sacArt') && !s[w].bf.some(isArt)`, similarly for `discardLastDrawn`) before any cost -- including tap -- is paid. Covered by `simple-tier-forge-batch-abilities.test.js` ("Orcish Mechanics: cannot activate with no artifact to sacrifice").

### New continuous/static effects

- **Castle**, **Fortified Area**, **Weakstone** (`layers.js` `collectEffects`): name-based checks mirroring the pre-existing Holy Ground pattern (`state[opp]?.bf.some(h => h.name === '...')`), pushing Layer 6/7c effects. Castle and Fortified Area are controller-scoped (`state[card.controller]`); Weakstone is controller-blind (`[...state.p.bf, ...state.o.bf]`), matching its oracle text ("Attacking creatures get -1/-0" with no "you control").
- **Moat**: implemented as a `DECLARE_ATTACKER` legality gate (mirrors the existing Defender-keyword check in the same reducer case), not a layers.js characteristic -- attack-legality isn't part of `computeCharacteristics`'s output.
- **Water Wurm**: new `waterWurmToughness` CDA evaluator in `layers.js`, following the exact `kird_ape` pattern (`layerDef: { layer: '7a', toughnessFn: '...' }`).
- **Mishra's Workshop**: `applyOvergrowthTap` gained a per-card `amount` override (`c.id === 'mishrass_workshop' ? 3 : ...`), following the pre-existing hardcoded-by-id bonus pattern already used there for Tron pieces, Mana Flare, Wild Growth, and Sunglasses of Urza. SIMPLIFICATION: the "spend this mana only on artifact spells" restriction isn't enforced -- this engine's mana pool has no per-mana spend-restriction tagging (no other card enforces one either).

### `useDuelController.ts` UI-targeting wiring

- `EXPLICIT_TARGET_EFFECTS` extended: `discardAllNonland`, `colorLace`, `scryTop3Reveal`, `returnArtifactFromGYToHand`.
- `PLAYER_ONLY_TARGET_EFFECTS` extended: `discardAllNonland`, `scryTop3Reveal`.
- `ACTIVATE_TARGET_EFFECTS` extended: `tapTargetWall`, `preventDamage2ArtifactCreature`, `destroyBlackCreature`, `damage1Flying`, `tapOrUntapArtifact`, `returnArtifactFromGYToHand`, `destroyAuraOnOwnCreature`, `setAttackerPower0EOT`, `debuffTargetPower2EOT`, `damage2Any`, `bouncePermanentControlled`, `revealHand`.
- `PLAYER_TARGETABLE_ABILITY_EFFECTS` extended: `damage2Any`, `revealHand`.
- `isCounterEffect` extended: `counterArtifact` (targets a stack item exactly like `counter`/`counterCreature`/`powerSink`).
- `needsStackTarget` extended: `colorLace` returns `true` unconditionally (no BEB/REB-style mode toggle needed, since recoloring is the same action whether the target is a permanent or a stack item).
- `DuelScreen.tsx` (desktop) and `DuelScreenMobile.tsx`: the stack-item-click condition for the cast flow was `isCounterEffect(sourceCard)`; both now use `needsStackTarget(sourceCard, pendingMode)` so `colorLace`'s dual permanent-or-stack targeting works identically on both viewports (mobile's *ability*-targeting stack display already used `needsStackTarget`; only the *cast*-flow stack display needed the swap).

### cards.js schema changes

47 cards had `effect:"STUB"` replaced with the effect ids above (or an `activated:{cost, effect}` block, or a bare static/keyword entry for `castle`/`moat`/`weakstone`/`fortified_area`/`repentant_blacksmith`/`water_wurm`, matching existing precedent for cards whose logic lives entirely in `layers.js`/`DECLARE_ATTACKER` rather than `resolveEff`).

### Deferred (still `effect:"STUB"`, comment updated to explain why)

- **`serpent_generator`, `the_hive`**: no token-creation mechanic exists anywhere in this engine (verified: no `isToken`/token fields, no CARD_DB-independent battlefield-object support). Building one is dedicated engine infrastructure (persistence, art lookup, CARD_DB-independent bf entries), not a per-card implementation task.
- **`urzass_avenger`**: needs a "choose one of N keywords" player-facing choice UI. The only existing choice-picker precedent (`BopColorPicker`/`DualLandColorPicker`) is hardcoded to WUBRG mana colors and doesn't generalize; building a real one means new pending-choice state plus new modal components on both screens.

### Tests

- Vitest: `tests/scenarios/lace-cycle.test.js` (color-lace cycle), `tests/scenarios/simple-tier-forge-batch-effects.test.js` (spell-level cases), `tests/scenarios/simple-tier-forge-batch-abilities.test.js` (activated-ability cases, including the new cost tokens), `tests/scenarios/simple-tier-forge-batch-static.test.js` (Castle/Fortified Area/Weakstone/Moat/Water Wurm)
- Playwright: `tests/e2e/batch-simple-tier-forge-1.spec.ts` (Exorcist, Moat, Fellwar Stone, Argivian Archaeologist, Untamed Wilds), added to the `mobile-chrome` project's `testMatch` allowlist in `playwright.config.js`

### Status
ACTIVE

---

## Feature: Creature Evaluator Port (Card-Forge/forge CreatureEvaluator, GPL-3.0) -- 2026-07-02

**Problem:** `AI.js`'s board evaluation (`evaluateBoard` / `sumCreaturePower`) summed raw `getPow()` across creatures with no per-creature nuance -- a 1/1 deathtouch creature scored identically to a vanilla 1/1, undervaluing keyword-rich creatures relative to their actual combat value.

**Fix:** New `evaluateCreatureValue(card, state)` in `AI.js`, ported from Card-Forge/forge's `CreatureEvaluator.java` (algorithm and point weights only, not a mechanical line-for-line port). `sumCreaturePower()` now sums `evaluateCreatureValue()` per creature instead of raw power; `evaluateBoard()`'s formula shape and both call sites (multi-plan simulation scoring, MCTS-adjacent virtual-state scoring) are unchanged. See `docs/SYSTEMS.md` Section 6.10 for the full ported/skipped keyword breakdown.

**Keywords ported** (present in `src/data/keywords.js` and cross-checked as "live" in combat/SBE code): `FLYING`, `FEAR`, `MENACE`, `FIRST_STRIKE`, `DOUBLE_STRIKE`, `DEATHTOUCH`, `LIFELINK`, `TRAMPLE`, `VIGILANCE`, `REACH`, `INDESTRUCTIBLE`, `HEXPROOF`, `SHROUD`, `PROTECTION`, `DEFENDER`, plus base power/toughness/cmc weighting and an untapped bonus.

**Keywords skipped:** `INFECT` exists in `keywords.js` but has no combat-damage implementation anywhere in `DuelCore.js` (`hasKw(..., KEYWORDS.INFECT...)` has zero call sites) -- not scored, since it isn't "live" in this engine yet. `REGENERATION`, `LANDWALK`/color-specific walk variants, `BANDING`, `FLASH`, `MUST_ATTACK`, `LURE` have no Forge `CreatureEvaluator` equivalent to port. Forge mechanics with no Shandalar counterpart at all (horsemanship, intimidate, skulk, shielded/stun counters, paired/soulbond, encode, energy, detain, goad, cumulative upkeep, echo, fading, vanishing, Eldrazi annihilator, bushido, flanking, exalted, melee, prowess, absorb, outlast) are omitted rather than stubbed.

**Judgment call:** Forge's base value includes a conditional "+20 if not a token" bonus. This engine has no token-creation mechanic (verified: no `isToken` field or equivalent anywhere in `DuelCore.js`/`cardHandlers.js`), so every creature is treated as non-token and the +20 always applies unconditionally.

**Files changed:**
- `src/engine/AI.js` -- `evaluateCreatureValue()` added (exported for testability); `sumCreaturePower()` rewired to call it; `evaluateBoard()` also exported (unchanged internally)
- `THIRD_PARTY_NOTICES.md` -- new row for the CreatureEvaluator.java attribution
- `docs/SYSTEMS.md` -- new Section 6.10
- `docs/AI_COMBAT_PORT_PLAN.md` -- new doc scoping the follow-on attack/block/simulation port (Part B of this batch; no code written)

**Tests:** `tests/scenarios/ai-creature-evaluation.test.js` (Vitest -- vanilla baseline, flying, deathtouch, defender penalty, stacked flying+first-strike, `evaluateBoard` comparative check); `tests/e2e/ai-creature-evaluation-smoke.spec.ts` (Playwright -- desktop + mobile, plays a full AI-vs-AI-ish duel to completion via the sandbox escape hatches and asserts no console/page errors; added to the `mobile-chrome` project's `testMatch` allowlist in `playwright.config.js`).

### Status
ACTIVE

---

## Batch: Moderate-Tier Stub Cards (Forge Reference) -- 2026-07-02

84 targeted Alpha/Beta stub cards, split into four sub-batches (M1 activated
abilities/spells, M2 keyword-line cards, M3 static/continuous, M4 triggered
abilities), adapted from Card-Forge/forge (GPL-3.0) implementation-pattern
reference scripts. Scryfall oracle text (verified against
`scryfall/shandalar-card-pool.json`) is the sole authority for effect text and
matched every Forge `Oracle:` line in this batch with no discrepancies.
55 of 84 cards implemented; 29 deferred with a reason comment in `cards.js`.
See `THIRD_PARTY_NOTICES.md` for the full per-card attribution table.

### M1 -- Activated abilities and spells (28 of 33 implemented)

New `resolveEff` cases: `counterAndArtifactType`, `skipNextUntap`,
`damage1AnySelf1`, `untapXLands`, `destroyArtifactGainCMC`,
`restoreArtifactsFromGYToLibrary`, `tapNonFlyingTarget`,
`pumpToughnessByTargetCMC`, `cantRegenTarget`, `damageByWhiteCardsInHand`,
`drawThenDiscardOwn`, `gainLifeSacrificedToughness`, `addBBySacrificedCmc`,
`preventDamage1AnyReturnEnd`, `gainAndDealDamageThisTurn`,
`drawRevealDiscardIfNonland`, `unblockableTargetPowerLE2`, `scryTop5Reveal`,
`tapXCreatures`, `animateArtifactUntilEnd`. Reused existing cases: `draw1`
(Book of Rass, Greed), `bazaarActivate` (Bazaar of Baghdad), `destroyArtifact`
(Gate to Phyrexia).

New `ACTIVATE_ABILITY` cost tokens: `payLife2` (pay 2 life as an additional
cost), `sacCre` (sacrifice a creature you control, not necessarily the
activating permanent -- preflight-checked like `sacArt`), plus `myUpkeepOnly`
and `onceEachTurn` activation-restriction flags (`turnState.activatedOnceIids`,
reset at CLEANUP). X-cost activated abilities now work (`xValPaid` sourced
from `action.xVal ?? s.xVal`, threading into both mana payment and the pushed
stack item's `xVal` -- previously hardcoded to 1, a latent gap with no prior
card to exercise it). `Wormwood Treefolk` uses the pre-existing
`activatedAbilities` array pathway (Mishra's Factory precedent) via a new
shared `grantWalkSelfDamage2` branch parameterized by `mana`/`walkKeyword`/
`walkName`.

New engine infrastructure: `hurt()` now tracks
`turnState.damageTakenThisTurn[who]` (reset at CLEANUP) for Simulacrum's X
value. `PHASE.END` gained a delayed-effects block (Rakalite's self-bounce,
Xenic Poltergeist's animate-artifact revert) -- both stash pre-state in a
field (`returnToHandNextEnd` / `revertAnimateAtEnd`) applied at the next end
step. `canBlockDuel` gained an `eotBuffs.unblockable` check (Tawnos's Wand).
Xenic Poltergeist directly mutates `.type`/`.power`/`.toughness` rather than
using a layer-4 effect, since `isCre()` and combat/SBE code read `card.type`
directly, not through `computeCharacteristics()` (see M3 below).

Deferred: **Alchor's Tomb** (needs a generic color-choice UI; existing
pickers are all mana-specific), **Blaze of Glory** (blocking model can't
represent one blocker blocking multiple attackers), **Coral Helm** (Milestone
B/seeded RNG -- would need a new `Math.random()` call site; the existing
random-discard code only discards from the opponent's hand), **Reverse
Polarity** (needs artifact-source-tagged damage tracking `hurt()` doesn't
have), **Sacrifice** (no "additional cost to cast" mechanism exists for
spells).

### M2 -- Keyword-line cards (6 of 11 implemented)

Implemented via pure keyword/`protection` fields (Mountain Yeti, Thunder
Spirit, Wall of Light) or a small new activated-ability case
(`damage1AttackerOrBlocker` for Crimson Manticore, `pumpSelf21EOT` for Fallen
Angel). Fire Drake reuses `pumpSelf` with the new `onceEachTurn` gate.

**Bug fix during implementation:** the new `sacCre` cost token collided with
the pre-existing generic self-sacrifice cost branch (`act.cost.includes("sac")`
matches the substring "sac" inside "sacCre"), double-sacrificing the
activating permanent. Fixed by excluding `sacCre` from that branch, mirroring
the existing `sacArt` exclusion. Also hardened the `sacCre` creature-auto-pick
to prefer a creature other than the activating permanent itself (so Fallen
Angel doesn't sacrifice itself when another creature is available).

Deferred: **Ashnod's Battle Gear**, **Tawnos's Weaponry** (both need an
"optional untap" per-permanent choice mechanic -- no UI or engine flag for
"may choose not to untap during your untap step" exists), **Darkpact**,
**Demonic Attorney** (no ante zone/mechanic exists in this engine --
consistent with other still-stubbed ante cards), **Knights of Thorn**
(`BANDING` is registered in `keywords.js` and grantable via one existing card
(Helm of Chatzuk), but the engine has no attacker-damage-assignment
implementation for it -- listed-but-not-enforced per M2 policy).

### M3 -- Static/continuous effects (11 of 15 implemented)

New `layers.js` additions: `gaeasAvengerPT` and `peopleOfTheWoodsToughness`
CDA evaluators (Layer 7a); named continuous-effect checks for Angelic Voices,
Beasts of Bogardan, Orcish Oriflamme, following the pre-existing
Castle/Fortified Area/Weakstone pattern. The generic `lordEffect`/`globalPump`
matcher gained a `lordControllerOnly` flag so the three Kobold lords can be
"you control"-scoped, unlike the pre-existing symmetric anthems (Goblin King,
Crusade, Bad Moon) that intentionally affect both players' matching creatures
per their real oracle text.

New `DuelCore.js` aura mods, both enforced at their natural check point rather
than through the layer pipeline: `cantAttackUnlessPay` (Brainwash) in
`DECLARE_ATTACKER`, auto-paying if able (same "unless you pay" convention as
Demonic Hordes' upkeep cost); `blockRestrictionArtifactOrWhite` (Seeker) in
`canBlockDuel`. Eternal Warrior needed no new code at all -- `mod.keywords` on
an `enchantCreature` aura is already read generically by `layers.js`.

**Architectural finding:** `layers.js` computes a Layer-4 type change for
`computeCharacteristics()`'s return value, but `isCre`/`isLand`/`isArt`,
`checkDeath`, and all combat-eligibility checks read `card.type` directly,
never through `computeCharacteristics()`. A continuous "land becomes a
creature" effect is therefore not actually live anywhere the engine checks
creature-ness, unlike a one-shot type change (which can bake the mutation in
directly, as Ashnod's Transmogrant/Xenic Poltergeist in M1 do). Deferred:
**Blood Moon**, **Evil Presence**, **Kormus Bell**, **Living Lands** -- all
four are exactly this pattern (land type/subtype/creature-ness changes) and
would need a new "recompute type changes on relevant battlefield changes"
mutation pass, which doesn't exist. Flagged as a candidate for a future
milestone rather than attempted piecemeal here.

### M4 -- Triggered abilities (10 of 25 implemented)

**Bug fix during implementation (real, not new):** self-scoped "when this
dies" triggers could never fire. `checkDeath` moves the dying creature to the
graveyard *before* calling `emitEvent`, but both `emitEvent`'s trigger
detection and `resolveTrigger`'s source-card lookup only ever scanned the
live battlefield -- so a `scope:'self'` + `ON_CREATURE_DIES` trigger's source
card was always already gone by the time either function looked for it. No
pre-batch card combined those two, so this was latent, not previously
observed. Fixed with a new `findLeftBattlefieldCard()` helper (checks
graveyard/exile by last-known information, CR 603.6d equivalent), wired into
both `emitEvent` and `resolveTrigger`. Required for Abu Ja'far, Cyclopean
Mummy, and Onulet to work at all.

New `resolveTriggeredEffect` cases: `destroyCombatPartners` (Abu Ja'far --
`ON_CREATURE_DIES` payload extended with `blockingId`/`blockedByIds`, captured
in `checkDeath` before `zMove` clears the dying card's own fields),
`exileSelfFromGY` (Cyclopean Mummy), `controlToHighestLife` (Ghazbán Ogre --
2-player simplification of "more life than each other player"),
`gainLifeController` (Onulet), `payGenericGainLife` + `noop` (Soul Net --
`requiresChoice: true`, resolved through the existing `pendingChoice`/
`ChoiceModal` UI, already generic enough to need no UI changes),
`gainLifeIfControlsPlains` (Spiritual Sanctuary -- reads
`payload.activePlayer`, not `sourceCard.controller`, since the ability fires
on *each* player's upkeep and pays whichever player is active).

New non-trigger-pipeline hooks, following existing named-check precedent:
`applyOvergrowthTap` gained a Mountain-tap checkpoint (Gauntlet of Might's
second ability, Lifeblood) -- the same pattern already used there for Tron,
Mana Flare, and Manabarbs. `PLAY_LAND`/`RESOLVE_STACK` gained a Kismet
enter-tapped checkpoint. `DECLARE_ATTACKER` gained an
`attackRequiresDefenderLand` gate (Goblin Rock Sled); its "doesn't untap if it
attacked last turn" half reuses M1's `skipNextUntap` flag rather than adding a
new one. Gauntlet of Might's static half reuses the pre-existing `globalPump`
case (symmetric "Red creatures get +1/+1", matching its real oracle text).

Deferred, grouped by missing capability:
- **Cave People, Hasran Ogress** -- need an `ON_ATTACKS`-style event; the
  trigger vocabulary has `ON_CREATURE_DIES`, `ON_DAMAGE_DEALT` (combat only),
  `ON_UPKEEP_START`, none of which cover "whenever this creature attacks".
- **Citanul Druid, Throne of Bone, Urza's Chalice** -- need an
  `ON_SPELL_CAST` event (would resolve all three at once if added).
- **Dingus Egg, Tablet of Epityr, Urza's Miter** -- need a non-creature
  "permanent dies" event; `checkDeath`'s `ON_CREATURE_DIES` only processes
  creatures, never lands/artifacts.
- **Khabál Ghoul** -- needs an "each end step" event; only
  `ON_UPKEEP_START` exists as a phase-boundary trigger.
- **Haunting Wind, Powerleech** -- the "OR ability activated without {T}"
  half of their trigger condition spans multiple call sites (`ACTIVATE_ABILITY`
  tap-cost step, non-tap activation, `TAP_ART_MANA`) with no single hook point
  like `applyOvergrowthTap` provides for lands.
- **Marsh Viper, Pit Scorpion** -- poison/infect is explicitly listed in
  `docs/SYSTEMS.md` as deliberately not ported ("not live in this engine").
- **Martyrs of Korlis, Veteran Bodyguard** -- damage redirection needs the
  damage source's permanent-type (artifact / unblocked creature) at the
  `hurt()` call site; `hurt()` only receives a display-string source label
  today, the same gap that blocks Reverse Polarity in M1.

**Candidate new event types**, surfaced by this batch's deferrals but not
added (would need explicit approval as an engine-contract change):
`ON_ATTACKS_DECLARED` (2 cards), `ON_SPELL_CAST` (3 cards), a generic
`ON_PERMANENT_DIES`/`ON_LAND_DIES` (3 cards), `ON_END_STEP` (1 card).

### `useDuelController.ts` UI-targeting wiring

- `EXPLICIT_TARGET_EFFECTS` extended: `destroyArtifactGainCMC`,
  `restoreArtifactsFromGYToLibrary`, `pumpToughnessByTargetCMC`,
  `damageByWhiteCardsInHand`, `scryTop5Reveal`, `tapXCreatures`,
  `gainAndDealDamageThisTurn`.
- `PLAYER_ONLY_TARGET_EFFECTS` extended: `restoreArtifactsFromGYToLibrary`,
  `damageByWhiteCardsInHand`, `scryTop5Reveal`.
- `ACTIVATE_TARGET_EFFECTS` extended: `counterAndArtifactType`,
  `skipNextUntap`, `damage1AnySelf1`, `untapXLands`, `tapNonFlyingTarget`,
  `destroyArtifact`, `cantRegenTarget`, `unblockableTargetPowerLE2`,
  `preventDamage1AnyReturnEnd`, `animateArtifactUntilEnd`,
  `damage1AttackerOrBlocker`.
- `PLAYER_TARGETABLE_ABILITY_EFFECTS` extended: `damage1AnySelf1`,
  `preventDamage1AnyReturnEnd`.

### cards.js schema changes

55 cards had `effect:"STUB"` replaced with the effect ids above (or an
`activated`/`activatedAbilities`/`triggeredAbilities`/`layerDef` block, or a
bare static/keyword entry, matching existing precedent). 29 cards kept
`effect:"STUB"` with the comment rewritten to a `DEFERRED:` reason (see
per-sub-batch breakdown above).

### Tests

- Vitest: `tests/scenarios/moderate-m1-activated.test.js` (28 cases),
  `tests/scenarios/moderate-m2-keywords.test.js` (7 cases),
  `tests/scenarios/moderate-m3-statics.test.js` (11 cases),
  `tests/scenarios/moderate-m4-triggers.test.js` (11 cases)
- Playwright: `tests/e2e/batch-moderate-tier-forge-2.spec.ts` (Brothers of
  Fire [M1 activated ability], Thunder Spirit [M2 keyword creature in
  combat], Orcish Oriflamme [M3 static visibly pumping an attacker], Onulet
  [M4 dies-trigger]), added to the `mobile-chrome` project's `testMatch`
  allowlist in `playwright.config.js`; passes on both the `chromium` and
  `mobile-chrome` projects.

### Status
ACTIVE

---

## Batch: Trigger-Event Expansion + Damage Source Infrastructure (Deferral Sweep 1) -- 2026-07-02

### New engine mechanisms

- **Four new trigger event types** (`src/engine/DuelCore.js`): `ON_ATTACKS_DECLARED`
  (advPhase, leaving `COMBAT_ATTACKERS`), `ON_SPELL_CAST` (`CAST_SPELL`, after
  the spell is pushed to the stack), `ON_PERMANENT_LEAVES_BF` (`zMove()`, the
  single choke point for every bf -> gy/exile/hand move -- fires alongside, not
  instead of, `ON_CREATURE_DIES`), `ON_END_STEP` (advPhase, entering `PHASE.END`).
  See `docs/SYSTEMS.md` Section 17.3.5-17.3.8 for full payload/condition contracts.
- **New `evaluateCondition()` condition types**: `selfIsAttacker`,
  `permanentWasLand`, `ownArtifactLeftBf`, `ownArtifactDiedNotSacrificed`,
  `spellColorIncludes`, `spellIsArtifact`, `opponentCastArtifactSpell`.
- **`turnState.sacrificedIids`**: per-turn sacrifice tracking (see SYSTEMS.md
  17.3.7.1), needed for Urza's Miter's "if it wasn't sacrificed" clause.
- **`turnState.creaturesDiedThisTurn`**: per-turn creature-death iid tracking,
  populated inside `zMove()` alongside the `ON_PERMANENT_LEAVES_BF` emission.
  Powers Khabál Ghoul.
- **`hurt(s, who, amt, src, meta)`**: optional 5th `meta` param
  (`{ sourceIid, sourceType, combat, unblocked }`), backward compatible with
  all pre-existing string-only call sites. See SYSTEMS.md Section 17.9 for the
  full contract (call sites tagged, `damageBySourceType` tracking, and the
  `damageRedirect` hook).
- **New `resolveTriggeredEffect()` cases**: `pumpSelfEOT`, `payGenericNoEffect`,
  `dealFixedDamageToController`, `damagePermanentControllerFromArtifact`,
  `addCounterEqualToCreatureDeaths`, `payGenericDrawCard`.
- **New `resolveEff()` cases**: `grantMountainwalkTarget`, `reversePolarityGain`.
- **`damageRedirect` static card-data flag**: opt-in flag (same pattern as
  `lifeFloor`/`preventsDesertDamage`), consulted inside `hurt()`.

### Cards implemented (12)

| Card | Mechanism used |
|---|---|
| Cave People | `ON_ATTACKS_DECLARED` + `pumpSelfEOT`; `grantMountainwalkTarget` activated ability |
| Hasran Ogress | `ON_ATTACKS_DECLARED` + `requiresChoice` (`payGenericNoEffect`/`dealFixedDamageToController`) |
| Citanul Druid | `ON_SPELL_CAST` + `opponentCastArtifactSpell` condition, reused `addCounter` |
| Throne of Bone | `ON_SPELL_CAST` + `spellColorIncludes` condition, reused `payGenericGainLife`/`noop` (Soul Net pattern) |
| Urza's Chalice | `ON_SPELL_CAST` + `spellIsArtifact` condition, reused `payGenericGainLife`/`noop` |
| Dingus Egg | `ON_PERMANENT_LEAVES_BF` + `permanentWasLand` condition, `damagePermanentControllerFromArtifact` |
| Tablet of Epityr | `ON_PERMANENT_LEAVES_BF` + `ownArtifactLeftBf` condition, reused `payGenericGainLife`/`noop` |
| Urza's Miter | `ON_PERMANENT_LEAVES_BF` + `ownArtifactDiedNotSacrificed` condition, `payGenericDrawCard` |
| Khabál Ghoul | `ON_END_STEP`, `addCounterEqualToCreatureDeaths` |
| Reverse Polarity | `reversePolarityGain` (reads `turnState.damageBySourceType`) |
| Martyrs of Korlis | `damageRedirect: { from: 'artifacts' }` static flag |
| Veteran Bodyguard | `damageRedirect: { from: 'unblockedCreatures' }` static flag |

All 12 use the existing declarative `triggeredAbilities`/`requiresChoice`/
`options` pipeline (Soul Net precedent) or the existing `damageRedirect`/static
flag pattern -- no new engine-side UI was needed; the existing generic
`ChoiceModal` (`DuelScreen.tsx`/`DuelScreenMobile.tsx`) renders any
`pendingChoice.options` array unmodified.

### Sweep of remaining DEFERRED cards

Every other `DEFERRED:` comment in `cards.js` was checked against the four new
event types and the `hurt()` meta/redirect infrastructure. None matched
exactly: Ashnod's Battle Gear / Tawnos's Weaponry (optional-untap UI gap,
unrelated), Blood Moon / Evil Presence / Kormus Bell / Living Lands
(type-changing/layers gap, unrelated), Haunting Wind / Powerleech ("artifact
becomes tapped" trigger -- a different event this batch didn't add), Marsh
Viper / Pit Scorpion (poison/infect, deliberately out of scope per SYSTEMS.md),
Sacrifice (additional-cost-to-cast, unrelated), Alchor's Tomb (color-choice UI,
unrelated), Darkpact / Demonic Attorney (ante zone, unrelated), Knights of
Thorn (banding damage-assignment, unrelated), Blaze of Glory (blocking-model
limitation, unrelated). No additional cards were unblocked by this batch.

### Tests

- Vitest: `tests/scenarios/trigger-events-expansion.test.js` (event-type
  contract: firing conditions, negative cases, APNAP ordering),
  `tests/scenarios/damage-source-meta.test.js` (`hurt()` backward
  compatibility, `damageBySourceType` accumulation/reset, `damageRedirect` for
  both flag shapes including lethal redirect), `tests/scenarios/deferral-sweep-1-cards.test.js`
  (per-card coverage for all 12).
- Playwright: `tests/e2e/deferral-sweep-1.spec.ts`, added to the
  `mobile-chrome` project's `testMatch` allowlist.

### Status
ACTIVE

---

## Deferral Sweep 2: Type-Changing Continuous Effects (2026-07-02)

Closed the gap where `layers.js` computed a Layer-4 type change for
characteristics/display, but `isCre`/`isLand`/`checkDeath`/combat-eligibility
in `DuelCore.js` read `card.type` directly and never saw it. See
`docs/SYSTEMS.md` S18.9 for the full design (baked `typeEff`/`subtypeEff`/
`colorEff`/`landTypeOverride` fields, `recomputeTypeEffects` choke points,
mid-combat revert, Blood Moon/Evil Presence mana-and-ability override).

| Card | Mechanism |
|---|---|
| Living Lands | `globalTypeEffect: { filter:'Forest', addTypes:['Creature'], setPower:1, setToughness:1 }` |
| Kormus Bell | `globalTypeEffect: { filter:'Swamp', addTypes:['Creature'], setPower:1, setToughness:1, setColor:'B' }` |
| Blood Moon | `globalTypeEffect: { filter:'nonBasicLand', setSubtypes:['Mountain'] }` -- `landTypeOverride` neuters mana/abilities |
| Evil Presence | `effect:'enchantLand', mod:{ layerDef:{ layer:4, setSubtypes:['Swamp'] } }` -- existing aura machinery, no new mechanism |

Cyclopean Tomb (`cards.js`, still `effect:"STUB"`) shares this Layer-4
machinery (mire-counter Swamp conversion) but was not implemented here --
counter tracking and delayed upkeep triggers make it a separate, more complex
card. Its type-change dependency is now unblocked for a future prompt.

No other `DEFERRED:` card in `cards.js` was blocked solely by this gap --
Living Lands/Kormus Bell/Blood Moon/Evil Presence were the only four.

### Tests

- Vitest: `tests/scenarios/type-eff-baking.test.js` (baking/stripping
  mechanics, regression guards, mid-combat revert in isolation),
  `tests/scenarios/type-change-cards.test.js` (per-card coverage, including a
  full CAST_SPELL-driven mid-combat revert scenario).
- Playwright: `tests/e2e/deferral-sweep-2-typechange.spec.ts`, added to the
  `mobile-chrome` project's `testMatch` allowlist.

### Status
ACTIVE

---

## Bug Fix: Pestilence Sacrifice Condition (2026-07-02)

Pestilence's end-step check (`DuelCore.js`, `PHASE.CLEANUP` handling) was
gated on "its controller has no black creatures" instead of the oracle
condition: "if no creatures are on the battlefield, sacrifice Pestilence."

**Fix:** the check now evaluates `[...ns.p.bf, ...ns.o.bf].some(isCre)` once
per end step (matching the simultaneous intervening-if timing) and, if false,
sacrifices every Pestilence on either battlefield via a direct `zMove` to its
controller's graveyard -- color is irrelevant, and the block no longer treats
the effect as a destroy (log wording changed to "sacrificed").

Timing location in the CLEANUP sequence is unchanged.

### Tests
- Vitest: `tests/scenarios/pestilence-sacrifice.test.js` (PEST-01 through
  PEST-04: opponent non-black creature present, zero creatures anywhere,
  controller has a black creature (regression guard), two Pestilences
  sacrificed simultaneously).
- Playwright: `tests/e2e/pestilence-sacrifice.spec.ts` (E2E-PEST-01), desktop
  and mobile viewports.

### Status
ACTIVE

## Feature: The Rack Upkeep Trigger (2026-07-02)

`the_rack` in `cards.js` was previously `effect:"STUB"` with no upkeep
trigger anywhere in `src/engine/` -- it did nothing when cast. Implemented
as a real `upkeep:"rackUpkeep"` case in the per-card `c.upkeep` switch in
`DuelCore.js` (`PHASE.UPKEEP` handling), following the same static-field
pattern as Black Vise/Karma (no `effect` field needed; `upkeep` alone
carries through to the battlefield permanent via the ETB spread).

**SIMPLIFICATION:** oracle text is "As this artifact enters, choose an
opponent." This engine's 2-player duel has only one possible choice, so
"chosen player" is hardcoded as "opponent of controller" -- same
simplification already used for Black Vise. Both the Rack and Black Vise
need the same active-player guard (`ns.active !== rackOpp` / `ns.active !==
opp2`) and bail otherwise, since the chosen player and the card's
controller are never the same player and neither trigger may fire on the
controller's own upkeep. See "Bug Fix: Black Vise Upkeep Guard" below --
Black Vise originally shipped without this guard.

Damage is `max(0, 3 - handSize)`, computed against the opponent's hand size
at trigger resolution; zero or negative X deals no damage and logs nothing
(matching Black Vise's convention, not Power Surge's zero-damage log).
Multiple Racks trigger independently since each is a separate battlefield
permanent hit by the same loop.

### Tests
- Vitest: `tests/scenarios/the-rack-upkeep.test.js` (RACK-01 through
  RACK-04: opponent's upkeep damage, controller's-own-upkeep no-damage
  regression guard, 3+ hand size no-damage, two Racks triggering
  independently).
- Playwright: `tests/e2e/the-rack-upkeep.spec.ts` (E2E-RACK-01), desktop and
  mobile viewports.

### Status
ACTIVE

---

## Feature: Complete Ante System (2026-07-03)

The ante mechanic already had partial scaffolding (`anteEnabled`/`anteP`/`anteO`
in `DuelCore.js` and `useOverworldController.js`), but nothing in the UI ever
called `setAnteEnabled` -- the feature was fully unreachable. This batch wires
it up end-to-end and adds the seven Magic ante cards.

**Bug fix (in scope because it breaks this feature):** `buildDuelState` set
`anteP`/`anteO` but never removed the anted card from the library --
it stayed fully drawable/playable for the whole duel while also being staked.
Now spliced out of `pd`/`od` immediately after being set.

**Generalized ante zone:** added `anteExtraP`/`anteExtraO` arrays for mid-game
ante additions (Contract from Below, Demonic Attorney, Rebirth, Jeweled Bird)
alongside the existing `anteP`/`anteO` scalars. `handleDuelEnd` reconciliation
sweeps both together per side, winner-takes-the-whole-ante-zone.

**New-game toggle:** `TitleScreen` (`src/ui/layout/GameWrapper.jsx`) gained an
ante on/off control (`data-testid="ante-toggle"`, defaults off) threaded
through `onStart({ ..., anteEnabled })` -> `startConfig` -> `useOverworldController`.

**Ante-only exclusion:** all seven cards carry `anteOnly: true` in `cards.js`.
`generateStartingDeck` (`src/data/difficulties.js`) takes an `anteEnabled`
param and filters `c.anteOnly` cards out of both pool-construction sites
when ante is off.

**Ownership exchanges:** new `ownershipChanges: []` duel-state array for Bronze
Tablet / Tempest Efreet, which exchange ownership unconditionally (not
contingent on duel outcome). `handleDuelEnd` sweeps this array outside the
win/loss branch used for ante reconciliation.

**Cards implemented:** Contract from Below (`contractFromBelow`), Demonic
Attorney (`demonicAttorney`), Jeweled Bird (`jeweledBirdAnte`), Rebirth
(`rebirthAnte`), Bronze Tablet (`bronzeTabletExchange`), Tempest Efreet
(`tempestEfreetExchange`). Rebirth/Bronze Tablet/Tempest Efreet each carry a
SIMPLIFICATION: their real "may pay"/"may ante" per-player choices auto-resolve
via a heuristic (matches the existing "no UI to decline" convention used for
Brainwash/Hasran Ogress) rather than adding new choice-modal infrastructure for
a niche legacy mechanic.

**Deferred:** Darkpact -- confirmed via oracle text that it changes true
ownership (not just zone membership) of a targeted ante-zone card, but
targeting "a card in the ante" is a target domain the existing `castFlow`
targeting UI has no concept of (battlefield permanents, players, stack items
only).

See `docs/SYSTEMS.md` Section 26 for the full mechanical spec.

### Tests
- Vitest: `tests/scenarios/ante-zone-setup.test.js`, `ante-toggle-exclusion.test.js`,
  `ownership-exchange.test.js`, `ante-cards.test.js`.
- Playwright: `tests/e2e/ante-system-complete.spec.ts` (desktop + mobile-chrome).

### Status
ACTIVE

---

## Bug Fix: Black Vise Upkeep Guard (BLACKVISE-GUARD-1) -- 2026-07-03

**Problem:** The `blackVise` upkeep case in `DuelCore.js` was missing the
active-player guard that `rackUpkeep` already had, so it fired on every
`PHASE.UPKEEP` transition -- both the chosen player's upkeep and the
controller's own -- instead of only "the chosen player's upkeep" per oracle
text. In practice this meant the chosen opponent could take Black Vise
damage twice per turn cycle (once on their own upkeep, once again when the
transition into the controller's upkeep re-ran the same unconditional
case).

**Fix:** Added `if (ns.active !== opp2) break;` to the `blackVise` case in
`DuelCore.js`, mirroring the existing `rackUpkeep` guard. Also corrected the
`rackUpkeep` case's comment, which incorrectly claimed Black Vise needed no
guard -- both cards need it for the same reason (chosen player and
controller are never the same player).

**Files changed:**
- `src/engine/DuelCore.js` -- `blackVise` case guard; `rackUpkeep` comment fix.

**Tests:**
- Vitest: `tests/scenarios/black-vise-upkeep.test.js` (BV-01 through BV-04:
  chosen player's upkeep damage, controller's-own-upkeep no-damage
  regression guard within the same turn cycle, 4-or-fewer-cards no-damage,
  rackUpkeep regression guard).

### Status
ACTIVE

---

## Bug Fix: AI Priority Pass-Through Stall (AI-PRIORITY-PASS-1) -- 2026-07-03

**Problem:** The "AI priority window effect" in `useDuelController.ts` had
no fallback dispatch when `aiDecide()` returned `null` or `[]`. `usePhaseAdvance.ts`
correctly opens a priority window whenever a non-mana activated-ability
permanent (e.g. Pestilence) is on either battlefield, but if the AI had
nothing worth doing in that window, 'o' never explicitly passed priority.
`PASS_PRIORITY` requires both players to pass before the window closes, so
the window -- and both manual play and the End Turn skip-loop -- could hang
indefinitely.

**Fix:** Added an `else` branch to the effect's `aiDecide()` result handling
in `useDuelController.ts` that dispatches `PASS_PRIORITY` for `'o'` when
`acts` is falsy or empty, matching the existing illegal-mulligan-action
fallback path immediately above it.

**Files changed:**
- `src/hooks/useDuelController.ts` -- `else` branch added to the AI priority
  window effect.

**Tests:**
- Vitest: `tests/scenarios/ai-priority-passthrough.test.js` (AI-PRIORITY-01
  through AI-PRIORITY-06: decision-logic mirror for empty/null/real/illegal
  `aiDecide()` results, plus DuelCore-level confirmation that a second
  `PASS_PRIORITY` dispatch actually closes the window).
- Playwright: `tests/e2e/end-turn-with-activated-permanent.spec.ts`
  (END-TURN-PERM-01, desktop + mobile-chrome) -- reproduces the stall with
  Pestilence in play and a one-shot `aiDecide()` route-patch forcing the `[]`
  return, since the real phase planners in `AI.js` each append their own
  explicit pass fallback and don't naturally return empty in ordinary play.

### Status
ACTIVE

---

# End of MECHANICS INDEX v1.7
