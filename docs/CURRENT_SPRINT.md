# Current Sprint

## Tutor Modal System + Transmute Artifact (2026-06-05)

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| pendingTutor state + case "tutor": modal flow | `src/engine/DuelCore.js` | [x] Done |
| 7 new action cases (CHOOSE_TUTOR, DECLINE_TUTOR, etc.) | `src/engine/DuelCore.js` | [x] Done |
| Transmute Artifact onResolve handler | `src/engine/cardHandlers.js` | [x] Done |
| transmute_artifact effect field update | `src/data/cards.js` | [x] Done |
| 7 new dispatchers | `src/hooks/useDuel.js` | [x] Done |
| AI tutor/transmute resolution + scoreLibCard | `src/hooks/useDuelController.ts` | [x] Done |
| TutorModal component | `src/ui/duel/TutorModal.tsx` | [x] Done |
| TransmuteSacrificeModal component | `src/ui/duel/TransmuteSacrificeModal.tsx` | [x] Done |
| TransmutePayModal component | `src/ui/duel/TransmutePayModal.tsx` | [x] Done |
| DuelScreen modal wiring | `src/DuelScreen.tsx` | [x] Done |
| DuelScreenMobile modal wiring (parity) | `src/ui/Mobile/DuelScreenMobile.tsx` | [x] Done |
| Playwright tests | `e2e/sandbox.spec.ts` | [x] Done |
| Documentation | `CLAUDE.md`, `docs/SYSTEMS.md`, `docs/CURRENT_SPRINT.md`, `docs/MECHANICS_INDEX.md` | [x] Done |

---

## Group P Card Implementation (2026-06-04)

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Audit corrections (12 oracle errors) | `docs/audit/card-effect-audit.md` | [x] Done |
| Wire ~60 Group P stubs | `src/data/cards.js` | [x] Done |
| 30+ new resolveEff cases | `src/engine/DuelCore.js` | [x] Done |
| cantAttackTurn guard (Wall of Dust) | `src/engine/DuelCore.js` | [x] Done |
| Combat triggers: Wall of Dust, Giant Badger, Murk Dwellers | `src/engine/DuelCore.js` | [x] Done |
| hasKw removeKeywords eotBuff support | `src/engine/DuelCore.js` | [x] Done |
| needsExplicitTarget additions | `src/ui/Mobile/DuelScreenMobile.tsx` | [x] Done |
| Group P Playwright tests | `e2e/sandbox.spec.ts` | [x] Done |

### Deferred
- `jandors_ring` — requires last-drawn-card tracking; higher complexity group
- `leviathan` — three-restriction upkeep + attack cost; higher complexity group
- `jade_monolith` — damage redirect layer; higher complexity group

---

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
| Claude Code hooks: engine guard, controller redirect, parity check, doc gate, encoding hygiene | `.claude/settings.json`, `.claude/hooks/*.sh`, `CLAUDE.md` | ✅ Done |

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
- [TD-003] ✅ FIXED — `pendingCast` state in `useDuelController.ts` decouples
  target selection from the cast action. `handleCast` in `DuelScreen.tsx`
  queues intent and fires only when mana is satisfied. `needsExplicitTarget()`
  exported from hook for desktop/mobile parity.
- [TD-004] ✅ FIXED — `draw3` added to `EXPLICIT_TARGET_EFFECTS` (desktop)
  and `needsExplicitTarget()` (mobile). Ancestral Recall now forces target
  selection before casting on both platforms.
- [TD-005] ✅ FIXED — `PLAY_LAND` now rejects land plays while spells are on
  the stack (`src/engine/DuelCore.js`). Logs a rule reminder to the duel log.
