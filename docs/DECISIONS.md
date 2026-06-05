# Architectural Decisions Log

This file records confirmed design decisions for Shandalar Modern.
Entries here are closed -- do not revisit without an explicit architecture proposal.

Cross-referenced from CLAUDE.md.

---

## Confirmed Architectural Decisions (Do Not Revisit)

- **Power Surge upkeep:** snapshot tapped-land count into `turnState.powerSurgeUntappedCount`
  during UNTAP; consume at UPKEEP. (Option A)
- **Holy Ground:** `hasKw()` suppresses landwalk keywords when the defending player controls
  Holy Ground. (Option B)
- **Priority window phases:** `PRIORITY_WINDOW_PHASES` whitelist = `Set(['MAIN_1', 'MAIN_2', 'END'])`
- **Enemy grace period:** `GRACE_MOVE_THRESHOLD = 3` in `EnemyAI.js`
- **Mulligan latch:** `mulliganDismissed` ref prevents modal reappearing on orientation change
- **Lord effect pattern:** Cards with `effect:"lordEffect"` or `effect:"globalPump"` are continuous static abilities, NOT resolved via `resolveEff`. Bonuses are computed by `getPow`, `getTou`, and `hasKw` at read time by scanning the battlefield.
- **Mana tap undo snapshot:** Created on first `TAP_LAND`/`TAP_ART_MANA` when `stack.length === 0` (not `spellsThisTurn === 0`). Resets after stack drains to zero, enabling undo for post-resolution taps.
- **AI-turn spell priority:** `useEffect([s.stack?.length])` in both DuelScreen files
  opens a priority window when the stack grows (prev === 0, cur > 0) while
  `active === 'o'`. This is the hook that gives the player a response window after the
  AI casts. The AI loop's inner `setTimeout(() => requestPhaseAdvance())` is retained
  but is a no-op while the stack is non-empty.
- **AI mana simulation:** The AI's virtual state tracks mana spent and produced during multi-spell planning. `evaluateAndCast` maintains a `poolAfterCast` that deducts each spell's cost after crediting tapped sources; `applyVirtualPlay` credits mana-producing spells via the card's `mana` array. If a new `addMana` spell is added to `cards.js`, its `mana` field must be a flat array of color characters (e.g. `["B","B","B"]`) for `applyVirtualPlay` to credit it correctly.
- **Mobile targeting mode:** `needsExplicitTarget()` (module-level in `DuelScreenMobile.tsx`) gates the targeting flow. Tapping a qualifying spell sets `targetingFor` state; subsequent tap on creature/life-total sets `pendingTarget`. `Banner.onLifeClick` prop enables life-total tap targets. Cast fires via `castSpell(targetingFor, pendingTarget, xVal)`.
- **Battlefield click routing:** `handleBfClick(card)` in `useDuelController.ts` is the single entry point for all combat-phase battlefield clicks. It owns COMBAT_BLOCKERS two-click flow (`pendingBlockerIid` state, isolated from `selTgt`) and COMBAT_ATTACKERS attacker toggle. Both `DuelScreen` and `DuelScreenMobile` call `handleBfClick` first; if it returns `false` (non-combat click), the screen component handles the interaction locally. Do not add combat click logic to either screen component.

*(Migrated from CLAUDE.md -- original decision date unknown)*

---

## MCTS Candidate Shape (TD-002)

scoreMoves() in MCTS.js accepts an optional `nextState` field on candidate objects:

  { action: <any valid action>, nextState?: GameState, label: string }

When `nextState` is present, it is used as the rollout start state directly.
When absent, start state is derived via duelReducer(state, candidate.action).

planMain() uses the nextState path (passing primaryVirtual / altVirtual).
planAttack() uses the action path (passing DECLARE_ATTACKER / ADVANCE_PHASE).
Never pass { type: 'PLAN' } or other unrecognized action types as candidates.

*(Migrated from CLAUDE.md -- original decision date unknown)*

---

## MCTS Unit Test Seam (TD-003 -- RESOLVED)

`stepOnce` and `policyMainAction` in `MCTS.js` are exported solely for unit testing.
Do not call them from production code outside of MCTS.js itself.

`src/engine/__tests__/mcts-rollout.test.js` holds three test groups:
- Group A: post-fix assertions -- rollout taps exact cost and casts one spell per main
  phase, then resolves the stack. Life assertion guards against mana-burn regression.
- Group B: determinism proof -- rollout returns the same winner from identical state.
- Group C: KARAG-only gate guard -- asserts KARAG is the only profile with
  aggression >= 0.9; protects ARZAKON/MORTIS from silent MCTS exposure after the fix.

### Rollout behavior (post-TD-003 fix)

Rollouts now tap exact cost and cast one spell per main phase, then resolve the stack.
Deliberate speed tradeoffs:
- **One cast per main phase** -- no multi-cast loop (future fidelity upgrade).
- **`tgt: null`** -- no targeted-spell fidelity in rollout (targeted removal/burn may no-op).
- **Immediate `RESOLVE_STACK`** -- no in-rollout opponent responses.
- **`computeTaps` uses `produces[0]`** -- dual lands treated as their first color only.

Exact-cost tapping is required for mana-burn safety: `burnMana` fires at every phase
boundary; over-tapping would burn KARAG in live games. The factory ruleset has `manaBurn`
off, so a "tap all lands" refactor would pass unit tests while burning KARAG in real games.
The Group A life assertion (`next.o.life === 20`) is the primary regression guard for this.

*(Migrated from CLAUDE.md -- original decision date unknown)*
