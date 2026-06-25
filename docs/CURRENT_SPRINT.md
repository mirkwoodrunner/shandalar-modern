# Current Sprint — 2026-06-25

## Focus (priority order)
1. ~~**P1 — Gemini "thinking" indicator desktop parity.**~~ **DONE.** `isGeminiThinking` destructured in `DuelScreen.tsx`; `.gemini-thinking` indicator rendered below opponent Banner; CSS rule added to `src/styles/global.css`. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Gemini thinking indicator desktop parity.
2. ~~**P2 — Per-mage Gemini system prompts (2-3 profiles).**~~ **DONE.** Starter roster: DELENIA (white aggro), XYLOS (blue control), MORTIS (black attrition). Logic split into `src/engine/geminiPrompts.js` for testability; `fetchGeminiMove` gains optional `profileId` param; `useDuelController.ts` resolves and passes `oppProfileId` from `ARCHETYPES`. Base-prompt fallback for all other opponents. See `docs/MECHANICS_INDEX.md` -- GEMINI-MAGE-PROMPTS-1.

## Up Next (backlog, not scheduled)
- Premodern card effect handlers -- ongoing batched track. Scryfall oracle verification required per batch. Continue the Batch 1A/1B cadence.
- Additional Gemini mage prompts beyond the P2 starter roster.
- **Gemini path COMBAT_BLOCKERS bug**: `GEMINI_PHASES` in `useDuelController.ts` includes `COMBAT_BLOCKERS`, reproducing the same AI auto-advance bug on the Gemini code path. Gated behind `config.useGemini && config.sandbox`; deferred as separate fix.
- **Resume duel v2** (future): Checkpoint-gated resume -- only safe to load when `stack.length === 0` and phase is in a safe set (MAIN_1, MAIN_2). Requires `LOAD_STATE` reducer (currently dead code) and a gated modal.

## Verified complete during 2026-06-25 planning (pulled from prior backlog/horizon)
- `ali_from_cairo` life floor -- `lifeFloor` field, `getLifeFloor()` + `hurt()` clamp in `DuelCore.js`.
- Power Sink / `xSelect` cast flow -- present on both `DuelScreen.tsx` and `DuelScreenMobile.tsx`.
- Test tagging + e2e consolidation -- single `tests/e2e/`, tagged describes, `run-audit.js` / `run-targeted.js`, `test:audit` / `test:targeted` scripts.
- `AUDIT_REPORT.md` deletion.
- TD-004 -- `draw3` (Ancestral Recall) explicit player target.
- TD-005 -- `PLAY_LAND` rejected while the stack is non-empty.
- Batch 1A (Desert/landwalk) and Batch 1B (Wall/sacrifice) -- e2e specs present. _Assumed green; confirm via `npm run test:audit -- @premodern` if in doubt._
- **BLOCK-GUARD-1** -- COMBAT_BLOCKERS AI auto-advance: Added `if (s.phase === 'COMBAT_BLOCKERS') return;` guard in the AI driver useEffect in `useDuelController.ts`. Human defender's blocker-declaration window is no longer skipped when the AI is the attacking player. See `docs/MECHANICS_INDEX.md` -- Bug Fix: COMBAT_BLOCKERS AI auto-advance.
- **LAXA-PSIONIC-1** -- Lava Axe / Psionic Blast targeting crash: `damage5` defensive fallback + `psionicBlast` creature-damage branch added to `DuelCore.js`; `PLAYER_ONLY_TARGET_EFFECTS` guard added to `useDuelController.ts`, `DuelScreen.tsx`, `DuelScreenMobile.tsx`. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Lava Axe / Psionic Blast creature-targeting crash.
- **RESUME-REMOVE-1** -- Resume-duel modal removed: `ResumeDuelModal.tsx` deleted; resume flow wiring removed from both screen files; autosave retained as crash-recovery; `LOAD_STATE` reducer left as dead code for future safe-phases-only checkpoint design. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Resume-duel modal removed.
- **CASTLE-BOSS-1** -- Castle challenges now route to `BOSS_*` decks. `MAGE_BOSS_ARCHS` added to `src/engine/MapGenerator.js`; `handleChallenge` in `useOverworldController.js` swapped from `MAGE_ARCHS[col]` to `MAGE_BOSS_ARCHS[col]`. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Castle boss-deck routing.

See `docs/SPRINT_ARCHIVE_2026-06-24.md` for the prior sprint's completed work.
