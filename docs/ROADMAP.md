# Roadmap

_Last updated: 2026-06-25. This document changes at milestone boundaries, not per-sprint. `CURRENT_SPRINT.md` tracks active work; this tracks where that work is heading._

**Relationship to `gdd.md`:** `gdd.md` is retrospective — its Phase sections only get marked complete once work is built and validated. This document is prospective — open risks, sequencing bets, and decisions not yet made. The link runs one direction at a time: this roadmap can reference `gdd.md` sections for context (e.g. a layer-system milestone pointing at "3.2.5 Effect Resolver"), but `gdd.md` only gains a new entry once a milestone here actually ships — at that point the corresponding roadmap section becomes historical and should be trimmed or marked done, not left duplicated in both places.

## Where the project stands

The engine is mature: the layer system (`layers.js`) implements CR 613 continuous-effect ordering, `DuelCore.js` is the sole state mutator, combat, persistence, and the cast/activate flow are complete. The roguelike loop is built, not stubbed — `useOverworldController.js` already has quests, deliveries, dungeon traversal, world magic, and town conquest. The `gdd.md` Phases 1–7 are marked complete. `gdd.md` Phase 8 (stub elimination) is also now complete — see below.

**Update (2026-07-17):** the placeholder-stub backlog inside `src/data/cards.js` is fully cleared — every entry that exists in the file has a real effect implementation, zero `effect:"STUB"` remain (was 245, see the historical framing below). This closed the A1–A8 batch work as originally scoped. That is a narrower milestone than "the Alpha/Beta pool is complete," though: reconciling `cards.js` against the curated target list (`scryfall/Shandalar Cardpool.txt`, 901 names — the authoritative source; do not use `scryfall/shandalar-card-pool.json`, which has an unrelated contamination bug in its generation script, `scryfall/process-card-pool.js`) by normalized card name showed 299 cards absent as of 2026-07-17 — never stubbed, just missing.

**Update (2026-07-19) — A9 audit complete.** Re-ran the reconciliation: `cards.js`'s `CARD_DB` is 650 real card entries (not 616, not 617 — both numbers floating around were stale/wrong; a 703-count from an earlier pass was also wrong, caused by counting nested trigger/effect sub-objects that carry their own `id` field alongside the real top-level cards). Against the 901-card curated list, **258 cards are absent** — down from 299, because the intervening legendary-creature batches (Batch 1+2/3/4/Cleanup/Bugfixes) closed ~41 of them without anyone tracking it against A9.

Categorized all 258 by Forge-script ability pattern (`Card-Forge/forge`'s `forge-gui/res/cardsfolder/`, GPL-3.0, same source as prior Milestone A adaptations):

| Mechanic bucket | Cards | Engine infra status |
|---|---|---|
| Upkeep trigger | 21 | existing choke point (`switch (c.upkeep)`) |
| Damage prevention/redirect | 20 | existing (`turnState.damageShields`) |
| P/T pump / anthem | 16 | existing (`layers.js`) |
| Counters (misc types) | 13 | existing (free-form `c.counters[TYPE]`) |
| Walls / can't-attack restriction | 12 | existing |
| Destruction (single-target) | 11 | existing |
| Untap/Tap manipulation | 11 | existing (`tapPermanent()`) |
| Banding | 9 | existing (banding core, phases 1–3) |
| Mass destroy/sacrifice-all | 9 | existing |
| Tutor/zone-change (search, reanimate, bounce, mill) | 8 | existing (`zMove`) |
| Rampage | 7 | **not built** — needs a new trigger point, same gap flagged in the Premodern Milestone-E table |
| Type/color/text change | 7 | existing (layers.js Layer 3/4) |
| Mana ability/ritual | 7 | existing |
| Lifegain/loss | 5 | existing |
| Discard | 4 | existing (`discardCard()`) |
| Counter-magic/stack interaction | 4 | existing |
| Landwalk | 4 | existing |
| Protection/shroud | 3 | existing |
| Control-change/steal | 2 | existing (control-grant system) |
| Token creation | 1 | existing (`TOKEN_DB`/`createToken`) |
| Face-down (Illusionary Mask, sole pre-Morph oddity) | 1 | bespoke one-off, not worth general infra for 1 card |
| Uncategorized / bespoke one-offs | 83 | no shared infra either way — old Legends/Antiquities design is dense with unique one-shot text |

**Bottom line:** unlike a brand-new-subsystem backlog, almost all of A9 is per-card data
work against choke points that already exist — same conclusion the Milestone E
Premodern audit reached for that pool. The one real infrastructure gap is **Rampage
(7 cards)**, which needs a new combat trigger point regardless of which pool it's
scoped against. The 83 "uncategorized" cards are bespoke one-offs (typical for this
card era), not a hidden shared-mechanism opportunity.

Two minor footnotes: 7 cards in `cards.js` (Phantom Warrior, Glacial Wall, Stromgald
Cabal, Fyndhorn Elves, Dark Banishing, Consume Spirit, Lava Axe) aren't on the curated
901-card list at all — extras, not part of the target pool, not a bug. The full
per-card mechanic breakdown (which 258 cards fall in which bucket) is not persisted to
a file in the repo — re-derive via a fresh Forge cross-reference if needed for a
specific batch.

Historical framing (described the now-cleared 245-stub backlog, not the 299-card gap above): primary pool (`src/data/cards.js`) was 617 cards, 245 stubbed (~60% implemented) as of the 2026-05-08 stub audit. Premodern pool (`src/data/cardsPremodern.js`): 5,408 entries, effectively all unimplemented — this figure is unaffected by the update above.

Stub heat map (historical — described the now-cleared 245-stub backlog specifically, not the 299-card entirely-missing gap): upkeep triggers ~32, P/T pump ~30, ante ~27, text/color/type change ~23, untap/tap manipulation ~20, draw ~18, destruction ~18, damage prevention ~17, lifegain ~14, Walls ~11, discard ~10, landwalk ~9.

Because the project follows an event/listener architecture, the right unit of planning is the **shared subsystem**, not the individual card — one listener often unlocks a dozen stubs at once. That principle still applies to the 299-card gap; it just hasn't been re-run against it yet.

## Milestone A — Complete the Alpha/Beta card pool

The spine of the roadmap. Each batch is Scryfall-verified before any handler is written, per `CLAUDE.md`. Sequenced by shared machinery, not card rarity. See `gdd.md` §3.2.5 (Effect Resolver), §3.2.6 (Keyword Registry), and §3.3 (Card Database) for the existing implementation this milestone extends.

**Status note (2026-07-17):** A1–A8 below, as originally scoped against the 245-card stub backlog, are all complete (stub count: 0 as of 2026-07-16, see `gdd.md` Phase 8). Note that A7's four named ante cards (Contract from Below, Darkpact, Demonic Attorney, Jeweled Bird) turned out to have never been entered into `cards.js` at all — they were absent, not stubbed, so "A7 complete" here means the *stub* backlog under that heading is empty, not that those four specific cards exist. They're part of A9 below. Kept below for historical batch-shape reference; **A9 is the actual open work now.**

- ~~**A1. Finish the layer system.**~~ **DONE.** Layers 1–3 (copy, control, text change) implemented; Copy Artifact, Sleight of Mind, Magical Hack unblocked.
- ~~**A2. Damage prevention / replacement effects.**~~ **DONE.** Circles of Protection, Forcefield, Jade Monolith, etc. implemented.
- ~~**A3. Upkeep-trigger enchantments.**~~ **DONE.** Stasis and the upkeep-trigger family implemented.
- ~~**A4. Cast-triggered optional abilities.**~~ **DONE.** Sphere lifegain cycle implemented.
- ~~**A5. Untap/tap manipulation.**~~ **DONE.** Tap-centralization choke point (`tapPermanent()`) shipped, unlocked the Icy/Winter-pattern family.
- ~~**A6. Pump / combat tricks.**~~ **DONE.**
- ~~**A7. Ante cards.**~~ Stub backlog under this heading is empty. The four cards explicitly named here (Contract from Below, Darkpact, Demonic Attorney, Jeweled Bird) are absent from `cards.js` entirely — see A9.
- ~~**A8. Walls, landwalk, remaining one-offs.**~~ **DONE.**

- **A9. Close the entirely-missing-card gap.** 258 cards from the curated target list (`scryfall/Shandalar Cardpool.txt`) have no `cards.js` entry at all — not stubbed, absent (was 299 as of 2026-07-17; legendary-creature batches since then closed ~41 without tracking against this heading). Audit complete as of 2026-07-19 — see the mechanic heat map above. Batching is now in progress; the upkeep-trigger bucket (21 cards) is the first sub-batch scoped.

A1–A8 took roughly the originally-estimated 6–8 sprints. A9's audit is done (see above); its total size is now known (258 cards, 21 shared-mechanic buckets, one genuine infra gap in Rampage) but it is not yet sequenced into sprints.

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
- **mage-go pattern reference.** `docs/MAGE_GO_AI_REFERENCE.md` collects pattern-level notes (combat-solver enumeration strategy, Zobrist hashing, turn-plan replay) from `benprew/mage-go` (GPL-2.0, not license-compatible for code adaptation) to weigh when this milestone's combat-AI work is actually planned. Reference only -- not a batch plan.

## Milestone D — Loop polish

Construction is done; this is feel and balance. Reward/difficulty curves vs. distance from start, dungeon entity variety, ante stakes, world-magic balance, and Resume Duel v2 (checkpoint-gated loading — `LOAD_STATE` exists in the reducer but is currently dead code). Lower urgency than A–C, higher than premodern.

## Milestone E — Premodern fork (go/no-go decision point)

5,408 unimplemented entries at the current oracle-verified cadence is a multi-year track. **Recommendation: do not block 1.0 on this.** Ship a complete Alpha/Beta game first; treat premodern as a post-1.0 expansion, sequenced by set in original release order, reusing all Milestone A machinery and the same per-batch Scryfall verification rule.

**Forge coverage audit (2026-07-10).** Before this milestone is ever greenlit, the open question was how much of the 5,408-card pool is genuinely blocked on missing engine infrastructure versus just unwritten card handlers. Cross-referenced every Premodern card id against `Card-Forge/forge`'s `forge-gui/res/cardsfolder/` scripts (GPL-3.0, same source already used for Milestone A adaptations) using the exact slug rule from `tools/generate-premodern-pool.mjs`.

- **Script coverage: 5,408 / 5,408 (100%).** Every card has a matching Forge reference to adapt from. Zero misses.
- **Complexity distribution** (by ability-line count in the Forge script — a rough proxy, not a real effort measure): vanilla/keyword-only 466 (8.6%), simple/1-ability 3,960 (73.2%), moderate/2–4 abilities 973 (18.0%), complex/5+ abilities 9 (0.2%). The 9 complex outliers: Diabolic Servitude, Coffin Queen, Cromat, Duplicity, Gustha's Scepter, Krovikan Vampire, Morphling, Tek, Tribal Golem — plan these last regardless of which batch order is chosen below.
- **476 cards (8.8%) depend on one of 14 named mechanics absent from `src/data/keywords.js`** (current registry is Alpha/Beta-era: Flying, Trample, Banding, etc. — Banding's presence here cross-validated the audit method against Milestone A's completed banding work). Only one card, Feral Throwback, touches two of these mechanics at once (Amplify + Provoke), so the union below is close to a clean partition.

  | Mechanic | Cards | Build leverage |
  |---|---|---|
  | Shadow | 24 | Pure evasion keyword — same shape as Flying/Landwalk, one `canBlockDuel` check. Not really new infrastructure. |
  | Kicker | 64 | Optional additional cost at cast, stored as a flag on the stack item — same shape as the existing `xVal` field. |
  | Buyback | 28 | Same stack-item-flag shape as Kicker; build both together. |
  | Echo | 34 | Pay-or-sacrifice at upkeep — `pendingUpkeepChoice`/`handlerKey` registry (`upkeepChoiceRegistry.tsx`) already exists and is explicitly designed for new entries. |
  | Fading | 17 | Same upkeep-choice registry as Echo; build both together. |
  | Flanking | 17 | Needs a `ON_BLOCKS_DECLARED`-style trigger, same shape as the existing `ON_ATTACKS_DECLARED` (just extended for Raging River). |
  | Rampage | 9 | Same new trigger point as Flanking; build both together. |
  | Provoke | 8 | Forced-block flag + attack trigger with opponent-creature targeting. `MUST_ATTACK`'s auto-enforcement-at-phase-transition is a structural analog (reverse polarity), not directly reusable code. |
  | Amplify | 9 | Contained ETB reveal-and-count effect. No blocker identified. |
  | Cycling | 97 | Confirmed gap: `ACTIVATE_ABILITY` (`DuelCore.js` ~L6834-6840) does `s[w].bf.find()` — battlefield sources only, no hand-zone activation exists. Highest count in this tier. |
  | Flashback | 52 | Confirmed gap: no cast-from-graveyard path exists anywhere in `DuelCore.js`. |
  | Storm | 12 | Confirmed gap: no spell-copy mechanism exists; also needs a trivial spells-cast-this-turn counter. The copy mechanism is the real cost. |
  | Morph | 94 | Largest lift on the list — hidden face-down permanent state, a true identity tracked separately from public battlefield state. No existing precedent. Highest count among the "genuinely novel" tier. |
  | Phasing | 12 | Already flagged elsewhere as a from-scratch subsystem (see Oubliette in the primary-pool stub backlog). Lowest count of the hard tier — correctly last. |

- **Suggested build order by leverage, not by card count:** Shadow → Kicker/Buyback → Echo/Fading → Flanking/Rampage → Provoke → Amplify → Cycling → Flashback → Storm → Morph → Phasing. This clears the 476-card mechanic backlog spending the expensive, precedent-free subsystem work (Morph, Storm, Phasing) last, and in card-count order among themselves.
- **Bottom line for the go/no-go decision:** 91.2% of the pool (4,932 cards) needs no new infrastructure at all — same per-card handler effort as Milestone A, just at 10x the volume. The 8.8% mechanic tail is what actually gates full completion, and it decomposes into a short, ordered list rather than one undifferentiated wall of unknown scope.

## Cross-cutting (run throughout, not separate milestones)

- **Parity tax.** Every duel-facing change mirrors to `DuelScreen.tsx` and `DuelScreenMobile.tsx`. Budget this into every A/C batch, not as separate work.
- **Doc/process overhead.** The tiered doc policy and engine-guard/parity/encoding hooks add real per-prompt cost. Budget for it.

## Suggested sequencing

**Status note (2026-07-17):** steps 1–5 below describe the original A1–A8 sequencing plan.
In practice, A1–A8 were completed first (2026-06-25 through 2026-07-16) without the seeded-RNG
prerequisite step being done first, which the plan had explicitly flagged as a risk. That risk
didn't materialize into a known regression, but Milestone B (seeded RNG) is still fully open —
see below. Kept for historical reference; the real next-step decision is B vs. C vs. D vs. A9
(the entirely-missing-card gap), not this list.

1. ~~Seeded-RNG design spike + A4 (sphere cycle) as a low-risk cadence-starter while the spike is reviewed.~~
2. ~~Implement seeded RNG + overworld seed hook, then A1 (layer completion).~~ (Seeded RNG was not done; A1 was.)
3. ~~A2 (damage prevention), A3 (upkeep triggers), A5 (untap)~~ — all done.
4. ~~A6 (pumps), A8 (one-offs)~~ — done. Milestone C defender-block fix — still open.
5. A7 (ante) — stub backlog empty, but see A9. Milestone D loop polish — still open.
6. Premodern go/no-go — audit done (see Milestone E), decision still open.
7. **A9 (entirely-missing-card gap)** — audited 2026-07-19 (258 cards, heat map above); batching now underway starting with the upkeep-trigger bucket. Still not sequenced against B/C/D as a milestone-level priority call.

## Graduation rule

When a milestone here ships, add a new Phase entry to `gdd.md` (following its existing "Phase N — Complete" pattern) describing what was built. Then trim or mark this roadmap's corresponding section as done rather than leaving the same information live in both documents.

## Open decisions gating this plan

1. Commit to the seeded-RNG refactor before deep card work, or defer it? (Recommendation: commit now — random surface only grows with more cards.)
2. Where does the 1.0 line sit relative to premodern? (Recommendation: complete Alpha/Beta only.)
