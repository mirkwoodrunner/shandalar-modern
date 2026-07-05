# Current Sprint — 2026-06-25

## Focus (priority order)

## Up Next (backlog, not scheduled)
- Premodern card effect handlers -- ongoing batched track. Scryfall oracle verification required per batch. Continue the Batch 1A/1B cadence.
- **Resume duel v2** (future): Checkpoint-gated resume -- only safe to load when `stack.length === 0` and phase is in a safe set (MAIN_1, MAIN_2). Requires `LOAD_STATE` reducer (currently dead code) and a gated modal.
- Roadmap Milestone A remaining: A2, A3, A5+ batches.

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
