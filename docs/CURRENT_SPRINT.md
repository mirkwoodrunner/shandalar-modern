# Current Sprint — 2026-06-25

## Focus (priority order)

## Up Next (backlog, not scheduled)
- Premodern card effect handlers -- ongoing batched track. Scryfall oracle verification required per batch. Continue the Batch 1A/1B cadence.
- **Resume duel v2** (future): Checkpoint-gated resume -- only safe to load when `stack.length === 0` and phase is in a safe set (MAIN_1, MAIN_2). Requires `LOAD_STATE` reducer (currently dead code) and a gated modal.
- Roadmap Milestone A remaining: A2, A3, A5+ batches.
- Milestone C combat-AI port (`docs/AI_COMBAT_PORT_PLAN.md`) -- not yet batched. `docs/MAGE_GO_AI_REFERENCE.md` has pattern-level notes (not portable code, different license) to weigh when this is planned.

## Completed (2026-07-11)
- **Discard Centralization Phase 1** -- all 14 ad hoc hand-to-gy discard
  mutation sites in `DuelCore.js` now route through a single new choke
  point, `discardCard(state, who, iid, opts)`, mirroring the shipped
  `tapPermanent`/`ON_TAP` pattern: a `DISCARD_REPLACEMENTS` registry pass
  (keyed by permanent card id, Forge's CR 614.5 intercept-before-mutate
  model) runs before the mutation, then a new `ON_DISCARD` event is emitted
  and immediately followed by `processTriggerQueue`. `opts.cause` is
  required (`'effect' | 'cost' | 'gameRule'`) and throws if missing/invalid;
  not-found-in-hand is a runtime no-op (`console.error` + unchanged state),
  matching `tapPermanent`'s philosophy. `discardCard` adds no dlog of its
  own -- every migrated site kept its existing site-specific dlog call
  verbatim. Pure refactor, no card behavior changes: Bazaar of Baghdad,
  Jalum Tome, Sindbad, Mind Twist (`discardX`), Rag Man/Disrupting Scepter
  (`discardOne`), Wheel of Fortune, Balance, Amnesia (`discardAllNonland`),
  Contract from Below, Mishra's War Machine upkeep (both branches), Mind
  Bomb, the CLEANUP hand-size while-loop, and Jandor's Ring
  (`discardLastDrawn` as cost) all now share the one choke point.
  `DISCARD_REPLACEMENTS` ships EMPTY this phase -- inert infrastructure,
  no production consumers yet. Stub count: unchanged at 9. Tests: 24 Vitest
  (`tests/scenarios/discard-centralization.test.js`), 4 Playwright
  (`tests/e2e/discard-centralization.spec.ts`, both viewports). Phase 2
  (Library of Leng as the first `DISCARD_REPLACEMENTS` consumer) and Phase 3
  (additional-cost cast-flow rollback) are not built here. See
  `docs/ENGINE_CONTRACT_SPEC.md` S7.7 and `docs/MECHANICS_INDEX.md` --
  Discard Centralization Phase 1.
- **Library of Leng Phase 2** -- unstubbed Library of Leng as the first
  production `DISCARD_REPLACEMENTS` consumer. No maximum hand size: the
  CLEANUP hand-size while-loop now compares against `Infinity` instead of
  `ruleset.maxHandSize` whenever the active player controls Library of Leng.
  Effect discards: `DISCARD_REPLACEMENTS['library_of_leng']` performs the
  normal hand-to-gy discard and `ON_DISCARD` emission (graveyard-first,
  retroactive-lift simplification -- the discard is never suspended), then
  offers a `discardToLibraryChoice` to lift the card from the graveyard to
  the top of the library. A single `pendingChoice` chains multi-card
  discards (Wheel of Fortune, Mind Bomb) one card at a time via
  `queuedIids`; a collision with an unrelated pending choice degrades to
  `console.error` + graveyard rather than overwriting it (unreachable
  today). New AI policy `chooseDiscardToLibrary` in `AI.js` (same shape as
  `chooseBandingDamageOrder`), dispatched from `useDuelController.ts` ahead
  of the `pay_gggg` fallback. Stub count: 9 -> 8. Tests: 16 Vitest
  (`tests/scenarios/library-of-leng.test.js`), 4 Playwright
  (`tests/e2e/library-of-leng.spec.ts`, both viewports). See
  `docs/ENGINE_CONTRACT_SPEC.md` S7.7.1 and `docs/MECHANICS_INDEX.md` --
  Library of Leng Phase 2.

## Completed (2026-07-10)
- **Tap Centralization Phase 1 + Relic Bind, Blight, Psychic Venom** -- all 28
  ad hoc "becomes tapped" mutation sites in `DuelCore.js` now route through a
  single new choke point, `tapPermanent(state, who, iid)`, which emits a new
  `ON_TAP` event (CR 701.21) after the mutation and no-ops safely if the
  permanent is already tapped or not found. `tapPermanent` pairs its
  `emitEvent` call with an immediate `processTriggerQueue` (matching every
  other emitEvent call site in the file) so ON_TAP-triggered effects resolve
  at the moment of tapping rather than sitting queued. New
  `enchantedHostTapped` condition in `evaluateCondition` restricts a Kudzu-
  style Aura's ON_TAP trigger to firing only for its own specific host.
  Unstubs three previously-STUB cards: Blight (destroys its enchanted land
  when tapped, one-time), Psychic Venom (2 damage to enchanted land's
  controller on tap, repeatable), Relic Bind (modal 1-damage-or-1-lifegain
  choice on enchanted-opponent-artifact tap, via the existing
  `requiresChoice` triggered-ability infrastructure). Stub count: 15 -> 12.
  Also fixed a real, confirmed infra gap found during implementation: there
  is no general SBA sweep for orphaned Kudzu-style Auras (a Kudzu-style Aura
  whose host permanent has died) -- Kudzu and Living Artifact each already
  handle this reactively via their own `upkeep` case. Blight/Psychic
  Venom/Relic Bind now do the same via two small new shared upkeep cases,
  `kudzuStyleLandOrphanCheck`/`kudzuStyleArtifactOrphanCheck`. Tests: 30
  Vitest (`tests/scenarios/tap-centralization.test.js`,
  `tests/scenarios/relic-bind-blight-psychic-venom.test.js`), 6 Playwright
  (`tests/e2e/tap-triggered-auras.spec.ts`, both viewports). Phase 2 (ability
  activated without {T} in its cost, needed by Artifact Possession, Haunting
  Wind, Powerleech) shipped separately the same day -- see below. See
  `docs/ENGINE_CONTRACT_SPEC.md` S7.5 and `docs/MECHANICS_INDEX.md` --
  Tap Centralization Phase 1.
- **Tap Centralization Phase 2 + Artifact Possession, Haunting Wind,
  Powerleech** -- completes the tap-centralization project. New
  `ON_ABILITY_ACTIVATED_NO_TAP` event, emitted from the `ACTIVATE_ABILITY`
  `addMana` branch and the generic "1. Tap cost" step whenever an ability's
  cost has no `{T}`, paired with an immediate `processTriggerQueue` (same
  convention as `ON_TAP`). Deliberately not emitted from the
  `activatedAbilities`-array path (Mishra's Factory, Desert, Wormwood
  Treefolk) -- none are artifacts, out of scope for this batch. Two new
  `evaluateCondition` types, `affectedPermanentIsArtifact` (Haunting Wind) and
  `affectedPermanentIsOpponentArtifact` (Powerleech), look up the affected
  permanent live on the battlefield rather than tracking a host (both cards
  are plain Enchantments, not Auras). Artifact Possession reuses Phase 1's
  `enchantedHostTapped` condition unchanged for its new trigger. Unstubs
  Artifact Possession (2 damage to enchanted artifact's controller, Kudzu-
  style Aura), Haunting Wind (1 damage to any tapped/activated artifact's
  controller, unrestricted), and Powerleech (1 life gain, opponent-artifacts
  only). Stub count: 12 -> 9. Tests: 20 Vitest
  (`tests/scenarios/artifact-possession-haunting-wind-powerleech.test.js`), 6
  Playwright (`tests/e2e/no-tap-activation-auras.spec.ts`, both viewports).
  Tap centralization (Phases 1 and 2) is now fully complete -- no further
  phases remain open. See `docs/ENGINE_CONTRACT_SPEC.md` S7.6 and
  `docs/MECHANICS_INDEX.md` -- Tap Centralization Phase 2.
- **Emblem infrastructure + Titania's Song + Cyclopean Tomb** -- new shared
  `state.p/o.emblems` mechanism for "this effect continues after its source
  leaves the battlefield" cards, hooked into `layers.js collectEffects`
  (Layer 4/6/7a), `computeCharacteristics` (Layer 6 ability wipe),
  `DuelCore.js emitEvent`/`resolveTrigger` (emblem-sourced triggered
  abilities), and the `PHASE.CLEANUP` sweep (`endOfTurn`-duration emblems
  expire and force a `recomputeTypeEffects` rebake; `permanent`-duration
  emblems persist). Unstubs Titania's Song (noncreature artifacts become
  artifact creatures with power/toughness equal to mana value, losing all
  abilities; effect persists until end of turn if the enchantment leaves)
  and Cyclopean Tomb (mires a target land into a Swamp; on death, its
  emblem removes mire counters one land per upkeep for the rest of the
  game). Reused three existing mechanisms instead of adding new ones:
  the `myUpkeepOnly` activation gate (Gate to Phyrexia/Life Chisel) for
  Cyclopean Tomb's "activate only during your upkeep," the
  `destinationIsGY` condition (Lich) for its "put into a graveyard from
  the battlefield" trigger, and the existing `globalTypeEffect`/step 14
  Living Lands-style pipeline for Titania's Song's on-battlefield static
  ability. One correctness note: a mired land's Swamp subtype folds into
  the same `landTypeOverride` mechanism Evil Presence already uses, so it
  also gains the intrinsic Swamp mana ability -- not a "subtype only, no
  mana ability" simplification. Stub count 17 -> 15. Tests: 34 Vitest
  (`tests/scenarios/emblem-infrastructure.test.js`,
  `titanias-song.test.js`, `cyclopean-tomb.test.js`), 8 Playwright cases
  across 2 spec files x 2 viewports (`tests/e2e/titanias-song.spec.ts`,
  `cyclopean-tomb.spec.ts`). See `docs/MECHANICS_INDEX.md` -- Emblem
  Infrastructure / Titania's Song / Cyclopean Tomb.

## Completed (2026-07-09)
- **Fatal AI Error Silent Hang (fail-fast hardening)** -- Neither of
  `useDuelController.ts`'s two `aiDecide()` call sites (the "AI priority
  window effect" and the AI main-loop heuristic path) had any error handling,
  and the app has no ErrorBoundary, so an uncaught throw there died silently
  -- the confirmed mechanism behind a reported bug where "End Turn" left the
  button stuck on "Ending Turn..." forever with no visible error. Both call
  sites now wrap `aiDecide()`/the dispatch that follows it in a try/catch;
  on error, `reportFatalAiError()` logs full context and sets a new
  `fatalError` state, rendered as a blocking `EngineErrorOverlay` (new file,
  `src/ui/duel/EngineErrorOverlay.tsx`) on both `DuelScreen.tsx` and
  `DuelScreenMobile.tsx`, with a debug-info copy button and a guaranteed
  "Exit to Overworld" (forfeit) way out. Root cause of the original crash is
  still unconfirmed -- this hardens the symptom (silent hang) regardless of
  what eventually throws. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Fatal AI
  Error Silent Hang.
- **Dual land subtype + first-strike log gating + FieldCard P/T display fix** --
  Three fixes from a single bug report (Goblin King + Goblin Hero attacking into
  Badlands defense): (1) Added `subtype` field to all 9 ABUR dual lands (Tundra,
  Underground Sea, Badlands, Taiga, Savannah, Scrubland, Bayou, Plateau,
  Tropical Island) that were missing it, leaving only Volcanic Island already
  correct. Fixes mountainwalk, islandwalk, swampwalk, forestwalk, plainswalk
  silently never triggering. (2) Gated the "First strike damage." log line in
  `resolveCombat()` to only fire when at least one combatant actually has first
  strike, stopping misleading combat-never-happened log entries. (3) Threaded
  duel `state` prop through both FieldCard components (desktop + mobile) so
  battlefield tiles now display full-state P/T (layers 7a-7c: CDAs, animated-land
  P/T, lord/anthem effects like Goblin King) instead of the old no-state
  approximation that only saw eotBuffs + counters. Stub count unchanged (all
  cards involved are implemented, not stubs). Tests: 3 Vitest scenario tests
  (dual lands data + lord-granted mountainwalk blocking), 2 Vitest combat-damage
  tests (first-strike log gating), 3 Playwright e2e tests (Goblin King anthem
  P/T display + mountainwalk blocking with/without Badlands), plus 1 existing
  Playwright test (FS-E2E-02) assertion enhanced to verify no first-strike log
  when nobody has it. See `docs/MECHANICS_INDEX.md` Layer 7c display fix note.

## Completed (2026-07-08)
- **Banding target cards (phase 3 of 3, CR 702.22)** -- unstubs the 4 cards
  phases 1/2 left blocked: Battering Ram, Mishra's War Machine, Nalathni
  Dragon, Knights of Thorn. Stub count 24 -> 20. New `ON_COMBAT_BEGIN` event
  (fires once on the transition into `PHASE.COMBAT_BEGIN`, same shape as
  `ON_UPKEEP_START`/`ON_END_STEP`) drives Battering Ram's "gains banding until
  end of combat" grant, stored as a new `scope: 'combat'` `eotBuffs` option
  (default until-end-of-turn lifetime unchanged for every other eotBuff in
  the pool) stripped at `PHASE.COMBAT_END` alongside the pre-existing
  `turnState.endOfCombatDestroy` processing. Battering Ram's "destroy that
  Wall at end of combat" reuses the existing `blockedByDestroyFilter`
  mechanism (Abomination/Cockatrice) with a new `'wall'` filter value --
  no new destroy pathway needed. Mishra's War Machine's upkeep damage/discard
  is a direct structural copy of `yawgmothDemonUpkeep` (discard-a-card in
  place of sacrifice-an-artifact, including the "no cards means the damage is
  unavoidable" ruling). Nalathni Dragon's `{R}: +1/+0` activated ability
  (`nalathniDragonPump`) increments a new `turnState.activationCounts`
  per-iid map (reset at CLEANUP alongside `activatedOnceIids`), read by a new
  `ON_END_STEP` triggered ability (`activationCountAtLeast` condition +
  `nalathniDragonSacrifice` effect) that sacrifices it once activated 4+
  times in the turn. Knights of Thorn needed no new logic at all -- adding
  the `protection:["red"]` data field (alongside its already-correct
  keywords) is the entire fix, fully carried by pre-existing protection and
  the phase 1/2 banding subsystem. See `docs/MECHANICS_INDEX.md` -- Banding
  Target Cards, and `docs/SYSTEMS.md` S5.4 / `docs/ENGINE_CONTRACT_SPEC.md`
  7.4.
- **Banding AI heuristics (phase 2 of 3, CR 702.22)** -- AI decision-making
  only, no new player-facing UI, no card unstubbing. `AI.js`
  `getBandFormationAction` (called from `planAttack`) forms a band when the
  AI's already-declared attacker set has 2+ CR 702.22c-eligible members
  (aggression >= 0.8, same tier already used elsewhere in `planAttack`) and
  there's a meaningful value gap between the lowest and highest
  `evaluateCreatureValue` scores in that eligible set (lowest under 60% of
  highest); dispatches the existing `FORM_BAND` action, no new action type.
  New exported `chooseBandingDamageOrder(choice, state)` answers both
  702.22j/k `pendingChoice` kinds identically -- lowest-value-first order, so
  a lower-value creature absorbs lethal damage to spare a higher-value one --
  wired into `useDuelController.ts`'s existing `pendingChoice.controller ===
  'o'` branch as a new `bandAttackerDamageOrder`/`bandBlockerDamageOrder`
  case ahead of the pre-existing `pay_gggg`-specific logic, which is
  otherwise untouched. `planBlock` now uses a new `getBandRiskPower` helper
  so a per-candidate block-risk comparison against a banded attacker accounts
  for the whole band's combined power (CR 702.22h: blocking one member blocks
  them all), not just the targeted member's own power -- the aggregate
  lethal-check pass was already correct and is untouched. `AI.js` remains
  strictly read-only; every addition is a pure function, `DuelCore.js`
  remains the sole mutator via the existing `FORM_BAND`/`RESOLVE_CHOICE`
  actions. See `docs/MECHANICS_INDEX.md` -- Banding AI heuristics.
- **Banding core subsystem (phase 1 of 3, CR 702.22)** -- structural combat-
  engine addition, not a card batch. New `bandId` field + `FORM_BAND` action
  (band formation validity per 702.22c) in `DuelCore.js`; a live-computed
  `getEffectiveBlockers`/`getBandMemberIds` propagation helper (702.22h/i)
  replacing every "is this attacker blocked" check in `resolveCombat`, the
  Forcefield `isUnblocked` check, and the Murk Dwellers unblocked check; two
  new `pendingChoice` kinds (`bandAttackerDamageOrder` for 702.22j,
  `bandBlockerDamageOrder` for 702.22k), both gated to require 2+ candidates
  and both rendered for free through the existing generic `ChoiceModal` (no
  new choice-UI component needed). New `BandFormationPanel` in `src/ui/Card/`
  and `src/ui/Mobile/`, gated to render only when a declared attacker has
  banding -- a full attack/block flow with zero banding creatures is
  unchanged. `AI.js` untouched; the AI never forms a band, and both choices
  default to the pre-existing automatic order via `useDuelController.ts`'s
  existing generic AI pendingChoice fallback (no controller changes needed).
  Out of scope: the "bands with other" variant and the block-restriction
  bypass (documented in `docs/SYSTEMS.md` S5.4), and the 4 target cards'
  own stub effects (phase 3). See `docs/MECHANICS_INDEX.md` -- Banding core
  subsystem, and `docs/SYSTEMS.md` S5.4 / `docs/ENGINE_CONTRACT_SPEC.md`
  3.7 and 7.3.

## Completed (2026-07-07)
- **Batch 14: Quick-Win Stubs** -- Living Artifact, Elder Spawn, Osai
  Vultures, Scavenging Ghoul, Sage of Lat-Nam, Island of Wak-Wak, and Urza's
  Avenger (closing out the last deferral from the 2026-07-01 simple-tier
  batch, which originally punted it for lacking a generalized "choose one of
  N keywords" picker -- the `modalChoice` mechanism added 2026-07-05 covers
  it directly). New `ON_PLAYER_DAMAGED` event in `hurt()`; new counter types
  `VITALITY`/`CARRION`/`CORPSE`; new `canBlockDuel()` block-restriction check
  covering `cantBlockedByPower`/`cantBlockedByWalls`/`cantBlockedByColor`,
  which also fixed two silently-broken existing cards (Amrou Kithkin, Bog
  Rats) whose `mod` fields were declared but never read. Stub count: 31 -> 24.
  See `docs/MECHANICS_INDEX.md` -- Batch 14: Quick-Win Stubs.
- **Vitest scoping fix in `test:targeted`/`test:audit`** -- `--testNamePattern`
  doesn't reliably scope Vitest in this repo (a tag string isn't embedded in
  most `describe`/`it` names), so both scripts gained a `--files`/`--pw-files`
  mode that runs Vitest/Playwright directly against explicit file lists,
  gated by a declared-vs-actual test-case/file-count check and a 75/20
  backstop ceiling. The existing `@tag` path is unchanged.

## Completed (2026-07-06)
- **Damage Shields + hurt() Source Metadata Retrofit** -- retrofitted
  essentially every `hurt()` call site in `DuelCore.js` with
  `{ sourceIid, sourceType }` metadata (Deferral Sweep 1 left only 6 of
  ~118 tagged), then implemented `turnState.damageShields`, a one-time,
  exact-identity prevention/redirect shield against a *specific chosen*
  source (Forge's `ChosenCardStrict`, not a standing color ward). Backs
  eight cards: Circle of Protection (Black/Blue/Green/Red/White at `{1}`,
  Artifacts at `{2}`), Greater Realm of Preservation (`{1}{W}`, black or
  red), and Eye for an Eye (Instant, `mode: 'redirect'`). One shared
  resolveEff case (`chooseDamageShieldSource`) parameterized by
  per-card `damageShieldColors`/`damageShieldTypes`/`damageShieldMode`
  fields, reusing the generalized `TutorModal` picker (same precedent as
  Darkpact's `pendingAnteExchange`) for the human player; the opponent
  auto-picks the first legal source (no UI, matching the `sacArt`/`sacCre`
  auto-decide convention) so no pending choice is ever left outstanding for
  the AI. Stub count: -8. See `docs/MECHANICS_INDEX.md` -- Batch: Damage
  Shields + hurt() Source Metadata Retrofit, and `docs/SYSTEMS.md`
  Section 29.
- **Token Creation Infrastructure + Poison Counters** -- new `TOKEN_DB`
  (`src/data/tokens.js`, separate from `CARD_DB`), `makeTokenInstance`/
  `createToken` in `DuelCore.js`, and the CR 111.7 "tokens cease to exist
  once they leave the battlefield" rule enforced at `zMove`'s single
  choke point (covers death, bounce, exile, sacrifice from one call site;
  also fixed `ashesToAshes`'s manual zone splice to route through `zMove`).
  Six cards implemented: The Hive, Serpent Generator (token creation +
  poison-granting Snake token), Rukh Egg (delayed token creation via new
  `state.pendingEndStepTokens: []`, drained in the existing `PHASE.END`
  block), Tetravus (`etbCounters`, two optional variable-count upkeep
  abilities via the existing numberChoice pattern, remembered-token
  tracking via `sourceIid`), Marsh Viper, Pit Scorpion. Real bug fixed:
  `checkWinConditions()`'s poison-counter win threshold defaulted to 5,
  not the correct 10 (both real MTG rules and the affected cards' own
  oracle text say ten). New `selfIsDamageSourceToPlayer` condition and
  `grantPoisonCounters` effect follow El-Hajjâj's existing declarative
  `triggeredAbilities` shape. Poison-counter display added independently
  to both `Banner.tsx` components (desktop `src/ui/Battlefield/`, mobile
  `src/ui/Mobile/` -- confirmed separate, not shared). See
  `docs/MECHANICS_INDEX.md` -- Batch: Token Creation Infrastructure +
  Poison Counters, and `docs/SYSTEMS.md` Section 28.
- **Copy Mechanism Generalization (Vesuvan Doppelganger) + Primal Clay Modal
  Choice** -- extracted `applyPermanentCopy` from Copy Artifact's original
  one-shot `copyPermanentCharacteristics` case (now a thin wrapper, behavior
  unchanged) so it also covers Vesuvan Doppelganger's optional ETB copy
  (creature target, `colorOverride` keeps it printed-blue instead of adding
  a type) and its recurring upkeep re-copy. The upkeep re-copy required
  genuinely new infrastructure: no existing triggered ability previously
  needed a fresh battlefield target at trigger-resolution time (only fixed
  option lists via `requiresChoice`/`pendingChoice`). Added
  `ability.requiresTarget` to `resolveTrigger()`, a new
  `state.pendingTriggerTarget` suspend field, and a `RESOLVE_TRIGGER_TARGET`
  action -- and extended (not duplicated) the existing cast/activate
  targeting flow in `useDuelController.ts` with a third `castFlow.kind`,
  `'trigger'`, so the same battlefield-click targeting UI and cast-prompt
  confirm/skip buttons drive it; neither screen component needed changes.
  Primal Clay was re-verified against Scryfall and found to be a fixed
  three-mode ETB choice, not a copy effect (Forge's script reflects an
  older printing) -- routed through the existing direct-`resolveEff`
  `createPendingChoice` convention (`kind: 'primalClayChoice'`), same shape
  as Alchor's Tomb's `colorChoiceTarget`. Stub count: 41 -> 39. See
  `docs/SYSTEMS.md` Section 18.6 (and its new Triggered-ability-targeting /
  Primal Clay subsections), and `docs/MECHANICS_INDEX.md` -- copy_artifact
  (updated), vesuvan_doppelganger, primal_clay.

## Completed (2026-07-05)
- **Gemini LLM opponent integration removed at owner's request.** `src/engine/GeminiAdvisor.js`, `src/engine/LegalActions.js`, and `src/engine/geminiPrompts.js` deleted, along with all associated tests. The `useGemini` config flag, title-screen toggle, in-duel Gemini decision path, "thinking" indicator, and Gemini log-entry styling were removed from `useDuelController.ts`, `GameWrapper.jsx`, `useOverworldController.js`, `DuelScreen.tsx`, `DuelScreenMobile.tsx`, `LogSheet.tsx`, and both CSS files. The heuristic AI (`aiDecide` in `AI.js`) is now the sole opponent decision path for every opponent, including ARZAKON.
- **Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint C
  (final)** -- final 7 cards implemented (Time Vault, Goblin Artisans,
  Leviathan, Yawgmoth Demon, Magnetic Mountain, Power Leak, Lich), no
  additional deferrals. Real correctness fix: Magnetic Mountain/Power Leak's
  first drafts computed their numberChoice option lists at the exact instant
  `burnMana()` zeroes mana, making the "may pay" choice unreachable for a
  human player -- fixed via the same queue-then-resolve pattern already
  used for Cosmic Horror/Sunken City. Lich needed the most new `hurt()`
  surface of the whole complex-tier batch (lifegain-to-draw, no-zero-loss,
  damage-forces-sacrifice). Flagged (not built): Goblin Artisans' stack-item
  activated-ability targeting has no UI wiring yet (new cross-cutting UI
  infra); several checkpoint B/C upkeep-choice handlers still have no
  `UPKEEP_CHOICE_MODALS` entry either. C4 totals across all three
  checkpoints: 30 implemented, 8 deferred by name (see
  `docs/MECHANICS_INDEX.md` for a flagged discrepancy against the
  originally-stated "41 targeted" count). See `docs/MECHANICS_INDEX.md` --
  Batch: Complex-Tier C4, Checkpoint C.
- **Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint B**
  -- 11 more cards implemented (Goblins of the Flarg, Cosmic Horror, Nafs
  Asp, Sunken City, Drop of Honey, Erosion, Merchant Ship, Nether Shadow,
  Shapeshifter, Island Fish Jasconius, Jihad); 1 deferred (Personal
  Incarnation -- needs centralized creature-damage redirection, not built).
  Real correctness fix: the first draft of several "pay or sacrifice"
  upkeep checks auto-decided synchronously for both players, but
  `burnMana()` zeroes mana before any upkeep check runs, making the cost
  unpayable for a human player in a live game -- fixed to auto-decide only
  for the AI and queue via `UPKEEP_CHOICE_HANDLERS` for the human. See
  `docs/MECHANICS_INDEX.md` -- Batch: Complex-Tier C4, Checkpoint B.
- **Complex-Tier C4 -- Triggered Abilities (Forge Reference), Checkpoint A**
  -- first 12 cards implemented (El-Hajjâj, Feedback, Island Sanctuary, Mold
  Demon, Wall of Tombstones, Wanderlust, Warp Artifact, Ydwen Efreet,
  Abomination, Cockatrice, Infernal Medusa, Time Elemental); 7 deferred
  (Library of Leng, Psychic Venom, Artifact Possession, Artifact Ward,
  Blight, Relic Bind, Oubliette -- mostly a missing ON_TAP trigger event and
  missing phasing, both flagged rather than improvised). Fixed two real
  engine bugs: `ON_DAMAGE_DEALT` triggers were queued but never drained
  (`processTriggerQueue` wasn't called after `resolveCombat`), and
  `scope:'self'` triggers only ever matched `ON_CREATURE_DIES`. See
  `docs/MECHANICS_INDEX.md` -- Batch: Complex-Tier C4, Checkpoint A.
- **Complex-Tier C3 -- Static/Continuous Effects (Forge Reference)** -- 7 of 7
  targeted stub cards implemented, no deferrals: Angry Mob, Rabid Wombat,
  Damping Field, Farmstead, Hidden Path, Phantasmal Terrain, Energy Flux. New
  turn-conditional CDA evaluator, new `basicLandTypeChoice` pendingChoice
  kind. Observed (not fixed, pre-existing): the `burnMana()`/upkeep-check
  ordering means an AI opponent's "pay mana or sacrifice" upkeep choices
  always resolve to sacrifice in practice. See `docs/MECHANICS_INDEX.md` --
  Batch: Complex-Tier C3.
- **Complex-Tier C2 -- Keyword-Line Cards (Forge Reference)** -- 2 of 2
  targeted stub cards implemented, no deferrals: Phyrexian Gremlins
  (`lockArtifactWhileTapped`, new `optionalUntapAlways`/`lockedByIid`
  untap-phase hooks), Wall of Wonder (`wallOfWonderPump`, new
  `canAttackDespiteDefender` DECLARE_ATTACKER override). See
  `docs/MECHANICS_INDEX.md` -- Batch: Complex-Tier C2.
- **Complex-Tier C1 -- Activated Abilities and Spells (Forge Reference)** -- 13
  of 25 targeted stub cards implemented (Alabaster Potion, Sewers of Estark,
  Siren's Call, Tracker, Winter Blast, Banshee, Eternal Flame, Martyr's Cry,
  Volcanic Eruption, Winds of Change, Mana Clash, Mind Bomb, Forcefield); 12
  deferred (Guardian Angel, Ring of Ma'rûf, Greater Realm of Preservation, the
  full Circle of Protection cycle, Pyramids, Eye for an Eye, Aladdin's Lamp).
  Fixed a real pre-existing bug: `damageShield` was written by several
  already-shipped cards but never consumed by `hurt()`. New pendingChoice
  kinds `modalChoice` and `numberChoice`. See `docs/MECHANICS_INDEX.md` --
  Batch: Complex-Tier C1.
- **Generalized Choice Mechanisms** -- three narrow choice mechanisms
  (`pendingChoice`, `TutorModal`'s card-source, `pendingUpkeepChoice`) each
  generalized minimally, unblocking the last four STUB cards deferred on
  choice/picker UI gaps: Alchor's Tomb (`colorChoiceTarget`), Darkpact
  (`darkpactExchange` + new `pendingAnteExchange`), Ashnod's Battle Gear and
  Tawnos's Weaponry (`pumpWhileTapped` + new upkeep-choice registry). Also
  fixed a real mobile-parity bug found during pre-flight: `ChoiceModal` was
  desktop-only (never rendered by `DuelScreenMobile.tsx`) -- extracted to
  `src/ui/duel/ChoiceModal.tsx` and now shared by both screens. See
  `docs/MECHANICS_INDEX.md` -- Feature: Generalized Choice Mechanisms, and
  `docs/SYSTEMS.md` Section 27.

## Completed (2026-07-10)
- **Guardian Angel, Aladdin's Lamp, Raging River (Three Card Batch)** -- Instant-speed damage prevention (1994 fast-effect convention, no stack), draw replacement with X-based charge queue and library reordering, and combat pile division with block restriction. End-to-end: game state (tempAbilities, lampCharges, pendingLamp/River fields), DuelCore reducers (ACTIVATE_TEMP_ABILITY, LAMP_PICK, RIVER_DIVIDE, RIVER_SIDES, updates to canBlockDuel), AI helpers (planGuardianAngelTempAbilities, chooseLampPick, chooseRiverDivide, chooseRiverSides), UI components (TempAbilityBar, LampPickModal, RiverDividePanel/RiverSidesPanel for desktop and mobile), both duel screens wired to render components, useDuelController AI dispatch integrated, test suites (48 Vitest cases across three scenarios, 6 Playwright cases across three specs at dual viewports). Stub count: 20 -> 17. See `docs/SYSTEMS.md` Sections 9, 14, and 16; `docs/MECHANICS_INDEX.md` entries for each card.

## Completed (2026-07-04)
- **Bug Fix: Ancestral Recall creature-targeting crash (ARCANE-1)** -- fixed Ancestral Recall crash on creature-click during targeting, same root cause as the earlier Lava Axe fix (`draw3` was missing from `PLAYER_ONLY_TARGET_EFFECTS`). See `docs/MECHANICS_INDEX.md` -- Bug Fix: Ancestral Recall creature-targeting crash.

## Completed (2026-07-03)
- **Bug Fix: Black Vise Upkeep Guard + AI Priority Pass-Through Stall** -- two confirmed bugs from a live repro. (1) Black Vise's `blackVise` upkeep case in `DuelCore.js` was missing the active-player guard that `rackUpkeep` already had, so it fired on every upkeep transition instead of only the chosen player's -- root cause was a one-line omission, fixed with `if (ns.active !== opp2) break;`. (2) The "AI priority window effect" in `useDuelController.ts` had no fallback dispatch when `aiDecide()` returned `null`/`[]`, so `'o'` never explicitly passed priority and the window (plus the End Turn skip-loop) could hang indefinitely whenever a non-mana activated-ability permanent (e.g. Pestilence) was in play -- root cause was a missing `else` branch, fixed by adding an unconditional `dispatch({ type: 'PASS_PRIORITY', who: 'o' })` fallback. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Black Vise Upkeep Guard, and Bug Fix: AI Priority Pass-Through Stall.
- **Complete Ante System** -- the ante mechanic had partial scaffolding (`anteEnabled`/`anteP`/`anteO`) but was fully unreachable: nothing in the UI ever called `setAnteEnabled`. Wired up end-to-end: title-screen toggle (defaults off) -> `startConfig.anteEnabled` -> `useOverworldController` -> `buildDuelState`; fixed a real bug where the anted card was never spliced out of the library (stayed fully drawable); generalized the ante zone with `anteExtraP`/`anteExtraO` arrays for mid-game additions; added `ownershipChanges` for unconditional (non-ante) permanent ownership exchanges; ported the ante banner to mobile; implemented six of the seven ante cards (Contract from Below, Demonic Attorney, Jeweled Bird, Rebirth, Bronze Tablet, Tempest Efreet), deferring Darkpact (needs ante-zone target-selection UI that doesn't exist). See `docs/MECHANICS_INDEX.md` -- Feature: Complete Ante System, and `docs/SYSTEMS.md` Section 26.
- **SPRITE-SAMPLE-CONVERT-1** -- Two new overworld sprite kinds converted from project-owner-provided sample renders: `merfolk` and `vampire`. New deterministic converter `tools/convert-sample-sprites.py` turns three high-res sample views (front/side/back on a baked checkerboard background) into a Sprite.jsx-compatible 128x128 sheet (4 dirs x 4 walk frames of 32x32 cells; main mass grayscaled for runtime palette tint, skin/wood/coral accents kept saturated; `--bg-mode flood` variant for characters with pale or neutral-gray regions). Sheets registered in `SHEET_URLS` in `src/ui/overworld/Sprite.jsx`; no terrain/archetype mapping assigned yet. Provenance recorded in `src/assets/sprites/CREDITS.md`.
- **Bug Fix: Sprite Black Boxes + Tree Clipping (Overworld Presentation)** -- three presentation bugs, no engine files touched. (1) `goblin.png`/`zombie.png` shipped with opaque near-black backgrounds (1.6%/0.0% transparent vs. 43-67% for the other five sheets), rendering as black boxes on the overworld map; repaired via a border-connected flood fill keying near-black background pixels to alpha (threshold max-channel < 14), preserving interior blacks (eyes, outlines) not connected to the background. Post-repair: 44.5%/71.3% transparent. See `src/assets/sprites/CREDITS.md`. (2) Tree horizontal clipping -- the per-tile terrain canvas in `WorldMap.jsx` was exactly `tileSize` wide, so `bigTree1`/`smallTree1` decorations (scaled to ~37px with +/-6px anchor jitter) got sliced at the canvas edge. Added `OVERFLOW_X = 8` to `terrainRenderer.js` (mirrors the existing `OVERFLOW_TOP` pattern); the canvas is now `tileSize + 2*OVERFLOW_X` wide, translated so ground/decoration drawing stays in tile-local coordinates. Also fixed a secondary defect in `makeDecorInstance`: `vary` was multiplied in after the `maxH` clamp for tall decor, letting max-vary trees exceed `TILE_SIZE + OVERFLOW_TOP` by ~1px and clip at the canvas top -- reordered so the clamp is final. (3) Tree tops vanishing at the fog frontier -- the inline `mask-image` on fog-edge tile root divs masked against the border box, fully hiding the overflowing canvas bands above the tile. Replaced with a `.ow-fog-fade` overlay div (rendered only on fog-edge tiles) that fades to the void color (`#050302`, matching the grid wrapper's radial-gradient outer stop) instead of masking to transparent, so overflowing decor fades into darkness rather than hard-cutting. `fogFadeOverlayStyle()` computes gradient stop percentages from `tileSize`/`OVERFLOW_TOP`/`OVERFLOW_X` rather than hardcoding them. Two existing Playwright assertions in `tests/e2e/overworld-tileset.spec.ts` that checked `style.maskImage` directly were updated to check the new overlay instead, since they tested the mechanism this fix removes. New tests: `tests/scenarios/terrain-decoration-bounds.test.js` (Vitest, horizontal/vertical overflow bounds + determinism), `tests/e2e/overworld-sprite-and-tree-rendering.spec.ts` (Playwright, both viewports: sprite alpha ratio, canvas geometry, no-mask/overlay-present, overflow band actually painted). Files: `src/assets/sprites/goblin.png`, `zombie.png`, `CREDITS.md`; `src/ui/overworld/terrainRenderer.js`; `src/ui/overworld/WorldMap.jsx`; `tests/scenarios/terrain-decoration-bounds.test.js` (new); `tests/e2e/overworld-sprite-and-tree-rendering.spec.ts` (new); `tests/e2e/overworld-tileset.spec.ts` (2 tests updated).

## Completed (2026-07-02)
- **Bug Fix: Pestilence Sacrifice Condition** -- the end-step check in `DuelCore.js` (`PHASE.CLEANUP` handling) was gated on "controller has no black creatures" instead of the oracle condition "no creatures are on the battlefield." Fixed to check `[...p.bf, ...o.bf]` for any creature, evaluated once per end step; if false, every Pestilence on either battlefield is sacrificed (direct `zMove` to graveyard, log wording changed from "destroyed" to "sacrificed"). See `docs/MECHANICS_INDEX.md` -- Bug Fix: Pestilence Sacrifice Condition.
- **Feature: The Rack Upkeep Trigger.** `the_rack` was previously `effect:"STUB"` with no implementation at all. Added `upkeep:"rackUpkeep"` case to `DuelCore.js`'s per-card upkeep switch: fires only on the opponent-of-controller's upkeep (2-player simplification of "choose an opponent"), dealing `max(0, 3 - handSize)` damage. See `docs/MECHANICS_INDEX.md` -- Feature: The Rack Upkeep Trigger.
- **Type-Changing Continuous Effects (Deferral Sweep 2)** -- closed the gap where `layers.js` computed a Layer-4 type change for characteristics/display, but `isCre`/`isLand`/`checkDeath`/combat eligibility in `DuelCore.js` read `card.type` directly and never saw it. New baked fields (`typeEff`, `subtypeEff`, `colorEff`, `landTypeOverride`) written by `recomputeTypeEffects()` at three choke points (`zMove`, `PLAY_LAND`, `RESOLVE_STACK`); `isCre`/`isLand` read the baked fields with a raw-type fallback. Handles mid-combat revert (a permanent that stops being a creature is spliced out of `state.attackers`, following the existing `ebonyHorse` leaves-combat-alive pattern), summoning sickness (fixed a latent `PLAY_LAND` bug that hardcoded `summoningSick:false`), and Blood Moon/Evil Presence's mana-and-ability-loss simplification (`landTypeOverride` forces `applyOvergrowthTap`'s tapped-for color and blocks `ACTIVATE_ABILITY`). Cards implemented: Living Lands, Kormus Bell, Blood Moon, Evil Presence. `useDuelController.ts`/`Half.tsx`/`FieldCard.tsx` UI updated to route creature/land classification through `isCre`/`isLand` instead of raw `card.type` checks, so an animated land is clickable in combat and renders once (creature row, not both). Stub count: 114 -> 110 (Cyclopean Tomb's dependency on this gap is now unblocked but was not implemented -- counter tracking + delayed upkeep triggers make it a separate, more complex card). See `docs/SYSTEMS.md` S18.9 and `docs/MECHANICS_INDEX.md` -- Deferral Sweep 2: Type-Changing Continuous Effects.
- **Trigger-Event Expansion + Damage Source Infrastructure (Deferral Sweep 1)** -- closed the two highest-yield infrastructure gaps surfaced by the moderate-tier M4 deferrals, then implemented the 12 cards they unblocked. `ON_ATTACKS_DECLARED`, `ON_SPELL_CAST`, `ON_PERMANENT_LEAVES_BF` (emitted from `zMove()`, the single bf-leaving choke point, alongside the existing `ON_CREATURE_DIES`), and `ON_END_STEP` added to the trigger/event system. `hurt()` gained an optional structured `meta` param (`{ sourceIid, sourceType, combat, unblocked }`), backward compatible with all pre-existing call sites; `turnState.damageBySourceType` tracks per-player, per-source-type damage this turn (reset at CLEANUP); a targeted `damageRedirect` static-flag hook inside `hurt()` handles Martyrs of Korlis and Veteran Bodyguard. Cards implemented: Cave People, Hasran Ogress, Citanul Druid, Throne of Bone, Urza's Chalice, Dingus Egg, Tablet of Epityr, Urza's Miter, Khabál Ghoul, Reverse Polarity, Martyrs of Korlis, Veteran Bodyguard. Stub count: 126 -> 114. See `docs/SYSTEMS.md` Sections 17.3.5-17.3.8 and 17.9, and `docs/MECHANICS_INDEX.md` -- Batch: Trigger-Event Expansion + Damage Source Infrastructure (Deferral Sweep 1).
- **Moderate-tier Alpha/Beta stub batch (Card-Forge/forge reference, GPL-3.0)** -- 55 of 84 targeted stub cards implemented across four sub-batches (M1 activated abilities/spells: 28/33; M2 keyword-line: 6/11; M3 static/continuous: 11/15; M4 triggered abilities: 10/25); 29 deferred with a reason comment in `cards.js`. Fixed a real latent bug in the triggered-ability pipeline: self-scoped "when this dies" triggers could never fire because both `emitEvent` and `resolveTrigger` only scanned the live battlefield, but the dying card is already in the graveyard by the time `checkDeath` calls `emitEvent` -- new `findLeftBattlefieldCard()` helper fixes this for both. New `ACTIVATE_ABILITY` cost tokens (`payLife2`, `sacCre`), X-cost activated abilities now actually work (previously hardcoded to X=1), `PHASE.END` delayed-effects hook, `hurt()` damage-this-turn tracking, `lordControllerOnly` scoping for the generic lord-effect matcher, and a Mountain-tap checkpoint in `applyOvergrowthTap`. See `docs/MECHANICS_INDEX.md` -- Batch: Moderate-Tier Stub Cards (Forge Reference).
- **Creature Evaluator Port (Milestone C, pulled forward)** -- `evaluateCreatureValue()` ported from Card-Forge/forge's `CreatureEvaluator.java` (GPL-3.0), wired into `sumCreaturePower()`/`evaluateBoard()` in `AI.js`. Per-creature keyword-aware scoring (flying, deathtouch, lifelink, trample, vigilance, first/double strike, defender penalty, protection suite, etc.) replaces the old flat power sum. `docs/AI_COMBAT_PORT_PLAN.md` scopes the follow-on attack/block/simulation-lookahead port as a separate future batch -- not implemented here. See `docs/MECHANICS_INDEX.md` -- Feature: Creature Evaluator Port.

## Completed (2026-07-01)
- **Simple-tier Alpha/Beta stub batch (Card-Forge/forge reference, GPL-3.0)** -- 47 of 50 targeted stub cards implemented; 3 deferred (Serpent Generator, The Hive -- no token-creation mechanic exists in this engine yet; Urza's Avenger -- needs a new "choose one of N keywords" picker UI). New `resolveEff` cases in `DuelCore.js`: `tapTargetWall`, `discardAllNonland`, `returnArtifactFromGYToHand`, `preventDamage2ArtifactCreature`, `pumpAttackersPower2EOT`, `counterArtifact`, `addMana3Red`, `preventDamage2Self`, `colorLace` (Chaoslace/Deathlace/Lifelace/Purelace/Thoughtlace cycle, parameterized by `card.laceColor`), `destroyBlackCreature`, `shuffleGYIntoLibrary`, `addManaReflected`, `revealHand`, `damage1Flying`, `tapOrUntapArtifact`, `globalDebuffPower2EOT`, `destroyAuraOnOwnCreature`, `scryTop3Reveal`, `bouncePermanentControlled`, `damage2Any`, `pumpBlockersToughness3EOT`, `debuffTargetPower2EOT`, `untapAllOwnLands`, `tapAllBlueCreatures`, `setAttackerPower0EOT`, `fetchBasicToBf`. New ACTIVATE_ABILITY cost tokens: `sacArt` (sacrifice an artifact you control, not necessarily self), `exile` (exile self as a cost), `discardLastDrawn` (approximated as "last card in hand array"). New continuous effects in `layers.js` `collectEffects` (Holy Ground name-based-check pattern): Castle, Fortified Area, Weakstone; new CDA evaluator `waterWurmToughness` (kird_ape pattern). Moat implemented as a `DECLARE_ATTACKER` legality gate. `applyOvergrowthTap` gained a per-card amount override for Mishra's Workshop (3 colorless). `useDuelController.ts` UI-targeting allowlists (`EXPLICIT_TARGET_EFFECTS`, `PLAYER_ONLY_TARGET_EFFECTS`, `ACTIVATE_TARGET_EFFECTS`, `PLAYER_TARGETABLE_ABILITY_EFFECTS`, `isCounterEffect`, `needsStackTarget`) extended for the new effect ids; `DuelScreen.tsx`/`DuelScreenMobile.tsx` desktop+mobile stack-click condition switched from the narrower `isCounterEffect` to `needsStackTarget` so `colorLace`'s dual permanent-or-stack targeting works on both. See `docs/MECHANICS_INDEX.md` -- Batch: Simple-Tier Stub Cards (Forge Reference).

## Completed (2026-06-30)
- **TINT-BLEND-DITHER-1** -- Cross-blended tint boundary dithering for overworld biome seams. `getTintCells()` in `terrainRenderer.js` replaces the old flat per-tile `fillRect` tint with a dithered band that cross-blends each tile's tint with its neighbor's (or grass if untinted) along each differing edge. Both tiles on either side of a seam dither symmetrically using world-aligned `hashTile()` hashes (no `Math.random()`). Tunables: `TINT_CELL_PX=4`, `TINT_BAND_CELLS=3`. Interior tiles hit the cheap path (pixel-identical to prior flat fill). Distinct from the WATER/SWAMP ground autotile (`blobSubOffset`/`getGroundLayers`), which was not touched. See `docs/MECHANICS_INDEX.md` -- Feature: Cross-Blended Tint Boundary Dithering.
- **END-TURN-SKIP-1** -- End Turn now skips ahead to the opponent's turn instead of advancing one phase per click. `endTurn()`/`endTurnPending` added to `useDuelController.ts`, driving the existing `passPriority`/`requestPhaseAdvance` dispatchers in a loop until a new turn, game-over, or a player-choice pending state is hit. Desktop and mobile `ActionBar` both show a disabled "Ending Turn..." state while the loop runs. See `docs/MECHANICS_INDEX.md` -- Feature: End Turn skip-ahead.

## Completed (2026-06-29)
- **Batch A1 -- Layer System Completion (Layers 1, 2, 3)**: Copy Artifact (Layer 1 copiable-values snapshot), Aladdin + Old Man of the Sea + Guardian Beast (Layer 2 conditional control-change with revert), Sleight of Mind + Magical Hack (Layer 3 persistent text-word substitution). `revertControlGrant` + `checkControlGrants` helpers; Old Man pre-untap hook; indestructible enforcement in `checkDeath` and artifact-destroy call sites; `alreadyOnBf` guard in RESOLVE_STACK. See `docs/SYSTEMS.md` Sections 18.6/18.7/18.8 and `docs/MECHANICS_INDEX.md` Batch A1 entry. 18 new tests.

## Completed (2026-06-28)
- **Batch A4 -- Sphere Lifegain Cycle**: Crystal Rod, Iron Star, Ivory Cup, Wooden Sphere implemented. `pendingSphereTrigger` state field and `SPHERE_TRIGGER_RESOLVE` action added to `DuelCore.js`. `SphereTriggerModal.tsx` shared modal on both screen variants. AI auto-resolves (always pay if able). Trigger fires at cast time, includes caster's own spells. See `docs/SYSTEMS.md` Section 25 and `docs/MECHANICS_INDEX.md` Sphere Lifegain Cycle entry.

## Verified complete during 2026-06-25 planning (pulled from prior backlog/horizon)
- `ali_from_cairo` life floor -- `lifeFloor` field, `getLifeFloor()` + `hurt()` clamp in `DuelCore.js`.
- Power Sink / `xSelect` cast flow -- present on both `DuelScreen.tsx` and `DuelScreenMobile.tsx`.
- Test tagging + e2e consolidation -- single `tests/e2e/`, tagged describes, `run-audit.js` / `run-targeted.js`, `test:audit` / `test:targeted` scripts.
- `AUDIT_REPORT.md` deletion.
- TD-004 -- `draw3` (Ancestral Recall) explicit player target.
- TD-005 -- `PLAY_LAND` rejected while the stack is non-empty.
- Batch 1A (Desert/landwalk) and Batch 1B (Wall/sacrifice) -- e2e specs present. _Assumed green; confirm via `npm run test:audit -- @premodern` if in doubt._
- **BLOCK-GUARD-1** -- COMBAT_BLOCKERS AI auto-advance: Added `if (s.phase === 'COMBAT_BLOCKERS') return;` guard in the AI driver useEffect in `useDuelController.ts`. Human defender's blocker-declaration window is no longer skipped when the AI is the attacking player. See `docs/MECHANICS_INDEX.md` -- Bug Fix: COMBAT_BLOCKERS AI auto-advance.
- **LAXA-PSIONIC-1** -- Lava Axe / Psionic Blast targeting crash: `damage5` defensive fallback + `psionicBlast` creature-damage branch added to `DuelCore.js`; `PLAYER_ONLY_TARGET_EFFECTS` guard added to `useDuelController.ts`, `DuelScreen.tsx`, `DuelScreenMobile.tsx`. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Lava Axe / Psionic Blast creature-targeting crash.
- **RESUME-REMOVE-1** -- Resume-duel modal removed: `ResumeDuelModal.tsx` deleted; resume flow wiring removed from both screen files; autosave retained as crash-recovery; `LOAD_STATE` reducer left as dead code for future safe-phases-only checkpoint design. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Resume-duel modal removed.
- **CASTLE-BOSS-1** -- Castle challenges now route to `BOSS_*` decks. `MAGE_BOSS_ARCHS` added to `src/engine/MapGenerator.js`; `handleChallenge` in `useOverworldController.js` swapped from `MAGE_ARCHS[col]` to `MAGE_BOSS_ARCHS[col]`. See `docs/MECHANICS_INDEX.md` -- Bug Fix: Castle boss-deck routing.

See `docs/SPRINT_ARCHIVE_2026-06-24.md` for the prior sprint's completed work.
