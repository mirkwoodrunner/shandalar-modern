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

# End of SYSTEMS v1.0
