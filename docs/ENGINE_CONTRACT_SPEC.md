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
| `blazeOfGloryDamageOrder` | the blocking creature's OWN controller | permutation of the blocker's 2+ Blaze-of-Glory-granted recipients |

The third kind is NOT a banding rule -- it's the ordinary CR 509.2
blocker-side mirror (a creature blocking multiple attackers has its
controller, not the active player, choose the order), needed because Blaze
of Glory ("can block any number of creatures... if able") grants an
ordinary creature banding-like multi-block capacity without banding itself.
`getBlockerRecipients(ns, bl)` is the shared helper behind all three rows:
it returns a blocker's band-derived explicit recipients, unioned with (for a
`blocksAllAttackers`-flagged creature) every other attacker `canBlockDuel`
still allows -- computed live, so it responds to mid-combat legality changes
for free, same as `getEffectiveBlockers` always has. See
`docs/MECHANICS_INDEX.md` -- Blaze of Glory.

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

### 7.7.1 `DISCARD_REPLACEMENTS['library_of_leng']` (Phase 2 -- first consumer)

Library of Leng: "You have no maximum hand size. If an effect causes you to
discard a card, discard it, but you may put it on top of your library
instead of into your graveyard."

- **No maximum hand size.** The CLEANUP handler's hand-size while-loop
  compares against `effectiveMax = ns[ac].bf.some(c => c.id ===
  'library_of_leng') ? Infinity : ns.ruleset.maxHandSize` (`ac` = the active
  player, checked against only their own battlefield -- a player only
  discards to hand size at their own cleanup). No other `maxHandSize`
  consumer exists in DuelCore.js.
- **ASSUMPTION A -- graveyard-first, retroactive lift (binding on this
  consumer and any future one with the same shape).** The replacement does
  NOT suspend the discard. `apply(state, who, payload)` performs the exact
  same mutation tail as `discardCard`'s own non-replaced path (factored into
  an internal `performDiscardMutation(state, who, card, payload)` helper so
  the two paths stay byte-identical) -- the card moves to `gy` and
  `ON_DISCARD` fires normally. Only after that does `apply` offer the
  player a choice to lift the card from the graveyard to the top of the
  library. Rationale: suspending mid-effect (e.g. mid-Wheel-of-Fortune,
  which discards a whole hand in a single `for` loop before drawing 7) would
  strand cards in a ghost state while the effect continues. The transient
  graveyard membership between discard and choice resolution is a
  documented simplification; no shipped `ON_DISCARD` consumer can observe
  the difference.
- **Choice shape.** `pendingChoice.kind === 'discardToLibraryChoice'`,
  `controller` = the discarding player, `sourceCardId` = the Library of
  Leng permanent's iid, `cardIid` = the currently-offered card's iid,
  `options: [{id:'graveyard',...}, {id:'library',...}]`, `queuedIids: []`.
  Created directly by `DISCARD_REPLACEMENTS['library_of_leng'].apply`
  (not a triggered ability), resolved by its own direct `RESOLVE_CHOICE`
  branch (`choice.kind === 'discardToLibraryChoice'`) alongside the other
  non-triggered-ability kinds (`bandAttackerDamageOrder`, `colorChoice`,
  `primalClayChoice`, `modalChoice`, `basicLandTypeChoice`, `numberChoice`).
- **`queuedIids` chaining contract.** A single `pendingChoice` slot handles
  a multi-card discard (Wheel of Fortune, Mind Bomb, ...): the first
  intercepted card in a given `discardCard`/`apply` sequence creates the
  choice; each subsequent intercepted card (while a `discardToLibraryChoice`
  for the same controller is still pending) appends its iid to
  `queuedIids` instead of creating a new choice. Each `RESOLVE_CHOICE`
  answers the current `cardIid`; if `queuedIids` is non-empty, the next iid
  is shifted into `cardIid` (with freshly rebuilt option labels for that
  card's name) and the choice stays pending; otherwise `pendingChoice`
  clears. If the resolved card is no longer in the graveyard (moved by
  something else mid-chain), the choice fizzles with a dlog line and the
  chain advances -- it does not throw.
- **ASSUMPTION B -- collision degradation.** `pendingChoice` is a single
  slot. If it is already occupied by anything other than a
  `discardToLibraryChoice` for the same controller when Leng's replacement
  would create/append one, `apply` logs `console.error` and returns state
  with the card already moved to the graveyard (equivalent to the player
  having chosen "graveyard") -- it never overwrites an existing
  `pendingChoice`. Unreachable under current shipped cards (nothing else
  creates a competing pendingChoice inside the same `discardCard` call);
  documented explicitly for future registry consumers with the same shape.
- **AI policy.** `chooseDiscardToLibrary(choice, state)` (src/engine/AI.js,
  same shape/placement as `chooseBandingDamageOrder`) is a pure function:
  looks up `choice.cardIid` in the AI's own graveyard and returns
  `'library'` for a nonland whose cmc is at most the AI's own land count,
  `'graveyard'` otherwise (including when the card can't be found).
  Dispatched from `useDuelController.ts`'s `pendingChoice.controller ===
  'o'` branch, ahead of the `pay_gggg` logic and its blind `options[0]`
  fallback -- the same precedent as the banding-order dispatch immediately
  above it.

## 7.8 `additionalCost` Cast-Flow Mode and Sacrifice (Phase 3)

General "additional cost to cast" infrastructure for spells, added alongside
the cast-flow state machine's existing X-select/targeting/mana steps. One
shipped consumer this phase: Sacrifice ("As an additional cost to cast this
spell, sacrifice a creature. Add an amount of {B} equal to the sacrificed
creature's mana value.").

- **Card field.** `card.additionalCost: { type: 'sacrificeCreature' }`. The
  shape is deliberately extensible (a future `{ type: 'discard', count: n }`
  variant is anticipated) but **only `sacrificeCreature` is implemented**.
  The gate everywhere in this mechanism checks `additionalCost?.type ===
  'sacrificeCreature'` exactly, not mere field presence -- a card shipped in
  the future with a different, unimplemented `additionalCost.type` would
  fall through every gate below with no legality enforcement at all. Any new
  `type` must extend these gates deliberately; do not assume the existing
  ones generalize.
- **Cast-flow sequence.** `xSelect -> targeting -> additionalCost -> mana ->
  dispatch` (`CastFlowMode` in `useDuelController.ts`). A card carrying
  `additionalCost` never takes the pre-existing "no target, already
  affordable -> instant cast" shortcut, even when otherwise eligible for it
  -- `beginCastFlow` and `advanceCastFlow`'s spell branch both gate on
  `card.additionalCost?.type === 'sacrificeCreature'` ahead of any
  `canPay`/instant-dispatch check.
- **Initiation-time legality gate.** If the caster controls zero creatures
  when a `sacrificeCreature`-cost card is clicked in hand, the cast cannot
  begin at all (`beginCastFlow`: `selectCard(null); return;`, same treatment
  as `xMax < 0` for X spells). `CAST_SPELL` re-checks this at the reducer
  level too (defense in depth): an invalid or missing
  `action.additionalCostIid`, or one that doesn't resolve to a creature on
  `s[w].bf`, blocks the cast with a `console.warn` and an unchanged state.
- **Picker mechanics.** `castFlow.additionalCostSelection: string | null`
  (null while the mode is open and unresolved). `selectAdditionalCost(iid)`
  (`useDuelController.ts`, alongside `selectCastTarget`) validates the
  clicked permanent is in `s.p.bf` and passes `isCre`, then sets the
  selection and auto-advances (`_advance: true`, same shape as
  `confirmCastTargets`'s advance). Any creature the caster controls is
  eligible regardless of tap state or summoning sickness. Both
  `DuelScreen.tsx` and `DuelScreenMobile.tsx` route battlefield clicks to
  `selectAdditionalCost` during `castFlow.mode === 'additionalCost'`;
  ineligible clicks (opponent's board, noncreature permanents) are a no-op,
  matching `'targeting'` mode's existing click-routing shape. The
  `'targeting'`-mode cast-prompt UI (`Banner.tsx`, both desktop and mobile)
  is reused unchanged for `'additionalCost'` -- only the label text and
  mode-gated Confirm/Skip buttons differ (neither renders here, since
  selection auto-advances).
- **Atomic payment.** `CAST_SPELL` (`DuelCore.js`) pays the additional cost
  as one more step of its existing single-transaction mutation, alongside
  mana payment and the hand-to-stack move, before the item is pushed onto
  the stack. `action.additionalCostIid` is threaded through the same way
  `action.tgt`/`action.xVal` already are (`useDuel.js`'s `castSpell`
  wrapper). The sacrificed creature is moved `bf -> gy` via `zMove` (no
  `checkDeath`/`ON_PERMANENT_LEAVES_BF` -- same convention as every other
  direct-sacrifice-as-cost site in the file, e.g. Leviathan's attack-cost
  land sacrifice). The stack item gains `additionalCostPaid: { type:
  'sacrificeCreature', card: <full pre-sacrifice card object> }` so
  `resolveEff` can read the sacrificed creature's `cmc` without re-querying
  a now-gone zone.
- **Rollback symmetry.** `additionalCostSnapshot` / `UNDO_ADDITIONAL_COST`
  mirror `manaTapSnapshot` / `UNDO_MANA_TAPS` structurally: `cancelCastFlow`
  dispatches `UNDO_ADDITIONAL_COST` whenever `s.additionalCostSnapshot !==
  null`, in the same cancel action as the mana-snapshot check (order between
  the two doesn't matter -- they touch disjoint zones). `UNDO_ADDITIONAL_COST`
  reinserts the snapshotted card at its original `bfIndex` (clamped
  defensively if the board shape changed) and removes it from `gy`.
  **Narrowness of this rollback path in practice:** because sacrifice-target
  selection is client-side `castFlow` state only (no per-selection engine
  dispatch, unlike incremental `TAP_LAND` calls before a cast), and
  `CAST_SPELL` pays the cost and clears `additionalCostSnapshot` back to
  `null` atomically within the same transaction that pushes the stack item,
  there is no real-flow window where `cancelCastFlow` observes a non-null
  `additionalCostSnapshot` for `sacrificeCreature` -- the guard exists for
  structural parity with `manaTapSnapshot` and to cover any future
  `additionalCost` type whose payment is NOT atomic in this same way.
  Reset to `null` at fresh-state construction and at end-of-turn `CLEANUP`,
  alongside `manaTapSnapshot`.
- **Resolution.** `resolveEff` effect key `addManaFromSacrificedValue` adds
  `{B}` x `item.additionalCostPaid.card.cmc` to the caster's mana pool.
  Instant speed, no target. Like all mana added outside a cast's own
  payment, it is subject to `burnMana`'s existing "mana burns at every phase
  boundary" rule (GDD Bug B6) if left unspent.

## 7.9 Creature Damage Shields (`hurtCreature` Choke Point)

A single choke point for "an amount of damage is about to be dealt to a
specific creature," added to unstub Jade Monolith and Personal Incarnation.
Mirrors `hurt()`'s player-level `turnState.damageShields` system directly,
but keyed by creature `iid` instead of player, and is a wholly separate,
additive mechanism -- it does not touch, replace, or reorder `dmgWithShield()`
(the pre-existing flat `damageShield` prevention system used at combat and 9
other call sites), which remains checked afterward, unchanged.

- `hurtCreature(state, targetIid, amt, src = "", meta = null)`
  (src/engine/DuelCore.js, placed adjacent to `dmgWithShield`) is the sole
  choke point for the raw `damage: c.damage + N` mutation pattern that used
  to appear at 24 sites throughout `resolveEff` and one `ACTIVATE_ABILITY`
  case (desertPing). It:
  1. Looks up the target creature on either `state.p.bf` or `state.o.bf`;
     not found: `console.error` and return state unchanged (same
     not-found philosophy as `tapPermanent`/`discardCard`).
  2. Calls `consumeCreatureDamageShields(state, targetIid, amt, meta)` to
     get a `remainingAmt`.
  3. If `remainingAmt > 0`, applies it as a raw `damage` mutation to the
     target creature.
  4. Calls `checkDeath(state)` once (unconditionally) and returns the
     result -- migrated call sites no longer need their own trailing
     `checkDeath` call.
  - One exception was deliberately NOT migrated: the player-to-creature
    damage redirect inside `hurt()`'s `getDamageRedirectTarget` branch (an
    existing, unrelated mechanic where damage dealt to a PLAYER is
    redirected to a creature they control) -- it stays a raw mutation.
- `consumeCreatureDamageShields(state, targetIid, amt, srcMeta)` (exported,
  placed immediately above `hurtCreature`) returns `{ state, remainingAmt }`.
  Reads `state.turnState.creatureDamageShields[targetIid]` (a plain array,
  absent/undefined treated as empty). Two entry shapes:
  - **Exact-source, whole-amount redirect** (Jade Monolith):
    `{ mode: 'redirect', chosenSourceIid, redirectToPlayer, shieldSourceIid, shieldSourceName }`.
  - **Point redirect** (Personal Incarnation):
    `{ mode: 'redirectPoint', redirectToPlayer, shieldSourceIid, shieldSourceName }`
    -- no `chosenSourceIid`, matches any source.
  - **Priority order, checked in sequence:**
    1. Exact-source pass: if any entry has `mode === 'redirect'` and
       `chosenSourceIid === srcMeta?.sourceIid`, that ONE entry is consumed
       (removed from the array) and the ENTIRE `amt` is redirected via
       `hurt(state, redirectToPlayer, amt, shieldSourceName, null)` (the
       `meta: null` recursion guard mirrors `hurt()`'s own convention).
       Returns `remainingAmt: 0` -- nothing left to apply to the creature.
    2. Point-redirect pass, only reached if no exact-source match: while
       `remainingAmt > 0`, repeatedly finds the first remaining
       `mode === 'redirectPoint'` entry (array order = FIFO, i.e. add
       order), consumes it, and redirects exactly 1 point via `hurt()`.
       Stops when `remainingAmt` reaches 0 or no `redirectPoint` entries
       remain. Non-matching `redirect`-mode entries encountered along the
       way are left untouched (they may still match a later event this
       turn from their actual chosen source).
- `turnState.creatureDamageShields` is a plain object keyed by creature
  `iid`, initialized to `{}` at both turnState construction sites (new-game
  and end-of-turn `CLEANUP`) alongside the pre-existing `damageShields`, and
  cleared the same way every turn -- shields do not persist across turns.
- **The 9 `dmgWithShield()` call sites** (unchanged themselves) each gained
  one inserted statement immediately before the existing call:
  `consumeCreatureDamageShields` runs first against the target creature and
  the raw `amount`, and the resulting `remainingAmt` (not the original
  amount) is what gets passed into `dmgWithShield(c, remainingAmt)`. This
  composes the two systems in a fixed order -- creature shield first, flat
  `damageShield` second -- for: Tracker's two-way exchange (both sides),
  Winter Blast's per-flier loop, Banshee's half-X split, Volcanic Eruption's
  per-creature loop, and all 4 combat-damage sites (regular/first-strike x
  attacker/blocker). Blocking order, first-strike sequencing, and every
  other combat mechanic are untouched -- this is strictly an additional
  damage-amount adjustment before the existing prevention math runs.
- **Jade Monolith** (`chooseDamageShieldSourceForTarget`): shares
  `buildDamageShieldPool` and the AI-vs-human branching with
  `chooseDamageShieldSource` (Circle of Protection / Eye for an Eye /
  Greater Realm of Preservation) via an extracted shared helper,
  `resolveDamageShieldChoice(ns, card, caster, tgtC)`. When `tgtC` is
  present, the resulting entry lands in
  `turnState.creatureDamageShields[tgtC.iid]` with the `mode: 'redirect'`
  shape (`redirectToPlayer` always the caster), instead of
  `turnState.damageShields[caster]`. The human-choice path threads the
  target through via an optional `tgtIid` field on `pendingDamageShieldChoice`,
  read by `RESOLVE_DAMAGE_SHIELD_CHOICE` to pick which store/entry-shape to
  write. Click-routing restricts the ability's target to a creature via
  `isCreatureOnlyTarget`/`CREATURE_ONLY_TARGET_EFFECTS` (useDuelController.ts,
  mirrors `isPlayerOnlyTarget`/`PLAYER_ONLY_TARGET_EFFECTS`'s shape) --
  checked in both `DuelScreen.tsx` and `DuelScreenMobile.tsx`'s
  `'targeting'`-mode battlefield click handler. The `!isCre(tgtC)` fizzle
  inside the `chooseDamageShieldSourceForTarget` case itself is
  defense-in-depth (the reducer is the trust boundary), not the primary
  enforcement.
- **Personal Incarnation** (`addCreatureDamageShieldSelf`): a `{0}`
  activated ability, self-only, no target. Each activation pushes one more
  `mode: 'redirectPoint'` entry onto `turnState.creatureDamageShields[card.iid]`
  (`card` = the activating permanent itself). No per-activation limiter
  exists in this engine (verified absent before this phase), so the ability
  is freely repeatable in the same window like any other activated ability
  -- stacking N activations arms N one-point shields for that turn. The
  death-trigger clause ("When this creature dies, its owner loses half their
  life, rounded up") reuses the pre-existing `loseHalfLifeRoundedUp` trigger
  effect handler via a `triggeredAbilities` entry on the card
  (`ON_CREATURE_DIES`, `scope: 'self'`) -- no engine change was needed for
  that half.

## 7.10 Land Destruction (`destroyLand` Choke Point) + Pyramids

A single choke point for "a land is about to be destroyed," replacing 9 ad
hoc `zMove(..., "gy")` call sites scattered across 8 mechanics. Mirrors
`hurtCreature`'s shape (lookup, not-found philosophy, shield check before the
raw mutation) but for lands, with no `checkDeath` equivalent needed.

- `destroyLand(state, targetIid, src = "", meta = null)`
  (src/engine/DuelCore.js, placed adjacent to `hurtCreature`) is the sole
  choke point for land destruction:
  1. Looks up the target land on either `state.p.bf` or `state.o.bf`; not
     found: `console.error` and return state unchanged.
  2. Checks `state.turnState.landDestructionShields[targetIid]` (plain
     array, absent treated as empty). If non-empty, consumes the FIRST entry
     (FIFO), `dlog`s `"<shieldSourceName>: <land name> is not destroyed."`,
     and returns WITHOUT performing the `zMove` -- the land survives. No
     explicit "remove damage" side effect is modeled, since this engine does
     not track a meaningful `damage` stat on lands; the prevention itself is
     the observable effect.
  3. Otherwise performs `zMove(state, targetIid, side, side, "gy")` and, if a
     message is available, `dlog`s it: `meta.message` if given, else the
     default `"<src> destroys <land name>."` when `src` is non-empty, else
     silent. The silent case is for the mass-destroy loops
     (`destroyAllLands`/`destroyIslands`/`destroyPlains`/`destroyForests`),
     which already log a single batch message outside the per-land loop and
     must not gain new per-land log lines as a migration side effect.
- `turnState.landDestructionShields` is a plain object keyed by land `iid`,
  value an array of `{ shieldSourceIid, shieldSourceName }` entries (array
  for shape-consistency with `creatureDamageShields`/`damageShields`, though
  in practice length is almost always 0 or 1). Initialized to `{}` at both
  turnState construction sites (new-game and end-of-turn `CLEANUP`)
  alongside `creatureDamageShields`, and cleared the same way every turn.

### Migrated sites (9)

| Site | Notes |
|---|---|
| `destroyTargetLand` | Gained an `INDESTRUCTIBLE` check it did not previously have (`hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)`, mirroring `destroyArtifact`/`destroyArtOrEnch`'s existing pattern) -- MTG rules-accuracy fix, confirmed with the project owner during this phase. Check happens before `destroyLand()` is called; `destroyLand()` does not itself know about indestructible. |
| `destroyAllLands` (Armageddon), `destroyIslands`, `destroyPlains`, `destroyForests` | Loop bodies call `destroyLand(ns, c.iid)` (no `src`) once per land, same iteration order as before; the existing single batch `dlog` (before or after the loop, per site) is untouched. |
| `kudzuUpkeep` | Only the `enchLand` zMove migrated (`destroyLand(ns, enchLand.iid, "Kudzu")`). Kudzu's own two "falls off the battlefield" zMove calls (unattached; no lands remain) are a different card leaving play, not a land being destroyed, and remain raw/unmigrated. |
| Erosion, AI branch (inline upkeep) and human `erosionUpkeep` (`UPKEEP_CHOICE_HANDLERS`) | Both call `destroyLand(..., "", { message: "Erosion destroys the enchanted land." })` to preserve the exact pre-existing fixed wording (which does not include the land's name). |
| `blightDestroyHost` | Calls `destroyLand(state, hostIid, "", { message: "Blight destroys the enchanted land." })`, same fixed-wording reasoning as Erosion. |

### Sacrifice-vs-destroy boundary (NOT migrated)

Sacrifice and destruction are different actions in Magic's rules; Pyramids'
text specifically says "destroyed," so sacrifice sites must not consult
`landDestructionShields`. Four sites remain raw, unmigrated `zMove` calls by
design: Balance's excess-land trim (`case "balance"`), Elder Spawn's
Island-sacrifice upkeep (`elderSpawnUpkeep`), and Leviathan's two-Island
sacrifice upkeep (`sacIslandsToUntapSelf`, both the AI-inline branch and the
human `UPKEEP_CHOICE_HANDLERS` entry). Mold Demon's "sacrifice two Swamps"
ETB clause is the same category (discovered during this phase's pre-flight
audit; not one of the four cards enumerated above but confirmed sacrifice,
not destroy, and left untouched).

### `getEffectiveAbilityEffect` and `isLandOnlyTarget` (click-routing)

`useDuelController.ts` gained a third targeting-effect resolution shape.
Previously, `isPlayerOnlyTarget`/`isCreatureOnlyTarget` read `card?.effect`
and/or `card?.activated?.effect` directly. Pyramids is the first card whose
targeting effect is sourced from the `activatedAbilities[]` array shape
(shared with Mishra's Factory), keyed by `abilityId` rather than a single
field, so a shared helper now resolves all three shapes uniformly:

```ts
function getEffectiveAbilityEffect(card, abilityId?): string | undefined {
  if (abilityId && card?.activatedAbilities) {
    return card.activatedAbilities.find(a => a.id === abilityId)?.effect;
  }
  return card?.activated?.effect ?? card?.effect;
}
```

`isPlayerOnlyTarget`/`isCreatureOnlyTarget` were refactored to use this
helper via an added optional `abilityId` parameter, with no behavior change
for any existing member (Jade Monolith; regression-tested). A new
`LAND_ONLY_TARGET_EFFECTS`/`isLandOnlyTarget(card, abilityId)` pair mirrors
`CREATURE_ONLY_TARGET_EFFECTS`/`isCreatureOnlyTarget` exactly, with
`preventLandDestructionOnce` as its sole member. Both `DuelScreen.tsx` and
`DuelScreenMobile.tsx` thread `castFlow.abilityId` through all three guards
at their `'targeting'`-mode battlefield click handler, and gained a third
guard line (`isLandOnlyTarget(castingCard, castFlow.abilityId) && !isLand(card)`)
alongside the existing player-only and creature-only guards.

### Array-shaped ability infrastructure gaps closed by this phase

Three pre-existing gaps in the `activatedAbilities[]` array-ability
machinery were load-bearing for Pyramids and were fixed as part of this
phase (none were caused by this phase; all were previously dormant because
no prior array-shaped ability both required a target AND cost mana):

- **`ACTIVATE_ABILITY` reducer, array branch** (DuelCore.js): previously
  hardcoded exactly four `ab.effect` values (`animateLand`,
  `pumpAssemblyWorker`, `desertPing`, `grantWalkSelfDamage2`) and silently
  no-op'd (`return s`) for anything else. Gained a generic branch for
  `destroyLandAura`/`preventLandDestructionOnce`: pays `ab.cost.generic`
  (as a plain digit string via `canPay`/`payMana`), then dispatches through
  `resolveEff` directly (no stack push -- matches this branch's existing
  immediate-resolution convention for its other members) via a synthesized
  stack-item shape (`{ id, card: {...card, effect: ab.effect}, caster: w,
  targets: [tgt], xVal: 1 }`), the same pattern `addMana`/`addManaReflected`
  already use.
- **Ability-cost shape normalization** (useDuelController.ts): array-shaped
  abilities store `cost` as an object (`{generic:N}`, `{tap:true}`), but
  `advanceCastFlow` and the `mode:'mana'` auto-advance effect read `ab.cost`
  directly as a mana-cost string for `canPay()`/`.toUpperCase()`. A new
  `normalizeAbilityCost(cost)` helper (exported) converts `{generic:N}` to
  `"N"` before use, at both read sites in `useDuelController.ts` and in the
  `castPrompt.costNeeded` computation in both `DuelScreen.tsx` and
  `DuelScreenMobile.tsx` (the latter, unguarded, would call `.replace` on a
  plain object and crash the whole React tree the moment a target-requiring,
  mana-costed array ability entered `castFlow` -- discovered via the
  Playwright suite for this phase).
- **Mobile multi-ability activation UI**: `AbilityMenuPopover` (the "choose
  one ability" popover) previously existed only in `DuelScreen.tsx` as a
  local, non-exported function, with no mobile equivalent -- mobile's
  `handleActivateBf` unconditionally called `beginActivateFlow(sel.card,
  null)`, which resolves only the single `card.activated` shape and silently
  no-ops for any `activatedAbilities`-array card (Mishra's Factory
  included). Extracted to a shared `src/ui/duel/AbilityMenuPopover.tsx`
  (added `data-testid="ability-menu"` / `data-testid="ability-option-<id>"`
  for e2e selection) and wired into `DuelScreenMobile.tsx` with its own
  local `abilityMenu` state and `handleAbilityMenuSelect`, mirroring
  desktop's. Also fixed `handleLandTap` (the dedicated tap-for-mana click
  handler `LandPip` uses on mobile, which bypasses `handleBfCardClick`
  entirely) to check `castFlow?.mode === 'targeting'` first and route
  through the same three click-routing guards + `selectCastTarget`, since
  Pyramids mode 2 is the first ability requiring a player to click a LAND as
  a target while an untapped-land-taps-for-mana quick-click handler exists.

### Pyramids (`activatedAbilities`)

```js
activatedAbilities: [
  { id: "pyramids_destroy_aura", cost: { generic: 2 }, effect: "destroyLandAura", ... },
  { id: "pyramids_prevent_destruction", cost: { generic: 2 }, effect: "preventLandDestructionOnce", ... },
]
```

Mode 1 reuses `destroyLandAura` (Savaen Elves' effect) completely
unchanged -- no new engine code for that half, and no change to Savaen
Elves' own behavior or its pre-existing targeting gap (it is not a member of
`ACTIVATE_TARGET_EFFECTS`, so its own UI targeting flow has the same
long-standing limitation this phase did not touch). Mode 2's `resolveEff`
case (`preventLandDestructionOnce`) fizzles on a missing/non-land target
(defense-in-depth; unreachable through normal play once `isLandOnlyTarget`
gates the click), otherwise pushes a `{ shieldSourceIid: card.iid,
shieldSourceName: card.name }` entry onto
`turnState.landDestructionShields[tgtC.iid]`.

## 7.11 Protection (DEBT) -- `isProtectedFromSource` + Artifact Ward

Extends the pre-existing, color-only "protection from quality" system with an
"artifact" type-based quality, and adds the T (targeting) and non-combat D
(damage) legs of the DEBT model (Damage, Enchant/equip, Block, Target) that
this codebase previously left unenforced. Artifact Ward is the first card to
exercise the full set.

- **`isProtectedFromSource(target, sourceCard, state)`** (exported,
  `src/engine/DuelCore.js`, adjacent to `consumeCreatureDamageShields`) is
  the sole new shared helper. Reads `target`'s protection through
  `computeCharacteristics(target, state).protection` (not a raw
  `target.protection` field read) so Aura-granted protection -- the Ward
  cycle, Artifact Ward -- is respected. Returns `true` if `prot` contains
  `'artifact'` and `isArt(sourceCard)`, or if `prot` contains a quality
  matching `sourceCard`'s color (via the same `PROT_MAP` letter/word
  fallback the 4 pre-existing combat sites already used). This is the ONLY
  new shared function -- the 4 pre-existing color-only combat sites
  (`canBlockDuel`, the two `resolveCombat` damage-prevention checks,
  `DECLARE_BLOCKER`'s explicit check) each kept their own independent
  `PROT_MAP`/`PROT_CMAP`/`PROT_COLOR_MAP` constant and gained one additional,
  inline `artifact`-matching branch instead of being consolidated.
  - `canBlockDuel` already read protection via `computeCharacteristics` when
    `state` was passed; its color-match `.some()` calls gained an
    `|| (q === 'artifact' && isArt(otherCreature))` branch.
  - The two `resolveCombat` damage-prevention checks (`blockerProtectsFromAtt`
    / `attackerProtectsFromBl`, one per first-strike/regular damage pass)
    previously read protection from the RAW `bl.protection`/`att.protection`
    field, which never carries an Aura's `mod.protection` -- only intrinsic
    printed protection. The artifact leg of each flag is therefore computed
    separately via `computeCharacteristics`, so a Ward-cycle-style Aura
    attached mid-combat (after blocks are already declared, before damage)
    is correctly caught by this backstop, not just by `canBlockDuel`'s
    declare-time gate. The pre-existing color leg's data source is
    unchanged.
  - `DECLARE_BLOCKER`'s explicit check previously only ran `if
    (att.protection)` (a raw-field truthy gate, which Aura-granted
    protection never satisfies) and read `att.protection` directly. Both are
    now sourced from `computeCharacteristics(att, s).protection`, with the
    per-quality match extended to `quality === 'artifact' ? isArt(bl) :
    bl.color === (PROT_COLOR_MAP[quality] || quality)`. The dlog message
    format (`"<blocker> cannot block <attacker> (protection from
    <quality>)."`) is unchanged.
- **Non-combat damage** (T-adjacent D leg): `consumeCreatureDamageShields`
  gained a protection check at the very top, before the existing
  exact-source and point-redirect shield passes. Resolves the source card
  via `srcMeta.sourceIid` across both battlefields (`getBF`) and the stack
  (mirrors `buildDamageShieldPool`'s lookup). If
  `isProtectedFromSource(targetCreature, sourceCard, state)`: prevents the
  ENTIRE amount (`remainingAmt: 0`), logs `"<target> is protected from
  <source> (protection from <quality>)."`, and does NOT touch
  `turnState.creatureDamageShields` -- protection is a static property, not
  a consumable resource, so a creature's other one-shot shields remain
  armed for later, non-matching damage the same turn. Because this check
  lives in the shared choke point, all 9 `dmgWithShield()` call sites (5
  non-combat + the 4 combat sites) and every `hurtCreature` caller inherit
  it for free -- no per-site change was needed beyond the 4 combat sites'
  own `blockerProtectsFromAtt`/`attackerProtectsFromBl` flags (which also
  gate deathtouch marking, lifelink, and trample overflow, so those still
  needed their own artifact-aware computation; see above).
- **Targeting legality** (T leg, wholly new): `CAST_SPELL` and the plain
  single-ability `ACTIVATE_ABILITY` path (the `card.activated`-shaped
  branch) each gained a preflight check: if `action.tgt`/`tgt` resolves to a
  battlefield permanent (`getBF`) and `isProtectedFromSource(tgtPerm, card,
  state)` is true, the cast/activation is rejected outright via `dlog` --
  no stack item is constructed, no mana is spent, no cost is paid. Message
  format: `"<card> can't target <permanent> (protection from
  <quality>)."`. Placed before any cost payment (CAST_SPELL: before the
  `xSpend`/`canPay` block; ACTIVATE_ABILITY: before the tap/mana cost
  steps, alongside the existing sacArt/sacCre/counter2 preflight gates).
  **Deliberately NOT touched**: the Pyramids-specific array-ability branch
  (`activatedAbilities`, `destroyLandAura`/`preventLandDestructionOnce`) --
  out of scope per this phase's boundary, confirmed via source inspection
  in the test suite. `RESOLVE_STACK` / modal-choice resolution is never
  re-checked -- the cast-time gate already covers legality before any modal
  choice is presented.
- **Click-time guard** (UI mirror of the T leg): both `DuelScreen.tsx` and
  `DuelScreenMobile.tsx` import `isProtectedFromSource` directly from
  `DuelCore.js` (rather than duplicating the color/artifact match logic
  client-side) and add one new, unconditional guard --
  `if (isCre(card) && castingCard && isProtectedFromSource(card,
  castingCard, s)) return;` -- at the same targeting-mode click-routing
  location as the existing `isPlayerOnlyTarget`/`isCreatureOnlyTarget`/
  `isLandOnlyTarget` guards (3 call sites total: `DuelScreen.tsx`'s
  `handleCardClick`, `DuelScreenMobile.tsx`'s `handleBfCardClick` and
  `handleLandTap`). Unlike those three, there is no membership Set -- this
  guard runs for every targeting click regardless of the casting card's
  effect name, and correctly reads Aura-granted protection because
  `isProtectedFromSource` is the same `computeCharacteristics`-backed
  function used everywhere else.
- **DEBT enforcement matrix** (this codebase, post-phase):

  | Letter | Meaning | Enforced? | Where |
  |---|---|---|---|
  | D | Damage | Yes (combat + non-combat) | `resolveCombat` (2 sites), `consumeCreatureDamageShields` |
  | E | Enchant/equip | **No** -- explicit non-goal | -- |
  | B | Block | Yes | `canBlockDuel`, `DECLARE_BLOCKER` |
  | T | Target | Yes | `CAST_SPELL`, `ACTIVATE_ABILITY` (plain path), click-time guard |

  The "E" clause (protection from being enchanted/equipped) is intentionally
  NOT implemented -- Artifact Ward's oracle text doesn't need it, and no
  other card in the pool currently depends on it. A future card requiring E
  should add its enforcement at the `enchantCreature`/equip attach sites
  rather than assuming `isProtectedFromSource` already covers it -- it does
  not.
- **Qualities**: `KEYWORDS.PROTECTION.qualities` (`src/data/keywords.js`)
  gained `"ARTIFACT"` alongside the 5 colors. This array is descriptive
  metadata only -- nothing in the codebase consumes it programmatically
  (verified before adding).

## 7.12 Tawnos's Coffin Exile/Return (Untap-Detection Insertion Points)

Tawnos's Coffin ("You may choose not to untap this artifact during your
untap step. {3}, {T}: Exile target creature and all Auras attached to it...
When this artifact leaves the battlefield or becomes untapped, return that
exiled card...") is the first card to combine `optionalUntapAlways` with a
snapshot-before-`zMove` exile/return pattern. Two reusable precedents were
extended; no new general-purpose systems were built.

- **`optionalUntapAlways` artifact-branch fix.** Before this phase, the
  UNTAP-phase map (`DuelCore.js`, the `stasisOut`-guarded block) only
  honored `c.optionalUntapAlways` inside the `isCre(c)` branch; the
  non-creature branch checked `c.whileTappedPump` only. Since
  `optionalUntapAlways`'s only prior user (Phyrexian Gremlins) is a
  creature, this gap was latent and untested. Tawnos's Coffin is an
  artifact, so the non-creature branch's check was widened to `c.optionalUntap
  && c.tapped && (c.whileTappedPump || c.optionalUntapAlways)`. This does not
  change Phyrexian Gremlins' behavior (creature branch untouched) or Ashnod's
  Battle Gear/Tawnos's Weaponry's behavior (still gated on `whileTappedPump`,
  now simply OR'd with a flag they don't set) -- it only activates for
  permanents that set `optionalUntapAlways` without being a creature, which
  today is Tawnos's Coffin alone.
- **Snapshot-before-`zMove` pattern** (`tawnosCoffinExile`, the `resolveEff`
  case for the activated ability): `zMove` unconditionally strips `counters`
  on every zone change and cascades a departing permanent's embedded
  `enchantments` to their controller's graveyard (S10) -- neither of which
  this card wants. The exile action snapshots `{ ...tgtC.counters }` and
  every attached Aura (both embedded, via `tgtC.enchantments`, and the
  hypothetical Kudzu-style separate-permanent case, via a generic
  `enchantedCreatureIid` scan across both battlefields -- no real card uses
  this host-field shape yet; the check is forward-compatible, not
  load-bearing) BEFORE calling `zMove`, storing the snapshot on Tawnos's
  Coffin itself as `exiledCreatureIid` / `exiledCreatureOwner` /
  `exiledCreatureCounters` / `exiledAuraRecords`. The target creature's own
  `enchantments` array is cleared to `[]` immediately before its `zMove`
  call specifically so the cascade-to-graveyard block has nothing left to
  cascade -- the data already lives in the snapshot.
- **`tawnosCoffinReturn(state, sourceCard)`** (module-private helper,
  `DuelCore.js`, directly above `resolveTriggeredEffect`) is the single
  shared resolver for "return that exiled card," called from three sites:
  1. The `tawnosCoffinReturn` triggered-effect case in
     `resolveTriggeredEffect`, reached via Tawnos's Coffin's own
     `ON_PERMANENT_LEAVES_BF` (`scope:'self'`) triggered ability -- the same
     `findLeftBattlefieldCard`-sourced `sourceCard` pattern Titania's Song's
     `titaniasSongPersist` and Cyclopean Tomb's `createCyclopeanTombEmblem`
     already use to read a just-departed permanent's custom tracking fields.
  2. The UNTAP-phase map, insertion point 1 of 2: a `preUntapCoffins`
     snapshot (cards with `id === 'tawnos_coffin'`, tapped, with
     `exiledCreatureIid` set) taken immediately before the map runs is
     compared against the map's own output; any coffin the map itself
     untapped gets `tawnosCoffinReturn` called inline with the live,
     post-map permanent as `sourceCard`.
  3. The `optionalUntap` upkeep-choice resolver, insertion point 2 of 2:
     after setting `tapped: false` on an `action.choice === "UNTAP"`
     resolution, if the untapped permanent is Tawnos's Coffin with
     `exiledCreatureIid` set, `tawnosCoffinReturn` is called the same way.

  The resolver moves the exiled creature back to the battlefield via
  `zMove`, then explicitly re-sets `tapped: true`, restores `counters` from
  the snapshot, and restores embedded Auras onto `enchantments` -- all
  fields `zMove`'s return-to-battlefield path resets or drops. Kudzu-style
  separate-permanent Auras (if any were ever captured) are `zMove`'d back
  independently and re-pointed at the returned creature's iid. If the
  exiled card is no longer in exile (removed by an unrelated effect in the
  meantime), the resolver fizzles gracefully and does not attempt any Aura
  return either. Tawnos's Coffin's own tracking fields are cleared only if
  it is still found on a battlefield after the return (the untap-path
  case) -- when `sourceCard` arrived via the leaves-bf path it is already
  gone, so there is nothing left to clear.
- **No general `ON_UNTAP` event was built.** Unlike `ON_TAP`
  (Section 7.5), there is no codebase-wide "a permanent just untapped"
  event -- the two insertion points above are narrow, `id ===
  'tawnos_coffin'`-gated checks at the only two places a permanent can
  become untapped through this codebase's existing mechanisms, not a new
  general-purpose subsystem. A permanent untapping via any OTHER mechanism
  (e.g. a hypothetical "untap target artifact" effect) does **not** trigger
  a Tawnos's Coffin-style return -- this is a deliberate, accepted scope
  boundary, not a bug. Any future card needing a similar "becomes untapped"
  check should add its own narrow, id-gated check at the relevant site(s)
  rather than assuming a general `ON_UNTAP` event already exists.

---

## 7.13 One-Shot Phasing (Oubliette)

Oubliette ("When this enchantment enters, target creature phases out until
this enchantment leaves the battlefield. Tap that creature as it phases in
this way.") is the second card built on the snapshot-before-`zMove` exile/
return machinery from S7.12, reusing it rather than building a new phasing
subsystem. This is explicitly **one-shot** phasing only -- a permanent
phases out exactly once, when a specific source enters, and phases back in
exactly once, when that source leaves. It is not a general per-turn Phasing
keyword (phasing out/in at every untap step); a future Premodern milestone
that needs real Phasing must build its own system on top of this one, not
replace it.

- **`snapshotAndExileCreature(state, tgtC, { suppressLeaveEvent = false } =
  {})`** (module-private helper, `DuelCore.js`) is `tawnosCoffinExile`'s body
  extracted so both cards share it: snapshot counters, collect embedded +
  Kudzu-style aura records, strip `enchantments` before `zMove` so its
  cascade-to-graveyard block has nothing to cascade, then `zMove` the
  creature (and each Kudzu aura) to exile. Returns `{ state, tracking }`
  where `tracking` is `{ exiledCreatureIid, exiledCreatureOwner,
  exiledCreatureCounters, exiledAuraRecords }` -- the same shape
  `tawnosCoffinExile` used to write onto Tawnos's Coffin directly.
  `tawnosCoffinExile` calls this with no options (default `false` --
  byte-identical to its pre-refactor shipped behavior); Oubliette's
  `oubliettePhaseOut` `resolveEff` case calls it with `{ suppressLeaveEvent:
  true }`.
- **`zMove`'s `opts` parameter** (`zMove(s, iid, fw, tw, tz, opts = {})`):
  purely additive, all ~40+ existing call sites unchanged. The only opts key
  read is `suppressLeaveEvent`, which gates the `ON_PERMANENT_LEAVES_BF`
  emission block -- when true, a permanent leaving the battlefield fires no
  leave triggers at all (CR 702.26: phasing out is not "leaving the
  battlefield" for trigger purposes). `recomputeTypeEffects` still runs
  unconditionally on any bf-membership change regardless of the flag --
  correct for phasing, since a phased-out permanent's continuous effects
  must stop applying (the "treated as though it doesn't exist" rule).
- **Oubliette's `oubliettePhaseOut` `resolveEff` case** differs from
  `tawnosCoffinExile` in one structural way: Tawnos's Coffin is already on
  the battlefield when its activated ability resolves, so it writes tracking
  fields onto its own existing bf entry. Oubliette's effect resolves as part
  of its own cast resolution, *before* the normal `RESOLVE_STACK` ETB push
  places it on the battlefield -- so `oubliettePhaseOut` places Oubliette
  onto the battlefield itself, with the tracking fields already set, using
  the same `alreadyOnBf`-guard pattern `copyPermanentCharacteristics` and
  `vesuvanEtbCopy` use (Section 7.2-adjacent): `RESOLVE_STACK` detects
  Oubliette is already on the bf and skips its own push. A fizzled cast (no
  legal creature target) does NOT place Oubliette itself -- the normal ETB
  push handles that case exactly as any other fizzled targeted permanent.
- **`tawnosCoffinReturn`'s `opts.phasing` parameter**
  (`tawnosCoffinReturn(state, sourceCard, opts = {})`): Oubliette's
  `oubliettePhaseIn` triggered-effect case (registered on
  `ON_PERMANENT_LEAVES_BF`, `scope:'self'`, matching Tawnos's Coffin's own
  registration pattern exactly) delegates to `tawnosCoffinReturn(state,
  sourceCard, { phasing: true })` rather than duplicating the resolver. Two
  gated changes fire only when `opts.phasing` is true: the returned creature
  additionally gets `summoningSick: false` (a phased-in permanent was never
  gone for summoning-sickness purposes -- CR 702.26e), and the log verb
  becomes "phases in tapped" instead of "returns to the battlefield tapped".
  The default (no-opts) path -- Tawnos's Coffin's three call sites -- is
  untouched: same wording, same summoning-sickness behavior (a phased-in-only
  concept does not apply there; the creature simply re-enters and picks up
  the ordinary fresh-entry `summoningSick: true` `zMove` sets).
- **Three faithful-phasing guarantees** (explicit product requirements, not
  simplifications):
  1. Phase-out fires no leave-the-battlefield triggers --
     `suppressLeaveEvent: true` on every `zMove` the phase-out performs.
  2. Phase-in fires no enter-the-battlefield effects -- this engine has no
     ETB event at all (`zMove`'s to-bf branch never emits anything); "when
     enters" effects are cast-resolution effects, which phase-in does not
     re-invoke.
  3. The phased-in creature is not summoning sick, despite returning tapped
     -- see `opts.phasing` above.
- **Cosmetic note (accepted, not a hidden-zone gap):** a phased-out
  permanent is held in the exile zone's storage and is visible in the exile
  UI while phased out. Real Magic treats phased-out status as public
  information, so this is acceptable; no dedicated hidden zone was built.
- **Target-at-cast convention (pre-existing, not new to this card):** like
  every other when-enters-targeted permanent in this engine, Oubliette's
  creature target is chosen at CAST time (`oubliettePhaseOut` registered in
  both `EXPLICIT_TARGET_EFFECTS` and `CREATURE_ONLY_TARGET_EFFECTS` in
  `useDuelController.ts`, mirroring Tawnos's Coffin's registrations exactly).
  In paper Magic, Oubliette could be cast with no creatures in play and its
  triggered ability would simply have no legal target; this engine's
  documented simplification means the cast itself has no target to select
  in that case.

## 7.14 Legend Rule (CR 704.5j) State-Based Action

Infrastructure-only contract (no `cards.js` entry sets `Legendary` yet -- see
`docs/SYSTEMS.md` Section 30 for the full writeup, including the exact
insertion-point table and the AI policy function).

- **`checkLegendRule(state)`** (exported, `DuelCore.js`) is threaded manually
  at every site that can change a player's battlefield composition or a
  permanent's controller, mirroring `checkDeath`'s own ~15-site manual-call
  convention rather than a single centralized dispatch wrapper. It piggybacks
  on existing centralization points (`RESOLVE_STACK`'s post-`resolveEff` tail,
  `PLAY_LAND`, `createToken`, `checkDeath`'s `checkControlGrants` tail,
  `tawnosCoffinReturn`'s shared return path) instead of adding a fresh call at
  every individual card effect, plus a handful of sites that bypass all of
  those (Nether Shadow's graveyard recursion, Ghazbán Ogre's
  `controlToHighestLife`, the `modalChoice` `RESOLVE_CHOICE` re-entry into
  `resolveEff`, and Transmute Artifact's direct tutor-to-bf placement).
- **Resolution differs from `checkDeath`:** CR 704.5j gives the *controller*
  the choice of which copy to keep, so a violation does not move anything
  automatically -- it creates a `pendingChoice` (`kind: 'legendRuleChoice'`)
  via the existing `createPendingChoice()` factory (Section 7.3-adjacent /
  `docs/SYSTEMS.md` Section 27.1), same generic `{id,label}[]` options shape
  every other `pendingChoice` kind uses. `RESOLVE_CHOICE`'s
  `'legendRuleChoice'` branch moves every non-chosen same-named copy to its
  owner's graveyard via `zMove` directly -- a legend-rule loss is a graveyard
  move (CR 704.5j), not a destroy, so it does not route through `checkDeath`'s
  destroy-and-log path.
- **Collision convention:** same single-slot `pendingChoice` degradation as
  Library of Leng's `discardToLibraryChoice` (Section 7.7-adjacent) -- if the
  slot is already occupied, `checkLegendRule` no-ops for now and the next
  SBA-triggering call re-detects the violation. The `'legendRuleChoice'`
  `RESOLVE_CHOICE` branch re-invokes `checkLegendRule` after resolving so a
  simultaneous second violation (the other player independently duplicating a
  different legendary name) is queued immediately rather than waiting on an
  unrelated later event.
- **AI side:** `chooseLegendRuleKeep(choice, state)` (`AI.js`) is a
  deterministic policy function (no `Math.random()`), dispatched from
  `useDuelController.ts`'s `pendingChoice` `useEffect` alongside
  `bandAttackerDamageOrder`/`discardToLibraryChoice`. No UI change was needed
  -- `ChoiceModal.tsx` already renders any `{id,label}[]` options array
  generically.

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

---

# 15. Cost Tax (Gloom)

`applyCostTax(costStr, targetCard, state, requireEnchantment = false)` (`DuelCore.js`, next to `parseMana`/`canPay`/`payMana`) is the shared helper for static, board-wide cost-increase effects. Gloom is the first and only consumer: "White spells cost {3} more to cast. Activated abilities of white enchantments cost {3} more to activate."

## Mechanism

`applyCostTax` appends a plain digit string (`'3'`) to the end of the raw cost string when the tax applies, otherwise returns the input unchanged. This is safe against every existing cost-string consumer without any change to `parseMana`, `canPay`, or `payMana` themselves, because:

- `parseMana` accumulates every digit-run found anywhere in the string into `generic` (`p.generic += parseInt(n)`), so a second digit-run appended at the end just adds to the existing generic total (`"W"` -> `"W3"` parses to `{W:1, generic:3}`).
- The `ACTIVATE_ABILITY` single-ability cost-stripping chain (Section 14) is character-level regex replacement (`.replace(/T/g, "")`, `.replace(/,/g, "")`, etc.), not segment-based splitting -- it never touches digit characters, so an appended digit run survives every step in the chain untouched (`"GG,T"` -> tax -> `"GG,T3"` -> strip -> `"GG3"` -> parses to `{G:2, generic:3}`).

The board-wide `gloomOut` scan (`[...state.p.bf, ...state.o.bf].some(x => x.id === 'gloom')`) runs fresh on every call, matching the existing convention for one-off static-permanent checks elsewhere in this file (e.g. `winterOrbOut`) -- the tax always reflects the current battlefield, never a cached snapshot.

## Call-site contract

`targetCard` is the card being cast (spell call sites) or the permanent whose ability is being activated (activated-ability call sites) -- never Gloom itself. `requireEnchantment` is `false` for spell-casting call sites (Gloom's first clause has no type restriction) and `true` for activated-ability call sites (Gloom's second clause restricts to white *enchantments* specifically, via the existing `isEnch` helper).

Every call site that reads a raw cost string for a spell cast or a white enchantment's activated ability must substitute `applyCostTax(...)`'s return value in place of that raw string for the `canPay`/`payMana`/`getManaShortfall` call. As of this section, that is:

| Site | File | Notes |
|---|---|---|
| `CAST_SPELL` | `DuelCore.js` | Tax computed once (`taxedCastCost`), reused for both the `canPay` check and the `payMana` call so they can never diverge. |
| Single-ability `ACTIVATE_ABILITY` path | `DuelCore.js` | Tax applied to `act.cost` *before* the existing token-stripping chain (Section 14) runs -- the taxed string flows into stripping unchanged, not the other way around. |
| 3 spell-cast `canPay` checks + `getMaxAffordableX` | `useDuelController.ts` | `beginCastFlow`'s instant-cast shortcut, the `mana`-mode auto-advance effect, and the X-affordability precheck. |
| 2 activated-ability `canPay` checks | `useDuelController.ts` | Same shortcut/auto-advance pair, ability-flow side (`normalizeAbilityCost(ab.cost)` result is taxed before the `canPay` call). |
| 2 `getManaShortfall` calls | `DuelScreen.tsx`, `DuelScreenMobile.tsx` | The local `cost` variable feeding the cast-prompt's `costNeeded`/`shortfall` fields is taxed before either read -- this is the "NEED" indicator shown during the mana-wait step, not the card's own printed cost display. |

**Explicit boundary:** the Pyramids array-ability cost-check site (`ACTIVATE_ABILITY`'s `activatedAbilities[]` branch, `canPay(s[w].mana, cost)` where `cost = String(ab.cost?.generic ?? 0)`) is deliberately untouched -- Pyramids is not a white enchantment, and no card currently routes Gloom's tax through the array-ability shape. A future white-enchantment array-ability would need its own explicit `applyCostTax` call at that site; it does not inherit the tax automatically.

**UI boundary:** `HandCard.tsx`/`FieldCard.tsx` render `card.cost` directly and are never touched by this mechanism -- the printed mana cost on a card never changes, matching paper Magic (only what a player actually pays changes, not what's printed). Only the derived `canPay`/`payMana`/`getManaShortfall` inputs are taxed.

# 16. Embedded-Mod Aura Type/CDA Extension (Animate Artifact)

`enchantArtifact`'s `card.mod` branch (`DuelCore.js`) and the corresponding `mod.addTypes`/`mod.powerFn`/`mod.toughnessFn` extension to `collectEffects`'s "Attached auras" loop (`layers.js`) generalize the embedded-attach Aura pattern (previously only `mod.power`/`mod.toughness`/`mod.keywords`/`mod.protection`/`mod.removeKeywords`/`mod.layerDef`) to cover "becomes a creature with CDA-computed P/T," first needed by Animate Artifact.

## `enchantArtifact`'s `card.mod` branch

Mirrors `enchantLand`'s existing `if (card.mod) { embedded } else { Kudzu-style }` split exactly: with `card.mod` present, the aura's mod is embedded as a record (`{iid, name, mod, controller, cardData, enterTs}`) directly into the target's own `enchantments[]` array, read by `collectEffects` like any other attached Aura. Without `card.mod`, the card takes the pre-existing Kudzu-style path (a separate battlefield permanent tracked via `enchantedArtifactIid`). The three pre-existing `enchantArtifact` users (Living Artifact, Artifact Possession, Relic Bind) have no `mod` field and so are unaffected by the new branch.

A Guardian Beast check guards the embedded path only: `if (isArt(tgtC) && !isCre(tgtC) && ns[tgtC.controller].bf.some(c => c.id === 'guardian_beast' && !c.tapped))` -- ported unchanged from `enchantCreature`'s own embedded branch, since "noncreature artifacts you control can't be enchanted" is a genuine, universal "can this permanent be newly enchanted" rule, not specific to `enchantCreature`. It does not reach the Kudzu-style `else` branch, so it does not affect Living Artifact/Artifact Possession/Relic Bind.

## `collectEffects` extension

Two new field checks in the "Attached auras" loop, both additive and gated purely by field presence (existing Auras that only use `mod.power`/`mod.keywords`/etc. are completely unaffected):

```js
if (aura.mod.addTypes?.length) {
  const baseIsCreature = (card.type ?? '').includes('Creature');
  if (!aura.mod.onlyIfNotCreature || !baseIsCreature) {
    effects.push({ layer: 4, addTypes: aura.mod.addTypes, enterTs: enchTs });
  }
}
if (aura.mod.powerFn || aura.mod.toughnessFn) {
  const baseIsCreature = (card.type ?? '').includes('Creature');
  if (!aura.mod.onlyIfNotCreature || !baseIsCreature) {
    effects.push({ layer: '7a', powerFn: aura.mod.powerFn, toughnessFn: aura.mod.toughnessFn, enterTs: enchTs });
  }
}
```

`addTypes` is pushed to Layer 4, already generically consumed by the same `effects.filter(e => e.layer === 4)` fold that Living Lands/Kormus Bell/Titania's Song's `globalTypeEffect` pipeline uses. `powerFn`/`toughnessFn` are pushed to Layer 7a, already generically consumed via `CDA_EVALUATORS` (the same mechanism Titania's Song's `manaValueCDA` uses). Neither addition required any change to the Layer 4 or Layer 7a fold logic itself.

**`mod.onlyIfNotCreature`** is a new, opt-in flag checked against `card.type` -- the raw printed type, never mutated by the Layer 4 pass within the same `computeCharacteristics` call -- mirroring `matchesGlobalTypeFilter`'s `nonCreatureArtifact` branch (Section on Titania's Song / `docs/SYSTEMS.md` S18.9) exactly, and for the same reason: reading the already-baked `typeEff` here instead would cause the effect to suppress itself the moment it first applied (self-reference/oscillation). The flag is per-aura, not global -- a second Aura on the same permanent using `addTypes`/`powerFn`/`toughnessFn` without `onlyIfNotCreature` applies unconditionally, regardless of another aura's gate.

## Contract

Any future Aura needing "becomes a creature (or gains some other type) only while it isn't already one, with CDA-computed P/T" should set `mod.addTypes`/`mod.powerFn`/`mod.toughnessFn`/`mod.onlyIfNotCreature` on its embedded-attach `mod` object -- no new `collectEffects` code is needed. A future consumer of `mod.addTypes`/`mod.powerFn`/`mod.toughnessFn` that wants the effect to apply unconditionally (not gated on "not already a creature") simply omits `onlyIfNotCreature`.

# 17. Binder Snapshot Contract (Ring of Ma'ruf's "Outside the Game")

Ring of Ma'ruf maps "a card you own from outside the game" to the overworld binder. No new zone exists; the World Map / Duel boundary is crossed by a **read-only ID snapshot**, exactly as `pDeckIds` already does.

## Snapshot chain

`useOverworldController.launchDuel` adds `binderIds: binder.map(c => c.id)` to `duelCfg` -> `useDuelController` passes `config.binderIds ?? []` as `useDuel`'s trailing argument -> `buildDuelState`'s eighth parameter (`binderIds = []`) lands as `p.binderIds: [...binderIds]`. The opponent gets a **pseudo-binder**: `o.binderIds` is a copy of its archetype's deck list (`ARCHETYPES[oppArchKey]?.deck || ARCHETYPES.RED_BURN.deck`), snapshotted the same way at build time. Duel-state constructions that omit the argument (tests, sandbox direct-builds) get `[]` and are covered by the fizzle rule below.

Both arrays are plain ID-string lists, read-only except for fetch-removal: `MARUF_PICK` removes exactly ONE occurrence of the chosen id (duplicates stay individually fetchable). **Ephemerality:** the fetched card joins the duel as a fresh instance (`makeCardInstance`); the overworld binder is never mutated by the duel -- the duel only ever consumed a snapshot, and `handleDuelEnd` is untouched.

## Draw-replacement extension (`marufCharges` / `pendingMarufPicks` / `MARUF_PICK`)

`marufCharge` (the Ring's activated effect; its exile-self is paid via the pre-existing `exile` cost token) increments `p[caster].marufCharges`. `performDraws` consumes one charge per replaced draw, BEFORE the `lampCharges` check -- a documented ordering simplification: when both Ring and Lamp replacements are pending on the same draw, Ring's is consumed first (real rules would let the player order simultaneous replacements). Consumption with a non-empty binder suspends the draw loop into `pendingMarufPicks` (`{ who, remainingDraws, followUps }` -- no `cardIids` integrity list, since the binder cannot change while a pick is pending); with an EMPTY binder the charge is still consumed and the draw fizzles to a normal top-card draw. `MARUF_PICK` resumes with `performDraws(ns, head.who, head.remainingDraws, head.followUps)` -- **no `+ 1`**, unlike `LAMP_PICK`, because the fetched card itself satisfied the replaced draw. Unconsumed charges expire in the same CLEANUP block that clears `lampCharges` ("this turn" scoping); ADVANCE_PHASE is gated on a pending pick just like the lamp's.

## Determinism note

The AI's pick is `chooseMarufFetch(binderIds, state)` in `AI.js` -- a pure, deterministic policy function (highest-cmc castable nonland, else lowest-cmc nonland, else first id), following the `chooseDiscardToLibrary` precedent, dispatched by `useDuelController`'s AI auto-resolution branch. No `Math.random()` was introduced; the pre-existing Coral Helm `discardRandom` site (and `chooseLampPick`'s all-lands fallback) remain flagged for the Milestone B seeded-RNG migration.

# End of ENGINE CONTRACT SPEC v1.1
