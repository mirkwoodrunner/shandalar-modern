# Current Sprint

## Phase 8 — Difficulty System

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Difficulty config data | `src/data/difficulties.js` | ✅ Done |
| Randomized starting deck by difficulty/color/rarity | `src/data/difficulties.js` | ✅ Done |
| Difficulty selection in TitleScreen | `src/ui/layout/GameWrapper.jsx` | ✅ Done |
| Player starting life from difficulty | `src/OverworldGame.jsx` | ✅ Done |
| Enemy duel life from difficulty x tier | `src/OverworldGame.jsx`, `src/engine/DuelCore.js` | ✅ Done |
| Boss life scaling (base + per-kill bonus) | `src/OverworldGame.jsx`, `src/engine/DuelCore.js` | ✅ Done |
| Enchanted card slot visual (aura splay) | `src/ui/Card/EnchantedCardSlot.tsx`, `src/ui/Card/types.ts`, `src/ui/Battlefield/Half.tsx`, `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |

### Known gaps (not fixed in this sprint)
- `MAGE_ARCHS` in `MapGenerator.js` routes castle fights to regular archetypes, not `BOSS_*` decks. TODO: wire `BOSS_*` decks to castle context in a future sprint.

---

## Sprint 7 -- Universal Stack Priority

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Universal stack priority: all spells use stack, priority window opens on every cast | `src/engine/DuelCore.js`, `src/engine/AI.js` | ✅ Done |
| StackDisplay component: visual card splay, mobile bottom sheet + desktop overlay | `src/ui/Stack/StackDisplay.tsx` | ✅ Done |
| StackDisplay mobile collapse toggle: pill, auto-expand, collapse button | `src/ui/Stack/StackDisplay.tsx` | ✅ Done |
| DuelScreen resolution loop + stack watcher | `src/hooks/useDuelController.ts`, `src/hooks/usePhaseAdvance.ts` | ✅ Done |
| DuelScreenMobile AI fix + resolution loop | `src/hooks/useDuelController.ts` (centralized; mobile delegates) | ✅ Done |
| Stack scenario e2e tests | `e2e/sandbox.spec.ts` | ✅ Done |
| AI spell cast opens priority window (18.10) | `src/DuelScreen.tsx`, `e2e/sandbox.spec.ts` | ✅ Done |
| Fix: stack-grow useEffect opens priority window for AI casts on AI turn (PW-AI-01) | `src/DuelScreen.tsx`, `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |
| Fix B31: AI stuck in MAIN_1 on mobile after casting — close effect clears aiRef; hasCast skips inner timer; stack?.length dep added to AI loops on both platforms | `src/ui/Mobile/DuelScreenMobile.tsx`, `src/DuelScreen.tsx` | ✅ Done |

## Fix B32 — COMBAT_BLOCKERS Stall (opponent cannot declare blockers)

### Root Cause
Three bugs combined to prevent the player from declaring blockers when the AI
attacked: (1) the AI main loop bailed on all `COMBAT_BLOCKERS` phases, which was
correct behavior but lacked a "Done Blocking" button to let the player advance the
phase; (2) the desktop `ActionBar` had no "Done Blocking" button; (3) the mobile
`ActionBar` gated the blocker UI on `isPlayerTurn` (the exact wrong condition).

### Deliverables

| Fix | File(s) Changed |
|-----|----------------|
| AI loop: kept COMBAT_BLOCKERS bail with improved comment explaining defensive intent | `src/hooks/useDuelController.ts` |
| Desktop ActionBar: add "Done Blocking" button for player-as-defender | `src/ui/ActionBar/ActionBar.tsx` |
| Mobile ActionBar: fix blocker UI gate (`isPlayerTurn` → `!isPlayerTurn`) | `src/ui/Mobile/ActionBar.tsx` |
| Wire `onDoneBlocking={advancePhase}` prop in DuelScreen | `src/DuelScreen.tsx` |
| Add `SET_PHASE_FOR_TEST` sandbox action (clears stack, priorityWindow) | `src/engine/DuelCore.js` |
| BLK-01 + BLK-02 regression tests | `e2e/sandbox.spec.ts` |

### Implementation note on Change 1
The task spec suggested replacing the `COMBAT_BLOCKERS` bail with a `playerIsAttacking`
check that only bails when player attackers exist in `s.p.bf`. This was NOT implemented
as specified because it causes the AI loop to fire `requestPhaseAdvance` immediately
(via `planBlock` → `passPlan` → empty actions → `requestPhaseAdvance`), racing past the
blocker window before the player can click "Done Blocking". The original bail is correct:
the "Done Blocking" button (Change 4) is the mechanism to advance the phase, and the bail
prevents the AI from skipping past it. The comment was updated to document this intent.

---

## E2E Test Fixes — Tests 5 & 6

| Fix | File(s) Changed | Status |
|-----|----------------|--------|
| [x] Tests 5 & 6: AI cast opens priority window before stack resolves (desktop + mobile) | `e2e/duel-controller.spec.ts` | ✅ Done |

Root cause: SANDBOX_FORCE_HAND appends to AI hand. Red instants from RED_BURN
deck (chain_lightning, lightning_bolt) satisfy handHasInstant() even without
R mana, so usePhaseAdvance opens an empty-stack priority window before the AI
planner fires. Fixed by dispatching CAST_SPELL {who:'o'} directly to test
priority-window plumbing in isolation from planner behavior.

---

## Technical Debt Log

- [TD-001] ⚠️ EXTRACTION COMPLETE — All AI loop logic (priority-window close, stack-length
  watcher, applyAiActionsWithPriority, AI main loop) was centralised in `useDuelController.ts`
  (lines 139–250). Neither DuelScreen.tsx nor DuelScreenMobile.tsx contains its own AI loop
  useEffect. A dedicated `useDuelAILoop.ts` hook was not created; duplication is eliminated
  without one. No further action needed unless a standalone hook is desired for organisation.
- [TD-002] ✅ FIXED — X-spell cast log now includes resolved X value (e.g. "o casts Mind Twist (X=3).").
- [TD-003] Mana must be tapped before targeting a spell. Tapping mana after
  selecting a target resets or corrupts the target selection. Fix requires
  separating "select target" from "cast" with a `pendingCast: { cardIid, target }`
  state shape. Cast fires only when both mana pool satisfies the cost AND a valid
  target is set (for spells that require one). Fix sites: `useDuelController.ts`
  (handleCast), `DuelCore.js` (no change needed — reducer already accepts
  pre-validated cast actions). Also affects `DuelScreenMobile.tsx` target flow.
  Ancestral Recall targeting (TD-004) depends on this same rework.
- [TD-004] Ancestral Recall targets the casting player by default but the card
  text says "target player" (can be opponent). `resolveDefaultTarget` in
  `useDuelController.ts` maps `draw3` effect to `state.selTgt ?? 'p'`, defaulting
  to self. Fix: add `draw3` to the explicit-target effects list in
  `needsExplicitTarget()` in `DuelScreenMobile.tsx` (and equivalent in
  `DuelScreen.tsx`), forcing the player to pick a target before casting. Requires
  TD-003 (pendingCast flow) to avoid the tap-before-targeting regression.
- [TD-005] Land can be played while spells are on the stack. `PLAY_LAND` in
  `DuelCore.js` has no guard for non-empty stack, non-main phase, or already-played
  land. Fix: add guards at the top of the `PLAY_LAND` case:
    `if (s.stack?.length > 0) return dlog(s, 'Cannot play a land while spells are on the stack.', 'rule');`
    `if (s.active !== 'p') return s;`
    `if (![PHASE.MAIN_1, PHASE.MAIN_2].includes(s.phase)) return dlog(s, 'Lands can only be played during your main phase.', 'rule');`
    `if (s.turnState.landPlayed) return dlog(s, 'You have already played a land this turn.', 'rule');`
  Exception: Fastbond enchantment bypasses the `landPlayed` guard (already in
  scope via `s.p.bf`). No engine contract impact; pure validation guards.
