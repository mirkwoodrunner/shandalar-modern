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
  (Superseded at L4b: `LearnCard.tsx` now imports both. See section 9 below.)
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

### Attacker clicks on a scenario combat board (fixed 2026-09-24)

Unit 1.4 was blocked from scenario mode for a UI reason, not a grading one: a learner could
not declare an attacker on the real duel screen. There were two stacked causes. Both are fixed,
and Unit 1.4 can now move to scenario mode (its own prompt).

**Cause 1, the Learn shell offset.** `LearnApp.tsx` mounted the scenario branch inside
`.learn-app`, the same centered 720px column used by the unit list and the bespoke lesson
player (`max-width: 720px; margin: 0 auto; padding: 24px 16px 96px`). `DuelScreen`'s root is
`height: 100vh; width: 100vw`, sized to the viewport but positioned wherever that column put
it. At a 1280px viewport it opened at `left: 296, top: 24` and overflowed the viewport bottom
by 24px. Fix: the scenario branch renders in `.learn-scenario-root` (`src/learn/ui/learn.css`),
a full-bleed wrapper with no max-width, margin, or padding. The unit list and bespoke lesson
player still use `.learn-app`.

**Cause 2, the desktop duel board's height budget. This was a Shandalar bug, not a Learn one.**
The campaign duel had it too, and worse. Measured at 1280x800 before the fix:

| Row | Campaign sandbox | Scenario `1.4-02` |
|---|---|---|
| Opponent hand | 72 | 70 |
| Opponent banner | 88 | 88 |
| Battlefield (both halves + phase ribbon) | 272 | 300.7 |
| Player banner | 88 | 88 |
| Action bar | 52 | 51 |
| Player hand | 162 | 158 |
| Halves: opponent / ribbon / **player** | 194 / 40 / **38** | 198.4 / 40 / **62.3** |

A desktop creature card is 96x134px. In a 38px or 62px `overflow: hidden` half only its row
label (campaign) or top ~42px (scenario) showed, and a click at its centre hit `banner-you`.
In the campaign the player could not see their own creatures at all below a viewport height of
roughly 1000px.

Why the split was so lopsided: in `src/ui/Battlefield/Half.tsx` the opponent's half was
`flexShrink: 0` with visible overflow, so it could never go below its content height (a 58px
land row plus a 130px `minHeight` permanents area). The player's half was `flex: 1` with a zero
basis, so it got only what was left. Every pixel of squeeze came out of the player's half.

Fixing the split alone could not solve it. At 1280x800 the two halves and the ribbon need
about 455px with full-size cards, and the campaign battlefield had 272px. Land rows, labels,
padding and the ribbon use about 210px of that before a card is drawn. So the fix frees height
as well as sharing it:

- **Desktop banners moved to a left rail** (`src/DuelScreen.tsx`, `data-testid="banner-rail"`).
  Both life banners now sit in a column beside the board, opponent at the top and player at the
  bottom, instead of stacked in the center column. That returns 176px to the battlefield at
  every height. `Banner` takes `layout="rail"` for this and `LifeTotal` takes `fill`. The
  mobile-width `DuelScreen` path and `DuelScreenMobile` keep their banners in the column.
- **Both halves share the squeeze** (`Half.tsx`). Both halves now start from their content
  height and shrink in proportion to it when the battlefield is short. Only the player's half
  grows into spare height, as before, so a tall screen lays out the same as before.
- **The desktop lesson panel docks in the rail's empty middle**
  (`src/ui/duel/ScenarioOverlay.module.css`). It used to sit top-left over the opponent's
  banner. With the board moved right, that spot would have covered the opponent's first
  creature. The panel is now no wider than the rail and covers neither banner nor any card.
  As a side effect the opponent's life total is visible during a lesson again.

After the fix at 1280x800, the player's half is 215.9px (campaign) and 238.3px (scenario), and
the card is fully visible and clickable at its centre. Below that height (about 790px for the
campaign, about 770px for scenario mode) the player's creature row becomes a scroll area. The
card is partly visible and still clickable at its centre. At the default Playwright desktop
size, 1280x720, the card is 73% visible in the campaign and 81% in scenario mode.

**Mobile was never squeezed.** At 390x844, both scenario mode and the campaign's compact duel
screen showed the player's creature in full, and `elementFromPoint` at its centre was the card.
The failure there was the test itself. `declareAttacker` clicked at `{ x: 40, y: 110 }`, which
is 20px below the bottom edge of the 90px-tall mobile creature card, so it could never land at
that width. The helper now clicks the card's centre (Playwright's default), which is stricter,
and Learn-S14/S15 pass at both viewports. No mobile layout changed.

Regression locks: Learn-S17 in `tests/e2e/learn-scenario.spec.ts` (scenario `1.4-02`) and
`tests/e2e/duel-board-height.spec.ts` (campaign sandbox duel). Both check at 1280x800 and
390x844 that a player creature is fully inside every clipping ancestor and that
`elementFromPoint` at its centre is the card.

Neither `DuelScreen.tsx` nor `Half.tsx` is a protected file. An earlier version of this section
said they were. They are not on the Protected Files list in `CLAUDE.md` or in
`PROTECTED_PATTERNS` in `.claude/hooks/pre-edit-engine-guard.sh`. They are shared Shandalar duel
UI, so a change to them is a campaign change.

## 9. The Learn card pool (L4a)

`src/data/cardsLearn.js` exports `CARD_DB_LEARN` (27 cards) and `LEARN_POOL_META`. It is the
second pool `makeCardInstance` can resolve against, alongside `CARD_DB` and
`CARD_DB_PREMODERN`. Contract details live in `docs/ENGINE_CONTRACT_SPEC.md` section 18.

### Where it lives and how it is regenerated

| File | Role |
|---|---|
| `tools/generate-learn-pool.mjs` | The generator. Holds the curated card list. |
| `src/data/cardsLearn.js` | Generated output. **Never hand-edit it.** |
| `scryfall/oracle-cards-20260419090229.zip` | The pinned Scryfall bulk data, the only source. |

Regenerate with `node tools/generate-learn-pool.mjs`. The script never makes a network call:
it reads the pinned zip and fails loudly if that exact file is absent, naming what is present
instead. Refreshing the pin is a deliberate, separate decision and is not part of running the
generator. Output is idempotent apart from `LEARN_POOL_META.generatedAt`.

Selection is curated, not a legality filter -- the opposite of
`tools/generate-premodern-pool.mjs`, which takes every Premodern-legal card. The list is
derived from `docs/LEARN_CURRICULUM.md`'s Tier 1-3 skill tags, and each entry carries a
`skills` array recording the tags it was picked for. `skills` is selection provenance; DuelCore
never reads it.

### What the generator refuses to emit

All four gates fail the run with a non-zero exit and a printed diagnostic, rather than
emitting a card that would misbehave later:

- **Shape.** Every entry must carry the `REQUIRED_CARD_FIELDS` from `src/data/cardShape.js`.
  The authoritative assertion is `src/data/__tests__/cardShape.test.js`, which now covers
  `CARD_DB_LEARN` alongside the other two pools.
- **Effect keys.** Every curated `effect` and `activated.effect` must match a `case` in
  `src/engine/DuelCore.js`. This is a textual presence check, so it catches the real failure
  mode -- a key no case matches, which resolves as a silent no-op -- but it does not verify
  semantics.
- **Keywords.** Only `FLYING`, `REACH`, `DEFENDER`, `VIGILANCE`, `HASTE`, `LIFELINK` are
  permitted. Anything else on a card fails the run instead of being silently stripped, because
  a pool card whose printed abilities the engine drops is worse than no card. The policy-banned
  set from `src/learn/__tests__/units.test.ts` (`TRAMPLE`, `BANDING`, `FIRST_STRIKE`,
  `DOUBLE_STRIKE`, `DEATHTOUCH`) is therefore excluded from the pool itself, not just from
  exercises.
- **Encoding.** Any non-ASCII character in a name, type, cost, or text fails the run.

### Current Oracle templating is the point, not drift

`CARD_DB` carries Shandalar's classic-flavored wording. `CARD_DB_LEARN` carries current
Scryfall Oracle text, pulled fresh from the pinned data. A Plains reads
`({T}: Add {W}.)` here and `T: Add W.` in `CARD_DB`; that difference is deliberate and must not
be "reconciled". `docs/LEARN_MODE_ROADMAP.md` section 4.4 settles why: the canonical model is
paper Magic as currently templated, and the curriculum ends in paper documents.

Ids collide with `CARD_DB` ids by design (`plains`, `grizzly_bears`, `lightning_bolt` are in
both). The pools are separate arrays resolved separately, so collision costs nothing, and a
pool must be self-contained -- an exercise setting `pool: 'learn'` resolves *every* id there,
its lands included. That is why the five basics are in the list.

### The drift gate in `learn:check`

A frozen pool still drifts: Wizards issues errata and templating updates. `npm run learn:check`
now runs an oracle-drift check before the per-exercise loop:

1. **Version stamp.** `LEARN_POOL_META.scryfallBulkDataFile` must equal the generator's
   `PINNED_BULK_FILE`. If someone refreshes the pin without regenerating, this reports one
   error rather than 27 spurious drifts.
2. **Text comparison.** Every `CARD_DB_LEARN` entry's stored `text` is compared against
   `cleanText(oracle_text)` from the pinned bulk data. On mismatch it prints the card id and
   both strings, and the script exits 1.

Both halves reuse `generate-learn-pool.mjs`'s own loader and `cleanText`, so there is exactly
one definition of "what the pinned data says this card reads". The check is strictly local --
`learn:check` never makes a network call. It adds roughly six seconds to the run.

### Selecting the pool from an exercise

`PuzzleSetup.pool` is `'shandalar' | 'learn'`, optional, defaulting to `'shandalar'`.
`puzzleRunner.ts` resolves it through a local `POOLS` map before each of its four
`makeCardInstance` calls (`instance`, via `buildPuzzleState`, plus `poolFromLands`,
`castableWith`, and `cardInfo` -- the last three take an optional trailing pool argument, since
they are called with card ids rather than a setup). Omitting it is byte-identical to the
pre-L4a behaviour, which is why all 45 Tier 1 exercises are unchanged.

**No exercise sets `pool: 'learn'` yet.** L4a proves the pool exists, is shaped correctly, and
can be selected. Authoring content against it is Tier 2/3 work gated on L5 runner expansion.

### Card art (L4b)

`src/learn/ui/LearnCard.tsx` renders art via the shared `src/utils/useCardArt.js` /
`src/utils/scryfallArt.js` utility (the same one `src/ui/shared/Card.jsx` and
`src/ui/Card/CardArtImage.tsx` use for Shandalar's own card art), imported under the
narrow `CLAUDE.md` boundary-table grant added for exactly this file.

It calls `useCardArt(card.name, { sets: [] })`. `{ sets: [] }` skips
`CLASSIC_PRINTING_SETS` (`lea`/`leb`/`2ed`/`3ed`/`4ed`) and goes straight to Scryfall's
`cards/named?exact=` lookup -- the Learn pool (`docs/ENGINE_CONTRACT_SPEC.md` section 18)
carries current Oracle templating, and not every Learn card was printed in those five
classic sets, so a classic-set-first search would come back empty for some of them.

Fallback is `url ? <img> : nothing`, matching `Card.jsx`'s `CardArtDisplay` convention:
`useCardArt`'s own contract keeps `url` and `loading` correlated (`loading` is only ever
true while `url` is null), so that one condition already covers both "still loading" and
"resolved to no art" -- no separate loading branch needed. A failed or missing fetch
degrades permanently to the pre-L4b text-only card; there is no retry, and nothing else
on the card shifts or hides to make room for art either way. Artist credit
(`Art: {artist}`) renders only when Scryfall returns a non-null `artist`; it is omitted,
not blanked, otherwise.

**A known race, not something this milestone fixes.** `fetchOldestArt`'s in-flight
dedupe (`src/utils/scryfallArt.js`) lets a second concurrent call for the same cache key
return `{ url: null, artist: null }` immediately rather than waiting on the first call's
real result. React 18 StrictMode double-invokes effects in dev (`npm run dev`, which is
also what this Playwright suite runs against), so a single `useCardArt` call can race
itself: the first effect's real fetch is still in flight when StrictMode's synthetic
remount fires a second `fetchOldestArt` call, which hits the dedupe path and resolves to
null before the first call's genuine result comes back -- and by the time that genuine
result does arrive, the first effect's own closure has already been marked cancelled, so
its `setState` is dropped. The result is silently discarded, but not lost: the real
fetch's `writePersisted` call still runs and writes the correct entry to
`localStorage['art-cache:v1']` regardless of which effect instance is "cancelled" --
only the live React state misses it, and only in dev with StrictMode. `useCardArt`'s own
initializer (`peekCachedArt`) resolves synchronously from that same persisted cache on
mount, before any effect runs, so a page reload (or a returning visit) shows the art
correctly. `CardArtImage.tsx` already works around this for the duel screen with a
background poll of the shared cache; `LearnCard.tsx` does not add that, per this
milestone's own instruction to match `CardArtDisplay`'s plainer convention instead.
`tests/e2e/learn-card-art.spec.ts`'s success-path cases pre-seed the persisted cache
directly (`page.addInitScript`) rather than mocking a fulfilling network response, both
to sidestep the race deterministically and because it exercises the same synchronous
`peekCachedArt` path a real returning visitor hits.

Confirmed with the 27-card Learn pool: no card was checked individually against live
Scryfall for this milestone (the sandboxed test environment has no route to
scryfall.com; see `tests/e2e/raging-river.spec.ts`), but `cards/named?exact=` is the
same lookup `generate-learn-pool.mjs` already resolved every pool card against to build
`cardsLearn.js` in the first place, so a resolution failure here would be a live-fetch or
Scryfall-availability issue, not a missing card.

`src/learn/content.ts`'s existing Fan Content Policy notice ("Portions of the materials
used are property of Wizards of the Coast") already covers per-card art; artist credit
is additive and did not need a wording change.
