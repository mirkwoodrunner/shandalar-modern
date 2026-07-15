# Hand-off: Unrelated Test Failures Found During Silence-Deadlock Fix

**Branch:** `claude/ai-stuck-log-access-9sqm3i`
**Not blocking:** the fix this session shipped (commit `b63450f` — AI turn deadlock
under Silence, see `docs/MECHANICS_INDEX.md` Bug Fix Log entry
`SILENCE-DEADLOCK-1`) is complete and independently verified via targeted tests. Both
failure sets below were found incidentally while testing that fix and are unrelated to
it. This doc is informational, for a fresh session to pick up either item.

---

## Item 1: `tests/e2e/dungeon-tileset.spec.ts` — sprite asset connection resets

**File:** `tests/e2e/dungeon-tileset.spec.ts` (tag `@overworld-visual-1`)

Surfaced as a `npm run test:audit` random pick against the Silence-deadlock fix (which
only touches `src/engine/DuelCore.js` and `src/hooks/useDuelController.ts` — no code
path connects those files to dungeon sprite rendering). 8 of 28 cases failed, all across
all three Playwright project/viewport combinations (`chromium` desktop, `chromium`
mobile, `mobile-chrome`):

- `1: revealed floor cells render <img> tiles, not blank divs` (line 23)
- `7: no 404s for sprite assets and no console errors` (line 209)

Every failure has the same shape — a `consoleErrors`/`failedRequests` assertion
(`toEqual([])`) catching actual network failures, not a game-state or DOM assertion:

```
Expected: []
Received: [
  "Failed to load resource: net::ERR_CONNECTION_RESET",
  "Failed to load resource: net::ERR_CONNECTION_RESET",
  "Failed to load resource: the server responded with a status of 404 (Not Found)",
]
```

Tests `2` through `6` in the same file (fog-of-war, enemy sprites, treasure chest,
exit ladder, player token animation) all passed — only the two console-error/network
assertions fail. This pattern (connection resets, not consistent 404s) points toward
flaky static-asset serving under this session's sandboxed dev server rather than a
missing/misnamed sprite file, but that has **not been confirmed against a clean
baseline** — the CLAUDE.md audit-failure protocol requires stopping and getting
explicit sign-off before further diagnostics once `test:audit` fails, so this session
stopped short of that comparison.

### Suggested first step

Re-run just this file against `origin/claude/ai-stuck-log-access-9sqm3i` (or its parent
commit) in a clean environment/container to see if the connection resets reproduce
without any of this session's changes present. If they don't reproduce, it's sandbox
flakiness and this item can likely be closed with no code change. If they do reproduce,
look at what serves the sprite assets under test (likely `public/` static assets via the
Vite dev server) and whether the specific images requested by the failing tests exist at
the expected paths.

---

## Item 2: `tests/e2e/engine-fatal-error-overlay.spec.ts` — pre-existing timeouts

**File:** `tests/e2e/engine-fatal-error-overlay.spec.ts` (tag `@engine-cast-flow-ui-2`)

3 of 4 tests fail with 30s timeouts:

- `ENGINE-ERR-02: "Exit to Overworld" on the error overlay forfeits and navigates away`
  (line 80) — times out on `page.waitForURL((url) => url.pathname === '/', { timeout:
  5_000 })` after clicking the button.
- `ENGINE-ERR-03: forced AI error after End Turn shows the error overlay on the mobile
  ActionBar` (line 93) — times out on `page.waitForSelector('[data-testid="duel-screen"]')`
  before the test even gets to the overlay.
- `ENGINE-ERR-04: "Exit to Overworld" works on the mobile overlay` (line 101) — same
  `duel-screen` selector timeout as ENGINE-ERR-03.

`ENGINE-ERR-01` (line 72, the desktop equivalent of ERR-03/04's setup) passes, so the
mobile duel-screen setup path specifically is implicated for ERR-03/04, while ERR-02 is
a separate desktop-only navigation issue.

**Confirmed pre-existing**: this session ran this spec against the pre-fix parent commit
(`7bb391f`, before any Silence-deadlock changes) and got the identical 3 failures / 1
pass. This is not a regression introduced by this session's work — it was already broken
before `b63450f`.

Worth noting for whoever picks this up: `useDuelController.ts`'s new general AI stall
watchdog (Fix 3 in `SILENCE-DEADLOCK-1`, see `docs/MECHANICS_INDEX.md`) reuses this same
`reportFatalAiError`/`EngineErrorOverlay` machinery as a timeout fallback. It's worth
re-running this spec once these failures are fixed, both to confirm the fix and as a
sanity check that the new watchdog didn't introduce any secondary interaction with the
overlay flow.

### Suggested first step

Start with `ENGINE-ERR-03`/`ENGINE-ERR-04` (the `duel-screen` selector timeout, i.e. the
mobile duel screen never finishes loading in this spec's setup) since `ENGINE-ERR-02`'s
navigation timeout could plausibly be a downstream symptom of the same underlying setup
issue rather than an independent bug — worth checking whether ENGINE-ERR-02's desktop
setup shares a helper with ERR-03/04's mobile setup in this file.

---

## Protected Files — Do Not Modify Without Explicit Instruction

Per `CLAUDE.md`:

```
src/engine/DuelCore.js
src/engine/layers.js
src/engine/AI.js
src/data/cards.js
src/hooks/useDuel.js
src/hooks/useDuelController.ts
src/hooks/useOverworldController.js
src/engine/cardHandlers.js
src/engine/phases.js
```

If either fix turns out to require touching one of these, include the phrase
`ENGINE FILE EDIT APPROVED` in the prompt to pass the pre-edit hook guard, or confirm
with Chris first.

---

## After Either Item Is Fixed

Per `CLAUDE.md`'s tiered documentation policy, a bug fix like these two normally needs
only `docs/MECHANICS_INDEX.md` (Bug Fix Log entry) and `docs/CURRENT_SPRINT.md` updated
— no `SYSTEMS.md`/`gdd.md`/`COMPONENT_REGISTRY.md` changes unless the fix turns out to
change a formal system's behavior. Run the relevant targeted tests (`@overworld-visual-1`
family for Item 1, `@engine-cast-flow-ui-2` family for Item 2, per
`scripts/test-tags.json` — see the note in this session's plan about `CLAUDE.md`'s
testing section being stale relative to PR #337's tag reorg) before committing.
