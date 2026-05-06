# Current Sprint

## Phase 5 — Scryfall Art Integration ✅ Complete

### Deliverables

| File | Change |
|------|--------|
| `src/utils/scryfallArt.js` | Created — fetch utility + module-level session cache |
| `src/utils/useCardArt.js` | Created — React hook wrapping the fetch utility |
| `src/ui/shared/Card.jsx` | Modified — added `CardArtDisplay` component; replaced emoji spans in `FieldCard` and `HandCard` |

### How it works

1. On first render of any card, `useCardArt(card.name)` fires `fetchOldestArt`.
2. `fetchOldestArt` queries Scryfall for the oldest Alpha/Beta/Unlimited/Revised/4th-Ed printing (`order=released&dir=asc`). If no classic printing exists, falls back to `cards/named?exact=`.
3. `image_uris.art_crop` is extracted. Double-faced cards fall back to `card_faces[0].image_uris.art_crop`.
4. The URL is cached in a module-level `Map`. Subsequent renders of the same card name return instantly from cache with no async work (eliminates flicker).
5. On any network error, non-OK status, or missing field: the error is cached so the card is never retried this session; the UI falls back to the emoji icon at 65% opacity.
6. During loading, the emoji is shown at 30% opacity. When art loads, it fades in over 0.3s.

### Constraints respected

- Zero changes to `DuelCore.js`, `cards.js`, reducers, or any game-state shape.
- The `<img>` is not `position: absolute` — existing overlays (damage badge, sick overlay, ACT button) remain on top.
- `sm` prop treated as falsy when undefined.
- No loading spinners or skeleton frames.

### Documentation updated

- `docs/gdd.md` — v0.7 changelog entry; Phase 5 Completed list; Aesthetic Direction table; Design Decisions table; §3.3 note updated.
- `docs/SYSTEMS.md` — Section 16 (Scryfall Art Integration System) added.
- `docs/MECHANICS_INDEX.md` — §7.5 (Scryfall Art Display) added; §7.3 updated to reference §7.5.

---

## Phase 6 — Engine Depth (In Progress)

### Deliverable 1: Triggered Abilities — Sengir Vampire + Force of Nature ✅ Complete

| File | Change |
|------|--------|
| `src/data/cards.js` | Added `triggeredAbilities` to `sengir_vampire` and `force_of_nature` |
| `src/engine/DuelCore.js` | Added `ON_UPKEEP_START` emission; added `payMana` effect type; added `RESOLVE_CHOICE` reducer case; SILENCE modifier guard on upkeep triggers; `sengirDamagedIids` tracking in combat; `sengirCounter` trigger in `emitEvent` + `processTriggerQueue` (P1 complete) |
| `src/hooks/useDuel.js` | Exposed `resolveChoice` dispatcher |
| `src/ui/DuelScreen.jsx` | Added `ChoiceModal` component; AI auto-resolution of `pendingChoice` |

### Deliverable 2: Priority Window / Instant-Speed Interaction -- Complete

| File | Change |
|------|--------|
| `src/engine/DuelCore.js` | Added `priorityWindow` and `priorityPasser` to initial state; added `OPEN_PRIORITY_WINDOW` and `PASS_PRIORITY` reducer cases; added `ADVANCE_PHASE` blockade guard |
| `src/hooks/useDuel.js` | Exposed `openPriorityWindow` and `passPriority` dispatchers |
| `src/ui/ActionBar/InstantPriorityBar.tsx` | New component; shows player's castable instants and non-mana activated battlefield abilities; "Pass Priority" button |
| `src/DuelScreen.tsx` | Added `requestPhaseAdvance` smart-suppression helper; `useEffect` auto-advances phase when window closes; AI priority handler evaluates and passes immediately; all phase-advance call sites updated |

#### How it works

1. Whenever the player or AI requests a phase advance, `requestPhaseAdvance()` runs a smart-suppression check: if neither player has an instant in hand or a non-mana activated ability on the battlefield, `ADVANCE_PHASE` fires immediately (no window).
2. If either side has options, `OPEN_PRIORITY_WINDOW` is dispatched. The reducer sets `priorityWindow: true, priorityPasser: null`. The action is a no-op when `castleMod.name === 'SILENCE'` or `dungeonMod === 'SILENCE'`.
3. The AI priority handler fires via `useEffect([s.priorityWindow])`. It finds the first affordable instant in its hand, casts it (targeting the player), then immediately dispatches `PASS_PRIORITY({ who: 'o' })`.
4. The player sees `InstantPriorityBar` above the ActionBar (hidden once the player passes). Each instant in hand and each non-mana activated battlefield ability appears as a button. Clicking selects the card for the existing cast/activate flow. "Pass Priority" dispatches `PASS_PRIORITY({ who: 'p' })`.
5. When both sides have passed, the reducer sets `priorityWindow: false`. A `useRef`-guarded `useEffect` detects the `true -> false` transition and dispatches `ADVANCE_PHASE`.
6. `ADVANCE_PHASE` is blocked (returns state unchanged with a console warning) while `priorityWindow === true`.

### Deliverable 3: Force of Nature Upkeep Choice Modal (P3) -- Complete

| File | Change |
|------|--------|
| `src/data/cards.js` | Renamed `upkeep` key from `forestChoice` to `forceOfNatureUpkeep`; removed conflicting `triggeredAbilities` (double-handling bug) |
| `src/engine/DuelCore.js` | Added `pendingUpkeepChoice: null` to initial state; renamed `case "forestChoice":` to `case "forceOfNatureUpkeep":` with human-player modal path; AI auto-resolves inline; added `UPKEEP_CHOICE_RESOLVE` reducer case; `ADVANCE_PHASE` blocked when `pendingUpkeepChoice !== null` |
| `src/hooks/useDuel.js` | Exposed `resolveUpkeepChoice` dispatcher |
| `src/DuelScreen.jsx` | Added `ForceOfNatureUpkeepModal` component (Cinzel font, gold borders, dark background, disabled Pay button when < 4G); AI loop guarded with `if (state.pendingUpkeepChoice) return;`; modal rendered when `state.pendingUpkeepChoice && state.active === 'p'`; phase-advance buttons hidden while modal open |

### Deliverable P5: Unlockables Persistence (localStorage) -- Complete

| File | Change |
|------|--------|
| `src/OverworldGame.jsx` | `artifacts` state uses lazy initializer reading `shandalar_unlockables` from localStorage; `useEffect([artifacts])` writes owned flags on every change |

#### How it works

1. On mount, `useState` lazy initializer calls `localStorage.getItem("shandalar_unlockables")`.
2. If present and valid JSON, merges stored `owned` booleans onto canonical `OW_ARTS` definitions (id/name/icon/desc always from `OW_ARTS`).
3. On any `setArtifacts` call, `useEffect` serializes `{ id: owned }` pairs and writes to localStorage.
4. Both read and write wrapped in try/catch; errors logged via `console.error`; no user-visible alert; falls back to `OW_ARTS` defaults on any failure.
5. Sandbox mode: persistence active (sandbox players may test artifact effects).

### Up Next (Phase 6)
- Holy Ground full combat enforcement (currently display-only in castle modifier)
- Remaining stubs: `regeneration` (aura-granted activated ability), `channel`, `fastbond`, Power Surge upkeep, `kudzu`
