# Learn Mode Curriculum

_Last updated: 2026-09-18. This is the L2 deliverable from `docs/LEARN_MODE_ROADMAP.md`._

This document is the skill tree. `docs/LEARN_MODE_ROADMAP.md` plans milestones;
this plans content. `docs/LEARN_MODE.md` describes what is built.

Authority: where this document and the roadmap disagree about content, this one wins.
Where either disagrees with `docs/SYSTEMS.md` about engine behaviour, `SYSTEMS.md` wins.

---

## 1. How to read this

Every skill carries a **tag**, a **substrate**, and a **status**.

The tag is the literal string in an exercise's `skill` field. It must have a matching
entry in `THEME_CHECKS` or `MULTI_THEME_CHECKS` in `src/learn/engine/puzzleChecker.ts`,
written in the same prompt that introduces the tag (`CLAUDE.md` rule, unchanged).

The substrate is what grades it:

| Substrate | Meaning |
|---|---|
| `engine` | Replayed through `duelReducer` via `puzzleRunner.ts`. Real grading. |
| `multiSelect` | Pick-the-right-cards, graded by set equality. Currently cost-shaped only. |
| `bank` | Question bank with citations. Does not exist yet (L7). |

The status is authorability against the runner **as it exists today**:

| Status | Meaning |
|---|---|
| **green** | Authorable now. Verified against the runner, not assumed. |
| **blocked** | Needs a runner or type change. The blocker is named. |

Roadmap L2 exit criterion: every Tier 1 skill must be green, and a Tier 1 skill that
needs a new action kind is a scoping error that belongs in Tier 2. Section 3 applies
that rule literally, which moves several things a beginner tutorial would normally
contain out of Tier 1. Section 6 records that consequence as an open decision rather
than burying it.

---

## 2. Runner capability, as verified 2026-09-18

This section is the binding constraint on Tier 1. It was established by probing
`src/learn/engine/puzzleRunner.ts` directly, not by reading its types.

### Supported

| Capability | Notes |
|---|---|
| Phases `MAIN_1`, `COMBAT_ATTACKERS` | `PuzzleSetup.phase`. No other entry phase exists. |
| `TAP_LAND` | Adds `produces[0]` of that land. |
| `PLAY_LAND` | One per puzzle; the second is rejected with `MSG.LAND_LIMIT`. |
| `CAST_SPELL` | Any nonland card the player can pay for. Resolves through the stack. |
| `UNDO_MANA_TAPS` | Untaps everything tapped for mana. |
| `DECLARE_ATTACKER` | Committed as a set, then graded against every legal block assignment. |
| Goal `MANA_IN_POOL` | Colour and amount. |
| Goal `CARD_ON_BATTLEFIELD` | Matches on `card.id`. Creatures, artifacts, enchantments. |
| Goal `OPPONENT_DEAD_THIS_TURN` | `checkWinConditions`. Evaluated in either phase. |
| Flying and defender | Honoured by `canBlockDuel`. The only two keywords Tier 1 may use. |
| First strike, trample, banding, deathtouch | Resolve correctly in the runner, but banned by project policy. See below. |
| Summoning sickness, tapped attackers | Rejected with specific, teachable messages. |

Worst-case block enumeration is the asset here. `resolveAttack` marks a line lethal only
if the opponent dies under **every** legal block assignment. That is what makes Unit 1.4
real teaching rather than a quiz.

### Not supported, with the consequence

| Gap | Consequence | Evidence |
|---|---|---|
| **Player-targeted spells silently no-op.** | No burn-for-lethal content at any tier until fixed. | Lightning Bolt cast at an opponent on 3 life: the cast is accepted, the card leaves hand, `o.life` stays 3. There is no failure, which makes this a content trap, not just a gap. Logged in section 7. |
| **`TAP_LAND` takes no colour.** | Dual and filter lands always make `produces[0]`. No "choose a colour" content. | Taiga taps for `{R:1}` with no way to ask for G. |
| **No phase-advance action.** | Turn structure is not gradeable. | `ActionKind` has no advance; `advanceTo` is internal to combat resolution. |
| **Player is always the attacker.** | Blocking is not gradeable from the player's seat. | `resolveAttack` enumerates the *opponent's* blocks. |
| **`multiSelect` is cost-shaped.** | It cannot host a question that is not "given these lands, which of these cards can you cast". | Its fields are `lands`, `options`, `answer`. |
| **No library or graveyard zones in setup.** | No draw, mill, tutor, or mulligan content. | `SideSetup` is `life`, `hand`, `bf`. |
| **No instants at priority.** | No stack content. | No priority window is exposed to the learner. |

The first two rows are new findings from this pass and were not in the roadmap.

### Policy constraint, which is separate from capability

`src/learn/__tests__/units.test.ts` fails any exercise referencing a card whose `keywords`
include TRAMPLE, BANDING, FIRST_STRIKE, DOUBLE_STRIKE, or DEATHTOUCH. Those keywords work
in the runner. They are banned anyway, because the damage-assignment and deathtouch gaps in
`docs/LEARN_MODE.md` section 6 make the *reasoning* the exercise would teach unreliable
even where the single case resolves correctly.

Treat that list as binding when picking cards. FLYING and DEFENDER are not on it and are
the two keywords Tier 1 may use.

---

## 3. Tier 1 — Zero

**Audience:** has never played. **Substrate:** `engine` and `multiSelect`.
**Release:** this tier ships publicly on its own, first, after L2c.

Every skill below is **green**. Target 3 exercises per skill unless noted, which puts the
tier at 48 exercises against L2b's 40 to 50 target.

### Prerequisite graph

```
1.1 Lands and mana
      |
1.2 Casting spells
      |
1.3 Who can attack
      |
1.4 Winning this turn
```

Strictly linear, on purpose. A zero-knowledge learner has no basis for choosing a branch,
and a linear spine is what the derived resume position in L1 already assumes.
Units 1.5 to 1.7 are deferred (section 6) and would attach as leaves, not as spine nodes,
so adding them later does not disturb this ordering.

### Unit 1.1 — Lands and mana

Teaches: mana exists, lands make it, colours are not interchangeable, one land per turn.

| Skill tag | Substrate | Exercises | Teaches | Status |
|---|---|---|---|---|
| `tap-for-mana` | engine | 1 | Tapping a land adds mana to your pool. | **built** (`1.1-01`) |
| `cast-creature` | engine | 1 | The unit's payoff: spend what you made. | **built** (`1.1-02`) |
| `colored-vs-generic` | engine | 4 | `{1}` takes anything, `{G}` does not. | **built** (`1.1-03/06/09/10`) |
| `land-per-turn` | engine | 3 | One land drop per turn, and the drop is load-bearing. | **built** (`1.1-05/07/11`) |
| `read-costs` | multiSelect | 3 | Read a cost and decide affordability. | **built** (`1.1-04/08/12`) |

Unit 1.1 is complete at 12 exercises.

**`tap-for-mana` stays at one exercise, on purpose.** With only `TAP_LAND` allowed and an
empty hand there is no losing line and no rejectable move, so the checker cannot make such
an exercise discriminating -- which is why `1.1-01` carries `guided: true` and the file's one
standing warning. A second one would buy a second warning and no teaching. The colour
coverage that a second `tap-for-mana` would have given is carried by `colored-vs-generic`
instead, which spans red, white, blue, and black.

**Authoring note.** `colored-vs-generic` has the strictest theme check in the file: some
land subset with enough total mana must still be unable to pay. An exercise where every
sufficient subset also pays the colours is an error, not a warning.

### Unit 1.2 — Casting spells

Teaches: spells come from hand, cost gets paid first, sequencing matters, and you choose.

| Skill tag | Substrate | Exercises | Teaches | Status |
|---|---|---|---|---|
| `cast-creature` | engine | 3 | Pay the cost, the creature arrives. | **built** (`1.2-01..03`) |
| `cast-noncreature` | engine | 3 | Artifacts and enchantments cast the same way. | **built** (`1.2-04..06`) |
| `pay-exact-mana` | engine | 3 | Lands that add up to exactly the cost, with nothing spare. | **built** (`1.2-07..09`) |
| `choose-what-to-cast` | engine | 3 | Limited mana forces a choice between two affordable spells. | **built** (`1.2-10..12`) |

Unit 1.2 is complete at 12 exercises. `cast-creature` is introduced in Unit 1.1 by
`1.1-02` as that unit's payoff beat ("you made mana, now spend it") and reinforced here in
three further colours. That is deliberate spaced practice, not a misfiled exercise.

**`cast-sequencing` was dropped during authoring.** As drafted it would have required the
played land to be tapped for the cast, which is what `land-per-turn` already exercises in
`1.1-05` and `1.1-07`. Two tags covering one behaviour is worse than one, because L8
computes mastery per skill and overlapping tags split the same evidence across two scores.
`pay-exact-mana` replaced it: distinct behaviour, distinct check, no overlap.

**`cast-noncreature` matters more than it looks.** The learner's model after Unit 1.1 is
"spells are creatures". Casting Howling Mine, Crusade, and Jayemdae Tome is what separates
"cast" from "summon" before Unit 1.3 tells them creatures attack.

**`choose-what-to-cast` needs `wrongLines`, not just solutions.** The lesson is the
exclusion, and the theme check enforces it: some *other* card in hand must be affordable
from the opening board, or there was never a choice. Each of `1.2-10..12` enumerates to
`1/2 lines win`, the losing line being "cast the cheap one first".

### Unit 1.3 — Who can attack

Teaches: not every creature on your board is an attacker.

| Skill tag | Substrate | Exercises | Teaches | Status |
|---|---|---|---|---|
| `summoning-sickness` | engine | 3 | A creature that arrived this turn cannot attack. | **built** (`1.3-01..03`) |
| `defender-cant-attack` | engine | 3 | Walls and other defenders never attack. | **built** (`1.3-04..06`) |
| `tapped-cant-attack` | engine | 3 | A tapped creature cannot be declared. | **built** (`1.3-07..09`) |

Unit 1.3 is complete at 9 exercises.

All three are taught by rejection, and the runner already returns teachable text for each
(`MSG.sick`, `MSG.cantAttack`, `MSG.tappedAttacker`). The `wrongLines` entry carries the
rejection; `reasonIncludes` is what the learner is meant to read.

**Every goal in this unit is `OPPONENT_DEAD_THIS_TURN`, because that is the only goal a
`COMBAT_ATTACKERS` exercise has.** So a "who can attack" lesson is still a lethal puzzle;
what makes it Unit 1.3 rather than Unit 1.4 is that the barred creature, not the blocking
maths, is what the learner has to notice. Both units are therefore combat-only with empty
hands, and `units.test.ts` now asserts that for 1.3 as well as 1.4.

**Theme-check design for the two new tags.** Load-bearing is enforced with a no-slack rule
rather than by removing the restriction, because a Wall cannot be un-walled the way
`summoning-sickness` un-sicks a creature. Both checks require (a) a creature barred for the
right reason and (b) every winning attacker set to use *every* legal attacker. If the puzzle
still wins with an attacker left home, the barred creature was never the constraint.

**`1.3-01` is the former `1.4-04`**, moved here because it is a summoning-sickness lesson
and this is the summoning-sickness unit. `stableId` stays `3.1-04`, so progress carries.

### Unit 1.4 — Winning this turn

Teaches: count the damage, and count it against the *best* defence.

| Skill tag | Substrate | Exercises | Teaches | Status |
|---|---|---|---|---|
| `lethal-outnumber` | engine | 3 | More attackers than blockers means damage gets through. | **built** (`1.4-02/03/04`) |
| `lethal-evasion` | engine | 3 | Flying goes over ground creatures. | **built** (`1.4-01/05/06`) |
| `lethal-tapped-defender` | engine | 3 | A tapped creature cannot block, so count untapped ones. | **built** (`1.4-07..09`) |
| `lethal-flying-defender` | engine | 3 | Flying stops being evasion when they fly too. | **built** (`1.4-10..12`) |

Unit 1.4 is complete at 12 exercises. `summoning-sickness` moved to Unit 1.3, where the tag
belongs.

**`lethal-flying-defender`'s check reads blockability out of the engine rather than out of
card text.** Attacking alone with one creature, each defender that can legally block it
doubles the number of assignments `resolveAttack` enumerates, so `log2(outcomes)` is exactly
how many defenders can block that attacker. The check then demands one attacker blockable by
some defenders and not others, and no attacker blockable by none -- the second half is what
keeps it from being a `lethal-evasion` puzzle wearing a different tag.

**Correction, 2026-09-18.** This table previously listed `lethal-first-strike` and
`lethal-trample` as green on the strength of a runner probe showing both resolve correctly.
That probe was right and the conclusion was wrong. `src/learn/__tests__/units.test.ts`
carries a `BLOCKED_KEYWORDS` list -- TRAMPLE, BANDING, FIRST_STRIKE, DOUBLE_STRIKE,
DEATHTOUCH -- that fails any exercise referencing a card with those keywords, because of
the damage-assignment and deathtouch gaps in `docs/LEARN_MODE.md` section 6. Runner
capability is necessary but not sufficient; project policy is the binding constraint. Both
tags move to Tier 2, gated on that engine fix rather than on L5.

`lethal-flying-defender` replaces them and is the more useful lesson anyway: it stops
`lethal-evasion` from teaching "flying always gets through", which is the exact
overgeneralisation a beginner makes.

This unit is the tier's payoff. It is also the only place the worst-case block enumeration
is visible to the learner, so the feedback text should say *what the best block was*, which
`resolveAttack` already returns in `summary`.

**Renumbering.** This unit is the current Unit 3.1 ("Lethal this turn"). See section 5.

### Tier 1 totals

| Unit | Skills | Target exercises | Built | To author |
|---|---|---|---|---|
| 1.1 Lands and mana | 5 | 12 | **12** | 0 |
| 1.2 Casting spells | 4 | 12 | **12** | 0 |
| 1.3 Who can attack | 3 | 9 | **9** | 0 |
| 1.4 Winning this turn | 4 | 12 | **12** | 0 |
| **Total** | **16** | **45** | **45** | **0** |

**Tier 1 content is complete.** 45 exercises, 16 skills, `learn:check` at 0 errors and the
one standing `1.1-01` warning.

All seven new skill tags planned across L2b have landed with their `THEME_CHECKS` entries:
`cast-noncreature`, `pay-exact-mana`, `choose-what-to-cast` (Unit 1.2),
`defender-cant-attack`, `tapped-cant-attack` (Unit 1.3), `lethal-tapped-defender`,
`lethal-flying-defender` (Unit 1.4).

Colour coverage across the tier: white, blue, black, red, and green all appear as both the
colour a cost demands and the colour a wrong tap supplies. Keywords used are FLYING and
DEFENDER only, which is the whole set Tier 1 is permitted.

Card pool: the existing Shandalar pool covers all of it. Verified availability for the new
units: 25 vanilla creatures across five colours, 53 flyers, 12 first strikers, 7 tramplers,
24 defenders at five mana or less. No Learn pool needed for Tier 1, as L2b assumed.

---

## 4. Tiers 2 to 5 — skill names only

Deliberately thin. The roadmap's instruction is that a stale curriculum is worse than a
thin one, and each tier gets its full pass in the milestone that unblocks it. Substrate
tagging is the load-bearing column: it produces the L5 work list.

### Tier 2 — Playing

Unblocked by: L5 runner expansion (player-side blocking, stack and priority, targeting,
triggers, multi-turn), plus the player-targeting fix in section 7.

| Unit | Skills | Substrate | Unblocked by |
|---|---|---|---|
| 2.1 Blocking | choose-a-blocker, chump-block, double-block, trade-or-take | engine | L5 player-side blocking |
| 2.2 The turn | phase-order, main-phase-timing, untap-and-upkeep, end-step | engine | L5 phase actions |
| 2.3 Card types | identify-card-type, permanent-vs-spell, when-can-i-cast-this | multiSelect | generalized multiSelect (section 6) |
| 2.4 Targeting | legal-target, target-your-own, burn-for-lethal | engine | L5 targeting + section 7 fix |
| 2.5 The stack | stack-order, respond-to-a-spell, instant-vs-sorcery-timing | engine | L5 stack and priority |
| 2.6 Triggers | etb-trigger, attack-trigger, upkeep-trigger | engine | L5 triggers |
| 2.7 Multi-turn lines | plan-two-turns, hold-back-a-blocker, race-or-block | engine | L5 multi-turn puzzles |
| 2.8 What a digital client does for you | auto-tap, auto-pass, stops-and-holds | multiSelect | generalized multiSelect |

Unit 2.8 is the placement decision the roadmap left open in section 4.4 and section 8.
**Decided here: early Tier 2, not late Tier 1.** Reasoning: the skill teaches the *mapping*
between paper and client conventions, which requires the learner to already hold the paper
model. At the end of Tier 1 they have held it for about forty exercises. Placing it in
Tier 1 would also mean shipping the first public release with a unit that explains an
interface the release does not have.

### Tier 3 — Competent

Unblocked by: L5 (remaining), L4a Learn card pool.

| Unit | Skills | Substrate | Unblocked by |
|---|---|---|---|
| 3.1 Priority windows | when-do-i-get-priority, holding-priority, passing-in-order | engine | L5 |
| 3.2 State-based actions | lethal-damage, zero-toughness, zero-life, legend-rule | engine | L5 |
| 3.3 Combat tricks | pump-after-blocks, removal-after-blocks, bait-a-block | engine | L5 |
| 3.4 Damage assignment | assignment-order, lethal-then-trample, deathtouch-assignment | engine | L5 + engine gap, below |
| 3.5 Common templating | may-vs-must, target-vs-each, until-end-of-turn, cant-vs-doesnt | multiSelect | generalized multiSelect |
| 3.6 Mulligan decisions | keep-or-ship, count-your-lands, deck-dependent-keeps | engine | L5 library manipulation |

Unit 3.4 is blocked by the damage-assignment and deathtouch engine gaps already logged in
`docs/LEARN_MODE.md` section 6, independently of the pool question. Unit 3.6 is the
mulligan placement the roadmap deferred to the L5 curriculum pass; it sits last because it
is the most deck-dependent content in the tier.

### Tier 4 — Rules mastery

Substrate: `bank` throughout. Unblocked by L7. Engine used for demonstration only, and
only for interactions DuelCore actually implements.

| Unit | Skills |
|---|---|
| 4.1 Layers | layer-order, applying-in-sequence, characteristic-defining |
| 4.2 Timestamps and dependency | timestamp-order, dependency-test |
| 4.3 Replacement effects | replacement-vs-trigger, self-replacement, choosing-among-replacements |
| 4.4 Prevention effects | shields, prevention-vs-replacement |
| 4.5 Copy effects | copiable-values, copy-vs-clone |
| 4.6 Oddities | split-second-adjacent, weird-timing, known-corner-cases |

### Tier 5 — Judge prep

Substrate: `bank` throughout. No engine. Unblocked by L7, including policy-document
sourcing and version stamping.

| Unit | Skills |
|---|---|
| 5.1 Regular REL | philosophy, fixing-vs-penalty, when-to-back-up |
| 5.2 IPG basics | infraction-categories, penalty-levels, upgrade-paths |
| 5.3 Communication policy | free-info, derived-info, status-info |
| 5.4 Tournament shortcuts | common-shortcuts, breaking-a-shortcut, loops |
| 5.5 Exam drills | mixed-format-drill, timed-drill |

Content must not claim to be an official practice exam (roadmap 4.2). Every exercise here
carries a document name and effective date, and `learn:check` errors on a stale stamp.

---

## 5. Renumbering

Per roadmap 4.3, Unit 3.1 is a slice artifact sitting out of order. It is Tier 1 combat
content wearing a Tier 3 number.

| Was | Becomes | Note |
|---|---|---|
| Unit 1.1 "Lands and mana" | Unit 1.1 "Lands and mana" | Unchanged. |
| Unit 3.1 "Lethal this turn" | Unit 1.4 "Winning this turn" | Renamed and renumbered. |
| Exercise `3.1-01` .. `3.1-04` | `1.4-01` .. `1.4-04` | `id` changes, `stableId` does not. |

**What this is safe against and what it is not.**

Safe: saved progress. `stableId` was introduced in L1 precisely for this and is the save
key. A learner mid-way through the old Unit 3.1 keeps their records.

Not safe, and must change in the same prompt as the renumber:

- `tests/e2e/learn-slice.spec.ts` deep-links `3.1-02` and `3.1-04`.
- Any `?exercise=3.1-NN` link shared before the renumber will 404 into the default
  exercise. There is no redirect layer and building one for a pre-release app is not
  worth it.

New units 1.2 and 1.3 are new numbers, so they collide with nothing.

---

## 6. Open decision: what Tier 1 ships without

Applying L2's exit criterion strictly removes three things a beginner tutorial would
normally contain. This is recorded rather than decided, because it changes what the first
public release *is*.

**What falls out of Tier 1:**

| Content | Why it falls out |
|---|---|
| Card types (creature vs instant vs land) | `multiSelect` is cost-shaped and cannot ask it. |
| Turn structure | No phase-advance action in the runner. |
| Blocking | The runner models the learner as the attacker only. |

The roadmap's own rule sends all three to Tier 2, and section 4 places them there. The
consequence is that Tier 1 ships as **mana, casting, and attacking** and never names a
card type or walks a turn.

**The option not taken, and the recommendation.**

Generalizing `multiSelect` from its current `{lands, options, answer}` shape to a general
`{stem, options, answer}` pick-the-right-answers type would recover card types and the
digital-client skill without adding a third exercise type, and so without breaching L2b's
scope guard. It is a small change to `types.ts`, one renderer, and one theme-check family.
It does not touch the engine.

Recommendation: **do it, but not before the first release.** Tier 1 as scoped is coherent
and demonstrably shippable, and the DuelCore grading path is the thing the release exists
to validate. A general question type is content tooling, which is L6's business, and
pulling it forward trades a shippable release for a better one later. If it is pulled
forward anyway, it belongs in its own prompt before L2b authoring starts, not during.

What must not happen is Tier 1 shipping with an ungraded text page explaining card types.
Roadmap 4.4 is explicit: content that cannot be graded is not a lesson.

---

## 7. Runner defects found while drafting

Logged here because they are curriculum blockers, not bugs found during a bug hunt. Neither
is fixed by this document.

**LC-1. Player-targeted spells silently do nothing.**
Casting Lightning Bolt with no legal creature target, against an opponent at 3 life, is
accepted by `tryAction`. The card leaves hand, the stack resolves, and `o.life` is
unchanged. No rejection, no error.

Severity: this is worse than a missing capability. An author can write a burn-for-lethal
exercise, and `puzzleChecker` will correctly report `solvable: no legal line reaches the
goal` — but an author who writes it as a `wrongLines` entry gets a pass for the wrong
reason. Blocks Tier 2 unit 2.4 (`burn-for-lethal`).

Fix belongs in an L5 targeting slice, alongside the player-target work already noted in
`CLAUDE.md` under Player Targeting. Until then, no exercise at any tier may use a
player-targeted spell.

**LC-2. `TAP_LAND` cannot choose a colour.**
`tryAction` passes `mana: land.produces?.[0]`, so a dual land always produces its first
listed colour. Blocks any "which colour do you need" content and means dual lands must not
appear in Tier 1 exercises at all, since a learner tapping a Taiga expecting green would be
told they are wrong by an implementation detail.

Fix: `Step` gains an optional colour on `TAP_LAND`. Small, but it is runner work and
belongs in an L5 slice, not a content slice.

**Constraint on L2b authoring, until both are fixed:** basic lands only, no player-targeted
spells.

---

## 8. Change log

| Date | Change |
|---|---|
| 2026-09-18 | **Tier 1 content complete at 45 exercises.** Unit 1.4 filled (9 exercises, 2 new tags) and Unit 1.1 filled (4 exercises, no new tags). `tap-for-mana` fixed at one exercise, with the reasoning recorded. L2b exit criteria met. |
| 2026-09-18 | Unit 1.3 authored and built (9 exercises, 2 new tags). `1.4-04` moved to `1.3-01`, keeping `stableId` `3.1-04`. Unit 1.4 rescoped to 4 skills / 12 exercises. Fixed a false positive in the `units.test.ts` phantom-card check: card names that are whole-word substrings of longer names (Savannah inside Savannah Lions) flagged the shorter card every time. |
| 2026-09-18 | Unit 1.2 authored and built (12 exercises, 3 new tags). `cast-sequencing` dropped for overlapping `land-per-turn`; `pay-exact-mana` replaced it. **Correction:** `lethal-first-strike` and `lethal-trample` were wrongly marked green -- `units.test.ts` `BLOCKED_KEYWORDS` bans both. Moved to Tier 2; `lethal-flying-defender` replaces them in Unit 1.4. Section 2 gains the policy-constraint subsection. |
| 2026-09-18 | Created. L2 deliverable. Tier 1 fully specified at 16 skills / 48 exercises, all verified green. Tiers 2 to 5 named and substrate-tagged. Unit 2.8 placement decided. Renumber specified. LC-1 and LC-2 logged. |
