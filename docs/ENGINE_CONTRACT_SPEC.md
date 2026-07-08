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

## 3.7 FORM_BAND (CR 702.22c)

```json
{
  "iids": string[]
}
```

Rules:
- only valid during `COMBAT_ATTACKERS`
- every iid must already be a declared attacker (`s.attackers`) controlled by
  the active player
- rejected if any iid already carries a `bandId` from an earlier `FORM_BAND`
  call this combat
- rejected unless at least one member has banding and at most one lacks it
- one call forms exactly one band (shared `bandId`); a player may call this
  repeatedly in the same declare-attackers step to form multiple bands
- see `docs/SYSTEMS.md` S5.4 for the full band data model and the
  live-membership design that gives 702.22e/f for free

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
✔ Produce actions during the **player's turn**, restricted to an open priority window (`state.priorityWindow === true && state.active === 'p'`)

AI may NOT:

❌ mutate GameState  
❌ simulate combat results  
❌ bypass DuelCore validation  
❌ directly trigger system effects  

## 5.3 AI Priority-Window Contract

When `state.priorityWindow === true && state.active === 'p'`, `getAIPlan` routes to `planInstantResponse` instead of the phase planner. The following invariants hold:

- AI remains **read-only**: `planInstantResponse` reads `state` and produces `GameAction` objects; it does not mutate state.
- At most **one `PLAY_CARD` action** is emitted per priority window. The plan always terminates with `PASS_PRIORITY { who: 'o' }`.
- The adapter translates `PASS_PRIORITY` → `{ type: 'PASS_PRIORITY', who: 'o' }` to DuelCore only when `state.priorityWindow` is true. Outside a priority window, `PASS_PRIORITY` remains a no-op (DuelScreen handles phase advance).
- The hook in `DuelScreen.tsx` guards on `state.priorityPasser !== 'o'` to ensure the AI fires **at most once per window**.

## 5.5 Virtual-State Simulation — Known Limitation (Tier 5)

`applyVirtualPlay` in `AI.js` produces approximate virtual states used solely for turn-plan scoring. It is **not a true simulator**. Specifically:

- Creatures enter with `summoningSick: true` regardless of haste.
- Removal is modelled as immediate battlefield removal; it does not model protection, regeneration, or indestructible.
- Non-creature, non-removal spells have no board impact in the simulation (hand removal only).
- Mana tracking is not updated — scoring uses creature/life deltas only, not available-mana delta.
- The virtual state is never fed back into DuelCore. It exists purely as a heuristic scoring input for `evaluateBoard`.

Any discrepancy between the simulated and resolved outcome is acceptable. DuelCore remains the sole authority on actual game state.

## 5.4 Adapter Contract (Tier 4)

The `aiDecide` adapter is now a **pure translation layer**. All decisions are made by `getAIPlan` and its planners. The adapter MUST NOT make decisions.

Specifically:
- Every `PLAY_CARD` spec action produced by the planners MUST include `_tapActions`. If `_tapActions` is absent, that is a planner bug; the adapter logs an error and skips the action — it does not reconstruct tap actions as a fallback.
- The adapter validates the plan contract at entry: if `getAIPlan` returns a malformed plan (not an object with `actions[]`), the adapter logs an error and returns `[]`.
- The adapter is responsible only for: `PLAY_LAND` / `CAST_SPELL` / `SET_X` / `RESOLVE_STACK` emit order, `DECLARE_ATTACKER`, `DECLARE_BLOCKER`, `ACTIVATE_ABILITY`, and conditional `PASS_PRIORITY` emission during open priority windows.

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

## 7.3 Banding Damage-Division Choices (CR 702.22j/k)

`resolveCombat` may pause mid-resolution by returning `state.pendingChoice`
instead of applying damage, when a still-unanswered 702.22j/k order choice
exists (see `docs/SYSTEMS.md` S5.4). Two `pendingChoice.kind` values, both
created directly by `resolveCombat`, not via a triggered ability:

| kind | who chooses (`controller`) | `options[].order` |
|---|---|---|
| `bandAttackerDamageOrder` | defending player | permutation of the attacker's 2+ effective blockers |
| `bandBlockerDamageOrder` | active player (`s.active`) | permutation of the blocker's 2+ band-member recipients |

`RESOLVE_CHOICE` stores the chosen `order` under a stable key in
`turnState.combatDamageOrders` and re-invokes `resolveCombat`, which either
surfaces the next unanswered choice or (once none remain) resolves damage for
real. No UI-level distinction is required for AI-controlled choices --
`options[0]` is always the natural/pre-existing order, so the existing
generic AI pendingChoice fallback in `useDuelController.ts` reproduces
identical behavior with zero changes to that file.

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

---

# 13. Card-Data UI Annotations

Certain card-data fields in `src/data/cards.js` are consumed exclusively by
the UI/hook layer and are invisible to `DuelCore.js`:

| Field | Type | Consumed by | Purpose |
|---|---|---|---|
| `optionalTarget` | `boolean` | `useDuelController.ts` (`isOptionalTarget`) | When true, the cast flow opens targeting mode with a Skip button; the spell may be confirmed with 0 targets, resolving with `tgt: null`. |

**Contract:** `DuelCore.js` must never read, branch on, or validate `optionalTarget`.
It receives `tgt: null` from `castSpell` when the player skips; that is the only
engine-visible signal.

---

# 14. Activated Ability Cost-String Schema

`card.activated.cost` is a comma-separated string encoding the activation cost. DuelCore parses it in the `ACTIVATE_ABILITY` case.

## Recognised Tokens

| Token | Meaning | When consumed |
|---|---|---|
| `T` | Tap the source permanent | Checked first; returns early if already tapped |
| `sac` | Sacrifice the source permanent | Moves source to owner's graveyard via `zMove` immediately after tap; before the ability item is pushed to the stack |
| One or more mana symbols (e.g. `G`, `R`, `2`, `1U`) | Pay the specified mana cost | Parsed by `parseMana()`; deducted from `s[w].mana` via `payMana()` |
| `counter` | Remove a +1/+1 counter (e.g. Triskelion) | Handled per-effect-case rather than in the shared cost step |

## Cost Processing Order

1. Tap cost (`T` present): tap the source. Return early with a log if already tapped.
2. Sacrifice cost (`sac` present): call `zMove(s, iid, w, w, "gy")`. Source is gone from battlefield before the ability item is created.
3. Mana cost: strip `T`, `sac`, and commas; parse remainder with `parseMana()`; deduct with `payMana()`. Return early (log "not enough mana") if pool is insufficient.
4. Push ability item to `s.stack` and open priority window.

## MTG Rule Alignment

Sacrifice is a cost (paid before the effect resolves on the stack), not part of the effect. If a legal target disappears by the time the stack resolves, the source is still sacrificed and the effect fizzles. This matches MTG rules 117.12 and 601.2g.

## Example Cost Strings

| Cost string | Card | Meaning |
|---|---|---|
| `"T,sac"` | Goblin Digging Team, Black Lotus | Tap + sacrifice |
| `"G,T,sac"` | Scavenger Folk | Pay {G} + tap + sacrifice |
| `"T"` | D'Avenant Archer, Royal Assassin | Tap only |
| `"T,sac"` | Strip Mine | Tap + sacrifice |
| `"R"` | Wall of Fire | Pay {R} |

**Contract:** Adding new cost tokens requires updating both the parse logic in `ACTIVATE_ABILITY` (DuelCore.js lines ~2795-2815) and the mana-strip regex (`replace(/sac/g, "")` pattern). New tokens must be documented in this section.

# End of ENGINE CONTRACT SPEC v1.0
