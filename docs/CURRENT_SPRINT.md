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

---

## Mobile Banner Compaction + DuelScreenMobile Feature Parity

### Features

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Compact life-total banners on ≤ 640px viewports | `src/ui/Battlefield/LifeTotal.tsx`, `src/ui/Battlefield/Banner.tsx` | ✅ Done |
| `useIsMobile` hook — 640px matchMedia variant | `src/hooks/useIsMobile.ts` (new) | ✅ Done |
| Mulligan modal in `DuelScreenMobile` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |
| Black Lotus color picker in `DuelScreenMobile` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |
| Dual land color picker in `DuelScreenMobile` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |
| Scryfall card art in `DuelScreenMobile` | `src/ui/Mobile/HandCard.tsx`, `src/ui/Mobile/FieldCard.tsx` | ✅ Done |

### Bug Fixes

| Bug | Root Cause | Files Changed | Status |
|-----|-----------|---------------|--------|
| Mulligan modal auto-dismissed on mobile | `autoFocus` on Keep button received a coalesced tap event from the gesture that launched the duel; modal mounted within the browser's event window | `src/ui/Mulligan/MulliganModal.tsx` | ✅ Fixed |
| Black Lotus sacrificed with no mana on mobile | `DuelScreenMobile.handleActivate` called `activateAbility` directly without showing `LotusColorPicker`; `chooseLotusColor` was not destructured from `useDuel` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Dual lands don't tap / add mana on mobile | `handleLandTap` fell through to `onCardTap` for `produces.length > 1` instead of opening `DualLandColorPicker` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Card images missing on mobile | `HandCard` and `FieldCard` in `src/ui/Mobile/` used `ArtPlaceholder` (static gradient) rather than `CardArtImage` (Scryfall with gradient fallback) | `src/ui/Mobile/HandCard.tsx`, `src/ui/Mobile/FieldCard.tsx` | ✅ Fixed |

### Documentation updated
- `docs/COMPONENT_REGISTRY.md` — created; `## Hooks` section with `useIsMobile.ts` entry
- `docs/gdd.md` — mobile banner compaction note appended under Phase 7 mobile layout section
- `docs/MOBILE_VS_PC.md` — Detection section updated with `useIsMobile.ts`; DuelScreen compact-column clarified; DuelScreenMobile Modals table added; Known Gaps updated
- `docs/CURRENT_SPRINT.md` — this table

---

## DuelScreenMobile Combat + Interaction Fixes (post-banner-compaction)

### Bug Fixes

| Bug | Root Cause | Files Changed | Status |
|-----|-----------|---------------|--------|
| Summoning sickness veil shown on non-creature permanents (Mox Sapphire, etc.) | `FieldCard.tsx` veil condition lacked `isCre &&` guard; engine sets `summoningSick: true` on all non-haste ETBs | `src/ui/Mobile/FieldCard.tsx` | ✅ Fixed |
| Subsequent spells do nothing on Cast tap | `handleCast` used stale `sel.card` snapshot; changed to look up card from live `s_state.p.hand` by `sel.iid` (matches desktop pattern) | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Direct damage spells (Lightning Bolt, etc.) deal no damage | Mobile `handleCast` passed `null` target instead of calling `resolveDefaultTarget`; damage spells default to `'o'` (opponent) when no target is selected | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Declaring attackers shows Activate button instead | `onCardTap` had no phase-context awareness; clicking a creature in `COMBAT_ATTACKERS` now calls `declareAttacker` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Mox Sapphire / Sol Ring require Activate button to tap for mana | Mana artifacts fell through to selection (showing Activate) instead of tapping directly; new `handleBfCardClick` routes `addMana` artifacts straight to `tapArtifactMana` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Black Lotus required Activate button; now shows color picker on direct click | Same root cause as above; `addMana3Any` effect now triggers `activateAbility` + `LotusColorPicker` on first click | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Activate button appeared for all battlefield cards | `sel.zone === 'bf'` always showed Activate; `handleBfCardClick` now only selects cards with non-mana activated abilities | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |

### New functions / additions
- `resolveDefaultTarget(card, state)` — module-level helper (mirrors `DuelScreen.tsx`); maps damage/draw spell effects to their default target (`'o'` or `'p'`)
- `handleBfCardClick(card)` — unified battlefield click dispatcher replacing direct `onCardTap` calls for player cards; routes to `declareAttacker`, `tapArtifactMana`, `activateAbility`+color picker, or selection
- `tapArtifactMana`, `declareAttacker` destructured from `useDuel`
- `PHASE` imported from `../../engine/phases.js`

### Documentation updated
- `docs/MOBILE_VS_PC.md` — DuelScreenMobile interaction table updated; Known Gaps updated
- `docs/CURRENT_SPRINT.md` — this table

---

## Mobile Map & Mulligan Responsive Improvements

- ✅ Mobile overworld: auto-fit zoom (0.6×) and center on player at game start; orientation-change listener adjusts zoom
- ✅ Mulligan modal: 7-card hand wraps to 2 rows on mobile portrait; compressed single-row on landscape
- [x] Mobile portrait layout: toolbar overflow fix, HUD compact mode, dynamic tile sizing to fill screen, legend/mage panel hidden on mobile (≤600px)

---

## Map Layout, Town Modal, and AI Spell-Casting Fixes

| Change | Files Changed | Status |
|--------|--------------|--------|
| Map auto-scales to fill container; dynamic scale replaces fixed zoom toggle; empty sidebar collapses on desktop | `src/OverworldGame.jsx` | ✅ Done |
| Town-under-attack modal compacted on mobile (`isMobile` guard; desktop unchanged) | `src/OverworldGame.jsx`, `src/ui/overworld/WorldMap.jsx` | ✅ Done |
| AI spell-casting fixed: `virtualState` updated after land play so mana count is accurate for same-turn spell evaluation | `src/engine/AI.js`, `tests/duel-regression.mjs` | ✅ Done |

---

## Map Fill + Pass Priority Indicator

| Change | Files Changed | Status |
|--------|--------------|--------|
| Map grid scales to fill container via CSS transform in WorldMap component; measurement taken at grid container level, not page level | `src/ui/overworld/WorldMap.jsx`, `src/OverworldGame.jsx` | ✅ Done |
| Pass Priority button greyed when AI has priority; gold when player holds priority; `isPlayerPriority` prop threaded from DuelScreen to ActionBar | `src/DuelScreen.tsx`, `src/ui/ActionBar/ActionBar.tsx` | ✅ Done |

---

## Map Portrait Height + Pass Priority Button State

| Change | Files Changed | Status |
|--------|--------------|--------|
| Map height threading fixed: `height: 0` on flex main content div; `height: 100%` on map column and centering divs. Scale now correctly fills portrait height. | `src/OverworldGame.jsx`, `src/ui/overworld/WorldMap.jsx` | ✅ Done |
| WorldMap scale setTimeout delay increased from 50 ms to 150 ms to allow flex layout to settle on first render. | `src/ui/overworld/WorldMap.jsx` | ✅ Done |
| Pass Priority button shows "Waiting..." in muted grey when AI has priority; "Pass Priority" in normal style when player holds priority. `isPlayerPriority` threaded from DuelScreen to ActionBar and `InstantPriorityBar`. | `src/DuelScreen.tsx`, `src/ui/ActionBar/ActionBar.tsx`, `src/ui/ActionBar/ActionButton.tsx`, `src/ui/ActionBar/InstantPriorityBar.tsx` | ✅ Done |
| `ActionButton` `'muted'` variant added (dark background, grey border, #555555 text). | `src/ui/ActionBar/ActionButton.tsx` | ✅ Done |
| Priority button Waiting.../Pass state applied to legacy TargetingOverlay.jsx ActionBar (mobile path). Root cause: mobile path uses `OverworldGame.jsx` → `DuelScreenMobile.tsx` → `src/ui/Mobile/ActionBar.tsx`; `isPlayerPriority` prop added to Mobile ActionBar and threaded from DuelScreenMobile. TargetingOverlay.jsx ActionBar also updated (unused but kept consistent). | `src/ui/duel/TargetingOverlay.jsx`, `src/ui/Mobile/ActionBar.tsx`, `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |

---

## Sandbox Debug Panel Restored

### Sandbox Debug Panel Restored

| File | Change |
|------|--------|
| `src/DuelScreen.tsx` | `SandboxDebugPanel` block added to right sidebar; gated on `config.context === 'sandbox' && !isMobile`; shows opponent hand with card names and costs, full ordered library top-to-bottom with 1-based position numbers, top card highlighted gold |

- No engine files modified
- Mobile unaffected (`isMobile` guard)
- `docs/COMPONENT_REGISTRY.md` updated
- **Bug fix**: Render guard corrected from `config.context === 'sandbox'` to `config.sandbox === true`; `OverworldGame.jsx` passes `sandbox: isSandbox` on every duel config but never sets `context` to `'sandbox'`. `DuelConfig` interface updated to include `sandbox?: boolean`.

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
