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
Used by `FieldCard` (desktop and mobile) as a fallback for callers that don't supply state.

Since 2026-07-09, when `state` is supplied, `FieldCard` uses the full-state `getPow(c, state)` /
`getTou(c, state)` instead, fixing the Layer 7c lord/anthem effect display gap (e.g., Goblin King
anthem now correctly displays +1/+1 on goblin creatures). This carries Layers 7a-7c CDA effects
plus animated-land P/T without regressing the no-state approximation for legacy callers. Still
true: Plague Rats/Sorceress Queen/animated-land Layer 7a/7b effects inherit the old no-state gap.

For combat/SBE accuracy, always use `getPow(c, state)` / `getTou(c, state)` with state.

### Implementation
```
src/engine/DuelCore.js        -- getDisplayPT() export; getPow()/getTou() with state
src/ui/Card/FieldCard.tsx     -- desktop creature P/T badge; uses state when supplied
src/ui/Mobile/FieldCard.tsx   -- mobile creature P/T badge; uses state when supplied
src/ui/Battlefield/*.tsx      -- threads state down through Battlefield → Half → FieldCard
src/DuelScreen.tsx            -- passes duel state to Battlefield
src/ui/Mobile/DuelScreenMobile.tsx -- passes state to 4 FieldCard sites
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
- Playwright: `e2e/batch1a-desert-landwalk.spec.ts` (1A-1C: desert/desertwalk; 1D-1F: dual lands/mountainwalk display + blocking; both desktop 1280x800 and mobile 390x844)
- Vitest: `tests/scenarios/dual-land-mountainwalk.test.js` (dual land subtype data + Goblin King mountainwalk blocking with/without Badlands)
- Vitest: `tests/scenarios/life-floor.test.js` (LF-01 through LF-08; getLifeFloor and hurt() floor behaviour)
- Playwright: `tests/e2e/ali-from-cairo-life-floor.spec.ts` (ALI-01, ALI-02; both desktop 1280x800 and mobile 390x844)
- Vitest: `tests/scenarios/combat-damage.test.js` (4j-4k: first-strike log gating when no combatant has first strike)

### Status
IMPLEMENTED

---

## Bugfix: Dual Land Subtypes + First-Strike Log Gating + FieldCard P/T Display (2026-07-09)

### Summary
Three fixes from a single bug report (Goblin King + Goblin Hero vs. Badlands):

1. **Dual land subtypes** (data fix): Added `subtype` field to all 9 ABUR dual lands missing it
   (Tundra, Underground Sea, Badlands, Taiga, Savannah, Scrubland, Bayou, Plateau, Tropical Island).
   Volcanic Island already had the correct `subtype:"Island Mountain"`. Fixes landwalk abilities
   (mountainwalk, islandwalk, swampwalk, forestwalk, plainswalk) silently never triggering.

2. **First-strike log gating** (engine fix): `resolveCombat()` in `DuelCore.js` now only logs
   "First strike damage." when at least one combatant (attacker or blocker) actually has
   FIRST_STRIKE. The pass itself was already correctly gated per-creature; this stops misleading
   log entries when no first-strike creatures are in the combat.

3. **FieldCard P/T display fix** (UI fix): Desktop and mobile `FieldCard` components now accept
   an optional `state` prop. When supplied, they use `getPow(card, state)` / `getTou(card, state)`
   instead of the no-state `getDisplayPT()` approximation, fixing the Layer 7c lord/anthem effect
   display gap (e.g., Goblin King anthem now correctly shows +1/+1 on battlefield tiles). Falls
   back to `getDisplayPT()` when state isn't supplied for backward compatibility.

### Modified files
- `src/data/cards.js` — added `subtype` to 9 dual lands
- `src/engine/DuelCore.js` — gated first-strike log line
- `src/ui/Card/FieldCard.tsx` — added `state` prop, uses `getPow`/`getTou` when state supplied
- `src/ui/Mobile/FieldCard.tsx` — same as desktop
- `src/ui/Battlefield/Battlefield.tsx` — threads state to Half
- `src/ui/Battlefield/Half.tsx` — threads state to FieldCard
- `src/DuelScreen.tsx` — passes `state` to Battlefield
- `src/ui/Mobile/DuelScreenMobile.tsx` — passes `state` to 4 FieldCard call sites

### Tests
- Vitest: `tests/scenarios/dual-land-mountainwalk.test.js` (dual land subtype data + Goblin King mountainwalk blocking)
- Vitest: `tests/scenarios/combat-damage.test.js` (4j-4k: first-strike log gating)
- Playwright: `e2e/batch1a-desert-landwalk.spec.ts` (1D-1F: Goblin King anthem P/T display + mountainwalk blocking; desktop + mobile)
- Playwright: `e2e/first-strike-combat.spec.ts` (FS-E2E-02 enhanced: asserts no first-strike log when nobody has it)

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

**Effect:** `copyPermanentCharacteristics` (Layer 1 -- copiable-values snapshot, now a thin wrapper around the generalized `applyPermanentCopy` helper)

**Handler:** `resolveEff` case `"copyPermanentCharacteristics"` in `DuelCore.js`. Calls `applyPermanentCopy(ns, card.iid, tgtC, { typeSuffix: 'Enchantment' })`, which looks up the target artifact's static definition via `CARD_DB.find(c => c.id === tgtC.id)` and returns printed values only (no counters, no enchantments, no eotBuffs). The case builds the entering permanent from those values plus entering-battlefield defaults and pushes it directly onto caster's bf; `RESOLVE_STACK`'s `alreadyOnBf` guard skips the normal ETB push so the original card object is never double-added. Fizzles (inert enchantment) when no legal artifact target exists. Throws if the target artifact has no CARD_DB entry. Behavior is unchanged from before the generalization (see `tests/scenarios/copy-mechanism-generalized.test.js` regression coverage).

**cards.js entry:** `effect: "copyPermanentCharacteristics"`

### vesuvan_doppelganger

**Effect:** `vesuvanEtbCopy` (ETB) + `vesuvanRecopy` (recurring upkeep triggered effect) -- Layer 1 copy via `applyPermanentCopy`, generalized alongside Copy Artifact above.

**Handler:** `resolveEff` case `"vesuvanEtbCopy"` in `DuelCore.js` -- optional (`optionalTarget:true` in cards.js), any creature on the battlefield. Calls `applyPermanentCopy(ns, card.iid, tgtC, { colorOverride: VESUVAN_DOPPELGANGER_COLOR })` (always blue, its own printed color, verified against Scryfall) and attaches `VESUVAN_RECOPY_ABILITY` to the entering permanent's `triggeredAbilities`. Declining (no target) leaves a printed 0/0 Shapeshifter, which dies to `checkDeath`'s toughness<=0 state-based action check (not new logic). The recurring ability (`trigger:{event:'ON_UPKEEP_START',scope:'controller'}, requiresTarget:true, effect:{type:'vesuvanRecopy'}`) is the first triggered ability in this codebase to prompt for a fresh battlefield target at trigger-resolution time -- see `docs/SYSTEMS.md` "Triggered-ability targeting" for the full `ability.requiresTarget`/`pendingTriggerTarget`/`RESOLVE_TRIGGER_TARGET` mechanism this required in `DuelCore.js` and the `castFlow` kind:`'trigger'` extension in `useDuelController.ts`. On resolution, `applyPermanentCopy` finds the existing permanent already on the battlefield and merges the copied fields in place, so iid/counters/tapped/damage/`triggeredAbilities` (the ability itself) all survive the re-copy untouched.

**cards.js entry:** `effect: "vesuvanEtbCopy"`, `optionalTarget: true`

### primal_clay

**Effect:** `primalClayChoice` -- fixed three-mode ETB choice, NOT a copy effect (oracle text re-verified against Scryfall; Forge's script for this card reflects an older printing and was not used).

**Handler:** `resolveEff` case `"primalClayChoice"` calls `createPendingChoice` directly (kind: `'primalClayChoice'`), same direct-from-`resolveEff` convention as Alchor's Tomb's `colorChoiceTarget`. `RESOLVE_CHOICE`'s `'primalClayChoice'` branch sets power/toughness/keywords on the entering permanent per the chosen mode (3/3 vanilla, 2/2 flying, 1/6 Wall+defender) and, for the Wall mode only, appends `"Wall"` to `subtype` ("in addition to its other types").

**cards.js entry:** `effect: "primalClayChoice"`

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
represent one blocker blocking multiple attackers), **Reverse
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

## Feature: Generalized Choice Mechanisms (2026-07-05)

Three narrow, single-use-case choice mechanisms (`pendingChoice`, `TutorModal`'s
card-source, `pendingUpkeepChoice`) were each generalized minimally to unblock
four deferred cards. No fourth mechanism was introduced. See `docs/SYSTEMS.md`
Section 27 for the full mechanical spec.

**`pendingChoice` generalization + mobile parity fix:** `createPendingChoice()`
(`DuelCore.js`) is now the single place that sets `state.pendingChoice`, callable
directly from `resolveEff` (not only from `resolveTrigger()`'s `requiresChoice`
path). `RESOLVE_CHOICE` dispatches on a new `choice.kind` field
(`'triggered_ability_choice'` unchanged default, new `'colorChoice'` for
Alchor's Tomb). `ChoiceModal` was extracted from `DuelScreen.tsx` into
`src/ui/duel/ChoiceModal.tsx` and is now also rendered by
`DuelScreenMobile.tsx` -- it was previously desktop-only, a real parity bug
independent of this batch, confirmed live before this change.

**`pendingAnteExchange` (Darkpact):** reuses `TutorModal` for the picker
(`library={pendingAnteExchange.cards}`) but resolves via new
`RESOLVE_ANTE_EXCHANGE`/`DECLINE_ANTE_EXCHANGE` actions that swap the chosen
ante card with the top of the caster's library, rather than `CHOOSE_TUTOR`'s
move-to-hand semantics. Only the caster's own `anteP`/`anteExtraP` (or
`anteO`/`anteExtraO`) cards are legal targets.

**Upkeep-choice registry (Ashnod's Battle Gear / Tawnos's Weaponry):**
`pendingUpkeepChoice` is now backed by `UPKEEP_CHOICE_HANDLERS`
(handlerKey-keyed, mirrors `cardHandlers.js`'s `CARD_HANDLERS`) plus a
`pendingUpkeepChoiceQueue: []` for more than one choice queued in the same
untap step. Force of Nature (`forceOfNatureUpkeep`) is unchanged as the first
registry entry; `optionalUntap` is new. The UI mirrors this with
`UPKEEP_CHOICE_MODALS` (`src/ui/duel/upkeepChoiceRegistry.tsx`), replacing the
hardcoded `ForceOfNatureUpkeepModal` render with a lookup in both screens.
The two artifacts' "+X/+Y for as long as this artifact remains tapped" pump
(`pumpWhileTapped`) is stored on the source artifact and read by `layers.js`
as a Layer 7c effect gated on `src.tapped` -- no separate duration/expiry
tracking exists or is needed.

**Cards implemented:** Alchor's Tomb (`colorChoiceTarget`), Darkpact
(`darkpactExchange`), Ashnod's Battle Gear (`pumpWhileTapped`,
`pumpRequiresControl: true`), Tawnos's Weaponry (`pumpWhileTapped`, any
creature). All four were the last STUB entries deferred on choice/picker UI
gaps.

**Darkpact rules note:** "You own target card in the ante" was implemented as
a targeting restriction (only the caster's own ante contributions are legal
targets) rather than a separate ownership-changing effect, resolving an
apparent disagreement between Forge's ability name (`GainOwnership`) and a
literal reading of the Oracle text. Network access to verify against live
Scryfall rulings was unavailable in this environment; see the completion
summary for the full reasoning.

### Tests
- Vitest: `tests/scenarios/pending-choice-generalized.test.js`,
  `ante-exchange-darkpact.test.js`, `upkeep-choice-registry.test.js`,
  `alchors-tomb.test.js`.
- Playwright: `tests/e2e/generalized-choice-mechanisms.spec.ts` (desktop +
  mobile-chrome) -- exercises the ChoiceModal mobile-parity fix, the
  Darkpact ante-picker, and the Ashnod's Battle Gear untap-step choice
  through real button clicks on both viewports.

### Status
ACTIVE

---

## Batch: Complex-Tier C1 -- Activated Abilities and Spells (Forge Reference)

**Scope:** 13 of 25 targeted C1 stub cards implemented; 12 deferred.

**Cards implemented:** Alabaster Potion (`alabasterPotionChoice`), Sewers of
Estark (`sewersOfEstark`), Siren's Call (`sirensCall`), Tracker
(`trackerDamageExchange`), Winter Blast (`winterBlastTapX`), Banshee
(`bansheeDrain`), Eternal Flame (`eternalFlameDrain`), Martyr's Cry
(`martyrsCry`), Volcanic Eruption (`volcanicEruption`), Winds of Change
(`windsOfChange`), Mana Clash (`manaClash`), Mind Bomb (`mindBomb`),
Forcefield (`forcefieldShield`).

**Deferred (12):** Guardian Angel, Ring of Ma'rûf, Greater Realm of
Preservation, Circle of Protection (Artifacts/Black/Blue/Green/Red/White --
all 6), Pyramids, Eye for an Eye, Aladdin's Lamp. See completion summary for
per-card reasons; the common thread across 9 of the 12 is a real
infrastructure gap discovered during pre-flight: `damageShield` was written
by several existing cards but never consumed anywhere in `hurt()`.

**Real bug fixed (pre-existing, not new to this batch):** `hurt()` never
read `.damageShield` before this batch -- Conservator, Argivian Blacksmith,
and Rakalite (all pre-existing cards) had been setting a shield field that
did nothing. Fixed in `hurt()` (player-level flat shield + new
`combatDamageShield` identity-scoped variant for Forcefield) and via a new
`dmgWithShield()` helper used at all 4 creature-vs-creature combat damage
call sites in `resolveCombat()`. Both expire at end of turn (added to the
existing CLEANUP cleanup loop, which previously only cleared the
creature-level field, never the player-level one).

**New engine mechanisms:**
- `modalChoice` pendingChoice kind (`DuelCore.js` `RESOLVE_CHOICE`) --
  spell-level "choose one --" effects, re-enters `resolveEff()` directly
  (unlike the existing `triggered_ability_choice` default, which only
  reaches the narrower `resolveTriggeredEffect` vocabulary). Alabaster
  Potion is the first user.
- `numberChoice` pendingChoice kind + `NUMBER_CHOICE_HANDLERS` registry
  (mirrors `UPKEEP_CHOICE_HANDLERS`) -- "choose a number" effects, chainable
  across players via `nextPlayer`. Mind Bomb is the first user.
- `preventCombatDamageDealt` flag, checked at all 6 attacker/blocker combat
  damage-dealt sites in `resolveCombat()` (source-side, independent of the
  existing receiver-side Gaseous Form checks). Sewers of Estark.
- `pendingSirenSweep` -- one-shot end-of-turn sweep flag consumed in the
  existing CLEANUP block, reusing `turnState.attackedThisCombat`. Siren's
  Call.

**Not hard-enforced (documented simplification):** Siren's Call's "cast only
during an opponent's turn, before attackers are declared" timing restriction
-- no CAST_SPELL timing-gate mechanism exists yet in this engine.

### Tests
- Vitest: `tests/scenarios/complex-c1-activated.test.js` (14 cases).
- Full existing Vitest suite (445 tests) re-run clean after this sub-batch.
- Playwright: deferred to the consolidated `batch-complex-tier-general.spec.ts`
  at the end of the full C1-C4 batch (see completion summary).

### Status
ACTIVE

---

## Batch: Complex-Tier C2 -- Keyword-Line Cards (Forge Reference)

**Scope:** 2 of 2 targeted C2 stub cards implemented, no deferrals.

**Cards implemented:** Phyrexian Gremlins (`lockArtifactWhileTapped`), Wall of
Wonder (`wallOfWonderPump`).

**New engine mechanisms:**
- `optionalUntapAlways` -- generalizes the existing `optionalUntap`
  mechanism (previously artifact-only, gated on `whileTappedPump`) to
  creatures with no P/T-pump precondition. Phyrexian Gremlins.
- `lockedByIid` -- a locked permanent doesn't untap during its controller's
  untap step for as long as the locking creature (by iid) remains tapped,
  checked in the UNTAP-phase map alongside the existing Winter Orb/Smoke/
  Paralyze checks. Phyrexian Gremlins.
- `canAttackDespiteDefender` -- until-end-of-turn override checked in
  `DECLARE_ATTACKER` alongside the existing `KEYWORDS.DEFENDER` gate. Wall of
  Wonder.

### Tests
- Vitest: `tests/scenarios/complex-c2-keywords.test.js` (4 cases).
- Full existing Vitest suite (449 tests) re-run clean after this sub-batch.

### Status
ACTIVE

---

## Batch: Complex-Tier C3 -- Static/Continuous Effects (Forge Reference)

**Scope:** 7 of 7 targeted C3 stub cards implemented, no deferrals.

**Cards implemented:** Angry Mob (`angryMobPT` CDA), Rabid Wombat (aura-count
P/T bonus), Damping Field (`dampingFieldOut`/`artifactsUntapped`), Farmstead
(`farmsteadUpkeep`), Hidden Path (Hidden Path forestwalk grant), Phantasmal
Terrain (`phantasmalTerrainEnchant` + `basicLandTypeChoice`), Energy Flux
(`energyFluxUpkeep`).

**New engine mechanisms:**
- `angryMobPT` CDA evaluator (`layers.js`) -- the first turn-conditional CDA
  (`state.active !== card.controller` branch); all prior CDA evaluators were
  turn-blind.
- `artifactsUntapped` untap-phase counter, same idiom as the existing
  `landsUntapped` (Winter Orb)/`cresUntapped` (Smoke) counters. Damping Field.
- `farmsteadUpkeep`/`energyFluxUpkeep` UPKEEP_CHOICE_HANDLERS entries, plus a
  new pattern: checking an aura's *name* (Farmstead) or a global permanent's
  *name* (Energy Flux) inside the per-card upkeep loop, rather than gating on
  the affected card's own `card.upkeep` field -- needed because both cards
  grant an ability to a permanent that doesn't otherwise have one.
- `basicLandTypeChoice` pendingChoice kind -- same shape as the existing
  `colorChoice` (Alchor's Tomb) but for a 5-option basic-land-type pick,
  applied to an aura's `mod.layerDef` after the aura is already attached.
  Phantasmal Terrain.

**Note:** Energy Flux/Farmstead's opponent (AI) auto-decide branch is written
symmetrically to the existing Force of Nature convention, but that whole
convention has a latent (pre-existing, not introduced here) ordering issue:
`burnMana()` runs before the upkeep-effects loop on every phase transition,
so an AI-controlled player's mana pool is always 0 by the time any
"pay mana or sacrifice" upkeep check runs in the same transition. This
already affected Force of Nature and is not fixed here (out of scope --
logged per CLAUDE.md's protected-file observation rule). The player-facing
path (via `UPKEEP_CHOICE_HANDLERS`, where mana is tapped in response to the
prompt) is unaffected and fully functional.

### Tests
- Vitest: `tests/scenarios/complex-c3-statics.test.js` (10 cases).
- Full existing Vitest suite (459 tests) re-run clean after this sub-batch.

### Status
ACTIVE

---

## Batch: Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint A

**Scope:** 12 of 41 targeted C4 stub cards implemented in this checkpoint; 7
deferred so far (checkpointing every ~10-12 cards per the prompt).

**Cards implemented:** El-Hajjâj, Feedback, Island Sanctuary, Mold Demon, Wall
of Tombstones, Wanderlust, Warp Artifact, Ydwen Efreet, Abomination,
Cockatrice, Infernal Medusa, Time Elemental.

**Deferred (7):** Library of Leng, Psychic Venom, Artifact Possession,
Artifact Ward, Blight, Relic Bind, Oubliette. Psychic Venom/Artifact
Possession/Blight/Relic Bind share one root cause: an ON_TAP ("becomes
tapped") trigger event that doesn't exist in the confirmed vocabulary --
flagged per the prompt's ground rules rather than silently added. Oubliette
needs phasing (confirmed absent). Library of Leng and Artifact Ward would
each need a centralized choke point (discard call sites; target-validation)
that doesn't exist -- implementing only part of either would violate the
no-half-implementation rule.

**New engine mechanisms:**
- `endOfCombatDestroy`/`endOfCombatSacrifice` turnState arrays, generalizing
  the existing `venomTargets` idiom to a reusable "queue this iid for an
  effect at COMBAT_END" pattern. Unblocks Abomination/Infernal
  Medusa/Cockatrice (`blocksDestroyFilter`/`blockedByDestroyFilter` card
  fields, checked in `DECLARE_BLOCKER`) and Time Elemental
  (`sacrificeAtEndOfCombat`, checked in `DECLARE_ATTACKER`/`DECLARE_BLOCKER`).
- **Real bug fixed:** `PHASE.COMBAT_DAMAGE` handling never called
  `processTriggerQueue()` after `resolveCombat()`, so ON_DAMAGE_DEALT-based
  triggered abilities queued during combat were silently dropped -- El-Hajjâj
  is the first card to actually need this drained. Safe fix: no pre-existing
  `triggeredAbilities` entry keys off ON_DAMAGE_DEALT (Sengir Vampire's
  counter uses a separate hardcoded ON_CREATURE_DIES path).
- `selfIsDamageSource` condition -- `scope:'self'` can't be reused outside
  ON_CREATURE_DIES (it's derived from that event's `dyingCardId`
  specifically); any other self-scoped event type needs an explicit
  condition instead. El-Hajjâj.
- ON_DAMAGE_DEALT emission extended to the two unblocked-attacker `hurt()`
  call sites in `resolveCombat()` (previously only emitted for
  blocked-creature-vs-creature damage). El-Hajjâj, Merchant Ship (checkpoint B).
- `skipEtbPush` -- a permanent whose ETB effect sacrifices it immediately
  (Mold Demon) needs to suppress `RESOLVE_STACK`'s normal ETB push, which
  otherwise re-adds it (the existing `alreadyOnBf` guard can't distinguish
  "never placed" from "placed then removed").
- `coinFlipOnBlock` -- Ydwen Efreet is the first card needing a coin flip
  inside `DECLARE_BLOCKER` itself; follows the same already-flagged
  `Math.random()` idiom as Mana Clash (C1) pending a seeded-RNG migration.
- `islandSanctuaryProtected` -- draw-skip (auto-taken, documented
  simplification) sets a flag consumed by a new `DECLARE_ATTACKER` gate,
  cleared when the protected player's own turn comes back around.

### Tests
- Vitest: `tests/scenarios/complex-c4-triggers-a.test.js` (13 cases).
- Full existing Vitest suite (472 tests) re-run clean after this checkpoint.

### Status
ACTIVE (checkpoint A of C4 -- more checkpoints follow)

---

## Batch: Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint B

**Scope:** 11 more of 41 targeted C4 stub cards implemented (23/41 total so
far); 1 more deferred (8 total so far).

**Cards implemented:** Goblins of the Flarg, Cosmic Horror, Nafs Asp, Sunken
City, Drop of Honey, Erosion, Merchant Ship, Nether Shadow, Shapeshifter,
Island Fish Jasconius, Jihad.

**Deferred:** Personal Incarnation -- its `{0}` damage-redirect-to-owner
ability needs creature-damage redirection, which (like the C1 damageShield
gap) isn't centralized; creature damage is applied via ad hoc inline
mutation at combat sites and dozens of resolveEff cases. The companion
death-trigger clause is buildable via existing infra, but implementing only
that half would misrepresent the card's defining mechanic.

**New engine mechanisms:**
- Generalized the Pestilence "sacrifice when a battlefield-wide condition is
  true" idiom (checked at CLEANUP) to Drop of Honey, Goblins of the Flarg,
  Merchant Ship/Island Fish Jasconius (`sacrificeIfNoIslands`), and Jihad.
- `doesNotUntapNormally` -- a permanent that never untaps automatically
  during the untap-phase map, only via an explicit paid action. Island Fish
  Jasconius; reused later for Leviathan and Time Vault.
- **Real correctness fix mid-checkpoint:** the first draft of
  `cosmicHorrorUpkeep`/`sunkenCityUpkeep`/`payToUntapSelf` auto-decided the
  "pay or else" choice synchronously inline for both players, including the
  human. Since `burnMana()` runs at every phase boundary before any upkeep
  check, a human player's mana is always 0 at that exact instant -- this
  would have made these costs impossible to pay in a live game, not just in
  tests. Fixed to follow the established Farmstead/Energy Flux convention:
  auto-decide only for the AI opponent; queue via
  `UPKEEP_CHOICE_HANDLERS` for the human player, who taps mana in response
  to the prompt.
- Nether Shadow needed a graveyard-position scan (not the battlefield loop
  the rest of the upkeep switch uses) -- "cards above it" reads as "added to
  the graveyard after it" (higher array index, since new discards are
  pushed to the end).
- `numberChoice` extended with a second real user: Shapeshifter (ETB +
  optional upkeep re-prompt, human-only -- the AI keeps its current value
  rather than being re-prompted every turn).
- `jihadColorChoice` pendingChoice kind -- sets fields on the *source* card
  itself (unlike `colorChoice`, which recolors a separate target).

**Observed, not caused by this checkpoint:** `AI.sim.test.js`'s
"deterministic given the same initial state" test is empirically flaky
(~12% failure rate measured over 8 runs) on the pre-checkpoint-B baseline
(commit with checkpoint A only) -- root cause is the already-documented,
deliberately-accepted `Math.random()` coin-flip idiom (Mana Clash, Ydwen
Efreet) reachable in some AI simulation paths, not anything introduced in
this checkpoint. Confirmed via repeated runs on both the pre- and
post-checkpoint-B code; the flake rate is consistent across both. Seeding
the RNG is out of scope per the batch's ground rules.

### Tests
- Vitest: `tests/scenarios/complex-c4-triggers-b.test.js` (15 cases).
- Full existing Vitest suite (487 tests) re-run; 486 passed, 1 pre-existing
  flaky failure diagnosed above and confirmed unrelated to this checkpoint's
  changes.

### Status
ACTIVE (checkpoint B of C4 -- more checkpoints follow)

---

## Batch: Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint C (final)

**Scope:** Final 7 cards for this checkpoint; no additional deferrals (8
deferred total across C4's three checkpoints). Across the three checkpoints'
own "Cards implemented"/"Deferred" lists, C4 accounts for 30 implemented + 8
deferred = 38 cards by name; checkpoints A and B both cited "41 targeted C4
stub cards" as the sub-batch total, so 3 cards are unaccounted for between
that stated total and the itemized lists across all three checkpoint
entries. This discrepancy predates this checkpoint (present already after
checkpoint B) and is flagged in the final completion summary rather than
silently resolved here, since reconciling it needs the original C4 card
list from the task prompt, not something inferable from the docs alone.

**Cards implemented:** Time Vault, Goblin Artisans, Leviathan, Yawgmoth
Demon, Magnetic Mountain, Power Leak, Lich.

**New engine mechanisms:**
- Time Vault's turn-transition skip-turn check (added to the same block that
  already handles Island Sanctuary's protection-clear) -- "if you would
  begin your turn while this artifact is tapped, you may skip that turn
  instead. If you do, untap this artifact." Simplification: always skips
  (no decline UI), matching the convention already used for other such
  "may" replacement effects.
- Magnetic Mountain reuses the `doesNotUntapNormally`-adjacent untap-phase
  map (a new `magneticMountainOut && c.color === "U"` check) plus a new
  two-stage upkeep-choice flow (see correctness fix below).
- Lich required the most new `hurt()` surface of the batch: (a) "if you
  would gain life, draw that many cards instead" (early-return override),
  (b) "you don't lose the game for having 0 or less life" (gates the
  existing `nl <= 0` game-over check), (c) "whenever you're dealt damage,
  sacrifice that many nontoken permanents; if you can't, you lose the game"
  (gated on `!meta?.isLifeLoss` so Lich's own ETB life-loss doesn't
  self-trigger the sacrifice clause). Its own death trigger
  (`scope:'self'`, `ON_PERMANENT_LEAVES_BF`) reuses the `dyingCard`
  generalization added in checkpoint A, combined with a new
  `destinationIsGY` condition so bounce/exile don't also end the game.
- No new token tracking exists anywhere in this engine (every permanent is
  treated as nontoken), matching the pre-existing Beasts of Bogardan
  simplification in layers.js -- Lich's sacrifice clause follows the same
  convention rather than half-building token infrastructure for one card.

**Real correctness fix mid-checkpoint:** Magnetic Mountain and Power Leak's
first drafts computed their numberChoice option lists (affordability-gated)
*inline* at UPKEEP-transition time, the same instant `burnMana()` zeroes
both players' mana pools. That made the "may pay" numberChoice unreachable
for a human player in real gameplay, not just in tests -- structurally the
same bug already fixed for Cosmic Horror/Sunken City/Island Fish Jasconius
in checkpoint B, just re-introduced by two cards implemented before that
fix's lesson was applied consistently. Fixed the same way: queue a
`pendingUpkeepChoice` (`magneticMountainPrompt` / `powerLeakPrompt`) at
UPKEEP-transition time with no mana-affordability gate, then compute the
actual numberChoice (and its affordability-based option list) inside the
`UPKEEP_CHOICE_HANDLERS.resolve` step, a separate non-phase-transition
dispatch where any mana the player has tapped in response is still present.

**Known UI-wiring gap (flagged, not built):** Goblin Artisans' activated
ability targets a spell on the stack (an artifact spell you control), not a
permanent or player. The existing activated-ability targeting UI path
(`ACTIVATE_TARGET_EFFECTS`/`PLAYER_TARGETABLE_ABILITY_EFFECTS` in
`useDuelController.ts`) only supports permanent/player targets;
stack-item targeting UI (`needsStackTarget`) exists only for the
spell-casting flow (counterspells), not the activated-ability flow. Wiring
a new "activated ability targets the stack" interaction into both
`DuelScreen.tsx` and `DuelScreenMobile.tsx` is new cross-cutting UI
infrastructure beyond this checkpoint's scope -- the engine-side effect
(`coinFlipDrawOrCounterArtifact`) is fully implemented and covered by a
direct-dispatch Vitest scenario, but the card cannot yet be activated with
a target through the UI. This is consistent with the pre-existing gap
already present for several checkpoint B/C upkeep-choice handlers
(Farmstead, Erosion, Cosmic Horror, Sunken City, Island Fish Jasconius/
Leviathan's pay-to-untap, Yawgmoth Demon, and now Magnetic Mountain/Power
Leak): `UPKEEP_CHOICE_MODALS` in `src/ui/duel/upkeepChoiceRegistry.tsx`
only has entries for `forceOfNatureUpkeep` and `optionalUntap`, so these
handlerKeys currently render no prompt UI at all (the engine-side queue and
resolve logic is correct and tested via direct dispatch, but a human
player has no on-screen way to trigger `UPKEEP_CHOICE_RESOLVE` for them
yet). Flagging rather than building 9 new modals inside this batch.

### Tests
- Vitest: `tests/scenarios/complex-c4-triggers-c.test.js` (16 cases).
- Full existing Vitest suite (503 tests across `src/engine/__tests__` +
  `src/hooks/__tests__` + `tests/scenarios`) re-run; all 503 passed, no
  regressions.

### Status
COMPLETE (C4 finished: 30 implemented, 8 deferred across all 3 checkpoints;
C1-C4 combined status recorded in the batch completion summary)

---

## Batch: Token Creation Infrastructure + Poison Counters (2026-07-06)

New token-creation subsystem (`TOKEN_DB`, `makeTokenInstance`, `createToken`,
CR 111.7 cease-to-exist rule in `zMove`) plus a poison-counter win-condition
fix and `grantPoisonCounters` trigger effect. Six cards implemented across
both mechanisms. See `docs/SYSTEMS.md` Section 28 for the full mechanical
spec.

**Token infrastructure:** `TOKEN_DB` (`src/data/tokens.js`) is a separate
array from `CARD_DB` so token definitions never leak into deckbuilding/
binder/search UIs. `makeTokenInstance`/`createToken` (`DuelCore.js`) mirror
`makeCardInstance`, adding `isToken: true` and an optional `sourceIid` tag.
`zMove` -- already the single choke point for every bf -> gy/exile/hand/lib
move -- now skips the destination-zone append for `card.isToken` permanents
leaving the battlefield, covering death, bounce, exile, and sacrifice from
one call site. One pre-existing bypass (`ashesToAshes`'s manual `bf`/`exile`
splice) was converted to call `zMove` for the same correctness reason.

**Cards implemented:** The Hive (`createWaspToken`), Serpent Generator
(`createSerpentToken`, its Snake token also carries `grantPoisonCounters`),
Rukh Egg (delayed token creation via a new `state.pendingEndStepTokens: []`
array, drained in the existing `PHASE.END` one-off block), Tetravus
(`etbCounters`, two upkeep abilities via the existing
`UPKEEP_CHOICE_HANDLERS`/`NUMBER_CHOICE_HANDLERS` numberChoice pattern,
remembered-token tracking via `sourceIid`), Marsh Viper (`amount: 2`), Pit
Scorpion (`amount: 1`).

**Poison counters:** `checkWinConditions()`'s `poisonLimit` default was
`?? 5` -- a bug, since both real MTG rules and Marsh Viper/Pit Scorpion's own
oracle text say ten. Fixed to `?? 10`. New condition type
`selfIsDamageSourceToPlayer` (restricts an `ON_DAMAGE_DEALT` trigger to
player-targeted damage only) and new effect type `grantPoisonCounters`
(`{ amount }`) follow El-Hajjâj's existing `triggeredAbilities` declarative
shape -- no bespoke per-card dispatch.

**Tetravus's variable-count choice:** used the existing discrete
`kind: 'numberChoice'` pending-choice shape (0..max options), the same
pattern Magnetic Mountain/Power Leak/Shapeshifter already use, rather than a
new numeric-input modal type. Per the existing "AI never opts in" convention
for optional numberChoice abilities (Magnetic Mountain, Shapeshifter), an
opponent-controlled Tetravus never activates either upkeep ability.

**UI:** poison-counter display added independently to both `Banner.tsx`
(desktop, `src/ui/Battlefield/`) and `Banner.tsx` (mobile, `src/ui/Mobile/`)
-- confirmed these are two separate components, not shared -- each reusing
its own file's existing zone-stat idiom (`ZoneCount` / `ZoneChip`).

### Tests
- Vitest: `tests/scenarios/token-creation.test.js`,
  `the-hive-rukh-egg.test.js`, `tetravus.test.js`, `poison-counters.test.js`
  (29 new cases).
- Full existing Vitest suite (577 tests) re-run after the change; all 577
  passed, no regressions.
- Playwright: `tests/e2e/tokens-and-poison.spec.ts` (desktop + mobile-chrome,
  4 cases x 2 projects) -- The Hive token creation and poison-counter
  display verified on both `Banner` components independently.

### Status
COMPLETE

---

## Batch: Damage Shields + hurt() Source Metadata Retrofit (2026-07-06)

Retrofits `hurt()` source metadata across essentially every call site in
`DuelCore.js` (Deferral Sweep 1 left only 6 of ~118 tagged), and adds
`turnState.damageShields` -- a one-time, exact-identity prevention/redirect
shield backing the six Circles of Protection, Eye for an Eye, and Greater
Realm of Preservation. See `docs/SYSTEMS.md` Section 29 for the full spec.

**`hurt()` meta retrofit:** every call site with a source card object in
scope now passes `{ sourceIid, sourceType: inferSourceType(card) }` (new
helper, next to `isCre`/`isArt`/etc.). A few sites needed a small,
behavior-preserving restructure to get the object into scope at all (e.g.
Manabarbs/Lifeblood/Farmstead/Erosion/Power Leak's `bf.some(...)` ->
`bf.find(...)`), never changing which cards trigger. The generic
`ping`/`damage1`/`damage2` `srcMeta` local (previously artifact-only) is now
built from `inferSourceType(card)` unconditionally. Combat lifelink/spirit-link
life-gain calls also now carry their attacker's/blocker's meta, though this
has no behavioral effect today (only the `amt > 0` damage branch reads
`sourceType`). A handful of sites legitimately have no source card in scope
(mana burn, Nafs Asp's delayed draw-step drain, Castle Inferno, Channel) and
correctly keep `meta: null`.

**Damage shields:** one resolveEff case, `chooseDamageShieldSource`, backs
all eight cards -- `card.damageShieldColors`/`damageShieldTypes`/
`damageShieldMode` (set per-card in `cards.js`) parameterize a shared
`damageShieldMatches`/`buildDamageShieldPool` pair rather than eight
near-duplicate cases. The human player picks via the existing generalized
`TutorModal` (`pendingDamageShieldChoice`, same precedent as Darkpact's
`pendingAnteExchange`); the opponent auto-picks the first legal source
synchronously (no UI, matching the `sacArt`/`sacCre` auto-decide convention)
so no `pendingDamageShieldChoice` is ever left outstanding for `caster: 'o'`.
`hurt()`'s shield check runs before the pre-existing `combatDamageShield`/flat
`damageShield` checks and is a hard exact-`iid` match, not a color re-check.
Eye for an Eye's `mode: 'redirect'` re-enters `hurt()` with the shield already
consumed (so the primary damage's own meta-driven bookkeeping still fires),
then deals a second, independent instance of damage to the original source's
controller with `meta: null` -- a hard recursion guard, since a null meta can
never match any shield entry.

### Cards implemented (8)

| Card | Activation cost | Filter | Mode |
|---|---|---|---|
| Circle of Protection: Black/Blue/Green/Red/White | `{1}` | matching color | prevent |
| Circle of Protection: Artifacts | `{2}` | artifact type | prevent |
| Greater Realm of Preservation | `{1}{W}` | black or red | prevent |
| Eye for an Eye | -- (Instant, resolves directly) | any source | redirect |

### UI

`pendingDamageShieldChoice` rendering added to `DuelScreen.tsx` and
`DuelScreenMobile.tsx` (mirroring the `pendingAnteExchange`/`TutorModal`
block exactly); `RESOLVE_DAMAGE_SHIELD_CHOICE`/`DECLINE_DAMAGE_SHIELD_CHOICE`
are dispatched directly via each screen's existing raw `dispatch` (same
one-off-action pattern already used for `CITY_OF_BRASS_DAMAGE`), so no new
wrapper functions were added to `useDuel.js`. `useDuelController.ts`'s
auto-pass-priority/phase-advance gate gained `s.pendingDamageShieldChoice` in
its "any player-required choice pauses the loop" list (mirroring
`pendingAnteExchange`) -- without it, a stack that empties in the same
transition `pendingDamageShieldChoice` opens in would otherwise auto-advance
past the human's picker.

### Tests

- Vitest: `tests/scenarios/hurt-meta-retrofit.test.js` (spot-checks a
  representative sample of retrofitted call sites; regression checks proving
  Part 1 is behavior-invisible on its own), `tests/scenarios/damage-shields.test.js`
  (pool building, exact-identity matching, one-time consumption, CLEANUP
  expiry, redirect mode + its recursion guard), `tests/scenarios/circle-of-protection.test.js`
  (all six CoPs + Greater Realm, each read live from `CARD_DB` so the test
  exercises the card's own real cost/filter), `tests/scenarios/eye-for-an-eye.test.js`.
- Playwright: `tests/e2e/damage-shields.spec.ts`, tagged `@engine @mobile`,
  added to the `mobile-chrome` project's `testMatch` allowlist.

### Status
COMPLETE

---

## Batch 14: Quick-Win Stubs (2026-07-07)

Seven stub cards, each reusing existing engine patterns. Two touch shared
`DuelCore.js` functions (`hurt()`, `canBlockDuel()`) rather than only adding
new `switch`/`resolveEff` cases, and incidentally fix two silently-broken
existing cards along the way.

**New event: `ON_PLAYER_DAMAGED`** -- emitted once near the end of `hurt()`,
only when the final applied `amt > 0` (after all shields/redirects/floor
logic), payload `{ who, amount, sourceIid, sourceType }`. Distinct from the
pre-existing `ON_DAMAGE_DEALT` (emitted separately at specific combat call
sites) to avoid double-firing for combat damage to players -- verified by a
dedicated test proving the counter Living Artifact gains from an unblocked
attack equals the damage dealt exactly once, not twice.

**New counter types:** `VITALITY` (Living Artifact), `CARRION` (Osai
Vultures), `CORPSE` (Scavenging Ghoul) -- joining the existing `P1P1`/`M1M1`
keys in the same `counters` object shape.

**Block-restriction infrastructure:** `canBlockDuel()` gained a single check
covering three "can't be blocked by ..." shapes read from the attacker's
`card.mod`: `cantBlockedByPower` (power threshold), `cantBlockedByWalls`
(Wall subtype), and new `cantBlockedByColor` (color match). The first two
fields already existed on Amrou Kithkin and Bog Rats but were never read
anywhere -- both cards were silently non-functional until this batch; fixing
them was a necessary side effect of building the general check for Elder
Spawn, not separately scoped work.

### Cards implemented (7)

| Card | Mechanism |
|---|---|
| Living Artifact | `enchantArtifact` spell effect (Kudzu-style bf-standalone Aura, `enchantedArtifactIid`) + `ON_PLAYER_DAMAGED` triggered `addVitalityCounters` effect (`auraControllerWasDamaged` condition) + `livingArtifactUpkeep` upkeep case/handler (pay a `VITALITY` counter to gain 1 life) |
| Elder Spawn | `elderSpawnUpkeep` upkeep case/handler (sacrifice an Island or sacrifice self + take 6), mirrors `yawgmothDemonUpkeep`'s structure; `mod:{cantBlockedByColor:"R"}` |
| Osai Vultures | `addCarrionCounterIfDeath` triggered effect (ONE counter per end step regardless of death count, per ruling -- not Khabál Ghoul's per-death shape) + `osaiVulturesPump` activated ability (`counter2` cost, pre-flight-gated like `sacArt`/`sacCre`) |
| Scavenging Ghoul | `addCorpseCounterEqualToCreatureDeaths` triggered effect (per-death count, same shape as Khabál Ghoul) + `scavengingGhoulRegen` activated ability (`counter` cost, checked inline like Triskelion) |
| Sage of Lat-Nam | `drawCardSacArt` activated ability (`T,sacArt`), same shape as Priest of Yawgmoth's `addBBySacrificedCmc` minus the CMC scaling |
| Island of Wak-Wak | `setFlyingCreaturePower0EOT` activated ability, same shape as Singing Tree's `setAttackerPower0EOT` with a flying-check instead of an attacking-check; inherits the pre-existing `getDisplayPT()` UI-approximation gap (already true for Plague Rats/Sorceress Queen/Kormus-Bell-animated Swamps) |
| Urza's Avenger | `urzasAvengerChoice` reuses the generic `modalChoice` pendingChoice kind (Alabaster Potion); 4 options each re-enter `resolveEff` via their own effect id (`urzasAvengerBanding`/`Flying`/`FirstStrike`/`Trample`), applying a flat -1/-1 plus the chosen keyword. Banding itself remains an unenforced keyword (tracked as its own future batch) |

### Bug fixes (side effect of Elder Spawn's block-restriction work)

- Amrou Kithkin: `cantBlockedByPower` now actually enforced.
- Bog Rats: `cantBlockedByWalls` now actually enforced.

### Tests

- Vitest: `tests/scenarios/batch-14-quick-win-stubs.test.js` (all 7 cards,
  plus the Amrou Kithkin/Bog Rats bugfix regressions). Includes the two
  specifically-required cases: `ON_PLAYER_DAMAGED` fires exactly once for
  combat damage to a player, and Osai Vultures gets exactly 1 counter
  regardless of how many creatures died in a turn.
- Regression checkpoints (hand-picked, no regressions): `src/engine/__tests__/blocking.test.js`,
  `tests/scenarios/damage-source-meta.test.js`, `tests/scenarios/combat-damage.test.js`,
  `src/engine/__tests__/counter-targeting.test.js`, `tests/scenarios/poison-counters.test.js`.
- Playwright: dual-viewport (1280x800, 390x844), tagged `@engine`.

### Status
COMPLETE

---

## Banding Core Subsystem (CR 702.22), Phase 1 of 3 (2026-07-08)

Structural combat-engine addition, not a card batch -- phase 1 of 3 (phase 2:
AI band/choice heuristics; phase 3: Battering Ram, Mishra's War Machine,
Nalathni Dragon, Knights of Thorn unstub). Several non-stub cards already
carry the BANDING keyword (Mesa Pegasus, Benalish Hero, Pikemen, War
Elephant, Timber Wolves, Camel, Fortified Area's grant to Walls, Helm of
Chatzuk's temporary grant), so this batch makes that keyword actually affect
gameplay for the first time.

**New data model:** `bandId` field on attacking creatures, live-computed
against `s.attackers` rather than cached, per `docs/SYSTEMS.md` S5.4.

**New action:** `FORM_BAND` (CR 702.22c band formation, `docs/
ENGINE_CONTRACT_SPEC.md` 3.7).

**New propagation helpers:** `getBandMemberIds`/`getEffectiveBlockers` (CR
702.22h/i), replacing every existing "is this attacker blocked" check in
`resolveCombat`'s two damage passes plus the Forcefield `isUnblocked` check
and the Murk Dwellers unblocked check.

**New pendingChoice kinds:** `bandAttackerDamageOrder` (CR 702.22j, defending
player) and `bandBlockerDamageOrder` (CR 702.22k, active player), both gated
to 2+ candidates, both rendered through the pre-existing generic
`ChoiceModal` with no new choice-UI component. See `docs/
ENGINE_CONTRACT_SPEC.md` 7.3.

**New UI:** `BandFormationPanel` (`src/ui/Card/`, `src/ui/Mobile/`), gated to
render only when a declared attacker actually has banding.

### Explicitly out of scope (see docs/SYSTEMS.md S5.4)
- "Bands with other [quality]" (CR 702.22b/c) -- no card in this pool uses it.
- Banding satisfying a blocker's "must block a specific creature" restriction
  (same documentation convention as Brainwash's payment-UI simplification).
- `AI.js` untouched -- the AI never forms a band; both choices default to the
  pre-existing automatic order via `useDuelController.ts`'s existing generic
  AI pendingChoice fallback (no controller changes needed).

### Tests
- Vitest: `tests/scenarios/banding-core.test.js` (15 cases -- band formation
  validity, 702.22f/h/i propagation, 702.22j/k gating and division, 702.22e
  persistence). Regression checkpoints: `src/engine/__tests__/blocking.test.js`
  (3), `tests/scenarios/combat-damage.test.js` (9). 27 total, all passing.
- Playwright: `tests/e2e/banding-core.spec.ts`, dual-viewport (1280x800,
  390x844), tagged `@engine`. Covers the band-formation-panel-to-choice-modal
  flow and a zero-banding-creature regression (no new UI at all). Regression
  checkpoints: `tests/e2e/first-strike-combat.spec.ts`,
  `tests/e2e/combat-blockers-priority.spec.ts`.

### Status
COMPLETE (phase 1 of 3)

---

## Banding AI Heuristics (CR 702.22), Phase 2 of 3 (2026-07-08)

AI decision-making only -- no new player-facing UI, no card unstubbing
(phase 3: Battering Ram, Mishra's War Machine, Nalathni Dragon, Knights of
Thorn). Replaces phase 1's "AI never forms a band, both choices default to
`options[0]`" placeholder with real heuristics, all in `src/engine/AI.js`
(pure functions, no `GameState` mutation) plus a thin dispatch branch in
`src/hooks/useDuelController.ts`.

**Band formation (`planAttack`):** new `getBandFormationAction(state,
profile, attackerIds)`, called after `planAttack`'s existing attacker-set
logic decides `attackerIds`. Gated to `profile.aggression >= 0.8` (same tier
`planAttack` already uses for its MCR-evaluated risky-attack branch) --
below that, never forms a band. At or above it, builds the CR
702.22c-eligible set from the attacker set (all banding-keyword attackers if
2+, or the lone banding attacker paired with the highest-value non-banding
attacker if only one exists) and only forms the band if the lowest
`evaluateCreatureValue` score in that set is under 60% of the highest
(`BAND_VALUE_GAP_RATIO`) -- an evenly-matched pair gains nothing from
banding and eats the 702.22h downside (one block stops the whole group) for
free. Dispatches the existing `FORM_BAND` action; no new action type. `AITurnPlan`'s
`aiDecide()` compatibility adapter gained a `FORM_BAND` passthrough case
(it was already a raw DuelCore action, just needed a switch case so it
doesn't fall into the "unknown action type" warning).

**Both damage-division choices:** new exported `chooseBandingDamageOrder(choice,
state)` answers `bandAttackerDamageOrder` (CR 702.22j) and
`bandBlockerDamageOrder` (CR 702.22k) with the same rule -- picks the option
whose `order` array sorts ascending by `evaluateCreatureValue`, so the
lowest-value creature absorbs lethal damage first and higher-value creatures
are spared. Wired into `useDuelController.ts`'s existing `pendingChoice.controller
=== 'o'` branch as a new case ahead of the pre-existing `pay_gggg`-specific
logic (untouched, still the fallback for that unrelated choice kind).

**`planBlock` band-power awareness:** new `getBandRiskPower(att, state)` --
returns the combined `getPow()` of every live creature sharing `att.bandId`
(or just `att`'s own power if unbanded). The per-candidate block-risk
comparisons (`favorableTrade`/`survives`, both checking whether the
candidate blocker's toughness exceeds the damage it's about to take) now use
this instead of the attacker's own power, since CR 702.22h means blocking
one band member exposes the blocker to the whole band's damage. The
player-facing-damage checks (`preventLethal`, the chump-threshold
`preventDamage`) still use the attacker's own unmodified power -- an
unblocked band member still only deals its own damage to the player, band
membership doesn't change that. The aggregate lethal-check chump pass
(unrelated -- it sums each attacker's own power, which banding doesn't
change) is untouched.

### Tests
- Vitest: `src/engine/__tests__/AI.banding.test.js` (12 cases -- aggression
  and value-spread gating for band formation, the mixed banding/non-banding
  eligible-set case, both `chooseBandingDamageOrder` choice kinds, three
  `planBlock` band-power-awareness cases, and two no-banding-present control
  cases). Regression checkpoints: `src/engine/__tests__/AI.attack.test.js`
  (4), `src/engine/__tests__/AI.sim.test.js` (5),
  `src/hooks/__tests__/ai-driver-blockers-gating.test.ts` (3). 24 total, all
  passing.
- Playwright: `tests/e2e/ai-banding-smoke.spec.ts`, dual-viewport (1280x800,
  390x844), tagged `@engine`. Drives the AI through the real
  `useDuelController` loop (not a direct `AI.js`/`DuelCore` call), confirms
  it actually forms a band during `COMBAT_ATTACKERS` for a value-gap pair,
  then plays the duel to completion. Regression checkpoint:
  `tests/e2e/ai-creature-evaluation-smoke.spec.ts`. Both this spec and its
  checkpoint fail on an unrelated console-error assertion in this sandbox
  (outbound `fetch()` to `api.scryfall.com` from the browser page is blocked
  by the remote environment's network policy, not proxied) -- the
  band-formation assertion itself passes before that unrelated check runs;
  see the phase-2 completion summary for detail.

### Status
COMPLETE (phase 2 of 3)

---

## Banding Target Cards (CR 702.22), Phase 3 of 3 (2026-07-08)

Unstubs the 4 cards phases 1/2 left blocked: Battering Ram, Mishra's War
Machine, Nalathni Dragon, Knights of Thorn. Stub count 24 -> 20. See
`THIRD_PARTY_NOTICES.md` for attribution.

**Battering Ram** -- new `ON_COMBAT_BEGIN` event (`docs/ENGINE_CONTRACT_SPEC.md`
7.4), emitted once on the transition into `PHASE.COMBAT_BEGIN`, drives a new
`triggeredAbilities` entry (`trigger: {event:"ON_COMBAT_BEGIN",
scope:"controller"}`) whose `grantBandingUntilEndOfCombat` effect grants
banding as a new `scope: 'combat'` `eotBuffs` entry -- stripped at
`PHASE.COMBAT_END` (same loop that already processes
`turnState.endOfCombatDestroy`) rather than lingering to CLEANUP, matching
"until end of combat" exactly. Every other eotBuff in the pool is unscoped
and keeps its normal until-end-of-turn lifetime -- this option is additive,
not a behavior change. "Whenever this creature becomes blocked by a Wall,
destroy that Wall at end of combat" reuses the pre-existing
`blockedByDestroyFilter` mechanism (Abomination/Cockatrice/Infernal Medusa)
with a new `'wall'` filter value in `matchesDestroyFilter` -- no new destroy
pathway, just one more filter case on an existing one.

**Mishra's War Machine** -- direct structural copy of `yawgmothDemonUpkeep`
(both the `c.upkeep`-switch case and its `UPKEEP_CHOICE_HANDLERS` resolve
entry), substituting discard-a-card for sacrifice-an-artifact and 3 damage
for 2. The "no cards means the damage is unavoidable" ruling mirrors
Yawgmoth Demon's "no artifacts means the damage is unavoidable" branch
exactly (both fall through to the tap+damage branch when the resource to
give up doesn't exist).

**Nalathni Dragon** -- new `activated:{cost:"R",effect:"nalathniDragonPump"}`
ability, structurally identical to Shivan Dragon's `pumpPowerEOT` (+1/+0
until end of turn) plus a `turnState.activationCounts[iid]` increment (new
per-iid counter map, reset to `{}` at CLEANUP alongside `activatedOnceIids`).
A new `ON_END_STEP` triggered ability with an `activationCountAtLeast`
condition (new `evaluateCondition` case) and a `nalathniDragonSacrifice`
effect sacrifices it once the count reaches 4+, matching "sacrifice this
creature at the beginning of the next end step" (this engine has a single
END phase per turn, so "the next end step" is just this turn's, no
cross-turn scheduling needed). NOTE: Dragon Whelp has the identical printed
ability but its `cards.js` entry still routes through the generic
`pumpPower`/`pumpPowerEOT` effect with no activation counting -- a
pre-existing gap, logged as a comment at the new `nalathniDragonPump`/
`nalathniDragonSacrifice` cases in `DuelCore.js`, out of scope for this batch
(not one of its 4 named cards).

**Knights of Thorn** -- no new logic. `keywords:
[KEYWORDS.PROTECTION.id,KEYWORDS.BANDING.id]` was already correct; the only
change is adding the `protection:["red"]` data field (the field
`canBlockDuel`/`DECLARE_BLOCKER` actually read -- every other
protection-only creature in the pool, e.g. White Knight/Black Knight, has an
analogous field and no `effect` key at all). Fully carried by pre-existing
protection enforcement and the phase 1/2 banding subsystem.

### Tests
- Vitest: `tests/scenarios/banding-cards-batch.test.js` (15 cases --
  Battering Ram's begin-of-combat grant/scope-expiry/Wall-destroy-and-filter-
  selectivity, Mishra's War Machine's upkeep choice for both the human and
  AI-controlled path, Nalathni Dragon's activation counting and 4+
  sacrifice/survival, Knights of Thorn's protection-blocks-red plus a real
  `FORM_BAND` control case). Regression checkpoints:
  `tests/scenarios/banding-core.test.js` (15),
  `src/engine/__tests__/AI.banding.test.js` (12),
  `tests/scenarios/combat-damage.test.js` (9). 51 total, all passing.
- Playwright: `tests/e2e/banding-cards-batch.spec.ts`, dual-viewport
  (1280x800, 390x844), tagged `@engine`. BAND-CARDS-E2E-01 confirms the
  pre-existing `BandFormationPanel` reacts to Battering Ram's live banding
  grant (a real card, not a synthetic test creature) and that a blocking Wall
  is destroyed at `COMBAT_END`. BAND-CARDS-E2E-02 is a smoke test playing
  Mishra's War Machine and Nalathni Dragon (both AI-controlled, so Mishra's
  upkeep auto-resolves with no UI dependency) through a full AI-driven duel.
  BAND-CARDS-E2E-02 fails on the same unrelated console-error assertion as
  its `ai-banding-smoke.spec.ts` checkpoint in this sandbox (outbound
  `fetch()` to `api.scryfall.com` for card art is blocked by the remote
  environment's network policy, not proxied -- every failing console line is
  a `[scryfallArt] Fetch failed for "<card>"` or `net::ERR_TUNNEL_
  CONNECTION_FAILED`, spanning unrelated cards in the sandbox default
  decklist, not anything from this batch's card logic); the duel still
  terminates and the assertion that matters (`terminated === true`) is never
  reached only because the stricter, always-failing-in-this-sandbox
  assertion throws first. Regression checkpoints:
  `tests/e2e/banding-core.spec.ts` (passes),
  `tests/e2e/ai-banding-smoke.spec.ts` (same pre-existing sandbox-only
  failure).

### Status
COMPLETE (phase 3 of 3) -- Banding (CR 702.22) fully closed out.

---

## Bug Fix: Fatal AI Error Silent Hang (2026-07-09)

**Problem:** `useDuelController.ts` calls `aiDecide(s)` inside `setTimeout`
callbacks in two places -- the "AI priority window effect" and the AI
main-loop heuristic path -- with no try/catch anywhere in the file, and the
app has no ErrorBoundary anywhere. An uncaught throw in either dies silently:
no console banner most people would notice, no UI change, and whatever state
was mid-transition (`endTurnPending`, `priorityWindow`) simply never resolves.
This is the confirmed mechanism behind a reported bug: clicking "End Turn"
left the button stuck on "Ending Turn..." forever with no visible error, on
mobile. The exact trigger for the original report was not confirmed (no
console log was available at the time), so this is a hardening fix for the
symptom, not a fix for whatever specific `AI.js` edge case (if any) caused it.

**Fix:** Both call sites now wrap `aiDecide()` and the dispatch/apply calls
that follow it in a try/catch. On catch, `reportFatalAiError()` (new function
in `useDuelController.ts`) builds a bounded JSON context snapshot (turn,
phase, active player, priority state, hand/battlefield sizes, all
`pending*` flags), logs it to console, and sets a new `fatalError` hook state.
Both `DuelScreen.tsx` and `DuelScreenMobile.tsx` render a new
`EngineErrorOverlay` component (`src/ui/duel/EngineErrorOverlay.tsx`) when
`fatalError` is set: shows the message, a copyable debug dump, and an "Exit to
Overworld" button wired to the existing forfeit path (`handleDuelEndWithClear
('forfeit', s)`), so a crash no longer leaves the player with a frozen board
and no way out. All three affected effects (`endTurnPending` skip-loop, AI
priority window effect, AI main loop) also gained an `if (fatalError) return;`
guard so nothing keeps retrying once the overlay is up. A test-only
`window.__forceAiError` global (checked first in both try blocks, inert
unless explicitly set) allows deterministic Playwright coverage without
depending on a real `AI.js` edge case.

**Files changed:**
- `src/hooks/useDuelController.ts` -- `fatalError` state, `reportFatalAiError()`,
  try/catch around both `aiDecide()` call sites, `fatalError` guards added to
  the end-turn skip-loop, AI priority window, and AI main-loop effects.
- `src/ui/duel/EngineErrorOverlay.tsx` (new) -- shared blocking overlay.
- `src/DuelScreen.tsx` / `src/ui/Mobile/DuelScreenMobile.tsx` -- import and
  render `EngineErrorOverlay` when `fatalError` is set.

**Tests:**
- Vitest: `tests/scenarios/ai-fatal-error-handling.test.js` (FATAL-AI-01
  through FATAL-AI-06 -- mirrors both post-fix branches verbatim, throw and
  no-throw cases). Regression checkpoint:
  `tests/scenarios/ai-priority-passthrough.test.js` (AI-PRIORITY-01 through
  06, unchanged behavior when nothing throws).
- Playwright: `tests/e2e/engine-fatal-error-overlay.spec.ts` (ENGINE-ERR-01
  through 04, desktop + real mobile tree via `?duel=sandbox-mobile`) --
  forces the error via End Turn's skip-ahead loop and confirms the overlay
  appears instead of a permanent freeze, and that Exit to Overworld forfeits
  and navigates away. Regression checkpoint:
  `tests/e2e/end-turn-skip-ahead.spec.ts` (END-TURN-01 through 05, unchanged
  behavior when nothing throws).

### Status
ACTIVE (hardening confirmed via fault injection; original real-world trigger
for the reported freeze remains unconfirmed)

---

---

## Instant-Speed Damage Prevention (Guardian Angel) — 2026-07-10

**Cards:** Guardian Angel (W instant) — creates temporary instant-speed abilities.

**Mechanical summary (per SYSTEMS.md -- Section 16: Temporary Player Abilities):**
When Guardian Angel resolves, it creates a tempAbility (1994 fast-effect convention, not a stack-resolving ability) that grants the controller the ability to pay 1 generic and prevent 1 damage from any source to any target they control. This ability:
- Is only usable during moments when the player has priority (instant speed)
- Has no timer: persists until the game ends
- Can be activated multiple times (one at a time, each consuming 1 mana)
- Is cleared during cleanup (phase transition via ADVANCE_PHASE when phase is END)

Implementation notes (per CLAUDE.md S2 hierarchy):
1. **SYSTEMS.md truth:** Section 16 defines the mechanic as a tempAbility entry on `state.p.tempAbilities[]`, with no permanent object on the battlefield and no layer system involvement
2. **Design choice (from analysis phase):** Unlike Regeneration or Animate Dead (which are continuous abilities), Guardian Angel uses the 1994 "fast effect" model -- a player ability, not an object ability, so it bypasses the stack
3. **AI behavior:** `planGuardianAngelTempAbilities()` in AI.js evaluates board threat (incoming combat damage vs. player life) and activates conservatively for defensive profiles, proactively for aggressive profiles

**State shape:**
- `state.p.tempAbilities: Array<{ id: string, source: string, label: string, cost: string, kind: 'preventOne', targetPlayer?: string, targetIid?: null }>`
- Fields are read from activation to display and validate mana sufficiency

**Effect handlers:**
- `CAST_SPELL` (card effect: `guardianAngel`) → `resolveEff` case creates `tempAbilities` entry
- `ACTIVATE_TEMP_ABILITY` (new reducer) → verifies mana, deducts cost, applies `state.p.damageShield++` or `state.o.damageShield++`
- `CLEANUP` (phase END → nextPhase) → clears `state.p.tempAbilities[]` and `state.o.tempAbilities[]`

**UI components:**
- `src/ui/duel/TempAbilityBar.tsx` (new, desktop + mobile shared) — renders each temp ability as a button, checks mana sufficiency before dispatch
- Wired into `src/DuelScreen.tsx` (L1143) and `src/ui/Mobile/DuelScreenMobile.tsx` (L391) with guards `!isMobile` (desktop) or no guard (mobile)

**Tests:**
- Vitest: `tests/scenarios/guardian-angel.test.js` (GA-01 through GA-12, 12 cases total)
  - GA-01: spell resolution creates tempAbilities entry
  - GA-03: tempAbilities entry has correct fields (id, source, cost, label, kind)
  - GA-04: ACTIVATE_TEMP_ABILITY applies shield and spends mana
  - GA-05: refuses activation without sufficient mana
  - GA-09: CLEANUP clears tempAbilities
- Playwright: `tests/e2e/guardian-angel.spec.ts` (dual viewport, tagged `@engine @mobile`)
  - GA-UI-01: TempAbilityBar renders when tempAbilities exist (desktop)
  - GA-UI-02: TempAbilityBar renders when tempAbilities exist (mobile)

### Status
COMPLETE (cards → state → reducers → UI → AI → tests all wired)

---

## Draw Replacement with Charge Queue (Aladdin's Lamp) — 2026-07-10

**Cards:** Aladdin's Lamp (10 artifact) — draws with X-based charge queue; shows library cards and allows reordering.

**Mechanical summary (per SYSTEMS.md -- Section 14: Draw Replacement Core):**
Aladdin's Lamp activation (cost: X generic, tap) creates a charge entry `state.p.lampCharges: number[]` containing the X value. When the player would draw a card and `lampCharges` is non-empty, a draw is suspended: instead, a `pendingLampPicks` modal appears showing X cards from the top of the library. The player picks one card to draw; the chosen card is moved to the top of the library, and the remaining X-1 cards are shuffled to the bottom of the library (per oracle text and the `shuffle()` call in `LAMP_PICK`). After the pick, the charge is consumed and one more draw (if any are pending) is resolved.

Implementation notes:
1. **SYSTEMS.md truth:** Section 14 defines the mechanic — separate from normal draw, using a charge queue
2. **Design choice:** The charge is stored as a number (X value), not as a card object, since it represents a future decision point
3. **AI behavior:** `chooseLampPick()` in AI.js greedily picks the lowest-cost spell if any non-lands are shown, or the highest-cost land if all are lands

**State shape:**
- `state.p.lampCharges: number[]` — array of X values, LIFO queue (most recent charge first)
- `state.pendingLampPicks: Array<{ who: 'p'|'o', x: number, cardIids: string[], remainingDraws: number, followUps: any[] }>` — suspension state while player chooses

**Effect handlers:**
- `ACTIVATE_ABILITY` (card effect: `aladdinsLampCharge`) → pushes X to `lampCharges`
- `DRAW` (custom logic in DuelCore) → checks `lampCharges`, if non-empty, creates `pendingLampPicks` and suspends
- `LAMP_PICK` (new reducer) → finds chosen card, moves to top of library, consumes charge, resumes draw
- `ADVANCE_PHASE` (CLEANUP) → clears all remaining `lampCharges` (unused charges expire at end of turn)

**UI components:**
- `src/ui/duel/LampPickModal.tsx` (new, desktop + mobile shared) — grid layout of shown cards, mandatory selection
- Wired into both screens with guard `s.pendingLampPicks?.[0]?.who === 'p'`

**Tests:**
- Vitest: `tests/scenarios/aladdins-lamp.test.js` (AL-01 through AL-16, 16 cases total)
  - AL-01: activation with X pushes charge to queue
  - AL-02: X<1 charge fizzles (caught at pick time)
  - AL-03: draw suspends when charge present
  - AL-04: LAMP_PICK draws chosen card and reorders library
  - AL-14: CLEANUP clears unused charges
- Playwright: `tests/e2e/aladdins-lamp.spec.ts` (dual viewport, tagged `@engine @mobile`)
  - AL-UI-01: LampPickModal renders when pendingLampPicks present (desktop)
  - AL-UI-02: LampPickModal renders when pendingLampPicks present (mobile)
  - AL-UI-03: duel completes without lamp-related errors (smoke test)

### Status
COMPLETE (cards → state → reducers → UI → AI → tests all wired)

---

## Combat Pile Division (Raging River) — 2026-07-10

**Cards:** Raging River (R enchantment) — triggers when its controller attacks, divides non-flying defenders into piles, restricts block assignment by pile membership.

**Mechanical summary (per SYSTEMS.md -- Section 9: Combat Phases & Block Restriction):**
When the Raging River controller declares an attack, the OTHER player (the defender, whichever side that is) must divide their non-flying creatures into left and right piles. Simultaneously, the attacker's creatures must choose which pile (if any) can block them. A creature can only block an attacker if:
- The defender is in the same pile as the attacker's chosen pile, OR
- The creature is flying (ignores piles)

After piles are assigned, they are "remembered" in the `riverPile` and `riverSide` fields on creatures; at COMBAT_END, these fields are stripped and the state is reset.

Implementation notes:
1. **SYSTEMS.md truth:** Section 9 defines pile membership as a card field and block restriction logic
2. **Trigger mechanism:** `ON_ATTACKS_DECLARED` event fires when attackers are declared; the effect pops a `pendingRiverDivide` suspension
3. **Two-step UI:** First, defender divides non-flying creatures (RIVER_DIVIDE action). Second, attacker chooses which piles their creatures attack (RIVER_SIDES action, if attacker is player; AI chooses if attacker is opponent)
4. **AI behavior:** `chooseRiverDivide()` splits creatures by evaluation value for conservative profiles; `chooseRiverSides()` spreads attackers evenly, pushing flyers to one side for aggressive profiles

**State shape:**
- `state.pendingRiverDivide: { defender: 'p'|'o', nonFlyerIids: string[], attackingPlayer: 'p'|'o' }` — suspension during first phase
- `state.pendingRiverSides: { chooser: 'p'|'o', attackerIids: string[], sides: {} }` — suspension during second phase
- `state.turnState.riverAppliedThisCombat: boolean` — latch to prevent re-entry after first pile decision

**Effect handlers:**
- `ON_ATTACKS_DECLARED` trigger → fires `ragingRiverDivide` effect, creates `pendingRiverDivide` with non-flyer list
- `RIVER_DIVIDE` (new reducer) → stamps `riverPile` field on non-flyer creatures, creates `pendingRiverSides`, opens second modal
- `RIVER_SIDES` (new reducer) → stamps `riverSide` field on attacker creatures, sets latch, clears both pendings
- `canBlockDuel()` (existing function) → checks `riverPile` and `riverSide` fields; if both are set and don't match, blocks return false
- `COMBAT_END` (existing case) → strips `riverPile` and `riverSide` fields from all creatures, resets latch

**UI components:**
- `src/ui/Card/RiverDividePanel.tsx` (new, desktop) — left/right toggle buttons, running list display
- `src/ui/Card/RiverSidesPanel.tsx` (new, desktop) — per-attacker left/right toggle, centered layout
- `src/ui/Mobile/RiverDividePanel.tsx` (new, mobile) — same functionality, bottom sheet layout
- `src/ui/Mobile/RiverSidesPanel.tsx` (new, mobile) — same functionality, bottom sheet layout
- Wired into both screens with guards:
  - `!isMobile && s.pendingRiverDivide?.defender === 'p' && s.active === 'o'` (desktop divide — shown to the human only when the human is the defender; when the AI defends, useDuelController's timer-based effect auto-resolves via chooseRiverDivide with no panel)
  - `!isMobile && s.pendingRiverSides?.chooser === 'p' && s.active === 'p'` (desktop sides — unchanged, always correct)
  - No `!isMobile` guard on mobile versions (mobile screens always use mobile variants); mobile divide panel uses the same `defender === 'p'` condition as desktop

**Bug fix note (2026-07-XX):** the divide-panel guard originally checked `defender === 'o'`, which showed the panel during the AI's own auto-resolve window and never showed it when the human was actually the defender, deadlocking `ADVANCE_PHASE` whenever the AI attacked with Raging River. Corrected to `defender === 'p'`. Two additional engine bugs were found and fixed in the same pass: (1) the `ON_ATTACKS_DECLARED` trigger emission in `DuelCore.js` was missing the `activePlayer` payload key that Raging River's `scope:'controller'` trigger filter checks, so the trigger never fired in real gameplay at all, for either player; (2) `chooseRiverSides()` in `AI.js` read `state.p.bf` instead of `state.o.bf`, so whenever the AI was the Raging River attacker, its own `RIVER_SIDES` dispatch was always rejected as invalid, deadlocking `pendingRiverSides` indefinitely.

**Tests:**
- Vitest: `tests/scenarios/raging-river.test.js` (RR-01 through RR-20, 20 cases total)
  - RR-01: trigger populates pendingRiverDivide
  - RR-03: RIVER_DIVIDE stamps piles and opens pendingRiverSides
  - RR-06: RIVER_SIDES stamps sides and sets latch
  - RR-07: non-flyer in wrong pile cannot block
  - RR-08: matching pile can block
  - RR-14: zero non-flying defenders sides all attackers
  - RR-17: COMBAT_END strips riverSide/riverPile
- Playwright: `tests/e2e/raging-river.spec.ts` (dual viewport, tagged `@engine @mobile`)
  - RR-UI-01: RiverDividePanel renders when pendingRiverDivide set (desktop)
  - RR-UI-02: RiverSidesPanel renders when pendingRiverSides set (desktop)
  - RR-UI-03: panels render on mobile
  - RR-UI-04: duel completes without river-related errors (smoke test)

### Status
COMPLETE (cards → state → reducers → UI → AI → tests all wired)

---

## Emblem Infrastructure (state.p/o.emblems) — 2026-07-10

**Purpose:** shared mechanism for "this effect continues after its source leaves the battlefield" cards -- the source permanent is gone, but its static and/or triggered ability needs to keep functioning (Titania's Song's "until end of turn" tail; Cyclopean Tomb's "for the rest of the game" post-graveyard trigger). Reusable for any future card with the same shape.

**State shape:** `state.p.emblems` / `state.o.emblems`, each an array of:
```js
{
  id, source, name, controller, duration: 'endOfTurn' | 'permanent',
  globalTypeEffect: {...},        // optional, consumed by layers.js collectEffects
  triggeredAbilities: [...],      // optional, consumed by emitEvent
  // card-specific extra fields (mireLandIids, mireRemovedIids, etc.)
}
```
Read defensively (`state[who].emblems ?? []`) everywhere -- older in-flight state predates this field.

**Hooks into the existing pipeline (no new pipeline created):**
- `layers.js collectEffects` step 14b -- scans both players' emblems for a `globalTypeEffect` field, pushing the same Layer 4/6/7a effect shapes the battlefield-permanent case (step 14) pushes. Step 14 itself is untouched; step 14a is a new sibling block that adds the Layer 6 `wipeAbilities` / Layer 7a CDA pieces step 14 doesn't cover, for the on-battlefield case (needed by Titania's Song while it's still in play, not just after it leaves).
- `layers.js computeCharacteristics` Layer 6 fold -- a `wipeAbilities` effect flag clears `keywords`/`protection` at its own timestamp position in the existing sorted loop (correct CR 613 behavior for free, no special ordering logic).
- `DuelCore.js emitEvent` -- a sibling loop to the existing per-card `triggeredAbilities` scan, iterating `state[who].emblems`. Supports `scope:'controller'` and unscoped triggers (no `scope:'self'` case -- an emblem is never itself the direct object of the event the way a dying permanent is).
- `DuelCore.js resolveTrigger` -- `findEmblem(state, id)` extends the existing `sourceCard` lookup chain (`allBf.find` → `findLeftBattlefieldCard` → `findEmblem`) so an emblem's own trigger resolves with the emblem object as `sourceCard`.
- `DuelCore.js` CLEANUP (`PHASE.CLEANUP` block) -- `endOfTurn`-duration emblems are filtered out; `permanent`-duration emblems are untouched. Because removing an emblem is not a zone move (unlike a battlefield permanent leaving play via `zMove`, which always self-triggers `recomputeTypeEffects`), the CLEANUP sweep calls `recomputeTypeEffects` explicitly when any emblem actually expired, so a permanent whose creature-ness depended on that emblem reverts its baked `typeEff`/`isCre()` result immediately rather than staying stale until some unrelated zone move happens to refresh it.

**Effect-case conventions:** new trigger-effect cases created for an emblem's own `sourceCard` must read/write `state[controller].emblems`, never `state[controller].bf` -- an emblem is not a battlefield card and has no `iid`/`bf` membership.

**Tests:** `tests/scenarios/emblem-infrastructure.test.js` (EMB-01 through EMB-10) -- generic infra only, using synthetic emblem objects, not real card data. Card-specific coverage lives in the Titania's Song and Cyclopean Tomb test files below.

### Status
COMPLETE

---

## Titania's Song / Cyclopean Tomb — 2026-07-10

**Cards:** Titania's Song (G enchantment) -- "Each noncreature artifact loses all abilities and becomes an artifact creature with power and toughness each equal to its mana value. If this enchantment leaves the battlefield, this effect continues until end of turn." Cyclopean Tomb (colorless artifact) -- "{2}, {T}: Put a mire counter on target non-Swamp land. That land is a Swamp for as long as it has a mire counter on it. Activate only during your upkeep. When this artifact is put into a graveyard from the battlefield, at the beginning of each of your upkeeps for the rest of the game, remove all mire counters from a land that a mire counter was put onto with this artifact but that a mire counter has not been removed from with this artifact." Both use the emblem infrastructure above for their "outlives its source" clause. Adapted from Card-Forge/forge (t/titanias_song.txt, c/cyclopean_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.

**Titania's Song implementation:**
- `globalTypeEffect: { filter: 'nonCreatureArtifact', addTypes: ['Creature'], wipeAbilities: true, powerFn: 'manaValueCDA', toughnessFn: 'manaValueCDA' }`, same field/mechanism as Living Lands/Kormus Bell/Blood Moon (`effect:"globalTypeEffect"`, consumed by `layers.js` step 14 while on the battlefield, step 14a for the wipe/CDA pieces).
- `matchesGlobalTypeFilter` (layers.js) gained a `'nonCreatureArtifact'` branch, checked against `card.type` (base, never-mutated field) before the existing land-only early return -- stable even after Layer 4 has already added Creature to the same card in the same fold pass.
- `manaValueCDA` CDA evaluator added to `CDA_EVALUATORS`: `(card) => card.cmc ?? 0`.
- Its own `ON_PERMANENT_LEAVES_BF` self-scoped trigger (`titaniasSongPersist`) creates an `endOfTurn` emblem carrying the same `globalTypeEffect` object, so the effect keeps applying to every qualifying artifact via emblem infrastructure step 14b -- including artifacts that enter *after* Titania's Song already left, since the filter is evaluated fresh on every recompute rather than snapshotting which artifacts were present at the moment it left.

**Cyclopean Tomb implementation:**
- Activation reuses the existing `myUpkeepOnly` gate (`ACTIVATE_ABILITY`, the same mechanism Gate to Phyrexia / Life Chisel already use for "Activate only during your upkeep") rather than adding a new phase-restriction field -- no new engine mechanism needed.
- `cyclopeanTombMireCounter` (resolveEff): puts a `MIRE` counter on the target land (fizzles if the target isn't a land or already reads as Swamp-subtyped) and records the land's iid onto the Tomb's own `mireLandIids` list while it's still alive.
- `layers.js collectEffects` step 14c: a land with a `MIRE` counter gets `{layer:4, setSubtypes:['Swamp']}`, the same shape Evil Presence's Aura `mod.layerDef` already uses.
- **Not a "no mana ability" simplification:** unlike Evil Presence's own doc comment (which frames "enchanted land is a Swamp" as an engine simplification), Cyclopean Tomb's mired land folds into the exact same Layer 4 `setSubtypes` pipeline, so it also picks up `landTypeOverride` (`DuelCore.js` `computeCharacteristics` ~L404-409) and, with it, the intrinsic "T: Add B" mana ability via `LAND_TYPE_MANA` (`DuelCore.js` ~L829-830) -- consistent with real CR 305.6 (a land's type grants its intrinsic mana ability) and with how Evil Presence already behaves in this engine. See `docs/SYSTEMS.md` S18.9 and the code comment at the layers.js step 14c insertion.
- On leaving the battlefield to a graveyard (`ON_PERMANENT_LEAVES_BF` self-scoped, `condition:{type:'destinationIsGY'}` -- the existing condition Lich already uses for the identical "put into a graveyard from the battlefield" clause, not a new condition type), `createCyclopeanTombEmblem` snapshots `mireLandIids` onto a `permanent`-duration emblem with its own `ON_UPKEEP_START, scope:'controller'` triggered ability.
- `cyclopeanTombRemoveMire` (the emblem's own trigger effect): clears all `MIRE` counters from the next unprocessed land in `mireLandIids` per upkeep (searches both players' battlefields for the land, since Cyclopean Tomb can mire either player's land, not just its controller's own); becomes a harmless no-op once every land has been processed. The emblem itself is never removed by CLEANUP (`duration:'permanent'`).

**Tests:**
- Vitest: `tests/scenarios/titanias-song.test.js` (TS-01 through TS-10), `tests/scenarios/cyclopean-tomb.test.js` (CT-01 through CT-14).
- Playwright: `tests/e2e/titanias-song.spec.ts`, `tests/e2e/cyclopean-tomb.spec.ts` (dual viewport, `@engine`).

### Status
COMPLETE

---

## Tap Centralization Phase 1 + Relic Bind, Blight, Psychic Venom — 2026-07-10

**Infrastructure:** A single new choke point, `tapPermanent(state, who, iid)` (`DuelCore.js`, adjacent to `applyOvergrowthTap`), for every "a permanent becomes tapped" mutation (CR 701.21). No-ops if the permanent is already tapped or not found. Mutates `tapped:true`, then emits a new `ON_TAP` event (`{ cardId, controller }` payload) and immediately calls `processTriggerQueue` -- matching every other `emitEvent` call site in the file, since `emitEvent` alone only enqueues. All ~28 prior ad hoc `tapped: true` sites across `DuelCore.js` (mana abilities, targeted tap effects, multi-permanent tap effects, Regenerate, Paralyze, upkeep cost-or-punishment cards, the generic `ACTIVATE_ABILITY` tap-cost step, etc.) now route through this one function; the single remaining non-`tapPermanent` `tapped:true` site is the untap-step computation deciding whether a creature *stays* tapped, which is not a "becomes tapped" event. New `enchantedHostTapped` condition in `evaluateCondition`: restricts a Kudzu-style Aura's ON_TAP trigger to firing only when its own specific host (`enchantedArtifactIid`/`enchantedLandIid`) is the permanent that tapped. See `docs/ENGINE_CONTRACT_SPEC.md` S7.5.

**Deviation from spec worth flagging:** the three new cards' `triggeredAbilities` intentionally carry no `scope` key, unlike a literal reading of the originating prompt. This codebase's `scope: 'controller'` filter (`emitEvent`) checks `card.controller !== event.payload?.activePlayer` -- a key the `ON_TAP` payload does not carry (`{cardId, controller}` only), so `scope:'controller'` would have silently killed every one of these triggers. Living Artifact (the explicit template card for this shape) already omits `scope` entirely and relies purely on its own condition for host-specificity -- the same precedent applied here.

**Orphaned-Aura cleanup gap (found, not assumed):** there is no general SBA sweep that moves an orphaned Kudzu-style Aura (host permanent gone) to its owner's graveyard -- Kudzu and Living Artifact each already handle this reactively, once per upkeep, inside their own `upkeep` case (`kudzuUpkeep`/`livingArtifactUpkeep`). Blight/Psychic Venom/Relic Bind have no ongoing upkeep effect of their own, so two small new shared upkeep cases were added mirroring the exact same pattern: `kudzuStyleLandOrphanCheck` (Blight, Psychic Venom) and `kudzuStyleArtifactOrphanCheck` (Relic Bind) -- not a new mechanism, the same one Kudzu/Living Artifact already rely on.

**Blight** (`blight`, B enchantment Aura, `enchantLand`) -- "When enchanted land becomes tapped, destroy it." One-time trigger; `blightDestroyHost` zMoves the enchanted land to its controller's graveyard. Adapted from Card-Forge/forge (b/blight.txt), GPL-3.0.

**Psychic Venom** (`psychic_venom`, U enchantment Aura, `enchantLand`) -- "Whenever enchanted land becomes tapped, this Aura deals 2 damage to that land's controller." Repeatable; `psychicVenomDamage` routes through `hurt()`. Adapted from Card-Forge/forge (p/psychic_venom.txt), GPL-3.0.

**Relic Bind** (`relic_bind`, U enchantment Aura, `enchantArtifact`, `requiresTarget:'opponentArtifact'`) -- "Enchant artifact an opponent controls. Whenever enchanted artifact becomes tapped, choose one -- deal 1 damage to target player, or target player gains 1 life." No planeswalkers exist in this engine (scope-appropriate simplification of "or planeswalker"). Uses the existing `requiresChoice` triggered-ability infrastructure (`ability.effect.options`, resolved via `RESOLVE_CHOICE`'s default `'triggered_ability_choice'` path) for the modal, not the `modalChoice`/`resolveEff` mechanism (that path is for spells cast with a pre-selected target, e.g. Alabaster Potion, and does not apply to a triggered ability). **Simplification, found during implementation, not built around:** this engine's triggered-ability infrastructure has no "pick a mode, then pick a player target" flow (`requiresChoice` resolves a fixed options list immediately from the event payload; `requiresTarget` is a battlefield-*permanent* picker only, no modal first) -- building a parallel targeting mechanism for one card was out of scope, so "target player" follows the same 2-player convention already used by Jihad/The Rack/Black Vise (hardcoded relative-to-controller target instead of a live picker): the damage mode always targets the artifact's controller (necessarily Relic Bind's controller's opponent, since Relic Bind can only enchant an opponent's artifact), the lifegain mode always targets Relic Bind's own controller. Cast-time "an opponent controls" restriction added as a small `c.id === 'relic_bind'` gate in `CAST_SPELL`, following the same per-card-gate convention BEB/REB/Reset already use (no existing declarative "Aura host must be controlled by X" convention existed to reuse). **Known pre-existing UI gap, not introduced here:** `enchantArtifact` is not in `useDuelController.ts`'s `EXPLICIT_TARGET_EFFECTS` (protected file, out of scope) -- Living Artifact has the same gap already. Legality is still enforced at dispatch time regardless of whether a target-picker UI opens. Adapted from Card-Forge/forge (r/relic_bind.txt), GPL-3.0.

**Tests:**
- Vitest: `tests/scenarios/tap-centralization.test.js` (TAP-01 through TAP-14), `tests/scenarios/relic-bind-blight-psychic-venom.test.js` (BLIGHT-01..04, PV-01..04, RB-01..06, BOTH-01..02).
- Playwright: `tests/e2e/tap-triggered-auras.spec.ts` (dual viewport, `@engine`).

**Phase 2 (built, see below):** tracking for "an ability was activated without {T} in its cost," needed by Artifact Possession, Haunting Wind, and Powerleech.

### Status
COMPLETE

---

## Tap Centralization Phase 2 + Artifact Possession, Haunting Wind, Powerleech — 2026-07-10

**Infrastructure:** A new event, `ON_ABILITY_ACTIVATED_NO_TAP` (`{ cardId, controller }` payload, same shape as `ON_TAP`), emitted from two sites in `case "ACTIVATE_ABILITY"` (`DuelCore.js`): the `addMana` branch and the generic "1. Tap cost" step, both in their existing `else` arm of the `act.cost.includes("T")` check. Each emission pairs `emitEvent` with an immediate `processTriggerQueue`, matching `ON_TAP`'s convention. Deliberately NOT emitted from the `activatedAbilities`-array path (Mishra's Factory's `animateLand`, Desert's `desertPing`, Wormwood Treefolk's `grantWalkSelfDamage2`) -- none of those three cards are artifacts, so no card in this batch needs that coverage; a future card would need to add emission there explicitly. Two new `evaluateCondition` types: `affectedPermanentIsArtifact` (Haunting Wind) and `affectedPermanentIsOpponentArtifact` (Powerleech), both looking up the affected permanent live on the battlefield via `payload.controller`/`payload.cardId` rather than tracking a host reference, since these two cards are plain Enchantments (not Auras). Artifact Possession reuses Phase 1's `enchantedHostTapped` condition unchanged for its `ON_ABILITY_ACTIVATED_NO_TAP` trigger -- the payload shape is identical to `ON_TAP`'s. See `docs/ENGINE_CONTRACT_SPEC.md` S7.6.

**Pre-existing quirk noted, not fixed:** the `addMana` branch (emission site 1) hardcodes its effect to player `'p'` regardless of the actual activator (`who`) -- a pre-existing convention unrelated to this task (every real UI-driven activation is `'p'` by construction, since a human can only activate their own permanents). `ON_ABILITY_ACTIVATED_NO_TAP`'s emission there follows the same hardcoded-`'p'` convention rather than "fixing" it. The generic "1. Tap cost" step (site 2) is who-aware and unaffected.

**Artifact Possession** (`artifact_possession`, B enchantment Aura, `enchantArtifact`) -- "Enchant artifact. Whenever enchanted artifact becomes tapped or a player activates an ability of enchanted artifact without {T} in its activation cost, this Aura deals 2 damage to that artifact's controller." Two `triggeredAbilities` entries (`ON_TAP` and `ON_ABILITY_ACTIVATED_NO_TAP`), both gated by `enchantedHostTapped` and both resolving through the shared `artifactPossessionDamage` effect (routes through `hurt()`). Unlike Relic Bind, `enchantArtifact` here has no controller restriction (plain "Enchant artifact," any controller), so no `CAST_SPELL` targeting gate was needed. Carries `upkeep:"kudzuStyleArtifactOrphanCheck"` (reused from Phase 1/Relic Bind, same Kudzu-style host-tracking shape). Adapted from Card-Forge/forge (a/artifact_possession.txt), GPL-3.0.

**Haunting Wind** (`haunting_wind`, B plain Enchantment, no `effect`) -- "Whenever an artifact becomes tapped or a player activates an artifact's ability without {T} in its activation cost, this enchantment deals 1 damage to that artifact's controller." Not host-scoped (no Aura, no host to track) -- both `triggeredAbilities` entries gate on the new `affectedPermanentIsArtifact` condition and resolve through `hauntingWindDamage`. Fires for ANY artifact regardless of controller, including one controlled by Haunting Wind's own controller (unrestricted oracle wording, not opponent-only). Adapted from Card-Forge/forge (h/haunting_wind.txt), GPL-3.0.

**Powerleech** (`powerleech`, G plain Enchantment, no `effect`) -- "Whenever an artifact an opponent controls becomes tapped or an opponent activates an artifact's ability without {T} in its activation cost, you gain 1 life." Both `triggeredAbilities` entries gate on the new `affectedPermanentIsOpponentArtifact` condition (opponent-only, unlike Haunting Wind) and resolve through `powerleechLifeGain` (routes through `hurt()` with a negative amount, the same lifegain-via-`hurt()` convention Relic Bind's lifegain mode already established). Adapted from Card-Forge/forge (p/powerleech.txt), GPL-3.0.

**None of these six new `triggeredAbilities` entries carry a `scope` key**, following the Phase 1 convention (`scope:'controller'` checks `event.payload.activePlayer`, a key neither `ON_TAP` nor `ON_ABILITY_ACTIVATED_NO_TAP` carries) -- filtering happens entirely through `condition`.

**Tests:**
- Vitest: `tests/scenarios/artifact-possession-haunting-wind-powerleech.test.js` (AP-01..04, HW-01..04, PL-01..04, BOTH-01..08).
- Playwright: `tests/e2e/no-tap-activation-auras.spec.ts` (dual viewport, `@engine`).

**Tap centralization is now complete** -- Phase 1 (`ON_TAP`) and Phase 2 (`ON_ABILITY_ACTIVATED_NO_TAP`) have both shipped; no further phases remain open.

### Status
COMPLETE

---

## Discard Centralization Phase 1 — 2026-07-11

**Infrastructure:** A single new choke point, `discardCard(state, who, iid, opts)` (`DuelCore.js`, adjacent to `tapPermanent`), for every "a card moves from a player's hand to their graveyard as a discard" mutation. Mirrors the shipped `tapPermanent`/`ON_TAP` pattern directly: a `DISCARD_REPLACEMENTS` registry pass (keyed by permanent card id, `{matches, apply}` entry shape, Forge's CR 614.5 intercept-before-mutate model) runs first; if no entry intercepts, the mutation happens (filter hand by iid, append to gy), then a new `ON_DISCARD` event (`{ who, iid, cardId, cardName, cause, sourceName }` payload) is emitted and immediately followed by `processTriggerQueue`, matching every other `emitEvent` call site in the file. `opts.cause` is required (`'effect' | 'cost' | 'gameRule'`) and throws if missing/invalid -- a fail-fast programmer error, not a runtime no-op (the not-found-in-hand case IS a runtime no-op, matching `tapPermanent`'s not-found philosophy: `console.error` + return state unchanged). `discardCard` adds no dlog of its own; all 14 prior ad hoc hand-to-gy sites keep their existing site-specific dlog calls unchanged. `DISCARD_REPLACEMENTS` ships EMPTY this phase -- no production consumers; Library of Leng (Phase 2) will be the first. See `docs/ENGINE_CONTRACT_SPEC.md` S7.7.

**All 14 prior ad hoc hand-to-gy mutation sites in `DuelCore.js` now route through `discardCard`:** Bazaar of Baghdad's draw-followup (`bazaarDiscard3`, loops 3x), Jalum Tome's draw-then-discard followup (`discardLastDrawn`), Sindbad's reveal-and-discard-if-nonland followup (`revealDiscardIfNonland`), `discardX` (Mind Twist, loops X times), `discardOne` (Rag Man, Disrupting Scepter), `wheelOfFortune` (both players' full hands, looped per-card before the redraw), `balance`'s hand-equalization while-loop, `discardAllNonland` (Amnesia, decomposed from a single bulk-array mutation into a per-card loop preserving order and the existing summary dlog line), `contractFromBelow`'s full-hand discard, Mishra's War Machine upkeep (both the AI auto-discard branch and the human `pendingUpkeepChoice` DISCARD branch), Mind Bomb's `mindBombDiscard` number-choice handler (decomposed from a bulk-array mutation into a per-card loop, same summary-dlog-preserved shape as Amnesia), the CLEANUP hand-size while-loop (`cause:'gameRule'`, the only non-`'effect'` site besides the cost site below), and `discardLastDrawn` as an activation-cost payment step (Jandor's Ring, `cause:'cost'`). Two `case "timetwister"` sites and `cardHandlers.js`'s Timetwister rebuild were confirmed out of scope (shuffle, not discard) and left untouched, as was the London mulligan handler (cards go to library, not gy).

**No card behavior changes this phase.** Every migrated site was verified byte-identical: same zone results, same dlog text, same resolution order. `AI.js`/`MCTS.js` confirmed to contain zero hand-to-gy mutations (read-only per architecture, nothing to migrate there).

**Regression note:** `discardCard` now runs `processTriggerQueue` inside the CLEANUP handler's hand-size while-loop (previously a bare mutation with no event pipeline involved) -- every duel's end-of-turn path now includes an `emitEvent`/`processTriggerQueue` pair per discarded card. No shipped card listens to `ON_DISCARD` in this phase, so production emission is inert; cleanup's turnState resets, EOT buff expiry, and emblem expiry are unaffected and unreordered relative to the discard step.

**Tests:**
- Vitest: `tests/scenarios/discard-centralization.test.js` (DISC-01 through DISC-24).
- Playwright: `tests/e2e/discard-centralization.spec.ts` (dual viewport, `@engine`).

**Phase 2 (not built here):** Library of Leng as the first `DISCARD_REPLACEMENTS` consumer. **Phase 3 (not built here):** additional-cost cast-flow rollback.

### Status
COMPLETE

---

## Library of Leng Phase 2 — 2026-07-11

**Card:** "You have no maximum hand size. If an effect causes you to discard a card, discard it, but you may put it on top of your library instead of into your graveyard." (`library_of_leng`, unstubbed -- `effect:"STUB"` removed with no replacement `effect` key, following the pure-static-permanent convention already used by `winter_orb`: the card has no `resolveEff` case at all, both halves are consumed by id lookup instead.)

**No maximum hand size:** the CLEANUP hand-size while-loop in `DuelCore.js` now compares against `effectiveMax = ns[ac].bf.some(c => c.id === 'library_of_leng') ? Infinity : ns.ruleset.maxHandSize` (checked against only the active player's own battlefield, since a player only discards to hand size at their own cleanup) instead of `ns.ruleset.maxHandSize` directly. The single remaining `maxHandSize` gameplay consumer.

**First `DISCARD_REPLACEMENTS` consumer:** `DISCARD_REPLACEMENTS['library_of_leng']` matches any `cause:'effect'` discard from its controller's hand (the registry scan is already scoped to the discarding player's own battlefield by `discardCard`). Its `apply` performs the exact same hand-to-gy mutation and `ON_DISCARD` emission as `discardCard`'s own non-replaced path -- factored into a shared internal `performDiscardMutation(state, who, card, payload)` helper so the two paths can't drift -- then offers a `pendingChoice` (`kind:'discardToLibraryChoice'`) to lift the card from the graveyard to the top of the library. This is a documented graveyard-first/retroactive-lift simplification (Assumption A), not a suspended discard: suspending mid-effect would strand cards in a ghost state for effects like Wheel of Fortune that discard a whole hand in one loop before drawing 7. See `docs/ENGINE_CONTRACT_SPEC.md` S7.7.1 for the full contract (choice shape, `queuedIids` multi-card chaining, and the `console.error`-and-degrade collision path for the unreachable-today case of a second choice needing the slot).

**RESOLVE_CHOICE branch:** `choice.kind === 'discardToLibraryChoice'` sits among the direct (non-triggered-ability) kinds. `'library'` removes the card from gy and prepends it to `lib` (index 0 = top, confirmed against `drawD`'s `const [top, ...rest] = ns[who].lib` convention). `'graveyard'` is a no-op zone-wise. A missing card (moved out of gy by something else mid-chain) fizzles with a dlog line rather than throwing, and the chain still advances.

**AI policy:** `chooseDiscardToLibrary(choice, state)` in `AI.js`, same pure-function shape and file placement as `chooseBandingDamageOrder` -- looks up `choice.cardIid` in the AI's own graveyard, returns `'library'` for a nonland with cmc at most the AI's own land count, `'graveyard'` otherwise. Dispatched from `useDuelController.ts`'s existing `pendingChoice.controller === 'o'` branch, placed immediately after the banding-order dispatch and before the `pay_gggg`-specific logic and its blind `options[0]` fallback -- placing it after that fallback would have silently made the AI always choose graveyard.

**Stub count: 9 -> 8.**

**Tests:**
- Vitest: `tests/scenarios/library-of-leng.test.js` (LENG-01 through LENG-16).
- Playwright: `tests/e2e/library-of-leng.spec.ts` (dual viewport, `@engine`).

**Regression note:** the cleanup while-loop's condition changed for every duel (an `effectiveMax` computation replaces the direct `ns.ruleset.maxHandSize` comparison); LENG-03/LENG-04 guard that non-Leng cleanup discard is unaffected.

### Status
COMPLETE

---

## Additional Costs Infrastructure + Sacrifice — 2026-07-11

**Card:** "As an additional cost to cast this spell, sacrifice a creature. Add an amount of {B} equal to the sacrificed creature's mana value." (`sacrifice`, unstubbed -- `effect:"STUB"` replaced with `effect:"addManaFromSacrificedValue"` and a new `additionalCost:{type:"sacrificeCreature"}` field.)

**Infrastructure:** A new `additionalCost` cast-flow mode (`CastFlowMode` in `useDuelController.ts`), inserted into the sequence `xSelect -> targeting -> additionalCost -> mana -> dispatch`. A card carrying `additionalCost` can never take the existing "no target, already affordable -> instant cast" shortcut. `castFlow.additionalCostSelection` tracks the chosen creature's iid (client-side state, single selection, auto-advancing like `confirmCastTargets`). Zero-creature legality is gated at cast initiation (`beginCastFlow`: cast never opens) and re-checked at the `CAST_SPELL` reducer (defense in depth). Payment is atomic: `CAST_SPELL` moves the sacrificed creature `bf -> gy` via `zMove` in the same transaction as mana payment and the hand-to-stack move, before the stack item is pushed, and attaches `additionalCostPaid: { type, card }` (the full pre-sacrifice card) to that stack item. `additionalCostSnapshot` / `UNDO_ADDITIONAL_COST` mirror `manaTapSnapshot` / `UNDO_MANA_TAPS` structurally for `cancelCastFlow` rollback symmetry, though in practice the snapshot is created and cleared atomically within `CAST_SPELL` itself (sacrifice-target selection never touches engine state until the cast commits), so the real-flow rollback path is a defensive no-op today -- see `docs/ENGINE_CONTRACT_SPEC.md` S7.8 for the full contract, including the explicit callout that only `additionalCost.type === 'sacrificeCreature'` is implemented; any future `additionalCost` type needs its own deliberate gate.

**Resolution:** new `resolveEff` case `addManaFromSacrificedValue` adds `{B}` x `item.additionalCostPaid.card.cmc` to the caster's mana pool (mirrors Priest of Yawgmoth's existing `addBBySacrificedCmc` activated-ability case, a different, untouched mechanism). Floating mana added this way is subject to the engine's existing "mana burns at every phase boundary" rule if left unspent.

**UI:** both `DuelScreen.tsx` and `DuelScreenMobile.tsx` route battlefield clicks to a new `selectAdditionalCost(iid)` callback during `castFlow.mode === 'additionalCost'`, restricted to the caster's own creatures (tap state and summoning sickness don't matter for a sacrifice cost). Both `Banner.tsx` components (desktop and mobile) reuse the existing `'targeting'`-mode cast-prompt block for `'additionalCost'` (just a different label, no Confirm/Skip buttons render since selection auto-advances) rather than a new modal.

**Stub count: 8 -> 7.**

**Tests:**
- Vitest: `tests/scenarios/additional-cost-sacrifice.test.js` (SAC-01 through SAC-22).
- Playwright: `tests/e2e/additional-cost-sacrifice.spec.ts` (dual viewport, `@engine`).

**Regression note:** this changes the `CAST_SPELL` reducer case and the cast-initiation callback (`beginCastFlow`), both extremely high-traffic (every spell cast runs through them). SAC-19/SAC-20 guard that a targetless-and-affordable card with no `additionalCost` still instant-casts, and a targeted card with no `additionalCost` still flows `targeting -> mana` unchanged -- the new gate checks `additionalCost?.type === 'sacrificeCreature'` exactly, so it cannot fire for any other card.

**Explicitly out of scope this phase:** discard-as-cost (the `additionalCost` shape anticipates a future `{type:'discard', count:n}` variant, but no shipped card needs it, so it is not built or stubbed); the pre-existing `sacCre`/`sacArt` activated-ability cost simplification (a different mechanism, untouched).

### Status
COMPLETE

---

## Stub Batch: Reverse Damage, Conversion, Stasis — 2026-07-12

Three small, data-driven reuses of existing infrastructure, batched together only
because none of the three share any code with each other.

**Reverse Damage** ("The next time a source of your choice would deal damage to
you this turn, prevent that damage. You gain life equal to the damage prevented
this way.") -- mirrors Eye for an Eye's shape exactly
(`effect:"chooseDamageShieldSource"`, no `damageShieldColors`/`damageShieldTypes`)
except `damageShieldMode:"prevent"` plus a new `gainLifeOnPrevent:true` card flag.
The flag is threaded through both `chooseDamageShieldSource` branches (AI
auto-choose and the human `pendingDamageShieldChoice`) and into the
`turnState.damageShields` entry via `RESOLVE_DAMAGE_SHIELD_CHOICE`, using a
conditional spread (`...(card.gainLifeOnPrevent ? {gainLifeOnPrevent:true} : {})`)
rather than an unconditional `!!` so pre-existing shield entries (Circle of
Protection, Eye for an Eye, Greater Realm of Preservation) keep their exact
current shape -- an unconditional field would have broken `toEqual` assertions
in `damage-shields.test.js`/`eye-for-an-eye.test.js`/`circle-of-protection.test.js`.
`hurt()`'s `prevent` branch now gains life (`hurt(ns, who, -prevented, ...,
null)`, same recursion guard as the existing `redirect` branch) only when
`shield.gainLifeOnPrevent` is set.

**Conversion** ("At the beginning of your upkeep, sacrifice this enchantment
unless you pay {W}{W}. All Mountains are Plains.") -- reuses the
`globalTypeEffect`/`recomputeTypeEffects`/`layers.js` continuous-effect pipeline
that Blood Moon/Living Lands/Kormus Bell/Evil Presence already use, needing only
one new line in `layers.js`'s `matchesGlobalTypeFilter`: a `filter==='Mountain'`
branch (`sub.includes('Mountain')`), sibling to the existing `Forest`/`Swamp`
branches. Card entry: `globalTypeEffect:{filter:"Mountain",setSubtypes:["Plains"]}`,
mirroring Blood Moon's actual shape (which does carry `effect:"globalTypeEffect"`
-- a resolve-time case that only logs and performs no state mutation of its own;
the pre-flight plan for this batch had described Blood Moon as having no
`effect` field, which turned out to be inaccurate, so Conversion's entry
includes the field to genuinely mirror Blood Moon rather than the plan's
description of it). Mana production for the resulting Plains reuses
`LAND_TYPE_MANA`/`landTypeOverride` unchanged (already generic, no new engine
code). New upkeep case `sacrificeUnless_WW`, sibling to `sacrificeUnless_U`
(Phantasmal Forces/Stasis), checking `(mp.W||0)>=2` / decrementing `mp.W-=2`.

**Stasis** ("Players skip their untap steps. At the beginning of your upkeep,
sacrifice this enchantment unless you pay {U}.") -- reuses `sacrificeUnless_U`
unchanged for its upkeep half (identical shape to Phantasmal Forces, confirmed
before implementation). The untap-skip half is a new `stasisOut` gate
(`allBF_s.some(x => x.id === "stasis")`), sibling to the existing
`winterOrbOut`/`dampingFieldOut`/`magneticMountainOut` gates, that wraps the
*entire* per-active-player untap-step block (the `bf.map` that untaps, clears
`summoningSick`, and clears `damage` in one pass, plus the `optionalUntapTargets`/
`queueUpkeepChoice` follow-up) in a no-op branch that just logs `"Stasis: <active>
skips their untap step."`. This conflates all three untap-step effects into a
single skip, which is the existing untap-step model's already-documented
simplification (one combined `bf.map`, not three separate CR-accurate steps),
not a new one introduced here.

**Existing-behavior note (not a bug introduced by this batch):** `ADVANCE_PHASE`
calls `burnMana` (unconditional per-phase-boundary mana reset) *before* the
`PHASE.UPKEEP` switch that reads `c.upkeep`, for every phase transition. This
means any `sacrificeUnless_*`-style case -- including the pre-existing
`sacrificeUnless_U` (Phantasmal Forces) and Force of Nature's direct-check AI
branch (see `phase6.test.js` FN-02) -- always sees a freshly zeroed mana pool at
check time, so a pre-loaded, cost-matching pool never actually prevents the
sacrifice through a plain `ADVANCE_PHASE` dispatch. Conversion/Stasis inherit
this exactly (CONV-04/STAS-04 test and document it), matching Phantasmal
Forces' existing behavior rather than diverging from it.

**Stub counts:** the originally-tracked stub count (8 at the start of the
sprint, reduced to 7 by the prior Additional Costs + Sacrifice batch) is
**unaffected by this batch** -- still 7. Separately, a not-yet-triaged bucket of
7 lowercase-`effect:"stub"` cards existed going into this batch (Reverse Damage,
Conversion, Stasis, Animate Artifact, Gloom, Jade Monolith, Tawnos's Coffin);
this batch closes out the first three, leaving **4**: Animate Artifact, Gloom,
Jade Monolith, Tawnos's Coffin.

**Regression guards:** RD-05/RD-06 (Eye for an Eye's redirect shield and an
unflagged Circle of Protection prevent shield both still behave exactly as
before -- no stray life gain). CONV-05 (Blood Moon's `nonBasicLand` filter and
Conversion's new `Mountain` filter coexist without interference -- each only
matches a permanent's *base* subtype, per `matchesGlobalTypeFilter`'s existing
no-dependency-chasing design, so neither effect leaks into the other's target).
STAS-05 (Winter Orb/Damping Field/Magnetic Mountain gates are unaffected when
Stasis is absent).

**Tests:** Vitest `tests/scenarios/stub-batch-rd-conv-stasis.test.js` (18: RD-01
through RD-06, CONV-01 through CONV-06, STAS-01 through STAS-06 including the
CONV-04/STAS-04 mana-threshold cases described above). Playwright
`tests/e2e/stub-batch-rd-conv-stasis.spec.ts` (6: one scenario per card, dual
viewport, `@engine`).

### Status
COMPLETE

---

## Creature Damage Centralization + Jade Monolith, Personal Incarnation — 2026-07-12

**Infrastructure:** A single new choke point, `hurtCreature(state, targetIid, amt, src, meta)` (`DuelCore.js`, adjacent to `dmgWithShield`), for the raw `damage: c.damage + N` mutation pattern that used to appear at 24 sites across `resolveEff` and one `ACTIVATE_ABILITY` case (desertPing). Internally calls the new `consumeCreatureDamageShields(state, targetIid, amt, srcMeta)` first (checked against a new `turnState.creatureDamageShields` map, keyed by creature iid, mirroring `hurt()`'s player-level `turnState.damageShields` directly), applies any remaining amount as a raw mutation, then runs `checkDeath` once. All 9 pre-existing `dmgWithShield()` call sites (5 non-combat + 4 combat: regular/first-strike x attacker/blocker) gained one inserted `consumeCreatureDamageShields` call immediately before the existing call, feeding the reduced `remainingAmt` into `dmgWithShield` instead of the raw amount -- `dmgWithShield()` itself, and all combat blocking/first-strike/damage-assignment logic, is completely untouched. One site was deliberately NOT migrated: the player-to-creature damage redirect inside `hurt()`'s `getDamageRedirectTarget` branch (an existing, unrelated mechanic). See `docs/ENGINE_CONTRACT_SPEC.md` S7.9.

**Jade Monolith** (`jade_monolith`, colorless Artifact, `{1}: The next time a source of your choice would deal damage to target creature this turn, that source deals that damage to you instead.`) -- new `chooseDamageShieldSourceForTarget` case, sharing pool-building and AI-vs-human branching with the existing `chooseDamageShieldSource` (Circle of Protection / Eye for an Eye / Greater Realm of Preservation) via an extracted `resolveDamageShieldChoice(ns, card, caster, tgtC)` helper. Produces an exact-source `mode:'redirect'` entry in `turnState.creatureDamageShields[tgtC.iid]` (always redirects to Jade Monolith's controller, regardless of which source is chosen). New click-routing guard, `isCreatureOnlyTarget`/`CREATURE_ONLY_TARGET_EFFECTS` (`useDuelController.ts`, mirrors `isPlayerOnlyTarget`), rejects non-creature battlefield clicks during this ability's targeting step in both `DuelScreen.tsx` and `DuelScreenMobile.tsx` -- the `!isCre(tgtC)` check inside the resolver case is defense-in-depth only. **Deviation worth flagging:** since Jade Monolith is an *activated ability* on a permanent (not a cast spell), the effect also had to be registered in `ACTIVATE_TARGET_EFFECTS` (the set that actually gates whether the ability's targeting UI opens) in addition to `EXPLICIT_TARGET_EFFECTS`; `isCreatureOnlyTarget` checks both `card.effect` and `card.activated.effect` for the same reason (every prior `PLAYER_ONLY_TARGET_EFFECTS`/`CREATURE_ONLY_TARGET_EFFECTS` member was a cast-time spell, where those are the same field). Both screens' `castingCard` lookup during targeting was also fixed to be `castFlow.kind`-aware (hand for spells, battlefield for abilities) -- the existing lookup was hand-only, a latent gap never exercised because no prior `PLAYER_ONLY_TARGET_EFFECTS` member was ever an activated-ability effect.

**Personal Incarnation** (`personal_incarnation`, 6/6 W Creature — Avatar Incarnation, `{0}: The next 1 damage that would be dealt to this creature this turn is dealt to its owner instead. ... When this creature dies, its owner loses half their life, rounded up.`) -- new `addCreatureDamageShieldSelf` case (self-only, no target); each activation pushes one `mode:'redirectPoint'` entry onto `turnState.creatureDamageShields[card.iid]`. Freely repeatable in the same window (no per-activation limiter exists in this engine). The death-trigger clause reuses the pre-existing `loseHalfLifeRoundedUp` effect handler (already present in `DuelCore.js`, previously unwired) via a `triggeredAbilities` entry -- no engine change needed for that half.

**Stub count: 7 -> 5.**

**Tests:**
- Vitest: `tests/scenarios/creature-damage-centralization.test.js` (35: CDMG-01 through CDMG-12 infrastructure, CDMG-P01 through CDMG-P08 migration parity, CDMG-S01 through CDMG-S09 dmgWithShield insertion sites, CARD-01 through CARD-06 Jade Monolith/Personal Incarnation).
- Playwright: `tests/e2e/creature-damage-centralization.spec.ts` (6: Jade Monolith, Personal Incarnation, plain-combat regression, dual viewport, `@engine`).

### Status
COMPLETE

---

## Land Destruction Centralization + Pyramids — 2026-07-12

**Infrastructure:** A single new choke point, `destroyLand(state, targetIid, src, meta)` (`DuelCore.js`, adjacent to `hurtCreature`), for the `zMove(..., "gy")` land-destroy pattern that used to appear at 9 sites across 8 mechanics. Checks a new `turnState.landDestructionShields` map (keyed by land iid, mirroring `creatureDamageShields`'s shape) first; if a shield entry exists, consumes the first one (FIFO) and the land survives with no `zMove`. Otherwise performs the `zMove` and logs either the caller-supplied `meta.message`, a default `"<src> destroys <land>."`, or nothing (for the four mass-destroy loops, which already log a single batch message). All 9 raw sites migrated: `destroyTargetLand` (also gained an `INDESTRUCTIBLE` check it did not previously have -- a rules-accuracy fix confirmed with the project owner), `destroyAllLands`/`destroyIslands`/`destroyPlains`/`destroyForests` (loop bodies), `kudzuUpkeep` (only the enchanted-land zMove; Kudzu's own two "falls off" zMoves are unmigrated), Erosion (AI branch + human `erosionUpkeep` choice-resolve), and `blightDestroyHost`. Four sacrifice sites (Balance, Elder Spawn, Leviathan x2) remain deliberately unmigrated raw `zMove` calls -- sacrifice and destruction are different actions in Magic's rules, and Pyramids' text says "destroyed." See `docs/ENGINE_CONTRACT_SPEC.md` S7.10.

**Click-routing infrastructure:** A new `getEffectiveAbilityEffect(card, abilityId)` helper (`useDuelController.ts`) resolves a card's effective targeting effect across all three shapes this codebase uses (spell `card.effect`, single `card.activated.effect`, and Pyramids' new `card.activatedAbilities[]` array shape keyed by `abilityId`). `isPlayerOnlyTarget`/`isCreatureOnlyTarget` were refactored to use it (regression-tested against Jade Monolith, no behavior change). A new `LAND_ONLY_TARGET_EFFECTS`/`isLandOnlyTarget` pair mirrors `CREATURE_ONLY_TARGET_EFFECTS` exactly. Both screens gained a third click-routing guard line alongside the existing two.

**Infrastructure gaps closed (load-bearing for Pyramids, not caused by it):** the `ACTIVATE_ABILITY` reducer's array-shaped-ability branch previously hardcoded exactly four effects and silently no-op'd for anything else -- gained a generic branch dispatching through `resolveEff`. Array-shaped ability costs (`{generic:N}` objects) were being read as raw mana-cost strings at three sites (two in `useDuelController.ts`'s cast-flow mana checks, one in each screen's `castPrompt.costNeeded` display, the last of which crashed the whole React tree via `<Cost>`'s `cost.replace`) -- fixed with an exported `normalizeAbilityCost` helper. Mobile had no multi-ability "choose one" picker at all (`AbilityMenuPopover` existed only in `DuelScreen.tsx`, so `activatedAbilities`-array cards, including the pre-existing Mishra's Factory, silently no-op'd on mobile's Activate button) -- extracted to a shared `src/ui/duel/AbilityMenuPopover.tsx` and wired into `DuelScreenMobile.tsx`. Mobile's dedicated land tap-for-mana click handler (`handleLandTap`, used by `LandPip`) bypassed `castFlow` targeting entirely -- fixed to check targeting mode first, since Pyramids mode 2 is the first ability requiring a land click as a target on mobile.

**Pyramids** (`pyramids`, colorless Artifact, `{2}: Choose one -- Destroy target Aura attached to a land. / The next time target land would be destroyed this turn, remove all damage marked on it instead.`) -- `activatedAbilities: [{id:"pyramids_destroy_aura", cost:{generic:2}, effect:"destroyLandAura"}, {id:"pyramids_prevent_destruction", cost:{generic:2}, effect:"preventLandDestructionOnce"}]`. Mode 1 reuses Savaen Elves' `destroyLandAura` effect completely unchanged (no new engine code, no change to its own pre-existing targeting gap). Mode 2's new `preventLandDestructionOnce` case fizzles on a non-land target (defense-in-depth) and otherwise pushes a shield entry onto `turnState.landDestructionShields[tgtC.iid]`.

**Stub count: 6 -> 5.**

**Tests:**
- Vitest: `tests/scenarios/land-destruction-pyramids.test.js` (25: LAND-01 through LAND-09 infrastructure, LAND-P01 through LAND-P09 migration parity, LAND-R01 through LAND-R04 sacrifice-boundary regression, PYR-01 through PYR-03 Pyramids).
- Playwright: `tests/e2e/land-destruction-pyramids.spec.ts` (4: mode 2 shield, mode 2 targeting restriction, dual viewport, `@engine`).

### Status
COMPLETE

---

## Protection-from-Artifact Extension + Artifact Ward — 2026-07-12

**Infrastructure:** A single new shared helper, `isProtectedFromSource(target, sourceCard, state)` (`DuelCore.js`, adjacent to `consumeCreatureDamageShields`), extends the pre-existing color-only "protection from quality" system with an "artifact" type-based quality and reads through `computeCharacteristics` so Aura-granted protection (the Ward cycle, Artifact Ward) is respected everywhere, not just at sites already using `computeCharacteristics`. The 4 pre-existing color-only combat sites (`canBlockDuel`, the two `resolveCombat` damage-prevention checks, `DECLARE_BLOCKER`'s explicit check) each kept their own independent `PROT_MAP`/`PROT_CMAP`/`PROT_COLOR_MAP` constant and gained one additional inline `artifact`-matching branch instead of being consolidated -- a deliberate scope boundary. The two `resolveCombat` sites and `DECLARE_BLOCKER`'s explicit check previously read protection from a raw `card.protection` field, which never carries an Aura's `mod.protection`; their artifact leg (and, for `DECLARE_BLOCKER`, the whole check) now reads through `computeCharacteristics` so an Aura attached mid-combat (after blocks are declared, before damage) is caught by this backstop, not just by `canBlockDuel`'s declare-time gate. See `docs/ENGINE_CONTRACT_SPEC.md` S7.11 for the full DEBT (Damage/Enchant-equip/Block/Target) enforcement matrix.

**Non-combat damage (new D leg):** `consumeCreatureDamageShields` gained a protection check at the very top, before the existing exact-source/point-redirect shield passes -- resolves the source card via `srcMeta.sourceIid` across both battlefields and the stack, and if protected, prevents the entire amount without consuming any one-shot `creatureDamageShields` entries (protection is static, not a consumable resource). Because this lives in the shared choke point, all 9 `dmgWithShield()` call sites and every `hurtCreature` caller inherit it automatically.

**Targeting legality (new T leg):** `CAST_SPELL` and the plain single-ability `ACTIVATE_ABILITY` path each gained a preflight rejection if the chosen target has protection from the casting/activating source -- no stack item, no mana spent. The Pyramids-specific array-ability branch is deliberately untouched. A matching click-time guard was added to both `DuelScreen.tsx` and `DuelScreenMobile.tsx` (3 call sites total, alongside the existing `isPlayerOnlyTarget`/`isCreatureOnlyTarget`/`isLandOnlyTarget` guards), importing `isProtectedFromSource` directly from `DuelCore.js` rather than duplicating its match logic client-side.

**Artifact Ward** (`artifact_ward`, W Enchantment — Aura, `Enchant creature. Enchanted creature can't be blocked by artifact creatures. Prevent all damage that would be dealt to enchanted creature by artifact sources. Enchanted creature can't be the target of abilities from artifact sources.`) -- `effect:"enchantCreature", mod:{protection:["artifact"]}`, total reuse of the existing Ward-cycle (Black/Blue/Green Ward) card-data template with `"artifact"` in place of a color code. All three clauses (block, damage, target) are covered generically by the infrastructure above; the card-data entry itself needed no card-specific logic. The "E" clause (protection from being enchanted/equipped) is explicitly NOT implemented -- out of scope, not needed by this card's text.

**Stub count: 5 -> 4.**

**Tests:**
- Vitest: `tests/scenarios/protection-artifact-ward.test.js` (32: PROT-01 through PROT-08 combat extension, PROT-09 through PROT-14 non-combat damage, PROT-15 through PROT-24 targeting legality, PROT-25 through PROT-28 card-level/click-guard, PROT-29 through PROT-32 additional mixed-format/direct-helper coverage).
- Playwright: `tests/e2e/protection-artifact-ward.spec.ts` (4: blocking + non-combat damage, targeting click guard, dual viewport, `@engine`).

### Status
COMPLETE

---

## Gloom — 2026-07-13

**Infrastructure:** A single new shared helper, `applyCostTax(costStr, targetCard, state, requireEnchantment = false)` (`DuelCore.js`, adjacent to `parseMana`/`canPay`/`payMana`), appends a plain digit-string tax (`'3'`) to the end of a raw cost string when a Gloom is on the battlefield and `targetCard.color === 'W'` (and, when `requireEnchantment` is true, `isEnch(targetCard)` also holds). No change to `parseMana`, `canPay`, or `payMana` themselves was needed: `parseMana` accumulates every digit-run found anywhere in the cost string into `generic`, and the `ACTIVATE_ABILITY` cost-stripping chain is character-level regex replacement rather than segment splitting, so an appended digit run always lands safely in the final generic bucket regardless of the cost string's existing shape. See `docs/ENGINE_CONTRACT_SPEC.md` S15 for the full mechanism writeup and the call-site table.

**Clause 1 (white spells cost {3} more):** `CAST_SPELL` (`DuelCore.js`) computes the taxed cost once and reuses it for both its `canPay` check and its `payMana` call. Client-side, all 3 spell-cast `canPay` checks and the `getMaxAffordableX` X-affordability precheck (`useDuelController.ts`) now read the taxed cost.

**Clause 2 (activated abilities of white enchantments cost {3} more):** the single-ability `ACTIVATE_ABILITY` path (`DuelCore.js`) applies the tax to `act.cost` before the existing token-stripping chain runs, so the taxed string flows into stripping unchanged. Client-side, both activated-ability `canPay` checks (`useDuelController.ts`) now read the taxed cost via `normalizeAbilityCost` + `applyCostTax`. The Pyramids array-ability cost-check site is explicitly untouched -- Pyramids is not a white enchantment, and no card currently needs the tax applied through that shape.

**Client shortfall display:** both `getManaShortfall` call sites (`DuelScreen.tsx`, `DuelScreenMobile.tsx`) now compute their local `cost` variable through `applyCostTax` before feeding it to `costNeeded`/`shortfall`, so the cast prompt's "NEED" indicator reflects the taxed amount during the mana-wait step. `HandCard.tsx`/`FieldCard.tsx` are untouched -- the card's own printed cost display never changes, matching paper Magic.

**Card data:** `{id:"gloom", ..., }` (no `effect` key -- same shape as Winter Orb: a static, non-triggered, board-wide passive with no resolve-time action, read ad hoc via `x.id === 'gloom'` battlefield scans). Removed the `effect:"stub"` sentinel.

**Stub count: 3 -> 2** (untriaged bucket: Animate Artifact, Tawnos's Coffin remain).

**Tests:**
- Vitest: `tests/scenarios/gloom.test.js` (22: GLOOM-01 through GLOOM-06 `applyCostTax` unit tests, GLOOM-07 through GLOOM-12 spell-casting integration, GLOOM-13 through GLOOM-18 activated-ability integration, GLOOM-19 through GLOOM-21 client-side shortfall/X-affordability, GLOOM-22 stub-count meta test).
- Playwright: `tests/e2e/gloom.spec.ts` (4: spell tax + activated-ability tax shortfall-then-success, both viewports, `@engine`).

### Status
COMPLETE

---

## Animate Artifact — 2026-07-13

**Card:** Animate Artifact (`animate_artifact`, U Enchantment — Aura, cmc 4) -- "Enchant artifact. As long as enchanted artifact isn't a creature, it's an artifact creature with power and toughness each equal to its mana value." `effect:"enchantArtifact", mod:{addTypes:["Creature"], powerFn:"manaValueCDA", toughnessFn:"manaValueCDA", onlyIfNotCreature:true}`. Reuses Titania's Song's `manaValueCDA` CDA evaluator (`(card) => card.cmc ?? 0`) completely unchanged -- no new evaluator added.

**`enchantArtifact` gains a `card.mod` branch** (`DuelCore.js`), mirroring `enchantLand`'s existing `if (card.mod) { embedded } else { Kudzu-style }` split: with `card.mod` present, the aura embeds a record (`{iid, name, mod, controller, cardData, enterTs}`) into the target's own `enchantments[]` array instead of becoming a separate Kudzu-style bf permanent tracked via `enchantedArtifactIid`. The three pre-existing `enchantArtifact` users (Living Artifact, Artifact Possession, Relic Bind) have no `mod` field, so they fall through to the unchanged `else` branch -- byte-identical Kudzu-style behavior. A Guardian Beast check (ported from `enchantCreature`'s embedded branch -- a genuine "can this permanent be newly enchanted" rule, not specific to that case) guards the embedded path only: `if (isArt(tgtC) && !isCre(tgtC) && ns[tgtC.controller].bf.some(c => c.id === 'guardian_beast' && !c.tapped))`, so it protects a controller's own noncreature artifacts from a *new* Animate Artifact attachment exactly as it already does for `enchantCreature`, without reaching the three Kudzu-style users at all.

**`collectEffects`'s "Attached auras" loop (`layers.js`) gains two new field checks**, additive and gated by field presence (existing Auras using only `mod.power`/`mod.keywords`/etc. are unaffected): `mod.addTypes` pushes a Layer 4 effect (already generically consumed -- the same `effects.filter(e => e.layer === 4)` fold Living Lands/Kormus Bell/Titania's Song use), and `mod.powerFn`/`mod.toughnessFn` push a Layer 7a effect (already generically consumed via `CDA_EVALUATORS`). Both are gated by a new opt-in `mod.onlyIfNotCreature` flag: when set, the effect is suppressed if `(card.type ?? '').includes('Creature')` is already true. This check reads `card.type` -- the raw printed type, never mutated by the Layer 4 pass -- mirroring `matchesGlobalTypeFilter`'s `nonCreatureArtifact` branch exactly, which is what avoids a self-reference/oscillation bug once `typeEff` has already been baked onto the card by a prior `recomputeTypeEffects` pass. `onlyIfNotCreature` is per-aura opt-in (only Animate Artifact sets it) -- a second, hypothetical Aura using `addTypes`/`powerFn` without the flag would apply unconditionally, unaffected by another aura's gate on the same permanent.

**Side-benefit fix, in scope:** `enchantArtifact` was previously absent from `useDuelController.ts`'s `EXPLICIT_TARGET_EFFECTS` (a known gap flagged, not fixed, in the Tap Centralization Phase 1 entry above) -- Living Artifact, Artifact Possession, and Relic Bind all silently auto-resolved their target instead of prompting a picker when more than one legal artifact existed. Adding `enchantArtifact` to that set fixes this for all four cards sharing the effect name. A new `ARTIFACT_ONLY_TARGET_EFFECTS`/`isArtifactOnlyTarget` pair (mirroring `LAND_ONLY_TARGET_EFFECTS`/`isLandOnlyTarget` exactly) rejects a non-artifact battlefield click during targeting; the guard was added to both `src/DuelScreen.tsx` and `src/ui/Mobile/DuelScreenMobile.tsx` alongside the existing three (`isPlayerOnlyTarget`/`isCreatureOnlyTarget`/`isLandOnlyTarget`) click-routing guards. Relic Bind's separate card-data `requiresTarget:'opponentArtifact'` field (an unused, purely documentary string -- the real "opponent controls" legality gate is `CAST_SPELL`'s dedicated `relic_bind` id check) does not collide with `CastFlowState.requiresTarget` (the unrelated boolean the new set also now drives true for these four cards).

**Mobile bugfix found while testing this card's e2e coverage (not this feature's own scope, but blocking it):** `src/ui/Mobile/FieldCard.tsx` computed creature status via `card.type?.includes('Creature')` (the raw printed type only) instead of the engine's real `isCre` (which reads `typeEff ?? type`), unlike `src/ui/Card/FieldCard.tsx` (desktop), which already imports and uses the engine's `isCre`. This meant any `typeEff`-driven creature-type change (Living Lands, Kormus Bell, Titania's Song, and now Animate Artifact) never displayed correctly on the true `?duel=sandbox-mobile` route -- masked until now because no prior e2e spec exercised that route for a type-changing effect. Fixed to mirror desktop's exact pattern (`isCreEngine(card) || card.isAnimatedLand === true`).

**Stub count: 2 -> 1** (untriaged bucket: Tawnos's Coffin remains).

**Tests:**
- Vitest: `tests/scenarios/animate-artifact.test.js` (26: AA-01 through AA-06 `enchantArtifact` branch, AA-07 through AA-14 `collectEffects`/type-change, AA-15 through AA-22 targeting, AA-23/AA-24 meta, AA-25/AA-26 layer-ordering/Guardian-Beast-scope regression).
- Playwright: `tests/e2e/animate-artifact.spec.ts` (4: animate + attack, targeting-restriction click guard, dual viewport, `@engine`).

### Status
COMPLETE

---

## Coral Helm -- 2026-07-13

**Card:** Coral Helm (`coral_helm`, U Artifact, cmc 3) -- "{3}, Discard a card at random: Target creature gets +2/+2 until end of turn." `activated:{cost:"3,discardRandom", effect:"pumpCreature"}, mod:{power:2, toughness:2}`.

**`discardRandom` cost token** (new, `DuelCore.js` `ACTIVATE_ABILITY` reducer): three-point addition mirroring the existing `discardLastDrawn` pattern -- a preflight guard (activation rejected if activating player's hand is empty), a cost-execution block (picks a random index from `s[w].hand` via `Math.random()`, routes through `discardCard(..., {cause:'cost'})` -- same flagged `Math.random()` violation as `discardX`/`discardOne`/coin-flip sites, pending Milestone B seeded-RNG migration), and a mana-strip `.replace(/discardRandom/g, "")` so the token is excluded from the parsed mana cost. No changes to `parseMana`, `canPay`, `payMana`, or `discardCard` itself.

**`pumpCreature` + `mod`:** Both existed and were already wired. `"pumpCreature"` was already in `ACTIVATE_TARGET_EFFECTS` (`useDuelController.ts`), so the targeting flow (UI + AI) fires without any routing changes. `resolveEff`'s `pumpCreature` case reads `card.mod.power`/`card.mod.toughness` from the Coral Helm card definition (same pattern as Wyluli Wolf). No changes to either screen file.

**AI:** New branch in `planActivatedAbilities` (`AI.js`) for the `pumpCreature` + `discardRandom` combo: fires when the AI has creatures to pump, a card to discard, and >= 3 mana available; targets the highest-`evaluateCreatureValue` own creature.

**Stub count: 1 -> 0** (untriaged bucket empty; 5 remaining stubs total are Tawnos's Coffin, Blaze of Glory, Oubliette, Ring of Ma'ruf, and Coral Helm -- now 4).

**Tests:**
- Vitest: `tests/scenarios/coral-helm.test.js` (4: HELM-01 basic pump + discard, HELM-02 buff expiry at CLEANUP, HELM-03 empty-hand preflight block, HELM-04 stack empty when mana insufficient).
- Playwright: `tests/e2e/coral-helm.spec.ts` (4: pump visible on tile + discard, buff absent after CLEANUP, dual viewport, `@engine`).

### Status
COMPLETE

---

## Cleanup-Step Hand-Limit Discard -- 2026-07-13

CR 514.1 fix: cleanup-step hand-limit discard previously auto-discarded the
last N cards in hand array order with no player choice. Human player (`'p'`)
now gets an interactive multi-select picker; AI (`'o'`) keeps the original
auto-discard (already documented as fully delegated to `DuelCore.js` by
`AI.js`'s `planEnd`). See `docs/SYSTEMS.md` Section 29 for the full spec.

**New state field:** `pendingCleanupDiscard: { controller: 'p', count: number } | null`.
Set in `advPhase`'s `PHASE.CLEANUP` branch when `'p'`'s hand exceeds
`effectiveMax` (Library of Leng's infinite-hand-size case preserved
unchanged). `ADVANCE_PHASE` gains a guard blocking phase transitions while it
is set, parallel to `pendingUpkeepChoice`/`pendingConditionalCounter`/
`pendingSphereTrigger`.

**New action:** `RESOLVE_CLEANUP_DISCARD { iids }` -- rejects unless `iids`
exactly matches the required count, contains no duplicates, and every iid is
in the controller's hand; otherwise discards each card via the existing
`discardCard` choke point (`cause: 'gameRule'`), so `DISCARD_REPLACEMENTS`,
`ON_DISCARD`, and trigger-queue draining all apply unchanged.

**UI:** new shared `CleanupDiscardModal.tsx` (`src/ui/duel/`), modeled on
`TutorModal.tsx`'s visual language with `BandFormationPanel.tsx`'s
toggle-to-select mechanic. No decline option -- discard is mandatory. Wired
into both `DuelScreen.tsx` and `DuelScreenMobile.tsx` identically. New
`resolveCleanupDiscard` dispatcher added to `useDuel.js`; `useDuelController.ts`'s
End Turn auto-pass effect gained `s.pendingCleanupDiscard` in its
player-required-choice guard list.

**Tests:**
- Vitest: `tests/scenarios/cleanup-discard.test.js` (pending-state shape, wrong-count/duplicate/foreign-iid rejection, valid discard + phase resume, Library of Leng regression).
- Playwright: `tests/e2e/cleanup-discard.spec.ts` (`@engine @mobile`).

### Status
COMPLETE

---

# End of MECHANICS INDEX v1.33
