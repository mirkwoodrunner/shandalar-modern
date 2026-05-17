# Current Sprint

## Phase 7 — Original Feature Parity ✅ Complete

### Deliverables

| Feature | File(s) Changed | Status |
|---------|----------------|--------|
| Food/hunger toggle | `OverworldGame.jsx`, settings UI | ✅ Done |
| World Magic spell system | `MapGenerator.js`, `OverworldGame.jsx`, `WorldMagicPanel.jsx` | ✅ Done |
| Post-duel card-vs-clue choice | `OverworldGame.jsx`, `PostDuelChoiceModal.jsx` | ✅ Done |
| Dungeons hidden until clued | `MapGenerator.js`, `OverworldGame.jsx`, tile render | ✅ Done |
| Enemy tier HP corrected | `MapGenerator.js` | ✅ Done |
| Henchman tier (unbribeable, HP 24–27) | `MapGenerator.js`, `OverworldGame.jsx` | ✅ Done |
| City conquest & liberation | `MapGenerator.js`, `OverworldGame.jsx`, `TownModal.jsx` | ✅ Done |
| Delivery quest type | `MapGenerator.js`, `OverworldGame.jsx`, `TownModal.jsx` | ✅ Done |

### Documentation updated
- `docs/gdd.md` — v1.1 changelog; Phase 7 section; §3.8–3.10 new subsections; §3.1 updated
- `docs/SYSTEMS.md` — Sections §23–§29 added; stale end-of-document marker replaced
- `docs/MECHANICS_INDEX.md` — §3.2–§3.6 added; §1.1 dependency list corrected
- `docs/CURRENT_SPRINT.md` — This file
- `README.md` — Phase 7 row added to status table

### Pre-existing drift fixed in this pass
- gdd.md Phase 6 row corrected to ✅ Complete
- MECHANICS_INDEX.md §1.1 removed incorrect keywords.js dependency on DuelCore
- SYSTEMS.md `# End of SYSTEMS v1.0` marker replaced with `# End of SYSTEMS v1.1`

---

## Up Next — Phase 8 Candidates

| Item | Priority | Notes |
|------|----------|-------|
| CSS animations (card play, tap, damage flash on board) | Medium | Defined but not applied to components |
| Save state (localStorage full run persistence) | High | No backend; localStorage approach established by unlockables |
| First Strike combat step | Medium | Keyword defined; combat step not implemented |
| Card pool expansion to ~250+ cards (Scryfall pipeline) | High | Pipeline built; gap closure pass needed |
| Random map events (Nomad's Bazaar, Diamond Mine, Gemcutter's Guild) | Medium | Referenced by World Magic system (Sword of Resistance); standalone event tiles add loop variety |
| Tome of Enlightenment: enforce 4-copy deck limit to make the spell meaningful | Low | No limit currently enforced; adds value to the spell |
| Staff of Thunder: wire to OverworldCanvas enemy removal | Low | TODO stub left in WorldMagicPanel; requires OverworldCanvas enemy removal API |
