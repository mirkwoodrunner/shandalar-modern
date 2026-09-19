# Learn Mode

## 1. Purpose

Learn Mode is an unofficial, free fan project that teaches Magic: The Gathering basics
through short, interactive exercises graded by the real DuelCore engine. It ships as a
second Vite entry (`learn.html`) alongside Shandalar, sharing the engine but not the UI.

The disclaimer shown on every screen (`src/learn/content.ts`) is placeholder wording
pending the official Fan Content Policy template text.

## 2. Architecture and boundaries

```
learn.html                          Vite entry
src/learn/
  main.tsx                          mounts LearnApp into #learn-root
  content.ts                        DISCLAIMER constant
  persistence.ts                    save layer (learn:progress) -- see section 2a
  LearnApp.tsx                      unit list, survey gate, ?exercise= deep link
  engine/types.ts                   exercise data types (stableId, see section 4)
  engine/puzzleRunner.ts            the only file here that touches src/engine or src/data
  engine/scenarioMachine.ts         lesson lifecycle machine (section 8) -- imports nothing
  data/units.ts                     authored exercise content
  hooks/useLessonPlayer.ts          orchestration hook, wires attempt recording
  hooks/useLearnProgress.ts         React binding for persistence.ts (onboarding, reset)
  hooks/useScenarioMachine.ts       React binding for scenarioMachine.ts
  ui/ScenarioLesson.tsx             scenario-mode host: the ONLY file importing the duel UI
  ui/ScenarioChrome.tsx             lesson chrome contents, rendered via ScenarioOverlay
  ui/LessonPlayer.tsx
  ui/EngineExercise.tsx
  ui/MultiSelectExercise.tsx
  ui/LearnCard.tsx
  ui/FeedbackPanel.tsx
  ui/OnboardingSurvey.tsx
  ui/LearnFooter.tsx
  ui/learn.css
  __tests__/puzzleRunner.test.ts
  __tests__/units.test.ts
  __tests__/persistence.test.ts
tests/e2e/learn-slice.spec.ts
tests/e2e/learn-persistence.spec.ts
tests/e2e/learn-scenario.spec.ts
```

Boundaries, mirroring the engine table in `CLAUDE.md`:

- `engine/puzzleRunner.ts` is the only file in `src/learn/` that imports from `src/engine/`
  or `src/data/`. It never mutates GameState directly -- every change goes through
  `duelReducer`.
- `hooks/useLessonPlayer.ts` holds React state and calls runner functions. No rules logic.
  Attempt writes (`recordAttemptAndPersist`) fire directly in its event handlers
  (`tapCard`/`attack`/`checkMultiSelect`), never inside a `setState` updater callback --
  `React.StrictMode` (`main.tsx`) double-invokes those in development, which would double-count
  `attempts`. See `docs/LEARN_L1_SPEC.md` section 3, correction C1.
- `persistence.ts` is the save layer: pure load/save/clear functions plus pure record-update
  functions (`recordAttempt`, `completeOnboarding`, `overrideStartingTier`,
  `deriveResumeIndex`), all operating on a `LearnSaveV1` value. It owns the `learn:progress`
  `localStorage` key and never reads or writes a `shandalar:` key. `hooks/useLearnProgress.ts`
  is its React binding, used by `LearnApp.tsx` for the onboarding gate and reset control.
- `ui/*` is presentation only. Components call hook callbacks.
- No `Math.random()` anywhere in `src/learn/`. Card iids are deterministic:
  `<side>-<zone>-<index>` (for example `p-bf-0`, `p-hand-2`, `o-bf-0`). A land keeps its
  hand iid after `PLAY_LAND`.
- `ui/ScenarioLesson.tsx` is the single point where Learn Mode reaches into the duel UI,
  and the exact import list it is allowed is in `CLAUDE.md` under "Learn Mode <-> duel UI
  boundary". The dependency runs one way: no duel screen, duel UI component or hook may
  import from `src/learn/`.

## 3. Grading model

Engine exercises replay player steps through `duelReducer` via `tryAction`. Combat
exercises are graded against every legal block assignment (best defense) instead of
`AI.js` -- `AI.js` is never imported by Learn Mode. `resolveAttack` enumerates every
combination of legal blocks the opponent could make, and an attack is only marked
`lethal` if the opponent dies under all of them. The fail message (`summary`) reports
the block that leaves the opponent at the highest life. The outcome cap is
`MAX_BLOCK_OUTCOMES = 5000`; boards that would exceed it throw `LEARN_TOO_MANY_OUTCOMES`.

## 3a. Puzzle checker

`src/learn/engine/puzzleChecker.ts` is the automated content-quality gate for every
exercise, run via `npm run learn:check` (readable authoring report) or the
`puzzleChecker.test.ts` Vitest suite (CI gate). It is pure -- no I/O -- and imports
only from `./types` and `./puzzleRunner`, so there is exactly one seam between Learn
Mode and the engine. It answers five questions about each exercise before it ships:

| Check | Question | Duolingo failure it targets |
|---|---|---|
| solvable | Does any legal line reach the goal? | unsolvable puzzle |
| complete | Are all winning lines listed in `solutions`? | branching variations |
| discriminating | Does at least one legal line lose, or one move get rejected? | puzzle that tests nothing |
| theme | Does the tagged skill actually decide the outcome? | theme not present |
| enumerate | Does the search terminate within its caps? | authoring blowup |

**How each check works.**

- **enumerate.** Combat exercises enumerate every non-empty subset of legally
  attackable creatures and grade each through `resolveAttack`, which already tries
  every legal block. Main-phase exercises run a breadth-first search over tap,
  land-drop, and cast actions, deduplicated on a state key of tapped permanents, mana
  pool, and lands played. Caps: `MAX_SEARCH_DEPTH = 6`, `MAX_SEARCH_NODES = 20000`,
  `MAX_ENUM_ATTACKERS = 8`. Exceeding a cap throws, which the checker reports as an
  `enumerate` error rather than hanging.
- **discriminating.** Two signals, because dead ends alone are not enough. In a mana
  puzzle you can almost always tap one more land, so nothing is ever truly stuck. What
  makes those puzzles teach something is the move the UI lets you attempt and the
  runner rejects: casting before you have paid, a second land drop.
  `countRejectableMoves` counts those, excluding `NOT_IN_LESSON` rejections, which are
  lesson scoping rather than a rules mistake. An exercise passes when at least one
  legal line loses or at least one move is rejected. A main-phase exercise where every
  legal line wins is a guided first step, not a broken puzzle -- data marks those with
  `guided: true`, which drops the finding to a warning instead of an error.
- **complete.** For combat, every winning attacker set must appear in `solutions`,
  compared as a set so attacker order does not matter. This is the direct fix for
  branching variations: an explanation that names one answer when two exist is caught
  here. For main phase, listed solutions are compared as multisets of action plus iid,
  since tap order commutes, and a shorter win than any listed solution produces a
  warning.
- **theme.** One entry per skill tag in `THEME_CHECKS` (engine) or
  `MULTI_THEME_CHECKS` (multiSelect). A skill with no entry is an error, so new
  content cannot ship a tag whose theme nothing verifies. Current entries: `tap-for-mana`
  (every winning line only taps lands), `cast-creature` (every winning line casts a
  spell), `colored-vs-generic` (some land subset has enough total mana but still
  cannot pay the colors), `land-per-turn` (no winning line skips the land drop),
  `lethal-evasion` (every winning set includes an attacker no defender can block),
  `lethal-outnumber` (every winning set sends more attackers than they have untapped
  blockers), `summoning-sickness` (removing the sickness opens a new winning set, so
  the sickness is load-bearing), `read-costs` (excluded options include one that fails
  on color and one that fails on total mana).

**Known limitation.** Theme checks are hand-written per skill tag. Every new skill
needs its own check written alongside it, in the same prompt that introduces the tag
(see `CLAUDE.md` -- Learn Mode). The checker enforces that a check exists, not that it
is a good check.

**Verified current-content output** (`npm run learn:check`), reproduced exactly as of
Slice 3a:

```
1.1  Lands and mana
  [warn] 1.1-01   tap-for-mana         1/1 lines win
         warn: discriminating -- no legal line loses and no move is rejected, so the exercise tests nothing
  [ ok ] 1.1-02   cast-creature        1/1 lines win
  [ ok ] 1.1-03   colored-vs-generic   3/3 lines win
  [ ok ] 1.1-04   read-costs           multiSelect
  [ ok ] 1.1-05   land-per-turn        2/2 lines win
  [ ok ] 1.1-06   colored-vs-generic   3/3 lines win
  [ ok ] 1.1-07   land-per-turn        2/2 lines win
  [ ok ] 1.1-08   read-costs           multiSelect

1.4  Winning this turn
  [ ok ] 1.4-01   lethal-evasion       2/3 lines win
  [ ok ] 1.4-02   lethal-outnumber     1/7 lines win
  [ ok ] 1.4-03   lethal-outnumber     1/7 lines win
  [ ok ] 1.4-04   summoning-sickness   1/3 lines win

0 error(s), 1 warning(s).
```

## 4. Exercise schema and iid scheme

See `src/learn/engine/types.ts` for the full type definitions. In summary:

- `PuzzleSetup` describes the starting phase and each side's life/hand/battlefield.
- `EngineExercise` puzzles are graded by replaying `Step[]` sequences (`TAP_LAND`,
  `PLAY_LAND`, `CAST_SPELL`, `UNDO_MANA_TAPS`, `ATTACK`) against a `Goal`
  (`MANA_IN_POOL`, `CARD_ON_BATTLEFIELD`, `OPPONENT_DEAD_THIS_TURN`).
- `MultiSelectExercise` puzzles ask the player to pick every castable option from a
  fixed set of untapped lands; the answer is derived from the engine's own `canPay`,
  not authored by hand.
- Card iids are deterministic per side and zone: `p-bf-0`, `p-hand-1`, `o-bf-2`, etc.,
  assigned in setup order by `buildPuzzleState`.
- Every exercise also carries a `stableId`, required (not optional) on `ExerciseBase`. It is the
  save layer's permanent key into `LearnSaveV1.exercises` (see `docs/LEARN_L1_SPEC.md` section 1)
  and is set once at authoring time to that exercise's `id` at the moment it ships, then frozen.
  `id` may be renumbered later (L2); `stableId` never is.

## 5. Content rules (enforced by `units.test.ts`)

- Every listed `solutions` line replays to the goal.
- Every `wrongLines` entry fails for the stated reason (`rejected` or `notLethal`, with
  the expected reason substring).
- `multiSelect` answers are cross-checked against the engine's own `canPay`, not trusted
  as authored data.
- Prompt/hint/explanation text only names cards actually present in that exercise.
- No exercise uses a card with TRAMPLE, BANDING, FIRST_STRIKE, DOUBLE_STRIKE, or
  DEATHTOUCH (see Known engine gaps below).

## 6. Known engine gaps that block content

- Attacker damage among multiple blockers auto-assigns lethal damage in list order
  instead of letting the attacker's controller divide it freely (current rules require
  free assignment order).
- Deathtouch is not treated as 1 lethal damage during trample/multi-block damage
  assignment.
- Units 3.4 and 3.5 (trample and deathtouch lessons) are blocked until a ruleset-gated
  engine fix lands for both of the above.
- The card pool currently used by Learn Mode has no deathtouch, lifelink, or menace
  cards available as a workaround.
- ~~**LC-1**~~ and ~~**LC-2**~~ are **resolved** (2026-09-18), both inside `src/learn/` with
  no engine change. LC-1's original diagnosis was wrong: player targeting always worked, and
  the probe that "found" the defect returned on its first accepted result without ever testing
  `tgt: 'o'`. The real defect was that `tryAction` did no target validation, so a targeted
  spell cast with no target resolved as a silent no-op; it now rejects with `MSG.needsTarget`.
  LC-2 was real: `TAP_LAND` now takes an optional `color`, validated against the land's
  `produces`. Burn-for-lethal and dual-land content are both authorable, and the "basic lands
  only, no player-targeted spells" constraint is lifted. Full write-up in
  `docs/LEARN_CURRICULUM.md` section 7.

## 7. Slice history

This section records what shipped. Forward planning lives in
`docs/LEARN_MODE_ROADMAP.md` -- tiers, milestones, fan content posture, and open
decisions. Do not duplicate roadmap content here.

- **Slice 1** (done): puzzle runner, lesson player, 9 exercises across Unit 1.1
  (lands and mana) and Unit 3.1 (lethal this turn, renumbered to Unit 1.4 in L2).
- **Slice 2** (done): puzzle checker (`src/learn/engine/puzzleChecker.ts`,
  `npm run learn:check`) for authoring new content outside the test suite. See
  section 3a above.
- **Slice 3a** (done): remaining Unit 1.1 content -- `1.1-06` through `1.1-08`,
  all reusing existing skill tags.
- **L1** (done): persistence, profile, and onboarding survey. `src/learn/persistence.ts` (save
  layer, `learn:progress` key), `hooks/useLearnProgress.ts`, `ui/OnboardingSurvey.tsx`, `stableId`
  on every exercise. Four corrections (C1-C4) applied during implementation; see
  `docs/LEARN_L1_SPEC.md`. Vitest: 57 -> 90. Playwright: `learn-slice.spec.ts` unchanged at 16
  passing, plus a new `learn-persistence.spec.ts` at 10 passing (5 cases x chromium +
  mobile-chrome).

- **L2** (done): curriculum spine. `docs/LEARN_CURRICULUM.md` is now the skill tree and
  the authority on content. Tier 1 specified at 16 skills / 48 exercises across 4 units,
  every skill verified green against the runner. Tiers 2 to 5 named and substrate-tagged.
  Unit 3.1 renumbered to Unit 1.4 ("Winning this turn"); `id` changed, `stableId` did not,
  so saved progress is unaffected. Runner defects LC-1 and LC-2 logged in section 6 above.
  Baseline unchanged: 90 Vitest, 26 Playwright, `learn:check` at 0 errors / 1 warning.

- **L2b, Unit 1.2** (done): 12 new exercises, `1.2-01` through `1.2-12`, completing
  "Casting spells". Three new skill tags with matching `THEME_CHECKS` written in the same
  prompt: `cast-noncreature` (the goal permanent must not be a creature),
  `pay-exact-mana` (every winning line taps every land), `choose-what-to-cast` (some other
  card in hand must be affordable, or there was no choice). A fourth drafted tag,
  `cast-sequencing`, was dropped for overlapping `land-per-turn` -- overlapping tags split
  one skill's evidence across two mastery scores in L8. Vitest `@learn`: 90 -> 114.
  Playwright unchanged at 26. `learn:check` still 0 errors / 1 warning.
  Tier 1 is now 24 of 48 exercises.

- **L2b, Unit 1.3** (done): 9 exercises, `1.3-01` through `1.3-09`, completing "Who can
  attack". Two new skill tags with matching `THEME_CHECKS`: `defender-cant-attack` and
  `tapped-cant-attack`. Both are enforced with a no-slack rule -- a creature barred for the
  right reason, plus every winning attacker set using every legal attacker -- because a Wall
  cannot be un-walled the way `summoning-sickness` un-sicks a creature. `1.4-04` moved here
  as `1.3-01` (`stableId` `3.1-04` unchanged); Unit 1.4 is now 3 exercises.
  Also fixed a false positive in the `units.test.ts` phantom-card check: a card name that is
  a whole-word substring of a longer name (Savannah inside Savannah Lions, Island inside
  Volcanic Island) was flagged as a phantom every time the longer card was legitimately
  named. Present card names are now blanked out longest-first before scanning. Verified the
  check still catches a real phantom. Vitest `@learn`: 114 -> 130. Playwright unchanged at 26.
  Tier 1 is now 32 of 45 exercises.

- **L2b** (done): Tier 1 content complete at 45 exercises across 4 units. Unit 1.4 filled to
  12 with `lethal-tapped-defender` and `lethal-flying-defender`; Unit 1.1 filled to 12 with no
  new tags. Seven new skill tags landed across the milestone, each with its `THEME_CHECKS`
  entry in the prompt that introduced it. `lethal-flying-defender`'s check reads blockability
  out of `resolveAttack`'s outcome count -- each defender that can block a lone attacker
  doubles the enumerated assignments, so `log2(outcomes)` is how many can block it -- rather
  than parsing card text for keywords. New Playwright case Learn-09 walks every Tier 1 unit
  from the unit list, which is L2b's "a first-time player can complete Tier 1 end to end"
  exit criterion. `tap-for-mana` stays at one exercise: with only `TAP_LAND` allowed and an
  empty hand, no line loses and no move is rejected, so a second one would add a second
  standing warning and no teaching. Vitest `@learn`: 130 -> 155. Playwright: 26 -> 28.

- **L2c** (done): fan content notice and release framing. `src/learn/content.ts` carries the
  Fan Content Policy's standard notice in place of the placeholder, plus three framing strings
  rendered on the unit list: a tutorial tagline that says explicitly this is not a place to
  play games, an early-and-incomplete statement naming Tier 1 as all that exists, and a
  free-with-no-ads line. Playwright `Learn-10` asserts all four at both viewports.
  Asset audit came back clean: nothing under `src/learn/` references any image, background, or
  icon, so there is no Wizards logo, set symbol, or lifted mana symbol art to remove. Mana
  renders as the plain cost string. `src/learn/` imports neither `scryfallArt.js` nor
  `useCardArt.js`. Playwright: 28 -> 30.
  The notice string could not be verified against the live Fan Content Policy page (the build
  environment blocks egress to `company.wizards.com`). Chris's call, 2026-09-18: this is a fan
  project with no intent to publish or monetise, so policy exactness is not a gate. Revisit if
  that changes.

- **L3** (done, 2026-09-18): duel UI scenario mode. See section 8 below for the built-state
  spec. Vitest `@learn`: 160 -> 177. Playwright `@learn`: 30 -> 55.

Next work is sequenced by `docs/LEARN_MODE_ROADMAP.md` section 5, now past milestone L3
(duel UI scenario mode). Tier 1 is content-complete and release-framed; publishing is a
decision, not a milestone. The post-release reassessment gate in L2c decides whether Tier 2 or
Tiers 4 and 5 come next, using completion data rather than argument.. The previously-listed "Slice 4: checkpoint duel" is
now milestone L10 there, deliberately resequenced behind the duel-UI scenario mode it
depends on.


## 8. Scenario mode (L3): the built-state spec

Scenario mode renders an engine exercise on the real duel screen instead of the bespoke
Learn board. It is additive: the existing lesson player (`ui/LessonPlayer.tsx`,
`hooks/useLessonPlayer.ts`) is untouched and remains the path every shipped Tier 1 exercise
takes. Nothing in `data/units.ts` changed for L3.

### How a built state reaches the screen

```
buildPuzzleState(ex.setup)        -> a real GameState (unchanged, section 3)
  |
useScenarioMachine               -> holds it as `seed` on the lifecycle machine
  |
ScenarioLesson                   -> DuelConfig { scenario: true, initialState: seed,
  |                                              allowedActions: ex.allowed }
DuelScreen / DuelScreenMobile    -> useDuelController -> useDuel(..., prebuiltState)
  |
useDuel                          -> SHORT-CIRCUITS buildDuelState; seeds the reducer
  |
duelReducer (DuelCore)           -> sole authority from the first dispatch onward
```

`useDuel` must not call `buildDuelState` when a state is supplied: a scenario state has an
empty library and the deck handling must never run against it. The contract is
`docs/ENGINE_CONTRACT_SPEC.md` S6.3.

### Entry point

`learn.html?scenario=<exercise id>`, e.g. `/learn.html?scenario=1.1-02`. Engine exercises
only -- a `multiSelect` exercise has no GameState to render and the route ignores it.
Checked before the onboarding survey gate, like `?exercise=`, so e2e specs and shared links
both work.

### The lifecycle machine

`engine/scenarioMachine.ts` is a pure reducer over one discriminated union. It imports
nothing at all, so it is testable without React, a DOM, or a GameState.

```
scenarioLoad --SCENARIO_READY--------> playerActing --CHECK_REQUESTED--> evaluating
     |                                     |  ^                              |
     |                                     |  | PLAYER_ACTED                 | EVALUATED
     |                                     |  | PLAYER_ACTION_REJECTED       v
     |                                     |  | HINT_REVEALED             feedback
     | SCENARIO_LOAD_FAILED                |                                  |
     v                                     +------ RETRY_REQUESTED -----------+
  feedback (outcome: error)                            (back to scenarioLoad, attempt + 1)

  EXIT_REQUESTED from any live phase -> exited (terminal)
```

Rules the machine exists to enforce:

- **One union.** The learner's phase is the only thing that says where they are. There is no
  `isChecking` flag and no `feedback === null` inference to disagree with it.
- **Every transition named.** `TRANSITIONS` is the complete table. A (phase, event) pair
  absent from it returns the same state object -- a check cannot be requested from feedback,
  the board cannot be acted on while evaluating, and a board already in play cannot be
  re-seeded. `scenarioMachine.test.ts` asserts every refused pair by identity.
- **The machine never holds the live GameState.** It holds `seed`: the state the screen was
  mounted with, which does not change during an attempt. DuelCore owns the live state and the
  chrome reads it through the `scenarioPanel` render prop, so there is exactly one answer to
  "what is on the board."
- **Reset is remount.** `RETRY_REQUESTED` increments `attempt`, which changes
  `scenarioMountKey`, which is the duel screen's React `key`. The whole reducer is rebuilt
  from a fresh seed. Nothing is un-done by hand.

### Action restriction

`allowedActions` is the exercise's `allowed` list. The gate lives in
`useDuelController.ts` and nowhere else: it wraps the player-facing dispatchers and exposes
`isActionAllowed(kind)` for the screens to render against. Restriction is about what the UI
**offers** -- DuelCore still decides legality and every outcome.

Also suppressed in scenario mode, all in the controller: the AI main loop, the AI
priority-window responder and the AI stall watchdog (opt back in with `SCENARIO_AI_ACTION`,
`'AI_TURN'`, in `allowedActions`); the mulligan modal, since a seeded hand was never drawn;
and the game-over auto-exit, since reaching `s.over` is the success condition of a
lethal-attack lesson, not a reason to leave the screen.

A scenario that opts the AI back in must also list `ADVANCE_PHASE`, because the AI loop's
own phase step goes through the same gated `requestPhaseAdvance`.

### Chrome suppression

Suppressed when `config.scenario` is true: the ante banner (both viewports), the castle
modifier banner, the desktop right sidebar (ruleset flags, exile counts, sandbox debug,
duel log), and the campaign identity row in both Topbars (wordmark, ruleset name, turn
pill, Forfeit, log and menu buttons). The PhaseBar stays -- it is teaching material.

The campaign save layer is never written (`usePersistence(s, !scenario)`) and `clearDuel()`
is never called, so a learner with a duel in progress does not lose it. This is the same
rule as `learn:` vs `shandalar:` key separation, applied to the duel save.

### Best-defense grading (L3b, 2026-09-19)

Scenario mode originally graded with `checkGoal` alone, a snapshot test against the live
state. That covers `MANA_IN_POOL` and `CARD_ON_BATTLEFIELD` end to end -- Units 1.1 and 1.2
have worked on the duel screen since L3 -- but it cannot grade a lethal attack.

The diagnosis in the original limitation note was half right. It warned that a snapshot check
"would grade a losing attack as a win whenever the opponent happened not to block." The
actual behaviour was the opposite and worse: with `allowed: ['DECLARE_ATTACKER']` and the AI
suppressed, a scenario board **never advances past `COMBAT_ATTACKERS` at all**, so
`checkGoal` read `false` for a winning attack and a losing one alike. Unit 1.4 was not
mis-gradeable; it was ungradeable.

What landed:

- `gradeBestDefense` is the single implementation of every-legal-block analysis, split out of
  `resolveAttack` so both entry points share it.
- `declareAttackers` is `resolveAttack`'s first half, exported so there is one definition of
  "a board with these attackers declared".
- `gradeDeclaredAttack(liveState)` is the scenario-mode entry point. It reads `s.attackers`
  back off the live board -- the learner declared them on the real duel screen, so there is no
  attacker list to hand over -- walks to `COMBAT_BLOCKERS`, and asks the same question
  `resolveAttack` asks. It returns `null` when the board is not in a gradeable shape (no
  attackers declared, or past the blocker step), which `ScenarioChrome` reports as a prompt
  rather than a failure.
- **The analysis runs on a `structuredClone` of the live state, not the live state.**
  `duelReducer` is expected to return new state rather than mutate, and `resolveAttack` has
  always relied on that -- but there it walks a throwaway state, whereas here a stray mutation
  would corrupt a lesson in progress. `puzzleRunner.test.ts` asserts the live board is
  byte-identical after grading.

`ScenarioChrome` routes `OPPONENT_DEAD_THIS_TURN` to `gradeDeclaredAttack` and everything else
to `checkGoal`. A non-lethal attack now reports the defender's best block as its feedback
("Wall of Wood blocks Grizzly Bears. You deal 2. They're at 1."), which is the teaching.

### Known limitation: attacker clicks do not land on a scenario combat board

**Unit 1.4 still cannot move to scenario mode, for a UI reason rather than a grading one.**
The grading above is built and unit-covered; a learner cannot reach it.

On `?scenario=1.4-02`, at **both** viewports, `document.elementFromPoint` at a battlefield
card's centre returns `banner-you`, not the card. Every attempt to click a creature to declare
it as an attacker is intercepted, so no attackers are ever declared. Measured on desktop,
`banner-you` also sits at `left: 296, right: 1576` against a 1280px viewport -- offset and
overflowing, which the campaign duel screen does not do (`left: 0, right: 1070` in the
sandbox). Suppressing the desktop right sidebar looks like the trigger, but the mobile
viewport fails the same way, so a shared cause is more likely than two layout bugs.

`tests/e2e/learn-scenario.spec.ts` Learn-S14 and Learn-S15 are `test.fixme` for exactly this:
they assert the correct grading, they are expected to pass once the click lands, and they are
not deleted. Learn-S16 (checking with no attackers declared) passes at both viewports and is
what proves the grading path is wired to the chrome.

Fixing the click is its own prompt, and it is a duel-UI prompt, not a Learn Mode one.
