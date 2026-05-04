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
| `src/engine/DuelCore.js` | Added `ON_UPKEEP_START` emission; added `payMana` effect type; added `RESOLVE_CHOICE` reducer case; SILENCE modifier guard on upkeep triggers |
| `src/hooks/useDuel.js` | Exposed `resolveChoice` dispatcher |
| `src/ui/DuelScreen.jsx` | Added `ChoiceModal` component; AI auto-resolution of `pendingChoice` |

### Up Next (Phase 6)
- Holy Ground full combat enforcement (currently display-only in castle modifier)
- Remaining stubs: `regeneration` (aura-granted activated ability), `channel`, `fastbond`, Power Surge upkeep, `kudzu`
- Priority window / instant-speed interaction
