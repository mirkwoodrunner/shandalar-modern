# Changelog

## Unreleased

### Tier 5 — AI Strategic Depth

- **Curve-based card selection**: `selectPlayableCards` no longer sorts by CMC descending. A new `selectBestCurve` helper runs a greedy descending pass augmented with up to three "drop the biggest" alternatives to find the card combination that maximises mana utilisation without exceeding the budget. Example: on 4 mana with a 4-drop + two 2-drops, the AI now casts both 2-drops instead of the 4-drop.
- **Multi-plan scoring with `evaluateBoard`**: `planMain` generates two candidate plans — greedy (from `selectBestCurve`) and tempo (cheapest-first using the same card set). Each plan is simulated against a virtual state via `applyVirtualPlay` and scored with `evaluateBoard`. The higher-scoring plan is executed. `evaluateBoard` is no longer dead code.
- **MCTS gated on high aggression**: Profiles with `aggression >= 0.9` (currently KARAG at 1.0) use `getBestMove` with 600 iterations to choose between the two candidate plans instead of score comparison. Falls back to score comparison if MCTS returns null.
- **Performance budget**: Turn calculation is bounded at 500ms p95. If exceeded, remove the MCTS branch first, then simplify to a single plan.

### Tier 4 — AI Architectural Cleanup

This tier is a refactor. Behavior is unchanged.

- **Change 1 — `selectPlayableCards`**: Extracted from `planMain`. Pure function that returns `{ card, effectiveCost, xVal }[]` for all legally castable cards. Handles timing rules, `castRestriction`, mana ceiling check, and X-spell substitution. No strategic evaluation.
- **Change 2 — `selectTarget`**: Extracted from `planMain`. Per-effect function that returns a target array or `null` (skip without tapping mana). Covers counter-spells, removal, pump spells (with `greedySpells >= 0.5` gate preserved), Berserk, Disintegrate/Drain Life (deterministic killability threshold), Raise Dead / Resurrection, and generic spells.
- **Change 3 — `evaluateAndCast`**: Extracted from `planMain`. Applies the `scoreSpellValue * greedySpells < 0.35` gate, calls `buildTapActions`, and emits the `PLAY_CARD` spec action with pre-built `_tapActions`. Returns `{ actions, newVirtualState }` or `null`.
- **Change 4 — `planMain` rewritten as coordinator**: Body is now under 80 lines. Delegates to the three helpers above. Step order: channel top-up → land play → spell loop → activated abilities → `PASS_PRIORITY`.
- **Change 5 — `aiDecide` adapter stripped of fallback logic**: The `PLAY_CARD` case no longer reconstructs tap actions as a fallback. If `_tapActions` is absent (a planner bug), it logs `console.error` and breaks — fail-fast per project error-handling philosophy.
- **Change 6 — Contract check at top of `aiDecide`**: If `getAIPlan` returns a malformed plan, logs `console.error` and returns `[]`.
- **Test — `tests/ai-refactor-parity.mjs`**: Snapshot test verifying deterministic output for a fixed game state across 10 calls, counter-spell filtering, removal targeting, and plan structure.

### Tier 3 — Instant-Speed AI Response

- **Change 1 — `planInstantResponse` planner**: Added to `AI.js` after `planEnd`. Evaluates the AI's instant-speed options when it has priority during the player's turn. Handles counter-spells (scored by spell threat: CMC + creature/burn/wrath multipliers), instant removal during combat (targeting via `scoreThreat`), burn at face for lethal only, and Fog when incoming damage is significant. Casts at most one instant per window; always terminates with `PASS_PRIORITY { who: 'o' }`.
- **Change 2 — `getAIPlan` priority-window gate**: Added an early-exit check before the phase switch: if `gameState.priorityWindow && gameState.active === 'p'`, routes to `planInstantResponse` instead of the phase planner. Prevents the main-phase planner from re-running during a window on the player's turn.
- **Change 3 — `PASS_PRIORITY` adapter emits to DuelCore during windows**: The `PASS_PRIORITY` case in `aiDecide` now pushes `{ type: 'PASS_PRIORITY', who: 'o' }` to DuelCore when `state.priorityWindow` is true. Outside a priority window, the no-op behavior is preserved (DuelScreen handles phase advance).
- **Change 4 — `DuelScreen.tsx` AI priority hook**: Replaced the simple AI priority-window handler (which cast any affordable instant at `tgt: 'p'`) with a context-aware effect. When `active === 'p'` (player's turn), uses `aiDecide` (200 ms delay) so `planInstantResponse` runs with full context. When `active === 'o'` (AI's own turn), passes priority immediately with no evaluation — the AI already acted in the main loop. Both paths guard on `priorityPasser !== 'o'` and `!over` to prevent re-firing. Dependency array is `[s.priorityWindow, s.active, s.priorityPasser, s.over]`.

> **Breaking-change risk**: The AI may now hold priority and dispatch actions during the player's turn. Any workflow that assumed the AI never acts while `active === 'p'` is now invalid. The constraint is strictly scoped: the AI only acts inside an open priority window (`state.priorityWindow === true`), and only once per window.

### Tier 2 — AI Heuristic Improvements

- **Change 1 — Scored spell evaluation**: Replaced `Math.random() >= profile.greedySpells` in the generic-spells block with a `scoreSpellValue(card, state, profile)` helper that scores spells 0–1 by situational value (lethal burn = 1.0, draw scales with hand deficit, life gain scales with low life). Gate is now `score * profile.greedySpells < 0.35`.
- **Change 2 — Threat-aware removal targeting**: Replaced highest-power targeting with `scoreThreat(creature, state)` which adds bonuses for flying, lifelink, deathtouch, trample, and first strike. Expensive removal (CMC ≥ 4) is withheld against trivial threats unless the opponent is at low life. Removed the `Math.random() < profile.removalPriority` gate.
- **Change 3 — Multi-blocker lethal prevention**: Added an aggregate lethal check at the top of `planBlock`. When total incoming damage ≥ AI life, attackers are sorted by power and chumped in order until damage drops below lethal.
- **Change 4 — Activated ability planner**: Added `planActivatedAbilities(state, profile)` called from `planMain` before `PASS_PRIORITY`. Handles Triskelion-style ping: kills the highest-threat one-toughness creature; fires at opponent face when their life ≤ 5.
- **Change 5 — Berserk prefers opposing attackers**: Berserk now targets the opponent's highest-power attacker first (they die at end of turn, making it effective removal); falls back to own attackers when no opponent attackers are present.

### Tier 1 — AI Bug Fixes

- **Fix 1 — `worthlessBlock` logic inverted**: Removed the `worthlessBlock` variable and its guard in `planBlock`; the inverted condition was refusing to block with the AI's best blocker.
- **Fix 2 — Remove diagnostic `console.warn` in `planAttack`**: Deleted the `console.warn('[AI] planAttack candidates:…')` line that fired on every combat phase.
- **Fix 3 — `RESOLVE_STACK` double-resolve**: Made the `RESOLVE_STACK` push in `aiDecide` conditional on the card being an instant under a non-batch ruleset; sorceries and permanents are already resolved by `CAST_SPELL`.
- **Fix 4 — `xVal: action._xVal ?? 3` arbitrary fallback**: Changed the default X-value fallback from `3` to `null` in the `CAST_SPELL` push.
- **Fix 5 — AI mulligan logic**: Added `shouldMulligan` function and wired it into `aiDecide`; the AI now mulligans hands with 0–1 lands or 6+ lands, capped at 2 mulligans and never below 5 cards.
