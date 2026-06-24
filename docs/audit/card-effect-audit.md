# Card Effect Implementation Audit
> Last updated: 2026-06-04 (Group P oracle-verified)  
> Source data: `docs/audit/stub-status.txt`, `docs/audit/gap-report.txt`  
> Re-run: execute the four node scripts in `card-stub-audit.md` prompt file

---

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| Implemented (real handler) | 458 | Working in-game |
| Engine-implemented, cards.js stub | 4 | channel, fastbond, kudzu, regeneration — handled in DuelCore.js; cards.js still shows `effect:"stub"` |
| Stub (lowercase) — unimplemented | 16 | In cards.js with `effect:"stub"` |
| Stub (uppercase) — unimplemented | 316 | In cards.js with `effect:"STUB"` |
| No effect field (vanilla/lands) | 138 | Correct — no handler needed |
| Missing from cards.js entirely | 328 | Need at minimum a new stub entry |
| **Total needing work** | **660** | 16 + 316 stubs + 328 missing |

Pool target: 901 cards. Current cards.js has 616 entries (573 match pool, 43 orphans).

---

## Audit Script Note

The audit script reads `src/data/cards.js` directly, not `DuelCore.js`. This produces 4 false positives in the stub list — cards whose effect is handled at the engine level but whose cards.js entry still shows `effect:"stub"`:

- `channel`
- `fastbond`
- `kudzu`
- `regeneration`

**Action:** Update these 4 entries in cards.js to use a non-stub identifier so future audit runs are clean.

---

## Section 1 — Unimplemented Stubs in cards.js

These cards have entries in cards.js but `effect:"stub"` or `effect:"STUB"`. Grouped by what handler they would share. The 4 engine-implemented stubs above are excluded.

---

### Group A — Protection / Damage Prevention

Shared handler pattern: `circleOfProtection(color, amount)`, `preventDamageFlat(amount)`, `gainLifeForDamage`

| Card | Effect |
|------|--------|
| `circle_of_protection_white` | {1}: prevent all damage from white sources this turn |
| `circle_of_protection_blue` | {1}: prevent all damage from blue sources this turn |
| `circle_of_protection_black` | {1}: prevent all damage from black sources this turn |
| `circle_of_protection_red` | {1}: prevent all damage from red sources this turn |
| `circle_of_protection_green` | {1}: prevent all damage from green sources this turn |
| `circle_of_protection_artifacts` | {1}: prevent all damage from artifact sources this turn |
| `forcefield` | {1}: prevent all but 1 damage from attacking creatures |
| `guardian_angel` | X: prevent X damage to target creature or player |
| `reverse_damage` | gain life equal to damage from one source this turn |
| `blood_of_the_martyr` | until end of turn, damage to creatures is dealt to you instead |
| `simulacrum` | prevent damage to you; deal same to target creature |
| `repentant_blacksmith` | protection from red |
| `conservator` | {3}: prevent 2 damage to you |
| `spiritual_sanctuary` | upkeep: pay {W} or {G} to prevent 1 damage |

---

### Group B — Ward / Protection Enchantments

Auras granting protection from a color or damage type. Extend `enchantCreature` handler with a `protectionColor` field.

| Card | Effect |
|------|--------|
| `black_ward` | enchanted creature gains protection from black |
| `blue_ward` | enchanted creature gains protection from blue |
| `green_ward` | enchanted creature gains protection from green |
| `red_ward` | enchanted creature gains protection from red |
| `white_ward` | enchanted creature gains protection from white |
| `artifact_ward` | enchanted creature gains protection from artifacts |
| `anti_magic_aura` | enchanted creature can't be targeted by spells |
| `gaseous_form` | enchanted creature can't deal or receive combat damage |
| `invisibility` | enchanted creature can only be blocked by walls |
| `fishliver_oil` | enchanted creature gains islandwalk |
| `venom` | enchanted creature: creatures it blocks or is blocked by are destroyed |
| `earthbind` | enchanted creature loses flying; takes 2 damage |
| `burrowing` | enchanted creature gains mountainwalk |
| `web` | enchanted creature loses flying; gets +0/+2 |
| `brainwash` | enchanted creature: attacking costs {3} |

---

### Group C — Global Enchantments (Battlefield-Wide Continuous Effects)

These require state-based continuous effects — more expensive architecturally than activated/triggered abilities.

| Card | Effect |
|------|--------|
| `blood_moon` | non-basic lands become Mountains |
| `living_lands` | Forests become 1/1 creatures |
| `kormus_bell` | Swamps become 1/1 creatures |
| `titaniass_song` | artifacts become 1/1 artifact creatures |
| `moat` | non-flying creatures can't attack |
| `kismet` | opponent's permanents enter tapped |
| `magnetic_mountain` | blue creatures can't fly; can't untap without paying {4} |
| `island_sanctuary` | skip draw step; can't be attacked except by flying/islandwalk creatures |
| `concordant_crossroads` | all creatures gain haste |
| `gauntlet_of_might` | mountains produce {RR}; red creatures get +1/+1 |
| `gloom` | white spells and enchantment activations cost {3} more |
| `damping_field` | activated abilities can only be used once per turn |
| `haunting_wind` | artifacts: take 1 damage per unused mana each upkeep |
| `dingus_egg` | whenever a land is destroyed, its controller takes 2 damage |
| `mana_flare` | whenever a land is tapped for mana, add one additional mana of that type |
| `great_defender` | white creatures may block any number of creatures |
| `fortified_area` | walls get +1/+0 and can attack |
| `hidden_path` | green creatures gain forestwalk |
| `angelic_voices` | your creatures get +1/+1 unless opponent controls non-humans/non-angels |
| `orcish_oriflamme` | attacking goblins get +1/+0 |
| `kobold_drill_sergeant` | kobolds get +0/+1 and first strike |
| `kobold_overlord` | kobolds gain first strike |
| `kobold_taskmaster` | kobolds get +0/+1 |
| `conversion` | mountains become plains |
| `blight` | target land doesn't untap during untap step |
| `flood` | target land doesn't untap; owner may pay {U} to untap it |
| `phantasmal_terrain` | target land becomes chosen basic land type |
| `evil_presence` | target land becomes a swamp |
| `stasis` | players don't untap; upkeep: pay {U} or sacrifice Stasis |
| `sunken_city` | blue creatures get +1/+1; upkeep: pay {UU} or sacrifice |
| `wanderlust` | enchanted creature's controller takes 1 damage each upkeep |
| `warp_artifact` | enchanted artifact's controller takes 1 damage each upkeep |
| `psychic_venom` | enchanted land: tapping it deals 2 damage to controller |
| `eternal_flame` | damage that would be prevented is dealt anyway |
| `greater_realm_of_preservation` | {W} or {G}: prevent 1 damage to you |
| `rabid_wombat` | gets +2/+2 for each aura attached to it |
| `angry_mob` | gets +X/+X where X = number of swamps opponents control |
| `castle` | Untapped creatures you control get +0/+2 (static, continuous — no EOT clause) |

---

### Group D — Creature-Triggered / Conditional Effects

Triggered abilities based on combat events, death, end-of-turn, or upkeep.

| Card | Effect |
|------|--------|
| `fallen_angel` | sacrifice a creature: +2/+1 until end of turn |
| `rukh_egg` | when destroyed, put a 4/4 flying Rukh token into play |
| `khabal_ghoul` | at end of turn, gets +1/+1 for each creature that died this turn |
| `scavenging_ghoul` | at end of turn, gets +1/+1 for each creature that died this turn |
| `creature_bond` | when enchanted creature dies, its controller takes damage = its toughness |
| `feedback` | when enchanted enchantment is destroyed, its controller takes 3 damage |
| `soul_net` | whenever a creature dies, you may pay {1} to gain 1 life |
| `throne_of_bone` | whenever a black spell is cast, you may pay {1} to gain 1 life |
| `iron_star` | whenever a red spell is cast, you may pay {1} to gain 1 life |
| `ivory_cup` | whenever a white spell is cast, you may pay {1} to gain 1 life |
| `crystal_rod` | whenever a blue spell is cast, you may pay {1} to gain 1 life |
| `wooden_sphere` | whenever a green spell is cast, you may pay {1} to gain 1 life |
| `syphon_soul` | deal 2 damage to each other player; gain that much life |
| `eternal_warrior` | when this creature attacks, untap it |
| `nether_shadow` | if in graveyard at upkeep with 2+ creatures above it, return to play |
| `carrion_ants` | {1}: +1/+0 until end of turn |
| `osai_vultures` | when a creature dies, put a carrion counter on this; {B}: remove all to regenerate |
| `fire_drake` | {R}: +1/+0 until end of turn; can't block |
| `crimson_manticore` | {R}{R}: deal 1 damage to target attacking or blocking creature |
| `infernal_medusa` | when this blocks or is blocked, that creature becomes tapped and doesn't untap |
| `pit_scorpion` | when this deals damage to a creature, that creature gets a poison counter |
| `nafs_asp` | when this deals damage to a player, they pay {B} next upkeep or take 1 more damage |
| `el_hajjaj` | gains life equal to damage it deals to players |
| `desert` | {T}: deal 1 damage to attacking creature; takes 1 damage if a creature blocks it |
| `elder_spawn` | upkeep: destroy target island or take 4 damage |
| `ghazban_ogre` | at start of game, player with most life gains control |
| `hasran_ogress` | if it doesn't attack each turn, its controller takes 2 damage |
| `cuombajj_witches` | {T}: deal 1 damage to target creature or player and 1 to another target |
| `brothers_of_fire` | {1}{R}{R}{T}: deal 1 damage to target creature or player; take 1 damage |
| `abomination` | at end of turn, destroy all non-black non-artifact creatures it blocked |
| `cockatrice` | deathtouch (implement via keyword) |
| `marsh_viper` | when this deals damage to a player, they get 2 poison counters |
| `ydwen_efreet` | whenever this blocks, flip a coin — tails: remove it from combat |
| `wyluli_wolf` | {G}: target creature gets +1/+1 until end of turn |
| `singing_tree` | {G}: target attacking creature loses flying until end of turn |
| `seeker` | {W}: blocking creatures don't deal damage this combat |
| `davenant_archer` | {W}: deal 1 damage to target attacking creature |
| `people_of_the_woods` | gets +0/+X where X = number of forests you control |
| `yawgmoth_demon` | first strike; upkeep: sacrifice an artifact or take 2 damage |
| `mold_demon` | first strike; upkeep: pay {BBBBBBB} or sacrifice this |
| `cosmic_horror` | first strike, trample; upkeep: pay {3}{B}{B}{B} or destroy this and take 7 damage |
| `tempest_efreet` | {R}{R}{R}: deal 7 damage to target; 50% chance to deal 7 to you instead |
| `time_elemental` | {2}{U}: return target permanent to owner's hand; if a land, take 3 damage |
| `tracker` | deals damage = prey's toughness; dies if that creature isn't destroyed |
| `banshee` | {X}{X}: deal X damage to each creature and player; {X}: regenerate |
| `winter_blast` | X: tap X creatures; flying creatures take 2 damage |
| `beasts_of_bogardan` | if an island is in play, gets +1/+1 |
| `marsh_gas` | during combat this turn, all creatures get -2/-0 |
| `argivian_blacksmith` | {W}{W}: regenerate target artifact creature |
| `miracle_worker` | {W}: remove one enchantment from target creature |
| `exorcist` | {W}: destroy target black creature |
| `hyperion_blacksmith` | {T}: tap or untap target artifact |
| `orcish_mechanics` | {T}: sacrifice an artifact; target artifact doesn't untap next turn |
| `ali_baba` | {R}: tap target Wall |
| `aladdin` | {R}{R}{R}{T}: gain control of target artifact |
| `old_man_of_the_sea` | can block any creature; when it deals combat damage, gain control of that creature |
| `drop_of_honey` | at beginning of upkeep, destroy the creature with the lowest power |
| `wall_of_tombstones` | At the beginning of your upkeep, change this creature's base toughness to 1 plus the number of creature cards in your graveyard |

---

### Group E — Life Gain / Drain (Upkeep and Triggered)

| Card | Effect |
|------|--------|
| `farmstead` | upkeep: if you control a plains, gain 3 life |
| `lifeblood` | whenever a mountain is tapped for mana, gain 1 life |
| `greed` | {B}: draw a card, lose 2 life |
| `book_of_rass` | {2}: draw a card, lose 1 life |
| `fountain_of_youth` | {2}: gain 1 life |
| `alabaster_potion` | {X}{W}: gain X life |
| `martyrs_of_korlis` | sacrifice: gain life equal to damage you've taken this turn |
| `blood_lust` | target creature gets +4/-4 until end of turn |
| `living_artifact` | whenever you gain life, put charge counters; {1}: remove a counter, gain 1 life |
| `dark_heart_of_the_wood` | sacrifice a forest: gain 3 life |
| `divine_offering` | destroy target artifact; gain life equal to its casting cost |

---

### Group F — Discard / Hand Disruption

| Card | Effect |
|------|--------|
| `amnesia` | target player reveals hand; discards all non-land cards |
| `mind_bomb` | each player discards any number; deal 3 minus cards discarded damage |
| `the_rack` | upkeep: if opponent has fewer than 3 cards, deal 3 minus hand size damage |
| `chains_of_mephistopheles` | if a player would draw outside their draw step, they discard first |
| `library_of_leng` | no max hand size; discarded cards may go on top of library |
| `cursed_rack` | opponents have a max hand size of 4 |
| `inquisition` | look at target player's hand; they discard a card |
| `winds_of_change` | each player shuffles hand into library; draws that many cards |
| `visions` | look at top 5 cards of target player's library |
| `sindbad` | {T}: draw a card; if not a land, discard it |
| `glasses_of_urza` | {T}: look at target player's hand |
| `natural_selection` | look at top 3 cards of target player's library; put back in any order |
| `cyclopean_tomb` | {2}: put a mire counter on target land; it becomes a swamp |

---

### Group G — Token Generation

| Card | Effect |
|------|--------|
| `serpent_generator` | {4}: put a 1/1 Snake token with poison into play |
| `the_hive` | {5}: put a 1/1 flying Wasp token into play |
| `boris_devilboon` | {1}{B}{R}: put a 1/1 Minor Demon token into play |
| `rukh_egg` | on death, put a 4/4 flying Rukh token (see Group D) |

---

### Group H — Sacrifice Effects

| Card | Effect |
|------|--------|
| `sacrifice` | target creature deals damage = its power to target creature or player |
| `gate_to_phyrexia` | upkeep: may sacrifice a creature to destroy target artifact |
| `transmute_artifact` | sacrifice an artifact; search for artifact with equal or lesser casting cost |
| `ashnods_transmogrant` | sacrifice a non-artifact creature: put a 3/3 artifact creature token into play |
| `rebirth` | each player sacrifices all but one creature; each player gains 10 life |
| `cleanse` | destroy all black creatures |
| `holy_light` | destroy all non-white creatures with toughness 2 or less |
| `scavenger_folk` | {G}{T}: destroy target artifact |

---

### Group I — Mana Batteries / Accelerators (Artifacts)

| Card | Effect |
|------|--------|
| `black_mana_battery` | {2}: add a charge counter; {T}: remove all counters, add {B} per counter removed |
| `blue_mana_battery` | same pattern for {U} |
| `red_mana_battery` | same pattern for {R} |
| `white_mana_battery` | same pattern for {W} |
| `green_mana_battery` | same pattern for {G} |
| `candelabra_of_tawnos` | {X}: untap X target lands |
| `urzass_mine` | {T}: add {C}{C} if you control Urza's Power-Plant and Tower, else {C} |
| `urzass_power_plant` | {T}: add {C}{C} if you control Urza's Mine and Tower, else {C} |
| `urzass_tower` | {T}: add {C}{C}{C} if you control Urza's Mine and Power-Plant, else {C} |
| `mishrass_workshop` | {T}: add {C}{C}{C}; can only be spent to cast artifacts |
| `fellwar_stone` | {T}: add one mana of a type an opponent's lands can produce |
| `celestial_prism` | {2}{T}: add one mana of any color |
| `jalum_tome` | {2}{T}: draw a card, discard a card |
| `urzass_chalice` | {X}: put X charge counters; {T}: add one mana for each counter |
| `coal_golem` | {3}{T} sacrifice: add {R}{R}{R} |
| `priest_of_yawgmoth` | {T}: sacrifice an artifact, add {B}{B} |
| `citanul_druid` | {T}: add {G} for each artifact an opponent controls |

---

### Group J — Artifact Synergies

| Card | Effect |
|------|--------|
| `animate_artifact` | enchanted artifact becomes a creature; P/T = casting cost |
| `copy_artifact` | becomes a copy of target artifact |
| `xenic_poltergeist` | {T}: target non-creature artifact becomes a 0/2 artifact creature |
| `ashnodss_battle_gear` | {T}: enchanted creature gets +2/-2 |
| `coral_helm` | {T}: target creature gets +2/-2 |
| `energy_flux` | each artifact costs {2} each upkeep or is sacrificed |
| `artifact_possession` | enchanted artifact: deals 2 damage to controller each time it's tapped |
| `artifact_blast` | counter target artifact spell |
| `phyrexian_gremlins` | {T}: tap target artifact |
| `relic_bind` | enchanted artifact: when tapped, target player gains 1 life or takes 1 damage |
| `mishrass_factory` | {1}: becomes a 2/2 Assembly Worker artifact creature until end of turn |
| `mishrass_war_machine` | {T}: 5/3 trample; upkeep: opponent may discard a card or it doesn't untap |
| `onulet` | when it dies, gain 2 life |
| `goblin_artisans` | {T}: flip a coin on artifact cast — heads: counter it; tails: copy it |
| `reconstruction` | return target artifact from graveyard to hand |
| `weakstone` | {T}: target creature gets -1/-0 until end of turn |
| `tawnosss_wand` | {T}: put a +1/+1 counter on target creature |
| `tawnosss_weaponry` | enchanted creature gets +1/+1 for each artifact an opponent controls |
| `sage_of_lat_nam` | {T}: sacrifice an artifact, draw a card |
| `reverse_polarity` | gain life equal to damage artifacts have dealt to you this turn |
| `tablet_of_epityr` | {T}: look at top 4 cards; put one on top, rest on bottom |
| `drafnass_restoration` | sacrifice an artifact creature: regenerate target artifact creature |
| `goblin_digging_team` | {T}: destroy target Wall |
| `battering_ram` | during combat against Walls, gets +0/+2; can't be blocked by Walls |

---

### Group K — Landwalk / Terrain

| Card | Effect |
|------|--------|
| `desert_nomads` | desertwalk; immune to Desert damage |
| `sandals_of_abdallah` | enchanted creature gains islandwalk |
| `ali_from_cairo` | your life total can't be reduced below 1 |
| `camel` | prevents Desert damage to creatures you control |
| `savaen_elves` | {T}: remove all enchantments from target land |

---

### Group L — Counterspells / Spell Interaction

| Card | Effect |
|------|--------|
| `avoid_fate` | counter target interrupt or enchantment spell targeting a green permanent |
| `power_leak` | enchanted enchantment: costs {2} more to maintain; upkeep: pay or take 1 damage |
| `artifact_blast` | counter target artifact spell (see Group J) |
| `riptide` | counter target blue spell |
| `lifeforce` | {G}{G}: counter target black spell |
| `siren_s_call` | all creatures must attack this turn; those that can't are destroyed |
| `word_of_binding` | tap up to X target creatures |
| `raging_river` | attacking creatures split into two groups; blockers must split accordingly |

---

### Group M — Draw / Library Manipulation

| Card | Effect |
|------|--------|
| `natural_selection` | look at top 3 of target library, put back in any order (see Group F) |
| `tablet_of_epityr` | top-of-library manipulation (see Group J) |
| `visions` | look at top 5 of target library (see Group F) |
| `library_of_leng` | no max hand size; discard goes on top (see Group F) |
| `sindbad` | {T}: draw, discard if not a land (see Group F) |

---

### Group N — Ante-Gated Cards

These cards require `anteEnabled` to be true to function. The ante system is live as a toggle in `OverworldGame.jsx` and `DuelCore.js`. These need implementation under that toggle — they are not excluded.

| Card | Effect |
|------|--------|
| `contract_from_below` | ante an additional card; draw 7 cards (ante must be on; also explicitly excluded per GDD — confirm before implementing) |
| `demonic_attorney` | ante; each player antes the top card of their library |
| `jeweled_bird` | ante this; opponent antes; you gain 1 life; shuffle this into library |
| `bronze_tablet` | ante; complex ownership swap (Legends) |

---

### Group O — Complex / Unique (Batch 4)

Cards with bespoke mechanics that don't share a handler pattern. Each needs its own implementation.

| Card | Effect | Complexity |
|------|--------|------------|
| `vesuvan_doppelganger` | enters as copy of target creature; upkeep: may change what it copies | High |
| `shapeshifter` | at start of turn, set P/T by paying {0}–{7} | Medium |
| `time_vault` | skip a turn to put a counter; {T}: remove counter, take extra turn | High |
| `stasis` | players don't untap; upkeep: pay {U} or sacrifice | High |
| `chains_of_mephistopheles` | replace draw effect with discard | High |
| `lich` | instead of losing life, sacrifice permanents; life gain = draw; damage = discard | High |
| `cyclopean_tomb` | mire counter management; counters removed on Tomb's removal | High |
| `dance_of_many` | {U}{U} upkeep: put a token copy of target non-token creature | High |
| `oubliette` | remove target creature from game until Oubliette leaves | High |
| `copy_artifact` | enters as copy of target artifact | High |
| `animate_artifact` | enchanted artifact becomes a creature | Medium |
| `primal_clay` | enters as 3/3, 2/2 flying, or 1/6 Wall — player chooses | Medium |
| `rock_hydra` | complex multi-counter growth; heads removed by damage, regrown with {R} | High |
| `raging_river` | combat assignment override based on attacker grouping | High |
| `pyramids` | remove counters from permanents to counter triggered abilities | High |

---

### Group P — Simple Low-Complexity Stubs (Quick Wins)

These have unique effects but map to a single short handler. Suitable for batch implementation.

| Card | Effect | Notes |
|------|--------|-------|
| `animate_wall` | Enchanted Wall can attack as though it didn't have defender | Aura; confirmed correct |
| `blessing` | {W}: enchanted creature gets +1/+1 until end of turn | Activated aura pump; confirmed correct |
| `morale` | Attacking creatures get +1/+1 until end of turn | **No first strike**; affects attackers only, not all creatures |
| `firebreathing` | {R}: enchanted creature gets +1/+0 until end of turn | Activated aura pump; confirmed correct |
| `killer_bees` | {G}: this creature gets +1/+1 until end of turn | Self-pump on creature; confirmed correct |
| `wall_of_water` | {U}: this creature gets +1/+0 until end of turn | Self-pump; confirmed correct |
| `wall_of_opposition` | **{1}**: this creature gets +1/+0 until end of turn | **Cost is generic {1}, not {R}** |
| `wall_of_dust` | Whenever this creature blocks a creature, that creature can't attack during its controller's next turn | Triggered detain-like effect on the blocked creature |
| `wall_of_light` | Protection from black | Static keyword; no activation; confirmed correct |
| `wall_of_wonder` | **{2}{U}{U}**: this creature gets +4/-4 until end of turn and can attack this turn as though it didn't have defender | **Cost is {2}{U}{U} not {3}{U}; P/T delta is +4/-4 not "attacks as 4/1"** |
| `will_o_the_wisp` | {B}: regenerate this creature | Confirmed correct |
| `giant_turtle` | {G}: regenerate this creature | Confirmed correct |
| `mountain_yeti` | Mountainwalk; protection from white | **Static keywords only -- no {R}: regenerate**; the regenerate ability does not exist on this card |
| `emerald_dragonfly` | {G}{G}: this creature gains **first strike** until end of turn | **Effect is first strike, not flying** |
| `pixie_queen` | Flying; **{G}{G}{G}{T}**: target creature gains flying until end of turn | **Flying is a static keyword; activation cost is {G}{G}{G}{T} not {G}; no "forest creature" restriction** |
| `pirate_ship` | {T}: this creature deals 1 damage to any target; this creature can't attack unless defending player controls an Island; when you control no Islands, sacrifice this creature | **Includes a state-based sacrifice trigger** |
| `the_brute` | Enchant creature; enchanted creature gets +1/+0; {R}{R}{R}: regenerate enchanted creature | **Entirely different card -- it is an Aura granting +1/+0 and regen, not a "loses landwalk" effect** |
| `radjan_spirit` | **{T}**: target creature loses flying until end of turn | **Cost is {T} (tap), not {G} (green mana)** |
| `spinal_villain` | **{T}**: destroy target blue creature | **Cost is {T} only, not {R}{R}{T}** |
| `detonate` | Destroy target artifact; it deals damage equal to its mana value to its controller | Confirmed correct |
| `shatterstorm` | Destroy all artifacts; they can't be regenerated | Confirmed correct |
| `inferno` | **Instant**; deals 6 damage to each creature and each player | **Card type is Instant, not Sorcery**; effect confirmed correct |
| `darkness` | Prevent all combat damage that would be dealt this turn | Black fog; confirmed correct |
| `sandstorm` | Deals 1 damage to each attacking creature | Green instant; confirmed correct |
| `jovial_evil` | Deals X damage to target opponent, where X is twice the number of white creatures that player controls | **Targets one opponent; damage scales with their white creatures -- NOT flat 2 damage to each white creature** |
| `cleanse` | Destroy all black creatures | Confirmed correct |
| `holy_light` | Nonwhite creatures get -1/-1 until end of turn | **Effect is -1/-1 pump, not "destroy toughness 2 or less"** |
| `ashes_to_ashes` | Exile two target non-artifact creatures; you lose 5 life | Confirmed correct |
| `storm_seeker` | **Instant**; deals damage to target player equal to the number of cards in that player's hand | **Card type is Instant, not Sorcery** |
| `acid_rain` | Destroy all Forests | Confirmed correct |
| `typhoon` | Deals 1 damage to each player for each Island that player controls | Confirmed correct |
| `syphon_soul` | Deals 2 damage to each other player; you gain life equal to the damage dealt this way | Confirmed correct |
| `bone_flute` | **{2}, {T}**: all creatures get -1/-0 until end of turn | **Fixed activation cost {2}{T}, not an X spell** |
| `backfire` | Enchant creature; whenever enchanted creature deals damage to you, it deals that much damage to itself | Confirmed correct |
| `immolation` | Enchant creature; enchanted creature gets +2/-2 | Static +2/-2 aura only -- no death trigger |
| `spirit_shackle` | Enchant creature; whenever enchanted creature becomes tapped, put a -0/-2 counter on it | **Trigger is "becomes tapped", not "attacks"; effect is a -0/-2 counter, not 2 damage** |
| `unstable_mutation` | Enchant creature; enchanted creature gets +3/+3; at the beginning of the upkeep of enchanted creature's controller, put a -1/-1 counter on that creature | Confirmed correct |
| `blood_lust` | Target creature gets +4/-4 until end of turn; if this would reduce toughness below 1, toughness becomes 1 instead | Confirmed correct |
| `energy_tap` | Tap target untapped creature you control; add colorless mana equal to that creature's **mana value** | **Mana added equals mana value (casting cost), not power** |
| `aspect_of_wolf` | Enchanted creature gets +X/+Y, where X is half the number of Forests you control rounded down, and Y is half rounded up | **Power and toughness bonuses differ when forest count is odd** |
| `atog` | Sacrifice an artifact: this creature gets +2/+2 until end of turn | Confirmed correct |
| `jandors_saddlebags` | {3}: untap target creature | Confirmed correct |
| `jandors_ring` | {2}, {T}, Discard the last card you drew this turn: Draw a card | Conditional loot -- requires discarding last drawn card; not a simple draw |
| `flying_carpet` | {2}, {T}: target creature gains flying until end of turn | Confirmed correct |
| `aladdins_ring` | {8}, {T}: this creature deals 4 damage to any target | Confirmed correct |
| `arena` | {1}: two target creatures fight | Confirmed correct |
| `ebony_horse` | {2}, {T}: Untap target attacking creature you control. Prevent all combat damage that would be dealt to and dealt by that creature this turn | Cost is {2} not {3}; also prevents all combat damage to/from that creature |
| `war_barge` | {3}: target creature gains islandwalk until end of turn | Confirmed correct |
| `oasis` | {T}: prevent 1 damage to target creature | Confirmed correct |
| `jade_statue` | {2}: this permanent becomes a 3/6 Golem artifact creature until end of turn | Confirmed correct |
| `helm_of_chatzuk` | {1}, {T}: target creature gains banding until end of turn | Confirmed correct |
| `mightstone` | Creatures you control get +1/+0 | Static continuous; confirmed correct |
| `amulet_of_kroog` | {2}, {T}: Prevent the next 1 damage that would be dealt to any target this turn | Damage prevention, not life gain; requires tapping |
| `staff_of_zegon` | {2}, {T}: target creature gets -1/-0 until end of turn | Confirmed correct |
| `divine_transformation` | Enchanted creature gets +3/+3 | Static aura pump; confirmed correct |
| `consecrate_land` | Enchanted land is indestructible and can't have other enchantments attached to it | Confirmed correct |
| `lifetap` | Whenever an opponent taps a Forest, you gain 1 life | Confirmed correct |
| `psionic_entity` | {T}: this creature deals 2 damage to any target; this creature deals 3 damage to itself | Confirmed correct |
| `murk_dwellers` | Whenever this creature attacks and isn't blocked, it gets +2/+0 until end of combat | Self-pump when unblocked |
| `jade_monolith` | {1}: The next time a source of your choice would deal damage to target creature this turn, that source deals that damage to you instead | Redirect is FROM creature TO you, not from you to creature |
| `ivory_guardians` | Protection from red; if an opponent controls a red permanent, this creature gets +1/+1 | Confirmed correct |
| `amrou_kithkin` | Can't be blocked by creatures with power 3 or greater | Off-by-one: threshold is 3, not 2 |
| `elves_of_deep_shadow` | {T}: add {B}; you lose 1 life | Confirmed correct |
| `bog_rats` | Can't be blocked by Walls | Confirmed correct |
| `uncle_istvan` | Prevent all damage that would be dealt to this creature by creatures | Damage prevention, NOT the protection keyword -- can still be targeted/enchanted/blocked |
| `giant_badger` | Whenever this creature blocks, it gets +2/+2 until end of turn | No regenerate; no damage prevention |
| `leviathan` | Trample; enters tapped, doesn't untap during your untap step; at upkeep you may sacrifice two Islands to untap it; can't attack unless you sacrifice two Islands when attackers are declared | Three separate restrictions; no islandwalk |
| `shield_wall` | Walls you control get +0/+3 until end of turn | Confirmed correct |

---

## Section 2 — Missing from cards.js (328 cards)

These are in the Shandalar pool (`scryfall/Shandalar Cardpool.txt`) but have no entry in cards.js at all. They cannot appear in any archetype or be drawn in-game. Each needs at minimum a stub entry.

See `docs/audit/gap-report.txt` for the full machine-generated list. Many are from Legends, The Dark, Fallen Empires, and Ice Age — sets present in the original MicroProse game as late additions beyond Alpha-through-Antiquities.

---

## Section 3 — GDD Exclusions (Do Not Implement)

Explicitly excluded per `docs/gdd.md §11`. Leave as permanent stubs or remove.

| Card | Reason |
|------|--------|
| `nalathni_dragon` | Promo card; not in retail set |
| Kobold tokens (Crimson/Crookshank Kobolds) | 0-mana tokens; incompatible with engine |
| `chaos_orb` | Physical flip mechanic — has stub + `pendingUIEvent` in cardHandlers.js |
| `shahrazad` | Requires sub-game; architecturally impossible |
| `contract_from_below` | Explicitly excluded per GDD despite ante system existing |
| All lace cards (chaoslace, deathlace, lifelace, purelace, thoughtlace) | Color-changing; excluded as trivial/disruptive |
| `magical_hack` | Trivial; excluded |
| `sleight_of_mind` | Trivial; excluded |

---

## Section 4 — Recommended Work Batches

### Batch 1 — Quick Wins (~80 cards)
Groups P, K, partial L and D where the handler already exists or is a trivial new case.
- All ward enchantments (Group B keywords)
- All fog variants (darkness, sandstorm, piety)
- All flat-damage spells (inferno, acid_rain, typhoon, etc.)
- All destroy-by-type (cleanse, shatterstorm, etc.)
- All pumpSelf activated abilities (killer_bees, wall_of_water, fire_drake, etc.)
- All addMana variants (elves_of_deep_shadow, coal_golem, etc.)
- All simple draw/discard (jalum_tome, jandorss_ring, etc.)

### Batch 2 — Upkeep / Spell-Cast Triggers (~30 cards)
Groups D (partial), E, and triggered life-gain artifacts (iron_star etc.).
Uses the existing upkeep handler system (Force of Nature / Power Surge / Kudzu precedent).

### Batch 3 — Continuous Effects (~20 cards)
Group C. Requires state-based effect layer. Blood Moon, Moat, Living Lands, Kismet, etc.
These touch how the engine reads land types and creature P/T — architecturally more expensive.

### Batch 4 — Complex / Unique (~15 cards)
Group O. Bespoke implementations. Rock Hydra, Vesuvan Doppelganger, Lich, etc.

---

*See `docs/audit/gap-report.txt` and `docs/audit/stub-status.txt` for raw machine output.*  
*See `card-stub-audit.md` for the re-run scripts.*
