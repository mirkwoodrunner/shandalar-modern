# AI Combat Port Plan (Forge AiAttackController / AiBlockController / GameStateEvaluator)

Status: **scoping only** -- no code in this doc has been written against the engine. This
is the input for the next AI-focused Claude Code prompt(s). It is Part B of the
"Port Forge's Creature Evaluator + Scope Combat AI Port" batch (2026-07-02); Part A
(the creature-value scoring port, `evaluateCreatureValue()` in `AI.js`) is implemented
and documented in `docs/SYSTEMS.md` Section 6.10 and `docs/MECHANICS_INDEX.md`.

---

## 1. What Forge does

Card-Forge/forge (GPL-3.0) splits combat decision-making into three pieces, all much
larger than anything currently in this engine:

- **`AiAttackController.java`** (~1,781 lines) decides which creatures attack. It doesn't
  evaluate attackers independently -- it reasons about the *whole attacking group* at
  once: which combination of attackers maximizes expected value given the opponent's
  likely blocks, accounting for combat tricks the opponent might hold, alpha-strike
  (lethal) detection, and creatures that must/can't attack.
- **`AiBlockController.java`** (~1,378 lines) mirrors this for blocking: which combination
  of blockers (including *multiple blockers on one attacker* -- gang-blocking to kill a
  bigger creature) minimizes damage/loss, again reasoning about the group rather than
  attacker-by-attacker.
- **`simulation/GameStateEvaluator.java`** underlies both: it clones the live game state
  (`GameCopier`), forward-simulates combat to the damage step (applying first strike/double
  strike ordering, deathtouch, trample, etc.), and scores the resulting position. This is a
  deterministic, single-path lookahead -- clone, apply, score -- not a stochastic rollout.
  It's the mechanism that lets `AiAttackController`/`AiBlockController` compare "what if I
  attack with A+B+C" against "what if I attack with A+B" by actually computing the outcome
  rather than approximating it with heuristics.

This is architecturally distinct from this engine's `MCTS.js`, which is
**stochastic-rollout-based**: it plays out many randomized continuations via `duelReducer`
and averages outcomes (UCB1-allocated), and is currently gated to `aggression >= 0.9`
(KARAG only, per `AI_PROFILES` in `AI.js`) for the two-plan-comparison call site in
`planMain`. Forge's clone-and-simulate-to-damage-step approach is cheaper and exact for the
one step it targets (combat), but doesn't explore branching decision trees the way MCTS
rollouts do.

## 2. Gap analysis against current Shandalar combat AI

Current attacker/blocker decisions live entirely in `AI.js`:

**`planAttack(state, profile)`** (~line 897): a single per-attacker greedy pass over
untapped, non-summoning-sick creatures.
- `aggression >= 1.0` (KARAG): attacks with everything, no evaluation.
- Otherwise, for each candidate attacker independently: check if it's unblockable (flying,
  no opposing flyers -- the *only* evasion case checked, no menace/fear/reach cross-check);
  find the single best-power potential blocker; attack if the trade is favorable
  (kills the blocker and survives); otherwise, if `aggression >= 0.8`, ask `getBestMove`
  (MCTS) to compare "attack" vs. "pass" as an isolated two-candidate decision; otherwise
  fall back to a `Math.random() < aggression` coin-flip (already documented in
  `docs/SYSTEMS.md` Section 6.5 as a known, deliberate characteristic, not a hidden bug).
- **Gap:** no attacking-group reasoning at all. Each attacker is decided independently, so
  there's no way to model "the opponent has 2 blockers; if I attack with 3 creatures, at
  most 2 get blocked, so which 3 should I pick." No multi-attacker alpha-strike detection
  beyond `planBlock`'s own per-defender lethal check (which runs on the *other* side of the
  same combat, not from the attacker's perspective in `planAttack`). No accounting for
  combat tricks the defending player might hold.

**`planBlock(state, profile)`** (~line 975): a lethal-prevention pre-pass, then a
per-attacker greedy assignment.
- Pre-pass: if total incoming power >= AI's life, force chump-blocks starting with the
  highest-power attacker until the remaining damage drops below lethal.
- Lure: attackers with the Lure keyword force all able blockers onto them first.
- Per remaining attacker: pick the first valid blocker in priority order (favorable trade >
  survives > prevents-lethal-if-life-critical > chump if attacker power crosses a
  profile-dependent threshold).
- **Gap:** exactly one blocker per attacker, always. No gang-blocking (assigning two
  creatures to kill one big attacker survivably) even when the AI has the bodies to do it
  and gang-blocking would be correct. No consideration of first strike/double strike
  sequencing when picking a blocker (a blocker that would die to first-strike damage
  before dealing its own is scored the same as one that wouldn't). No use of
  `evaluateCreatureValue()` (Part A) in the trade comparisons -- trades are still raw
  power/toughness (`getPow`/`getTou`), so a blocker that's about to lose a keyword-rich
  creature in an even trade isn't valued differently from a vanilla one of the same P/T.

**What's missing relative to Forge, concretely:**
1. No holistic (whole-group) attacker selection -- decisions are per-creature, not
   per-combination.
2. No gang-blocking / multi-blocker assignment.
3. No forward-simulated combat-damage lookahead (Forge's `GameStateEvaluator`) anywhere in
   the attack/block path -- the one lookahead mechanism that exists (`MCTS.js`) is
   stochastic-rollout-based, gated to one profile, and only used for a binary "attack this
   creature or not" comparison, not group selection.
4. Trade evaluation in both functions uses raw power/toughness, not the new
   `evaluateCreatureValue()` scoring from Part A -- these two pieces (creature valuation,
   combat decision-making) are currently disconnected.

## 3. Proposed batch breakdown

Each batch below is independently testable and scoped as its own future Claude Code
prompt, following the same "one shared subsystem per batch" pattern already used for card
implementation batches:

1. **Batch: Attack decision scoring.** Replace `planAttack`'s per-creature greedy loop with
   group-aware attacker selection (evaluate candidate attacking subsets, not single
   creatures, against the defender's known blockers). Wire in `evaluateCreatureValue()` for
   trade comparisons instead of raw power/toughness. Does not require the simulation layer
   (batch 3) to land first -- can use the existing heuristic trade math, just applied to
   combinations instead of individuals.
2. **Batch: Block decision scoring.** Replace `planBlock`'s one-blocker-per-attacker
   assignment with combination-aware blocking, including gang-blocking when it's
   survivable and profitable. Reuse the existing lethal-prevention pre-pass and Lure
   handling (both are correct and don't need rework) as the outer shell; replace the inner
   per-attacker assignment loop.
3. **Batch: Simulation-based lookahead (`GameStateEvaluator`-equivalent).** New
   deterministic clone-and-simulate-to-damage-step evaluator, analogous to Forge's, that
   both of the above batches can call to score a candidate attack/block combination
   precisely (first strike/double strike ordering, deathtouch, trample overflow) instead of
   approximating with heuristics. This is the highest-complexity batch and the one most
   likely to need its own sub-batches (e.g. "damage-step simulation core" then "wire into
   attack scoring" then "wire into block scoring").
4. **Batch: Profile/gating integration.** Once batches 1-3 exist, decide (per the open
   question below) whether simulation-based lookahead extends to all profiles or stays
   scoped like current `MCTS.js` gating, and retire the `Math.random()` coin-flip path in
   `planAttack` for low-aggression profiles if the new decision logic makes it obsolete.

Recommended order: 1 and 2 can proceed in parallel or either-first (both are pure
heuristic-upgrade batches, no new subsystem). Batch 3 is the foundational, riskiest piece
and should be scoped as its own dedicated planning pass before implementation, given its
size in Forge (it's the piece `GameStateEvaluator.java` occupies alongside the two
1,000+-line controllers). Batch 4 depends on all three.

## 4. Open design questions (flagged, not resolved here)

- **Should simulation-based lookahead extend to all AI profiles, or stay gated the way
  `MCTS.js` currently is (one high-aggression profile)?** Forge doesn't gate
  `GameStateEvaluator` by profile -- it's used for every AI decision. This engine's existing
  precedent (`MCTS.js` at `aggression >= 0.9`) exists for a performance/complexity reason
  (turn-calculation budget, see `docs/SYSTEMS.md` Section 6.9 "Performance Constraint"),
  not a design reason. Whether a deterministic clone-and-simulate approach (cheaper per-call
  than MCTS rollouts, since it's one forward pass, not many randomized ones) can afford to
  run unconditionally for every profile is an open question for whoever picks up Batch 3.
- **Does Forge's clone-and-simulate pattern conflict with the "`AI.js` cannot mutate
  GameState" constraint?** No -- confirmed here so a future prompt doesn't have to
  re-derive it. Forge's simulation clones the state and mutates *the clone*, never the live
  game state, which is exactly the same shape as what `evaluateBoard`/`applyVirtualPlay`
  already do with virtual state in the existing multi-plan scoring path (`scoreTurnPlan`,
  ~line 724), and the same shape `MCTS.js`'s `rollout()` uses (deep-copied state, `duelReducer`
  applied to the copy). A `GameStateEvaluator`-equivalent for combat would follow this same
  established pattern: read-only with respect to the real `GameState`, only ever
  constructing and discarding scratch copies.
