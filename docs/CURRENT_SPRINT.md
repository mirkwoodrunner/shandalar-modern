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
| B26: AI plays land but casts no spells — `virtualState` now updated after land PLAY_CARD so `selectPlayableCards` sees the new mana source; `summoningSick: false` set on virtual land entry | `src/engine/AI.js` | ✅ Done |

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

## Bug Fix: Player Could Pass Turn on Behalf of AI

| Change | Files Changed | Status |
|--------|--------------|--------|
| `ActionBar.tsx`: added `isPlayerTurn` and `isWaitingForAI` props; "Pass Priority" and "End Turn" disabled when `!isPlayerTurn`; "Pass Priority" relabeled "Waiting..." and disabled when `isWaitingForAI`; Cast button gated on `isPlayerTurn` | `src/ui/ActionBar/ActionBar.tsx` | ✅ Fixed |
| `DuelScreen.tsx`: passes `isPlayerTurn={s.active === 'p'}` and `isWaitingForAI={s.priorityWindow === true && s.priorityPasser === 'p'}` to ActionBar; removed now-unused `isPlayerPriority` computed variable | `src/DuelScreen.tsx` | ✅ Fixed |
| `usePhaseAdvance.ts`: `requestPhaseAdvance` early-returns when `s.active !== 'p'` (defensive layer against keyboard shortcuts during AI turn) | `src/hooks/usePhaseAdvance.ts` | ✅ Fixed |

---

## B27: AI Never Casts Spells (All Random Encounter Opponents)

| Change | Files Changed | Status |
|--------|--------------|--------|
| B27: Added `profileId` to all 10 random encounter archetypes in `ARCHETYPES` so `getAIPlan` resolves the correct AI profile instead of falling back to GENERIC | `src/data/cards.js` | ✅ Done |
| B27: Lowered score gate in `evaluateAndCast` from `< 0.35` to `< 0.10` so spells pass the gate for all profiles (DELENIA, XYLOS, SYLVARA, GENERIC), while zero-value plays (e.g. life-gain at full health for XYLOS) remain suppressed | `src/engine/AI.js` | ✅ Done |

---

- [x] Mana tap undo button (desktop + mobile) — `UNDO_MANA_TAPS` action, `manaTapSnapshot` state field

## Fix: Undo Taps Button Phase Restriction

| Change | Files Changed | Status |
|--------|--------------|--------|
| Remove `MAIN_1`/`MAIN_2` phase guard from `canUndoMana` in `DuelScreen.tsx` | `src/DuelScreen.tsx` | ✅ Fixed |
| Remove same stale guard from `canUndoMana` in `DuelScreenMobile.tsx` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |
| Add `data-testid="undo-taps-button"` to mobile `ActionBar` undo button | `src/ui/Mobile/ActionBar.tsx` | ✅ Done |
| Add sandbox escape hatches (`__duelDispatch`, `__duelState`) to `DuelScreenMobile.tsx` | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Done |
| Add `/?duel=sandbox-mobile` entry point rendering `DuelScreenMobile` directly | `src/App.jsx` | ✅ Done |
| Playwright tests driving real components via escape hatches (Suites A/B/C) | `tests/e2e/undo-mana-taps-all-phases.spec.js` | ✅ Done |
| `docs/SYSTEMS.md` §30.2 preconditions updated (phase-agnostic) | `docs/SYSTEMS.md` | ✅ Done |

---

## MCTS Rollout Quality + Integration Audit ✅ Complete

### MCTS Integration Audit

**A1 — Call Site Inventory**

| Call Site | File:Line | Caller | budgetMs | Candidates Empty? |
|-----------|-----------|--------|----------|-------------------|
| `getBestMove` | `AI.js:603` | `planMain` | 600 | No — guarded by `primaryActions.length > 0 && altActions.length > 0` |
| `getBestMove` | `AI.js:693` | `planAttack` | 400 | No — always 2 elements (DECLARE_ATTACKER + ADVANCE_PHASE) |
| `scoreMoves` | `MCTS.js` | `getBestMove` | — | internal only |
| `rollout` | `MCTS.js` | `scoreMoves` | — | internal only |

**A2 — Action Type Mismatch**

`CAST_SPELL` is a valid `duelReducer` action type (DuelCore.js:1747). MCTS rollouts correctly use `CAST_SPELL`. `PLAY_CARD` is NOT a valid duelReducer action type — it is an AI-internal plan format converted to DuelCore actions by `aiDecide()` at the compatibility adapter layer; `duelReducer` silently ignores it (`default: return s`). No action type mismatch for MCTS rollout simulations.

**Critical finding:** The `planMain` MCTS call (AI.js:603) passes `{ type: 'PLAN', actions: [...] }` candidates. `PLAN` is not a valid duelReducer action type, so both candidates produce identical next-states. All rollouts compare equivalent positions — MCTS comparison at this call site is statistically meaningless. (Out of scope for this sprint; deferred to AI.js audit pass.)

**A3 — Mana Tap Gap (Critical)**

`CAST_SPELL` reads from `s[w].mana` (the mana pool) and does NOT auto-tap lands. `burnMana()` clears the mana pool at every phase boundary (DuelCore.js `advPhase` line 1159). Neither `randomMainAction` nor `policyMainAction` dispatches `TAP_LAND` before `CAST_SPELL`. Result: the pool is empty when `canPay()` is checked in rollout main phases; `canPay` returns false for all nonzero-cost cards; rollouts never cast spells — confirmed pass-fest. Fix requires pre-tapping lands per card cost in the rollout policy; deferred to a future engine-aware rollout pass.

**A4 — Priority Window Interaction**

`ADVANCE_PHASE` is silently blocked (returns `s` unchanged) when `priorityWindow: true`. If `priorityWindow` is true in the rollout start state, `stepOnce` loops forever (turn never changes, depthLimit condition never fires). At all current call sites, MCTS is invoked during the AI's own turn where `priorityWindow` is false. `stepOnce` never dispatches `OPEN_PRIORITY_WINDOW`. Rollouts are immune to priority window blocking in practice. Latent infinite-loop risk exists if `getBestMove` is called during an open priority window.

**A5 — `evaluateBoard` Name Collision**

`AI.js` has a private (non-exported) `evaluateBoard(state)` at line 47. `MCTS.js` introduces a private (non-exported) `evaluateBoard(s, who)`. Different module scopes, different signatures, no cross-import of these symbols. No naming conflict.

### MCTS Deepening Changes

| Change | Description | Status |
|--------|-------------|--------|
| Replace `heuristicWinner` with `evaluateBoard` | Weighted board evaluator: life delta (*1.5), board power/toughness with flying (*1.4) and trample (*1.1) evasion weights and toughness (*0.3), board delta (*2.0), hand size delta (*1.2), mana development (untapped lands + pool) delta (*0.5) | ✅ Done |
| Replace `randomMainAction` with `policyMainAction` | Land-first priority; then highest-CMC affordable non-land spell sorted descending by CMC sum | ✅ Done |
| Replace `randomAttack` with `policyAttack` | Evasion-aware: attacks with flyers vs. no opposing flyers; attacks when no legal blockers; attacks when attacker's power kills best blocker; skips suicidal/unfavorable attacks | ✅ Done |
| Replace even-split `scoreMoves` with UCB1 bandit allocator | Seed phase: 3 rollouts per candidate; UCB1 phase: exploration constant C=sqrt(2), selects highest-UCB1 candidate for each remaining iteration within budget; `next` cloned states stripped from return value | ✅ Done |

---

## Bug Fixes — Mobile Targeting Arrow & Opponent Ability Activation

### B28: Clicking opponent creature with spell selected showed "Activate" UI instead of targeting
- **Root cause:** In `pBf` zone of `handleCardClick`, activate checks (`activatedAbilities` / `card.activated`) fired before the hand-spell-selected check, intercepting clicks intended as targeting. Additionally, `handleActivate` had no ownership guard, so an opponent card could in theory reach the activate path if a code path routed it there.
- **Fix:** Added `handSpellSelected` guard in `pBf` zone; activate path is bypassed when player has a spell selected in hand. Added ownership guard at top of `handleActivate` to block activation of any card not in `s.p.bf`. Added `s.p.bf` to `handleActivate` dep array and `s.p.hand` to `handleCardClick` dep array.
- **Files changed:** `src/DuelScreen.tsx`

### B29: TargetArrow not visible on mobile
- **Root cause:** Arrow was never drawn because `selectTarget` was not being called — Bug B28 was intercepting the tap as an activate instead. Fixing B28 restores the targeting flow.
- **Additional checks performed:** `TargetArrow` confirmed at outermost div level (no transformed ancestor); no `isMyTurn` guard wrapping it; `data-iid` confirmed present on `HandCard.tsx` (line 36) and `FieldCard.tsx` (line 39).
- **Files changed:** `src/DuelScreen.tsx` (B28 fix restores targeting; no additional files required)

---

## Dead Artifact Cleanup

| Item | Action |
|---|---|
| `src/hooks/useIsMobile.js` | Deleted — stale 768px duplicate; `.ts` (640px) is canonical per CLAUDE.md |
| Dead engine imports in `src/App.jsx` | Removed — MapGenerator, DuelCore, AI, cards, rulesets, DuelScreen imports unused since OverworldGame took over game loop |
| `duel-screen-mobile/` directory | Deleted — pre-production mockups superseded by `src/ui/Mobile/DuelScreenMobile.tsx` |

---

## Duel Bug Batch 1 ✅ Complete

| Bug | Root Cause | Files Changed | Status |
|-----|-----------|---------------|--------|
| Undo checkpoint not reset after spell resolves | `TAP_LAND`/`TAP_ART_MANA` snapshot guard used `spellsThisTurn === 0`; after first cast this was always >0. `canUndoMana` also required `spellsThisTurn === 0` | `src/engine/DuelCore.js`, `src/DuelScreen.tsx` | ✅ Fixed |
| Instants cannot be cast outside Main phases | No UI mechanism to open a priority window mid-phase; `OPEN_PRIORITY_WINDOW` existed but had no trigger | `src/DuelScreen.tsx` | ✅ Fixed |
| Goblin King lord effect not continuous; wrong targets | `globalPump` mutated base stats once; Goblin King `targets:"black"` was wrong; no lord layer in `getPow`/`getTou`/`hasKw` | `src/engine/DuelCore.js`, `src/data/cards.js` | ✅ Fixed |
| Mahamoti Djinn block validation incorrect for dual lands | Specific landwalk keywords (MOUNTAINWALK, etc.) not checked by `canBlockDuel`; Volcanic Island lacked `subtype` | `src/engine/DuelCore.js`, `src/data/cards.js` | ✅ Fixed |

### Documentation updated
- `docs/SYSTEMS.md` — §30.3 snapshot lifecycle corrected; §32 Lord Effect System added
- `docs/gdd.md` — `globalPump`/`lordEffect` row added to §3.2.5 effect table
- `CLAUDE.md` — Lord Effect Pattern section + architectural decision notes added
- `docs/CURRENT_SPRINT.md` — this table

---

## B30: Mobile Undo Button Never Visible

| Root Cause | Files Changed | Status |
|-----------|---------------|--------|
| `canUndoMana` in `DuelScreenMobile.tsx` included a stale `spellsThisTurn === 0` guard not present in the desktop `DuelScreen.tsx`. The earlier Duel Bug Batch 1 fix (B1 row) corrected `DuelCore.js` and `DuelScreen.tsx` but missed the mobile screen. Removed the guard to match desktop logic. | `src/ui/Mobile/DuelScreenMobile.tsx` | ✅ Fixed |

### Documentation updated
- `docs/SYSTEMS.md` — §30.2 preconditions updated to remove stale `spellsThisTurn === 0` requirement
- `docs/CURRENT_SPRINT.md` — this table

---

## Bug Fix: AI Virtual Mana Tracking (Ramp Spells)

### Deliverables

| Fix | File(s) Changed | Status |
|-----|----------------|--------|
| `evaluateAndCast`: credit tapped-source mana into `vManaAfterTap`; deduct spell cost; credit spell's produced mana (`addMana`) into `poolAfterCast`; store in `newVirtualState.o.mana` so next spell in the loop sees correct remaining mana | `src/engine/AI.js` | ✅ Done |
| `applyVirtualPlay`: credit `addMana` spells (e.g. Dark Ritual) into virtual pool via `card.mana` array so `scoreTurnPlan` sees ramp-enabled follow-up affordability | `src/engine/AI.js` | ✅ Done |
| `planMain`: after any `addMana` spell is cast, re-call `selectPlayableCards` on updated virtual state and extend the candidate list with newly-affordable spells | `src/engine/AI.js` | ✅ Done |
| Playwright E2E tests: 4 scenarios verifying ramp chaining, negative control, and no-overextension | `tests/e2e/ai-mana-tracking.spec.js`, `playwright.config.js` | ✅ Done |

### Documentation updated
- `docs/SYSTEMS.md` — Updated `evaluateAndCast` entry with virtual mana tracking detail
- `docs/CURRENT_SPRINT.md` — This entry
- `CLAUDE.md` — AI mana simulation architectural note added

---

## Bug fix: Cast button now appears for instants during any priority window

Bug fix: Cast button now appears when an instant is selected during a priority window in any phase, not just MAIN_1/MAIN_2. Removed the standalone "Cast Instant" button from DuelScreen.

| Change | Files Changed | Status |
|--------|--------------|--------|
| `ActionBar.tsx`: import `isInst`; Cast button condition changed to `inMain || (priorityWindowOpen && selectedCard && isInst(selectedCard))` | `src/ui/ActionBar/ActionBar.tsx` | ✅ Fixed |
| `DuelScreen.tsx`: removed "Cast Instant" button block that tried to paper over the missing Cast button | `src/DuelScreen.tsx` | ✅ Fixed |

### Documentation updated
- `docs/SYSTEMS.md` — §18.7 rewritten to describe the ActionBar cast condition; Cast Instant button removed
- `docs/CURRENT_SPRINT.md` — this entry

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

---

## Test Scaffolding

`src/engine/__tests__/_factory.js` is now the canonical source for shared test factories (`makePlayerState`, `makeState`, `makeCreature`, `makeLand`, `makeSpell`). All `__tests__` files and scenario files import from there; local duplicates are an anti-pattern.

`tests/scenarios/` is the designated location for scenario-based regression tests -- one file per bug or feature validated.

### Claude Code workflow for new scenario tests

- Copy `tests/scenarios/_template.test.js` to `tests/scenarios/<your-scenario-name>.test.js`
- Replace the describe/it blocks with the scenario being validated
- Run: `npm test -- tests/scenarios/<your-scenario-name>.test.js`
- Confirm the test fails before applying the fix
- Apply the fix, re-run, confirm it passes
- Leave the file in place as a permanent regression test
