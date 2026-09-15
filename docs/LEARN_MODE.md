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

- **Slice 1** (this slice): puzzle runner, lesson player, 9 exercises across Unit 1.1
  (lands and mana) and Unit 3.1 (lethal this turn).
- **Slice 2**: puzzle checker script for authoring new content outside the test suite.
- **Slice 3**: remaining Unit 1.1 and 3.1 content, plus local progress and streaks.
- **Slice 4**: checkpoint duel.
