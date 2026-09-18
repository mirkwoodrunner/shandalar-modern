# Architectural Decisions Log

This file records confirmed design decisions for Shandalar Modern.
Entries here are closed -- do not revisit without an explicit architecture proposal.

Cross-referenced from CLAUDE.md.

---

## Confirmed Architectural Decisions (Do Not Revisit)

- **Power Surge upkeep:** snapshot tapped-land count into `turnState.powerSurgeUntappedCount`
  during UNTAP; consume at UPKEEP. (Option A)
- **Holy Ground:** `hasKw()` suppresses landwalk keywords when the defending player controls
  Holy Ground. (Option B)
- **Priority window phases:** `PRIORITY_WINDOW_PHASES` whitelist = `Set(['MAIN_1', 'MAIN_2', 'END'])`
- **Enemy grace period:** `GRACE_MOVE_THRESHOLD = 3` in `EnemyAI.js`
- **Mulligan latch:** `mulliganDismissed` ref prevents modal reappearing on orientation change
- **Lord effect pattern:** Cards with `effect:"lordEffect"` or `effect:"globalPump"` are continuous static abilities, NOT resolved via `resolveEff`. Bonuses are computed by `getPow`, `getTou`, and `hasKw` at read time by scanning the battlefield.
- **Mana tap undo snapshot:** Created on first `TAP_LAND`/`TAP_ART_MANA` when `stack.length === 0` (not `spellsThisTurn === 0`). Resets after stack drains to zero, enabling undo for post-resolution taps.
- **AI-turn spell priority:** `useEffect([s.stack?.length])` in both DuelScreen files
  opens a priority window when the stack grows (prev === 0, cur > 0) while
  `active === 'o'`. This is the hook that gives the player a response window after the
  AI casts. The AI loop's inner `setTimeout(() => requestPhaseAdvance())` is retained
  but is a no-op while the stack is non-empty.
- **AI mana simulation:** The AI's virtual state tracks mana spent and produced during multi-spell planning. `evaluateAndCast` maintains a `poolAfterCast` that deducts each spell's cost after crediting tapped sources; `applyVirtualPlay` credits mana-producing spells via the card's `mana` array. If a new `addMana` spell is added to `cards.js`, its `mana` field must be a flat array of color characters (e.g. `["B","B","B"]`) for `applyVirtualPlay` to credit it correctly.
- **Mobile targeting mode:** `needsExplicitTarget()` (module-level in `DuelScreenMobile.tsx`) gates the targeting flow. Tapping a qualifying spell sets `targetingFor` state; subsequent tap on creature/life-total sets `pendingTarget`. `Banner.onLifeClick` prop enables life-total tap targets. Cast fires via `castSpell(targetingFor, pendingTarget, xVal)`.
- **Battlefield click routing:** `handleBfClick(card)` in `useDuelController.ts` is the single entry point for all combat-phase battlefield clicks. It owns COMBAT_BLOCKERS two-click flow (`pendingBlockerIid` state, isolated from `selTgt`) and COMBAT_ATTACKERS attacker toggle. Both `DuelScreen` and `DuelScreenMobile` call `handleBfClick` first; if it returns `false` (non-combat click), the screen component handles the interaction locally. Do not add combat click logic to either screen component.

*(Migrated from CLAUDE.md -- original decision date unknown)*

---

## Rendering: Phaser for Duel + World Map, React for Chrome (hybrid, Phase 1 flagged POC -- 2026-09-09)

Long-term rendering split, adopted for the animation/touch-input quality Phaser
gives the duel and world-map screens:

- **Phaser owns:** duel-screen rendering (battlefield, hand, stack, combat --
  Phase 2+) and world-map rendering (Phase 3+).
- **React keeps:** menus, deck builder, settings, modals -- permanently. These
  are never migrated to Phaser.
- **`DuelCore.js` remains the sole `GameState` mutator regardless of renderer.**
  Phaser scenes render plain data and call callbacks; they never resolve
  rules or mutate state themselves. This is the same UI/engine boundary
  `CLAUDE.md` already enforces for React components, just extended to a
  second rendering layer.

**Phase 1 (this entry, 2026-09-09) is a feature-flagged POC only**
(`?duel=sandbox-phaser`): a Phaser canvas rendering + animating the player's
hand, mounted *alongside* the unchanged, still-default `DuelScreen`. It
proves nothing about Phase 2 except animation feel and mobile touch input.

**Go/no-go on Phase 2 (retiring the React duel screens in favor of Phaser) is
open** -- not decided by this entry. Phase 2 would trigger a Tier 1
`ENGINE_CONTRACT_SPEC.md` update (system boundary contracts between
DuelCore/AI/UI change shape when the "UI" is a Phaser scene instead of
React); Phase 1 does not, since it only consumes the existing UI-layer
contract via the same sandbox dispatch hatch Playwright already uses.

---

## Persistence Model (confirmed 2026-08-02)

Shandalar Modern follows the source material: a single persistent campaign save, not a roguelike
run-reset model with meta-progression. Losing towns to conquest is meant to matter because the run
can't just be shrugged off by refreshing the browser.

**Current state:** only `shandalar_unlockables` (the 5 mage artifacts, owned booleans) persists
across sessions, via localStorage in `useOverworldController.js`. Overworld run state -- position,
gold, deck, binder, quests, mana links, dungeon progress -- has no persistence. Closing the tab or
reloading discards the run entirely. `usePersistence.ts` / `LOAD_STATE` cover mid-duel crash
recovery only (the resume-to-modal flow was deliberately removed, see RESUME-REMOVE-1); they do
not cover the overworld/campaign layer.

**Rescopes Milestone D's "Resume Duel v2"** from mid-duel checkpointing into full campaign
persistence: position, world state, deck, binder, quests, mana links, dungeon progress, gold.

**Open before implementation (not decided yet):**
- Single continuous save vs. multiple save slots
- Continuous autosave vs. safe-point saves (autosave-on-every-change risks capturing a bad
  mid-transition state; safe-point saves need the same "safe phases only" gating already required
  for mid-duel resume)

Not scheduled as next work as of 2026-08-02.

---

## MCTS Candidate Shape (TD-002)

scoreMoves() in MCTS.js accepts an optional `nextState` field on candidate objects:

  { action: <any valid action>, nextState?: GameState, label: string }

When `nextState` is present, it is used as the rollout start state directly.
When absent, start state is derived via duelReducer(state, candidate.action).

planMain() uses the nextState path (passing primaryVirtual / altVirtual).
planAttack() uses the action path (passing DECLARE_ATTACKER / ADVANCE_PHASE).
Never pass { type: 'PLAN' } or other unrecognized action types as candidates.

*(Migrated from CLAUDE.md -- original decision date unknown)*

---

## MCTS Unit Test Seam (TD-003 -- RESOLVED)

`stepOnce` and `policyMainAction` in `MCTS.js` are exported solely for unit testing.
Do not call them from production code outside of MCTS.js itself.

`src/engine/__tests__/mcts-rollout.test.js` holds three test groups:
- Group A: post-fix assertions -- rollout taps exact cost and casts one spell per main
  phase, then resolves the stack. Life assertion guards against mana-burn regression.
- Group B: determinism proof -- rollout returns the same winner from identical state.
- Group C: KARAG-only gate guard -- asserts KARAG is the only profile with
  aggression >= 0.9; protects ARZAKON/MORTIS from silent MCTS exposure after the fix.

### Rollout behavior (post-TD-003 fix)

Rollouts now tap exact cost and cast one spell per main phase, then resolve the stack.
Deliberate speed tradeoffs:
- **One cast per main phase** -- no multi-cast loop (future fidelity upgrade).
- **`tgt: null`** -- no targeted-spell fidelity in rollout (targeted removal/burn may no-op).
- **Immediate `RESOLVE_STACK`** -- no in-rollout opponent responses.
- **`computeTaps` uses `produces[0]`** -- dual lands treated as their first color only.

Exact-cost tapping is required for mana-burn safety: `burnMana` fires at every phase
boundary; over-tapping would burn KARAG in live games. The factory ruleset has `manaBurn`
off, so a "tap all lands" refactor would pass unit tests while burning KARAG in real games.
The Group A life assertion (`next.o.life === 20`) is the primary regression guard for this.

*(Migrated from CLAUDE.md -- original decision date unknown)*

---

## Learn Mode scope decisions (confirmed 2026-09-16)

- **Curriculum span:** brand-new player through judge-test preparation. Five tiers,
  see `docs/LEARN_MODE_ROADMAP.md` section 4.
- **Grading substrate forks at Tier 4.** Tiers 1 to 3 are graded by DuelCore. Tiers 4
  and 5 are content-graded question banks. DuelCore will not be extended toward full
  Comprehensive Rules coverage to grade judge-level content.
- **Card art is in scope.** Reuse `src/utils/scryfallArt.js` and `src/utils/useCardArt.js`
  with a printing-preference parameter rather than building a second art pipeline.
  Shandalar's current oldest-printing behavior stays the default.
- **Duel UI is in scope.** `DuelScreen.tsx` and `DuelScreenMobile.tsx` gain a scenario
  mode that loads an in-progress game state for learning exercises. This revises the
  `CLAUDE.md` rule that Learn Mode may not touch UI outside `src/learn/`. The revision
  lands with the scenario-mode prompt (milestone L3), not before.
- **Learn card pool:** a separate card database satisfying a shared card-shape contract,
  NOT a pool flag on `CARD_DB`. A flag would make every `CARD_DB` consumer pool-aware
  (deck generation, ante, shops, `MAGE_ARCHS`, AI archetypes) and a missed call site
  would leak Learn cards into campaign decks.
- **One application, not two.** Tiers 4 and 5 share the profile, mastery, and review
  systems with Tiers 1 to 3. They differ only in exercise renderer.
- **Tier 5 teaches against tournament policy documents** (MTR, IPG, Judging at Regular
  REL) with per-exercise version stamps and an automated staleness check in
  `learn:check`.
- **Copyright posture:** unofficial fan content, free forever, no sales or profit
  intended. See `docs/LEARN_MODE_ROADMAP.md` section 6.
- **Release order (2026-09-16):** Tier 1 ships publicly on its own, first, after
  milestone L2c. Not Tiers 1 and 2 together, and not Tiers 4 and 5 first. Tier 1 needs
  no new runner capability, no Learn card pool, and no duel-UI scenario mode, so it is
  two milestones from shippable rather than six. It is also the only tier that
  exercises the DuelCore grading path and `puzzleChecker`. Judge-prep-first was
  considered and rejected: judge candidates study to a deadline and then stop, which is
  the wrong population to tune retention systems against.
- **Fan content notice is a release gate, not launch polish.** Moved from L11 to L2c.
  The placeholder in `src/learn/content.ts` must be replaced before any public release.
- **Tier 1 content is hand-authored before the L6 authoring pipeline exists.** At 40 to
  50 exercises hand-authoring is affordable, and blocking the first release on tooling
  is the wrong trade. L6 is designed against what L2b actually cost.
- **Curriculum detail is tier-scoped.** `docs/LEARN_CURRICULUM.md` specifies Tier 1 in
  full and Tiers 2 to 5 at skill-name granularity only. Each tier gets its full pass in
  the milestone that unblocks it. Fully specifying tiers a year out produces stale
  documentation, which is worse than thin documentation.
- **Paper is the canonical model for Learn Mode (2026-09-16).** All content at every
  tier teaches paper Magic. Digital-client behavior (auto-tapping, auto-passing
  priority, stops) is taught as a mapping layer in its own skill, never as the default.
  Rationale: the curriculum terminates in judge prep, whose governing documents (MTR,
  IPG) are paper-only, so a digital default would require an unexplained model switch
  mid-curriculum. The runner already models paper behavior (`TAP_LAND` is explicit,
  `UNDO_MANA_TAPS` exists because taps are manual), so paper costs nothing to teach and
  digital would contradict the interface the lesson runs inside.
- **Physical handling content is unresolved and gates L2.** Shuffling, randomization,
  and mulligan procedure are Tier 1 material under a paper north star but cannot be
  graded by the runner. Including them requires a third exercise type (read-only
  explainer) and a new `puzzleChecker` path. Explicitly out of scope for L2b either way.
- **Physical handling content is cut, not deferred (2026-09-16).** Shuffling,
  randomization, card handling, and mulligan procedure do not appear in the lesson tree.
  Rationale: engagement. A text quiz on shuffling etiquette is the weakest content the
  product could ship and a boring Tier 1 costs more than the missing coverage. Reference
  material belongs in a static help page, not a lesson.
- **Mulligan decisions are a Tier 3 skill gated on L5 (2026-09-16).** Separated from
  mulligan procedure deliberately. Keep-or-ship is judgment, is deck-dependent, and is one
  of the most engaging lessons available. Grading it needs library manipulation the runner
  does not have, and a brand-new player has no frame for evaluating a hand.
- **Tiers 1 to 3 contain no ungraded content (2026-09-16).** Every exercise produces an
  attempt record. L8 computes mastery from attempt records, so ungraded content is
  invisible to spaced review. Content that cannot be graded is not a lesson. Two exercise
  types only: `engine` and `multiSelect`.
- **Card pool decision REVERSED (2026-09-16).** Supersedes the earlier "separate Learn card
  database, NOT a pool flag on `CARD_DB`" decision. Now: one database, cards tagged by
  pool, parameterized lookup defaulting to the Shandalar set. The original objection (every
  consumer becomes pool-aware) applies only if consumers do the filtering, which a
  parameterized lookup avoids. No format targeting. Bounded by what DuelCore can execute.
  Oracle text pinned with a version stamp, gated in `learn:check`, sharing L7's mechanism.
- **Hosting (2026-09-16):** Learn Mode and Shandalar deploy together as one build to one
  origin, off GitHub, on a project-owned domain, with subdomains from day one. Splitting
  them later costs a DNS change. Accepted consequence: shared takedown risk.
