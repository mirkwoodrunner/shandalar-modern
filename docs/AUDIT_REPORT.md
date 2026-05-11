# Codebase Audit Report
Generated: 2026-05-11

---

## 1. File Extension Issues

### 1.1 TypeScript / TSX File Inventory

31 `.ts`/`.tsx` files exist in `src/`. All of them are reachable **only** through `src/DuelScreen.tsx`. `App.jsx` and `OverworldGame.jsx` both explicitly import `src/DuelScreen.jsx`; `DuelScreen.tsx` is imported by nothing in the active app graph.

```
src/DuelScreen.tsx                         ← entry root; imported by NOTHING (app uses .jsx)
src/hooks/useFlash.ts                      ← imported only by DuelScreen.tsx
src/hooks/useKeyboardShortcuts.ts          ← imported only by DuelScreen.tsx
src/hooks/usePersistence.ts               ← imported only by DuelScreen.tsx
src/hooks/useTweaks.ts                    ← imported only by DuelScreen.tsx / TweaksPanel.tsx
src/ui/ActionBar/ActionBar.tsx            ← imported only by DuelScreen.tsx
src/ui/ActionBar/ActionButton.tsx         ← imported only by ActionBar.tsx
src/ui/ActionBar/InstantPriorityBar.tsx   ← imported only by DuelScreen.tsx
src/ui/Battlefield/Banner.tsx             ← imported only by DuelScreen.tsx
src/ui/Battlefield/Battlefield.tsx        ← imported only by DuelScreen.tsx
src/ui/Battlefield/Half.tsx              ← imported only by Battlefield.tsx
src/ui/Battlefield/LifeTotal.tsx         ← imported only by Banner.tsx
src/ui/Battlefield/ZoneCount.tsx         ← imported only by Banner.tsx
src/ui/Card/ArtPlaceholder.tsx           ← imported only by tsx Card components
src/ui/Card/CardBack.tsx                 ← imported only by tsx Card components
src/ui/Card/Cost.tsx                     ← imported only by tsx Card components
src/ui/Card/FieldCard.tsx                ← imported only by tsx tree
src/ui/Card/FilCorner.tsx               ← imported only by tsx Card components
src/ui/Card/HandCard.tsx                 ← imported only by tsx tree
src/ui/Card/LandPip.tsx                 ← imported only by tsx Card components
src/ui/Card/frame.ts                     ← imported by FieldCard.tsx, HandCard.tsx
src/ui/Card/types.ts                     ← imported by DuelScreen.tsx and multiple tsx files
src/ui/GameOver/GameOverModal.tsx        ← imported only by DuelScreen.tsx
src/ui/Hand/Hand.tsx                     ← imported only by DuelScreen.tsx
src/ui/Log/DuelLog.tsx                   ← imported only by DuelScreen.tsx
src/ui/Mulligan/MulliganModal.tsx        ← imported only by DuelScreen.tsx
src/ui/Phase/PhaseBar.tsx               ← imported only by Topbar.tsx
src/ui/Phase/PhaseRibbon.tsx            ← imported only by Battlefield.tsx
src/ui/TargetArrow/TargetArrow.tsx      ← imported only by DuelScreen.tsx
src/ui/Topbar/Topbar.tsx               ← imported only by DuelScreen.tsx
src/ui/TweaksPanel/TweaksPanel.tsx      ← imported only by DuelScreen.tsx
src/ui/interaction.ts                    ← imported by NOTHING (orphan even within tsx tree)
```

### 1.2 Specifically Audited Files

**`src/ui/ActionBar/InstantPriorityBar.tsx`**
- EXISTS.
- Imported by: `src/DuelScreen.tsx` only.
- NOT reachable from the application entry point (`main.jsx → App.jsx → DuelScreen.jsx`).

**`src/DuelScreen.tsx` vs `src/DuelScreen.jsx`**
- **DUPLICATION CONFLICT**: Both files exist in `src/`.
- `App.jsx:66` imports `./DuelScreen.jsx`.
- `OverworldGame.jsx:23` imports `./DuelScreen.jsx`.
- `DuelScreen.tsx` is imported by **nothing** in the active app graph.
- Assessment: `DuelScreen.tsx` is an in-progress design-system replacement for `DuelScreen.jsx`. The transition is incomplete — the `.tsx` tree exists alongside the `.jsx` tree but the cutover has not happened.

### 1.3 Import Extension Correctness

`DuelScreen.tsx` imports all `.tsx`/`.ts` siblings without extensions (e.g., `from './ui/Topbar/Topbar'`), relying on TypeScript resolver. This is consistent and correct for a TypeScript project. No bare-extension mismatches detected within the tsx tree.

---

## 2. Dead / Orphan Files

### src/

The following files have **zero inbound imports** from any other `src/` file and are not entry points:

| File | Zero-Import Verdict | Notes |
|------|---------------------|-------|
| `src/data/keywords.js` | Confirmed dead (runtime) | No `import` statement from any file points to it. MECHANICS_INDEX.md §1.1 lists `keywords.js` as a DuelCore dependency, but DuelCore.js never imports it; keyword strings are matched inline as plain string literals. File is a reference spec only. |
| `src/data/effectSchemas.js` | Confirmed dead | No inbound imports found anywhere in `src/`. |
| `src/game/CardEffects.js` | Confirmed dead | No inbound imports. |
| `src/engine/events.js` | Confirmed dead | No inbound imports. Self-reference comment on line 1 is the only match. |
| `src/hooks/useKeyboard.js` | Confirmed dead | No inbound imports. Comment on line 3 references `useDuel` but the file is never imported. The `.tsx` replacement (`useKeyboardShortcuts.ts`) exists but is itself only imported by `DuelScreen.tsx`. |
| `src/components/CardDisplay.jsx` | Confirmed dead | No inbound imports anywhere in `src/`. |
| `src/ui/interaction.ts` | Confirmed dead | No inbound imports; orphaned even within the `DuelScreen.tsx` component tree that it nominally belongs to. |

**Active files confirmed (for reference):**

| File | Imported by |
|------|-------------|
| `src/data/cards.js` | App.jsx, DuelScreen.jsx, DuelCore.js, cardHandlers.js, AI.js, tests |
| `src/data/rulesets.js` | App.jsx, OverworldGame.jsx, AI.sim.test.js |
| `src/engine/DuelCore.js` | App.jsx, DuelScreen.jsx, useDuel.js, DuelScreen.tsx, tests |
| `src/engine/AI.js` | App.jsx, DuelScreen.jsx, DuelScreen.tsx |
| `src/engine/MCTS.js` | AI.js |
| `src/engine/MapGenerator.js` | App.jsx, OverworldGame.jsx, GameWrapper.jsx, WorldMap.jsx, EncounterModal.jsx, PreDuelPopup.jsx, DungeonGenerator.js |
| `src/engine/DungeonGenerator.js` | OverworldGame.jsx |
| `src/engine/cardHandlers.js` | DuelCore.js |
| `src/engine/phases.js` | DuelCore.js, AI.js, MCTS.js, four test files |
| `src/hooks/useDuel.js` | DuelScreen.jsx, DuelScreen.tsx |
| `src/utils/scryfallArt.js` | useCardArt.js |
| `src/utils/useCardArt.js` | Card.jsx, EncounterModal.jsx |

**Duplicate role (jsx legacy vs tsx replacement):**

| Legacy (active) | Replacement (inactive, WIP) | Overlap |
|---|---|---|
| `src/ui/duel/Battlefield.jsx` | `src/ui/Battlefield/Battlefield.tsx` | Same battlefield role |
| `src/ui/duel/Hand.jsx` | `src/ui/Hand/Hand.tsx` | Same hand role |
| `src/ui/duel/TargetArrow.jsx` | `src/ui/TargetArrow/TargetArrow.tsx` | Same arrow role |
| `src/hooks/useKeyboard.js` | `src/hooks/useKeyboardShortcuts.ts` | Same keyboard role |

---

### scryfall/

| File | Classification | Notes |
|------|----------------|-------|
| `process-card-pool.js` | **Active pipeline script** | Step 0 — unzips oracle-cards zip, maps Shandalar card names to Scryfall data, emits `shandalar-card-pool.json` |
| `sync-oracle-text.js` | **Active pipeline script** | Step 1 — reads `shandalar-card-pool.json`, generates `auto-patch-candidates.json` and `fuzzy-match-review.json` for human review |
| `apply-oracle-patch.js` | **Active pipeline script** | Step 2 — reads `auto-patch-candidates.json` + `fuzzy-match-review.json`, patches `src/data/cards.js` oracle text |
| `shandalar-card-pool.json` | **Generated output** | Produced by `process-card-pool.js`; not imported by any `src/` file; feeds Step 1 only |
| `auto-patch-candidates.json` | **Intermediate generated output** | Produced by `sync-oracle-text.js`; consumed by `apply-oracle-patch.js` (confirmed reference on line 14). **Not an archive candidate.** |
| `fuzzy-match-review.json` | **Intermediate generated output** | Produced by `sync-oracle-text.js`; consumed by `apply-oracle-patch.js` (line 15). Human-review file before applying patches. |
| `oracle-cards-20260419090229.zip` | **Source data file** | Scryfall bulk data download (April 2026); input to `process-card-pool.js` |
| `Shandalar Cardpool.txt` | **Reference/documentation** | Human-readable list of the Shandalar card pool; not processed by scripts |
| `SCRYFALL_STATUS.md` | **Reference/documentation** | Pipeline status notes |
| `processing-report.txt` | **Generated output** | Report produced by `process-card-pool.js`; one-time artifact per run |

**`scryfall/auto-patch-candidates.json`** — IS referenced by `apply-oracle-patch.js` on line 14 and generated by `sync-oracle-text.js` on line 180. **Not an archive candidate.** Active intermediate artifact in the two-step oracle sync pipeline.

**`scryfall/shandalar-card-pool.json`** — Confirmed: no `import` or `require` of this file exists in any `src/` file. It is used only as input to `sync-oracle-text.js`. Classification: **generated output, not yet integrated into src/**.

---

### prompts/

| File | Classification | Issues |
|------|----------------|--------|
| `prompts/claude.txt` | **Empty placeholder** | 1 line, no content |
| `prompts/chatgpt.txt` | **Empty placeholder** | 1 line, no content |
| `prompts/gemini.txt` | **Empty placeholder** | 1 line, no content |
| `prompts/copilot.txt` | **Empty placeholder** | 1 line, no content |
| `prompts/README.md` | **Active** | Role taxonomy and workflow; no stale references |
| `prompts/system-architect/README.md` | **Active** | Template-based; no phase-specific content |
| `prompts/gameplay-programmer/README.md` | **Active** | Template-based; no stale references |
| `prompts/content-designer/README.md` | **Stale path** | Line 369: `[keywords.js](../../src/keywords.js)` — wrong path. Actual location is `src/data/keywords.js` |
| `prompts/debug-analysis/README.md` | **Active** | Template-based; no stale references |

**Stale prompt candidates:** The four empty `.txt` files (`claude.txt`, `chatgpt.txt`, `gemini.txt`, `copilot.txt`) are placeholders with no content. They are not stale per se (they never had content) but are candidates for deletion or population.

---

## 3. Documentation Drift

### MECHANICS_INDEX.md — Missing Entries

The audit requested checks for five specific systems:

| System | Identifier | Present in MECHANICS_INDEX.md? |
|--------|-----------|-------------------------------|
| Priority Window | `OPEN_PRIORITY_WINDOW` / `PASS_PRIORITY` | **MISSING** |
| Sengir Vampire triggered ability | `sengirCounter` | Present — §1.2 and §13.1 ✅ |
| Force of Nature upkeep modal | `forceOfNatureUpkeep` / `UPKEEP_CHOICE_RESOLVE` | Present — §1.2 and §13.1 ✅ |
| Unlockables persistence | `shandalar_unlockables` | Present — §16.1 ✅ |
| Scryfall art integration | — | Present — §7.5 ✅ |

**Priority Window (`OPEN_PRIORITY_WINDOW` / `PASS_PRIORITY`) is the only missing entry.** `SYSTEMS.md` §18 has a full specification for the Priority Window system, and the GDD Phase 6 Deliverable 4 marks it complete. However, no corresponding entry exists in `MECHANICS_INDEX.md`. The MECHANICS_INDEX.md currently tops out at §16 (Persistence System) with no §17 or beyond entries despite SYSTEMS.md containing sections 17–21.

Additionally: `MECHANICS_INDEX.md` §1.1 (DuelCore System) lists `keywords.js` as a declared dependency:
```
### Dependencies
- rulesets.js (mode modifiers)
- keywords.js (ability interpretation)    ← inaccurate
- cards.js (data instantiation)
```
`DuelCore.js` does not import `keywords.js`. Keywords are matched as inline string literals. This dependency declaration is incorrect.

---

### SYSTEMS.md — Missing Sections

| Check | Result |
|-------|--------|
| Section 16 — Scryfall Art Integration | **Present** ✅ (lines 402–458) |
| Priority Windows / Instant-Speed Interaction | **Present** as §18 ✅ (lines 774–849) |

**Structural issue:** The `# End of SYSTEMS v1.0` header appears on line 493, immediately after the Dungeon System section (§9), but sections §17–§21 (Triggered Ability Pipeline, Priority Window, Holy Ground, Power Surge, Persistence) are all appended **after** this end-of-document marker. Sections 17–21 are therefore effectively beyond the stated end of the document, which is misleading for future readers.

**Phase 6 systems with no SYSTEMS.md section:**
- **CardPreviewPanel in DeckManager** (Phase 6 Deliverable 5, marked complete in both docs) — no SYSTEMS.md section. Documented only in `CURRENT_SPRINT.md` and `gdd.md`.
- **Channel, Fastbond, Kudzu, Regeneration mechanics** — all four are implemented in DuelCore.js (see §3 stub verification below) but have no SYSTEMS.md sections. `Power Surge` (a similar card-specific mechanic) has its own §20; by that precedent these four are missing their specifications.

---

### gdd.md — Discrepancies

**Deliverable 3 table (stub status) is incorrect:**

`gdd.md` §8 Phase 6 Deliverable 3 lists:

| Card | Status in gdd.md | Actual Status in DuelCore.js |
|------|-----------------|------------------------------|
| Power Surge (upkeep) | ✅ Complete | ✅ Implemented |
| Regeneration (aura) | Planned | **✅ Implemented** — line 665: grants `{G}: regenerate` activated ability to enchanted creature; `regenerate` effect handler at line 795 |
| Channel | Planned | **✅ Implemented** — line 905: sets `channelActive: true`; `CHANNEL_MANA` reducer at line ~1950 handles life-for-mana conversion; cleared at end of turn |
| Fastbond | Planned | **✅ Implemented** — lines 1693–1698: checks `fastbondActive`, skips land-play limit guard, deals 1 damage on each land beyond the first |
| Kudzu (upkeep) | Planned | **✅ Implemented** — full `kudzuUpkeep` case at lines 1365–1396: destroys enchanted land, re-attaches to random remaining land (seeded RNG), or moves to graveyard if no lands remain |

**Deliverable numbering inconsistency:**
`gdd.md` labels Priority Window as "Deliverable 4." `CURRENT_SPRINT.md` labels it "Deliverable 2." Both refer to the same feature. This is a cosmetic numbering drift between the two documents.

**Phase 6 completion state:**
`gdd.md` still shows `Phase 6 — Engine Depth 🔄 In Progress`. Given that all four remaining stubs (Deliverable 3) are now implemented, Phase 6 Deliverable 3 is complete. The document version 0.9 description also omits these four completions from its changelog entry.

---

### CURRENT_SPRINT.md — Stub Verification

The "Up Next (Phase 6)" section lists four remaining stubs. Verification against `src/engine/DuelCore.js`:

| Stub | Claimed Status | DuelCore.js Reality |
|------|---------------|---------------------|
| `regeneration` | Remaining stub | **Implemented.** `enchantCreature` + `mod.regenerationAura: true` path (line 665) attaches `{ cost: "G", effect: "regenerate" }` as an activated ability to the enchanted creature. The `regenerate` effect (line 795) sets `regenerating: true`; death prevention at line 257 fires when `regenerating` is set. |
| `channel` | Remaining stub | **Implemented.** `case "channel"` (line 905) sets `[caster].channelActive = true`. `CHANNEL_MANA` reducer case (line ~1950) checks `channelActive`, pays 1 life, adds 1 `{C}`. Cleared via `channelActive: false` at end of turn (line 1431). |
| `fastbond` | Remaining stub | **Implemented.** `PLAY_LAND` handler (line 1693) checks `fastbondActive = bf.some(x => x.id === "fastbond")` and skips the `landsPlayed >= 1` guard. Line 1698 applies 1 damage for each land beyond the first. |
| `kudzu` | Remaining stub | **Implemented.** `kudzuUpkeep` case (lines 1365–1396): destroys enchanted land via `zMove`, re-attaches Kudzu to a random remaining land using seeded RNG `(turn * 37 + lands.length * 13) % lands.length`, or moves Kudzu to graveyard if no lands remain. |

**Conclusion:** All four mechanics listed as "Up Next" are fully implemented. The `CURRENT_SPRINT.md` "Up Next" section is stale.

---

## 4. Recommended Actions

Prioritized by impact. **No source files were modified.**

1. **[High] Wire `App.jsx` to import `DuelScreen.tsx` instead of `DuelScreen.jsx`**, completing the design-system cutover — OR — document that the `.tsx` tree is explicitly deferred and add a `// WIP: not yet active` banner to `DuelScreen.tsx`. The current silent coexistence is ambiguous.

2. **[High] Update `docs/CURRENT_SPRINT.md` "Up Next" section** — remove `regeneration`, `channel`, `fastbond`, and `kudzu` from the stub list; all four are implemented in `DuelCore.js`.

3. **[High] Update `docs/gdd.md` Deliverable 3 table** — mark `Regeneration`, `Channel`, `Fastbond`, and `Kudzu` as ✅ Complete; update Phase 6 status to reflect completion of Deliverable 3; consider bumping to v1.0 if all deliverables are done.

4. **[High] Add a Priority Window entry to `docs/MECHANICS_INDEX.md`** (suggested §17) — covering `OPEN_PRIORITY_WINDOW`, `PASS_PRIORITY`, `priorityWindow`, `priorityPasser`, and `InstantPriorityBar.tsx`; link to SYSTEMS.md §18.

5. **[Medium] Delete `src/ui/interaction.ts`** — zero inbound imports; orphaned even within the tsx component tree it belongs to.

6. **[Medium] Delete `src/engine/events.js`** — zero inbound imports; appears to be a stub or abandoned module.

7. **[Medium] Delete `src/hooks/useKeyboard.js`** — zero inbound imports; superseded by `useKeyboardShortcuts.ts`.

8. **[Medium] Delete `src/game/CardEffects.js`** — zero inbound imports.

9. **[Medium] Delete `src/data/effectSchemas.js`** — zero inbound imports.

10. **[Medium] Delete `src/components/CardDisplay.jsx`** — zero inbound imports.

11. **[Medium] Fix `prompts/content-designer/README.md` line 369**: change `../../src/keywords.js` to `../../src/data/keywords.js`.

12. **[Medium] Fix SYSTEMS.md document structure** — move the `# End of SYSTEMS v1.0` marker to after §21 (Persistence System) so that sections 17–21 are not orphaned beyond the end-of-document marker.

13. **[Low] Add a SYSTEMS.md section for CardPreviewPanel** (Phase 6 Deliverable 5, currently only documented in CURRENT_SPRINT.md and gdd.md).

14. **[Low] Add SYSTEMS.md sections for Channel, Fastbond, Kudzu, Regeneration** — now that all four are implemented, they warrant the same specification coverage that Power Surge received in §20.

15. **[Low] Correct MECHANICS_INDEX.md §1.1 dependency list**: remove `keywords.js` as a stated DuelCore dependency, or add an import of `keywords.js` to `DuelCore.js`. The current state (listed as a dependency but never imported) is misleading.

16. **[Low] Delete or populate the four empty prompt files**: `prompts/claude.txt`, `prompts/chatgpt.txt`, `prompts/gemini.txt`, `prompts/copilot.txt` — all are 1-line empty placeholders with no content.

17. **[Low] After the DuelScreen.jsx → DuelScreen.tsx cutover**: delete `src/DuelScreen.jsx` and the entire `src/ui/duel/` directory (all six `.jsx` files there will become orphaned once `DuelScreen.tsx` is the active screen).
