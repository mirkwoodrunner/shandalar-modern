# Scryfall Integration Status

Last audited: 2026-05-03

---

## 1. Card Art Integration (Phase 5)

**Status: Complete**

- `src/utils/scryfallArt.js` — fetch utility with module-level session cache
- `src/utils/useCardArt.js` — React hook wrapping the fetch utility
- `src/ui/shared/Card.jsx` — `CardArtDisplay` used in `FieldCard` and `HandCard`

Art fetch strategy: oldest Alpha/Beta/Unlimited/Revised/4th Ed printing (`order=released&dir=asc`). Falls back to `cards/named?exact=` if no classic printing found. Uses `image_uris.art_crop`. Double-faced cards fall back to `card_faces[0].image_uris.art_crop`.

Fallback behavior: emoji icon at 65% opacity on any network error or missing field. Loading state shows emoji at 30% opacity with a 0.3s fade-in on load.

Confirmed imports: Yes — `src/utils/scryfallArt.js`, `src/utils/useCardArt.js`, and `src/ui/shared/Card.jsx` all exist. `Card.jsx` imports `useCardArt` at line 7 (`import useCardArt from '../../utils/useCardArt.js'`).

---

## 2. Card Database Pipeline

### Source files

| File | Description |
|------|-------------|
| `scryfall/oracle-cards-20260419090229.zip` | Scryfall bulk oracle card data |
| `scryfall/Shandalar Cardpool.txt` | Original Shandalar card pool list (901 entries) |
| `scryfall/process-card-pool.js` | Node.js processing script |
| `scryfall/shandalar-card-pool.json` | Generated output — 911 matched cards |
| `scryfall/processing-report.txt` | Last run report (generated 2026-04-20) |

### Pipeline run results (2026-04-20)

- Scryfall oracle cards loaded: 37,236
- Pool entries: 901
- Cards matched: 911
- Cards unmatched: 1 (Aswan Jaguar — not in Scryfall oracle data; Arabian Nights exclusive, expected)

### Integration into game

**`shandalar-card-pool.json` import status:** Not imported. Searched `src/` and all non-`scryfall/` JS/JSX/TS/TSX files — no `import` or `require` referencing `shandalar-card-pool.json` was found.

If not imported: the generated JSON exists but has not yet replaced or supplemented the hardcoded `CARD_DB` in `src/data/cards.js`. This is a pending task.

---

## 3. Slug Reconciliation

The processing script (Step 6) compares generated slugs against hardcoded IDs in `src/data/cards.js` and `ARCHIVE/shandalar-phase4.jsx`. Mismatches require human review before engine integration.

### Mismatch categories (from processing-report.txt)

**Intentional non-card IDs** (not errors — these are game constants, not card names):
- Basic lands: `PLAINS`, `FOREST`, `ISLAND`, `SWAMP`, `MOUNTAIN`, `WATER`
- Dungeon modifiers: `POWER_STRUGGLE`, `CURSED_GROUND`, `MANA_SURGE`, `SILENCE`, `TWILIGHT`, `OVERLOAD`
- Quest IDs: `q1`, `q2`, `q3`, `q4`, `q5`
- Town/shop tokens: `boots`, `amulet`, `focus`, `ward`, `stone`, `shop`, `sell`, `inn`, `sage`, `bm`, `gems`, `guild`
- Ruleset constants: `CLASSIC`, `MODERN`, `CONTEMPORARY`

**Abbreviated card IDs requiring review:**

| Existing ID | Closest pool match | Resolution status |
|-------------|-------------------|-------------------|
| `swords` | `swords_to_plowshares` | Resolved — abbreviated ID not in current CARD_DB; `swords_to_plowshares` used directly |
| `wog` | `wrath_of_god` | Resolved — abbreviated ID not in current CARD_DB; `wrath_of_god` used directly (note: pool report shows NO_MATCH for this slug; closest match annotation is manual) |
| `wrath` | `wrath_of_god` | Resolved — abbreviated ID not in current CARD_DB; `wrath_of_god` used directly |
| `ancestral` | `ancestral_recall` | Resolved — abbreviated ID not in current CARD_DB; `ancestral_recall` used directly |
| `goblin_balloon` | `goblin_balloon_brigade` | Resolved — abbreviated ID not in current CARD_DB; `goblin_balloon_brigade` used directly |
| `roc_of_kher` | `roc_of_kher_ridges` | Resolved — abbreviated ID not in current CARD_DB; `roc_of_kher_ridges` used directly |
| `two_headed_giant` | `two_headed_giant_of_foriys` | Resolved — abbreviated ID not in current CARD_DB; `two_headed_giant_of_foriys` used directly |
| `counterspell2` | `counterspell` | Resolved — not in current CARD_DB; `counterspell` used directly (duplicate removed) |
| `howling_mine2` | `howling_mine` | Resolved — not in current CARD_DB; `howling_mine` used directly (duplicate removed) |
| `karma2` | `karma` | Resolved — not in current CARD_DB; `karma` used directly (duplicate removed) |
| `death_ward2` | `death_ward` | Resolved — not in current CARD_DB; `death_ward` used directly (duplicate removed) |
| `resurrection2` | `resurrection` | Resolved — not in current CARD_DB; `resurrection` used directly (duplicate removed) |
| `frozen_shade2` | `frozen_shade` | Resolved — not in current CARD_DB; `frozen_shade` used directly (duplicate removed) |
| `ashes_to_ashes2` | `ashes_to_ashes` | Resolved — not in current CARD_DB; `ashes_to_ashes` used directly (duplicate removed) |
| `shatter2` | `shatter` | Resolved — not in current CARD_DB; `shatter` used directly (duplicate removed) |
| `regeneration2` | `regeneration` | Resolved — not in current CARD_DB; `regeneration` used directly (duplicate removed) |
| `disrupting_scepter2` | `disrupting_scepter` | Resolved — not in current CARD_DB; `disrupting_scepter` used directly (duplicate removed) |
| `tetravus2` | `tetravus` | Resolved — not in current CARD_DB; `tetravus` used directly (duplicate removed) |
| `erhnam_djinn2` | `erhnam_djinn` | Resolved — not in current CARD_DB; `erhnam_djinn` used directly (duplicate removed) |

**IDs with no pool match (may be removed or renamed cards):**

The following IDs are still present in `src/data/cards.js` and have NO_MATCH in the processing report (not in the intentional non-card list above). These cards exist in CARD_DB but the script could not match their slugs to the generated pool:

- `pearl_unicorn` — card named "Pearl Unicorn" (Scryfall canonical: "Pearled Unicorn")
- `phantom_warrior` — card in CARD_DB; no Scryfall pool match found by script
- `dandan` — card in CARD_DB (Dandân); encoding/diacritic mismatch likely
- `glacial_wall` — card in CARD_DB; no pool match found
- `juzam_djinn` — card in CARD_DB; no pool match found (Arabian Nights, may not be in oracle pool)
- `stromgald_cabal` — card in CARD_DB; no pool match found
- `fyndhorn_elves` — card in CARD_DB; Ice Age printing, present in Scryfall but not matched
- `gaea_liege` — card in CARD_DB ("Gaea's Liege"); apostrophe in name likely caused mismatch
- `dark_banishing` — card in CARD_DB; no pool match found
- `consume_spirit` — card in CARD_DB; no pool match found
- `lava_axe` — card in CARD_DB; no pool match found
- `nevinyrral_disk` — card in CARD_DB ("Nevinyrral's Disk"); apostrophe in name likely caused mismatch
- `tawnos_coffin` — card in CARD_DB ("Tawnos's Coffin"); apostrophe in name likely caused mismatch

### Overall resolution status

All abbreviated IDs (`swords`, `wog`, `wrath`, `ancestral`, `goblin_balloon`, `roc_of_kher`, `two_headed_giant`, and all `*2` duplicates) have been resolved — they are not present in the current `src/data/cards.js`. Full slugs are already used throughout.

The 13 NO_MATCH IDs listed above are still present in `src/data/cards.js` and require investigation. Most likely causes: apostrophes stripped differently, diacritics lost in normalization, or cards not in the Shandalar pool list. These IDs need manual verification against the pool and either slug correction or explicit exclusion.

---

## 4. Pending Work

- [ ] Decide whether to integrate `shandalar-card-pool.json` as replacement or supplement for hardcoded `CARD_DB`
- [ ] Resolve abbreviated card IDs (either patch `CARD_DB` to use full slugs, or add a slug override map to `process-card-pool.js`)
- [ ] Handle Aswan Jaguar — absent from Scryfall oracle data; decide whether to add manually or drop from pool
