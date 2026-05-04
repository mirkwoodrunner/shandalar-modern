# Shandalar: Modern Edition — Game Design Document
### Version 0.7 | Design Bible
### Last updated: Phase 5 complete (Scryfall art integration)

---

## Changelog

| Version | Phase | Notes |
|---------|-------|-------|
| 0.1 | Pre-build | Initial design document |
| 0.2 | Post-Phase 1 | Overworld implementation complete |
| 0.3 | Post-Phase 2 | Duel engine complete; ruleset abstraction, card DB, keyword registry, AI archetypes documented |
| 0.4 | Post-Phase 3 | Full source-code validation pass; corrected 14 inaccuracies; documented all stub effects, undocumented card DB entries, undocumented state fields, and animation status; Phase 3 integration complete |
| 0.5 | Post-Phase 4 | AI overhaul; 8 stub effects completed; castle modifier mechanics enforced; Arzakon final fight; run score screen; gem merchant; map town/castle labels; life flash animations; activated ability UI; Black Lotus color picker; bug fixes documented |
| 0.6 | Post-Phase 4 fixes | Mana burn per-phase fix; land layout (horizontal pip row); AI mana simulation; priority improvements: auto-center map, clipboard log, deck manager overhaul, always-attack AI |
| 0.7 | Phase 5 (Scryfall art) | Scryfall API card art integration complete; oldest classic-set printing (Alpha→4th Ed) fetched per card; session cache; emoji fallback on network failure |
| 0.8 | Phase 6 (partial) | Triggered ability pipeline activated: Sengir Vampire counter trigger, Force of Nature upkeep choice UI |

---

## Bug Fixes Log

### Phase 3 → Phase 4 fixes

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| B1 | Lands/permanents played from hand not appearing on battlefield | `PLAY_LAND` and `CAST_SPELL` (permanents) removed card from hand array before calling `zMove`, which searches all zones; card was gone by the time `zMove` ran | Inlined the battlefield arrival: construct arriving card object and push to `bf` in the same state update that removes from `hand` |
| B2 | Mulligan available on turn 5 | No guard in `MULLIGAN` case | Added turn/bf/landsPlayed check: mulligan blocked if `turn > 1`, `bf.length > 0`, or `landsPlayed > 0` |
| B3 | AI causes mana burn (taps all lands even with nothing to cast) | `aiDecide` tapped all untapped lands unconditionally at start of main phase | AI now only taps mana when it has a castable spell; taps minimum required; taps colored lands matching spell requirements first |
| B4 | AI never attacks | Strategy check required `aggro` or `life <= 8` (control) — combo/bomb strategies never attacked | AI now evaluates attack profitability for all strategies; attacks when lethal, when no profitable blocker exists, or when trade-up is available |
| B5 | Map height documented as 22 in v0.3 but stated as 20 in v0.2 | Initial GDD pre-build estimate | Confirmed: `MAP_H = 22` (32×22 grid) |
| B6 | Mana persists across phases, allowing cross-phase spending (e.g. Dark Ritual mana spent in MAIN2) | `burnMana` only called at UPKEEP and CLEANUP | Moved `burnMana` to fire at the **top of every phase transition** in `advPhase`, before new phase logic runs. Classic rule: mana empties at end of each phase. |
| B7 | Land cards not visible on battlefield (vertical columns growing infinitely on mobile) | Fixed-width 160px column with `flexWrap`, each land card 100px tall — column grew to 300px+ with 3+ lands | Replaced column layout with horizontal `LandPip` row (30×30px colored tokens, `overflowX:auto`). Opponent zone capped at `maxHeight:45vh`. Player battlefield uses `flex:"1 1 0"` with `minHeight:0` to properly shrink. |
| B8 | AI still caused mana burn after Phase 4 fix | `vCanPay()` check only fired after tapping colored lands; generic land tap loop had no stop condition for residual generic requirements | Rewrote tap loop to check `vCanPay()` before **each individual land tap** and break immediately when the condition is met |
| B9 | AI never attacked after Phase 4 fix | `attackIsGood` condition required `!wouldBeBlocked` — but nearly all creatures would be blocked, so this was almost always false | Simplified: AI always attacks with all eligible untapped, non-sick creatures. Removed complex profitability check that was too conservative. |

---

## Validation Notes (v0.4 audit — corrected from v0.3)

The following discrepancies were found between v0.3 and actual source code and have been corrected throughout this document:

| # | Location | v0.3 Claim | Actual (Source) | Status |
|---|----------|-----------|-----------------|--------|
| 1 | Map dimensions | 32×20 | 32×22 (MAP_H=22) | **Corrected** |
| 2 | Fog of war radius | "5-tile radius" | 5×5 box centered on player (radius=2 in each direction) | **Corrected** |
| 3 | Town shop stock | 6–11 cards | 6–10 cards (`6 + floor(rng()*5)`) | **Corrected** |
| 4 | Green creature count | 6 | 7 (Grizzly Bears was missing from table) | **Corrected** |
| 5 | Archetype display name | "Five-Color Bomb" | "Five-Color Chaos" (display name in code) | **Corrected** |
| 6 | Stone Rain | Not in card DB | Present in SHOP_CARDS (overworld shop only) | **Added** |
| 7 | `natural_order` id | Listed as Hurricane | Fixed in Phase 3: id corrected to `hurricane` in `src/data/cards.js` | **Fixed ✅** |
| 8 | `royal_decree` id | Listed as Animate Dead | Fixed in Phase 3: id corrected to `animate_dead` in `src/data/cards.js` | **Fixed ✅** |
| 9 | Stub effects | Not flagged | `powerSink`, `enchantCreature`, `pumpPower`, `gainFlying`, `lotusActivated`/`addMana3Any` fall through to default handler | **Documented** |
| 10 | Card instance fields | Missing `enchantments`, `tokens`, `exerted` | Present on card instance | **Added** |
| 11 | Duel state fields | Missing `animationQueue`, `awaitingTarget`, `firstStrikeHandled`, `opponentMulligan` | Present on initial state | **Added** |
| 12 | CSS animations | All listed as active | `cardPlay`, `tapAnim`, `damageFlash`, `healFlash`, `lifeChange` defined but not yet applied to components | **Corrected** |
| 13 | Activated abilities | Listed as Phase 3 UI work | Ability data is fully coded in card DB; Phase 3 adds the player-facing UI click handler | **Clarified** |
| 14 | Phase 3 scope | "Wire Phase 1 + Phase 2" | Integration complete — see Section 8 | **Updated** |

---

## 1. Vision Statement

**Shandalar: Modern Edition** is a faithful spiritual successor to MicroProse's 1997 classic — an open-world roguelite RPG wrapped around authentic Magic: The Gathering gameplay. The player is a young wizard traversing the mana-rich plane of Shandalar, building a deck from the ground up, exploring a procedurally generated world, and defeating five color-aligned mages before the planeswalker Arzakon breaks through the barrier and conquers the plane.

**Design pillars:**
- **Deck as character.** Your deck is your progression. Cards are stats, gear, and abilities all at once.
- **World as pressure.** The overworld is not safe. Mages send minions, towns fall, time matters.
- **Faithful to the source, open to the future.** Alpha–4th Edition card pool and classic rules by default; the ruleset abstraction layer enables Modern, Contemporary, and future formats without engine changes.
- **Playable in a browser.** React-based, no install, no server required. Card data is self-contained; Scryfall API integration is a Phase 5 enhancement.

---

## 2. Core Game Loop

```
START RUN
  └─ Choose starting color (W/U/B/R/G)
  └─ Choose wizard name
  └─ Receive starter deck (~15 cards, on-color)
  └─ Enter procedurally generated Shandalar world map (seeded RNG)

OVERWORLD LOOP
  ├─ Move wizard token across 32×22 square tile map (BFS pathfinding)
  ├─ Encounter: Monster / Town / Dungeon / Mage Castle / Mana Link Event
  │     └─ Encounters trigger a full DUEL via Phase 2 engine
  ├─ Win duel → gain cards, gold, dungeon clues, gems
  ├─ Lose duel → lose ante card, drop HP to 1
  ├─ Visit Town → buy/sell cards, rest (restore HP), get quests, consult sage
  ├─ Enter Dungeon → chain of duels, no HP restore, rares as loot
  └─ Defeat Mage Castle → that color's minions stop spawning

WIN CONDITION: All 5 Mage Castles defeated
LOSE CONDITIONS:
  - Any one mage establishes 3+ mana links (5 with Arzakon's Ward)
  - Arzakon completes the Spell of Dominion (timer/event based)
```

---

## 3. Systems Design

### 3.1 The Overworld Map *(Phase 1 — Complete)*

**Structure:**
- Procedurally generated **32×22** square tile grid per run *(corrected from 32×20)*
- Seeded RNG: mulberry32 algorithm — deterministic, reproducible worlds
- Terrain types: Plains, Forest, Swamp, Mountain, Island, Water (impassable border region)
- 8–10 towns per run, named from a 20-name Shandalar lore pool
- 6–8 dungeons per run, hidden until a sage reveals them
- 5 mage castles, each placed in a distinct quadrant to ensure geographic spread
- BFS pathfinding for click-to-move; one step executed per click
- Viewport scrolling (4 directional buttons + Center-on-player) with zoom toggle (1× / 0.8×)

**Town & structure name pools:**
- 20 town names: Ardestan, Veldatha, Morheim, Caelthas, Sunspire, Duskwall, Greymere, Thornhaven, Ironwake, Silverbend, Coldwater, Emberfield, Ashwood, Deepmoor, Starfall, Crestholm, Mistpeak, Dawncroft, Stonebridge, Oakhearth
- 12 dungeon names: Tomb of the Ancients, Cavern of Echoes, Vault of Shadows, The Sunken Library, Crypts of Mortum, Maze of Lost Souls, The Shattered Keep, Den of the Beast, Forgotten Catacombs, The Spiral Descent, Lair of the Wyrm, The Iron Labyrinth
- 5 castle names: White Keep (Delenia), Azure Tower (Xylos), Shadow Spire (Mortis), Fire Citadel (Karag), Root Throne (Sylvara)

**Mana Link System:**
- Each mage starts at 0 mana links
- Every 12 player moves, a living mage sends a minion to a random town
- Alert banner shows mage color, minion name, target town, and move countdown
- 10-move countdown; respond = rush toward town; dismiss = accept risk
- If countdown expires: mana link established; town tile shows color corruption overlay
- At 3 mana links (5 with Arzakon's Ward): **game over**
- Defeated mages no longer trigger events

**Movement:**
- Click any revealed, non-water tile to path toward it (one step per click)
- Terrain move costs: Plains 1, Forest 2, Mountain 2, Island 2, Swamp 3
- Magical Boots artifact: –1 cost per tile (minimum 1)
- Hunger: 8g food cost every 15 moves

**Fog of War:**
- Reveal box: 5×5 tiles centered on player (2 tiles in each cardinal direction + diagonals) *(corrected from "5-tile radius")*
- Dungeon tiles hidden until revealed by sage (25g)
- Fogged tiles are unclickable and blocked from BFS

**Starting Decks:**

| Color | HP | Gold | Key Cards |
|-------|----|------|-----------|
| White | 22 | 40g | Savannah Lions, Swords to Plowshares, White Knight, Serra Angel, Wrath of God |
| Blue  | 18 | 50g | Counterspell, Merfolk of the Pearl Trident, Air Elemental, Ancestral Recall |
| Black | 18 | 35g | Dark Ritual, Hypnotic Specter, Terror, Sengir Vampire, Demonic Tutor |
| Red   | 20 | 40g | Lightning Bolt, Goblin King, Fireball |
| Green | 22 | 30g | Llanowar Elves, Craw Wurm, Stream of Life |

*Note: Starting decks are ~15 cards (spells + lands). Deck grows to 40+ through play.*

---

### 3.2 The Duel System *(Phase 2 — Complete)*

#### 3.2.1 Ruleset Abstraction Layer

Three rulesets implemented as swappable config objects. Adding new formats requires only a new entry in `RULESETS`.

| Ruleset | Era | Stack | Mana Burn | Mulligan | Combat Dmg on Stack | Exile Zone | Deathtouch |
|---------|-----|-------|-----------|----------|---------------------|-----------|-----------|
| `CLASSIC` | Alpha–4th (1993–1995) | batch | ✓ | 7-card, no free | ✓ | ✗ | ✗ |
| `MODERN` | 8th Ed.+ (2003+) | LIFO | ✗ | London | ✗ | ✓ | ✓ |
| `CONTEMPORARY` | 2020+ | LIFO | ✗ | London | ✗ | ✓ | ✓ |

**Full config flags:**
```javascript
{
  manaBurn, freeMulligan, londonMulligan,
  stackType,           // "batch" | "lifo"
  planeswalkers, commandZone, scry, exileZone,
  deathtouch, infect, dayNight, companions,
  startingHandSize,    // 7
  startingLife,        // 20
  drawOnFirstTurn,     // false in Classic
  maxHandSize,         // 7
  poisonCountersToWin, // 10
  combatDamageOnStack, // true in Classic
}
```

#### 3.2.2 Zone System

| Zone | Notes |
|------|-------|
| `library` | Shuffled; top card drawn on draw step; empty = loss |
| `hand` | Visible to owner; face-down count shown for opponent |
| `battlefield` | Full permanent state tracking |
| `graveyard` | Ordered; accessible to Regrowth, Animate Dead |
| `exile` | Active when `ruleset.exileZone === true` |
| `stack` | LIFO (Modern+) or immediate resolution (Classic) |

#### 3.2.3 Turn Structure & Phases

```
UNTAP → UPKEEP → DRAW → MAIN1 →
DECLARE_ATTACKERS → DECLARE_BLOCKERS →
FIRST_STRIKE → COMBAT_DAMAGE → POST_COMBAT →
MAIN2 → END → CLEANUP
```

- `FIRST_STRIKE` phase conditionally skipped when no first strikers are present
- Extra turns via `extraTurns` counter on player state (Time Walk)
- Upkeep triggers: Juzam Djinn (1 self-damage), Force of Nature (pay GGGG or 8 damage)
- Cleanup: discard to max hand size; mana pools cleared (with burn in Classic)
- First player skips draw on turn 1 (`drawOnFirstTurn: false` in Classic)

#### 3.2.4 Mana System

- Mana pool: `{ W, U, B, R, G, C }` per player, tracked live
- `parseManaString(cost)` — tokenizes `"3WW"`, `"XR"`, `"2GGGG"`, etc.
- `canAfford(pool, cost)` — boolean check; handles generic mana from any color
- `spendMana(pool, cost)` — pure; drains in color-priority order (C→G→R→B→U→W for generic)
- X spells: player sets X via number input; AI defaults X to 3
- Mana burn: `clearManaBurn()` runs at phase transitions and Cleanup; deals unspent mana as damage in Classic
- Lands: click to tap; auto-selects `produces[0]`; multi-color lands produce first listed color
- Mana artifacts (Moxen, Sol Ring, etc.): click to tap, separate from land-tap flow

#### 3.2.5 Effect Resolver

All effects are dispatched from `resolveEffect(state, stackItem)`. Fully implemented:

| Effect ID | Example Cards | Notes |
|-----------|--------------|-------|
| `damage3` | Lightning Bolt | Targets creature or player |
| `damage5` | Lava Axe | Player only |
| `damageX` | Fireball | X from player input |
| `psionicBlast` | Psionic Blast | 4 to target, 2 to self |
| `chainLightning` | Chain Lightning | Copy mechanic is a stub; base 3 damage resolves |
| `counter` | Counterspell | Removes top stack item; top item put to GY |
| `draw3` | Ancestral Recall | Targets a player |
| `draw1` | Jayemdae Tome | Via activated ability |
| `drawX` | Braingeyser | X from player input |
| `gainLife3` | Healing Salve | Caster gains 3 |
| `gainLifeX` | Stream of Life | X from input |
| `bounce` | Unsummon | Returns to owner's hand |
| `exileCreature` | Swords to Plowshares | Controller gains power in life; uses GY in Classic |
| `destroy` | Terror, Dark Banishing | Restriction flags: `nonBlack`, `nonArtifactNonBlack` |
| `destroyArtifact` | Shatter | — |
| `destroyArtifactEnchantment` | Disenchant | — |
| `wrathAllCreatures` | Wrath of God | Both sides; no regen |
| `destroyAllLands` | Armageddon | Both sides |
| `pumpCreature` | Giant Growth | `mod:{power,toughness}` until end of turn |
| `addMana` | Dark Ritual | Adds mana string to pool |
| `tutor` | Demonic Tutor | Finds non-land from library; auto-shuffles |
| `discardX` | Mind Twist | Random discard from opponent; X from input |
| `wheelOfFortune` | Wheel of Fortune | Both players discard and draw 7 |
| `extraTurn` | Time Walk | Increments `player.extraTurns` |
| `regrowth` | Regrowth | Returns top GY card to hand |
| `hurricane` | Hurricane | X damage to all flyers and all players |
| `reanimate` | Animate Dead | Returns top creature from opponent GY under your control |
| `armageddonDisk` | Nevinyrral's Disk | Destroys all creatures, artifacts, enchantments |

**Stub effects — resolved in Phase 5:**

| Effect ID | Card | Implementation | Status |
|-----------|------|---------------|--------|
| `powerSink` | Power Sink | Counters target spell; taps all opponent lands and drains their mana pool. | ✅ Complete (Phase 4, confirmed) |
| `enchantCreature` | Holy Armor, Holy Strength, Lance, White Ward | Aura stored in `enchantments[]` on target permanent. `getPow`/`getTou`/`hasKw` read `mod`. Cascade removal via `zMove` when host dies. | ✅ Complete (Phase 5) |
| `pumpPowerEOT` | Shivan Dragon (activated R) | `ACTIVATE_ABILITY` routes `pumpPower` → `pumpPowerEOT`. Stored in `eotBuffs[]` as `{power:1}`. Purged at CLEANUP. | ✅ Complete (Phase 5) |
| `gainFlyingEOT` | Goblin Balloon Brigade (activated R) | `ACTIVATE_ABILITY` routes `gainFlying` → `gainFlyingEOT`. Stored in `eotBuffs[]` as `{keywords:["FLYING"]}`. Read by `hasKw`. Purged at CLEANUP. | ✅ Complete (Phase 5) |
| `addManaAny` | Birds of Paradise (activated T) | Taps bird, sets `pendingBop:true`. `BopColorPicker` modal dispatches `CHOOSE_BOP_COLOR`. Adds 1 mana of chosen color. | ✅ Complete (Phase 5) |
| `addMana3Any` | Black Lotus | `LotusColorPicker` modal. `CHOOSE_LOTUS_COLOR` adds 3 mana of chosen color. | ✅ Complete (Phase 4) |

**No remaining stub effects in the core card DB.**

**ID/name mismatches in card DB** *(code bugs to fix in Phase 4)*:

| Card ID | Display Name | Issue |
|---------|-------------|-------|
| `natural_order` | "Hurricane" | ID should be `hurricane` |
| `royal_decree` | "Animate Dead" | ID should be `animate_dead` |

#### 3.2.6 Keyword Registry

17 keywords defined, each tagged with Classic/Modern availability:

| Keyword | Classic | Modern | Ruleset-gated |
|---------|---------|--------|--------------|
| Flying | ✓ | ✓ | — |
| First Strike | ✓ | ✓ | — |
| Double Strike | — | ✓ | — |
| Trample | ✓ | ✓ | — |
| Haste | ✓ | ✓ | — |
| Vigilance | ✓ | ✓ | — |
| Lifelink | — | ✓ | — |
| Deathtouch | — | ✓ | `ruleset.deathtouch` |
| Reach | — | ✓ | — |
| Menace | — | ✓ | — |
| Protection | ✓ | ✓ | — |
| Banding | ✓ | — | Classic only |
| Flash | — | ✓ | — |
| Hexproof | — | ✓ | — |
| Shroud | ✓ | ✓ | — |
| Indestructible | — | ✓ | — |
| Infect | — | — | `ruleset.infect` (Contemporary only) |

#### 3.2.7 Combat System

1. **Declare Attackers** — player clicks untapped, non-sick creatures; Vigilance creatures don't tap
2. **Declare Blockers** — AI or player assigns; `canBlock2()` enforces Flying, Reach, Protection, Menace
3. **First Strike damage** — separate step when first strikers present
4. **Regular damage** — per attacker: unblocked hits player; blocked applies power to blockers and blockers' power to attacker; Trample carries excess; Lifelink gains life; Deathtouch forces lethal (Modern+)
5. **`checkCreatureDeath()`** — runs after every damage event; `damage ≥ toughness` → graveyard

#### 3.2.8 State Reducer

Pure `gameReducer(state, action)` — no side effects, fully serializable.

**Action types:**
```
TAP_LAND | TAP_ARTIFACT_MANA | PLAY_LAND | CAST_SPELL |
CAST_CREATURE | CAST_PERMANENT | RESOLVE_STACK |
DECLARE_ATTACKER | DECLARE_BLOCKER | ADVANCE_PHASE |
SELECT_CARD | SELECT_TARGET | AI_ACTIONS |
PASS_PRIORITY | MULLIGAN |
CHOOSE_LOTUS_COLOR | SET_PENDING_LOTUS | CHOOSE_BOP_COLOR | SET_PENDING_BOP
```

**Key pure functions:** `parseManaString`, `canAfford`, `spendMana`, `untapAll`, `clearManaBurn`, `drawCard`, `moveCard`, `checkCreatureDeath`, `resolveEffect`, `advancePhase`, `getPower`, `getToughness`, `getOwner`, `getBattlefieldCard`, `getAllCreatures`, `shuffleDeck`

#### 3.2.9 AI Engine

Strategy-aware per archetype. `aiDecide(state)` returns ordered action array dispatched via `AI_ACTIONS`.

**Decision sequence:** Tap mana → play land → cast best spell → declare attackers → declare blockers → respond to stack

| Strategy | Casting | Attacking | Blocking | Counter |
|----------|---------|-----------|----------|---------|
| `aggro` | Biggest affordable | Always | Death prevention only | Rare |
| `control` | Hold mana, cast cheap | Player ≤8 life | Smart trades | Yes |
| `combo` | Tutors for pieces | Rarely | Minimal | Passive |
| `bomb` | Biggest power card | 4+ power creatures | Favorable trades | Mixed |

**Blocker eval:** trade-up preferred → survive preferred → forced block if life ≤ attacker power

#### 3.2.10 Life Points (Overworld Integration — Phase 3 Complete)

- Player life total persists across overworld encounters
- HP restored at town inns: cost = (maxHP − currentHP) × 3g
- Dungeons: no HP restore between rooms
- Mage Castles: boss at 30–45 life; player enters at current overworld HP
- Arzakon final fight: player HP resets to 20 (only fight that resets HP)

---

### 3.3 The Card Database *(Phase 2 — Complete)*

Self-contained local database. Scryfall API art integration completed in Phase 5 (see §8 Phase 5 and §10 Aesthetic Direction).

**Card instance shape:**
```javascript
{
  // Definition fields (from DB):
  id, iid,                 // canonical id + unique instance id
  name, type, subtype,
  color,                   // "W"|"U"|"B"|"R"|"G"|""
  cmc, cost,               // e.g. "3WW", "XR", "0"
  power, toughness,        // null for non-creatures
  keywords,                // string[] of keyword registry IDs
  protection,              // color protected from (where applicable)
  text, effect, restriction,
  mod,                     // { power, toughness } for pump effects
  mana,                    // string for addMana effects
  produces,                // string[] for lands: ["W"] or ["W","U"]
  activated,               // { cost, effect, mana } — data complete, UI in Phase 4
  upkeep,                  // upkeep trigger handler ID
  triggered,               // triggered ability handler ID
  dynamic,                 // true = P/T computed at resolution (Plague Rats)
  rarity,                  // "C"|"U"|"R"
  // Runtime state (battlefield only):
  tapped, summoningSick, attacking, blocking,
  damage, counters,        // { "P1P1": 2, "M1M1": 1 }
  controller,
  enchantments,            // aura records attached: [{ iid, name, mod, controller, cardData }]; read by getPow/getTou/hasKw; cascade-removed by zMove
  eotBuffs,                // temporary buffs from activated abilities: [{ power?, toughness?, keywords? }]; purged at CLEANUP
  tokens,                  // tokens created by this permanent (array, currently unused)
  exerted,                 // exert mechanic placeholder (currently unused)
}
```

**Card counts by category:**

| Category | Count | Notable Cards |
|----------|-------|--------------|
| Basic Lands | 5 | Plains, Island, Swamp, Mountain, Forest |
| Dual Lands | 10 | All 10 original duals (Tundra, Underground Sea, Badlands, etc.) |
| White Creatures | 7 | Savannah Lions, White Knight, Serra Angel, Elder Land Wurm, Pearl Unicorn, Benalish Hero, Mesa Pegasus |
| Blue Creatures | 6 | Mahamoti Djinn, Air Elemental, Lord of Atlantis, Phantom Warrior, Prodigal Sorcerer, Merfolk of the Pearl Trident |
| Black Creatures | 7 | Hypnotic Specter, Sengir Vampire, Juzam Djinn, Drudge Skeletons, Black Knight, Royal Assassin, Plague Rats |
| Red Creatures | 5 | Goblin King, Shivan Dragon, Earth Elemental, Goblin Balloon Brigade, Mons's Goblin Raiders |
| Green Creatures | 7 | Llanowar Elves, Birds of Paradise, Craw Wurm, Force of Nature, Grizzly Bears, Giant Spider, Fyndhorn Elves *(corrected from 6)* |
| White Spells | 6 | Swords to Plowshares, Wrath of God, Armageddon, Disenchant, Holy Armor, Healing Salve |
| Blue Spells | 7 | Counterspell, Ancestral Recall, Time Walk, Braingeyser, Unsummon, Psionic Blast, Power Sink |
| Black Spells | 6 | Dark Ritual, Terror, Demonic Tutor, Mind Twist, Animate Dead (`id:royal_decree`†), Dark Banishing |
| Red Spells | 6 | Lightning Bolt, Fireball, Chain Lightning, Wheel of Fortune, Shatter, Lava Axe |
| Green Spells | 4 | Giant Growth, Stream of Life, Regrowth, Hurricane (`id:natural_order`†) |
| Artifacts | 9 | Black Lotus, Mox Pearl/Sapphire/Jet/Ruby/Emerald, Sol Ring, Jayemdae Tome, Nevinyrral's Disk |
| **Total (duel DB)** | **79** | |

*† = ID/name mismatch bug; to be corrected in Phase 4*

**Overworld shop-only cards** *(in `SHOP_CARDS`, not in duel `CARD_DB`)*:
- Stone Rain (destroy target land) — shop only, not playable in duels until added to CARD_DB in Phase 4

**Special mechanics:**
- **Plague Rats** — `dynamic:true`; P/T = count of Plague Rats on battlefield, computed at resolution
- **Prodigal Sorcerer** — `activated:{cost:"T",effect:"ping"}`; data complete, UI click handler Phase 4
- **Royal Assassin** — `activated:{cost:"T",effect:"destroyTapped"}`; data complete, UI in Phase 4
- **Juzam Djinn** — `upkeep:"selfDamage1"`; fully implemented
- **Force of Nature** — `upkeep:"forestChoice"`; stub (auto-damages; choice UI Phase 4)
- **Sengir Vampire** — `triggered:"vampireCounter"`; data defined, trigger handler Phase 4
- **Birds of Paradise** — `activated:{cost:"T",effect:"addManaAny"}`; any-color UI Phase 4

---

### 3.4 AI Archetypes *(Phase 2 — Complete)*

Six archetypes with curated ~40-card lists:

| Key | Display Name | Color | Strategy |
|-----|-------------|-------|---------|
| `WHITE_WEENIE` | White Weenie | W | aggro |
| `BLUE_CONTROL` | Blue Control | U | control |
| `BLACK_REANIMATOR` | Black Reanimator | B | combo |
| `RED_BURN` | Red Burn | R | aggro |
| `GREEN_STOMPY` | Green Stompy | G | aggro |
| `FIVE_COLOR_BOMB` | **Five-Color Chaos** *(display name in code)* | WUBRG | bomb |

*Note: The GDD previously called the final archetype "Five-Color Bomb" — the in-code display name is "Five-Color Chaos". Both refer to the same archetype. The key `FIVE_COLOR_BOMB` is canonical.*

---

### 3.5 Towns & NPCs *(Phase 1 — Complete)*

| Service | Frequency | Function |
|---------|-----------|---------|
| Card Shop | Always | 6–10 cards *(corrected from 6–11)*; unique stock per town |
| Inn | Always | Full HP restore; cost = (maxHP − HP) × 3g |
| Guild Hall | ~60% of towns | One of 5 quests; card or gold reward |
| Black Market | ~25% of towns | Rare cards at 1.5× price |
| Sage | ~50% of towns | Pay 25g to reveal one hidden dungeon |

**Five guild quests (fixed pool, randomly assigned per town):**

| Quest | Reward |
|-------|--------|
| Purge the Risen | Swords to Plowshares (card) |
| Recover the Tome | 60 gold |
| Defend the Gate | Wrath of God (card) |
| Chart the Wilds | 40 gold |
| The Lost Spell | Counterspell (card) |

*Note: Quest rewards are currently displayed only; completion tracking wires in Phase 3.*

**Town Siege Events:**
- Trigger: every 12 player moves, per living mage
- Banner shows: color, minion name, town name, moves remaining (10)
- Respond = rush; Dismiss = accept risk
- On timeout: mana link established, tile corruption overlay applied

---

### 3.6 Dungeons *(Phase 5 — Dungeon Crawl Map System implemented)*

**Structure:** 3–5 rectangular rooms connected by L-shaped CORRIDOR tiles on a 24×16 grid.
- Rooms are 4–8 tiles wide and 3–5 tiles tall, placed without overlap.
- Rooms are connected sequentially by L-shaped corridors (two-leg paths between room centers).
- Player starts in the center of the first room.
- EXIT entity placed in the center of the last room.

**Line-of-sight revelation:**
- On each move, a Bresenham raycast runs from the player's new position to every unrevealed FLOOR/CORRIDOR tile.
- Tiles with an unobstructed ray (no WALL cells crossed) become permanently revealed for that dungeon instance.
- Unrevealed tiles render as solid black; WALL tiles render as dark charcoal.

**Static enemy placement:**
- 1–2 ENEMY entities placed in each non-first room.
- Enemies are stationary; they do not move.
- Archetype weighted 60% toward the dungeon's dominant color; 40% random from full pool.
- Tier scales with room index: room 0 = tier 1, scaling to tier 3 in the final room.
- Stepping onto an enemy tile triggers a duel (context `dungeon_entity`).
- Winning returns the player to the dungeon map; enemy marked defeated.
- Losing ejects the player from the dungeon (HP → 1 per soft-permadeath rule).

**HP and restoration:**
- Player HP carries into and out of the dungeon.
- No HP restoration is available inside the dungeon.
- HP restores are only available at town inns.

**Six modifiers (all implemented):**

| ID | Name | Effect |
|----|------|--------|
| `POWER_STRUGGLE` | Power Struggle | Random card swaps between hands each turn |
| `CURSED_GROUND` | Cursed Ground | All creatures enter with –1/–1 counter |
| `MANA_SURGE` | Mana Surge | Both players gain +1 mana per turn |
| `SILENCE` | Silence | No instants may be cast |
| `TWILIGHT` | Eternal Twilight | No creatures may attack until turn 3 |
| `OVERLOAD` | Overload | All spells cost 1 less (minimum 1) |

**Loot:** 0–1 TREASURE entity per room. Rooms 0–1: 50% C / 30% U / 20% none. Rooms 2+: 20% C / 40% U / 40% R. Gold: 20 + (tier × 15)g.

**Clues:** 25g per sage consultation; reveals dungeon name, dominant color, one modifier/loot hint

---

### 3.7 Artifacts & Gems *(Phase 1 — Complete)*

| ID | Name | Effect | Source |
|----|------|--------|--------|
| `boots` | Magical Boots | Move cost –1 per tile | Defeat Sylvara |
| `amulet` | Amulet of Life | Max HP +5 | Defeat Mortis |
| `focus` | Mage's Focus | Draw 1 extra card at duel start | Defeat Karag |
| `ward` | Arzakon's Ward | Mana link threshold 3→5 | Defeat Delenia |
| `stone` | Scrying Stone | Free dungeon reveal per town visit | Defeat Xylos |

**Gems:** Rare currency; found in dungeon final rooms and events; gem merchant UI in Phase 4

---

## 4. The Five Mages

| Mage | Color | Archetype | Castle Name | Castle Modifier | Minions | Reward |
|------|-------|-----------|-------------|-----------------|---------|--------|
| Delenia | W | White Weenie | White Keep | *Holy Ground*: all creatures have protection from non-white | Holy Crusader, Serra's Knight | Arzakon's Ward |
| Xylos | U | Blue Control | Azure Tower | *Tidal Lock*: player casts only 1 spell/turn | Tidal Phantom, Xylos's Agent | Scrying Stone |
| Mortis | B | Black Reanimator | Shadow Spire | *Death's Embrace*: Mortis's creatures gain lifelink | Skeletal Minion, Mortis's Shade | Amulet of Life |
| Karag | R | Red Burn | Fire Citadel | *Inferno*: 1 damage to all players each end step | Goblin Horde, Karag's Raider | Mage's Focus |
| Sylvara | G | Green Stompy | Root Throne | *Overgrowth*: all lands tap for 2 mana | Vine Elemental, Sylvara's Chosen | Magical Boots |
| Arzakon | WUBRG | Five-Color Chaos | — | *Dominion*: 45 life; player HP resets to 20 | — | Win condition |

---

## 5. Monster Encounter Design *(Phase 1 — Complete)*

| Terrain | Color | Tier 1 Monster (HP) | Tier 2 Monster (HP) |
|---------|-------|--------------------|--------------------|
| Plains | W | Pegasus Cavalry (20) | Knight of the Keep (22) |
| Forest | G | Forest Spider (20) | Elder Druid (24) |
| Swamp | B | Risen Zombie (20) | Shadow Specter (22) |
| Mountain | R | Goblin Raider (18) | Mountain Ogre (24) |
| Island | U | Sea Serpent (20) | Tidal Sorcerer (22) |

**Difficulty scaling:** Moves 0–19: Tier 1. Moves 20–59: 50/50. Moves 60+: Tier 2. Mage Minions: 27 HP, rare bomb in deck.

**Win chance (stub duel, Phase 1):** Tier 1: 72%. Tier 2: 58%. (Phase 3 replaces stub with real duel engine.)

---

## 6. Progression & Run Score

**Within a run:** Soft permadeath; deck grows; no mana link forgiveness

**Score formula:**
```
Base:          1000 (win) / 0 (loss)
Per mage:     +50
Per dungeon:  +10
Per town saved: +5
Per card owned: +2
Power Nine:   +100
Per mana link: −25
Boss undefeated: −50
```

**Unlockables (Phase 4):**
- Defeat mage → their color starter deck improves
- Find Power Nine → that card's weight increases in future runs
- Beat game → Five-Color Chaos becomes a playable starter

---

## 7. React App Architecture

### Component Map (as built through Phase 3)

```
Phase 1 — Overworld  (shandalar.jsx)
<App>
 ├── <TitleScreen>      intro, color picker, wizard naming
 └── <Game>
      ├── <HUD>          HP bar, gold, gems, move count, mana link pips (5), artifacts
      ├── <MapTile>      terrain, fog state, structure icons, 🧙 token, corruption overlay
      ├── <TownModal>    tabs: Card Shop | Inn | Guild Hall | Sage | Black Market
      ├── <DungeonModal> name, rooms, modifier, known loot, enter/retreat
      ├── <CastleModal>  mage flavor, color border, challenge/withdraw
      ├── <EncounterModal> monster stats, engage/flee, outcome, win/lose result
      ├── <DeckManager>  binder ↔ deck, color filter, swap, 40-card warning
      ├── <ManaLinkAlert> timed banner, respond/dismiss
      ├── <LogPanel>     scrolling chronicle, type-colored entries
      └── Victory / Defeat overlays

Phase 2 — Duel Engine  (shandalar-duel.jsx)
<App>
 ├── <SetupScreen>       ruleset selector, player archetype, opponent archetype
 └── <DuelScreen>
      ├── <PhaseTracker>      all phases; active highlighted; combat = red-orange
      ├── <BattlefieldCard>   tapped rotation, damage counter, keyword badges, P/T, counter pips, sick overlay
      ├── <HandCard>          playability glow, selection lift, mana cost display
      ├── <ManaSymbol>        color-coded pip; used throughout
      ├── <ManaCost>          tokenized cost string → symbol array
      ├── <ManaPool>          live pool with colored pips
      ├── <GameLog>           type-colored entries, auto-scroll
      ├── <CardTooltip>       hover: full text, keyword explanations, P/T, rarity
      └── AI Engine           strategy-aware; setTimeout per opponent phase

Phase 3 — Integration  (shandalar-phase3.jsx)
<App>
 ├── <TitleScreen>       (from Phase 1, extended)
 └── <Game>              (Phase 1 overworld + Phase 2 duel wired together)
      ├── [All Phase 1 components]
      ├── <DuelScreen>    (Phase 2 engine, mounted on encounter/castle trigger)
      ├── Persistent HP   flows from overworld into duel startingLife
      ├── Card rewards    duel win drops card → binder
      ├── Dungeon chain   room-by-room duel sequence with modifier applied
      ├── Castle duels    mage archetype + castle modifier active
      └── Ante system     optional toggle; ante card tracked per duel

Dungeon Crawl (Phase 5 — new)
<DungeonHUD>       dungeon name, modifier, HP, gold, rooms cleared
<DungeonMap>       24×16 CSS grid; LOS revelation; keyboard movement; entity tokens
<TreasureModal>    gold + card rarity reveal on chest collection
DungeonGenerator   procedural room+corridor layout; seeded RNG; entity placement
```

### Duel State Shape (complete, including previously undocumented fields)

```javascript
{
  ruleset: RulesetConfig,
  phase: Phase,
  activePlayer: "player" | "opponent",
  priorityPlayer: "player" | "opponent",
  turn: number,
  landsPlayedThisTurn: number,
  opponentArchetype: ArchetypeConfig,

  player: {
    life: number,
    library: CardInstance[],
    hand: CardInstance[],
    battlefield: CardInstance[],
    graveyard: CardInstance[],
    exile: CardInstance[],
    manaPool: { W, U, B, R, G, C },
    poisonCounters: number,
    extraTurns: number,
    mulligansThisTurn: number,
  },
  opponent: { /* identical */ },

  stack: StackItem[],            // { id, card, caster, targets[], xValue }
  attackers: string[],           // iids of attacking creatures
  blockers: { [blockerIid]: attackerIid },

  // UI state:
  selectedCard: string | null,
  selectedTarget: string | null,

  // Engine bookkeeping (previously undocumented):
  animationQueue: any[],         // reserved for future animation sequencing
  awaitingTarget: null | { spell: StackItem, targetType: string },  // for targeted spell flow
  firstStrikeHandled: boolean,   // prevents double-processing first strike step
  opponentMulligan: boolean,     // tracks whether AI has taken its mulligan

  log: LogEntry[],               // { text, type, turn, phase }
  gameOver: null | { winner: "player"|"opponent", reason: string },

  // Color-picker flags (set true by engine; cleared by CHOOSE_*_COLOR actions):
  pendingLotus: false,           // set true when Black Lotus is tapped; cleared by CHOOSE_LOTUS_COLOR
  pendingBop: false,             // set true when Birds of Paradise is tapped; cleared by CHOOSE_BOP_COLOR
}
```

---

## 8. Build Phases

### Phase 1 — Overworld ✅ Complete
Procedural 32×22 map · BFS pathfinding · fog of war · town modal (5 tabs) · dungeon modal · castle modal · encounter system · mana link events · deck manager · HUD · victory/defeat overlays · title screen

### Phase 2 — Duel Engine ✅ Complete
Ruleset abstraction (3 rulesets) · 6-zone card system · full turn/phase sequence · mana system with burn · 79-card local DB · 17-keyword registry · full combat pipeline · 27 effect handlers (5 stubs) · strategy-aware AI (4 profiles, 6 archetypes) · card tooltip · phase tracker · live mana pool · game log · mulligan · standalone setup screen

### Phase 3 — Integration & Progression ✅ Complete
- Overworld encounters wire into Phase 2 duel engine
- Player HP persists from overworld into duel `startingLife`; returns to overworld after duel
- Duel win → card from opponent's pool deposited into binder
- Dungeon room chain: each room triggers duel; HP carries forward; no restore
- Dungeon modifier flags passed to duel state at room entry
- Mage castle fights: uses mage's archetype; castle modifier applied
- Ante system: optional toggle; both players ante top card; winner takes both
- Town card trade: 3 commons → 1 uncommon; 5 uncommons → 1 rare
- Quest completion tracking: quest state persists; reward granted on completion trigger
- Stone Rain added to duel `CARD_DB`
- ID bugs corrected: `natural_order` → `hurricane`; `royal_decree` → `animate_dead`

### Phase 4 — Boss Encounters, Endgame & Stub Resolution ✅ Complete

**AI Overhaul:**
- AI no longer taps all lands unconditionally; only taps mana when it has a castable spell; taps colored lands matching spell color requirements first
- All AI strategies now attack when profitable (lethal opportunity, no favorable blocker, trade-up available)
- AI skips casting removal when no valid creature targets exist (previously cast with null target)

**Stub Effects Completed:**
- `enchantCreature` (Holy Armor) — attaches aura, applies toughness bonus permanently to target creature
- `pumpPower` (Shivan Dragon activated) — adds +1/+0 to creature
- `gainFlying` (Goblin Balloon Brigade activated) — adds FLYING keyword to creature until end of turn
- `addMana3Any` / Black Lotus — produces 3 mana of chosen color via color-picker modal
- `powerSink` — counters spell and taps all opponent's lands + drains mana pool
- `ping` (Prodigal Sorcerer) — deals 1 damage to any target
- `destroyTapped` (Royal Assassin) — destroys target tapped creature
- `regenerate` (Drudge Skeletons) — marks creature with `regenerating: true` flag
- `reanimate` improved — now prefers opponent's graveyard; falls back to own; logs which creature was returned

**Castle Modifier Mechanics Enforced:**
- *Inferno* (Karag) — 1 damage to both players at end of each CLEANUP phase
- *Overgrowth* (Sylvara) — `TAP_LAND` action now routes through `applyOvergrowthTap()`; lands produce 2 mana when this modifier is active
- *Tidal Lock* (Xylos) — player cannot cast more than 1 spell per turn (`spellsThisTurn` counter added to state, reset each turn)
- *Death's Embrace* (Mortis) — opponent's creatures gain lifelink during combat (applied via `hasLifelink` flag in `resolveCombat`)
- *Holy Ground* (Delenia) — display-only; full protection enforcement Phase 5
- *Dominion* (Arzakon) — player HP reset to `ruleset.startingLife` before the fight

**New Systems:**
- Arzakon final fight — triggered after all 5 mages defeated; dramatic overlay with lore text; uses Five-Color Chaos archetype; player HP fully restored; awards 500g + 10 gems on victory
- Run Score Screen — full breakdown of score components: victory base, mages defeated, dungeons cleared, towns saved, cards collected, Powered Nine bonus, mana link penalties
- Gem Merchant — available in every town; offers: random rare card (3◆), max HP +5 (5◆), full heal (2◆)
- Activated Ability UI — clicking ACT button on battlefield cards with `activated` property triggers ability; targeted abilities enter pending-activate mode; cancel button provided
- Black Lotus Color Picker — modal with 5 color buttons; dispatches `CHOOSE_LOTUS_COLOR` action
- Life Flash Animations — `hurt()` now sets `lifeAnim: "damage"|"heal"` on player state; life counter applies `damageFlash` or `healFlash` CSS animation
- Map Labels — town names displayed under ⌂ icon; mage names displayed under ♔ icon with color glow; defeated castles show ✓
- Run Stat Tracking — `dungeonsCleared`, `townsSaved`, `manaLinksTotal`, `arzakonDefeated` tracked throughout run

**Deferred to Phase 5:**
- Sengir Vampire triggered counter (data defined, trigger handler deferred)
- Force of Nature upkeep choice UI (currently auto-damages)
- Birds of Paradise any-color selection (currently produces first color in `produces[]`)
- Holy Ground full protection enforcement in combat
- Unlockables persistence (localStorage)
- `enchantments` and `tokens` fields wired to aura/token mechanics

### Priority Improvements (Post-Phase 4) *(in progress)*

These items were identified during playtesting and are being addressed before Phase 5 polish:

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | GDD update with current build state | ✅ Done (v0.6) | This document |
| P2 | Auto-center map on player after each move | ✅ Done | `doMove` sets viewport to center on player; viewport state replaced with derived centering; no manual scroll needed |
| P3 | Copy game log to clipboard | ✅ Done | "📋 Copy Log" button in overworld sidebar Chronicle section; uses `navigator.clipboard.writeText` |
| P4 | AI mana burn fix (always-attack, correct mana sim) | ✅ Done | See B8, B9 in bug log |
| P5 | Deck Manager overhaul | ✅ Done | Full-featured: add from binder, remove to binder, sort by CMC/color/type, search filter, deck validation (min 40), land count warning |
| P6 | AI always attacks with all eligible creatures | ✅ Done | Simplified attack declaration: all untapped non-sick creatures attack every turn |

### Phase 6 — Engine Depth 🔄 In Progress
Triggered ability pipeline activated · Sengir Vampire +1/+1 counter trigger · Force of Nature upkeep choice modal · ON_UPKEEP_START event emission · RESOLVE_CHOICE reducer + AI auto-resolution · SILENCE modifier guard on upkeep triggers

---

### Phase 5 — Polish & Completion *(complete)*

**Completed:**
- ✅ `enchantCreature` — aura attachment system (`enchantments[]`, cascade removal, `getPow`/`getTou`/`hasKw` integration)
- ✅ `pumpPowerEOT` — Shivan Dragon activated pump, EOT duration via `eotBuffs[]`
- ✅ `gainFlyingEOT` — Goblin Balloon Brigade activated flying, EOT duration via `eotBuffs[]`
- ✅ `addManaAny` — Birds of Paradise any-color mana (`BopColorPicker`, `CHOOSE_BOP_COLOR`)
- ✅ `powerSink` — confirmed complete (Phase 4)
- ✅ Scryfall API card art — `src/utils/scryfallArt.js` + `src/utils/useCardArt.js` + `CardArtDisplay` in `Card.jsx`; fetches oldest classic-set printing (Alpha→Beta→Unlimited→Revised→4th Ed); session cache (one request per card name); double-faced card fallback; emoji fallback on any network or parse failure

**Remaining:**
- Sengir Vampire triggered counter (+1/+1 when a creature it damaged dies)
- Force of Nature upkeep choice UI (currently auto-damages; needs GGGG-or-8 prompt)
- Holy Ground full protection enforcement in combat
- Unlockables persistence (localStorage — run history, defeated mages, found Power Nine)
- Dungeon atmosphere overlays per modifier type
- LocalStorage save state (full run persistence across browser sessions)
- Additional card sets (Ice Age, Mirage) as optional pool expansions
- Quest completion tracking wired to in-game triggers (kill counts, tile reveals, etc.)
- First Strike combat phase (separate damage step for first strikers)
- Arzakon challenge mode (Five-Color Chaos as a selectable starter)
- Sound hook stubs for future audio

---

## 9. Design Decisions — Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| Ante mandatory? | Optional toggle | Respect players new to the mechanic |
| Mana burn? | On in Classic, off in Modern+ | Correct per ruleset; gated by abstraction |
| Stack? | Batch in Classic, LIFO in Modern+ | Both implemented via ruleset config |
| Permadeath? | Soft | HP loss meaningful without ending run |
| Card art? | Scryfall `art_crop` (Phase 5); emoji fallback always present | Classic-set priority (Alpha→4th Ed); zero-crash on network failure |
| Map style? | Square tile, 32×22 | Simpler to build; faithful to original |
| AI fairness? | Fair draws | Difficulty via deck quality and strategy |
| Multi-format? | Ruleset abstraction layer | Classic/Modern/Contemporary all live |
| Card DB source? | Self-contained local DB | No API dependency |
| Dynamic P/T? | Computed at resolution time via pure functions | Handles Plague Rats and counter states |
| Stone Rain? | Shop-only until Phase 3 | Missing from duel DB; corrected in Phase 3 |
| Card ID bugs? | Deferred to Phase 3 | `natural_order`/`royal_decree` corrected |

---

## 10. Aesthetic Direction

| Element | Implementation | Status |
|---------|---------------|--------|
| Display font | Cinzel / Cinzel Decorative | ✓ Applied |
| Body / flavor font | Crimson Text (italic for flavor) | ✓ Applied |
| Stats / costs font | Fira Code (monospace) | ✓ Applied |
| Background | `#050302` deep with radial gradient | ✓ Applied |
| UI chrome | Aged gold `#f0c040`, muted amber borders | ✓ Applied |
| Card type theming | Unique bg/border/accent per type (Creature=green, Instant=blue, Sorcery=purple, Artifact=grey, Land=brown) | ✓ Applied |
| Mana symbol pips | Color-filled circles per MTG convention; in costs, pools, HUD, mana link tracker | ✓ Applied |
| Phase tracker | Combat phases red-orange; non-combat gold; inactive near-invisible | ✓ Applied |
| Card tapping | `rotate(90deg)` CSS with 0.3s ease | ✓ Applied |
| Hover tooltips | Full card detail popup; keyword explanations; rarity badge; viewport-aware | ✓ Applied |
| Map tiles | Icon terrain + structure icons + 🧙 player token | ✓ Applied |
| `cardDraw` animation | Slide in from top on card draw | ✓ Applied |
| `combatGlow` animation | Pulsing red-orange on attacker cards | ✓ Applied |
| `phaseGlow` animation | Pulsing gold on active phase in tracker | ✓ Applied |
| `pulse` animation | Warning states (low life, AI thinking) | ✓ Applied |
| `stackEntry` animation | Slide in from right on stack push | ✓ Applied |
| `wizardPulse` animation | Glowing pulse on map player token | ✓ Applied |
| `fadeSlideIn` animation | Card tooltip entrance | ✓ Applied |
| `cardPlay` animation | Scale on cast | ⚠ Defined, not wired to components (Phase 5) |
| `tapAnim` animation | Rotate on tap | ⚠ Defined, not yet applied (tap uses CSS transform directly) |
| `damageFlash` animation | Shake + brightness on damage | ✓ Applied to life counter on damage |
| `healFlash` animation | Hue-rotate + scale on heal | ✓ Applied to life counter on heal |
| `lifeChange` animation | Scale pulse on life counter | ✓ Merged into damageFlash/healFlash |

| Card artwork | Scryfall `art_crop` image (oldest classic-set printing); `<img>` fills art area with `objectFit:cover`; 0.3s opacity fade-in; emoji icon at 30% opacity during load and on failure | ✓ Applied (Phase 5) |
| Rarity gem | Colored pip in card top-left corner (gold=rare, silver=uncommon, grey=common) | ✓ Applied (Phase 4) |
| Arzakon overlay | Deep purple radial gradient background with `arzakonPulse` glow on ⚡ icon | ✓ Applied (Phase 4) |
| Score screen | Staggered `scoreReveal` animation on score rows; gold total box | ✓ Applied (Phase 4) |
| Gem merchant | Purple-toned tab and item cards in town modal | ✓ Applied (Phase 4) |
| Activated ability button | Gold ACT badge on eligible battlefield cards | ✓ Applied (Phase 4) |
| Map town labels | Town name in small Cinzel text under ⌂ icon | ✓ Applied (Phase 4) |
| Map castle labels | Mage name in mana color under ♔ icon; ✓ when defeated | ✓ Applied (Phase 4) |
| `floatUp` animation | Defined for future floating damage numbers | ⚠ Defined, not yet applied |

---

*Document status: Living design bible. Validated against source code.*
*Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Next: Phase 5 — Polish & completion.*

---

## 11. Full Card Pool — Implementation Tiers

Source: Alpha through Antiquities/Arabian Nights (the original Shandalar game's card pool).
Total: ~450 cards across four implementation tiers.

### Tier Definitions

| Tier | Label | Count | Description |
|------|-------|-------|-------------|
| 1 | **Full** | ~150 | Effect maps cleanly to existing handlers; fully playable |
| 2 | **Simplified** | ~100 | Implemented with approximation (spirit of the card, not letter) |
| 3 | **Stub** | ~80 | In DB with text; resolves as no-op or generic effect |
| 4 | **Excluded** | ~120 | Too complex, format-breaking, or flavor-only for this build |

---

### Tier 1 — Full Implementation (already in DB or straightforward to add)

These cards use effect handlers that already exist or require only a new entry.

**Total cards in DB as of Session 2: ~200** (up from 80 in Phase 4)

**Already implemented (Phase 1–4):**
Plains, Island, Swamp, Mountain, Forest, all 10 dual lands, Savannah Lions, White Knight, Serra Angel, Mesa Pegasus, Benalish Hero, Merfolk of the Pearl Trident, Lord of Atlantis, Phantom Warrior, Air Elemental, Mahamoti Djinn, Prodigal Sorcerer, Hypnotic Specter, Sengir Vampire, Juzam Djinn, Drudge Skeletons, Black Knight, Royal Assassin, Plague Rats, Goblin King, Shivan Dragon, Earth Elemental, Goblin Balloon Brigade, Mons's Goblin Raiders, Llanowar Elves, Fyndhorn Elves, Birds of Paradise, Grizzly Bears, Giant Spider, Craw Wurm, Force of Nature, Swords to Plowshares, Wrath of God, Disenchant, Armageddon, Healing Salve, Holy Armor, Counterspell, Ancestral Recall, Time Walk, Braingeyser, Unsummon, Psionic Blast, Power Sink, Dark Ritual, Terror, Demonic Tutor, Mind Twist, Animate Dead, Dark Banishing, Lightning Bolt, Fireball, Chain Lightning, Wheel of Fortune, Shatter, Lava Axe, Stone Rain, Giant Growth, Stream of Life, Regrowth, Hurricane, Black Lotus, all 5 Moxen, Sol Ring, Jayemdae Tome, Nevinyrral's Disk

**To add — Tier 1:**
Balance, Ball Lightning, Berserk, Black Vise, Blue Elemental Blast, Boomerang, Channel, Clone, Control Magic, Copy Artifact, Counterspell (already done), Crusade, Cursed Land, Dark Banishing (done), Deathgrip, Demonic Hordes, Disintegrate, Drain Life, Drain Power, Earthquake, Erhnam Djinn, Fear, Fissure, Flashfires, Fog, Fork, Gaseous Form, Giant Tortoise, Gloom, Goblin Hero, Gray Ogre, Hill Giant, Holy Day, Howling Mine, Hurloon Minotaur, Instill Energy, Ironclaw Orcs, Jump, Karma, Keldon Warlord, Kird Ape, Kudzu, Land Tax, Lifeforce, Lifetap, Lord of the Pit, Lure, Mana Flare, Mana Short, Manabarbs, Meekstone, Nightmare, Northern Paladin, Orcish Artillery, Paralyze, Pestilence, Phantasmal Forces, Power Surge, Pyrotechnics, Raise Dead, Red Elemental Blast, Regeneration, Remove Soul, Resurrection, Rock Hydra, Sedge Troll, Shatterstorm, Sinkhole, Sleight of Mind, Smoke, Stone Giant, Stream of Life (done), Stromgald Cabal, Timber Wolves, Tranquility, Tsunami, Two-Headed Giant, Unholy Strength, Uthden Troll, Vampire Bats, Wall of Ice, Wall of Stone, War Mammoth, Water Elemental, Weakness, White Knight (done), Wild Growth, Winter Orb, Zombie Master

---

### Tier 2 — Simplified Implementation

Cards implemented with approximation — spirit preserved, complex edge cases dropped.

| Card | Simplification |
|------|---------------|
| Icy Manipulator | T: tap target permanent (skip "until your next untap step") |
| Clone | Copy top creature in opponent's GY (simplified target selection) |
| Control Magic | Take control of target creature (like Animate Dead) |
| Vesuvan Doppelganger | Enter as copy of target creature |
| Chaos Orb | Destroy target permanent (skip the physical flip mechanic) |
| Demonic Hordes | 3BB 5/5; upkeep BBB or lose a land |
| Fork | Copy target instant/sorcery (simplified — copy and resolve) |
| Fastbond | Play extra lands; 1 damage per extra land |
| Mana Vault | T: add CC; upkeep: pay 4 or take 1 damage |
| Candelabra of Tawnos | X, T: untap X target lands |
| Cursed Rack | Opponent's max hand size becomes 4 |
| Black Vise | Deals damage equal to cards in opponent's hand over 4 |
| Howling Mine | Both players draw an extra card each turn |
| Winter Orb | Players can only untap one land per turn |
| Meekstone | Creatures with power 3+ don't untap |
| Land Tax | Draw 3 basic lands if opponent has more lands |
| Sylvan Library | Draw 2 extra cards; pay 4 life or put 2 back |
| Balance | Each player discards to match lowest hand; sacrifice excess lands/creatures |
| Earthquake | X damage to all creatures without flying and each player |
| Pestilence | BB: 1 damage to all creatures and players |
| Icy Manipulator | 1,T: tap target permanent |
| Drain Life | Deal X damage to target; gain that much life |
| Disintegrate | Deal X damage; creature can't regenerate |
| Rock Hydra | X mana: enters as X/X; R: regenerate a head |
| Sedge Troll | 2/2 trampler; B: regenerate; +1/+1 if you control a swamp |
| Keldon Warlord | P/T = number of creatures you control |
| Gaea's Liege | P/T based on forests; can change land types |
| Verduran Enchantress | Draw a card when you cast an enchantment |

---

### Tier 3 — Stub (in DB, text displayed, no mechanical effect)

Cards that are too complex, situational, or format-warping for this build.
They appear in shops, booster packs, and binders but resolve as "no effect."

Stasis, Time Vault, Chaos Orb, Shahrazad, Contract from Below, Darkpact, Demonic Attorney, Lich, Personal Incarnation, Bronze Tablet, Jeweled Bird, Ring of Ma'rûf, Rebirth, Timetwister (simplified to Wheel of Fortune clone), Library of Alexandria (stub — too powerful as written), Moat (stub — prevents non-flyers attacking), Island Sanctuary, Ivory Tower, Forcefield, Gauntlet of Might, Mana Crypt (T: add CC, take 1 damage — similar to Mana Vault), Cyclopean Tomb, Gate to Phyrexia, Leviathan, Worms of the Earth

---

### Tier 4 — Excluded

Cards excluded due to: silver border, promo status, duplicate effect, or non-interactive design.

Nalathni Dragon (promo), all Kobold tokens (Crimson/Crookshank Kobolds — 0-mana tokens not appropriate for this engine), Chaos Orb (physical mechanic), Shahrazad (sub-game), Contract from Below (ante-dependent), all "lace" cards (Chaoslace, Deathlace, Lifelace, Purelace, Thoughtlace, Rooflace — color-changing instants with minimal value), Magical Hack (trivial), Sleight of Mind (trivial).

---

### Implementation Schedule

| Session | Target Cards | Notes |
|---------|-------------|-------|
| Session 1 | GDD update + Tier 1 batch 1 (~100 new cards) | Creatures, burn, removal, walls, Arabian Nights | ✅ Complete |
| Session 2 | Tier 1 batch 2 (~80 more cards) + all effect handlers + 10 archetypes + upkeep system | Enchantments, artifacts, upkeep, Arabian Nights | ✅ Complete |
| Session 3 | Tier 2 simplified + Tier 3 stubs + Phase 5 polish | Remaining complex cards |
| Future | Tier 3 stubs + Phase 5 polish | Complete the pool |

---
