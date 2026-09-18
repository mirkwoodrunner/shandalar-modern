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
- **Release order.** Tier 1 ships publicly on its own, first, after L2c. Rationale: it is
  the only tier needing no new runner capability, no card pool, and no duel-UI work, so it
  is two milestones away rather than six. It is also the only tier that validates the
  DuelCore grading path and `puzzleChecker`, which are the project's differentiating
  assets and which Tiers 4 and 5 do not touch. Judge-prep content was considered as a
  first release and rejected for retention reasons: judge candidates study to a deadline
  and then stop, which is the wrong population to tune a streak and spaced-review system
  against.

- **Paper is the canonical model** at every tier. Digital-client behavior is taught as a
  mapping layer, not as the default. See section 4.4.

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

### 4.4 Paper as the canonical model

Decided 2026-09-16. All content at every tier teaches paper Magic. Digital-client behavior
is taught as a mapping layer on top of that, never as the default.

Three reasons:

- **The curriculum ends in paper.** The MTR and IPG are paper-only documents. Tier 5 has no
  digital analogue. Teaching digital conventions at Tier 1 and paper conventions at Tier 5
  would mean an unexplained model switch somewhere in the middle.
- **The runner already models paper.** `TAP_LAND` is an explicit player action and
  `UNDO_MANA_TAPS` exists because taps are manual. Arena auto-taps. The implementation
  already behaves the paper way, so teaching paper costs nothing, while teaching digital
  would mean contradicting the interface the lesson runs inside.
- **Rules live in paper.** Digital clients are a shortcut layer over the Comprehensive
  Rules. Teaching the shortcut first means unlearning it later.

**The counterargument is real and is handled explicitly.** Most new players in 2026 arrive
through a digital client, so paper conventions will not match what they already see. The
answer is a dedicated skill, not a switch of model. A skill along the lines of "what a
digital client does for you" covering auto-tapping, auto-passing priority, and stops. It
teaches the mapping between the two rather than picking a side. Place it late in Tier 1 or
early in Tier 3, decided during L2 drafting.

**Consequence for physical handling content.** Shuffling, randomization, mulligan procedure,
and card handling have no representation in the runner and cannot be graded by it. They are
real Tier 1 material under a paper north star, so Learn Mode needs either a read-only
explainer exercise type or an explicit decision to defer them. That is open decision 3 in
section 8.

## 5. Milestones

Ordered. Each milestone is one or more Claude Code slices under the normal prompt rules.

**Release sequence (decided 2026-09-16).** The first public release is Tier 1 alone, after
L2c. Everything from L3 onward is post-release work. L1 and L2 may run in parallel, since
persistence has no dependency on the curriculum tree. L2b depends on L2, because authoring
Tier 1 content requires the Tier 1 skill list that L2 produces.

Reasoning is in section 3 under "Release order." The short version: Tier 1 is the only tier
that needs no new runner capability, no card pool, and no duel-UI work, so it is reachable
in two milestones instead of six, and it is the only tier that validates the DuelCore
grading path the project is built on.

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
nowhere in the repo. May run in parallel with L1.

- Write `docs/LEARN_CURRICULUM.md`.
- **Tier 1 at full detail.** Every unit, every skill, prerequisite edges, target exercise
  count per skill. This is the direct input to L2b.
- **Tiers 2 through 5 at skill-name granularity only.** A list of skills per unit and
  nothing more. Do not fully specify tiers that may not be built for a year. The detail
  will be wrong by the time it is reached, and a stale curriculum document is worse than
  a thin one. Each tier gets its full pass in the milestone that unblocks it.
- Tag each Tier 1 skill with the runner capability it needs, and confirm every one is
  already supported. A Tier 1 skill that needs a new action kind is a scoping error and
  belongs in Tier 2.
- Tag Tiers 2 through 5 skills with grading substrate only. That tagging produces the L5
  work list.
- Renumber existing units into the real tree (see 4.3).
- Draft every skill against the paper model (see 4.4). Where a digital client behaves
  differently, that difference is its own skill, not a caveat inside another skill.
- Place the "what a digital client does for you" skill. Late Tier 1 or early Tier 3.
  Decide during drafting, record the choice in `docs/LEARN_CURRICULUM.md`.
- Decide whether physical handling content (shuffling, randomization, mulligan procedure)
  is in Tier 1 or deferred. If in, it needs a read-only explainer exercise type, which is
  a new type and belongs in its own slice, not inside L2b. See open decision 3.

Exit criteria. Tier 1 is fully specified and every Tier 1 skill is authorable with the
current runner. Tiers 2 to 5 have named skills tagged by substrate.

### L2b. Tier 1 content fill

Depends on L2. Target 40 to 50 exercises covering the full Tier 1 skill list.

Constraints that make this cheap:

- No new action kinds. Every Tier 1 skill is authorable with the current runner, which L2
  verifies as an exit criterion.
- No Learn card pool. The existing Shandalar pool teaches lands, mana, costs, card types,
  turn structure, and basic combat without gaps.
- No card art required. Art is desirable at release and is L4b work, not a gate. The
  text-only `LearnCard` renders every Tier 1 exercise correctly today.

**Deliberately hand-authored, before the L6 authoring pipeline exists.** At 40 to 50
exercises, hand-authoring is still affordable, and Slice 3a already demonstrated the
same-skill parallel pattern. Blocking the first release on L6 would trade a shippable
product for tooling that only pays off at Tier 2 scale. Expect L6 to be informed by what
authoring 40 exercises actually feels like.

Every exercise passes `npm run learn:check` with zero errors under the existing rules.
New skill tags still require a matching `THEME_CHECKS` or `MULTI_THEME_CHECKS` entry in the
same prompt, per `CLAUDE.md`.

Exit criteria. Tier 1 skill list fully covered. `npm run learn:check` at 0 errors.
`units.test.ts` green. A first-time player can complete Tier 1 end to end.

Paper constraint. Every exercise teaches paper behavior (see 4.4). No exercise assumes
auto-tapping, auto-passing, or any other client convenience. If the "what a digital client
does for you" skill lands in Tier 1 per L2, it ships in this fill.

Scope guard. If L2 places physical handling content in Tier 1, that content needs a new
read-only exercise type and is explicitly **out of scope for L2b**. It ships as its own
slice. L2b authors engine-gradable exercises only, using the two existing types.

### L2c. Fan content notice and first public release

**Pulled forward from L11.** The fan content notice in `src/learn/content.ts` is currently
placeholder wording. It is a release gate, not a launch-polish item, and it was mis-scoped
in the original roadmap.

- Replace the placeholder with the standard notice. See section 6.
- Audit for Wizards logos, set symbols, and lifted official mana symbol art. Render mana as
  project-owned glyphs.
- Confirm the framing throughout is tutorial, not a place to play Magic. Tier 1 has the
  highest overlap with Wizards' own new-player funnel of any tier, so presentation matters
  more here than anywhere else in the project.
- Release framed explicitly as early and incomplete.

**Reassessment gate.** After release, the choice between Tier 2 and Tiers 4 and 5 gets
decided with completion and return data rather than in the abstract. Note the limit of that
data: a 40-exercise release shows whether people finish, not whether they return over six
weeks. Do not over-read it when designing L8 and L9.

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

Note on ordering. L2b deliberately hand-authors 40 to 50 exercises before this milestone
exists. That is not an oversight. Hand-authoring is affordable at that volume and blocking
the first release on tooling would be the wrong trade. This milestone should be designed
against what L2b actually cost.

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

- Accessibility pass. Color is load-bearing in a mana-teaching app, so colorblind handling is
  not optional. (The fan content notice moved to L2c as a release gate.)
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

_Decision 1 (which tiers ship publicly first) was resolved 2026-09-16. See section 3 under
"Release order" and section 5 under "Release sequence."_

_Decision 2 (paper versus digital client as the canonical model) was resolved 2026-09-16.
Paper. See section 4.4._

1. Whether the Learn card pool tracks Standard, a fixed evergreen subset, or something else.
   Tracking Standard means recurring content maintenance forever. Gates L4a, not the first
   release.
2. Hosting. Affects the PWA story in L9 and the takedown-resilience plan in section 6.
   **Gating L2c**, since the first public release needs somewhere to live.
3. Whether physical handling content (shuffling, randomization, mulligan procedure, card
   handling) ships in Tier 1 or is deferred. Raised by the paper decision in 4.4. It is
   genuine Tier 1 material under a paper north star, but the runner cannot grade it, so
   including it means building a read-only explainer exercise type. That is a third
   exercise type and a new `puzzleChecker` code path. **Gating L2**, and if answered yes,
   it adds a slice between L2 and L2c that L2b does not absorb.
