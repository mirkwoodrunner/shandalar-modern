# Test Audit Failure Log

This file records every `npm run test:audit` hard-stop failure (see `CLAUDE.md` --
Targeted and audit scripts). One entry per occurrence, newest first. An audit
failure means the full suite for a randomly-picked *untouched* tag or file
failed after a scoped change passed its own targeted tests -- i.e. a possible
side effect outside the change's declared scope.

This log exists so a failure that turns out to be pre-existing/unrelated
(environment flakiness, a known-broken area) doesn't have to be re-diagnosed
from scratch the next time the same audit file gets picked at random.

Cross-referenced from `CLAUDE.md` -- Targeted and audit scripts.

---

## 2026-07-21 -- `tests/e2e/overworld-sprites.spec.ts` (picked while auditing the A9 Upkeep-Restricted Activated-Ability batch)

**Originating change:** `claude/a9-upkeep-activated-batch-dywz3e` -- 5 new
cards (Dwarven Weaponsmith, Hell's Caretaker, Life Matrix, Mirror Universe,
Tolaria) plus supporting `DuelCore.js`/`useDuelController.ts` engine changes.
Targeted run (17 Vitest + 4 Playwright, all in `tests/scenarios/` and
`tests/e2e/` files scoped to this batch) passed cleanly. The audit script
(`node scripts/run-audit.js --files ...`) then randomly selected
`tests/e2e/overworld-sprites.spec.ts` as an untouched Playwright file to
verify against.

**Command:**
```
node scripts/run-audit.js --files tests/scenarios/a9-upkeep-activated-batch.test.js tests/scenarios/life-matrix.test.js --pw-files tests/e2e/a9-upkeep-activated-batch.spec.js
```

**Result:** 6 of 10 tests failed, across both the `chromium` and
`mobile-chrome` projects:
- `holding an arrow key cycles the walk frame` -- expected more than 1
  distinct animation frame while a key was held, observed only 1.
- `each arrow key sets the matching direction` -- expected `dir` to be
  `"left"`, observed `"right"`.
- `tap-to-move sets direction and toggles the moving flag` -- exceeded the
  30s test timeout at a `page.goto`/`page.waitForTimeout` call.

**Diagnosis:** Judged unrelated to the originating change, for two reasons:
1. **Zero code-path overlap.** The originating change touches exactly
   `src/engine/DuelCore.js`, `src/hooks/useDuelController.ts`, and
   `src/data/cards.js` -- pure duel-engine/card-data files. The failing
   tests exercise `src/OverworldGame.jsx` / `useOverworldController.js` /
   sprite-animation code, an entirely separate system per `CLAUDE.md` --
   System Separation (World Map, Duel Engine, and Card Database logic must
   remain strictly separated).
2. **Failure signature matches environment flakiness, not a logic
   regression.** A walk-cycle frame-count assertion needs multiple real-time
   animation ticks inside a fixed window; the direction assertion is a
   keyboard-timing race; and two failures are outright 30s navigation/wait
   timeouts. In this same run, this batch's own new Playwright tests (fully
   unrelated to sprites) each took ~27-29s against the same 30s ceiling --
   evidence the container was running unusually slow for headless-browser
   automation at the time, independent of any code change.

**Disposition:** Per `CLAUDE.md`'s hard-stop policy, this failure was
reported to the project owner rather than self-overridden. Owner instructed:
document the failure (this entry) and proceed to commit -- the overworld
failure is treated as a known/logged environment flake for this run, not a
blocker on the A9 batch.

**Follow-up (not done here):** If `tests/e2e/overworld-sprites.spec.ts`
comes up failing again in a future audit under different circumstances,
check this entry first -- if the same frame-timing/keyboard-race signature
recurs with no plausible connection to the change under audit, it's likely
the same environment-flakiness class, not a new regression. If it starts
failing deterministically (not just under audit's single random draw), it
may warrant its own investigation as a scenario test in its own right rather
than being re-logged here indefinitely.

---
