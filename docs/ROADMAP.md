# Roadmap

_Last updated: 2026-06-25. This document changes at milestone boundaries, not per-sprint. `CURRENT_SPRINT.md` tracks active work; this tracks where that work is heading._

**Relationship to `gdd.md`:** `gdd.md` is retrospective — its Phase sections only get marked complete once work is built and validated. This document is prospective — open risks, sequencing bets, and decisions not yet made. The link runs one direction at a time: this roadmap can reference `gdd.md` sections for context (e.g. a layer-system milestone pointing at "3.2.5 Effect Resolver"), but `gdd.md` only gains a new entry once a milestone here actually ships — at that point the corresponding roadmap section becomes historical and should be trimmed or marked done, not left duplicated in both places.

## Where the project stands

The engine is mature: the layer system (`layers.js`) implements CR 613 continuous-effect ordering, `DuelCore.js` is the sole state mutator, combat, persistence, and the cast/activate flow are complete. The roguelike loop is built, not stubbed — `useOverworldController.js` already has quests, deliveries, dungeon traversal, world magic, and town conquest. The `gdd.md` Phases 1–7 are marked complete.

The remaining work is concentrated in **card content**, not architecture. Primary pool (`src/data/cards.js`): 617 cards, 245 stubbed (~60% implemented). Premodern pool (`src/data/cardsPremodern.js`): 5,408 entries, effectively all unimplemented.

Stub heat map (primary pool, mechanics overlap so counts aren't mutually exclusive): upkeep triggers ~32, P/T pump ~30, ante ~27, text/color/type change ~23, untap/tap manipulation ~20, draw ~18, destruction ~18, damage prevention ~17, lifegain ~14, Walls ~11, discard ~10, landwalk ~9.

Because the project follows an event/listener architecture, the right unit of planning is the **shared subsystem**, not the individual card — one listener often unlocks a dozen stubs at once.

## Milestone A — Complete the Alpha/Beta card pool

The spine of the roadmap. Each batch is Scryfall-verified before any handler is written, per `CLAUDE.md`. Sequenced by shared machinery, not card rarity. See `gdd.md` §3.2.5 (Effect Resolver), §3.2.6 (Keyword Registry), and §3.3 (Card Database) for the existing implementation this milestone extends.

- **A1. Finish the layer system.** `layers.js` implements layers 4–7 (type, color, ability, P/T). Layers 1–3 (copy, control, text change) are explicit stubs that pass input through unchanged. Blocks Copy Artifact, Sleight of Mind, Magical Hack. Touches the characteristic-computation core — requires the engine-edit override phrase. High risk, foundational, do first.
- **A2. Damage prevention / replacement effects.** One reusable "next time a source would deal damage" listener covers the six Circles of Protection, Reverse Damage, Forcefield, Conservator, Guardian Angel, Jade Monolith (~11–17 cards). Medium risk: modeling replacement effects cleanly under the event system rather than as special cases.
- **A3. Upkeep-trigger enchantments.** Largest single family (~32). Stasis, Gloom, Conversion, Farmstead, Power Leak, Feedback, and "sacrifice unless you pay" cards. Needs a robust upkeep-trigger + optional-cost listener.
- **A4. Cast-triggered optional abilities.** Sphere lifegain cycle (Crystal Rod, Iron Star, Ivory Cup, Wooden Sphere). Establishes a spell-cast trigger with an optional pay that other cards reuse. Low risk — good early-cadence batch.
- **A5. Untap/tap manipulation.** ~20 cards, overlaps with Stasis-style effects (Icy/Winter pattern). Some depend on skip-step and "doesn't untap" hooks.
- **A6. Pump / combat tricks.** ~30 cards, many auras or end-of-turn buffs that may already be partially supported by the existing layer 7c / eotBuff path — verify what's truly stubbed vs. partially wired before scoping.
- **A7. Ante cards.** ~27, gated by the ante toggle and "remove from deck if not playing for ante" rule (Contract from Below, Darkpact, Demonic Attorney, Jeweled Bird).
- **A8. Walls, landwalk, remaining one-offs.** Cleaned up last, once shared machinery from A1–A7 exists.

Estimated 6–8 sprints, front-loaded by A1 and A2.

## Milestone B — Determinism backbone

Bounded, not vague debt. Gameplay-critical `Math.random()` sites as of 2026-06-25:
- Deck shuffle: `DuelCore.js` (lines ~23, ~690), `cardHandlers.js` (~line 93)
- Random discard from opponent hand: `DuelCore.js` (~lines 665, 674) — Mind Twist/Hymn-style effects
- Random target selection: `DuelCore.js` (~line 2165)
- AI aggression roll: `AI.js` (~line 898)
- Id generation: `DuelCore.js` (~line 18)

Plan: a seeded generator stored in `GameState`, advanced by a call counter (pure, serializable), seeded at duel start from an overworld seed. This unifies deterministic replay, reproducible bug reports, and an overworld seed hook — which also unblocks the castle-encounter Playwright spec that has twice ejected for lack of a deterministic entry point. Touches `DuelCore.js` — requires the engine-edit override. Do this as a design spike before deep A-series work so later batches build on the seeded path rather than getting retrofitted.

**Sequencing risk:** A1 and B both touch `DuelCore.js`/the characteristic core. Do not run them in the same sprint — they will contend for the same files and override gate.

## Milestone C — AI depth

See `gdd.md` §3.2.9 (AI Engine) and §3.4 (AI Archetypes) for the existing implementation.

**Status note (2026-07-02):** one piece of this milestone -- the creature-evaluator port -- was pulled forward and completed ahead of Milestone A finishing (Milestone A card-pool completion remains the roadmap's stated priority; this was a deliberate, flagged, self-contained exception, not a resequencing of the milestone order below). `AI.js`'s per-creature board scoring now uses a keyword-aware `evaluateCreatureValue()` ported from Card-Forge/forge's `CreatureEvaluator.java`, replacing the old flat power sum. See `docs/SYSTEMS.md` Section 6.10 and `docs/MECHANICS_INDEX.md` -- Feature: Creature Evaluator Port. Per the graduation rule below, this item is done; the remaining Milestone C items are still open. The much larger attack/block-decision and simulation-based lookahead port (Forge's `AiAttackController`/`AiBlockController`/`GameStateEvaluator`) is scoped but **not implemented** -- see `docs/AI_COMBAT_PORT_PLAN.md` for the batch breakdown and open design questions.

- ~~**Creature evaluator port.**~~ **DONE** (2026-07-02, pulled forward). See above.
- **Resolve the AI-defender blocking question.** The AI driver effect requires the AI to be the active player; when the human attacks, the path where the AI declares blocks while defending has not been traced. Confirm it works before assuming it does.
- **Revisit MCTS scope.** Currently gated to one high-aggression profile. Reassess now that castle fights route to real `BOSS_*` decks.
- **Retune boss/archetype decks** now that castle routing sends real boss decks instead of generic archetypes.
- **Combat AI port (attack/block decisions + simulation-based lookahead).** Scoped in `docs/AI_COMBAT_PORT_PLAN.md`, not yet batched into sprint work.

## Milestone D — Loop polish

Construction is done; this is feel and balance. Reward/difficulty curves vs. distance from start, dungeon entity variety, ante stakes, world-magic balance, and Resume Duel v2 (checkpoint-gated loading — `LOAD_STATE` exists in the reducer but is currently dead code). Lower urgency than A–C, higher than premodern.

## Milestone E — Premodern fork (go/no-go decision point)

5,408 unimplemented entries at the current oracle-verified cadence is a multi-year track. **Recommendation: do not block 1.0 on this.** Ship a complete Alpha/Beta game first; treat premodern as a post-1.0 expansion, sequenced by set in original release order, reusing all Milestone A machinery and the same per-batch Scryfall verification rule.

## Cross-cutting (run throughout, not separate milestones)

- **Parity tax.** Every duel-facing change mirrors to `DuelScreen.tsx` and `DuelScreenMobile.tsx`. Budget this into every A/C batch, not as separate work.
- **Doc/process overhead.** The tiered doc policy and engine-guard/parity/encoding hooks add real per-prompt cost. Budget for it.

## Suggested sequencing

1. Seeded-RNG design spike + A4 (sphere cycle) as a low-risk cadence-starter while the spike is reviewed.
2. Implement seeded RNG + overworld seed hook, then A1 (layer completion).
3. A2 (damage prevention), A3 (upkeep triggers), A5 (untap) — overworld seed hook now unblocks their E2E.
4. A6 (pumps), A8 (one-offs), Milestone C defender-block fix.
5. A7 (ante), Milestone D loop polish.
6. Premodern go/no-go.

## Graduation rule

When a milestone here ships, add a new Phase entry to `gdd.md` (following its existing "Phase N — Complete" pattern) describing what was built. Then trim or mark this roadmap's corresponding section as done rather than leaving the same information live in both documents.

## Open decisions gating this plan

1. Commit to the seeded-RNG refactor before deep card work, or defer it? (Recommendation: commit now — random surface only grows with more cards.)
2. Where does the 1.0 line sit relative to premodern? (Recommendation: complete Alpha/Beta only.)
