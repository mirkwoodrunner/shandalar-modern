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
  LearnApp.tsx                      unit list, ?exercise= deep link
  engine/types.ts                   exercise data types
  engine/puzzleRunner.ts            the only file here that touches src/engine or src/data
  data/units.ts                     authored exercise content
  hooks/useLessonPlayer.ts          orchestration hook
  ui/LessonPlayer.tsx
  ui/EngineExercise.tsx
  ui/MultiSelectExercise.tsx
  ui/LearnCard.tsx
  ui/FeedbackPanel.tsx
  ui/LearnFooter.tsx
  ui/learn.css
  __tests__/puzzleRunner.test.ts
  __tests__/units.test.ts
tests/e2e/learn-slice.spec.ts
```

Boundaries, mirroring the engine table in `CLAUDE.md`:

- `engine/puzzleRunner.ts` is the only file in `src/learn/` that imports from `src/engine/`
  or `src/data/`. It never mutates GameState directly -- every change goes through
  `duelReducer`.
- `hooks/useLessonPlayer.ts` holds React state and calls runner functions. No rules logic.
- `ui/*` is presentation only. Components call hook callbacks.
- No `Math.random()` anywhere in `src/learn/`. Card iids are deterministic:
  `<side>-<zone>-<index>` (for example `p-bf-0`, `p-hand-2`, `o-bf-0`). A land keeps its
  hand iid after `PLAY_LAND`.

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
Slice 2:

```
1.1  Lands and mana
  [warn] 1.1-01   tap-for-mana         1/1 lines win
         warn: discriminating -- no legal line loses and no move is rejected, so the exercise tests nothing
  [ ok ] 1.1-02   cast-creature        1/1 lines win
  [ ok ] 1.1-03   colored-vs-generic   3/3 lines win
  [ ok ] 1.1-04   read-costs           multiSelect
  [ ok ] 1.1-05   land-per-turn        2/2 lines win

3.1  Lethal this turn
  [ ok ] 3.1-01   lethal-evasion       2/3 lines win
  [ ok ] 3.1-02   lethal-outnumber     1/7 lines win
  [ ok ] 3.1-03   lethal-outnumber     1/7 lines win
  [ ok ] 3.1-04   summoning-sickness   1/3 lines win

0 error(s), 1 warning(s).
```

`1.1-01` is the first exercise in the course -- the player taps one land and there is
nothing else to do. That is correct for a guided first step, so it is the one
intended warning; any other warning or any error means an exercise needs fixing
before it ships.

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

## 7. Slice roadmap

- **Slice 1** (done): puzzle runner, lesson player, 9 exercises across Unit 1.1
  (lands and mana) and Unit 3.1 (lethal this turn).
- **Slice 2** (done): puzzle checker (`src/learn/engine/puzzleChecker.ts`,
  `npm run learn:check`) for authoring new content outside the test suite. See
  section 3a above.
- **Slice 3** (next): remaining Unit 1.1 and 3.1 content, plus local progress
  and streaks.
- **Slice 4**: checkpoint duel.
