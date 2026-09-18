# Learn Mode L1 Spec — Persistence, Profile, and Onboarding Survey

_Written 2026-09-18. Specification only. Nothing in this document is implemented. It is the
direct input to the implementation prompt for `docs/LEARN_MODE_ROADMAP.md` milestone L1._

Prerequisite context: `src/learn/hooks/useLessonPlayer.ts` currently holds all lesson state in
`useState` (`index`, `state`, `selectedAttackers`, `selectedOptions`, `feedback`, `hintShown`).
None of it survives a refresh. This spec adds a durable layer underneath it without changing the
puzzle-runner/checker engine seam.

Read before implementing: `src/hooks/usePersistence.ts` (Shandalar's mid-duel save) and the
`shandalar_unlockables` block in `src/hooks/useOverworldController.js` (artifact-ownership save).
Both are re-read and their pattern is reused directly in section 2 rather than re-derived.

---

## 1. Save shape

One JSON blob under one `localStorage` key (see section 7 for the key itself).

```ts
interface LearnSaveV1 {
  schemaVersion: 1;
  createdAt: string;   // ISO 8601, set once on first-ever write
  updatedAt: string;   // ISO 8601, overwritten on every write
  onboarding: {
    completed: boolean;
    startingTier: number;   // 1-5, derived value only -- see section 5
  };
  exercises: Record<string, ExerciseRecord>;      // keyed by stableId, see below
  dailyActivity: Record<string, DailyActivityRecord>; // keyed by "YYYY-MM-DD", device-local date
}

interface ExerciseRecord {
  attempts: number;            // count of COMPLETED attempts: FEEDBACK_SUCCESS or FEEDBACK_FAIL
                                // arrivals only. Rejected taps (invalid moves) are not attempts
                                // and do not increment this -- see section 3's ghost-state note.
  firstTrySuccess: boolean;    // true iff the first completed attempt was a success
  hintUsed: boolean;           // true iff the hint was shown at any point before a successful
                                // attempt on this exercise. Weighted ZERO in L8 mastery scoring --
                                // see the callout under decision 6 below. Kept only as a
                                // content-quality diagnostic (an exercise most users need a hint
                                // for is a badly written exercise), never as a score input.
  lastCompletedAt?: string;    // ISO 8601 timestamp of the most recent SUCCESS. Absent if the
                                // exercise has never been completed successfully.
}

interface DailyActivityRecord {
  exercisesCompleted: number;  // count of successful completions on that calendar day
}
```

**Stable exercise ids (decision 3).** The save keys `exercises` by a `stableId`, not by the
`Exercise.id` field exercises already carry (`"1.1-01"`, `"3.1-02"`, etc.). That existing `id`
doubles as the display number and the `?exercise=` deep-link key, and L2 is going to renumber it
(`docs/LEARN_MODE_ROADMAP.md` section 4.3: "Renumber when the real tree lands in L2... a
renumber is a real change, not a cosmetic one"). A save keyed on that field would silently orphan
every record the moment L2 ships.

- **How existing exercises get a `stableId`.** The L1 implementation prompt adds a `stableId`
  field to every exercise literal in `src/learn/data/units.ts`, initialized to a frozen copy of
  that exercise's *current* `id` string at the moment this ships (`"1.1-01"` keeps
  `stableId: "1.1-01"` forever, even after L2 renumbers its display `id` to something else).
  Going forward, every newly authored exercise gets a `stableId` assigned once at authoring time
  and never reassigned. `id` may change under it at any point; `stableId` never does.
- **Retirement.** If an exercise is ever removed from the curriculum, its `stableId` stays as a
  key in any save that already has a record for it. It is not actively pruned -- pruning would
  need its own migration step for a few bytes of dead data. Mastery/streak calculations (L8/L9)
  iterate the *current* curriculum's `stableId` list and simply never look up a retired key, so
  orphaned records are inert, not a correctness problem.

**Deliberately excluded:**
- Raw onboarding answers (decision 7 -- only the derived `startingTier` is stored).
- Per-attempt step logs (which lands/spells were tapped, in what order). Aggregate counts are
  enough for mastery (L8) and streaks (L9); a full replay log is unbounded growth for a benefit
  no planned milestone needs. If content-quality telemetry ever wants this, that is L11's
  local-only telemetry, a separate mechanism, not this save.
- Any user identifier (decision 9). This is a local, anonymous blob.
- A profile wrapper (decision 4). The shape above is single-profile. A future profile layer would
  nest it as `profiles: { <profileId>: LearnSaveV1-minus-schemaVersion }` without renaming any
  field inside it -- that is a `schemaVersion` bump handled by section 2's contract, not a
  redesign of `ExerciseRecord`/`DailyActivityRecord`/`onboarding`.

---

## 2. Validation contract

Mirrors `isValidDuelState` in `src/hooks/usePersistence.ts` exactly -- shallow, presence-based,
never a deep per-field validator, and it degrades to "no save" rather than trying to repair
anything:

```ts
const SAVE_KEY = 'learn:progress';
const SCHEMA_VERSION = 1;

function isValidLearnSave(value: unknown): value is LearnSaveV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== SCHEMA_VERSION) return false;
  for (const key of ['createdAt', 'updatedAt', 'onboarding', 'exercises', 'dailyActivity']) {
    if (!(key in v)) return false;
  }
  if (typeof v.onboarding !== 'object' || v.onboarding === null) return false;
  if (typeof v.exercises !== 'object' || v.exercises === null) return false;
  if (typeof v.dailyActivity !== 'object' || v.dailyActivity === null) return false;
  return true;
}
```

`load()`, `save()`, and `clear()` follow `loadDuel`/`saveDuel`/`clearDuel` line for line: every
`localStorage` call wrapped in `try/catch`, a parse failure or a failed shape check clears the
key and returns "no save" rather than throwing, and a `setItem` failure (quota, private
browsing) is silently swallowed -- same posture as the existing comment `// quota exceeded or
private browsing`. This is one pattern reused, not a second one invented.

**Fail-fast posture, same spirit as `puzzleRunner.ts`'s `LEARN_*` throws:** a malformed save is
never partially trusted. If `isValidLearnSave` rejects it, the *entire* blob is discarded and the
user starts over as a first-load user (section 4), never a half-applied merge of old and default
data. The difference from `puzzleRunner.ts` is only where the failure surfaces: `puzzleRunner`
throws so a caller decides; the save layer's caller (a hook, on mount) has exactly one legal
response to a bad save, so the check function itself performs the discard rather than throwing.

**Schema version.** `SCHEMA_VERSION = 1` today; there is no prior version and therefore no
migration path yet. A future bump ships its own migration function alongside the field change
that requires it. A save whose `schemaVersion` doesn't match and has no registered migration is
invalid under the same contract above -- clear and start fresh. Never guess a migration.

---

## 3. State machine

Two levels: the app-level view (`LearnApp.tsx`) and the lesson-flow state inside a mounted
`LessonPlayer` (`useLessonPlayer.ts`). L1 does not change the shape of either -- it changes what
triggers a write and what seeds the initial state on mount.

### App level

| State | Meaning |
|---|---|
| `UNIT_LIST` | `LearnApp`'s `view === null`. Browsing units. |
| `IN_LESSON` | `view !== null`. A `LessonPlayer` is mounted for one unit. |

- `UNIT_LIST -> IN_LESSON`: clicking a unit button (starts at exercise 0), OR a `?exercise=`
  deep link on load (starts at that exercise's index), OR resuming a save on first mount
  (starts at the saved position -- see section 4). **Precedence when more than one applies:** an
  explicit `?exercise=` URL param always wins over a saved resume position. Deep links are used
  by e2e tests and for sharing a specific exercise; a saved position must not silently override
  an explicit link.
- `IN_LESSON -> UNIT_LIST`: `onExit()`, available from every lesson-flow state below, including
  mid-exercise. Exiting mid-exercise (before reaching a feedback state) records nothing --
  see the "no attempt" rule below.

### Lesson-flow level (inside `IN_LESSON`)

| State | Corresponds to | Attempt-completing? |
|---|---|---|
| `EXERCISE_ACTIVE` | `feedback === null` | No |
| `FEEDBACK_REJECTED` | `feedback.result === 'rejected'` | **No** |
| `FEEDBACK_SUCCESS` | `feedback.result === 'success'` | Yes |
| `FEEDBACK_FAIL` | `feedback.result === 'fail'` | Yes |
| `UNIT_COMPLETE` | `done === true` (`index >= total`) | -- |

Legal transitions:

1. `EXERCISE_ACTIVE -> EXERCISE_ACTIVE` (self-loop, via `FEEDBACK_REJECTED`): an invalid move
   (`tryAction`/`resolveAttack` returns `ok: false`) sets `feedback.result = 'rejected'` and
   nothing else changes. The player keeps acting on the same puzzle state. **This is the ghost-
   state trap named in the L1 exit criteria: a rejected tap is not an attempt.** Writing a save
   record on every `FEEDBACK_REJECTED` would inflate `attempts` by one per wrong click instead of
   once per real try. The write path only fires on arrival at `FEEDBACK_SUCCESS` or
   `FEEDBACK_FAIL`, never on `FEEDBACK_REJECTED`.
2. `EXERCISE_ACTIVE -> FEEDBACK_SUCCESS`: the goal is met (tap sequence, or a lethal attack, or a
   matching multiSelect answer). Writes one `ExerciseRecord` update: `attempts += 1`,
   `firstTrySuccess` set if this is the exercise's first-ever completed attempt,
   `lastCompletedAt = now`. `hintUsed` is `true` here iff `hintShown` was ever `true` at any point
   before this success.
3. `EXERCISE_ACTIVE -> FEEDBACK_FAIL`: a submitted attempt misses the goal (non-lethal attack,
   wrong multiSelect check). Writes `attempts += 1` and, if this is the first completed attempt,
   `firstTrySuccess = false`. No `lastCompletedAt` change (it only ever moves forward on success).
4. `FEEDBACK_FAIL -> EXERCISE_ACTIVE` (via `retry()`): reloads the same exercise id, fresh puzzle
   state. **This is the other half of the ghost-state trap.** `retry()` must not re-fire the
   write from transition 3 -- the write happens once, at the moment `FEEDBACK_FAIL` is entered,
   not again when leaving it. A React-state implementation must write on the transition
   (in the setter that produces the fail feedback), not in an effect keyed on `feedback` that
   could re-run on unrelated re-renders.
5. `FEEDBACK_SUCCESS -> EXERCISE_ACTIVE` (via `next()`, `index + 1 < total`): loads the next
   exercise in the unit. Also updates the app-level resume position (section 4).
6. `FEEDBACK_SUCCESS -> UNIT_COMPLETE` (via `next()`, `index + 1 >= total`).
7. `UNIT_COMPLETE -> UNIT_LIST` (`onExit()`), or `EXERCISE_ACTIVE`/`FEEDBACK_SUCCESS`/
   `FEEDBACK_FAIL -> UNIT_LIST` (`onExit()` at any point).

**Illegal transitions, named explicitly:**

- `FEEDBACK_FAIL -> FEEDBACK_SUCCESS` directly. There is no "mark it passed anyway" shortcut; a
  failed attempt must return to `EXERCISE_ACTIVE` via `retry()` and earn a fresh success.
- `FEEDBACK_FAIL -> UNIT_COMPLETE` directly. A unit cannot be finished past a failed, un-retried
  exercise.
- `EXERCISE_ACTIVE -> UNIT_COMPLETE` directly. `next()` is only reachable from
  `FEEDBACK_SUCCESS` in the current UI wiring (`FeedbackPanel` only renders the Continue button
  on `'success'`); this spec keeps that invariant rather than adding a skip path.
- `UNIT_LIST -> FEEDBACK_SUCCESS` / `FEEDBACK_FAIL` / `UNIT_COMPLETE` directly. Entering a unit
  always lands on `EXERCISE_ACTIVE` (or the deep-linked/resumed exercise's own `EXERCISE_ACTIVE`),
  never on a feedback state.
- `FEEDBACK_REJECTED` persisting across a save/resume boundary. It is not a state that survives
  navigation or reload -- it is always transient and is never written to the save. A refresh
  during `FEEDBACK_REJECTED` resumes at `EXERCISE_ACTIVE` for that exercise (fresh puzzle state),
  not at "still rejected."
- `UNIT_COMPLETE -> EXERCISE_ACTIVE` without going through `UNIT_LIST` first. There is no
  "replay this unit in place" action in this spec; re-entering a completed unit from the unit
  list starts it at exercise 0 again (completion records are additive per exercise, not
  unit-gated, so replaying a unit only adds more `attempts`/updates `lastCompletedAt`, it never
  errors).

---

## 4. First-load behavior

**No save present (first-ever visitor).** `onboarding.completed` is absent/false. The onboarding
survey (section 5) is shown once, before the unit list is usable. Declining is not an option --
the survey is three quick-tap questions, not a form; there is no meaningful "skip" state distinct
from picking an answer, since every answer including "never played" is valid input. After the
survey, `onboarding = { completed: true, startingTier }` is written and the user lands on
`UNIT_LIST`.

**Save present.** On mount, `LearnApp` resumes the app-level position it last held: if the user
was `IN_LESSON`, the resumed `LessonPlayer` starts at `EXERCISE_ACTIVE` for the first
not-yet-`firstTrySuccess`-completed exercise in that unit's `exercises` array walked in order,
falling back to `UNIT_COMPLETE` if every exercise in the unit already has a success record. This
is "resume at the correct exercise," not "resume mid-puzzle-click" -- the puzzle state itself
(`buildPuzzleState`) is always rebuilt fresh for that exercise; there was never a mechanism to
resume a half-tapped board, and this spec does not add one.

**What happens to the current `useState` progress in `useLessonPlayer.ts`.** Nothing needs
migrating, because there is nothing durable to migrate: today, a refresh already wipes `index`,
`state`, `selectedAttackers`, `selectedOptions`, `feedback`, and `hintShown` unconditionally --
none of it has ever survived a reload. L1 does not change that for the *in-flight* UI state
(tapped lands, current selection, current feedback); those remain plain `useState`, reset on
every mount, exactly as today. What changes is that the *durable facts* (which exercises have a
completed attempt, and the unit-level position derived from them) now come from `localStorage` on
mount instead of always starting at `startIndex`. In short: in-flight progress is **discarded**
(as it always was); only completion records go forward.

---

## 5. Onboarding survey

Three questions, each single-select:

1. **"Have you played Magic: The Gathering before?"** -- Never / A few games / Regularly.
2. **"Have you played in an organized event (store tournament, prerelease)?"** -- Yes / No.
3. **"Are you studying for a judge certification?"** -- Yes / No.

**Mapping to `startingTier`:**
- Q3 = Yes overrides everything else: `startingTier = 3` (the highest tier with gradable content
  today -- Tiers 4 and 5 are content-graded question banks that don't exist until L7, so a judge
  candidate is placed at the top of what currently exists, not literally at Tier 4/5).
- Otherwise, Q1 = Never -> `startingTier = 1`. Q1 = A few games -> `startingTier = 1`. Q1 =
  Regularly -> `startingTier = 2`, bumped to `3` if Q2 = Yes.

Only `startingTier` is written to the save (decision 7). The three raw answers are used once, at
submit time, to compute it, and then discarded -- they are never part of `LearnSaveV1`.
**Accepted cost, stated plainly:** if this mapping changes later, existing users cannot be
recomputed onto the new mapping, because their raw answers no longer exist anywhere. This is
acceptable because `startingTier` only sets a default starting point, never a gate, and the
override below is free.

**Override.** A "Not right? Pick a different starting point" control is always available (right
after submitting the survey, and later from wherever unit selection lives) and calls a plain
`setStartingTier(tier)` write -- no re-survey, no confirmation, no cost. Since only Tier 1 content
exists as of this spec (L2b), the practical effect of `startingTier` today is limited to which
unit the app suggests first; it becomes load-bearing once L2's tier-tagged curriculum tree lands.
Storing it now is cheap and avoids re-surveying every existing user later (per the roadmap's L1
framing: "Cheap now, impossible retroactively" -- the same reasoning decision 5 uses for the
daily-activity log).

**Out of scope.** The placement test (a short fixed diagnostic per tier boundary) is milestone
L8. This survey never grades anything; it only sets a starting point.

---

## 6. Mobile and desktop

**Nothing in this spec behaves differently between viewports.** `src/learn/ui/learn.css` has zero
`@media` queries and nothing under `src/learn/` reads `useIsMobile`, `matchMedia`, or
`window.innerWidth` (confirmed by search as part of this spec's research, and consistent with
`docs/LEARN_MODE_ROADMAP.md` L9's own note that Learn Mode is "one design stretched across both
viewports rather than two intentional ones"). `localStorage` behaves identically on both. The
onboarding survey and a reset-progress control use the same single responsive layout as the rest
of Learn Mode -- 44px touch targets, flex-wrap, no viewport-conditional code path. There is no
mobile-specific persistence behavior to specify, because there is no mobile-specific behavior of
any kind in `src/learn/` today.

---

## 7. Storage mechanism and its limits

**`localStorage`**, per decision 1. Progress records are kilobytes even at hundreds of exercises
(each `ExerciseRecord` is four small fields); IndexedDB would be solving a problem this data
doesn't have. Art caching is L9's service-worker concern, not this layer's.

**Key: `learn:progress`** (decision 2, explicit `learn:` prefix). Shandalar's existing keys,
confirmed by reading `src/hooks/usePersistence.ts` and `src/hooks/useOverworldController.js`:
`shandalar:duel` (mid-duel crash recovery) and `shandalar_unlockables` (mage artifact ownership).
Neither collides with the `learn:` prefix; a repo-wide search for `learn:` inside `src/` before
this spec turned up nothing, confirming the namespace is currently unused.

**Unavailable or full.** Every read/write wrapped in `try/catch`, exactly like Shandalar's
existing saves. A `setItem` failure (quota exceeded, private browsing with storage disabled) is
silently swallowed -- the app continues without persistence rather than breaking the lesson.
A `getItem` failure or a thrown parse is treated as "no save," per section 2. There is no retry
and no user-facing error state for a storage failure; this mirrors `saveDuel`'s existing
`// quota exceeded or private browsing` comment exactly.

**Consequence for L9.** `localStorage` is not guaranteed to survive OS storage pressure the way
a PWA's persistent-storage grant can be; L9's offline/install story should request persistent
storage via the Storage API at that point, but that request is out of scope here -- this spec's
job is only to degrade gracefully (via section 2's contract) if the browser clears it, not to
prevent the clearing. `localStorage` also does not sync across devices (no account system, per
decision 9), which L9's messaging should state plainly rather than implying cross-device streaks.

---

## 8. Test plan

Vitest, `@module-tag learn`, alongside the existing `puzzleRunner.test.ts` /
`puzzleChecker.test.ts` / `units.test.ts` files, in a new `src/learn/__tests__/persistence.test.ts`:

- **Shape validation.** A well-formed `LearnSaveV1` round-trips through `save()`/`load()`
  unchanged. A blob missing any required top-level key is rejected by `isValidLearnSave` and
  `load()` returns "no save." A blob with a mismatched `schemaVersion` is rejected the same way.
  A raw JSON-parse failure (corrupted string in the key) is caught and treated as "no save"
  without throwing.
- **Key namespacing.** `save()` writes under `learn:progress` and never touches
  `shandalar:duel` or `shandalar_unlockables` (assert both keys are untouched after a Learn save).
- **Attempt recording, not ghost-inflated.** Simulate `EXERCISE_ACTIVE -> FEEDBACK_REJECTED
  (x N) -> FEEDBACK_SUCCESS`: asserts `attempts === 1`, `firstTrySuccess === true`. Simulate
  `EXERCISE_ACTIVE -> FEEDBACK_FAIL -> retry() -> FEEDBACK_SUCCESS`: asserts `attempts === 2`,
  `firstTrySuccess === false`. Simulate a hint shown before a first-try success: asserts
  `hintUsed === true` on that record while `firstTrySuccess` stays `true` (hint does not affect
  first-try scoring, per decision 6).
- **Stable ids survive renumbering.** Given two exercise objects with the same `stableId` but
  different `id` (simulating a post-renumber state), a save recorded under the old `id`'s exercise
  is still found via `stableId` after the objects' `id` fields change.
- **Resume position.** Given a save where unit `"1.1"`'s first N exercises (by `stableId`) have
  `firstTrySuccess` records and the rest do not, `LearnApp`'s resume logic picks the first
  exercise in that unit without a success record, not the deep-link default of index 0.
- **Reset.** `resetProgress()` clears `learn:progress` and a subsequent `load()` returns "no
  save" (i.e., the app's next mount behaves as a first-load visitor).
- **Daily activity.** Two successful completions on the same device-local date produce one
  `dailyActivity` entry with `exercisesCompleted === 2`. Completions straddling a date boundary
  (mock the clock) produce two separate date-keyed entries.
- **Onboarding mapping.** Each of the documented Q1/Q2/Q3 combinations in section 5 maps to the
  stated `startingTier`. Calling the override setter changes `startingTier` without touching
  `onboarding.completed` or requiring the survey again.

Playwright, `@learn-` prefix, both `chromium` and `mobile-chrome` projects (per section 6, no
viewport-specific assertions are expected to differ, but both run per the project's existing
`testMatch` convention), added to `tests/e2e/learn-slice.spec.ts` or a new
`tests/e2e/learn-persistence.spec.ts`:

- **First-load survey.** A fresh browser context (`storageState` cleared) visiting `/learn.html`
  sees the onboarding survey before the unit list is interactive; answering it lands on
  `UNIT_LIST` and a subsequent reload does not show the survey again.
- **Refresh mid-unit resumes at the right exercise.** Complete exercise 1 of a unit, refresh,
  assert the lesson player shows exercise 2, not exercise 1 -- this is the L1 exit criterion
  ("Refresh mid-unit and resume exactly") made concrete.
- **Reset progress.** Trigger the reset control, assert the next `/learn.html` visit shows the
  onboarding survey again (equivalent to a first-load visitor).
- **Regression: existing slice-1 flows unaffected.** `Learn-01` through `Learn-08` in
  `tests/e2e/learn-slice.spec.ts` continue to pass unmodified with persistence wired in --
  confirms a visitor who is mid-survey or has no save yet doesn't get a broken lesson player.

---

## 9. Open questions

None. Every design question in this spec was answered by one of the nine decided-in-advance
answers, by direct inspection of `usePersistence.ts`/`useOverworldController.js`, or by a plain
specification choice consistent with those nine (e.g., deep-link-over-resume precedence in
section 3, and the exact onboarding-to-tier mapping in section 5) -- none of which reopens or
conflicts with a settled answer.
