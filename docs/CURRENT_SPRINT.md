# Current Sprint

## Phase 7 — Original Feature Parity ✅ Complete

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Food/hunger toggle | `OverworldGame.jsx`, settings UI | ✅ Done |
| World Magic spell system | `MapGenerator.js`, `OverworldGame.jsx`, `WorldMagicPanel.jsx` | ✅ Done |
| Post-duel card-vs-clue choice | `OverworldGame.jsx`, `PostDuelChoiceModal.jsx` | ✅ Done |
| Dungeons hidden until clued | `MapGenerator.js`, `OverworldGame.jsx`, tile render | ✅ Done |
| Enemy tier HP corrected | `MapGenerator.js` | ✅ Done |
| Henchman tier (unbribeable, HP 24–27) | `MapGenerator.js`, `OverworldGame.jsx` | ✅ Done |
| City conquest & liberation | `MapGenerator.js`, `OverworldGame.jsx`, `TownModal.jsx` | ✅ Done |
| Delivery quest type | `MapGenerator.js`, `OverworldGame.jsx`, `TownModal.jsx` | ✅ Done |

### Documentation updated
- `docs/gdd.md` — v1.1 changelog; Phase 7 section; §3.8–3.10 new subsections; §3.1 updated
- `docs/SYSTEMS.md` — Sections §23–§29 added; stale end-of-document marker replaced
- `docs/MECHANICS_INDEX.md` — §3.2–§3.6 added; §1.1 dependency list corrected
- `docs/CURRENT_SPRINT.md` — This file
- `README.md` — Phase 7 row added to status table

### Pre-existing drift fixed in this pass
- gdd.md Phase 6 row corrected to ✅ Complete
- MECHANICS_INDEX.md §1.1 removed incorrect keywords.js dependency on DuelCore
- SYSTEMS.md `# End of SYSTEMS v1.0` marker replaced with `# End of SYSTEMS v1.1`

---

## Bug Fixes (post-Phase 7)

| Bug | Root Cause | Files Changed | Status |
|-----|-----------|---------------|--------|
| Sorcery-speed enforcement — non-instants castable with non-empty stack | `CAST_SPELL` lacked a `stack.length > 0` guard; phase and active-player checks were present but incomplete | `src/engine/DuelCore.js` | ✅ Fixed |
| `ADVANCE_PHASE` not blocked by non-empty stack | Reducer only checked `priorityWindow`; stack-length guard was absent from the case (though present in `advPhase()` helper) | `src/engine/DuelCore.js` | ✅ Fixed |
| `requestPhaseAdvance` fires over unresolved spells | UI-layer gate had no stack check; only `priorityWindow` was tested | `src/DuelScreen.tsx` | ✅ Fixed |
| Enemy overworld movement too fast | `TICK_INTERVAL` was 18 frames (~0.3 s/step at 60 fps) | `src/OverworldGame.jsx` | ✅ Fixed |

### Regression tests added
`tests/duel-regression.mjs` — SQ-01 (sorcery blocked on non-empty stack), SQ-02 (ADVANCE_PHASE blocked on non-empty stack), SQ-03 (instant can respond while stack is non-empty).

### Documentation updated
- `docs/SYSTEMS.md` — §4.2 sorcery-speed enforcement rules; §18.2 step 2 stack short-circuit; §18.5 blockade updated for stack-length condition; §27.5 enemy tick rate table added
- `docs/CURRENT_SPRINT.md` — this table

---

## Mobile Compact Duel Screen (post-Phase 7)

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| `DuelScreenMobile` — compact phone layout (≤ 640px) | `src/ui/Mobile/` (13 new files) | ✅ Done |
| `usePhaseAdvance` hook — extracted from DuelScreen, shared | `src/hooks/usePhaseAdvance.ts` | ✅ Done |
| `useMedia` hook — generic matchMedia utility | `src/hooks/useMedia.ts` | ✅ Done |
| `OverworldGame` — conditional render of two duel screens | `src/OverworldGame.jsx` | ✅ Done |
| `tokens.css` — frame-parch vars, mobile palette, `mdPlayPulse` keyframe | `src/styles/tokens.css` | ✅ Done |

### Documentation updated
- `docs/MOBILE_VS_PC.md` — full rewrite to reflect two-component architecture, 640px breakpoint, component inventory, updated future-change rules
- `docs/MECHANICS_INDEX.md` — §6.1 updated; new hooks, component tree, constraints; version bumped to v1.2
- `docs/SYSTEMS.md` — §11.2 added documenting `usePhaseAdvance`, `useMedia`, `useIsMobile`
- `docs/CURRENT_SPRINT.md` — this table

---

## Bug Fixes (post-Mobile Compact)

| Bug | Root Cause | Files Changed | Status |
|-----|-----------|---------------|--------|
| Mulligan retrigger on orientation change | Render condition used live `isCompactMobile`; crossing 640px mid-duel swapped component types, unmounting the old tree and re-initialising `useDuel` from scratch | `src/OverworldGame.jsx` | ✅ Fixed |
| Player hand not visible on mobile | All battlefield rows had `flex-shrink: 0` with fixed min-heights; cumulative height (~937px) exceeded phone viewport, pushing hand strip off screen | `src/ui/Mobile/DuelScreenMobile.tsx`, `src/ui/Mobile/styles.module.css` | ✅ Fixed |

### Fix details

**Mulligan retrigger** — Added `duelScreenIsCompact` state. Snapshotted at each of the three duel launch sites (`launchDuel`, `handleDuelEnd` dungeon chain, `launchArzakon`) by calling `setDuelScreenIsCompact(isCompactMobile)` alongside `setDuelCfg`. Render condition now reads `duelScreenIsCompact` (frozen at launch) instead of live `isCompactMobile`, so orientation changes during an active duel cannot switch component types.

**Hand not visible** — Added `.bfScroll { flex: 1; overflow-y: auto; min-height: 0 }` CSS class. Wrapped the six battlefield rows (opp lands → divider → your lands) in this container so the battlefield scrolls vertically when it overflows, keeping both Banners, the ActionBar and the hand strip as `flex-shrink: 0` anchored elements always visible.

---

## Up Next — Phase 8 Candidates

| Item | Priority | Notes |
|------|----------|-------|
| CSS animations (card play, tap, damage flash on board) | Medium | Defined but not applied to components |
| Save state (localStorage full run persistence) | High | No backend; localStorage approach established by unlockables |
| First Strike combat step | Medium | Keyword defined; combat step not implemented |
| Card pool expansion to ~250+ cards (Scryfall pipeline) | High | Pipeline built; gap closure pass needed |
| Random map events (Nomad's Bazaar, Diamond Mine, Gemcutter's Guild) | Medium | Referenced by World Magic system (Sword of Resistance); standalone event tiles add loop variety |
| Tome of Enlightenment: enforce 4-copy deck limit to make the spell meaningful | Low | No limit currently enforced; adds value to the spell |
| Staff of Thunder: wire to OverworldCanvas enemy removal | Low | TODO stub left in WorldMagicPanel; requires OverworldCanvas enemy removal API |
