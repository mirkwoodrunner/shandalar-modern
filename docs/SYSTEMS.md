# Shandalar Systems Document

## Overview

This document defines the core mechanical systems of Shandalar. It serves as the authoritative reference for how gameplay is simulated, including combat, encounters, progression, and game state management.

It prioritizes unambiguous rules, deterministic resolution, and clear data structures over narrative or design intent.

---

# 1. Core Gameplay Loop

Shandalar is structured around a repeating roguelike loop:

1. World Map Exploration
2. Encounter Trigger (combat, event, merchant, etc.)
3. Encounter Resolution
4. Reward / Consequence Processing
5. Deck Modification (cards added, removed, or transformed)
6. Player Progression (health, resources, unlocks)
7. Repeat until win/loss condition is met

---

# 2. Game State Model

The game operates on a centralized GameState object.

## 2.1 GameState Structure

```json
GameState {
  player: PlayerState,
  world: WorldState,
  encounter: EncounterState | null,
  rngSeed: number,
  turnNumber: number,
  phase: string
}
```

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

# 3. Turn Structure System

Each encounter uses a deterministic turn-based system.

## 3.1 Turn Phases

1. Start Phase
   - Untap / reset effects
2. Draw Phase
   - Player draws 1 card
3. Resource Phase
   - Player gains 1 mana (default unless modified)
4. Main Phase
   - Player may play cards
5. Combat Phase
   - Attackers declared and resolved
6. End Phase
   - Cleanup and effect expiration

---

# 4. Card System

## 4.1 Card Structure

```json
Card {
  id: string,
  name: string,
  type: "creature" | "spell" | "artifact" | "enchantment",
  cost: ManaCost,
  power?: number,
  toughness?: number,
  effects: Effect[]
}
```

## 4.2 ManaCost

```json
ManaCost {
  generic: number,
  colored: {
    white: number,
    blue: number,
    black: number,
    red: number,
    green: number
  }
}
```

## 4.3 Zones

Cards exist in one of the following zones:
- Deck
- Hand
- Battlefield
- Graveyard
- Exile

All zone transitions must be explicit.

---

# 5. Combat System

## 5.1 Combat Flow

1. Player declares attackers
2. Defender assigns blockers
3. Damage assignment step
4. Simultaneous damage resolution
5. State-based effects applied
6. Dead creatures move to graveyard

---

## 5.2 Damage Rules

- Damage is applied simultaneously
- A creature is destroyed if damage ≥ toughness
- Excess damage does not carry over unless specified
- Unblocked attackers deal damage directly to player

---

## 5.3 Priority Rules

- Player acts first unless encounter specifies otherwise
- AI decisions are deterministic given GameState + rngSeed

---

# 6. Encounter System

## 6.1 Encounter Types

- Combat Encounter
- Event Encounter
- Merchant Encounter
- Boss Encounter

---

## 6.2 Encounter Generation

Encounters are generated using:
- Region data
- Player power level
- Weighted random tables
- RNG seed

---

## 6.3 EncounterState

```json
EncounterState {
  type: string,
  enemies: Enemy[],
  rewards: RewardTable,
  metadata: object
}
```

---

# 7. Enemy AI System

## 7.1 AI Decision Model

AI decisions are based on:
- Board state
- Available resources
- Priority rules
- Deterministic scoring function

---

## 7.2 AI Priority Rules

1. Play highest-impact card available
2. Remove threats if lethal risk exists
3. Develop board otherwise
4. Attack if favorable

---

# 8. World System

## 8.1 World Structure

```json
WorldState {
  regions: Region[],
  currentRegion: string,
  playerPosition: NodeId
}
```

## 8.2 Node Types
- Combat
- Event
- Shop
- Boss
- Safe zone

---

# 9. Progression System

## 9.1 Deck Evolution
- Card rewards
- Card removal (limited)
- Card upgrades (optional)

## 9.2 Difficulty Scaling
- Region progression
- Player strength heuristics
- Optional adaptive scaling

---

# 10. RNG System

- All randomness must use GameState.rngSeed
- No unseeded randomness allowed
- Must support deterministic replay

---

# 11. Edge Cases

## 11.1 Empty Deck
- Shuffle graveyard into deck
- If graveyard empty: deal 1 damage to player

## 11.2 Simultaneous Death
- All lethal damage resolves simultaneously
- State-based effects applied after resolution

## 11.3 Infinite Loops
- Hard cap of 20 iterations per effect chain

---

# 12. System Priority

1. SYSTEMS.md
2. Code implementation
3. Encounter overrides
4. Debug rules

---

# 13. Non-Goals

This document does NOT define:
- Narrative content
- UI/UX design
- Art direction
- Flavor text
```
