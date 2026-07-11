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

## 7.4 `ON_COMBAT_BEGIN` Event and `scope: 'combat'` eotBuffs (Banding Phase 3)

Two small additions to the trigger vocabulary, added to unstub Battering Ram:

- `ON_COMBAT_BEGIN` -- emitted once on the transition into
  `PHASE.COMBAT_BEGIN`, same unscoped-per-turn-cycle shape as
  `ON_UPKEEP_START`/`ON_END_STEP`.
- `eotBuffs` entries may carry `scope: 'combat'` (default remains the
  standard until-end-of-turn lifetime). A `scope: 'combat'` entry is
  stripped at `PHASE.COMBAT_END`, in the same loop that already processes
  `turnState.endOfCombatDestroy`, rather than persisting to CLEANUP.

See `docs/SYSTEMS.md` S5.4 (Phase 3 additions) for the full card-level
rationale.

---

## 7.5 `ON_TAP` Event (Tap Centralization Phase 1)

One addition to the trigger vocabulary, added to unstub Relic Bind, Blight,
and Psychic Venom (Phase 1 of tap centralization; see docs/ROADMAP.md
Milestone A / Tier 3).

- `ON_TAP` -- emitted by the new `tapPermanent(state, who, iid)` choke point
  (src/engine/DuelCore.js) whenever a permanent transitions from untapped to
  tapped. Payload: `{ cardId, controller }`. Does NOT fire redundantly if the
  permanent was already tapped.
- All ~28 prior ad hoc `tapped: true` mutation sites in DuelCore.js now route
  through this single function. See docs/MECHANICS_INDEX.md for the list.
- `tapPermanent` pairs its `emitEvent` call with an immediate
  `processTriggerQueue`, matching every other emitEvent call site in the
  file -- `emitEvent` alone only enqueues, it does not resolve. Without this
  pairing, ON_TAP-triggered effects would sit queued until some unrelated
  later action happened to drain the queue instead of resolving at the
  moment of tapping.
- New `enchantedHostTapped` condition (in `evaluateCondition`) restricts an
  Aura's "whenever enchanted permanent becomes tapped" ability to firing
  only when its own specific host (via `enchantedArtifactIid` or
  `enchantedLandIid`) is the one that tapped, not any other permanent of the
  same type. Relic Bind, Blight, and Psychic Venom's triggeredAbilities
  intentionally carry no `scope` key (matching Living Artifact's existing
  convention) -- the codebase's `scope: 'controller'` filter checks
  `card.controller` against `event.payload.activePlayer`, a key the ON_TAP
  payload does not carry, so `enchantedHostTapped` alone does the filtering.
- Phase 2 (built, see 7.6) added tracking for "an ability was activated
  without {T} in its cost," needed by Artifact Possession, Haunting Wind, and
  Powerleech in addition to this event.

---

## 7.6 `ON_ABILITY_ACTIVATED_NO_TAP` Event (Tap Centralization Phase 2)

Completes the trigger vocabulary needed to unstub Artifact Possession,
Haunting Wind, and Powerleech (Phase 2 of tap centralization; Phase 1 --
`ON_TAP` -- shipped separately, see 7.5).

- `ON_ABILITY_ACTIVATED_NO_TAP` -- emitted from two sites in
  `case "ACTIVATE_ABILITY"` (the `addMana` branch and the generic "1. Tap
  cost" step) whenever an activated ability's cost does NOT include `{T}`.
  Payload: `{ cardId, controller }`, same shape as `ON_TAP`.
- Deliberately NOT emitted from the `activatedAbilities`-array path (Mishra's
  Factory, Desert, Wormwood Treefolk) -- none of those are artifacts, and no
  card in this batch cares about non-artifact sources. A future card needing
  that coverage would need to add emission there explicitly.
- Fires universally (any permanent, any controller); consuming cards filter
  via `evaluateCondition`, not at emission -- same philosophy as `ON_TAP`.
- Like `ON_TAP`, pairs `emitEvent` with an immediate `processTriggerQueue` at
  both emission sites.
- Two new `evaluateCondition` types support this event (and, for the first
  one, `ON_TAP` too): `affectedPermanentIsArtifact` (Haunting Wind) and
  `affectedPermanentIsOpponentArtifact` (Powerleech), both looking up the
  affected permanent live on the battlefield via `payload.controller`/
  `payload.cardId` rather than tracking a host reference (these two cards are
  plain Enchantments, not Auras). Artifact Possession reuses the existing
  `enchantedHostTapped` condition (7.5) unchanged for its
  `ON_ABILITY_ACTIVATED_NO_TAP` trigger -- the payload shape is identical to
  `ON_TAP`'s, so no new condition was needed for it specifically.
- Tap centralization is now complete (Phases 1 and 2 both shipped); no
  further phases are planned.

---

## 7.7 `ON_DISCARD` Event and `discardCard` Choke Point (Discard Centralization Phase 1)

Mirrors `ON_TAP` (7.5) directly: a single choke point for "a card moves from
a player's hand to their graveyard as a discard," added to unstub Library of
Leng (Phase 2). This phase is pure refactor plus inert new infrastructure --
no card behavior changes.

- `discardCard(state, who, iid, opts)` (src/engine/DuelCore.js, placed
  adjacent to `tapPermanent`) is the sole choke point for hand-to-gy discard
  mutations.
- `opts.cause` is REQUIRED -- one of `'effect' | 'cost' | 'gameRule'`.
  Missing or invalid: throws immediately (fail-fast programmer error, not a
  runtime no-op).
- `opts.sourceName` is optional, used for dlog attribution by callers that
  want it -- `discardCard` itself adds no dlog line of its own. Callers keep
  their own existing site-specific dlog calls (e.g. "Bazaar: drew 2,
  discarded 3.", "${opp} discards ${dc.name}.").
- Card with `iid` not found in `state[who].hand`: `console.error` and return
  state unchanged (runtime no-op, same philosophy as `tapPermanent`'s
  not-found handling).
- Behavior order in one call:
  1. **Replacement pass.** Scans `state[who].bf` for permanents whose `id`
     has an entry in `DISCARD_REPLACEMENTS`. For each entry, if
     `matches(state, who, payload)` returns true and the entry's id is not
     already in this call's `hasRun` set, the entry is applied and its
     result returned INSTEAD of performing the mutation/event steps below.
     `hasRun` is local to a single `discardCard` invocation (CR 614.5 loop
     protection scoped per call, not across recursive calls). When multiple
     entries match, the first in battlefield order wins -- documented
     simplification for Phase 1; a decider-choice UI arrives with Phase 2's
     first real consumer.
  2. **Mutation.** Removes the card from `state[who].hand` (filter by iid),
     appends it to `state[who].gy`.
  3. **Event.** Emits `ON_DISCARD` with payload `{ who, iid, cardId,
     cardName, cause, sourceName }`, immediately followed by
     `processTriggerQueue`, matching every other emit site in the file.
- `DISCARD_REPLACEMENTS` (exported const object, keyed by card id) ships
  EMPTY in this phase -- no production consumers. Entry shape:
  `{ matches(state, who, payload) => boolean, apply(state, who, payload) => state }`.
  `payload` is the same object passed to ON_DISCARD (including `cause`), so
  a future consumer like Library of Leng can match `cause === 'effect'`
  only.
- All 14 prior ad hoc hand-to-gy mutation sites in DuelCore.js now route
  through this single function. See docs/MECHANICS_INDEX.md for the list.
- No shipped card listens to `ON_DISCARD` in this phase; production emission
  is inert. `discardCard` now runs inside the CLEANUP handler's hand-size
  while-loop (previously a bare mutation), so every duel's end-of-turn path
  now includes an (inert) `emitEvent`/`processTriggerQueue` pair each time a
  card is discarded to hand size.

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
