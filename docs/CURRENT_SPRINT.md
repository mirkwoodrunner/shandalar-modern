# Current Sprint

## Premodern Card Pool -- Data Generation (2026-06-18)

Generated `src/data/cardsPremodern.js` (`CARD_DB_PREMODERN`), a standalone Premodern format
card pool. No effect logic -- all entries have `implemented:false`. Fully independent of `CARD_DB`.

| Metric | Value |
|---|---|
| Total unique cards | 5408 |
| Legal (legal:true) | 5375 |
| Banned (legal:false) | 33 |
| Sets covered | 29 (4ed through scg) |
| Source | Scryfall oracle bulk data, filtered by `legalities.premodern` |
| Ban list match | All 33 match prompt spec exactly -- no discrepancies |
| Slug collisions with CARD_DB | 403 (flagged; no merging done -- separate pools) |
| Tests | 16 Vitest tests in `tests/scenarios/cardsPremodern.test.js` |

**Notes:**
- The `set` field on each card is the Scryfall oracle canonical printing, which may be
  a post-Premodern reprint (e.g. `dmr`, `vma`, `ema`). It does not always reflect the
  earliest Premodern appearance. No runtime effect since all cards are `implemented:false`.
- 403 slug collisions with existing `CARD_DB` represent shared cards (Alpha-era reprints
  in core sets). These are separate pools and do not need to be merged.
- Generation script: `tools/generate-premodern-pool.mjs` (uses local
  `scryfall/oracle-cards-20260419090229.zip`).

---

## Bug Fix: AI land destruction silent no-op (2026-06-18)

Root cause: `selectTarget()` in `AI.js` had no `destroyTargetLand` branch and returned `[]`
instead of `null`, causing Sinkhole/Stone Rain/Ice Storm to cast with zero targets and silently
fizzle. `ACTIVATE_ABILITY` in `DuelCore.js` hardcoded `s.p.bf`/`caster:"p"`, so the AI could
never activate abilities (Strip Mine sacrifice, Demonic Hordes tap) -- the card lookup always
searched the human's battlefield and returned nothing.

| Change | File |
|---|---|
| `selectLandToDestroy()` helper: picks highest-value opposing land (nonbasics first, then scarcest-color basic) | `src/engine/AI.js` |
| `selectTarget()`: new `destroyTargetLand` branch returns `null` when no target exists | `src/engine/AI.js` |
| `planActivatedAbilities()`: new Strip Mine (T+sac) and Demonic Hordes (BBB+T) branches | `src/engine/AI.js` |
| `dcActions` translator: `ACTIVATE_ABILITY` now emits `who: 'o'` | `src/engine/AI.js` |
| `ACTIVATE_ABILITY`: who-aware via `w = action.who \|\| 'p'`; `sac` cost parsing added (step 2) | `src/engine/DuelCore.js` |
| `destroyTargetLand` resolution: fizzle `dlog` added for missing/invalid target | `src/engine/DuelCore.js` |
| 18 Vitest unit tests (Groups A-D) | `tests/scenarios/ai-land-destruction.test.js` |

Follow-up (not done in this pass): Mishra's Factory `animateLand`/`pumpAssemblyWorker` and
Birds of Paradise `addManaAny` activated abilities remain player-only and are not yet planned
by the AI.

---

## Bug Fix: AI mulligan re-firing during priority windows (2026-06-17)

Root cause: `aiDecide` / `shouldMulligan` in `AI.js` had no terminal pregame state. The instant-
response priority effect in `useDuelController.ts` called `aiDecide` on every open priority window
during the player's turn -- including after a turn-1 spell cast. `shouldMulligan` re-evaluated each
time, returning MULLIGAN actions that are not valid priority-window responses. `priorityPasser` for
'o' was never set, stalling the priority window permanently.

| Change | File |
|---|---|
| `mulliganDecided: false` added to both player objects in `buildDuelState` | `src/engine/DuelCore.js` |
| MULLIGAN reducer: sets `o.mulliganDecided: true`; no-ops if already set | `src/engine/DuelCore.js` |
| New MULLIGAN_KEEP reducer: sets `o.mulliganDecided: true`, no hand change | `src/engine/DuelCore.js` |
| `shouldMulligan`: bails immediately when `state.o.mulliganDecided` is true | `src/engine/AI.js` |
| Instant-response priority effect: rejects MULLIGAN/MULLIGAN_KEEP, falls back to PASS_PRIORITY | `src/hooks/useDuelController.ts` |
| Regression tests (11 Vitest unit tests) | `tests/scenarios/ai-mulligan-no-restall.test.js` |

---

## Gemini Controller Wiring (2026-06-11)

- Gemini controller wiring complete (Prompt 3): fetchGeminiMove wired for
  useGemini:true opponents in MAIN_1/MAIN_2/COMBAT_ATTACKERS/COMBAT_BLOCKERS.
  ATTACK_ALL expands to individual DECLARE_ATTACKER dispatches.
  Sandbox diagnostic logging: console.group payload + GEMINI_LOG in-game entries.
  isGeminiThinking state surfaced to UI.

---

## Bug Fix: Disintegrate creature targeting (2026-06-11)

- Fixed: Disintegrate routed all creature targets to player hurt() due to
  dead-code else branch; removed t2 intermediary variable (DuelCore.js)

---

## Bug Fix: UNDO_MANA_TAPS Exploit via Activated Abilities (2026-06-11)

- Fixed: UNDO_MANA_TAPS exploitable after non-mana activated abilities (DuelCore.js)
- Fixed: Creature mana sources (Llanowar Elves etc.) not captured in undo snapshot
  when activated before first land tap (DuelCore.js)

---

## Bug Fix: Conditional Counter Payment Modal -- Force Spike + Power Sink (2026-06-10)

| Change | Files |
|--------|-------|
| `pendingConditionalCounter` state field in `buildDuelState` | `src/engine/DuelCore.js` |
| `"counter"` case forks on `card.id === "force_spike"` to suspend resolution | `src/engine/DuelCore.js` |
| `"powerSink"` case always suspends via `pendingConditionalCounter` | `src/engine/DuelCore.js` |
| `CONDITIONAL_COUNTER_CHOICE` reducer: pay deducts cost, decline counters spell; Power Sink additionally taps lands + drains mana on decline | `src/engine/DuelCore.js` |
| `ADVANCE_PHASE` blocked while `pendingConditionalCounter` is set | `src/engine/DuelCore.js` |
| `resolveConditionalCounter` dispatcher | `src/hooks/useDuel.js` |
| `ConditionalCounterModal` shared component (Force Spike + Power Sink) | `src/ui/duel/ConditionalCounterModal.tsx` |
| Modal render in `DuelScreen.tsx` when `targetCaster === 'p'` | `src/DuelScreen.tsx` |
| AI auto-resolution: pay if totalMana >= cost | `src/hooks/useDuelController.ts` |

**Spell Blast**: unchanged. It is a hard counter gated at cast time by CMC matching; no payment interaction.

## Gemini Advisor: LegalActions.js (2026-06-09)

| Deliverable | Files |
|---|---|
| `src/engine/LegalActions.js` -- `computeLegalActions(state, phase)` | New file |
| Export `selectPlayableCards`, `buildTapActions`, `computeAvailableMana`, `selectBestCurve` from `AI.js` | `src/engine/AI.js` |
| Vitest unit tests (index 0 invariant, empty board, empty attacker list) | `tests/scenarios/computeLegalActions.test.js` |
| SYSTEMS.md §23 updated | `docs/SYSTEMS.md` |

---

## Bug Fixes: AI COMBAT_ATTACKERS Guard (2026-06-08)

| Fix | Root Cause | Change |
|-----|-----------|--------|
| AI stuck on COMBAT_ATTACKERS | Guard in AI loop useEffect bailed on COMBAT_ATTACKERS and COMBAT_BLOCKERS unconditionally, including when active === 'o' | Added `s.active === 'p'` condition so the bail only fires when the player is declaring |

**Tests:** "AI declares attackers on its turn" desktop + mobile in `e2e/duel-controller.spec.ts`

---

## Bug Fixes: Blocker UI Clarity + AI Chump Blocking (2026-06-07)

| Fix | File(s) Changed |
|-----|----------------|
| Battlefield/Half: `pendingBlockerIid` and `blockers` props for visual feedback | `src/ui/Battlefield/Battlefield.tsx`, `src/ui/Battlefield/Half.tsx` |
| Desktop DuelScreen: wire `pendingBlockerIid` and `s.blockers` through to Battlefield | `src/DuelScreen.tsx` |
| ActionBar: `blockerHint` prop with contextual text during player blocker declaration | `src/ui/ActionBar/ActionBar.tsx` |
| AI `planBlock`: chump fallback for attackers with power >= threshold | `src/engine/AI.js` |

**Tests:** BLK-03, BLK-04 in `e2e/sandbox.spec.ts`

---

## Bug Fixes: P/T Display, Triskelion Targeting, Counterspell Stack (2026-06-07)

| Fix | File(s) Changed |
|-----|----------------|
| `getDisplayPT()` helper: sums eotBuffs + counter deltas for UI display | `src/engine/DuelCore.js` |
| FieldCard (desktop): renders dispPow/dispTou; brass-hi tint when buffed | `src/ui/Card/FieldCard.tsx` |
| FieldCard (mobile): renders dispPow/dispTou; brass-hi tint when buffed | `src/ui/Mobile/FieldCard.tsx` |
| Triskelion targeting: triskelionPing added to target-required and player-targetable lists | `src/hooks/useDuelController.ts` |
| ACTIVATE_ABILITY: counter-cost abilities skip canPay mana check | `src/engine/DuelCore.js` |
| AI priority window response uses applyAiActionsWithPriority so Counterspell sits on stack visibly | `src/hooks/useDuelController.ts` |

## Overworld Map Visual Polish (2026-06-07)

- [x] Phase 1: Deterministic coord-hash tile variant classes (rotation/mirror per terrain type) via `getTileVariantClass()`; emoji wrapped in `display:inline-block` span for cross-platform transform stability
- [x] Phase 2: `.ow-tile` overflow changed to `visible`; `.ow-grid-wrapper` clips at map boundary; row-index z-index passed to `MapTile` for Y-sort depth layering
- [x] Phase 3: Biome-matched inset `box-shadow` borders replace hard grid edges per terrain class
- [x] Phase 4: CSS `filter: drop-shadow()` added to `.sprite` in `Sprite.jsx` for grounded entity rendering
- [x] Phase 5: CSS `mask-image` radial gradient on `.ow-fog-edge` tiles for candlelight fog boundary effect

## Duel Engine Bug Fixes (2026-06-07)

### Deliverables

| Fix | Root Cause | File(s) Changed |
|-----|-----------|-----------------|
| Mana dork (Llanowar Elves etc.) adds correct colored mana | `manaItem` in ACTIVATE_ABILITY spread `{ ...card }` without promoting `activated.mana` to top-level `mana`; `resolveEff` read `card.mana` as `undefined` and defaulted to colorless | `src/engine/DuelCore.js` |
| Ley Druid untaps player-chosen land | `untapLand` absent from `handleActivate`'s pending-activate set; first land in bf array was always chosen instead | `src/hooks/useDuelController.ts` |
| AI no longer casts Berserk during main phase | `BEFORE_COMBAT_DAMAGE_PHASES` included `MAIN_1` and `COMBAT_BEGIN`; narrowed to `COMBAT_ATTACKERS` and `COMBAT_BLOCKERS` only | `src/engine/AI.js` |

**Tests:** BF-01, BF-02, BF-03 in `e2e/sandbox.spec.ts`

---

## Overworld Plaque Visibility (2026-06-07)

- [x] Improved town/ruin/dungeon plaque icon visibility: bumped base font-size 12->14px,
      added drop-shadow filter to lift emoji off dark background, strengthened ring opacity
      and added outer glow for dungeon/ruin, added ow-plaque-town modifier class with amber ring.

---

## Overworld Mobile Refactor (2026-06-07)

- [x] Overworld mobile layout refactor -- useOverworldController extracted;
      OverworldGameDesktop and OverworldGameMobile split; 14x16 viewport;
      compact topbar + tile strip + quick-stat bar + bottom sheet drawer

---

## Counter-Spell Targeting (2026-06-07)

### Deliverables

| Fix | File(s) Changed |
|-----|----------------|
| findStackTarget() resolves counter targets by stack item id with positional fallback | `src/engine/DuelCore.js` |
| counter/counterCreature/powerSink: explicit target, fizzle if target gone at resolution | `src/engine/DuelCore.js` |
| destroyRedOrCounter/destroyBlueOrCounter: perm vs stack item dispatch by target type | `src/engine/DuelCore.js` |
| Spell Blast CMC match enforced at cast time and resolution | `src/engine/DuelCore.js` |
| BEB/REB cast legality gated on red/blue target existing | `src/engine/DuelCore.js` |
| AI selectTarget and planInstantResponse return explicit stack item ids | `src/engine/AI.js` |
| pendingMode, isCounterEffect, needsStackTarget exported from hook | `src/hooks/useDuelController.ts` |
| StackDisplay: onItemClick + selectedItemId props for counter targeting | `src/ui/Stack/StackDisplay.tsx` |
| Desktop: BEB/REB mode picker with greyed unavailable options; stack items clickable in counter mode | `src/DuelScreen.tsx`, `src/ui/duel/TargetingOverlay.jsx` |
| Mobile: BEB/REB mode picker and stack item tap in counter mode | `src/ui/Mobile/DuelScreenMobile.tsx` |
| Tests: CTR-01 through CTR-05 (Playwright), CT-01 through CT-04 (Vitest) | `e2e/sandbox.spec.ts`, `src/engine/__tests__/counter-targeting.test.js` |

**Known simplifications:**
- Force Spike counters unconditionally (no payment prompt from targeted player).
- Spell Blast CMC match enforced via X input and fizzle log; no inline UI feedback for ineligible targets.

---

## Bug Fixes (2026-06-07)

| AI-REGROWTH-01: Regrowth incorrectly targeted opponent player | `src/engine/AI.js` | ✅ Fixed |

## Bug Fixes (2026-06-06)

- Fix: `viewOfs` now initializes to `{ x: startX, y: startY }` so the map centers on the player at game start instead of defaulting to tile (0,0). (`src/OverworldGame.jsx`)

---

## Black Lotus Cancel and Undo Fix (2026-06-06)

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Defer sacrifice to CHOOSE_LOTUS_COLOR; remove zMove from ACTIVATE_ABILITY addMana3Any | `src/engine/DuelCore.js` | [x] Done |
| Add CANCEL_LOTUS action: untaps card, clears pendingLotus, no sacrifice | `src/engine/DuelCore.js` | [x] Done |
| manaTapSnapshot created in addMana3Any tap so undo button appears | `src/engine/DuelCore.js` | [x] Done |
| UNDO_MANA_TAPS guards against pendingLotus === true | `src/engine/DuelCore.js` | [x] Done |
| cancelLotus dispatcher | `src/hooks/useDuel.js` | [x] Done |
| handleLotusCancel dispatches CANCEL_LOTUS before closing modal | `src/hooks/useDuelController.ts` | [x] Done |
| Playwright tests (T1,T3-T5 desktop; M1-M2 mobile) | `tests/e2e/lotus-cancel-undo.spec.js` | [x] Done |
| Documentation | `docs/SYSTEMS.md`, `docs/CURRENT_SPRINT.md`, `docs/MECHANICS_INDEX.md` | [x] Done |

---

## AI Summoning Sickness Tap Fix (2026-06-05)

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Fix AI summoning sickness tap bypass (computeAvailableMana, buildTapActions, planActivatedAbilities) | `src/engine/AI.js` | [x] Done |
| Regression tests | `src/engine/__tests__/AI.summoningSick.tap.test.js` | [x] Done |
| Documentation | `CLAUDE.md`, `docs/CURRENT_SPRINT.md` | [x] Done |

---

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
| Combat priority windows (B33) | `src/engine/phases.js`, `src/engine/DuelCore.js`, `src/engine/AI.js`, `src/hooks/usePhaseAdvance.ts`, `src/hooks/useDuelController.ts`, `src/ui/ActionBar/ActionBar.tsx`, `src/DuelScreen.tsx`, `src/ui/Mobile/ActionBar.tsx`, `src/ui/Mobile/DuelScreenMobile.tsx`, `src/ui/Mobile/PhaseBar.tsx`, `src/ui/Mobile/PhaseRibbon.tsx` | ✅ Done |

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
- [TD-006] ✅ FIXED — Spell cast log now includes target label
  (e.g. "p casts Lightning Bolt targeting Opponent.",
  "o casts Terror targeting Grizzly Bears.").
