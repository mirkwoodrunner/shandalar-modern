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
- 18 Playwright cases at both viewports (8 slice-1 + 5 L1 persistence x 2 spec files), 90 Vitest
  tests, `learn` tag wired into both runners.
- Separate Vite entry (`learn.html`), strict import boundary enforced in `CLAUDE.md`.
- **L1 (done):** local save layer (`src/learn/persistence.ts`, `learn:progress` key),
  onboarding survey with a derived `startingTier`, and derived (not stored) per-unit resume
  position. See `docs/LEARN_L1_SPEC.md` and section 5 below.

Roughly 2,928 lines under `src/learn/`. That covers about the first third of Tier 1 below.

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

- **Hosting:** Learn Mode and Shandalar deploy together. One repo, one build, two Vite
  entries, one origin. Hosted off GitHub so code and live site do not sit behind one
  company's takedown process, on a domain the project owns so a host change does not orphan
  PWA installations. Subdomains from day one so the two can be split later at the cost of a
  DNS change. Accepted consequence: shared origin couples their takedown risk, and Learn Mode
  carries the higher risk of the two.
- **Card pool (reverses an earlier decision):** one card database, cards tagged by pool,
  parameterized lookup defaulting to the Shandalar set. Not a separate database. No format
  targeting. See L4a.
- **Tiers 1 to 3 contain no ungraded content.** Every exercise produces an attempt record.
  Physical handling content is cut from the curriculum. Mulligan decisions become a Tier 3
  skill gated on L5. See 4.4.

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

**Consequence for physical handling content, resolved 2026-09-16.** Shuffling, randomization,
and card handling are cut from the curriculum entirely, not deferred. They are reference
material, not lessons. A text quiz about shuffling etiquette is the least engaging content this
product could ship, and a boring first unit costs more than the missing content does. If this
material ever appears it belongs in a static help page outside the lesson tree.

Mulligan decisions are the exception and are separated out deliberately, because the original
framing bundled two unlike things. Mulligan *procedure* (draw seven, put N on the bottom) is
mechanical trivia and is cut with the rest. Mulligan *decisions* (keep this hand or ship it) is
judgment, is one of the most engaging lessons in Magic, and is heavily deck-dependent. It
becomes a Tier 3 skill gated on L5, since grading it needs library manipulation the runner does
not have and a brand-new player has no frame for evaluating a hand.

**Rule this establishes.** Tiers 1 to 3 contain no ungraded content. Every exercise produces an
attempt record, because L8 computes mastery from attempt records and ungraded content is
invisible to spaced review. Content that cannot be graded is not a lesson.

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

### L1. Persistence, profile, and onboarding survey (done)

Prerequisite for L8, L9, and L10. Nothing retention-flavored can ship before this. Progress
previously lived in `useState` in `useLessonPlayer.ts` and a refresh wiped it.

Shipped as specified in `docs/LEARN_L1_SPEC.md`, with four corrections (C1-C4) applied during
implementation: attempt writes fire from the event handler, never a `setState` updater (C1);
`dailyActivity` now credits every completed attempt, not only successes (C2); `monthlyActivity`
and `longestStreak` are reserved in the save shape for this milestone, with no roll-up logic (C3);
and there is no stored resume position -- a unit's start index is derived from `exercises`
records on every re-entry (C4).

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

### L2. Curriculum spine (done)

Shipped 2026-09-18 as `docs/LEARN_CURRICULUM.md`. Tier 1 fully specified at 16 skills
across 4 units, every one verified green against the runner rather than assumed. Tiers 2
to 5 named and substrate-tagged. Unit 3.1 renumbered to Unit 1.4 per 4.3. The
"what a digital client does for you" skill placed in early Tier 2, not late Tier 1;
reasoning in `LEARN_CURRICULUM.md` section 4.

Two runner defects surfaced during drafting and are logged as LC-1 and LC-2 in
`LEARN_CURRICULUM.md` section 7. LC-1 (player-targeted spells silently no-op) is the
more serious: it is a content trap, not a missing capability, and it blocks
burn-for-lethal content at every tier. Both fixes belong in L5 slices. Until they land,
L2b authored basic lands only and no player-targeted spells. **Both defects were resolved on
2026-09-18** inside `src/learn/`, and that constraint is lifted -- see
`docs/LEARN_CURRICULUM.md` section 7. LC-1's original diagnosis was also wrong; the write-up
explains why.

One open decision was raised rather than settled: applying L2's own exit criterion
strictly pushes card types, turn structure, and blocking out of Tier 1, so the first
public release teaches mana, casting, and attacking and never names a card type. See
`LEARN_CURRICULUM.md` section 6, which recommends generalizing `multiSelect` after the
first release rather than before it.

Original scope, for reference:

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
- Place mulligan decisions as a Tier 3 skill, gated on L5 library manipulation. Physical
  handling content (shuffling, randomization, card handling, mulligan procedure) is cut,
  not deferred. See 4.4.

Exit criteria. Tier 1 is fully specified and every Tier 1 skill is authorable with the
current runner. Tiers 2 to 5 have named skills tagged by substrate.

### L2b. Tier 1 content fill (done)

Depends on L2. Target 40 to 50 exercises covering the full Tier 1 skill list.

**Done 2026-09-18.** Tier 1 is complete at 45 exercises across 4 units and 16 skills, inside
the 40 to 50 target. Seven new skill tags landed, each with its `THEME_CHECKS` entry in the
prompt that introduced it. The authoritative skill list lives in `docs/LEARN_CURRICULUM.md`
section 3, not here.

Exit criteria, checked: Tier 1 skill list fully covered; `npm run learn:check` at 0 errors
(one standing warning on `1.1-01`, which is `guided` by design); `units.test.ts` green at 155
Vitest cases; and Playwright Learn-09 walks every Tier 1 unit from the unit list at both
viewports, which is the "a first-time player can complete Tier 1 end to end" criterion.

Held to the scope guard: two exercise types only, every exercise graded and producing an
attempt record, no physical-handling content, basic lands only and no player-targeted spells
per LC-1 and LC-2, and FLYING and DEFENDER as the only keywords used.

**Correction applied 2026-09-18.** `lethal-first-strike` and `lethal-trample`, listed green
in L2's first draft of the curriculum, are banned by `units.test.ts` `BLOCKED_KEYWORDS`
pending the damage-assignment fix. Both moved to Tier 2. Runner capability is necessary but
not sufficient for authorability; project policy binds too.

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

Scope guard. Two exercise types only, `engine` and `multiSelect`. No third type. Every
exercise is graded and produces an attempt record, per the rule in 4.4. Physical handling
content is cut from the curriculum and does not appear here.

### L2c. Fan content notice and release framing (done)

**Shipped 2026-09-18.** All four gate items are closed and asserted by Playwright
`Learn-10` at both viewports, so they survive a refactor rather than relying on nobody
touching them.

**1. Notice replaced.** `src/learn/content.ts` now carries the Fan Content Policy's standard
form: unofficial Fan Content permitted under the Fan Content Policy, not approved/endorsed by
Wizards, portions of the materials used are property of Wizards of the Coast, copyright
Wizards of the Coast LLC.

> **Verification status, and Chris's call.** The notice was written from the policy's
> long-standing wording and could not be checked against the live page: the build environment
> blocks egress to `company.wizards.com`. **Chris, 2026-09-18: not a gate.** This is a fan
> project with no intention to publish or monetise, and policy questions get addressed if and
> when they become real. The notice is present and accurate to the best available knowledge;
> verify it only if publishing ever becomes the plan.

**2. Asset audit: clean.** Nothing under `src/learn/` references an image, stylesheet
background, or icon of any kind -- no `<img>`, no `.png`/`.jpg`/`.svg`/`.webp`, no
`background-image`, no `url(`. No Wizards logo, no set symbols, no lifted mana symbol art.
Mana is rendered as the plain cost string (`1G`, `2B`) in project CSS, which satisfies the
"project-owned glyphs" requirement by not using glyph art at all. `src/learn/` does not import
`scryfallArt.js` or `useCardArt.js`, so no card images are fetched. `learn.html` declares no
favicon.

What Learn Mode does use of Wizards' IP is card names and oracle text, from
`src/data/cards.js`. That is the known tension recorded in section 6, covered by the notice's
"portions of the materials used" clause, and unchanged by this milestone.

**3. Tutorial framing.** The unit list now states, under the title, that Learn Mode is a free
unofficial tutorial for learning the rules and *not a place to play games*. This is the point
where Tier 1 comes closest to Wizards' own new-player funnel, so the disclaimer is a
positioning statement and not only a legal one.

**4. Early and incomplete.** The unit list says so in as many words, and names what is
actually there: Tier 1 only, four units. A fourth line states that it is free with no ads and
nothing to buy, which is the Fan Content Policy's core condition and Scryfall's, promised in
the product rather than only in a doc.

**Not done here, and deliberately:** nothing was published. Deciding to release is Chris's
call, not a milestone checkbox.

Original scope, for reference:

The fan content notice in `src/learn/content.ts` was placeholder wording. It is a release
gate, not a launch-polish item, and it was mis-scoped in the original roadmap.

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

### L3. Duel UI scenario mode (done, 2026-09-18)

Shipped. The built-state spec is `docs/LEARN_MODE.md` section 8; the engine-side contract
change is `docs/ENGINE_CONTRACT_SPEC.md` S6.3; the revised Learn Mode <-> duel UI import
boundary is in `CLAUDE.md`, which replaced the rule this milestone made false.

What landed:

- **State injection seam.** `useDuel.js` takes an optional pre-built GameState and
  short-circuits `buildDuelState` when one is supplied. Reached from the UI as
  `DuelConfig.initialState`. This was the core blocker; nothing else was possible without it.
- **Lifecycle machine.** `src/learn/engine/scenarioMachine.ts` -- one discriminated union,
  a complete `TRANSITIONS` table, and a reducer that refuses any pair not in it. It holds the
  mount `seed`, never the live GameState, so there is no second source to disagree with
  DuelCore. Retry resets by remounting on a changed key rather than un-doing state by hand.
- **Action restriction in the controller.** `useDuelController.ts` wraps the player-facing
  dispatchers and exposes `isActionAllowed(kind)`; the screens consume the boolean and never
  make the decision. The AI loop, priority responder, stall watchdog, mulligan modal and
  game-over auto-exit are all suppressed in scenario mode.
- **Both viewports together.** `DuelScreen.tsx` and `src/ui/Mobile/DuelScreenMobile.tsx`
  take the same `scenarioPanel` render prop, handed the live state. The overlay is
  top-docked on mobile, where every HUD control lives at the bottom, and collapsible.
- **Playwright at both viewports, in the same prompt.** `tests/e2e/learn-scenario.spec.ts`,
  13 cases, registered in the `mobile-chrome` project. This is the mitigation named under
  "Risk" below, delivered with slice one rather than deferred.

Not done at L3, and deliberately: **best-defense grading**. **Landed at L3b (2026-09-19)** --
see below.

Original scope, for reference:

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

**Boundary change.** (Done.) `CLAUDE.md` forbade Learn Mode prompts from touching UI files
outside `src/learn/`. That rule is retired and replaced, in the same prompt, by an explicit
table of what Learn Mode may import from the duel UI and what stays forbidden. See
`CLAUDE.md`, "Learn Mode <-> duel UI boundary".

**Risk.** (Mitigated.) This is the first coupling between Learn Mode and Shandalar's UI.
Once it exists, every duel UI change can break lessons. `tests/e2e/learn-scenario.spec.ts`
landed with slice one and runs at both viewports; two of its cases exist specifically to
fail if a duel UI change breaks Shandalar or the old lesson player instead.

### L3b. Best-defense grading in scenario mode (done, 2026-09-19)

The slice L3 deferred. `gradeDeclaredAttack` reads declared attackers back off the live board
and grades them against every legal block, so `OPPONENT_DEAD_THIS_TURN` exercises are gradeable
on the duel screen. Single implementation shared with `resolveAttack`; analysis runs on a clone
so a Check press cannot mutate the learner's board. Vitest `@learn` 177 -> 184, Playwright 55 -> 57.

L3's framing of the problem was wrong in a way worth recording: it expected a snapshot check to
grade losing attacks as wins. In practice a scenario board never advances past
`COMBAT_ATTACKERS`, so `checkGoal` returned false for every attack, winning or losing. Unit 1.4
was ungradeable rather than mis-graded.

**Unit 1.4 still does not move to scenario mode.** A separate UI defect blocks it: attacker
clicks on a scenario combat board are intercepted by `banner-you` at both viewports, so no
attacker can be declared. Full diagnosis in `docs/LEARN_MODE.md` section 8. That is a duel-UI
prompt, and it is the remaining blocker on retiring the bespoke lesson player for Unit 1.4.

### L4a. Learn card pool

Blocks Tier 3 onward. The Shandalar 901-card pool cannot teach modern Magic.

**Decision reversed 2026-09-16.** The earlier decision called for a separate Learn card
database. The current decision is one database with cards tagged by pool and a parameterized
lookup that defaults to the Shandalar set.

The original rejection of a pool flag rested on every `CARD_DB` consumer becoming pool-aware.
That holds only if consumers do the filtering. With a parameterized lookup defaulting to
Shandalar, no consumer changes and the objection does not apply. The original decision was
arguably wrong.

What this means concretely: expand the existing card data with the cards lessons need, tagged
so Shandalar's deck generation, ante, shops, `MAGE_ARCHS`, and AI archetype logic continue to
see exactly what they see today. Learn passes a different pool argument.

**No format targeting.** Not Standard, not any format's legality. Standard rotation would
invalidate exercises on a schedule outside your control and the audit cost recurs forever.
Cards are selected for pedagogy: current oracle templating, evergreen keywords only, one clean
example per concept, frequently reprinted.

**Bounded by the engine.** Only cards the engine can execute. No planeswalkers, no mechanics
DuelCore lacks. Tiers 1 to 3 need clean simple cards, which the engine already handles, so
expect a modest addition rather than a modern pool.

**Oracle drift is the risk nobody plans for.** A frozen pool still drifts, because Wizards
issues errata and templating updates. Pin the Scryfall data locally with a version stamp and
gate `learn:check` on a mismatch between a pooled card's current and stored oracle text. Use
the same version-stamping mechanism L7 builds for policy documents. One mechanism, not two.

**Consequence beyond L4a.** The pool determines which art assets exist, which sets the L4b
caching scope and the L9 offline payload size. A bounded pool has a knowable art footprint. A
rotating one does not.

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

_Decision 3 (physical handling content) was resolved 2026-09-16. Cut, not deferred. Mulligan
decisions separated out as a Tier 3 skill. See section 4.4._

_Card pool and hosting were resolved 2026-09-16. See section 3 and L4a._

_Decision 4 (whether to generalize `multiSelect` so Tier 1 can teach card types) was resolved
2026-09-18. **No.** `multiSelect` stays cost-shaped, card types are taught implicitly in Tier 1
and tested in Tier 2 unit 2.3, and no third exercise type is added. Revisit only if Tiers 4 and
5 are brought forward. See `docs/LEARN_CURRICULUM.md` section 6 and `docs/DECISIONS.md`._

_Decision 5 (Fan Content Policy verification as a release gate) was resolved 2026-09-18. **Not
a gate.** No intention to publish or monetise. See L2c above._

No open decisions currently gate any milestone. Add new ones here as they arise, with the
milestone they gate stated explicitly.

Decisions left inside milestones rather than listed here, because they are drafting choices
rather than gates:

- Placement of the "what a digital client does for you" skill. Late Tier 1 or early Tier 3.
  Decided during L2 drafting.
- Placement of mulligan decisions within Tier 3. Decided during the L5 curriculum pass.
