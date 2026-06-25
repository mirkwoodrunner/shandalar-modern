# Current Sprint

_No active sprint focus set yet._

## Completed (2026-06-25) — combined fix batch

- **BLOCK-GUARD-1** — COMBAT_BLOCKERS AI auto-advance: Added `if (s.phase === 'COMBAT_BLOCKERS') return;` guard in the AI driver useEffect in `useDuelController.ts`. Human defender's blocker-declaration window is no longer skipped when the AI is the attacking player. See `docs/MECHANICS_INDEX.md — Bug Fix: COMBAT_BLOCKERS AI auto-advance`.

- **LAXA-PSIONIC-1** — Lava Axe / Psionic Blast targeting crash: `damage5` defensive fallback + `psionicBlast` creature-damage branch added to `DuelCore.js`; `PLAYER_ONLY_TARGET_EFFECTS` guard added to `useDuelController.ts`, `DuelScreen.tsx`, `DuelScreenMobile.tsx`. See `docs/MECHANICS_INDEX.md — Bug Fix: Lava Axe / Psionic Blast creature-targeting crash`.

- **RESUME-REMOVE-1** — Resume-duel modal removed: `ResumeDuelModal.tsx` deleted; resume flow wiring removed from both screen files; autosave retained as crash-recovery; `LOAD_STATE` reducer left as dead code for future safe-phases-only checkpoint design. See `docs/MECHANICS_INDEX.md — Bug Fix: Resume-duel modal removed`.

## Backlog (not yet scheduled)
- `MAGE_ARCHS` in `MapGenerator.js` routes castle fights to regular archetypes, not `BOSS_*` decks. Wire `BOSS_*` decks to castle context.
- **Gemini path COMBAT_BLOCKERS bug**: `GEMINI_PHASES` in `useDuelController.ts` includes `COMBAT_BLOCKERS`, reproducing the same AI auto-advance bug on the Gemini code path. Gated behind `config.useGemini && config.sandbox`; deferred as separate fix.
- **Resume duel v2** (future): Checkpoint-gated resume — only safe to load when `stack.length === 0` and phase is in a safe set (MAIN_1, MAIN_2). Requires `LOAD_STATE` reducer (currently dead code) and a gated modal.

See `docs/SPRINT_ARCHIVE_2026-06-24.md` for the prior sprint's completed work.
