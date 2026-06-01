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
| Universal stack priority: all spells use stack, priority window opens on every cast | `src/engine/DuelCore.js`, `src/engine/AI.js` | [IN PROGRESS] |
| StackDisplay component: visual card splay, mobile bottom sheet + desktop overlay | `src/ui/Stack/StackDisplay.tsx` | [IN PROGRESS] |
| DuelScreen resolution loop + stack watcher | `src/DuelScreen.tsx`, `src/hooks/usePhaseAdvance.ts` | [IN PROGRESS] |
| DuelScreenMobile AI fix + resolution loop | `src/ui/Mobile/DuelScreenMobile.tsx` | [IN PROGRESS] |
| Stack scenario e2e tests | `e2e/sandbox.spec.ts` | [IN PROGRESS] |

## Technical Debt Log

- [TD-001] DuelScreenMobile.tsx duplicates AI loop logic from DuelScreen.tsx.
  Sprint 7 fixed the priority window handler divergence.
  Remaining: extract shared useDuelAILoop hook. See SYSTEMS.md TD-001.
