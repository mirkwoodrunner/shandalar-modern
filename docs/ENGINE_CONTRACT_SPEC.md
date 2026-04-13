  # Shandalar Engine Contract Specification (v1.0)

## Overview

This document defines the **strict execution contract** between:

- AI systems (AI.js)
- UI layer (React + useDuel.js)
- Simulation engine (DuelCore.js)

It ensures that all gameplay actions are:
- structured
- deterministic
- validated
- executed only through DuelCore

This is the **lowest-level authority boundary of the entire system**.

---

# 1. Core Principle

> ALL GAMEPLAY CHANGES FLOW THROUGH GAME ACTIONS INTO DUELCORE.

No system may:
- mutate GameState directly
- bypass action pipeline
- execute gameplay logic outside DuelCore

---

# 2. GameAction Contract

## 2.1 Definition

All interactions in Shandalar are represented as `GameAction` objects.

```json
GameAction {
  id: string,
  type: string,
  source: "player" | "ai" | "system",
  payload: object,
  timestamp: number,
  priority: number
}
```

---

## 2.2 Required Fields

### id
- Unique identifier for traceability
- Must be deterministic if replaying from seed

### type
Defines the action category:
- "PLAY_CARD"
- "ATTACK"
- "BLOCK"
- "END_TURN"
- "TRIGGER_EFFECT"
- "MOVE_ENTITY"
- "GENERATE_MANA"

### source
- player → human input via UI
- ai → AI.js decision output
- system → DuelCore internal effects

### payload
Action-specific structured data (see section 3)

---

# 3. Action Payload Specifications

---

## 3.1 PLAY_CARD

```json
{
  "cardId": string,
  "fromZone": "hand",
  "targetZone": "battlefield" | "stack"
}
```

Rules:
- validated by DuelCore
- cost must be payable at execution time
- triggers enter-the-battlefield effects

---

## 3.2 ATTACK

```json
{
  "attackerIds": string[],
  "defenderId": "player" | "entityId"
}
```

Rules:
- only valid during Combat Phase
- validated against battlefield state

---

## 3.3 BLOCK

```json
{
  "assignments": [
    {
      "attackerId": string,
      "blockerIds": string[]
    }
  ]
}
```

Rules:
- must match current attack declaration
- enforced ordering handled by DuelCore

---

## 3.4 END_TURN

```json
{
  "reason": "player" | "ai" | "timeout"
}
```

Rules:
- immediately triggers phase resolution in DuelCore
- clears temporary state

---

## 3.5 TRIGGER_EFFECT

```json
{
  "effectId": string,
  "sourceId": string,
  "context": object
}
```

Rules:
- only DuelCore may emit triggers
- AI cannot generate triggers directly

---

## 3.6 MOVE_ENTITY

```json
{
  "entityId": string,
  "fromZone": string,
  "toZone": string
}
```

Rules:
- strictly controlled by DuelCore
- used for zone transitions only

---

# 4. Engine Pipeline

## 4.1 Action Flow

All actions follow this pipeline:

### Step 1 — Action Creation
- UI or AI generates GameAction

### Step 2 — Validation (DuelCore)
- schema validation
- rule legality check (rulesets.js applied)
- resource cost validation

### Step 3 — Stack Insertion (LIFO system)
- action pushed into DuelCore stack

### Step 4 — Resolution
- DuelCore resolves stack in reverse order
- deterministic execution

### Step 5 — State Mutation
- ONLY DuelCore mutates GameState

### Step 6 — Broadcast
- updated GameState sent to UI via useDuel

---

# 5. AI Output Contract

## 5.1 Required AI Output Format

AI.js MUST output:

```json
{
  "actions": [GameAction],
  "confidence": number,
  "reasoning": string
}
```

---

## 5.2 AI Constraints

AI may:

✔ Read GameState snapshot  
✔ Evaluate board state  
✔ Generate valid GameAction objects  

AI may NOT:

❌ mutate GameState  
❌ simulate combat results  
❌ bypass DuelCore validation  
❌ directly trigger system effects  

---

# 6. UI Contract (useDuel.js)

## 6.1 Allowed Responsibilities

useDuel.js may only:

- dispatch GameAction objects to DuelCore
- subscribe to GameState updates
- expose derived UI state

---

## 6.2 Forbidden Responsibilities

useDuel.js must NEVER:

- compute game rules
- resolve combat logic
- validate gameplay outcomes
- modify GameState directly

---

# 7. DuelCore Execution Contract

## 7.1 Responsibilities

DuelCore is the ONLY system allowed to:

- mutate GameState
- resolve stack
- execute combat
- apply rulesets
- trigger keyword effects
- enforce phase transitions

---

## 7.2 Internal Pipeline

DuelCore executes actions in this order:

1. Receive GameAction
2. Validate against SYSTEMS.md rules
3. Push to LIFO stack
4. Resolve stack
5. Apply state changes
6. Emit updated GameState

---

# 8. Determinism Contract

All systems MUST obey:

## 8.1 RNG Rules

- All randomness uses rngSeed
- No Math.random in gameplay logic
- AI decisions must be reproducible

---

## 8.2 Replay Guarantee

Given identical:
- GameState
- rngSeed
- Action sequence

→ simulation must produce identical results

---

# 9. Error Handling Contract

## 9.1 Invalid Action

If a GameAction is invalid:

DuelCore must:
- reject action
- log reason
- return unchanged GameState

---

## 9.2 Illegal State Detection

If state inconsistency occurs:

- halt resolution
- flag system violation
- emit debug snapshot

---

# 10. System Boundaries Summary

| System | Can Mutate GameState | Can Create Actions | Can Resolve Rules |
|--------|----------------------|--------------------|-------------------|
| DuelCore | YES | YES | YES |
| AI.js | NO | YES | NO |
| useDuel.js | NO | YES (player only) | NO |
| UI | NO | YES (via input) | NO |

---

# 11. Anti-Drift Enforcement Rule

If any system other than DuelCore:

- modifies GameState
- resolves combat
- advances turn state
- applies rules

→ it is a **critical architecture violation**

---

# 12. Non-Goals

This document does NOT define:

- UI layout
- card design
- narrative systems
- visual effects
- balance tuning

---

# End of ENGINE CONTRACT SPEC v1.0
