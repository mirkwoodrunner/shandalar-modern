# Learn Mode Roadmap

_Last updated: 2026-09-16. Milestone-level planning for Learn Mode. `docs/LEARN_MODE.md`
is the built-state spec (architecture, grading model, current content). This document is
prospective -- tiers, sequencing, open risks, and decisions not yet made._

_Relationship to `docs/ROADMAP.md`: that document plans Shandalar. This one plans Learn
Mode. They share an engine and a repo and nothing else. Where a Learn Mode milestone
requires an engine change, it is called out here and must land as its own engine prompt
under the normal Shandalar rules._

---

## 1. Goal

Teach Magic: The Gathering from zero knowledge through preparation for judge
certification, in a free, unofficial fan project built on DuelCore.

The comparison people reach for is Duolingo. That comparison is useful for the shape
(short exercises, a skill tree, mastery tracking, spaced review, streaks) and misleading
for the scale. Duolingo runs large teams on content tooling and retention alone. The
realistic target here is the best free interactive MTG tutorial in existence, reached in
stages, not feature parity with a funded consumer app.

## 2. Where Learn Mode stands (2026-09-16)

Built and verified on `main`:

- 12 exercises. Unit 1.1 (lands and mana, 8) and Unit 3.1 (lethal this turn, 4). 8 skill tags.
- Two exercise types. `engine` (replay steps through `duelReducer`) and `multiSelect`.
- `src/learn/engine/puzzleRunner.ts` is the single engine seam. Real DuelCore grading,
  worst-case block enumeration, deterministic iids, fail-fast `LEARN_*` throws.
- `src/learn/engine/puzzleChecker.ts` plus `npm run learn:check`. Five content-quality
  gates. Currently 0 errors, 1 intended warning.
- 8 Playwright cases at both viewports, 57 Vitest tests, `learn` tag wired into both runners.
- Separate Vite entry (`learn.html`), strict import boundary enforced in `CLAUDE.md`.

Roughly 1,816 lines under `src/learn/`. That covers about the first third of Tier 1 below.

## 3. Confirmed scope decisions

Recorded in `docs/DECISIONS.md`. Restated here for context:

- Curriculum spans brand-new player through judge-test prep.
- Card art is in scope.
- The duel UI is in scope and may be adjusted to handle in-progress games for learning scenarios.
- Copyright is framed as fan content. No sales or profit intended.
- One application, not two. Tiers 4 and 5 share the profile, mastery, and review systems
  with Tiers 1 to 3 and differ only in exercise renderer.
- A separate Learn card database satisfying a shared contract, not a pool flag on `CARD_DB`.
- Tier 5 teaches against the tournament policy documents, with version-stamped exercises
  and an automated staleness check.

## 4. Curriculum tiers

Five tiers. The grading substrate column is the load-bearing part of this table.

| Tier | Audience | Content | Graded by |
|---|---|---|---|
| 1. Zero | Never played | Lands, mana, casting, card types, turn structure, combat basics | DuelCore, current runner |
| 2. Playing | Knows the motions | Blocking, the stack, instants, targeting, triggers, multi-turn lines | DuelCore, expanded runner |
| 3. Competent | Plays weekly | Priority windows, state-based actions, combat tricks, common templating, mulligans | DuelCore, expanded runner and modern pool |
| 4. Rules mastery | Wants to be right | Layers, replacement and prevention, timestamps and dependency, copy effects, oddities | Question bank with CR citations. Engine used for demonstration only |
| 5. Judge prep | Testing for L1 or L2 | Regular REL policy, IPG basics, communication policy, tournament shortcuts, exam-format drills | Question bank and scenario rulings. No engine |

### 4.1 Why the substrate forks

Everything Learn Mode grades today is board play replayed through `duelReducer`. That works
for Tiers 1 to 3. It does not work above that, for two independent reasons.

First, tournament policy is not rules. There is no game state that expresses a Game Loss
for a deck registration error, so there is nothing for an engine to grade.

Second, DuelCore implements a curated Alpha and Beta pool, not the Comprehensive Rules. No
planeswalkers, no modern templating, no double-faced cards, no current keyword set.
Building an engine that implements enough of the CR to grade judge-level questions is a
decade of work. XMage has been at it since 2010 and still carries rules bugs. Do not
attempt it.

Tiers 4 and 5 are therefore content-graded. The engine can still *demonstrate* an
interaction it implements, which is worth building for layers content, but it does not
grade the reasoning.

### 4.2 Judge prep has no single target exam

Judge Academy disbanded in 2023. Judge Foundry now certifies in the US and Canada and the
International Judge Program covers Europe, with neither endorsed by Wizards. The Judge
Foundry L1 exam is 25 questions, in-person, closed-book, 70 percent to pass, focused on
Regular REL policy. L2 splits into separate Rules and Policy exams.

Practically, "judge prep" here means CR fluency plus Regular REL policy, not preparation
for one canonical test. Content should not claim to be an official practice exam.

### 4.3 Renumbering note

Unit 3.1 (lethal this turn) is arguably Tier 2 material and sits out of order in the tree
as a slice artifact. Renumber when the real tree lands in L2. Existing exercise ids are
referenced by `tests/e2e/learn-slice.spec.ts` and by `?exercise=` deep links, so a
renumber is a real change, not a cosmetic one.

## 5. Milestones

Ordered. Each milestone is one or more Claude Code slices under the normal prompt rules.

### L1. Persistence, profile, and onboarding survey

Prerequisite for L8, L9, and L10. Nothing retention-flavored can ship before this. Progress
currently lives in `useState` in `useLessonPlayer.ts` and a refresh wipes it.

- Local save layer under `src/learn/`, mirroring the existing shape-validation pattern used
  by Shandalar's save/load rather than inventing a second one.
- Per-exercise record. Attempts, first-try success, hint used, timestamp.
- Explicit state machine for lesson progress. No implicit transitions between exercise,
  feedback, and unit completion.
- Onboarding survey. Two or three questions (how long have you played, have you played in a
  store event, are you studying to judge) that set a starting tier. Freely overridable. No
  grading, no content dependency. The full placement test is L8.

Exit criteria. Refresh mid-unit and resume exactly. Vitest on the save shape. Playwright at
both viewports.

### L2. Curriculum spine

Do this before authoring more exercises. The unit numbering implies a tree that exists
nowhere in the repo.

- Write `docs/LEARN_CURRICULUM.md`. Every tier, every unit, every skill, prerequisite edges,
  target exercise count per skill.
- Tag each skill with its grading substrate and with the runner capability it needs. That
  tagging produces the L5 work list directly.
- Renumber existing units into the real tree (see 4.3).

Exit criteria. Every planned skill is listed and marked authorable-now, runner-blocked, or
content-graded.

### L3. Duel UI scenario mode

Moved ahead of content work. Authoring Tier 2 content against the current bespoke Learn UI
would mean reworking it twice.

`buildPuzzleState` already emits a real GameState, so the data side is largely done. What is
missing is a duel screen mode that renders an arbitrary mid-game state.

- Scenario mode in `DuelScreen.tsx` and `DuelScreenMobile.tsx`. Loads a supplied state,
  restricts legal actions to the exercise's `allowed` list, suppresses campaign and ante
  chrome, renders lesson chrome (prompt, hint, check, retry) as an overlay.
- Explicit state machine. Scenario load, player acting, evaluation, feedback, reset, exit.
  Every transition named. Unnamed transitions here produce ghost states between a failed
  attempt and a retry.
- Mobile parity from the first slice. The lesson overlay must not collide with the existing
  mobile HUD.

**Boundary change.** `CLAUDE.md` currently forbids Learn Mode prompts from touching UI files
outside `src/learn/`. This milestone revises that rule and the revision must land in
`CLAUDE.md` in the same prompt, defining exactly what Learn Mode may import from the duel UI
and what stays forbidden.

**Risk.** This is the first coupling between Learn Mode and Shandalar's UI. Once it exists,
every duel UI change can break lessons. Mitigate with Playwright coverage on scenario mode at
both viewports from slice one, not later.

### L4a. Learn card pool

Blocks Tier 3 onward. The Shandalar 901-card pool cannot teach modern Magic.

Decision, confirmed: a separate Learn card database satisfying the same contract, not a pool
flag on `CARD_DB`. A flag is cheaper to write and more expensive to own, because every
`CARD_DB` consumer becomes pool-aware. Deck generation, ante, shops, `MAGE_ARCHS`, and the AI
archetype logic all read that database and all assume Alpha and Beta. A missed call site means
Learn cards leaking into campaign decks.

- Engine prompt. Parameterize `makeCardInstance` and the lookup path so the pool is an
  argument, not a module-level constant. Shandalar passes the existing pool and behaves
  identically.
- One shared card-shape type both pools satisfy, plus a contract test both must pass. Two
  databases without a shared type is the real failure mode.
- Learn prompt. Build the Learn pool from Scryfall data, scoped to what the curriculum
  actually needs. Not a bulk import.

**Risk.** This is the first engine change Learn Mode requires, breaking the current rule that
Learn prompts never touch the engine. Needs its own approval path and a full Playwright
regression pass on Shandalar proving nothing moved.

Related, already logged in `docs/LEARN_MODE.md` section 6: the damage-assignment and
deathtouch engine gaps block Units 3.4 and 3.5 independently of the pool question.

### L4b. Card art

Correction to earlier planning: this is largely a reuse job, not a build. `src/utils/scryfallArt.js`
and `src/utils/useCardArt.js` already exist and are not currently imported by `src/learn/`.

What still needs doing:

- Printing selection. `fetchOldestArt` hard-codes `lea`, `leb`, `2ed`, `3ed`, `4ed`, which is
  correct for Shandalar and wrong for a modern Learn pool. Needs a printing-preference
  parameter, defaulting to current behavior so Shandalar is untouched.
- Persistent caching. The current cache is an in-memory `Map` that dies on refresh. L9's
  offline story depends on a durable cache, so settle this here.
- `src/learn/ui/LearnCard.tsx` is 67 lines of text rendering. Full rework, with a text-only
  fallback that survives a failed image fetch rather than breaking the exercise.
- Artist credit and attribution handling.

**Constraint on L9.** Art is the entire offline payload. Caching art for a few hundred
exercises is a very different size problem than caching JSON. Settle art before designing
offline.

### L5. Runner expansion

Ordered by what L2 says Tiers 2 and 3 need, not by what is interesting. Likely order by
beginner priority: player-side blocking, then the stack and priority with instants, then
targeting, then triggers, then multi-turn puzzles, then library and graveyard zones.

- Each capability is its own slice with its own `THEME_CHECKS` support written in the same
  prompt, per the existing `CLAUDE.md` rule.
- Each capability expands the checker's enumeration space. `MAX_SEARCH_DEPTH`,
  `MAX_SEARCH_NODES`, and `MAX_ENUM_ATTACKERS` must be revisited per slice or `learn:check`
  starts timing out instead of reporting.

Exit criteria per slice. New action kinds in the runner, matching theme checks,
`npm run learn:check` still at 0 errors.

### L6. Authoring pipeline

The scaling unlock. Exercises are hand-written TypeScript literals and every skill tag needs a
hand-written theme check. That is fine at 12 exercises and is the whole project at 200.

- Move exercise content out of TS literals into a validated data format the checker reads.
- Parameterized templates for same-skill variants. Slice 3a proved the pattern by hand,
  producing white and black parallels of existing green and red exercises.
- Theme-check reuse so a variant does not require a new hand-written check.

Exit criteria. Author 20 exercises in the time Slice 3a took for 3.

### L7. Question-bank system

Tier 4 and 5 substrate.

- Question-bank exercise type. Scenario text, answer options, source citation, explanation.
- CR citation checking. `docs/MagicCompRules 20260417.pdf` is already in the repo. Citations
  should be machine-checked against rule numbers so drift is caught when a new CR drops. This
  is the Tier 4 equivalent of `learn:check` and should carry the same fail-fast posture.
- Policy sourcing. Tier 5 content is governed by the Magic Tournament Rules, the Infraction
  Procedure Guide, and Judging at Regular REL. None are in the repo today. Sourcing and
  storing them is part of this milestone.
- Version stamping. Every policy exercise records the document name and effective date it was
  written against. One config file holds the current versions. `learn:check` errors when any
  exercise's stamp is older than the configured current version.

**Why the stamping matters.** Those documents revise several times a year, usually alongside
set releases. A Tier 5 exercise teaching a penalty or a shortcut can silently become wrong.
Stamping converts policy drift from silent wrongness into a build failure.

- Engine demonstration mode. For layer and replacement questions the engine can show the
  resulting board even where it cannot grade the reasoning. Only works for interactions the
  engine implements, so expect most Tier 4 demonstrations to be static.

### L8. Mastery, spaced review, and placement test

Serves both substrates.

- Skill-level mastery score derived from the L1 attempt records.
- Spaced review queue that resurfaces weak skills. Spacing improving retention is
  well-established in the learning-science literature. Specific interval schedules are
  contested, so start simple and tune against real data.
- Adaptive difficulty within a skill. Serve the harder variant after a clean first try.
- Placement test. A short fixed diagnostic at each tier boundary, roughly ten questions, that
  unlocks everything below it on a pass. Adaptive item selection is a later refinement and not
  worth it at launch.

**Risk.** Placing someone too high loses them on the second exercise. Bias placement
conservatively and make skipping forward easy, rather than the reverse.

Exit criteria. A review session composed at runtime from mastery state, not a fixed list.

### L9. Retention shell

- PWA. Installable, offline-capable. Every exercise is local and deterministic already, so
  the constraint is art payload size (see L4b).
- Streaks, daily goal, session summary.
- Notifications. On iOS these require the PWA install path, and they are the single largest
  retention lever Duolingo has.
- Mobile layout pass. `src/learn/ui/learn.css` has 44px touch targets and rem sizing but zero
  `@media` queries, so the current layout is one design stretched across both viewports rather
  than two intentional ones.

Exit criteria. Install to home screen on iOS and Android. Complete a lesson offline. Streak
survives across sessions.

### L10. Checkpoint duels

Originally scoped as Slice 4. Cheaper after L3, which already builds the scenario path into
the real duel UI.

- Constrained duel against a weak AI profile, unlocked by finishing a unit block.
- Reuses the real duel screen, not a Learn-specific one, or the exercise loses its point.

### L11. Launch readiness

- Final fan content notice replacing the placeholder in `src/learn/content.ts`. See section 6.
- Accessibility pass. Color is load-bearing in a mana-teaching app, so colorblind handling is
  not optional.
- Local-only telemetry so content quality can be measured without collecting anything from users.

## 6. Fan content posture

Learn Mode is unofficial fan content. Free, always. This is structural, not a footnote.

- Carry the standard notice verbatim in `src/learn/content.ts`. Wizards asks fan content to
  state that it is unofficial, not approved or endorsed by Wizards, and that portions of the
  materials used are property of Wizards of the Coast.
- No ads, no donations tied to access, no premium tier. The policy's core condition is that
  fan content is free, and that condition also keeps the project inside Scryfall's terms.
  Scryfall provides card data and images free of charge under the Fan Content Policy for
  building Magic software, subject to their guidelines against implying endorsement and
  against putting the data behind payments or surveys.
- No Wizards logos, no set symbols, no lifted official mana symbol art. Render mana as
  project-owned glyphs.

**Known tension, stated honestly.** The policy says fan content may not incorporate Wizards
game mechanics without prior written permission, and does not cover verbatim copying of
Wizards IP. A rules-teaching engine is game mechanics. Every MTG fan client lives in this gap.
Forge, XMage, and Cockatrice have persisted for years, which is meaningful evidence about
enforcement posture but is not permission.

**The risk that actually scales.** Looking like a substitute for Arena. Arena is Wizards' own
new-player funnel, so a beginner-teaching product sits closer to a Wizards product than a
Shandalar remake does. Keep Learn Mode framed and presented as a tutorial, not as a place to
play Magic. Tier 5 policy content is the lowest-risk part of the project.

Practical exposure is takedown, not litigation. Plan for it. The repo stays the source of
truth so a hosting takedown is not a project-ending event.

## 7. Cross-cutting

- **Parity tax.** Every duel-facing change from L3 onward mirrors to `DuelScreen.tsx` and
  `DuelScreenMobile.tsx`. Budget it into each slice.
- **Checker debt.** Theme checks are hand-written per skill tag. Every runner capability added
  in L5 multiplies the checks needed. L6 is what keeps this from compounding.
- **Engine-prompt separation.** L3, L4a, and L4b each require changes outside `src/learn/`.
  Each lands as its own prompt under the normal engine rules, never bundled into a content slice.

## 8. Open decisions

1. Which tiers ship publicly first. Shipping Tiers 1 and 2 before 4 and 5 exist is defensible.
   Shipping 4 and 5 first is also defensible, since they need no runner work and serve an
   audience that is easier to reach.
2. Whether Tier 1 assumes paper Magic or a digital client as the reader's context. It changes
   how shuffling, priority, and shortcuts are taught.
3. Whether the Learn card pool tracks Standard, a fixed evergreen subset, or something else.
   Tracking Standard means recurring content maintenance forever.
4. Hosting. Affects the PWA story in L9 and the takedown-resilience plan in section 6.
