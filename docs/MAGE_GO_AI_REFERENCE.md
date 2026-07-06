# mage-go AI Architecture -- Reference Notes for Milestone C

Source: `github.com/benprew/mage-go`, the rules engine behind `github.com/benprew/s30`.
Verified by reading the actual `pkg/mage/interactive/ai/` and
`pkg/mage/interactive/ai/combatsolver/` source, not the README.

**License status: GPL-2.0-only, Go.** Not compatible with our GPL-3.0-or-later license
for code adaptation, and the language is different anyway. Everything below is
pattern-level reference for planning Milestone C. Nothing here should be copied or
ported. If a specific technique ever gets close to "reuse their exact formula," that
needs an actual licensing conversation first, not an assumption.

This is a reference/research note, not a spec or a batch plan -- see "Where this doc
lives" at the bottom for why it's filed here.

---

## Two coexisting AI strategies

`heuristic.New()` (weighted single-position evaluation) and `search.New()` (full-turn
minimax). Both are wired up and selectable, not one live and one abandoned.

## Search package (`pkg/mage/interactive/ai/search`)

- Full-turn minimax unifying priority actions, attacker declarations, and blocker
  assignments into one search, rather than three separate decision points.
- Default limits: depth 10, 20,000 nodes, 1500ms time budget. Time-bounded cutoff
  implies iterative deepening.
- Zobrist hashing + transposition table for position memoization. Two hash components
  are MTG-specific and worth remembering: `SideToMove` (without it, two identical
  boards with different players to act would collide and return the wrong player's
  score) and `ChainCount` (without it, two nodes mid-way through a multi-spell chain
  within one priority window would collide despite having different move budgets
  remaining).
- Move ordering has a deliberate tie-break: on equal scores, "take an action" beats
  "pass." The code comments explain why -- without it, "cast bolt for lethal now" and
  "pass, then cast bolt for lethal later" score identically, and the naive ordering
  picks pass, which then delays a lethal line into a phase where the strategy adapter
  filters it out and returns Pass instead.
- Turn-plan replay: the strategy caches a full turn's planned move sequence keyed by
  game state, then replays cached moves across later phases in the same turn instead
  of re-searching, only falling back to a fresh search when the actual state diverges
  from the plan.

## Combat solver (`pkg/mage/interactive/ai/combatsolver`)

Deliberately split out from the general search, with no import dependency on the `ai`
package, specifically to avoid import cycles and keep combat math isolated.

Staged minimax that mirrors the real MTG combat priority structure:

1. Attacker picks attacker subset A (maximizing)
2. Defender picks blocks B*(A) (maximizing defender's eval, i.e. minimizing attacker's)
3. Attacker picks trick/ability response R*(A,B) (maximizing) -- not yet implemented,
   tracked as a future phase
4. Damage resolves, leaf position is scored

First strike / double strike is handled by running the trick-response layer twice: once
before first-strike damage, once before normal damage.

Explicitly documented scope limits: does not model unknown cards in the opponent's
hand (flagged as a later phase), but does model the opponent's known activated
abilities, including ones with hand-cost components like cycling or discard-to-buff.

**Enumeration strategy** (this is the actually reusable idea): rather than
brute-forcing every attacker subset, it builds a small representative candidate set --
none, all, each single attacker, all-evasive, all-but-one (for 3-8 eligible attackers),
top-half-by-eval (for >3 attackers) -- and only falls back to a true powerset when
eligible attackers <= 5. Blocker assignment uses a similar mix: greedy assignment,
"gang-block-the-biggest-threat," and full permutation enumeration with dedup. The
point is bounding a combinatorially explosive decision without giving up correctness
on the common cases.

## Personality-driven evaluation

`WeightedPersonality` uses continuous 0-1 weights (aggression, block threshold,
hold-instants, target-face, curve-preference) that feed directly into leaf evaluation.
This replaced an older discrete boolean `Personality` struct. Same general shape as our
aggression-keyed profiles (DELENIA, XYLOS, MORTIS, KARAG, SYLVARA, ARZAKON), but their
weights tune evaluation scoring, not a gate on which search method runs. Ours currently
uses aggression as an on/off gate for MCTS (KARAG only, >= 0.9); theirs uses it as a
continuous scoring input regardless of which strategy is active.

## What's actually worth weighing for Milestone C

Flagging these as options to evaluate when that work starts, not decisions:

1. A combat-specific solver, split from general search the way theirs is, could give
   MORTIS/ARZAKON a cheaper, deterministic attack/block decision without invoking full
   MCTS, if the current gating (MCTS only above 0.9 aggression) is leaving
   weaker-but-costly heuristics for everyone else.
2. Turn-plan replay/caching is a real technique for cutting repeated search cost across
   a multi-step priority window in one turn, if MCTS rollouts turn out to be a
   performance problem at aggression >= 0.9.
3. The enumerate-representative-subsets-then-fallback-to-powerset pattern is a
   concrete, testable way to bound attacker/blocker search space instead of
   brute-forcing 2^n every time.
4. If state memoization is ever added to MCTS rollouts, their Zobrist hash design is a
   reminder of the MTG-specific collision cases (side to move, in-progress chain
   state) that a naive board-only hash would miss.

## Not relevant, don't reuse

- Their engine internals (Go structs, `GameMutator` interface) -- different language,
  different license, no code path to reuse even at the "close paraphrase" level.
- Their strategy-selection mechanism is a CLI flag for a terminal client. Doesn't map
  onto a browser AI-profile system already built around per-profile aggression
  thresholds.

## Relationship to `docs/AI_COMBAT_PORT_PLAN.md`

That doc scopes an actual planned port (Forge's `AiAttackController` /
`AiBlockController` / `GameStateEvaluator`, GPL-3.0, license-compatible). This doc is
reference-only -- a different upstream project (mage-go, GPL-2.0, license-incompatible)
being mined for design ideas, not code. When Milestone C combat-AI work is actually
batched, `AI_COMBAT_PORT_PLAN.md` is the plan; this doc is background reading, not an
alternate or competing plan.

## Where this doc lives

No existing tier in `CLAUDE.md`'s doc policy (Tier 1/2/3) fits a forward-looking
research note about a project we are not porting code from. This is filed as a
standalone top-level `docs/` file, following the precedent of
`docs/AI_COMBAT_PORT_PLAN.md` (also a standalone scoping doc outside the Tier 1/2/3
cadence). It is cross-referenced from `docs/ROADMAP.md` Milestone C alongside that doc.
If a `docs/research/` directory is ever introduced for other externally-sourced
reference material, this file can move there without changing its content.
