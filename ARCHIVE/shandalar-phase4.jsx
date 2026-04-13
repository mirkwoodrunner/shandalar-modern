import { useState, useEffect, useCallback, useReducer, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#060402;overflow:hidden}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:#080502}
::-webkit-scrollbar-thumb{background:#4a3010;border-radius:3px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes cardIn{from{transform:translateY(-36px) rotate(-4deg);opacity:0}to{transform:none;opacity:1}}
@keyframes cardPlay{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes combatGlow{0%,100%{box-shadow:0 0 6px rgba(220,80,40,.5)}50%{box-shadow:0 0 18px rgba(220,80,40,.9)}}
@keyframes phaseGlow{0%,100%{box-shadow:0 0 6px rgba(200,160,40,.4)}50%{box-shadow:0 0 14px rgba(200,160,40,.8)}}
@keyframes pulse{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes stackIn{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}
@keyframes wizPulse{0%,100%{box-shadow:0 0 10px rgba(255,240,100,.8)}50%{box-shadow:0 0 22px rgba(255,240,100,1)}}
@keyframes alertDrop{from{transform:translateX(-50%) translateY(-18px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
@keyframes lifeHit{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes damageFlash{0%{filter:none;transform:translateX(0)}20%{filter:brightness(2.5) saturate(0.2);transform:translateX(-3px)}60%{transform:translateX(2px)}100%{filter:none;transform:translateX(0)}}
@keyframes healFlash{0%,100%{filter:none;transform:scale(1)}50%{filter:brightness(1.5) hue-rotate(100deg);transform:scale(1.05)}}
@keyframes cardPlayAnim{0%{transform:translateY(-10px) scale(1.06);opacity:.8}100%{transform:none;opacity:1}}
@keyframes scoreReveal{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes arzakonPulse{0%,100%{box-shadow:0 0 20px rgba(180,40,200,.4),0 0 60px rgba(80,0,100,.2)}50%{box-shadow:0 0 50px rgba(220,60,255,.8),0 0 100px rgba(120,0,160,.5)}}
@keyframes floatUp{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-40px);opacity:0}}
`;

// ═══════════════════════════════════════════════════════════════
// RULESETS  — swappable format configs
// ═══════════════════════════════════════════════════════════════
const RULESETS = {
  CLASSIC: {
    id:"CLASSIC", name:"Classic (Alpha–4th Ed.)",
    manaBurn:true, londonMulligan:false, stackType:"batch",
    planeswalkers:false, scry:false, exileZone:false,
    deathtouch:false, infect:false,
    startingHandSize:7, startingLife:20, drawOnFirstTurn:false,
    maxHandSize:7, combatDamageOnStack:true,
  },
  MODERN: {
    id:"MODERN", name:"Modern (8th Ed.+)",
    manaBurn:false, londonMulligan:true, stackType:"lifo",
    planeswalkers:false, scry:true, exileZone:true,
    deathtouch:true, infect:false,
    startingHandSize:7, startingLife:20, drawOnFirstTurn:false,
    maxHandSize:7, combatDamageOnStack:false,
  },
  CONTEMPORARY: {
    id:"CONTEMPORARY", name:"Contemporary (2020+)",
    manaBurn:false, londonMulligan:true, stackType:"lifo",
    planeswalkers:true, scry:true, exileZone:true,
    deathtouch:true, infect:true,
    startingHandSize:7, startingLife:20, drawOnFirstTurn:false,
    maxHandSize:7, combatDamageOnStack:false,
  },
};

// ═══════════════════════════════════════════════════════════════
// CANONICAL CARD DATABASE  (Phase 3: corrected IDs, Stone Rain added)
// ═══════════════════════════════════════════════════════════════
const CARD_DB = [
  // ── LANDS ──────────────────────────────────────────────────
  {id:"plains",    name:"Plains",   type:"Land",subtype:"Basic Plains",  color:"",cmc:0,cost:"",text:"T: Add W.",produces:["W"],rarity:"C"},
  {id:"island",    name:"Island",   type:"Land",subtype:"Basic Island",  color:"",cmc:0,cost:"",text:"T: Add U.",produces:["U"],rarity:"C"},
  {id:"swamp",     name:"Swamp",    type:"Land",subtype:"Basic Swamp",   color:"",cmc:0,cost:"",text:"T: Add B.",produces:["B"],rarity:"C"},
  {id:"mountain",  name:"Mountain", type:"Land",subtype:"Basic Mountain",color:"",cmc:0,cost:"",text:"T: Add R.",produces:["R"],rarity:"C"},
  {id:"forest",    name:"Forest",   type:"Land",subtype:"Basic Forest",  color:"",cmc:0,cost:"",text:"T: Add G.",produces:["G"],rarity:"C"},
  {id:"tundra",      name:"Tundra",         type:"Land",color:"",cmc:0,cost:"",text:"T: Add W or U.",produces:["W","U"],rarity:"R"},
  {id:"underground_sea",name:"Underground Sea",type:"Land",color:"",cmc:0,cost:"",text:"T: Add U or B.",produces:["U","B"],rarity:"R"},
  {id:"badlands",    name:"Badlands",        type:"Land",color:"",cmc:0,cost:"",text:"T: Add B or R.",produces:["B","R"],rarity:"R"},
  {id:"taiga",       name:"Taiga",           type:"Land",color:"",cmc:0,cost:"",text:"T: Add R or G.",produces:["R","G"],rarity:"R"},
  {id:"savannah",    name:"Savannah",        type:"Land",color:"",cmc:0,cost:"",text:"T: Add G or W.",produces:["G","W"],rarity:"R"},
  {id:"scrubland",   name:"Scrubland",       type:"Land",color:"",cmc:0,cost:"",text:"T: Add W or B.",produces:["W","B"],rarity:"R"},
  {id:"volcanic_island",name:"Volcanic Island",type:"Land",color:"",cmc:0,cost:"",text:"T: Add U or R.",produces:["U","R"],rarity:"R"},
  {id:"bayou",       name:"Bayou",           type:"Land",color:"",cmc:0,cost:"",text:"T: Add B or G.",produces:["B","G"],rarity:"R"},
  {id:"plateau",     name:"Plateau",         type:"Land",color:"",cmc:0,cost:"",text:"T: Add R or W.",produces:["R","W"],rarity:"R"},
  {id:"tropical_island",name:"Tropical Island",type:"Land",color:"",cmc:0,cost:"",text:"T: Add G or U.",produces:["G","U"],rarity:"R"},
  // ── WHITE CREATURES ─────────────────────────────────────────
  {id:"savannah_lions",name:"Savannah Lions",type:"Creature",subtype:"Cat",color:"W",cmc:1,cost:"W",power:2,toughness:1,keywords:[],rarity:"R",text:""},
  {id:"white_knight", name:"White Knight",  type:"Creature",subtype:"Knight",color:"W",cmc:2,cost:"WW",power:2,toughness:2,keywords:["FIRST_STRIKE","PROTECTION"],protection:"B",rarity:"U",text:"First strike, protection from black."},
  {id:"serra_angel",  name:"Serra Angel",   type:"Creature",subtype:"Angel",color:"W",cmc:5,cost:"3WW",power:4,toughness:4,keywords:["FLYING","VIGILANCE"],rarity:"U",text:"Flying, vigilance."},
  {id:"mesa_pegasus", name:"Mesa Pegasus",  type:"Creature",subtype:"Pegasus",color:"W",cmc:2,cost:"1W",power:1,toughness:1,keywords:["FLYING","BANDING"],rarity:"C",text:"Flying, banding."},
  {id:"benalish_hero",name:"Benalish Hero", type:"Creature",subtype:"Human",color:"W",cmc:1,cost:"W",power:1,toughness:1,keywords:["BANDING"],rarity:"C",text:"Banding."},
  {id:"pearl_unicorn",name:"Pearl Unicorn", type:"Creature",subtype:"Unicorn",color:"W",cmc:2,cost:"1W",power:1,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"elder_land_wurm",name:"Elder Land Wurm",type:"Creature",subtype:"Wurm",color:"W",cmc:8,cost:"5WWW",power:5,toughness:5,keywords:["TRAMPLE"],rarity:"R",text:"Trample."},
  // ── BLUE CREATURES ──────────────────────────────────────────
  {id:"merfolk_pearl",   name:"Merfolk of the Pearl Trident",type:"Creature",subtype:"Merfolk",color:"U",cmc:1,cost:"U",power:1,toughness:1,keywords:[],rarity:"C",text:"Islandwalk."},
  {id:"lord_atlantis",   name:"Lord of Atlantis",type:"Creature",subtype:"Merfolk",color:"U",cmc:2,cost:"UU",power:2,toughness:2,keywords:[],rarity:"R",text:"Other Merfolk get +1/+1 and have islandwalk."},
  {id:"phantom_warrior", name:"Phantom Warrior",type:"Creature",subtype:"Illusion",color:"U",cmc:3,cost:"1UU",power:2,toughness:2,keywords:[],rarity:"U",text:"Unblockable."},
  {id:"air_elemental",   name:"Air Elemental",type:"Creature",subtype:"Elemental",color:"U",cmc:5,cost:"3UU",power:4,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying."},
  {id:"mahamoti_djinn",  name:"Mahamoti Djinn",type:"Creature",subtype:"Djinn",color:"U",cmc:6,cost:"4UU",power:5,toughness:6,keywords:["FLYING"],rarity:"R",text:"Flying."},
  {id:"prodigal_sorcerer",name:"Prodigal Sorcerer",type:"Creature",subtype:"Human Wizard",color:"U",cmc:3,cost:"2U",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Deals 1 damage to any target.",activated:{cost:"T",effect:"ping"}},
  // ── BLACK CREATURES ─────────────────────────────────────────
  {id:"hypnotic_specter",name:"Hypnotic Specter",type:"Creature",subtype:"Specter",color:"B",cmc:3,cost:"1BB",power:2,toughness:2,keywords:["FLYING"],rarity:"U",text:"Flying. When deals combat damage, opponent discards a card at random."},
  {id:"sengir_vampire",  name:"Sengir Vampire",  type:"Creature",subtype:"Vampire",color:"B",cmc:5,cost:"3BB",power:4,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying. When a creature dealt damage by Sengir Vampire dies, put a +1/+1 counter on it.",triggered:"vampireCounter"},
  {id:"juzam_djinn",     name:"Juzam Djinn",     type:"Creature",subtype:"Djinn",  color:"B",cmc:4,cost:"2BB",power:5,toughness:5,keywords:[],rarity:"R",text:"At upkeep, Juzam Djinn deals 1 damage to you.",upkeep:"selfDamage1"},
  {id:"drudge_skeletons",name:"Drudge Skeletons",type:"Creature",subtype:"Skeleton",color:"B",cmc:2,cost:"1B",power:1,toughness:1,keywords:[],rarity:"C",text:"B: Regenerate.",activated:{cost:"B",effect:"regenerate"}},
  {id:"black_knight",    name:"Black Knight",    type:"Creature",subtype:"Knight",  color:"B",cmc:2,cost:"BB",power:2,toughness:2,keywords:["FIRST_STRIKE","PROTECTION"],protection:"W",rarity:"U",text:"First strike, protection from white."},
  {id:"royal_assassin",  name:"Royal Assassin",  type:"Creature",subtype:"Human Assassin",color:"B",cmc:3,cost:"1BB",power:1,toughness:1,keywords:[],rarity:"R",text:"T: Destroy target tapped creature.",activated:{cost:"T",effect:"destroyTapped"}},
  {id:"plague_rats",     name:"Plague Rats",     type:"Creature",subtype:"Rat",     color:"B",cmc:2,cost:"2B",power:0,toughness:0,keywords:[],rarity:"C",text:"P/T each equal to the number of Plague Rats in play.",dynamic:true},
  // ── RED CREATURES ───────────────────────────────────────────
  {id:"goblin_king",   name:"Goblin King",         type:"Creature",subtype:"Goblin",  color:"R",cmc:3,cost:"1RR",power:2,toughness:2,keywords:[],rarity:"R",text:"Other Goblins get +1/+1 and mountainwalk."},
  {id:"shivan_dragon", name:"Shivan Dragon",        type:"Creature",subtype:"Dragon",  color:"R",cmc:6,cost:"4RR",power:5,toughness:5,keywords:["FLYING"],rarity:"R",text:"Flying. R: +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"}},
  {id:"earth_elemental",name:"Earth Elemental",     type:"Creature",subtype:"Elemental",color:"R",cmc:5,cost:"3RR",power:4,toughness:5,keywords:[],rarity:"U",text:""},
  {id:"goblin_balloon", name:"Goblin Balloon Brigade",type:"Creature",subtype:"Goblin",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"C",text:"R: Gains flying until end of turn.",activated:{cost:"R",effect:"gainFlying"}},
  {id:"mons_goblin",   name:"Mons's Goblin Raiders",type:"Creature",subtype:"Goblin",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"C",text:""},
  // ── GREEN CREATURES ─────────────────────────────────────────
  {id:"llanowar_elves",   name:"Llanowar Elves",  type:"Creature",subtype:"Elf Druid",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Add G.",activated:{cost:"T",effect:"addMana",mana:"G"}},
  {id:"fyndhorn_elves",   name:"Fyndhorn Elves",  type:"Creature",subtype:"Elf Druid",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Add G.",activated:{cost:"T",effect:"addMana",mana:"G"}},
  {id:"birds_of_paradise",name:"Birds of Paradise",type:"Creature",subtype:"Bird",   color:"G",cmc:1,cost:"G",power:0,toughness:1,keywords:["FLYING"],rarity:"R",text:"Flying. T: Add one mana of any color.",activated:{cost:"T",effect:"addManaAny"}},
  {id:"grizzly_bears",    name:"Grizzly Bears",   type:"Creature",subtype:"Bear",    color:"G",cmc:2,cost:"1G",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"giant_spider",     name:"Giant Spider",    type:"Creature",subtype:"Spider",  color:"G",cmc:4,cost:"3G",power:2,toughness:4,keywords:["REACH"],rarity:"C",text:"Reach."},
  {id:"craw_wurm",        name:"Craw Wurm",       type:"Creature",subtype:"Wurm",    color:"G",cmc:6,cost:"4GG",power:6,toughness:4,keywords:[],rarity:"C",text:""},
  {id:"force_of_nature",  name:"Force of Nature", type:"Creature",subtype:"Elemental",color:"G",cmc:8,cost:"2GGGG",power:8,toughness:8,keywords:["TRAMPLE"],rarity:"R",text:"Trample. Upkeep: pay GGGG or take 8 damage.",upkeep:"forestChoice"},
  // ── WHITE SPELLS ────────────────────────────────────────────
  {id:"swords",       name:"Swords to Plowshares",type:"Instant",color:"W",cmc:1,cost:"W",text:"Exile target creature. Its controller gains life equal to its power.",effect:"exileCreature",rarity:"U"},
  {id:"wog",          name:"Wrath of God",         type:"Sorcery",color:"W",cmc:4,cost:"2WW",text:"Destroy all creatures. They can't be regenerated.",effect:"wrathAll",rarity:"R"},
  {id:"disenchant",   name:"Disenchant",           type:"Instant",color:"W",cmc:2,cost:"1W",text:"Destroy target artifact or enchantment.",effect:"destroyArtOrEnch",rarity:"C"},
  {id:"armageddon",   name:"Armageddon",           type:"Sorcery",color:"W",cmc:4,cost:"3W",text:"Destroy all lands.",effect:"destroyAllLands",rarity:"R"},
  {id:"healing_salve",name:"Healing Salve",        type:"Instant",color:"W",cmc:1,cost:"W",text:"Target player gains 3 life.",effect:"gainLife3",rarity:"C"},
  {id:"holy_armor",   name:"Holy Armor",           type:"Enchantment",subtype:"Aura",color:"W",cmc:2,cost:"1W",text:"Enchanted creature gets +0/+2.",effect:"enchantCreature",mod:{toughness:2},rarity:"C"},
  // ── BLUE SPELLS ─────────────────────────────────────────────
  {id:"counterspell", name:"Counterspell",  type:"Instant",color:"U",cmc:2,cost:"UU",text:"Counter target spell.",effect:"counter",rarity:"U"},
  {id:"ancestral",    name:"Ancestral Recall",type:"Instant",color:"U",cmc:1,cost:"U",text:"Target player draws three cards.",effect:"draw3",rarity:"R"},
  {id:"time_walk",    name:"Time Walk",     type:"Sorcery",color:"U",cmc:2,cost:"1U",text:"Take an extra turn after this one.",effect:"extraTurn",rarity:"R"},
  {id:"braingeyser",  name:"Braingeyser",   type:"Sorcery",color:"U",cmc:3,cost:"XUU",text:"Target player draws X cards.",effect:"drawX",rarity:"R"},
  {id:"unsummon",     name:"Unsummon",      type:"Instant",color:"U",cmc:1,cost:"U",text:"Return target creature to its owner's hand.",effect:"bounce",rarity:"C"},
  {id:"psionic_blast",name:"Psionic Blast", type:"Instant",color:"U",cmc:3,cost:"2U",text:"Deals 4 damage to any target and 2 damage to you.",effect:"psionicBlast",rarity:"U"},
  {id:"power_sink",   name:"Power Sink",    type:"Instant",color:"U",cmc:2,cost:"XU",text:"Counter target spell unless its controller pays X.",effect:"counter",rarity:"C"},
  // ── BLACK SPELLS ────────────────────────────────────────────
  {id:"dark_ritual",   name:"Dark Ritual",   type:"Instant",color:"B",cmc:1,cost:"B",text:"Add BBB.",effect:"addMana",mana:["B","B","B"],rarity:"C"},
  {id:"terror",        name:"Terror",        type:"Instant",color:"B",cmc:2,cost:"1B",text:"Destroy target non-artifact, non-black creature.",effect:"destroy",restriction:"nonArtifactNonBlack",rarity:"C"},
  {id:"demonic_tutor", name:"Demonic Tutor", type:"Sorcery",color:"B",cmc:2,cost:"1B",text:"Search your library for any card and put it in your hand, then shuffle.",effect:"tutor",rarity:"U"},
  {id:"mind_twist",    name:"Mind Twist",    type:"Sorcery",color:"B",cmc:2,cost:"XB",text:"Target player discards X cards at random.",effect:"discardX",rarity:"R"},
  {id:"animate_dead",  name:"Animate Dead",  type:"Enchantment",subtype:"Aura",color:"B",cmc:2,cost:"1B",text:"Return target creature from a graveyard to the battlefield under your control.",effect:"reanimate",rarity:"U"},
  {id:"dark_banishing",name:"Dark Banishing",type:"Instant",color:"B",cmc:3,cost:"2B",text:"Destroy target non-black creature.",effect:"destroy",restriction:"nonBlack",rarity:"C"},
  // ── RED SPELLS ──────────────────────────────────────────────
  {id:"lightning_bolt", name:"Lightning Bolt", type:"Instant",color:"R",cmc:1,cost:"R",text:"Lightning Bolt deals 3 damage to any target.",effect:"damage3",rarity:"C"},
  {id:"fireball",       name:"Fireball",       type:"Sorcery",color:"R",cmc:2,cost:"XR",text:"Deals X damage divided among any number of targets.",effect:"damageX",rarity:"C"},
  {id:"chain_lightning",name:"Chain Lightning",type:"Sorcery",color:"R",cmc:1,cost:"R",text:"Chain Lightning deals 3 damage to any target.",effect:"damage3",rarity:"C"},
  {id:"wheel_of_fortune",name:"Wheel of Fortune",type:"Sorcery",color:"R",cmc:3,cost:"2R",text:"Each player discards their hand, then draws seven cards.",effect:"wheelOfFortune",rarity:"R"},
  {id:"shatter",        name:"Shatter",        type:"Instant",color:"R",cmc:2,cost:"1R",text:"Destroy target artifact.",effect:"destroyArtifact",rarity:"C"},
  {id:"lava_axe",       name:"Lava Axe",       type:"Sorcery",color:"R",cmc:5,cost:"4R",text:"Lava Axe deals 5 damage to target player.",effect:"damage5",rarity:"C"},
  {id:"stone_rain",     name:"Stone Rain",     type:"Sorcery",color:"R",cmc:3,cost:"2R",text:"Destroy target land.",effect:"destroyTargetLand",rarity:"C"},
  // ── GREEN SPELLS ────────────────────────────────────────────
  {id:"giant_growth",  name:"Giant Growth",  type:"Instant",color:"G",cmc:1,cost:"G",text:"Target creature gets +3/+3 until end of turn.",effect:"pumpCreature",mod:{power:3,toughness:3},rarity:"C"},
  {id:"stream_of_life",name:"Stream of Life",type:"Sorcery",color:"G",cmc:2,cost:"XG",text:"Target player gains X life.",effect:"gainLifeX",rarity:"C"},
  {id:"regrowth",      name:"Regrowth",      type:"Sorcery",color:"G",cmc:2,cost:"1G",text:"Return target card from your graveyard to your hand.",effect:"regrowth",rarity:"U"},
  {id:"hurricane",     name:"Hurricane",     type:"Sorcery",color:"G",cmc:2,cost:"XG",text:"Deals X damage to each creature with flying and each player.",effect:"hurricane",rarity:"U"},
  // ── ARTIFACTS ───────────────────────────────────────────────
  {id:"black_lotus",    name:"Black Lotus",    type:"Artifact",color:"",cmc:0,cost:"0",text:"T, Sacrifice: Add three mana of any one color.",rarity:"R",activated:{cost:"T,sac",effect:"addMana3Any"}},
  {id:"mox_pearl",      name:"Mox Pearl",      type:"Artifact",color:"",cmc:0,cost:"0",text:"T: Add W.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"W"}},
  {id:"mox_sapphire",   name:"Mox Sapphire",   type:"Artifact",color:"",cmc:0,cost:"0",text:"T: Add U.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"U"}},
  {id:"mox_jet",        name:"Mox Jet",        type:"Artifact",color:"",cmc:0,cost:"0",text:"T: Add B.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"B"}},
  {id:"mox_ruby",       name:"Mox Ruby",       type:"Artifact",color:"",cmc:0,cost:"0",text:"T: Add R.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"R"}},
  {id:"mox_emerald",    name:"Mox Emerald",    type:"Artifact",color:"",cmc:0,cost:"0",text:"T: Add G.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"G"}},
  {id:"sol_ring",       name:"Sol Ring",       type:"Artifact",color:"",cmc:1,cost:"1",text:"T: Add CC.",rarity:"U",activated:{cost:"T",effect:"addMana",mana:"CC"}},
  {id:"jayemdae_tome",  name:"Jayemdae Tome",  type:"Artifact",color:"",cmc:4,cost:"4",text:"4, T: Draw a card.",rarity:"R",activated:{cost:"4,T",effect:"draw1"}},
  {id:"nevinyrral_disk",name:"Nevinyrral's Disk",type:"Artifact",color:"",cmc:4,cost:"4",text:"1,T,Sacrifice: Destroy all creatures, artifacts, and enchantments.",rarity:"U",activated:{cost:"1,T,sac",effect:"armageddonDisk"}},

  // ── TIER 1 NEW ADDITIONS ─────────────────────────────────────────────────────

  // ── WHITE CREATURES (new) ──
  {id:"white_ward",      name:"White Ward",       type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",  text:"Enchanted creature has protection from white.",effect:"enchantCreature",mod:{protection:"W"},rarity:"U"},
  {id:"holy_strength",   name:"Holy Strength",    type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",  text:"Enchanted creature gets +1/+2.",effect:"enchantCreature",mod:{power:1,toughness:2},rarity:"C"},
  {id:"crusade",         name:"Crusade",          type:"Enchantment",color:"W",cmc:2,cost:"WW", text:"All white creatures get +1/+1.",effect:"globalPump",targets:"white",mod:{power:1,toughness:1},rarity:"R"},
  {id:"karma",           name:"Karma",            type:"Enchantment",color:"W",cmc:4,cost:"3W", text:"At the beginning of each player's upkeep, Karma deals damage equal to the number of swamps they control.",effect:"karmaUpkeep",rarity:"U"},
  {id:"wrath",           name:"Wrath of God",     type:"Sorcery",    color:"W",cmc:4,cost:"2WW",text:"Destroy all creatures. They can't be regenerated.",effect:"wrathAll",rarity:"R"},
  {id:"balance",         name:"Balance",          type:"Sorcery",    color:"W",cmc:2,cost:"1W", text:"Each player chooses a number of lands they control and discards the rest, then each player discards cards to match the lowest hand size.",effect:"balance",rarity:"R"},
  {id:"holy_day",        name:"Holy Day",         type:"Instant",    color:"W",cmc:1,cost:"W",  text:"Prevent all combat damage that would be dealt this turn.",effect:"fog",rarity:"C"},
  {id:"fog",             name:"Fog",              type:"Instant",    color:"G",cmc:1,cost:"G",  text:"Prevent all combat damage that would be dealt this turn.",effect:"fog",rarity:"C"},
  {id:"resurrection",    name:"Resurrection",     type:"Sorcery",    color:"W",cmc:4,cost:"3W", text:"Return target creature from your graveyard to the battlefield.",effect:"reanimateOwn",rarity:"U"},
  {id:"raise_dead",      name:"Raise Dead",       type:"Sorcery",    color:"B",cmc:1,cost:"B",  text:"Return target creature from your graveyard to your hand.",effect:"regrowthCreature",rarity:"C"},
  {id:"reverse_damage",  name:"Reverse Damage",   type:"Instant",    color:"W",cmc:3,cost:"2W", text:"The next time a source would deal damage this turn, prevent that damage and gain that much life.",effect:"gainLife6",rarity:"R"},
  {id:"northern_paladin",name:"Northern Paladin", type:"Creature",subtype:"Human Knight",color:"W",cmc:4,cost:"2WW",power:3,toughness:3,keywords:[],rarity:"R",text:"WW,T: Destroy target black permanent.",activated:{cost:"WW,T",effect:"destroyBlack"}},
  {id:"samite_healer",   name:"Samite Healer",    type:"Creature",subtype:"Human Cleric",color:"W",cmc:2,cost:"1W",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Prevent the next 1 damage that would be dealt to any target.",activated:{cost:"T",effect:"gainLife1"}},
  {id:"veteran_bodyguard",name:"Veteran Bodyguard",type:"Creature",subtype:"Human Soldier",color:"W",cmc:5,cost:"3WW",power:2,toughness:5,keywords:[],rarity:"R",text:"As long as Veteran Bodyguard is untapped, all damage dealt to you is dealt to it instead."},
  {id:"ivory_tower",     name:"Ivory Tower",      type:"Artifact",   color:"",cmc:1,cost:"1",   text:"At the beginning of your upkeep, gain life equal to the number of cards in your hand minus 4.",upkeep:"ivoryTower",rarity:"R"},

  // ── BLUE CREATURES (new) ──
  {id:"clone",           name:"Clone",            type:"Creature",subtype:"Shapeshifter",color:"U",cmc:4,cost:"3U",power:0,toughness:0,keywords:[],rarity:"U",text:"You may have Clone enter the battlefield as a copy of any creature on the battlefield.",effect:"clone"},
  {id:"control_magic",   name:"Control Magic",    type:"Enchantment",subtype:"Aura",color:"U",cmc:4,cost:"2UU",text:"You control enchanted creature.",effect:"controlCreature",rarity:"U"},
  {id:"vesuvan_doppelganger",name:"Vesuvan Doppelganger",type:"Creature",subtype:"Shapeshifter",color:"U",cmc:5,cost:"3UU",power:0,toughness:0,keywords:[],rarity:"R",text:"Enter as a copy of target creature. At the beginning of your upkeep, you may copy another creature.",effect:"clone"},
  {id:"blue_elemental_blast",name:"Blue Elemental Blast",type:"Instant",color:"U",cmc:1,cost:"U",text:"Counter target red spell, or destroy target red permanent.",effect:"destroyRedOrCounter",rarity:"C"},
  {id:"boomerang",       name:"Boomerang",        type:"Instant",    color:"U",cmc:2,cost:"UU",  text:"Return target permanent to its owner's hand.",effect:"bounce",rarity:"C"},
  {id:"drain_power",     name:"Drain Power",      type:"Instant",    color:"U",cmc:2,cost:"UU",  text:"Target player taps all lands they control. Add mana equal to that mana to your mana pool.",effect:"drainPower",rarity:"R"},
  {id:"mana_short",      name:"Mana Short",       type:"Instant",    color:"U",cmc:3,cost:"2U",  text:"Tap all of target player's lands and drain their mana pool.",effect:"manaShort",rarity:"R"},
  {id:"remove_soul",     name:"Remove Soul",      type:"Instant",    color:"U",cmc:2,cost:"1U",  text:"Counter target creature spell.",effect:"counterCreature",rarity:"C"},
  {id:"force_spike",     name:"Force Spike",      type:"Instant",    color:"U",cmc:1,cost:"U",   text:"Counter target spell unless its controller pays 1.",effect:"counter",rarity:"C"},
  {id:"sleep",           name:"Twiddle",          type:"Instant",    color:"U",cmc:1,cost:"U",   text:"Tap or untap target permanent.",effect:"twiddle",rarity:"C"},
  {id:"timetwister",     name:"Timetwister",      type:"Sorcery",    color:"U",cmc:3,cost:"2U",  text:"Each player shuffles their hand and graveyard into their library, then draws seven cards.",effect:"wheelOfFortune",rarity:"R"},
  {id:"sleight_of_mind", name:"Sleight of Mind",  type:"Instant",    color:"U",cmc:1,cost:"U",   text:"Change the text of target spell or permanent by replacing all instances of one basic land type with another.",effect:"stub",rarity:"R"},
  {id:"phantasmal_forces",name:"Phantasmal Forces",type:"Creature",subtype:"Illusion",color:"U",cmc:4,cost:"3U",power:4,toughness:1,keywords:["FLYING"],rarity:"U",text:"Flying. At the beginning of your upkeep, sacrifice Phantasmal Forces unless you pay U.",upkeep:"sacrificeUnless_U"},
  {id:"wall_of_air",     name:"Wall of Air",      type:"Creature",subtype:"Wall",color:"U",cmc:3,cost:"1UU",power:1,toughness:5,keywords:["FLYING","DEFENDER"],rarity:"U",text:"Flying."},
  {id:"ghost_ship",      name:"Ghost Ship",       type:"Creature",subtype:"Spirit",color:"U",cmc:4,cost:"2UU",power:2,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying. UUU: Regenerate Ghost Ship.",activated:{cost:"UUU",effect:"regenerate"}},
  {id:"sea_serpent",     name:"Sea Serpent",      type:"Creature",subtype:"Serpent",color:"U",cmc:6,cost:"5U",power:5,toughness:5,keywords:[],rarity:"C",text:"Sea Serpent can't attack unless defending player controls an Island."},
  {id:"pirate_ship",     name:"Pirate Ship",      type:"Creature",subtype:"Ship",color:"U",cmc:4,cost:"3U",power:4,toughness:3,keywords:[],rarity:"R",text:"T: Pirate Ship deals 1 damage to any target. Pirate Ship can only attack if you control an Island.",activated:{cost:"T",effect:"damage1"}},
  {id:"flying_men",      name:"Flying Men",       type:"Creature",subtype:"Human",color:"U",cmc:1,cost:"U",power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying."},
  {id:"dandan",          name:"Dandân",           type:"Creature",subtype:"Fish",color:"U",cmc:2,cost:"UU",power:4,toughness:1,keywords:[],rarity:"C",text:"Dandân can't attack unless defending player controls an Island."},
  {id:"wall_of_wonder",  name:"Wall of Wonder",   type:"Creature",subtype:"Wall",color:"U",cmc:4,cost:"3U",power:1,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"1U: Wall of Wonder can attack this turn as though it didn't have defender.",activated:{cost:"1U",effect:"gainAttack"}},
  {id:"stasis",          name:"Stasis",           type:"Enchantment",color:"U",cmc:2,cost:"1U",text:"Players don't untap during their untap steps. At the beginning of your upkeep, sacrifice Stasis unless you pay U.",effect:"stub",rarity:"R"},
  {id:"howling_mine",    name:"Howling Mine",     type:"Artifact",   color:"",cmc:2,cost:"2",   text:"At the beginning of each player's draw step, if Howling Mine is untapped, that player draws an additional card.",upkeep:"howlingMine",rarity:"R"},

  // ── BLACK CREATURES (new) ──
  {id:"lord_of_pit",     name:"Lord of the Pit",  type:"Creature",subtype:"Demon",color:"B",cmc:7,cost:"4BBB",power:7,toughness:7,keywords:["FLYING","TRAMPLE"],rarity:"R",text:"Flying, trample. At the beginning of your upkeep, sacrifice a creature. If you can't, Lord of the Pit deals 7 damage to you.",upkeep:"lordsUpkeep"},
  {id:"nightmare",       name:"Nightmare",        type:"Creature",subtype:"Horse",color:"B",cmc:6,cost:"5B", power:0,toughness:0,keywords:["FLYING"],rarity:"R",text:"Flying. Nightmare's power and toughness are each equal to the number of Swamps you control.",dynamic:true,dynamicType:"swampCount"},
  {id:"frozen_shade",    name:"Frozen Shade",     type:"Creature",subtype:"Shade",color:"B",cmc:2,cost:"1B", power:0,toughness:1,keywords:[],rarity:"C",text:"B: Frozen Shade gets +1/+1 until end of turn.",activated:{cost:"B",effect:"pumpSelf"}},
  {id:"unholy_strength", name:"Unholy Strength",  type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchanted creature gets +2/+1.",effect:"enchantCreature",mod:{power:2,toughness:1},rarity:"C"},
  {id:"bad_moon",        name:"Bad Moon",         type:"Enchantment",color:"B",cmc:2,cost:"1B", text:"Black creatures get +1/+1.",effect:"globalPump",targets:"black",mod:{power:1,toughness:1},rarity:"R"},
  {id:"fear",            name:"Fear",             type:"Enchantment",subtype:"Aura",color:"B",cmc:2,cost:"1B",text:"Enchanted creature has fear (can only be blocked by artifact creatures and black creatures).",effect:"enchantCreature",mod:{keywords:["FEAR"]},rarity:"C"},
  {id:"weakness",        name:"Weakness",         type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchanted creature gets -2/-1.",effect:"enchantCreature",mod:{power:-2,toughness:-1},rarity:"C"},
  {id:"paralyze",        name:"Paralyze",         type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchanted creature doesn't untap during its controller's untap step.",effect:"paralyze",rarity:"C"},
  {id:"pestilence",      name:"Pestilence",       type:"Enchantment",color:"B",cmc:4,cost:"2BB",text:"B: Pestilence deals 1 damage to each creature and each player.",activated:{cost:"B",effect:"pestilence"},rarity:"C"},
  {id:"drain_life",      name:"Drain Life",       type:"Sorcery",    color:"B",cmc:2,cost:"X1B",text:"Spend only black mana on X. Drain Life deals X damage to target creature. You gain life equal to the damage dealt.",effect:"drainLife",rarity:"C"},
  {id:"disintegrate",    name:"Disintegrate",     type:"Sorcery",    color:"R",cmc:1,cost:"XR", text:"Disintegrate deals X damage to any target. That permanent can't be regenerated this turn.",effect:"damageX",rarity:"C"},
  {id:"death_ward",      name:"Death Ward",       type:"Instant",    color:"W",cmc:1,cost:"W",  text:"Regenerate target creature.",effect:"regenerateTarget",rarity:"C"},
  {id:"bog_wraith",      name:"Bog Wraith",       type:"Creature",subtype:"Wraith",color:"B",cmc:4,cost:"3B",power:3,toughness:3,keywords:["SWAMPWALK"],rarity:"U",text:"Swampwalk."},
  {id:"scathe_zombies",  name:"Scathe Zombies",   type:"Creature",subtype:"Zombie",color:"B",cmc:3,cost:"2B",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"erg_raiders",     name:"Erg Raiders",      type:"Creature",subtype:"Human Warrior",color:"B",cmc:3,cost:"1BB",power:3,toughness:3,keywords:[],rarity:"C",text:"At the beginning of your end step, if Erg Raiders didn't attack this turn, Erg Raiders deals 2 damage to you."},
  {id:"vampire_bats",    name:"Vampire Bats",     type:"Creature",subtype:"Bat",color:"B",cmc:1,cost:"B",power:0,toughness:1,keywords:["FLYING"],rarity:"C",text:"B: Vampire Bats gets +1/+0 until end of turn.",activated:{cost:"B",effect:"pumpSelf"}},
  {id:"zombie_master",   name:"Zombie Master",    type:"Creature",subtype:"Zombie",color:"B",cmc:3,cost:"1BB",power:2,toughness:3,keywords:[],rarity:"R",text:"All Zombies have swampwalk and have 'B: Regenerate this creature.'"},
  {id:"sinkhole",        name:"Sinkhole",         type:"Sorcery",    color:"B",cmc:2,cost:"BB",  text:"Destroy target land.",effect:"destroyTargetLand",rarity:"C"},
  {id:"ashes_to_ashes",  name:"Ashes to Ashes",   type:"Sorcery",    color:"B",cmc:3,cost:"1BB", text:"Exile two target nonartifact creatures. You lose 5 life.",effect:"exileTwo",rarity:"U"},
  {id:"oubliette",       name:"Oubliette",        type:"Enchantment",subtype:"Aura",color:"B",cmc:3,cost:"1BB",text:"Enchanted creature is phased out.",effect:"paralyze",rarity:"C"},

  // ── RED CREATURES (new) ──
  {id:"ball_lightning",  name:"Ball Lightning",   type:"Creature",subtype:"Elemental",color:"R",cmc:3,cost:"RRR",power:6,toughness:1,keywords:["TRAMPLE","HASTE"],rarity:"R",text:"Trample, haste. At the beginning of the end step, sacrifice Ball Lightning.",upkeep:"sacrificeSelf"},
  {id:"kird_ape",        name:"Kird Ape",         type:"Creature",subtype:"Ape",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"U",text:"Kird Ape gets +1/+2 as long as you control a Forest.",dynamic:true,dynamicType:"forestBonus"},
  {id:"blood_moon",      name:"Blood Moon",       type:"Enchantment",color:"R",cmc:3,cost:"2R", text:"Nonbasic lands are Mountains.",effect:"stub",rarity:"R"},
  {id:"red_elemental_blast",name:"Red Elemental Blast",type:"Instant",color:"R",cmc:1,cost:"R",text:"Counter target blue spell, or destroy target blue permanent.",effect:"destroyBlueOrCounter",rarity:"C"},
  {id:"earthquake",      name:"Earthquake",       type:"Sorcery",    color:"R",cmc:1,cost:"XR", text:"Earthquake deals X damage to each creature without flying and each player.",effect:"earthquake",rarity:"R"},
  {id:"berserk",         name:"Berserk",          type:"Instant",    color:"G",cmc:1,cost:"G",  text:"Target creature gains trample and gets +X/+0 until end of turn, where X is its power. At the beginning of the next end step, destroy that creature.",effect:"berserk",rarity:"R"},
  {id:"fork",            name:"Fork",             type:"Instant",    color:"R",cmc:2,cost:"RR",  text:"Copy target instant or sorcery spell. You may choose new targets for the copy.",effect:"forkSpell",rarity:"R"},
  {id:"pyrotechnics",    name:"Pyrotechnics",     type:"Sorcery",    color:"R",cmc:5,cost:"4R",  text:"Pyrotechnics deals 4 damage divided as you choose among any number of targets.",effect:"damageX",rarity:"C"},
  {id:"manabarbs",       name:"Manabarbs",        type:"Enchantment",color:"R",cmc:4,cost:"3R",  text:"Whenever a player taps a land for mana, Manabarbs deals 1 damage to that player.",effect:"stub",rarity:"R"},
  {id:"granite_gargoyle",name:"Granite Gargoyle", type:"Creature",subtype:"Gargoyle",color:"R",cmc:2,cost:"1R",power:2,toughness:2,keywords:["FLYING"],rarity:"R",text:"Flying. R: Granite Gargoyle gets +0/+1 until end of turn.",activated:{cost:"R",effect:"pumpToughness"}},
  {id:"hill_giant",      name:"Hill Giant",       type:"Creature",subtype:"Giant",color:"R",cmc:4,cost:"3R",power:3,toughness:3,keywords:[],rarity:"C",text:""},
  {id:"ironclaw_orcs",   name:"Ironclaw Orcs",    type:"Creature",subtype:"Orc",color:"R",cmc:2,cost:"1R",power:2,toughness:2,keywords:[],rarity:"C",text:"Ironclaw Orcs can't block creatures with power 2 or greater."},
  {id:"orcish_artillery",name:"Orcish Artillery", type:"Creature",subtype:"Orc",color:"R",cmc:3,cost:"1RR",power:1,toughness:3,keywords:[],rarity:"U",text:"T: Orcish Artillery deals 2 damage to any target and 3 damage to you.",activated:{cost:"T",effect:"orcishArtillery"}},
  {id:"hurloon_minotaur",name:"Hurloon Minotaur", type:"Creature",subtype:"Minotaur",color:"R",cmc:3,cost:"1RR",power:2,toughness:3,keywords:[],rarity:"C",text:""},
  {id:"two_headed_giant",name:"Two-Headed Giant of Foriys",type:"Creature",subtype:"Giant",color:"R",cmc:6,cost:"4RR",power:4,toughness:4,keywords:[],rarity:"R",text:"Two-Headed Giant of Foriys can block an additional creature each combat."},
  {id:"dragon_whelp",    name:"Dragon Whelp",     type:"Creature",subtype:"Dragon",color:"R",cmc:4,cost:"2RR",power:2,toughness:3,keywords:["FLYING"],rarity:"U",text:"Flying. R: Dragon Whelp gets +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"}},
  {id:"fire_elemental",  name:"Fire Elemental",   type:"Creature",subtype:"Elemental",color:"R",cmc:5,cost:"3RR",power:5,toughness:4,keywords:[],rarity:"U",text:""},

  // ── GREEN CREATURES (new) ──
  {id:"erhnam_djinn",    name:"Erhnam Djinn",     type:"Creature",subtype:"Djinn",color:"G",cmc:4,cost:"3G",power:4,toughness:5,keywords:[],rarity:"U",text:"At the beginning of your upkeep, target non-Wall creature an opponent controls gains forestwalk until your next upkeep.",upkeep:"erhnamsUpkeep"},
  {id:"keldon_warlord",  name:"Keldon Warlord",   type:"Creature",subtype:"Human Barbarian",color:"R",cmc:4,cost:"2RR",power:0,toughness:0,keywords:[],rarity:"U",text:"Keldon Warlord's power and toughness are each equal to the number of non-Wall creatures you control.",dynamic:true,dynamicType:"creatureCount"},
  {id:"war_mammoth",     name:"War Mammoth",      type:"Creature",subtype:"Elephant",color:"G",cmc:3,cost:"2G",power:3,toughness:3,keywords:["TRAMPLE"],rarity:"C",text:"Trample."},
  {id:"timber_wolves",   name:"Timber Wolves",    type:"Creature",subtype:"Wolf",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:["BANDING"],rarity:"R",text:"Banding."},
  {id:"elven_riders",    name:"Elven Riders",     type:"Creature",subtype:"Elf",color:"G",cmc:5,cost:"3GG",power:3,toughness:3,keywords:[],rarity:"U",text:"Elven Riders can't be blocked except by creatures with flying or forestwalk."},
  {id:"argothian_treefolk",name:"Argothian Treefolk",type:"Creature",subtype:"Treefolk",color:"G",cmc:5,cost:"3GG",power:3,toughness:5,keywords:[],rarity:"C",text:""},
  {id:"durkwood_boars",  name:"Durkwood Boars",   type:"Creature",subtype:"Boar",color:"G",cmc:5,cost:"4G",power:4,toughness:4,keywords:[],rarity:"C",text:""},
  {id:"ironroot_treefolk",name:"Ironroot Treefolk",type:"Creature",subtype:"Treefolk",color:"G",cmc:5,cost:"4G",power:3,toughness:5,keywords:[],rarity:"C",text:""},
  {id:"gaea_liege",      name:"Gaea's Liege",     type:"Creature",subtype:"Avatar",color:"G",cmc:6,cost:"3GGG",power:0,toughness:0,keywords:[],rarity:"R",text:"Gaea's Liege's power and toughness are each equal to the number of forests you control.",dynamic:true,dynamicType:"forestCount"},
  {id:"aspect_of_wolf",  name:"Aspect of Wolf",   type:"Enchantment",subtype:"Aura",color:"G",cmc:2,cost:"1G",text:"Enchanted creature gets +X/+Y where X = half your forests (round down) and Y = half (round up).",effect:"enchantCreature",mod:{power:1,toughness:2},rarity:"R"},
  {id:"lure",            name:"Lure",             type:"Enchantment",subtype:"Aura",color:"G",cmc:3,cost:"1GG",text:"All creatures able to block enchanted creature do so.",effect:"enchantCreature",mod:{keywords:["LURE"]},rarity:"U"},
  {id:"instill_energy",  name:"Instill Energy",   type:"Enchantment",subtype:"Aura",color:"G",cmc:1,cost:"G",text:"Enchanted creature can attack the turn it enters. It can also untap once each turn.",effect:"enchantCreature",mod:{keywords:["HASTE"]},rarity:"U"},
  {id:"wild_growth",     name:"Wild Growth",      type:"Enchantment",subtype:"Aura",color:"G",cmc:1,cost:"G",text:"Enchanted land produces an additional G when tapped.",effect:"enchantLand",mod:{bonus:"G"},rarity:"C"},
  {id:"tranquility",     name:"Tranquility",      type:"Sorcery",    color:"G",cmc:3,cost:"2G", text:"Destroy all enchantments.",effect:"destroyAllEnchantments",rarity:"C"},
  {id:"channel",         name:"Channel",          type:"Sorcery",    color:"G",cmc:2,cost:"GG",  text:"Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add one colorless mana.",effect:"channel",rarity:"R"},
  {id:"sylvan_library",  name:"Sylvan Library",   type:"Enchantment",color:"G",cmc:2,cost:"1G",  text:"At the beginning of your draw step, you may draw two additional cards. For each extra card drawn, pay 4 life or put it back.",upkeep:"sylvanLibrary",rarity:"R"},
  {id:"tsunami",         name:"Tsunami",          type:"Sorcery",    color:"G",cmc:4,cost:"3G",  text:"Destroy all Islands.",effect:"destroyIslands",rarity:"U"},
  {id:"flashfires",      name:"Flashfires",       type:"Sorcery",    color:"R",cmc:4,cost:"3R",  text:"Destroy all Plains.",effect:"destroyPlains",rarity:"U"},

  // ── ARTIFACTS (new) ──
  {id:"black_vise",      name:"Black Vise",       type:"Artifact",   color:"",cmc:1,cost:"1",   text:"At the beginning of each opponent's upkeep, Black Vise deals damage equal to the number of cards they have over 4.",upkeep:"blackVise",rarity:"U"},
  {id:"winter_orb",      name:"Winter Orb",       type:"Artifact",   color:"",cmc:2,cost:"2",   text:"Players can only untap one land during their untap step.",effect:"stub",rarity:"R"},
  {id:"meekstone",       name:"Meekstone",        type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Creatures with power 3 or greater don't untap during their controller's untap step.",effect:"stub",rarity:"R"},
  {id:"juggernaut",      name:"Juggernaut",       type:"Artifact Creature",subtype:"Juggernaut",color:"",cmc:4,cost:"4",power:5,toughness:3,keywords:[],rarity:"U",text:"Juggernaut attacks each turn if able. Juggernaut can't be blocked by Walls."},
  {id:"ankh_of_mishra",  name:"Ankh of Mishra",   type:"Artifact",   color:"",cmc:2,cost:"2",   text:"Whenever a land enters the battlefield, Ankh of Mishra deals 2 damage to that land's controller.",upkeep:"stub",rarity:"R"},
  {id:"icy_manipulator", name:"Icy Manipulator",  type:"Artifact",   color:"",cmc:4,cost:"4",   text:"1, T: Tap target artifact, creature, or land.",activated:{cost:"1,T",effect:"tapTarget"},rarity:"U"},
  {id:"mana_vault",      name:"Mana Vault",       type:"Artifact",   color:"",cmc:1,cost:"1",   text:"T: Add CC. At the beginning of your upkeep, if Mana Vault is tapped, pay 4 or take 1 damage.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"CC"}},
  {id:"basalt_monolith", name:"Basalt Monolith",  type:"Artifact",   color:"",cmc:3,cost:"3",   text:"T: Add CCC. 3: Untap Basalt Monolith.",rarity:"U",activated:{cost:"T",effect:"addMana",mana:"CCC"}},
  {id:"mana_flare",      name:"Mana Flare",       type:"Enchantment",color:"R",cmc:3,cost:"2R",  text:"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.",effect:"stub",rarity:"R"},
  {id:"howl_from_beyond",name:"Howl from Beyond", type:"Instant",    color:"B",cmc:1,cost:"XB",  text:"Target creature gets +X/+0 until end of turn.",effect:"pumpX",rarity:"C"},
  {id:"clay_statue",     name:"Clay Statue",      type:"Artifact Creature",subtype:"Golem",color:"",cmc:4,cost:"4",power:3,toughness:1,keywords:[],rarity:"C",text:"2: Regenerate Clay Statue.",activated:{cost:"2",effect:"regenerate"}},
  {id:"brass_man",       name:"Brass Man",        type:"Artifact Creature",subtype:"Construct",color:"",cmc:1,cost:"1",power:1,toughness:3,keywords:[],rarity:"U",text:"Brass Man doesn't untap during your untap step. 1: Untap Brass Man.",activated:{cost:"1",effect:"untapSelf"}},
  {id:"ornithopter",     name:"Ornithopter",      type:"Artifact Creature",subtype:"Thopter",color:"",cmc:0,cost:"0",power:0,toughness:2,keywords:["FLYING"],rarity:"U",text:"Flying."},
  {id:"rod_of_ruin",     name:"Rod of Ruin",      type:"Artifact",   color:"",cmc:4,cost:"4",   text:"3, T: Rod of Ruin deals 1 damage to any target.",activated:{cost:"3,T",effect:"damage1"},rarity:"U"},
  {id:"triskelion",      name:"Triskelion",       type:"Artifact Creature",subtype:"Construct",color:"",cmc:6,cost:"6",power:1,toughness:1,keywords:[],rarity:"R",text:"Triskelion enters with 3 +1/+1 counters. Remove a +1/+1 counter: deal 1 damage to any target.",activated:{cost:"counter",effect:"triskelionPing"}},
  {id:"disrupting_scepter",name:"Disrupting Scepter",type:"Artifact",color:"",cmc:3,cost:"3",   text:"3, T: Target player discards a card. Activate only during your turn.",activated:{cost:"3,T",effect:"discardOne"},rarity:"R"},
  {id:"wooden_sphere",   name:"Wooden Sphere",    type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Whenever a player casts a green spell, you may pay 1. If you do, gain 1 life.",effect:"stub",rarity:"C"},
  {id:"iron_star",       name:"Iron Star",        type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Whenever a player casts a red spell, you may pay 1. If you do, gain 1 life.",effect:"stub",rarity:"C"},
  {id:"ivory_cup",       name:"Ivory Cup",        type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Whenever a player casts a white spell, you may pay 1. If you do, gain 1 life.",effect:"stub",rarity:"C"},
  {id:"crystal_rod",     name:"Crystal Rod",      type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Whenever a player casts a blue spell, you may pay 1. If you do, gain 1 life.",effect:"stub",rarity:"C"},
  {id:"throne_of_bone",  name:"Throne of Bone",   type:"Artifact",   color:"",cmc:1,cost:"1",   text:"Whenever a player casts a black spell, you may pay 1. If you do, gain 1 life.",effect:"stub",rarity:"C"},
  {id:"su_chi",          name:"Su-Chi",           type:"Artifact Creature",subtype:"Construct",color:"",cmc:4,cost:"4",power:4,toughness:4,keywords:[],rarity:"U",text:"When Su-Chi dies, add CCCC."},
  {id:"colossus_of_sardia",name:"Colossus of Sardia",type:"Artifact Creature",subtype:"Golem",color:"",cmc:9,cost:"9",power:9,toughness:9,keywords:["TRAMPLE"],rarity:"R",text:"Trample. Colossus of Sardia doesn't untap during your untap step. 9: Untap it.",activated:{cost:"9",effect:"untapSelf"}},
  {id:"rocket_launcher", name:"Rocket Launcher",  type:"Artifact",   color:"",cmc:4,cost:"4",   text:"2, T: Rocket Launcher deals 1 damage to any target. Destroy Rocket Launcher at the beginning of the next end step.",activated:{cost:"2,T",effect:"damage1"},rarity:"U"},
  {id:"aeolipile",       name:"Aeolipile",        type:"Artifact",   color:"",cmc:2,cost:"2",   text:"1, T, Sacrifice Aeolipile: Aeolipile deals 2 damage to any target.",activated:{cost:"1,T,sac",effect:"damage2"},rarity:"U"},
  {id:"grapeshot_catapult",name:"Grapeshot Catapult",type:"Artifact Creature",subtype:"Construct",color:"",cmc:4,cost:"4",power:2,toughness:3,keywords:[],rarity:"C",text:"T: Grapeshot Catapult deals 1 damage to target creature with flying.",activated:{cost:"T",effect:"damage1"}},
  {id:"clockwork_beast",  name:"Clockwork Beast",  type:"Artifact Creature",subtype:"Beast",color:"",cmc:6,cost:"6",power:0,toughness:4,keywords:[],rarity:"R",text:"Clockwork Beast enters with 7 +1/+0 counters. At end of combat, remove one.",dynamic:false,power:7,toughness:4},
  {id:"tetravus",        name:"Tetravus",         type:"Artifact Creature",subtype:"Construct",color:"",cmc:6,cost:"6",power:1,toughness:1,keywords:["FLYING"],rarity:"R",text:"Flying. Tetravus enters with 3 +1/+1 counters."},

  // ── WALLS ──
  {id:"wall_of_ice",     name:"Wall of Ice",      type:"Creature",subtype:"Wall",color:"U",cmc:3,cost:"1UU",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:""},
  {id:"wall_of_stone",   name:"Wall of Stone",    type:"Creature",subtype:"Wall",color:"R",cmc:3,cost:"1RR",power:0,toughness:8,keywords:["DEFENDER"],rarity:"U",text:""},
  {id:"wall_of_fire",    name:"Wall of Fire",     type:"Creature",subtype:"Wall",color:"R",cmc:3,cost:"1RR",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"R: Wall of Fire gets +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"}},
  {id:"wall_of_brambles",name:"Wall of Brambles", type:"Creature",subtype:"Wall",color:"G",cmc:3,cost:"2G",power:2,toughness:3,keywords:["DEFENDER"],rarity:"U",text:"G: Regenerate Wall of Brambles.",activated:{cost:"G",effect:"regenerate"}},
  {id:"wall_of_bone",    name:"Wall of Bone",     type:"Creature",subtype:"Wall",color:"B",cmc:2,cost:"1B",power:1,toughness:3,keywords:["DEFENDER"],rarity:"U",text:"B: Regenerate Wall of Bone.",activated:{cost:"B",effect:"regenerate"}},
  {id:"living_wall",     name:"Living Wall",      type:"Artifact Creature",subtype:"Wall",color:"",cmc:3,cost:"3",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"1: Regenerate Living Wall.",activated:{cost:"1",effect:"regenerate"}},

  // ── UTILITY / MISC ──
  {id:"counterspell2",   name:"Counterspell",     type:"Instant",    color:"U",cmc:2,cost:"UU",  text:"Counter target spell.",effect:"counter",rarity:"U"},
  {id:"jump",            name:"Jump",             type:"Instant",    color:"U",cmc:1,cost:"U",   text:"Target creature gains flying until end of turn.",effect:"grantFlying",rarity:"C"},
  {id:"regeneration",    name:"Regeneration",     type:"Enchantment",subtype:"Aura",color:"G",cmc:2,cost:"1G",text:"G: Regenerate enchanted creature.",activated:{cost:"G",effect:"regenerate"},rarity:"C"},
  {id:"firebreathing",   name:"Firebreathing",    type:"Enchantment",subtype:"Aura",color:"R",cmc:1,cost:"R",text:"R: Enchanted creature gets +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"},rarity:"C"},
  {id:"flight",          name:"Flight",           type:"Enchantment",subtype:"Aura",color:"U",cmc:1,cost:"U",text:"Enchanted creature has flying.",effect:"enchantCreature",mod:{keywords:["FLYING"]},rarity:"C"},
  {id:"giant_strength",  name:"Giant Strength",   type:"Enchantment",subtype:"Aura",color:"R",cmc:2,cost:"RR",text:"Enchanted creature gets +2/+2.",effect:"enchantCreature",mod:{power:2,toughness:2},rarity:"C"},
  {id:"lifeforce",       name:"Lifeforce",        type:"Enchantment",color:"G",cmc:2,cost:"GG",  text:"GG: Counter target black spell.",effect:"stub",rarity:"U"},
  {id:"lifetap",         name:"Lifetap",          type:"Enchantment",color:"U",cmc:2,cost:"UU",  text:"Whenever an opponent taps a Forest for mana, you gain 1 life.",effect:"stub",rarity:"U"},
  {id:"smoke",           name:"Smoke",            type:"Enchantment",color:"R",cmc:2,cost:"1R",  text:"Players can't untap more than one creature during their untap steps.",effect:"stub",rarity:"R"},
  {id:"winter_blast",    name:"Winter Blast",     type:"Sorcery",    color:"G",cmc:1,cost:"XG",  text:"Tap X target creatures.",effect:"tapX",rarity:"U"},
  {id:"power_surge",     name:"Power Surge",      type:"Enchantment",color:"R",cmc:2,cost:"1R",  text:"At the beginning of each player's upkeep, Power Surge deals damage equal to the number of untapped lands they had at the start of their turn.",effect:"stub",rarity:"R"},
  {id:"city_of_brass",   name:"City of Brass",    type:"Land",       color:"",cmc:0,cost:"",text:"T: Add one mana of any color. City of Brass deals 1 damage to you.",produces:["W","U","B","R","G"],rarity:"U",upkeep:"cityOfBrassDamage"},
  {id:"strip_mine",      name:"Strip Mine",       type:"Land",       color:"",cmc:0,cost:"",text:"T: Add C. T, Sacrifice Strip Mine: Destroy target land.",produces:["C"],rarity:"U",activated:{cost:"T,sac",effect:"destroyTargetLand"}},
  {id:"mishra_factory",  name:"Mishra's Factory", type:"Land",       color:"",cmc:0,cost:"",text:"T: Add C. 1: Mishra's Factory becomes a 2/2 Assembly-Worker until end of turn.",produces:["C"],rarity:"U"},
  {id:"maze_of_ith",     name:"Maze of Ith",      type:"Land",       color:"",cmc:0,cost:"",text:"T: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.",produces:[],rarity:"U",activated:{cost:"T",effect:"untapAttacker"}},
  {id:"library_of_leng", name:"Library of Leng",  type:"Artifact",   color:"",cmc:1,cost:"1",   text:"You have no maximum hand size. If you discard a card, you may put it on top of your library instead.",effect:"stub",rarity:"U"},
  {id:"feldon_cane",     name:"Feldon's Cane",     type:"Artifact",   color:"",cmc:1,cost:"1",   text:"T, Exile Feldon's Cane: Target player shuffles their graveyard into their library.",activated:{cost:"T,sac",effect:"shuffleGraveyardIn"},rarity:"U"},
  {id:"howling_mine2",   name:"Howling Mine",      type:"Artifact",   color:"",cmc:2,cost:"2",   text:"At the beginning of each player's draw step, if Howling Mine is untapped, that player draws an additional card.",upkeep:"howlingMine",rarity:"R"},
  {id:"millstone",       name:"Millstone",         type:"Artifact",   color:"",cmc:2,cost:"2",   text:"2, T: Target player mills two cards.",activated:{cost:"2,T",effect:"mill2"},rarity:"U"},

  // ── ADDITIONAL TIER 1 ─────────────────────────────────────────────────────

  // White
  {id:"karma2",          name:"Karma",            type:"Enchantment",color:"W",cmc:4,cost:"3W",text:"At the beginning of each upkeep, Karma deals damage equal to opponent's swamps.",effect:"stub",rarity:"U"},
  {id:"divine_transformation",name:"Divine Transformation",type:"Enchantment",subtype:"Aura",color:"W",cmc:3,cost:"2W",text:"Enchanted creature gets +3/+3.",effect:"enchantCreature",mod:{power:3,toughness:3},rarity:"U"},
  {id:"blessing",        name:"Blessing",         type:"Enchantment",subtype:"Aura",color:"W",cmc:2,cost:"WW",text:"W: Enchanted creature gets +1/+1 until end of turn.",activated:{cost:"W",effect:"pumpSelf"},rarity:"R"},
  {id:"lance",           name:"Lance",            type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchanted creature has first strike.",effect:"enchantCreature",mod:{keywords:["FIRST_STRIKE"]},rarity:"U"},
  {id:"death_ward2",     name:"Angelic Voices",   type:"Enchantment",color:"W",cmc:3,cost:"2W",text:"Creatures you control get +1/+1 unless an opponent controls a nonwhite, non-artifact creature.",effect:"stub",rarity:"R"},
  {id:"pikemen",         name:"Pikemen",          type:"Creature",subtype:"Human Soldier",color:"W",cmc:2,cost:"1W",power:1,toughness:1,keywords:["FIRST_STRIKE","BANDING"],rarity:"C",text:"First strike, banding."},
  {id:"pearled_unicorn", name:"Pearled Unicorn",  type:"Creature",subtype:"Unicorn",color:"W",cmc:2,cost:"1W",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"tundra_wolves",   name:"Tundra Wolves",    type:"Creature",subtype:"Wolf",color:"W",cmc:1,cost:"W",power:1,toughness:1,keywords:["FIRST_STRIKE"],rarity:"C",text:"First strike."},
  {id:"war_elephant",    name:"War Elephant",     type:"Creature",subtype:"Elephant",color:"W",cmc:4,cost:"3W",power:2,toughness:2,keywords:["TRAMPLE","BANDING"],rarity:"U",text:"Trample, banding."},
  {id:"moorish_cavalry", name:"Moorish Cavalry",  type:"Creature",subtype:"Human Knight",color:"W",cmc:4,cost:"3W",power:3,toughness:3,keywords:["FIRST_STRIKE"],rarity:"U",text:"First strike."},
  {id:"resurrection2",   name:"Reverse Damage",   type:"Instant",    color:"W",cmc:3,cost:"2W",text:"Gain 6 life.",effect:"gainLife6",rarity:"R"},
  {id:"swords2",         name:"Exile",            type:"Instant",    color:"W",cmc:2,cost:"1W",text:"Exile target creature.",effect:"exileCreature",rarity:"C"},

  // Blue (more)
  {id:"azure_drake",     name:"Azure Drake",      type:"Creature",subtype:"Drake",color:"U",cmc:4,cost:"3U",power:2,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying."},
  {id:"merfolk_assassin",name:"Merfolk Assassin", type:"Creature",subtype:"Merfolk Assassin",color:"U",cmc:3,cost:"2U",power:1,toughness:1,keywords:[],rarity:"U",text:"T: Destroy target creature with islandwalk.",activated:{cost:"T",effect:"destroyTapped"}},
  {id:"phantom_monster", name:"Phantom Monster",  type:"Creature",subtype:"Illusion",color:"U",cmc:4,cost:"3U",power:3,toughness:3,keywords:["FLYING"],rarity:"U",text:"Flying."},
  {id:"coral_helm",      name:"Coral Helm",       type:"Artifact",   color:"",cmc:2,cost:"2",text:"2: Target creature gets +2/+2 until end of turn. That creature's controller discards a card.",activated:{cost:"2",effect:"pumpCreature"},rarity:"U",mod:{power:2,toughness:2}},
  {id:"animate_artifact",name:"Animate Artifact", type:"Enchantment",subtype:"Aura",color:"U",cmc:4,cost:"3U",text:"Enchanted artifact is also a creature with power and toughness each equal to its mana cost.",effect:"stub",rarity:"U"},
  {id:"copy_artifact",   name:"Copy Artifact",    type:"Enchantment",color:"U",cmc:2,cost:"1U",text:"Copy Artifact enters the battlefield as a copy of target artifact.",effect:"stub",rarity:"R"},
  {id:"magical_hack",    name:"Sleight of Hand",  type:"Instant",    color:"U",cmc:1,cost:"U",text:"Look at the top two cards of your library. Put one in your hand and the other on the bottom.",effect:"draw1",rarity:"C"},

  // Black (more)
  {id:"rag_man",         name:"Rag Man",          type:"Creature",subtype:"Human Minion",color:"B",cmc:4,cost:"1BBB",power:2,toughness:1,keywords:[],rarity:"R",text:"T: Target opponent randomly discards a card at the beginning of their next turn.",activated:{cost:"T",effect:"discardOne"}},
  {id:"headless_horseman",name:"Headless Horseman",type:"Creature",subtype:"Zombie Knight",color:"B",cmc:3,cost:"2B",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"murk_dwellers",   name:"Murk Dwellers",    type:"Creature",subtype:"Zombie",color:"B",cmc:4,cost:"3B",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"scavenging_ghoul",name:"Scavenging Ghoul", type:"Creature",subtype:"Zombie",color:"B",cmc:4,cost:"3B",power:2,toughness:2,keywords:[],rarity:"U",text:"At the beginning of each end step, put a +1/+1 counter on Scavenging Ghoul for each creature that died this turn."},
  {id:"black_ward",      name:"Black Ward",       type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchanted creature has protection from black.",effect:"enchantCreature",mod:{protection:"B"},rarity:"U"},
  {id:"blue_ward",       name:"Blue Ward",        type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchanted creature has protection from blue.",effect:"enchantCreature",mod:{protection:"U"},rarity:"U"},
  {id:"green_ward",      name:"Green Ward",       type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchanted creature has protection from green.",effect:"enchantCreature",mod:{protection:"G"},rarity:"U"},
  {id:"red_ward",        name:"Red Ward",         type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchanted creature has protection from red.",effect:"enchantCreature",mod:{protection:"R"},rarity:"U"},
  {id:"bog_imp",         name:"Bog Imp",          type:"Creature",subtype:"Imp",color:"B",cmc:2,cost:"1B",power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying."},
  {id:"walking_dead",    name:"Walking Dead",     type:"Creature",subtype:"Zombie",color:"B",cmc:1,cost:"B",power:1,toughness:1,keywords:[],rarity:"C",text:"B: Regenerate Walking Dead.",activated:{cost:"B",effect:"regenerate"}},
  {id:"frozen_shade2",   name:"Lost Soul",        type:"Creature",subtype:"Shade",color:"B",cmc:3,cost:"2B",power:2,toughness:1,keywords:["SWAMPWALK"],rarity:"C",text:"Swampwalk."},
  {id:"ashes_to_ashes2", name:"Syphon Soul",      type:"Sorcery",    color:"B",cmc:3,cost:"2B",text:"Syphon Soul deals 2 damage to each other player. You gain life equal to the damage dealt.",effect:"syphonSoul",rarity:"U"},
  {id:"howl_beyond2",    name:"Howl from Beyond", type:"Instant",    color:"B",cmc:1,cost:"XB",text:"Target creature gets +X/+0 until end of turn.",effect:"pumpX",rarity:"C"},

  // Red (more)
  {id:"goblin_hero",     name:"Goblin Hero",      type:"Creature",subtype:"Goblin Warrior",color:"R",cmc:2,cost:"1R",power:2,toughness:1,keywords:[],rarity:"C",text:""},
  {id:"brothers_of_fire",name:"Brothers of Fire", type:"Creature",subtype:"Human Shaman",color:"R",cmc:3,cost:"1RR",power:2,toughness:2,keywords:[],rarity:"U",text:"1RR: Brothers of Fire deals 1 damage to any target and 1 damage to you.",activated:{cost:"1RR",effect:"orcishArtillery"}},
  {id:"stone_giant",     name:"Stone Giant",      type:"Creature",subtype:"Giant",color:"R",cmc:4,cost:"2RR",power:3,toughness:4,keywords:[],rarity:"U",text:"T: Target creature you control with toughness less than Stone Giant's power gains flying until end of turn.",activated:{cost:"T",effect:"grantFlying"}},
  {id:"roc_of_kher",     name:"Roc of Kher Ridges",type:"Creature",subtype:"Bird",color:"R",cmc:4,cost:"3R",power:3,toughness:3,keywords:["FLYING"],rarity:"R",text:"Flying."},
  {id:"sedge_troll",     name:"Sedge Troll",      type:"Creature",subtype:"Troll",color:"R",cmc:3,cost:"2R",power:2,toughness:2,keywords:["TRAMPLE"],rarity:"R",text:"Trample. B: Regenerate Sedge Troll. Sedge Troll gets +1/+1 as long as you control a Swamp."},
  {id:"orcish_oriflamme",name:"Orcish Oriflamme", type:"Enchantment",color:"R",cmc:3,cost:"2R",text:"Attacking creatures you control get +1/+0.",effect:"stub",rarity:"U"},
  {id:"shatter2",        name:"Detonate",         type:"Sorcery",    color:"R",cmc:2,cost:"1R",text:"Destroy target artifact. Detonate deals damage equal to that artifact's mana cost to that artifact's controller.",effect:"destroyArtifact",rarity:"U"},
  {id:"mana_clash",      name:"Mana Clash",       type:"Sorcery",    color:"R",cmc:1,cost:"R",text:"Flip a coin. If you lose the flip, Mana Clash deals 1 damage to you and you repeat this process.",effect:"manaClash",rarity:"R"},
  {id:"immolation",      name:"Immolation",       type:"Enchantment",subtype:"Aura",color:"R",cmc:2,cost:"1R",text:"Enchanted creature gets +2/-2.",effect:"enchantCreature",mod:{power:2,toughness:-2},rarity:"C"},
  {id:"fire_sprites",    name:"Fire Sprites",     type:"Creature",subtype:"Faerie",color:"R",cmc:2,cost:"1R",power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying. T: Add R.",activated:{cost:"T",effect:"addMana",mana:"R"}},

  // Green (more)
  {id:"carnivorous_plant",name:"Carnivorous Plant",type:"Creature",subtype:"Plant",color:"G",cmc:4,cost:"3G",power:4,toughness:5,keywords:["DEFENDER"],rarity:"C",text:""},
  {id:"whirling_dervish",name:"Whirling Dervish", type:"Creature",subtype:"Human Monk",color:"G",cmc:2,cost:"GG",power:1,toughness:1,keywords:[],rarity:"U",text:"At the beginning of each end step, if Whirling Dervish dealt damage to an opponent, put a +1/+1 counter on it."},
  {id:"thicket_basilisk",name:"Thicket Basilisk", type:"Creature",subtype:"Basilisk",color:"G",cmc:5,cost:"3GG",power:2,toughness:4,keywords:[],rarity:"U",text:"Any creature blocking or blocked by Thicket Basilisk is destroyed."},
  {id:"argothian_pixies",name:"Argothian Pixies", type:"Creature",subtype:"Faerie",color:"G",cmc:2,cost:"1G",power:2,toughness:1,keywords:[],rarity:"U",text:"Protection from artifacts."},
  {id:"land_leeches",    name:"Land Leeches",     type:"Creature",subtype:"Leech",color:"G",cmc:3,cost:"1GG",power:2,toughness:2,keywords:[],rarity:"C",text:""},
  {id:"scryb_sprites",   name:"Scryb Sprites",    type:"Creature",subtype:"Faerie",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying."},
  {id:"ley_druid",       name:"Ley Druid",        type:"Creature",subtype:"Human Druid",color:"G",cmc:3,cost:"2G",power:1,toughness:1,keywords:[],rarity:"U",text:"T: Untap target land.",activated:{cost:"T",effect:"untapLand"}},
  {id:"natural_selection",name:"Natural Selection",type:"Sorcery",  color:"G",cmc:1,cost:"G",text:"Look at the top three cards of target player's library, then put them back in any order.",effect:"scry3",rarity:"R"},
  {id:"fastbond",        name:"Fastbond",         type:"Enchantment",color:"G",cmc:1,cost:"G",text:"You may play any number of lands each turn. Whenever you play a land, if it wasn't the first land you played this turn, Fastbond deals 1 damage to you.",effect:"stub",rarity:"R"},
  {id:"verduran_enchantress",name:"Verduran Enchantress",type:"Creature",subtype:"Human Druid",color:"G",cmc:3,cost:"1GG",power:0,toughness:2,keywords:[],rarity:"R",text:"Whenever you cast an enchantment spell, draw a card."},
  {id:"regeneration2",   name:"Regeneration",     type:"Enchantment",subtype:"Aura",color:"G",cmc:2,cost:"1G",text:"G: Regenerate enchanted creature.",activated:{cost:"G",effect:"regenerate"},rarity:"C"},
  {id:"kudzu",           name:"Kudzu",            type:"Enchantment",subtype:"Aura",color:"G",cmc:3,cost:"1GG",text:"Enchanted land is destroyed at the beginning of each upkeep. When that land is destroyed this way, attach Kudzu to target land.",effect:"stub",rarity:"R"},
  {id:"land_tax",        name:"Land Tax",         type:"Enchantment",color:"W",cmc:1,cost:"W",text:"At the beginning of your upkeep, if an opponent controls more lands than you, search your library for up to three basic lands and put them into your hand.",upkeep:"landTax",rarity:"R"},
  {id:"ice_storm",       name:"Ice Storm",        type:"Sorcery",    color:"G",cmc:3,cost:"2G",text:"Destroy target land.",effect:"destroyTargetLand",rarity:"U"},
  {id:"drop_of_honey",   name:"Drop of Honey",    type:"Enchantment",color:"G",cmc:1,cost:"G",text:"At the beginning of your upkeep, destroy the creature with the least power.",effect:"stub",rarity:"R"},

  // More Artifacts
  {id:"disrupting_scepter2",name:"Aladdin's Lamp",type:"Artifact",  color:"",cmc:10,cost:"10",text:"X, T: The next card you draw comes from the top of your library after looking at the top X+1 cards.",activated:{cost:"X,T",effect:"stub"},rarity:"R"},
  {id:"magic_candelabra", name:"Candelabra of Tawnos",type:"Artifact",color:"",cmc:1,cost:"1",text:"X, T: Untap X target lands.",activated:{cost:"X,T",effect:"untapX"},rarity:"R"},
  {id:"mana_crypt",      name:"Mana Crypt",        type:"Artifact",  color:"",cmc:0,cost:"0",text:"T: Add CC. At the beginning of your upkeep, flip a coin. If you lose the flip, Mana Crypt deals 3 damage to you.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"CC"}},
  {id:"ashnods_altar",   name:"Ashnod's Altar",    type:"Artifact",  color:"",cmc:2,cost:"2",text:"Sacrifice a creature: Add CC.",activated:{cost:"sac",effect:"sacrificeForMana"},rarity:"U"},
  {id:"ashnods_transmogrant",name:"Ashnod's Transmogrant",type:"Artifact",color:"",cmc:1,cost:"1",text:"T, Sacrifice Ashnod's Transmogrant: Target creature becomes a 5/5 colorless Golem artifact creature.",activated:{cost:"T,sac",effect:"stub"},rarity:"C"},
  {id:"argivian_blacksmith",name:"Argivian Blacksmith",type:"Creature",subtype:"Human Artificer",color:"W",cmc:3,cost:"1WW",power:2,toughness:2,keywords:[],rarity:"U",text:"T: Prevent the next 2 damage that would be dealt to target artifact creature.",activated:{cost:"T",effect:"gainLife2"}},
  {id:"battering_ram",   name:"Battering Ram",     type:"Artifact Creature",subtype:"Construct",color:"",cmc:2,cost:"2",power:1,toughness:1,keywords:["BANDING"],rarity:"C",text:"Banding. Whenever Battering Ram attacks, it can deal damage to walls this turn."},
  {id:"aeolipile2",      name:"Amulet of Kroog",   type:"Artifact",  color:"",cmc:2,cost:"2",text:"2, T: Prevent the next 1 damage that would be dealt to any target.",activated:{cost:"2,T",effect:"gainLife1"},rarity:"C"},
  {id:"jade_statue",     name:"Jade Statue",       type:"Artifact",  color:"",cmc:4,cost:"4",text:"2: Jade Statue becomes a 3/6 creature until end of combat.",activated:{cost:"2",effect:"stub"},rarity:"U"},
  {id:"onulet",          name:"Onulet",            type:"Artifact Creature",subtype:"Construct",color:"",cmc:3,cost:"3",power:2,toughness:2,keywords:[],rarity:"U",text:"When Onulet dies, you gain 2 life.",triggered:"deathGainLife2"},
  {id:"dragon_engine",   name:"Dragon Engine",     type:"Artifact Creature",subtype:"Construct",color:"",cmc:3,cost:"3",power:1,toughness:3,keywords:[],rarity:"U",text:"2: Dragon Engine gets +1/+0 until end of turn.",activated:{cost:"2",effect:"pumpPower"}},
  {id:"primal_clay",     name:"Primal Clay",       type:"Artifact Creature",subtype:"Shapeshifter",color:"",cmc:4,cost:"4",power:0,toughness:0,keywords:[],rarity:"U",text:"As Primal Clay enters, it becomes your choice of 3/3, 2/2 with flying, or 1/6."},
  {id:"tetravus2",       name:"Tetravus",          type:"Artifact Creature",subtype:"Construct",color:"",cmc:6,cost:"6",power:1,toughness:1,keywords:["FLYING"],rarity:"R",text:"Flying. Tetravus enters with 3 +1/+1 counters."},

  // Arabian Nights additions
  {id:"ali_baba",        name:"Ali Baba",          type:"Creature",subtype:"Human Rogue",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"U",text:"T: Tap target Wall.",activated:{cost:"T",effect:"tapTarget"}},
  {id:"bird_maiden",     name:"Bird Maiden",       type:"Creature",subtype:"Human Bird",color:"R",cmc:3,cost:"2R",power:2,toughness:3,keywords:["FLYING"],rarity:"C",text:"Flying."},
  {id:"cuombajj_witches",name:"Cuombajj Witches",  type:"Creature",subtype:"Human Wizard",color:"B",cmc:2,cost:"BB",power:1,toughness:3,keywords:[],rarity:"C",text:"T: Cuombajj Witches deals 1 damage to any target and 1 damage to any target of an opponent's choice.",activated:{cost:"T",effect:"ping"}},
  {id:"erhnam_djinn2",   name:"Juzam Djinn",       type:"Creature",subtype:"Djinn",color:"B",cmc:4,cost:"2BB",power:5,toughness:5,keywords:[],rarity:"R",text:"At the beginning of your upkeep, Juzam Djinn deals 1 damage to you.",upkeep:"selfDamage1"},
  {id:"flying_carpet",   name:"Flying Carpet",     type:"Artifact",  color:"",cmc:4,cost:"4",text:"2, T: Target creature gains flying until end of turn.",activated:{cost:"2,T",effect:"grantFlying"},rarity:"R"},
  {id:"hasran_ogress",   name:"Hasran Ogress",     type:"Creature",subtype:"Ogre",color:"B",cmc:2,cost:"BB",power:3,toughness:2,keywords:[],rarity:"C",text:"Whenever Hasran Ogress attacks and is not blocked, it deals 3 damage to you instead."},
  {id:"hurr_jackal",     name:"Hurr Jackal",       type:"Creature",subtype:"Jackal",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Prevent all damage that would be dealt to target creature this turn.",activated:{cost:"T",effect:"gainLife1"}},
  {id:"nafs_asp",        name:"Nafs Asp",          type:"Creature",subtype:"Snake",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:[],rarity:"C",text:"Whenever Nafs Asp deals damage to a player, that player loses 1 life unless they pay G."},
  {id:"oasis",           name:"Oasis",             type:"Land",      color:"",cmc:0,cost:"",text:"T: Prevent the next 1 damage that would be dealt to target creature.",produces:[],rarity:"U",activated:{cost:"T",effect:"gainLife1"}},
  {id:"sindbad",         name:"Sindbad",           type:"Creature",subtype:"Human Rogue",color:"U",cmc:2,cost:"1U",power:1,toughness:1,keywords:[],rarity:"U",text:"T: Draw a card, then discard a card unless it's a land.",activated:{cost:"T",effect:"draw1"}},
  {id:"desert",          name:"Desert",            type:"Land",      color:"",cmc:0,cost:"",text:"T: Add C. T: Desert deals 1 damage to target attacking creature.",produces:["C"],rarity:"U",activated:{cost:"T",effect:"damage1"}},
  {id:"bazaar_of_baghdad",name:"Bazaar of Baghdad",type:"Land",      color:"",cmc:0,cost:"",text:"T: Draw two cards, then discard three cards.",produces:[],rarity:"R",activated:{cost:"T",effect:"bazaarActivate"}},
  {id:"library_of_alexandria",name:"Library of Alexandria",type:"Land",color:"",cmc:0,cost:"",text:"T: Add C. T: Draw a card. Activate only if you have exactly seven cards in hand.",produces:["C"],rarity:"R",activated:{cost:"T",effect:"draw1"}},
];

const cDef = id => CARD_DB.find(c=>c.id===id) || null;
const isLand = c => c?.type === "Land";
const isCre  = c => c?.type?.startsWith("Creature");
const isInst = c => c?.type === "Instant";
const isSort = c => c?.type === "Sorcery";
const isArt  = c => c?.type === "Artifact";
const isEnch = c => c?.type?.startsWith("Enchantment");
const isPerm = c => isCre(c)||isArt(c)||isEnch(c)||isLand(c);

// ═══════════════════════════════════════════════════════════════
// ARCHETYPES
// ═══════════════════════════════════════════════════════════════
const ARCHETYPES = {
  WHITE_WEENIE:{name:"White Weenie",color:"W",strategy:"aggro",deck:[
    ...Array(4).fill("savannah_lions"),...Array(4).fill("white_knight"),
    ...Array(2).fill("benalish_hero"),...Array(2).fill("tundra_wolves"),
    ...Array(2).fill("pearled_unicorn"),...Array(2).fill("moorish_cavalry"),
    ...Array(2).fill("serra_angel"),...Array(2).fill("mesa_pegasus"),
    ...Array(2).fill("swords"),...Array(2).fill("disenchant"),
    ...Array(2).fill("wog"),...Array(1).fill("balance"),
    ...Array(1).fill("crusade"),...Array(2).fill("holy_armor"),
    ...Array(17).fill("plains")]},
  BLUE_CONTROL:{name:"Blue Control",color:"U",strategy:"control",deck:[
    ...Array(4).fill("counterspell"),...Array(2).fill("force_spike"),
    ...Array(2).fill("remove_soul"),...Array(2).fill("power_sink"),
    ...Array(3).fill("unsummon"),...Array(2).fill("boomerang"),
    ...Array(2).fill("psionic_blast"),...Array(1).fill("braingeyser"),
    ...Array(1).fill("ancestral"),...Array(1).fill("time_walk"),
    ...Array(2).fill("phantom_monster"),...Array(2).fill("azure_drake"),
    ...Array(2).fill("air_elemental"),...Array(1).fill("mahamoti_djinn"),
    ...Array(2).fill("mana_short"),
    ...Array(17).fill("island")]},
  BLACK_REANIMATOR:{name:"Black Reanimator",color:"B",strategy:"combo",deck:[
    ...Array(4).fill("dark_ritual"),...Array(3).fill("hypnotic_specter"),
    ...Array(2).fill("sengir_vampire"),...Array(2).fill("lord_of_pit"),
    ...Array(2).fill("nightmare"),...Array(2).fill("juzam_djinn"),
    ...Array(3).fill("terror"),...Array(2).fill("sinkhole"),
    ...Array(2).fill("demonic_tutor"),...Array(2).fill("mind_twist"),
    ...Array(2).fill("animate_dead"),...Array(1).fill("drain_life"),
    ...Array(2).fill("black_knight"),...Array(2).fill("royal_assassin"),
    ...Array(17).fill("swamp")]},
  RED_BURN:{name:"Red Burn",color:"R",strategy:"aggro",deck:[
    ...Array(4).fill("lightning_bolt"),...Array(4).fill("chain_lightning"),
    ...Array(3).fill("fireball"),...Array(2).fill("disintegrate"),
    ...Array(2).fill("lava_axe"),...Array(2).fill("earthquake"),
    ...Array(3).fill("mons_goblin"),...Array(2).fill("goblin_balloon"),
    ...Array(2).fill("goblin_king"),...Array(2).fill("hill_giant"),
    ...Array(2).fill("dragon_whelp"),...Array(1).fill("shivan_dragon"),
    ...Array(19).fill("mountain")]},
  GREEN_STOMPY:{name:"Green Stompy",color:"G",strategy:"aggro",deck:[
    ...Array(4).fill("llanowar_elves"),...Array(4).fill("fyndhorn_elves"),
    ...Array(2).fill("kird_ape"),...Array(3).fill("grizzly_bears"),
    ...Array(2).fill("war_mammoth"),...Array(2).fill("erhnam_djinn"),
    ...Array(2).fill("craw_wurm"),...Array(1).fill("force_of_nature"),
    ...Array(2).fill("birds_of_paradise"),...Array(3).fill("giant_growth"),
    ...Array(2).fill("berserk"),...Array(1).fill("regrowth"),
    ...Array(2).fill("tranquility"),
    ...Array(2).fill("taiga"),...Array(16).fill("forest")]},
  BLUE_TEMPO:{name:"Blue Tempo",color:"U",strategy:"control",deck:[
    ...Array(4).fill("flying_men"),...Array(4).fill("dandan"),
    ...Array(3).fill("phantom_warrior"),...Array(2).fill("azure_drake"),
    ...Array(4).fill("counterspell"),...Array(3).fill("unsummon"),
    ...Array(3).fill("boomerang"),...Array(2).fill("force_spike"),
    ...Array(2).fill("mana_short"),...Array(2).fill("psionic_blast"),
    ...Array(1).fill("braingeyser"),...Array(1).fill("ancestral"),
    ...Array(1).fill("time_walk"),
    ...Array(18).fill("island")]},
  BLACK_CONTROL:{name:"Black Control",color:"B",strategy:"control",deck:[
    ...Array(4).fill("dark_ritual"),...Array(4).fill("hypnotic_specter"),
    ...Array(3).fill("frozen_shade"),...Array(3).fill("bog_wraith"),
    ...Array(2).fill("vampire_bats"),...Array(2).fill("zombie_master"),
    ...Array(4).fill("terror"),...Array(2).fill("dark_banishing"),
    ...Array(2).fill("sinkhole"),...Array(2).fill("mind_twist"),
    ...Array(2).fill("pestilence"),...Array(1).fill("demonic_tutor"),
    ...Array(1).fill("drain_life"),
    ...Array(18).fill("swamp")]},
  RED_AGGRO:{name:"Goblin Horde",color:"R",strategy:"aggro",deck:[
    ...Array(4).fill("mons_goblin"),...Array(4).fill("goblin_hero"),
    ...Array(3).fill("goblin_balloon"),...Array(3).fill("goblin_king"),
    ...Array(2).fill("ironclaw_orcs"),...Array(2).fill("orcish_artillery"),
    ...Array(2).fill("hurloon_minotaur"),
    ...Array(4).fill("lightning_bolt"),...Array(4).fill("chain_lightning"),
    ...Array(2).fill("fireball"),...Array(2).fill("earthquake"),
    ...Array(18).fill("mountain")]},
  ARTIFACT_CONTROL:{name:"Artifact Control",color:"",strategy:"control",deck:[
    "black_lotus","sol_ring","mana_vault","basalt_monolith",
    ...Array(2).fill("ornithopter"),...Array(2).fill("juggernaut"),
    ...Array(2).fill("clockwork_beast"),...Array(2).fill("colossus_of_sardia"),
    ...Array(2).fill("triskelion"),...Array(2).fill("su_chi"),
    "nevinyrral_disk","icy_manipulator","disrupting_scepter","rod_of_ruin",
    ...Array(2).fill("living_wall"),...Array(2).fill("brass_man"),
    ...Array(2).fill("mox_pearl"),...Array(2).fill("mox_sapphire"),
    ...Array(2).fill("mox_jet"),...Array(2).fill("mox_ruby"),
    ...Array(2).fill("mox_emerald"),
    ...Array(4).fill("plains"),...Array(3).fill("island"),
    ...Array(3).fill("swamp"),...Array(3).fill("mountain"),...Array(3).fill("forest")]},
  FIVE_COLOR_BOMB:{name:"Five-Color Chaos",color:"WUBRG",strategy:"bomb",deck:[
    "black_lotus","sol_ring","ancestral","time_walk","demonic_tutor",
    ...Array(2).fill("mox_pearl"),...Array(2).fill("mox_sapphire"),
    ...Array(2).fill("mox_jet"),...Array(2).fill("mox_ruby"),
    ...Array(2).fill("mox_emerald"),
    "swords","wog","armageddon","balance","counterspell","mind_twist",
    "earthquake","berserk","serra_angel","mahamoti_djinn",
    "shivan_dragon","force_of_nature","juzam_djinn","lord_of_pit",
    ...Array(3).fill("plains"),...Array(3).fill("island"),
    ...Array(3).fill("swamp"),...Array(3).fill("mountain"),...Array(3).fill("forest")]},
};

// ═══════════════════════════════════════════════════════════════
// OVERWORLD CONSTANTS
// ═══════════════════════════════════════════════════════════════
const MAP_W=32, MAP_H=22, TSIZ=34;

const TERRAIN={
  PLAINS:  {id:"PLAINS",  color:"#b5c87a",label:"Plains",  icon:"☀",moveC:1, mana:"W"},
  FOREST:  {id:"FOREST",  color:"#4a7c59",label:"Forest",  icon:"🌲",moveC:2, mana:"G"},
  SWAMP:   {id:"SWAMP",   color:"#4a5568",label:"Swamp",   icon:"🌿",moveC:3, mana:"B"},
  MOUNTAIN:{id:"MOUNTAIN",color:"#9b7355",label:"Mountain",icon:"⛰",moveC:2, mana:"R"},
  ISLAND:  {id:"ISLAND",  color:"#4a90b8",label:"Island",  icon:"~", moveC:2, mana:"U"},
  WATER:   {id:"WATER",   color:"#1a3a5c",label:"Water",   icon:"≈", moveC:99,mana:"U"},
};

const MHEX={W:"#f9f2d8",U:"#99ccee",B:"#bb99dd",R:"#ee8855",G:"#88cc66",C:"#aaaaaa"};
const MSYM={W:"☀",U:"💧",B:"💀",R:"🔥",G:"🌿"};
const MAGE_N={W:"Delenia",U:"Xylos",B:"Mortis",R:"Karag",G:"Sylvara"};
const MAGE_T={W:"the White Tyrant",U:"the Blue Schemer",B:"the Black Necromancer",R:"the Red Warlord",G:"the Green Ancient"};
const MAGE_A={W:"WHITE_WEENIE",U:"BLUE_CONTROL",B:"BLACK_REANIMATOR",R:"RED_BURN",G:"GREEN_STOMPY"};
// Alternative archetypes for variety in dungeon rooms
const DUNGEON_ARCHS=["WHITE_WEENIE","BLUE_CONTROL","BLUE_TEMPO","BLACK_REANIMATOR","BLACK_CONTROL","RED_BURN","RED_AGGRO","GREEN_STOMPY","ARTIFACT_CONTROL"];
const CASTLE_N={W:"White Keep",U:"Azure Tower",B:"Shadow Spire",R:"Fire Citadel",G:"Root Throne"};
const CASTLE_MOD={
  W:{name:"Holy Ground",     desc:"All creatures have protection from non-white spells."},
  U:{name:"Tidal Lock",      desc:"Player may only cast one spell per turn."},
  B:{name:"Death's Embrace", desc:"Mage's creatures gain lifelink."},
  R:{name:"Inferno",         desc:"At end of each turn, all players take 1 damage."},
  G:{name:"Overgrowth",      desc:"All lands tap for 2 mana instead of 1."},
  ARZ:{name:"Dominion",      desc:"Arzakon commands all five colors. The final battle begins."},
};
// Run score calculation
function calcRunScore(magesDefeated,dungeonsCleared,townsSaved,collection,poweredNine,manaLinksEstablished){
  let score=0;
  if(magesDefeated.length===5)score+=1000;
  score+=magesDefeated.length*50;
  score+=dungeonsCleared*10;
  score+=townsSaved*5;
  score+=collection*2;
  score+=poweredNine*100;
  score-=manaLinksEstablished*25;
  return Math.max(0,score);
}
const POWERED_NINE_IDS=["black_lotus","mox_pearl","mox_sapphire","mox_jet","mox_ruby","mox_emerald","ancestral","time_walk"];
const COLORS=["W","U","B","R","G"];

const TOWN_POOL=["Ardestan","Veldatha","Morheim","Caelthas","Sunspire","Duskwall","Greymere","Thornhaven","Ironwake","Silverbend","Coldwater","Emberfield","Ashwood","Deepmoor","Starfall","Crestholm","Mistpeak","Dawncroft","Stonebridge","Oakhearth"];
const DUNG_POOL=["Tomb of the Ancients","Cavern of Echoes","Vault of Shadows","The Sunken Library","Crypts of Mortum","Maze of Lost Souls","The Shattered Keep","Den of the Beast","Forgotten Catacombs","The Spiral Descent","Lair of the Wyrm","The Iron Labyrinth"];
const DUNG_MODS=[
  {id:"POWER_STRUGGLE",name:"Power Struggle",desc:"Each turn a random card swaps between hands.",icon:"⇄"},
  {id:"CURSED_GROUND", name:"Cursed Ground",  desc:"All creatures enter with a –1/–1 counter.",icon:"☠"},
  {id:"MANA_SURGE",    name:"Mana Surge",     desc:"Both players gain +1 mana each turn.",icon:"⚡"},
  {id:"SILENCE",       name:"Silence",        desc:"No instants may be cast.",icon:"🤫"},
  {id:"TWILIGHT",      name:"Eternal Twilight",desc:"No creatures may attack until turn 3.",icon:"🌘"},
  {id:"OVERLOAD",      name:"Overload",       desc:"All spells cost 1 less (minimum 1).",icon:"✦"},
];
const QUESTS=[
  {id:"q1",title:"Purge the Risen",   desc:"Defeat undead creatures in the nearby swamp.",         rewardId:"swords",     rewardType:"card",rewardGold:0},
  {id:"q2",title:"Recover the Tome",  desc:"Retrieve the lost tome from a dungeon.",               rewardId:null,         rewardType:"gold",rewardGold:60},
  {id:"q3",title:"Defend the Gate",   desc:"Fend off the goblin horde from the mountains.",        rewardId:"wog",        rewardType:"card",rewardGold:0},
  {id:"q4",title:"Chart the Wilds",   desc:"Explore 5 unrevealed tiles and report back.",          rewardId:null,         rewardType:"gold",rewardGold:40},
  {id:"q5",title:"The Lost Spell",    desc:"Find a sage who knows the ancient counterspell.",      rewardId:"counterspell",rewardType:"card",rewardGold:0},
];
const OW_ARTS=[
  {id:"boots",  name:"Magical Boots",  icon:"👢",desc:"Movement cost –1 per tile (min 1).",owned:false},
  {id:"amulet", name:"Amulet of Life", icon:"💎",desc:"Maximum HP +5.",owned:false},
  {id:"focus",  name:"Mage's Focus",   icon:"🔮",desc:"Draw 1 extra card at duel start.",owned:false},
  {id:"ward",   name:"Arzakon's Ward", icon:"🛡",desc:"Mana link threshold raised to 5.",owned:false},
  {id:"stone",  name:"Scrying Stone",  icon:"🔯",desc:"Reveal 1 dungeon free per town visit.",owned:false},
];
const ART_REWARD={W:"ward",U:"stone",B:"amulet",R:"focus",G:"boots"};

const MONSTER_TABLE={
  PLAINS:  [
    {name:"Pegasus Cavalry",   hp:18,archKey:"WHITE_WEENIE",   tier:1},
    {name:"Knight of the Keep",hp:22,archKey:"WHITE_WEENIE",   tier:2},
    {name:"Holy Crusader",     hp:26,archKey:"WHITE_WEENIE",   tier:3}],
  FOREST:  [
    {name:"Forest Spider",    hp:18,archKey:"GREEN_STOMPY",   tier:1},
    {name:"Elder Druid",      hp:22,archKey:"GREEN_STOMPY",   tier:2},
    {name:"Ancient Wurm",     hp:28,archKey:"GREEN_STOMPY",   tier:3}],
  SWAMP:   [
    {name:"Risen Zombie",     hp:18,archKey:"BLACK_CONTROL",  tier:1},
    {name:"Shadow Specter",   hp:22,archKey:"BLACK_REANIMATOR",tier:2},
    {name:"Mortis's Shade",   hp:26,archKey:"BLACK_REANIMATOR",tier:3}],
  MOUNTAIN:[
    {name:"Goblin Raider",    hp:16,archKey:"RED_AGGRO",      tier:1},
    {name:"Mountain Ogre",    hp:22,archKey:"RED_BURN",       tier:2},
    {name:"Fire Giant",       hp:28,archKey:"RED_BURN",       tier:3}],
  ISLAND:  [
    {name:"Reef Dancer",      hp:18,archKey:"BLUE_TEMPO",     tier:1},
    {name:"Tidal Sorcerer",   hp:22,archKey:"BLUE_CONTROL",   tier:2},
    {name:"Xylos's Agent",    hp:26,archKey:"BLUE_CONTROL",   tier:3}],
};

const START_DECKS={
  W:{hp:22,maxHP:22,gold:40,deckIds:["savannah_lions","white_knight","serra_angel","swords","healing_salve","wog",...Array(9).fill("plains")]},
  U:{hp:18,maxHP:18,gold:50,deckIds:["counterspell","merfolk_pearl","air_elemental","ancestral","unsummon","braingeyser",...Array(9).fill("island")]},
  B:{hp:18,maxHP:18,gold:35,deckIds:["dark_ritual","hypnotic_specter","sengir_vampire","terror","demonic_tutor","mind_twist",...Array(9).fill("swamp")]},
  R:{hp:20,maxHP:20,gold:40,deckIds:["lightning_bolt","chain_lightning","fireball","goblin_king","shivan_dragon","lava_axe",...Array(9).fill("mountain")]},
  G:{hp:22,maxHP:22,gold:30,deckIds:["llanowar_elves","fyndhorn_elves","craw_wurm","force_of_nature","giant_growth","stream_of_life",...Array(9).fill("forest")]},
};

// ═══════════════════════════════════════════════════════════════
// SEEDED RNG  (mulberry32)
// ═══════════════════════════════════════════════════════════════
function mkRng(seed){let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};}

// ═══════════════════════════════════════════════════════════════
// MAP GENERATION
// ═══════════════════════════════════════════════════════════════
function generateMap(seed){
  const rng=mkRng(seed);
  const tiles=[];
  for(let y=0;y<MAP_H;y++){tiles[y]=[];for(let x=0;x<MAP_W;x++){
    const nx=x/MAP_W-.5,ny=y/MAP_H-.5,dist=Math.sqrt(nx*nx+ny*ny),v=rng();
    let terrain;
    if(dist>.45&&v>.3)terrain=TERRAIN.WATER;
    else if(v<.18)terrain=TERRAIN.MOUNTAIN;
    else if(v<.32)terrain=TERRAIN.SWAMP;
    else if(v<.52)terrain=TERRAIN.FOREST;
    else if(v<.72)terrain=TERRAIN.PLAINS;
    else terrain=TERRAIN.ISLAND;
    tiles[y][x]={x,y,terrain,structure:null,revealed:false,manaLink:null,townData:null,dungeonData:null,castleData:null,encChance:.11+dist*.14};
  }}

  const used=new Set();
  const free=(x,y)=>!used.has(`${x},${y}`);
  const claim=(x,y)=>used.add(`${x},${y}`);
  const spot=(x1,x2,y1,y2,minD=3)=>{
    for(let a=0;a<200;a++){
      const x=Math.floor(x1+rng()*(x2-x1)),y=Math.floor(y1+rng()*(y2-y1));
      if(!tiles[y]?.[x]||tiles[y][x].terrain===TERRAIN.WATER)continue;
      if(!free(x,y))continue;
      let ok=true;
      for(const k of used){const[ox,oy]=k.split(",").map(Number);if(Math.abs(ox-x)+Math.abs(oy-y)<minD){ok=false;break;}}
      if(ok)return{x,y};
    }return null;
  };

  const tNames=[...TOWN_POOL].sort(()=>rng()-.5);
  const townCount=8+Math.floor(rng()*3);
  for(let i=0;i<townCount;i++){
    const p=spot(2,MAP_W-2,2,MAP_H-2,3);if(!p)continue;claim(p.x,p.y);
    const stock=CARD_DB.filter(c=>!isLand(c)).sort(()=>rng()-.5).slice(0,6+Math.floor(rng()*5));
    tiles[p.y][p.x].structure="TOWN";
    tiles[p.y][p.x].townData={name:tNames[i]||`Town${i}`,stock,quest:rng()>.4?QUESTS[Math.floor(rng()*QUESTS.length)]:null,hasSage:rng()>.5,hasBlackMarket:rng()>.75,questDone:false};
  }

  const dNames=[...DUNG_POOL].sort(()=>rng()-.5);
  const dungCount=6+Math.floor(rng()*3);
  for(let i=0;i<dungCount;i++){
    const p=spot(2,MAP_W-2,2,MAP_H-2,4);if(!p)continue;claim(p.x,p.y);
    const mod=DUNG_MODS[Math.floor(rng()*DUNG_MODS.length)];
    const rooms=3+Math.floor(rng()*3);
    const rareLoot=CARD_DB.filter(c=>c.rarity==="R"&&!isLand(c)).sort(()=>rng()-.5).slice(0,2);
    tiles[p.y][p.x].structure="DUNGEON";
    tiles[p.y][p.x].dungeonData={name:dNames[i]||`Dungeon${i}`,mod,rooms,domColor:COLORS[Math.floor(rng()*5)],loot:rareLoot};
  }

  const quads=[{x1:1,x2:MAP_W/2-2,y1:1,y2:MAP_H/2-2},{x1:MAP_W/2+2,x2:MAP_W-2,y1:1,y2:MAP_H/2-2},{x1:1,x2:MAP_W/2-2,y1:MAP_H/2+2,y2:MAP_H-2},{x1:MAP_W/2+2,x2:MAP_W-2,y1:MAP_H/2+2,y2:MAP_H-2},{x1:MAP_W/2-3,x2:MAP_W/2+3,y1:MAP_H/2-3,y2:MAP_H/2+3}];
  [...COLORS].sort(()=>rng()-.5).forEach((col,i)=>{
    const q=quads[i];const p=spot(q.x1,q.x2,q.y1,q.y2,5);if(!p)return;claim(p.x,p.y);
    tiles[p.y][p.x].structure="CASTLE";
    tiles[p.y][p.x].castleData={color:col,mage:MAGE_N[col],defeated:false};
  });

  let sx=Math.floor(MAP_W/2),sy=Math.floor(MAP_H/2);
  for(let r=0;r<8;r++){if(tiles[sy]?.[sx]?.terrain!==TERRAIN.WATER&&!tiles[sy]?.[sx]?.structure)break;sx+=rng()>.5?1:-1;sy+=rng()>.5?1:-1;sx=Math.max(1,Math.min(MAP_W-2,sx));sy=Math.max(1,Math.min(MAP_H-2,sy));}
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(tiles[sy+dy]?.[sx+dx])tiles[sy+dy][sx+dx].revealed=true;
  return{tiles,sx,sy};
}

// BFS pathfinding
function bfs(tiles,sx,sy,ex,ey){
  if(!tiles[ey]?.[ex]||tiles[ey][ex].terrain===TERRAIN.WATER)return null;
  const visited=new Set([`${sx},${sy}`]),q=[{x:sx,y:sy,path:[]}];
  while(q.length){const{x,y,path}=q.shift();if(x===ex&&y===ey)return path;
    for(const[dx,dy]of[[0,1],[0,-1],[1,0],[-1,0]]){const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;
      if(visited.has(k))continue;const t=tiles[ny]?.[nx];if(!t||!t.revealed||t.terrain===TERRAIN.WATER)continue;
      visited.add(k);q.push({x:nx,y:ny,path:[...path,{x:nx,y:ny}]});}}return null;
}

// ═══════════════════════════════════════════════════════════════
// DUEL ENGINE  (self-contained, integrated into phase 3)
// ═══════════════════════════════════════════════════════════════
const mkId=()=>Math.random().toString(36).slice(2,9);
const shuffle=a=>{const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;};

function mkInst(id,ctrl){
  const d=cDef(id);if(!d)return null;
  return{...d,iid:mkId(),controller:ctrl,tapped:false,summoningSick:true,attacking:false,blocking:null,damage:0,counters:{}};
}

function parseMana(cost){if(!cost)return{W:0,U:0,B:0,R:0,G:0,C:0,generic:0};const p={W:0,U:0,B:0,R:0,G:0,C:0,generic:0};let i=0;while(i<cost.length){const ch=cost[i];if("WUBRG".includes(ch)){p[ch]++;i++;}else if(ch==="C"){p.C++;i++;}else if(ch==="X"){i++;}else if(!isNaN(parseInt(ch))){let n="";while(i<cost.length&&!isNaN(parseInt(cost[i]))){n+=cost[i];i++;}p.generic+=parseInt(n);}else i++;}return p;}
function canPay(pool,cost){const r=parseMana(cost);const a={...pool};for(const c of["W","U","B","R","G","C"]){if(a[c]<r[c])return false;a[c]-=r[c];}return Object.values(a).reduce((s,v)=>s+v,0)>=r.generic;}
function payMana(pool,cost){const r=parseMana(cost);const p={...pool};for(const c of["W","U","B","R","G","C"])p[c]=Math.max(0,p[c]-r[c]);let g=r.generic;for(const c of["C","G","R","B","U","W"]){const s=Math.min(p[c],g);p[c]-=s;g-=s;}return p;}
const hasKw=(c,k)=>c?.keywords?.includes(k);
function getBF(state,iid){return state.p.bf.find(c=>c.iid===iid)||state.o.bf.find(c=>c.iid===iid)||null;}
function getPow(c,state){
  let p=c.power??0;
  if(c.dynamic){
    if(c.name==="Plague Rats")p=[...state.p.bf,...state.o.bf].filter(x=>x.name==="Plague Rats").length;
    else if(c.dynamicType==="swampCount")p=state[c.controller]?.bf.filter(x=>isLand(x)&&x.subtype?.includes("Swamp")).length??0;
    else if(c.dynamicType==="forestCount")p=state[c.controller]?.bf.filter(x=>isLand(x)&&x.subtype?.includes("Forest")).length??0;
    else if(c.dynamicType==="creatureCount")p=[...state.p.bf,...state.o.bf].filter(x=>isCre(x)&&x.controller===c.controller).length;
    else if(c.dynamicType==="forestBonus")p=1+(state[c.controller]?.bf.some(x=>isLand(x)&&x.subtype?.includes("Forest"))?1:0);
  }
  return Math.max(0,p+(c.counters?.P1P1??0)-(c.counters?.M1M1??0));
}
function getTou(c,state){
  let t=c.toughness??0;
  if(c.dynamic){
    if(c.name==="Plague Rats")t=[...state.p.bf,...state.o.bf].filter(x=>x.name==="Plague Rats").length;
    else if(c.dynamicType==="swampCount")t=state[c.controller]?.bf.filter(x=>isLand(x)&&x.subtype?.includes("Swamp")).length??0;
    else if(c.dynamicType==="forestCount")t=state[c.controller]?.bf.filter(x=>isLand(x)&&x.subtype?.includes("Forest")).length??0;
    else if(c.dynamicType==="creatureCount")t=[...state.p.bf,...state.o.bf].filter(x=>isCre(x)&&x.controller===c.controller).length;
    else if(c.dynamicType==="forestBonus")t=1+(state[c.controller]?.bf.some(x=>isLand(x)&&x.subtype?.includes("Forest"))?2:1);
  }
  return Math.max(0,t+(c.counters?.P1P1??0)-(c.counters?.M1M1??0));
}
function canBlockDuel(bl,at){if(hasKw(at,"FLYING")&&!hasKw(bl,"FLYING")&&!hasKw(bl,"REACH"))return false;if(hasKw(at,"PROTECTION")&&at.protection===bl.color)return false;if(hasKw(bl,"PROTECTION")&&bl.protection===at.color)return false;return true;}
function dlog(s,text,type="info"){return{...s,log:[...s.log.slice(-100),{text,type,turn:s.turn}]};}
function hurt(s,who,amt,src=""){
  const nl=s[who].life-amt;
  let ns={...s,[who]:{...s[who],life:nl,lifeAnim:amt>0?"damage":"heal"}};
  if(amt>0)ns=dlog(ns,`${who} takes ${amt} damage${src?` from ${src}`:""}.`,"damage");
  else if(amt<0)ns=dlog(ns,`${who} gains ${-amt} life.`,"heal");
  if(nl<=0&&!ns.over)ns={...ns,over:{winner:who==="p"?"o":"p",reason:`${who} reached 0 life`}};
  return ns;
}
function drawD(s,who,n=1){let ns=s;for(let i=0;i<n;i++){if(!ns[who].lib.length){ns={...ns,over:{winner:who==="p"?"o":"p",reason:`${who} drew from empty library`}};return ns;}const[top,...rest]=ns[who].lib;ns={...ns,[who]:{...ns[who],lib:rest,hand:[...ns[who].hand,top]}};}return ns;}
function zMove(s,iid,fw,tw,tz){let card=null;let ns={...s};for(const z of["hand","bf","gy","exile","lib"]){const idx=ns[fw]?.[z]?.findIndex(c=>c.iid===iid);if(idx!==undefined&&idx>=0){card=ns[fw][z][idx];ns={...ns,[fw]:{...ns[fw],[z]:ns[fw][z].filter((_,i)=>i!==idx)}};break;}}if(!card)return s;let a={...card,controller:tw};if(tz==="bf")a={...a,tapped:false,summoningSick:!hasKw(card,"HASTE"),attacking:false,blocking:null,damage:0};if(tz==="gy"||tz==="hand")a={...a,tapped:false,damage:0,counters:{},attacking:false,blocking:null};return{...ns,[tw]:{...ns[tw],[tz]:[...ns[tw][tz],a]}};}
function checkDeath(s){let ns=s;for(const w of["p","o"]){const dead=ns[w].bf.filter(c=>isCre(c)&&c.damage>=getTou(c,ns)&&getTou(c,ns)>0);for(const c of dead){ns=zMove(ns,c.iid,w,w,"gy");ns=dlog(ns,`${c.name} is destroyed.`,"death");}}return ns;}
function burnMana(s,who,ruleset){if(!ruleset.manaBurn)return{...s,[who]:{...s[who],mana:{W:0,U:0,B:0,R:0,G:0,C:0}}};const u=Object.values(s[who].mana).reduce((a,b)=>a+b,0);let ns={...s,[who]:{...s[who],mana:{W:0,U:0,B:0,R:0,G:0,C:0}}};if(u>0)ns=hurt(ns,who,u,"mana burn");return ns;}

function resolveEff(s,item){
  const{card,caster,targets,xVal}=item;const opp=caster==="p"?"o":"p";
  let ns=s;const tgt=targets?.[0];const tgtC=tgt?getBF(ns,tgt):null;
  switch(card.effect){
    case"damage3":{if(tgt==="p"||tgt==="o")ns=hurt(ns,tgt,3,card.name);else if(tgtC){ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,damage:c.damage+3}:c)}};ns=checkDeath(ns);}break;}
    case"damage5":{ns=hurt(ns,tgt||opp,5,card.name);break;}
    case"damageX":{if(tgt==="p"||tgt==="o")ns=hurt(ns,tgt,xVal,card.name);else ns=hurt(ns,opp,xVal,card.name);break;}
    case"psionicBlast":{ns=hurt(ns,tgt||opp,4,card.name);ns=hurt(ns,caster,2,"Psionic Blast (self)");break;}
    case"counter":{const top=ns.stack[ns.stack.length-2];if(top){ns={...ns,stack:ns.stack.filter(i=>i.id!==top.id),[top.caster]:{...ns[top.caster],gy:[...ns[top.caster].gy,{...top.card}]}};ns=dlog(ns,`${card.name} counters ${top.card?.name}.`,"effect");}break;}
    case"draw3":{ns=drawD(ns,tgt==="p"||tgt==="o"?tgt:caster,3);break;}
    case"draw1":{ns=drawD(ns,caster,1);break;}
    case"drawX":{ns=drawD(ns,caster,xVal);break;}
    case"gainLife3":{ns=hurt(ns,caster,-3);break;}
    case"gainLifeX":{ns=hurt(ns,caster,-xVal);break;}
    case"bounce":{if(tgtC){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"hand");ns=dlog(ns,`${card.name} returns ${tgtC.name}.`,"effect");}break;}
    case"exileCreature":{if(tgtC){const lf=getPow(tgtC,ns);ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,ns.ruleset.exileZone?"exile":"gy");ns=hurt(ns,tgtC.controller,-lf,"Swords to Plowshares");ns=dlog(ns,`${card.name} exiles ${tgtC.name}.`,"effect");}break;}
    case"destroy":{if(tgtC){const r=card.restriction;let ok=true;if(r==="nonArtifactNonBlack"&&(tgtC.color==="B"||isArt(tgtC)))ok=false;if(r==="nonBlack"&&tgtC.color==="B")ok=false;if(ok){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}}break;}
    case"destroyArtifact":{if(tgtC&&isArt(tgtC)){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}break;}
    case"destroyArtOrEnch":{if(tgtC&&(isArt(tgtC)||isEnch(tgtC))){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}break;}
    case"destroyTargetLand":{if(tgtC&&isLand(tgtC)){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}break;}
    case"wrathAll":{ns=dlog(ns,"Wrath of God — all creatures destroyed!","effect");for(const w of["p","o"]){for(const c of ns[w].bf.filter(isCre))ns=zMove(ns,c.iid,w,w,"gy");}break;}
    case"destroyAllLands":{ns=dlog(ns,"Armageddon — all lands destroyed!","effect");for(const w of["p","o"]){for(const c of ns[w].bf.filter(isLand))ns=zMove(ns,c.iid,w,w,"gy");}break;}
    case"pumpCreature":{if(tgtC&&card.mod){ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,power:(c.power||0)+(card.mod.power||0),toughness:(c.toughness||0)+(card.mod.toughness||0)}:c)}};ns=dlog(ns,`${card.name} pumps ${tgtC.name}.`,"effect");}break;}
    case"addMana":{const ms=Array.isArray(card.mana)?card.mana:[card.mana||"C"];const mp={...ns[caster].mana};for(const m of ms)if("WUBRGC".includes(m))mp[m]=(mp[m]||0)+1;ns={...ns,[caster]:{...ns[caster],mana:mp}};ns=dlog(ns,`${card.name} adds mana.`,"mana");break;}
    case"tutor":{const nl=ns[caster].lib.filter(c=>!isLand(c));if(nl.length){const f=nl[Math.floor(Math.random()*nl.length)];ns=zMove(ns,f.iid,caster,caster,"hand");ns={...ns,[caster]:{...ns[caster],lib:shuffle(ns[caster].lib)}};ns=dlog(ns,`${card.name} — found ${f.name}.`,"effect");}break;}
    case"discardX":{for(let i=0;i<xVal;i++){if(!ns[opp].hand.length)break;const idx=Math.floor(Math.random()*ns[opp].hand.length);const dc=ns[opp].hand[idx];ns={...ns,[opp]:{...ns[opp],hand:ns[opp].hand.filter((_,j)=>j!==idx),gy:[...ns[opp].gy,dc]}};ns=dlog(ns,`${opp} discards ${dc.name}.`,"effect");}break;}
    case"wheelOfFortune":{for(const w of["p","o"]){ns={...ns,[w]:{...ns[w],gy:[...ns[w].gy,...ns[w].hand],hand:[]}};ns=drawD(ns,w,7);}ns=dlog(ns,"Wheel of Fortune!","effect");break;}
    case"extraTurn":{ns={...ns,[caster]:{...ns[caster],extraTurns:(ns[caster].extraTurns||0)+1}};ns=dlog(ns,`${caster} takes an extra turn!`,"effect");break;}
    case"regrowth":{if(ns[caster].gy.length){const top=ns[caster].gy[ns[caster].gy.length-1];ns=zMove(ns,top.iid,caster,caster,"hand");ns=dlog(ns,`Regrowth returns ${top.name}.`,"effect");}break;}
    case"reanimate":{
      // Reanimate: return top creature from any graveyard to caster's control
      const allGY=[...ns[opp].gy,...ns[caster].gy].filter(isCre);
      if(allGY.length){
        // Prefer opponent's graveyard
        const oppCres=ns[opp].gy.filter(isCre);
        const target=oppCres.length?oppCres[oppCres.length-1]:allGY[allGY.length-1];
        const fromWho=ns[opp].gy.find(c=>c.iid===target.iid)?opp:caster;
        ns=zMove(ns,target.iid,fromWho,caster,"bf");
        ns=dlog(ns,`${card.name} returns ${target.name} from the graveyard under ${caster}'s control.`,"effect");
      }else ns=dlog(ns,`${card.name}: no creatures in any graveyard.`,"effect");
      break;}
    case"hurricane":{for(const w of["p","o"]){ns=hurt(ns,w,xVal,"Hurricane");const fl=ns[w].bf.filter(c=>isCre(c)&&hasKw(c,"FLYING"));for(const c of fl)ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(x=>x.iid===c.iid?{...x,damage:x.damage+xVal}:x)}};}ns=checkDeath(ns);break;}
    case"armageddonDisk":{ns=dlog(ns,"Nevinyrral's Disk fires!","effect");for(const w of["p","o"]){for(const c of ns[w].bf.filter(c=>isCre(c)||isArt(c)||isEnch(c)))ns=zMove(ns,c.iid,w,w,"gy");}break;}
    // ── Previously stubbed effects now implemented ───────────────
    case"enchantCreature":{
      // Holy Armor: attach aura, apply toughness bonus permanently
      if(tgtC&&card.mod){
        ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid
          ?{...c,toughness:(c.toughness||0)+(card.mod.toughness||0),power:(c.power||0)+(card.mod.power||0),enchantments:[...(c.enchantments||[]),card.id]}
          :c)}};
        ns=dlog(ns,`${card.name} enchants ${tgtC.name}.`,"effect");
      }break;}
    case"pumpPower":{
      // Shivan Dragon: +1/+0 until end of turn (stored as temporary counter)
      if(tgtC){
        ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid
          ?{...c,power:(c.power||0)+1}:c)}};
        ns=dlog(ns,`${card.name} gets +1/+0.`,"effect");
      }break;}
    case"gainFlying":{
      // Goblin Balloon: grant flying keyword until end of turn
      if(tgtC){
        const kws=[...(tgtC.keywords||[])];
        if(!kws.includes("FLYING"))kws.push("FLYING");
        ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,keywords:kws}:c)}};
        ns=dlog(ns,`${tgtC.name} gains flying.`,"effect");
      }break;}
    case"addMana3Any":{
      // Black Lotus: add 3 mana of chosen color — stored as pending choice
      // For AI/batch: default to the most needed color; player gets a modal
      const chosenColor=item.chosenColor||"C";
      const mp={...ns[caster].mana};
      mp[chosenColor]=(mp[chosenColor]||0)+3;
      ns={...ns,[caster]:{...ns[caster],mana:mp}};
      ns=dlog(ns,`Black Lotus adds 3${chosenColor}.`,"mana");
      break;}
    case"powerSink":{
      // Counter unless opponent pays X; if not, tap all their lands and drain mana
      const top=ns.stack[ns.stack.length-2];
      if(top){
        // AI/simplified: always resolves as counter + drain
        ns={...ns,stack:ns.stack.filter(i=>i.id!==top.id),[top.caster]:{...ns[top.caster],gy:[...ns[top.caster].gy,{...top.card}]}};
        // Tap all opponent's lands
        ns={...ns,[opp]:{...ns[opp],bf:ns[opp].bf.map(c=>isLand(c)?{...c,tapped:true}:c),mana:{W:0,U:0,B:0,R:0,G:0,C:0}}};
        ns=dlog(ns,`Power Sink counters ${top.card?.name} and drains ${opp}'s mana.`,"effect");
      }break;}
    case"ping":{
      // Prodigal Sorcerer: deal 1 damage to target
      if(tgt==="p"||tgt==="o")ns=hurt(ns,tgt,1,card.name);
      else if(tgtC){
        ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,damage:c.damage+1}:c)}};
        ns=checkDeath(ns);
      }break;}
    case"destroyTapped":{
      // Royal Assassin: destroy target tapped creature
      if(tgtC&&tgtC.tapped){
        ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");
        ns=dlog(ns,`Royal Assassin destroys ${tgtC.name}.`,"effect");
      }break;}
    case"regenerate":{
      // Drudge Skeletons: mark creature as regenerating
      if(tgtC){
        ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,regenerating:true}:c)}};
        ns=dlog(ns,`${tgtC.name} will regenerate.`,"effect");
      }break;}
    // ── NEW TIER 1 EFFECTS ───────────────────────────────────────────
    case"fog":{
      // Prevent all combat damage this turn
      ns={...ns,fogActive:true};ns=dlog(ns,`${card.name} — combat damage prevented this turn.`,"effect");break;}
    case"balance":{
      // Each player matches lowest hand size and land count
      const minLands=Math.min(ns.p.bf.filter(isLand).length,ns.o.bf.filter(isLand).length);
      const minHand=Math.min(ns.p.hand.length,ns.o.hand.length);
      for(const w of["p","o"]){
        const excessLands=ns[w].bf.filter(isLand).slice(minLands);
        for(const l of excessLands)ns=zMove(ns,l.iid,w,w,"gy");
        while(ns[w].hand.length>minHand){const disc=ns[w].hand[ns[w].hand.length-1];ns={...ns,[w]:{...ns[w],hand:ns[w].hand.slice(0,-1),gy:[...ns[w].gy,disc]}};}
      }
      ns=dlog(ns,"Balance — players equalize lands and hands.","effect");break;}
    case"reanimateOwn":{
      // Return target creature from your own graveyard to battlefield
      const myCreatures=ns[caster].gy.filter(isCre);
      if(myCreatures.length){const top=myCreatures[myCreatures.length-1];ns=zMove(ns,top.iid,caster,caster,"bf");ns=dlog(ns,`${card.name} returns ${top.name}.`,"effect");}
      break;}
    case"regrowthCreature":{
      // Return target creature from graveyard to hand
      const myC=ns[caster].gy.filter(isCre);
      if(myC.length){const top=myC[myC.length-1];ns=zMove(ns,top.iid,caster,caster,"hand");ns=dlog(ns,`${card.name} returns ${top.name} to hand.`,"effect");}
      break;}
    case"gainLife1":{ns=hurt(ns,caster,-1);break;}
    case"gainLife6":{ns=hurt(ns,caster,-6);break;}
    case"controlCreature":{
      // Take control of target creature
      if(tgtC){ns=zMove(ns,tgtC.iid,tgtC.controller,caster,"bf");ns=dlog(ns,`${card.name} takes control of ${tgtC.name}.`,"effect");}break;}
    case"counterCreature":{
      // Counter target creature spell on stack
      const top=ns.stack[ns.stack.length-2];
      if(top&&isCre(top.card)){ns={...ns,stack:ns.stack.filter(i=>i.id!==top.id),[top.caster]:{...ns[top.caster],gy:[...ns[top.caster].gy,{...top.card}]}};ns=dlog(ns,`${card.name} counters ${top.card?.name}.`,"effect");}
      break;}
    case"drainPower":{
      // Tap all opponent's lands; add that mana to caster's pool
      const oppLands=ns[opp].bf.filter(c=>isLand(c)&&!c.tapped);
      ns={...ns,[opp]:{...ns[opp],bf:ns[opp].bf.map(c=>isLand(c)?{...c,tapped:true}:c)}};
      const mp={...ns[caster].mana};oppLands.forEach(l=>{const m=l.produces?.[0]||"C";mp[m]=(mp[m]||0)+1;});
      ns={...ns,[caster]:{...ns[caster],mana:mp}};ns=dlog(ns,`${card.name} drains opponent's mana.`,"effect");break;}
    case"manaShort":{
      ns={...ns,[tgt||opp]:{...ns[tgt||opp],bf:ns[tgt||opp].bf.map(c=>isLand(c)?{...c,tapped:true}:c),mana:{W:0,U:0,B:0,R:0,G:0,C:0}}};
      ns=dlog(ns,`${card.name} taps all lands and drains mana pool.`,"effect");break;}
    case"earthquake":{
      // X damage to all non-flying creatures and each player
      for(const w of["p","o"]){
        ns=hurt(ns,w,xVal,"Earthquake");
        const ground=ns[w].bf.filter(c=>isCre(c)&&!hasKw(c,"FLYING"));
        for(const c of ground)ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(x=>x.iid===c.iid?{...x,damage:x.damage+xVal}:x)}};
      }
      ns=checkDeath(ns);break;}
    case"destroyAllEnchantments":{
      for(const w of["p","o"]){for(const c of ns[w].bf.filter(isEnch))ns=zMove(ns,c.iid,w,w,"gy");}
      ns=dlog(ns,`${card.name} destroys all enchantments.`,"effect");break;}
    case"destroyIslands":{
      for(const w of["p","o"]){for(const c of ns[w].bf.filter(c=>isLand(c)&&c.subtype?.includes("Island")))ns=zMove(ns,c.iid,w,w,"gy");}
      ns=dlog(ns,`${card.name} destroys all Islands.`,"effect");break;}
    case"destroyPlains":{
      for(const w of["p","o"]){for(const c of ns[w].bf.filter(c=>isLand(c)&&c.subtype?.includes("Plains")))ns=zMove(ns,c.iid,w,w,"gy");}
      ns=dlog(ns,`${card.name} destroys all Plains.`,"effect");break;}
    case"destroyBlack":{
      if(tgtC&&tgtC.color==="B"){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}break;}
    case"destroyBlueOrCounter":{
      if(tgtC&&tgtC.color==="U"){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}
      else{const top=ns.stack[ns.stack.length-2];if(top&&top.card?.color==="U"){ns={...ns,stack:ns.stack.filter(i=>i.id!==top.id)};ns=dlog(ns,`${card.name} counters ${top.card.name}.`,"effect");}}
      break;}
    case"destroyRedOrCounter":{
      if(tgtC&&tgtC.color==="R"){ns=zMove(ns,tgtC.iid,tgtC.controller,tgtC.controller,"gy");ns=dlog(ns,`${card.name} destroys ${tgtC.name}.`,"effect");}
      else{const top=ns.stack[ns.stack.length-2];if(top&&top.card?.color==="R"){ns={...ns,stack:ns.stack.filter(i=>i.id!==top.id)};ns=dlog(ns,`${card.name} counters ${top.card.name}.`,"effect");}}
      break;}
    case"berserk":{
      if(tgtC){const pow=getPow(tgtC,ns);ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,power:(c.power||0)+pow,keywords:[...(c.keywords||[]),"TRAMPLE"],berserked:true}:c)}};ns=dlog(ns,`Berserk doubles ${tgtC.name}'s power.`,"effect");}break;}
    case"forkSpell":{
      const top=ns.stack[ns.stack.length-2];
      if(top){ns=resolveEff(ns,{...top,id:mkId(),caster});ns=dlog(ns,`Fork copies ${top.card.name}.`,"effect");}break;}
    case"drainLife":{
      if(tgtC){const dmg=Math.min(xVal,getTou(tgtC,ns)-tgtC.damage);ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,damage:c.damage+xVal}:c)}};ns=checkDeath(ns);ns=hurt(ns,caster,-xVal);}
      else if(tgt==="p"||tgt==="o"){ns=hurt(ns,tgt,xVal,"Drain Life");ns=hurt(ns,caster,-xVal);}
      break;}
    case"exileTwo":{
      // Ashes to Ashes: exile two nonartifact creatures, lose 5 life
      const cres=ns[opp].bf.filter(c=>isCre(c)&&!isArt(c));
      const targets=cres.slice(0,2);for(const c of targets){ns=zMove(ns,c.iid,opp,opp,"exile");}
      ns=hurt(ns,caster,5,"Ashes to Ashes");ns=dlog(ns,`Ashes to Ashes exiles ${targets.map(c=>c.name).join(", ")}.`,"effect");break;}
    case"tapX":{
      // Tap X target creatures
      const tgts=ns[opp].bf.filter(isCre).slice(0,xVal);
      for(const c of tgts)ns={...ns,[opp]:{...ns[opp],bf:ns[opp].bf.map(x=>x.iid===c.iid?{...x,tapped:true}:x)}};
      ns=dlog(ns,`${card.name} taps ${tgts.length} creatures.`,"effect");break;}
    case"tapTarget":{
      // Icy Manipulator — tap any permanent
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,tapped:true}:c)}};
      ns=dlog(ns,`${card.name} taps ${tgtC?.name||"target"}.`,"effect");break;}
    case"pumpSelf":{
      // Frozen Shade, Vampire Bats: +1/+0 to self
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,power:(c.power||0)+1}:c)}};
      break;}
    case"pumpToughness":{
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,toughness:(c.toughness||0)+1}:c)}};
      break;}
    case"pumpX":{
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,power:(c.power||0)+xVal}:c)}};
      break;}
    case"grantFlying":{
      if(tgtC){const kws=[...(tgtC.keywords||[])];if(!kws.includes("FLYING"))kws.push("FLYING");ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,keywords:kws}:c)}};ns=dlog(ns,`${tgtC.name} gains flying.`,"effect");}break;}
    case"regenerateTarget":{
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,regenerating:true}:c)}};break;}
    case"paralyze":{
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,paralyzed:true,tapped:true}:c)}};
      ns=dlog(ns,`${tgtC?.name} is paralyzed.`,"effect");break;}
    case"pestilence":{
      for(const w of["p","o"]){ns=hurt(ns,w,1,"Pestilence");for(const c of ns[w].bf.filter(isCre))ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(x=>x.iid===c.iid?{...x,damage:x.damage+1}:x)}};}
      ns=checkDeath(ns);break;}
    case"discardOne":{
      if(ns[opp].hand.length){const idx=Math.floor(Math.random()*ns[opp].hand.length);const dc=ns[opp].hand[idx];ns={...ns,[opp]:{...ns[opp],hand:ns[opp].hand.filter((_,i)=>i!==idx),gy:[...ns[opp].gy,dc]}};ns=dlog(ns,`${opp} discards ${dc.name}.`,"effect");}break;}
    case"mill2":{
      for(let i=0;i<2;i++){if(!ns[opp].lib.length)break;const[top,...rest]=ns[opp].lib;ns={...ns,[opp]:{...ns[opp],lib:rest,gy:[...ns[opp].gy,top]}};}
      ns=dlog(ns,`${card.name} mills 2 cards.`,"effect");break;}
    case"orcishArtillery":{
      ns=hurt(ns,tgt==="o"||tgt==="p"?tgt:opp,2,card.name);ns=hurt(ns,caster,3,card.name);break;}
    case"damage2":{
      if(tgt==="p"||tgt==="o")ns=hurt(ns,tgt,2,card.name);
      else if(tgtC){ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,damage:c.damage+2}:c)}};ns=checkDeath(ns);}break;}
    case"damage1":{
      if(tgt==="p"||tgt==="o")ns=hurt(ns,tgt,1,card.name);
      else if(tgtC){ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,damage:c.damage+1}:c)}};ns=checkDeath(ns);}break;}
    case"shuffleGraveyardIn":{
      ns={...ns,[tgt||caster]:{...ns[tgt||caster],lib:shuffle([...ns[tgt||caster].lib,...ns[tgt||caster].gy]),gy:[]}};
      ns=dlog(ns,`${card.name} shuffles graveyard into library.`,"effect");break;}
    case"channel":{
      // Pay life for colorless mana (simplified: convert up to 10 life to mana)
      const lifeToPay=Math.min(xVal,ns[caster].life-1);
      ns=hurt(ns,caster,lifeToPay,"Channel");
      const mp={...ns[caster].mana};mp.C=(mp.C||0)+lifeToPay;
      ns={...ns,[caster]:{...ns[caster],mana:mp}};
      ns=dlog(ns,`Channel: paid ${lifeToPay} life for ${lifeToPay} colorless mana.`,"mana");break;}
    case"stub":{ns=dlog(ns,`${card.name} resolves (effect pending).`,"effect");break;}
    case"syphonSoul":{
      // Deal 2 to each opponent, gain life equal to damage
      ns=hurt(ns,opp,2,"Syphon Soul");ns=hurt(ns,caster,-2);break;}
    case"manaClash":{
      // Flip coins until player wins — average 2 damage
      const damage=Math.floor(Math.random()*4)+1;
      ns=hurt(ns,caster,damage,"Mana Clash");
      ns=dlog(ns,`Mana Clash deals ${damage} damage.`,"effect");break;}
    case"sacrificeForMana":{
      // Ashnod's Altar: sacrifice a creature for CC
      const cres=ns[caster].bf.filter(isCre);
      if(cres.length){const sac=cres[0];ns=zMove(ns,sac.iid,caster,caster,"gy");const mp={...ns[caster].mana};mp.C=(mp.C||0)+2;ns={...ns,[caster]:{...ns[caster],mana:mp}};ns=dlog(ns,`${sac.name} sacrificed for CC.`,"mana");}
      break;}
    case"untapLand":{
      // Ley Druid: untap target land
      const tland=tgtC||ns[caster].bf.filter(isLand)[0];
      if(tland)ns={...ns,[tland.controller]:{...ns[tland.controller],bf:ns[tland.controller].bf.map(c=>c.iid===tland.iid?{...c,tapped:false}:c)}};break;}
    case"untapX":{
      // Candelabra: untap X lands
      const myLands=ns[caster].bf.filter(c=>isLand(c)&&c.tapped).slice(0,xVal);
      for(const l of myLands)ns={...ns,[caster]:{...ns[caster],bf:ns[caster].bf.map(c=>c.iid===l.iid?{...c,tapped:false}:c)}};break;}
    case"untapSelf":{
      // Brass Man: untap itself
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,tapped:false}:c)}};
      else if(card.iid)ns={...ns,[caster]:{...ns[caster],bf:ns[caster].bf.map(c=>c.iid===card.iid?{...c,tapped:false}:c)}};break;}
    case"untapAttacker":{
      // Maze of Ith: untap attacking creature, prevent its damage
      if(tgtC)ns={...ns,[tgtC.controller]:{...ns[tgtC.controller],bf:ns[tgtC.controller].bf.map(c=>c.iid===tgtC.iid?{...c,tapped:false,attacking:false,damage:0}:c)}};break;}
    case"scry3":{
      // Look at top 3, put back in order (simplified: just reorder library slightly)
      ns=dlog(ns,`${card.name}: reordering library…`,"effect");break;}
    case"gainLife2":{ns=hurt(ns,caster,-2);break;}
    case"bazaarActivate":{
      // Bazaar of Baghdad: draw 2, discard 3
      ns=drawD(ns,caster,2);
      for(let i=0;i<3;i++){if(!ns[caster].hand.length)break;const disc=ns[caster].hand[ns[caster].hand.length-1];ns={...ns,[caster]:{...ns[caster],hand:ns[caster].hand.slice(0,-1),gy:[...ns[caster].gy,disc]}};}
      ns=dlog(ns,"Bazaar: drew 2, discarded 3.","draw");break;}
    default:ns=dlog(ns,`${card.name} resolves.`,"effect");
  }
  return ns;
}

function resolveCombat(s){
  let ns=s;if(!ns.attackers.length)return ns;
  // Fog effect: prevent all combat damage
  if(ns.fogActive){
    ns=dlog(ns,"🌫 Fog prevents all combat damage!","effect");
    ns={...ns,attackers:[],blockers:{},fogActive:false};
    for(const w of["p","o"])ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(c=>({...c,attacking:false,blocking:null}))}};
    return ns;
  }
  ns=dlog(ns,"⚔ Combat damage resolving…","combat");
  for(const attId of ns.attackers){
    const att=getBF(ns,attId);if(!att)continue;
    const ap=getPow(att,ns),actrl=att.controller,defW=actrl==="p"?"o":"p";
    const blockers=ns[defW].bf.filter(c=>c.blocking===attId);
    const hasLifelink=hasKw(att,"LIFELINK")||(ns.castleMod?.name==="Death's Embrace"&&actrl==="o");
    if(!blockers.length){ns=hurt(ns,defW,ap,att.name);if(hasLifelink)ns=hurt(ns,actrl,-ap);}
    else{
      let rem=ap;
      for(const bl of blockers){
        const bp=getPow(bl,ns),bt=getTou(bl,ns),dbl=Math.min(rem,bt-bl.damage);
        ns={...ns,[actrl]:{...ns[actrl],bf:ns[actrl].bf.map(c=>c.iid===attId?{...c,damage:c.damage+bp}:c)}};
        ns={...ns,[defW]:{...ns[defW],bf:ns[defW].bf.map(c=>c.iid===bl.iid?{...c,damage:c.damage+dbl}:c)}};
        rem=Math.max(0,rem-dbl);if(hasLifelink)ns=hurt(ns,actrl,-dbl);
        if(hasKw(att,"DEATHTOUCH")&&ns.ruleset.deathtouch)ns={...ns,[defW]:{...ns[defW],bf:ns[defW].bf.map(c=>c.iid===bl.iid?{...c,damage:Math.max(c.toughness,c.damage+1)}:c)}};
      }
      if(hasKw(att,"TRAMPLE")&&rem>0)ns=hurt(ns,defW,rem,`${att.name} (trample)`);
    }
  }
  ns=checkDeath(ns);
  ns={...ns,attackers:[],blockers:{}};
  for(const w of["p","o"])ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(c=>({...c,attacking:false,blocking:null}))}};
  return ns;
}

const PHASE_SEQ=["UNTAP","UPKEEP","DRAW","MAIN1","DECLARE_ATTACKERS","DECLARE_BLOCKERS","COMBAT_DAMAGE","MAIN2","END","CLEANUP"];
const PHASE_LBL={UNTAP:"Untap",UPKEEP:"Upkeep",DRAW:"Draw",MAIN1:"Main 1",DECLARE_ATTACKERS:"Attackers",DECLARE_BLOCKERS:"Blockers",COMBAT_DAMAGE:"Combat",MAIN2:"Main 2",END:"End",CLEANUP:"Cleanup"};
const COMBAT_PHASES=["DECLARE_ATTACKERS","DECLARE_BLOCKERS","COMBAT_DAMAGE"];

function advPhase(s){
  const idx=PHASE_SEQ.indexOf(s.phase);
  const next=PHASE_SEQ[(idx+1)%PHASE_SEQ.length];
  const turnChange=next==="UNTAP";
  let ns={...s,phase:next};

  // ── Classic rule: mana empties (with burn) at every phase boundary ──────────
  // Mana does not carry between phases. This fires BEFORE the new phase's logic
  // so it clears what was in the pool during the phase we just left.
  for(const w of["p","o"])ns=burnMana(ns,w,ns.ruleset);

  if(next==="COMBAT_DAMAGE"){ns=resolveCombat(ns);return ns;}
  if(turnChange){
    const whoHasExtra=["p","o"].find(w=>ns[w].extraTurns>0);
    if(whoHasExtra){ns={...ns,[whoHasExtra]:{...ns[whoHasExtra],extraTurns:ns[whoHasExtra].extraTurns-1}};ns=dlog(ns,`${whoHasExtra} takes an extra turn!`,"info");}
    else{const nx=ns.active==="p"?"o":"p";ns={...ns,active:nx};ns=dlog(ns,`── Turn ${ns.turn+1} · ${nx} ──`,"phase");}
    ns={...ns,turn:ns.turn+(turnChange?1:0),landsPlayed:0,attackers:[],blockers:{},spellsThisTurn:0};
    ns={...ns,[ns.active]:{...ns[ns.active],bf:ns[ns.active].bf.map(c=>({...c,tapped:false,summoningSick:false,damage:0}))}};
  }
  if(next==="UPKEEP"){
    const activeW=ns.active;
    for(const w of["p","o"]){
      for(const c of [...ns[w].bf]){ // iterate snapshot so zMove doesn't break loop
        const ctrl=c.controller;
        switch(c.upkeep){
          case"selfDamage1":
            if(ctrl===w)ns=hurt(ns,w,1,c.name);
            break;
          case"forestChoice":
            // Force of Nature: pay GGGG or take 8 damage
            // Simplified: AI always pays if able, else takes damage
            if(ctrl===w){
              const pool={...ns[w].mana};
              if((pool.G||0)>=4){pool.G-=4;ns={...ns,[w]:{...ns[w],mana:pool}};ns=dlog(ns,`${c.name}: paid GGGG upkeep.`,"mana");}
              else{ns=hurt(ns,w,8,`${c.name} upkeep`);}
            }
            break;
          case"lordsUpkeep":
            // Lord of the Pit: sacrifice a creature or take 7 damage
            if(ctrl===w){
              const others=ns[w].bf.filter(x=>isCre(x)&&x.iid!==c.iid);
              if(others.length){const sac=others[0];ns=zMove(ns,sac.iid,w,w,"gy");ns=dlog(ns,`Lord of the Pit devours ${sac.name}.`,"death");}
              else ns=hurt(ns,w,7,"Lord of the Pit");
            }
            break;
          case"sacrificeSelf":
            // Ball Lightning: sacrifice at end of turn
            if(ctrl===w&&next==="CLEANUP")ns=zMove(ns,c.iid,w,w,"gy");
            break;
          case"sacrificeUnless_U":
            // Phantasmal Forces: pay U or sacrifice
            if(ctrl===w){
              const mp={...ns[w].mana};
              if((mp.U||0)>=1){mp.U--;ns={...ns,[w]:{...ns[w],mana:mp}};}
              else{ns=zMove(ns,c.iid,w,w,"gy");ns=dlog(ns,`${c.name} is sacrificed (can't pay U).`,"death");}
            }
            break;
          case"blackVise":
            // Deal damage to OPPONENT equal to hand cards over 4
            if(ctrl===w){
              const opp2=w==="p"?"o":"p";
              const over=Math.max(0,ns[opp2].hand.length-4);
              if(over>0)ns=hurt(ns,opp2,over,"Black Vise");
            }
            break;
          case"howlingMine":
            // Both players draw an extra card
            for(const dw of["p","o"])ns=drawD(ns,dw,1);
            ns=dlog(ns,"Howling Mine: each player draws a card.","draw");
            break;
          case"ivoryTower":
            // Gain life equal to hand size minus 4 (minimum 0)
            if(ctrl===w){const gain=Math.max(0,ns[w].hand.length-4);if(gain>0)ns=hurt(ns,w,-gain,"Ivory Tower");}
            break;
          case"sylvanLibrary":
            // Draw 2 extra; pay 4 life each or put back
            if(ctrl===w){
              ns=drawD(ns,w,2);
              // AI/simplified: put both back (avoid life loss)
              if(w==="o"&&ns[w].hand.length>=2){
                const put=ns[w].hand.slice(-2);
                ns={...ns,[w]:{...ns[w],hand:ns[w].hand.slice(0,-2),lib:[...put,...ns[w].lib]}};
              }
              // Player: pay 8 life to keep both (simplified)
              if(w==="p")ns=dlog(ns,"Sylvan Library: drew 2 extra cards.","draw");
            }
            break;
          default:break;
        }
      }
      // Global upkeep effects on artifacts/enchantments
      for(const c of ns[w].bf){
        if(c.upkeep==="cityOfBrassDamage"&&isLand(c)){}// handled at tap time
      }
    }
    // Fog expires after upkeep (it was set when cast, clears here)
    if(ns.fogActive)ns={...ns,fogActive:false};
  }
  if(next==="DRAW"){if(!(ns.turn===1&&!ns.ruleset.drawOnFirstTurn&&ns.active==="p"))ns=drawD(ns,ns.active);}
  if(next==="CLEANUP"){
    const ac=ns.active;
    while(ns[ac].hand.length>ns.ruleset.maxHandSize){const disc=ns[ac].hand[ns[ac].hand.length-1];ns={...ns,[ac]:{...ns[ac],hand:ns[ac].hand.slice(0,-1),gy:[...ns[ac].gy,disc]}};}
    // Castle modifiers — end-of-turn triggers
    if(ns.castleMod?.name==="Inferno"){
      ns=hurt(ns,"p",1,"Inferno");ns=hurt(ns,"o",1,"Inferno");
    }
  }
  return ns;
}

// Helper: apply castle modifier to land tapping (for Overgrowth)
function applyOvergrowthTap(s,who,iid,mana){
  const c=s[who].bf.find(x=>x.iid===iid);if(!c||c.tapped||!isLand(c))return s;
  const m=mana||c.produces?.[0]||"C";
  const amount=(s.castleMod?.name==="Overgrowth")?2:1;
  let ns={...s,[who]:{...s[who],bf:s[who].bf.map(x=>x.iid===iid?{...x,tapped:true}:x),mana:{...s[who].mana,[m]:(s[who].mana[m]||0)+amount}}};
  return dlog(ns,`${who} taps ${c.name} → +${amount}${m}${amount>1?" (Overgrowth)":""}${who==="o"?" (opp)":""}.`,"mana");
}

// Compute how much mana the AI needs to cast its best card
function aiNeededMana(state){
  const arch=state.oppArch||ARCHETYPES.RED_BURN;const strat=arch.strategy;
  const castable=state.o.hand.filter(c=>!isLand(c));
  if(!castable.length)return 0;
  const sorted=[...castable].sort((a,b)=>strat==="aggro"?b.cmc-a.cmc:a.cmc-b.cmc);
  return sorted[0]?.cmc||0;
}

function aiDecide(state){
  const acts=[];const arch=state.oppArch||ARCHETYPES.RED_BURN;const strat=arch.strategy;
  const inMain=(state.phase==="MAIN1"||state.phase==="MAIN2")&&state.active==="o";

  if(inMain){
    // First: play land if available (before tapping — we need the land's mana too)
    const landInHand=state.o.hand.find(isLand);
    if(state.landsPlayed<1&&landInHand)acts.push({type:"PLAY_LAND",who:"o",iid:landInHand.iid});

    // Find best spell the AI can actually afford given current lands
    // Simulate available mana: current pool + untapped lands (+ new land if played)
    const availableLandCount=state.o.bf.filter(c=>isLand(c)&&!c.tapped).length+(state.landsPlayed<1&&landInHand?1:0);
    const nonLands=state.o.hand.filter(c=>!isLand(c));
    const sorted=[...nonLands].sort((a,b)=>strat==="aggro"?b.cmc-a.cmc:a.cmc-b.cmc);
    // Only pick a spell we can plausibly afford (CMC <= available mana sources)
    const currentManaTotal=Object.values(state.o.mana).reduce((a,b)=>a+b,0);
    const maxAffordable=currentManaTotal+availableLandCount;
    const bestSpell=sorted.find(c=>c.cmc<=maxAffordable)||null;

    // Only tap mana if we have something to cast
    if(bestSpell){
      // Simulate tapping — track virtual mana pool to avoid over-tapping
      const vPool={...state.o.mana}; // start with current pool (usually 0)
      const req=parseMana(bestSpell.cost);

      // Helper: check if virtual pool can pay the cost
      const vCanPay=()=>{
        const a={...vPool};
        for(const c of["W","U","B","R","G","C"]){if(a[c]<(req[c]||0))return false;a[c]-=req[c]||0;}
        return Object.values(a).reduce((s,v)=>s+v,0)>=(req.generic||0);
      };

      // Tap artifact mana sources first (always free to tap, count toward pool)
      for(const c of state.o.bf.filter(c=>isArt(c)&&!c.tapped&&c.activated?.effect?.startsWith("addMana"))){
        if(vCanPay())break; // already have enough
        acts.push({type:"TAP_ART_MANA",who:"o",iid:c.iid});
        const ms=c.activated.mana||"C";for(const ch of ms)if("WUBRGC".includes(ch))vPool[ch]=(vPool[ch]||0)+1;
      }

      if(!vCanPay()){
        // Tap colored lands matching spell color requirements first
        const neededColors=["W","U","B","R","G"].filter(cl=>(req[cl]||0)>0);
        for(const cl of neededColors){
          for(const l of state.o.bf.filter(c=>isLand(c)&&!c.tapped&&c.produces?.includes(cl))){
            if((vPool[cl]||0)>=(req[cl]||0))break; // have enough of this color
            acts.push({type:"TAP_LAND",who:"o",iid:l.iid,mana:cl});
            vPool[cl]=(vPool[cl]||0)+1;
          }
        }
        // Then tap any land for generic mana — ONLY until we can afford the spell
        for(const l of state.o.bf.filter(c=>isLand(c)&&!c.tapped)){
          if(vCanPay())break; // STOP — we have enough, don't over-tap
          const m=l.produces?.[0]||"C";
          acts.push({type:"TAP_LAND",who:"o",iid:l.iid,mana:m});
          vPool[m]=(vPool[m]||0)+1;
        }
      }
    }

    // Cast the best spell
    if(bestSpell){
      let tgt=null;
      if(["damage3","damage5","damageX","psionicBlast"].includes(bestSpell.effect))tgt="p";
      else if(["destroy","exileCreature","bounce"].includes(bestSpell.effect)){
        const threats=state.p.bf.filter(isCre);
        if(threats.length)tgt=threats.reduce((a,b)=>getPow(a,state)>getPow(b,state)?a:b).iid;
        else if(bestSpell.effect==="destroy"||bestSpell.effect==="bounce")tgt=null; // no target, skip
      }
      else if(["draw3","tutor","drawX"].includes(bestSpell.effect))tgt="o";
      else if(bestSpell.effect==="gainLifeX"||bestSpell.effect==="gainLife3")tgt="o";
      // Only cast if we have a valid target (or don't need one)
      const needsCreatureTarget=["destroy","exileCreature","bounce"].includes(bestSpell.effect);
      if(!needsCreatureTarget||tgt)
        acts.push({type:"CAST_SPELL",who:"o",iid:bestSpell.iid,tgt,xVal:3});
    }
  }

  // Declare attackers — ALL eligible creatures always attack
  // Simple aggressive AI: if you can attack, you attack
  if(state.phase==="DECLARE_ATTACKERS"&&state.active==="o"){
    const attackers=state.o.bf.filter(c=>isCre(c)&&!c.tapped&&!c.summoningSick);
    for(const att of attackers){
      acts.push({type:"DECLARE_ATTACKER",iid:att.iid});
    }
  }

  // Declare blockers for AI
  if(state.phase==="DECLARE_BLOCKERS"&&state.active==="p"){
    const canBlock=state.o.bf.filter(c=>isCre(c)&&!c.tapped&&!c.attacking);
    const alreadyBlocking=new Set();
    for(const attId of state.attackers){
      const att=getBF(state,attId);if(!att)continue;
      const ap=getPow(att,state),at=getTou(att,state);
      const valid=canBlock.filter(b=>!alreadyBlocking.has(b.iid)&&canBlockDuel(b,att));
      // Prefer: trade, then survive, then forced (prevent death)
      const trade=valid.find(b=>getPow(b,state)>=at&&getTou(b,state)>0);
      const survive=valid.find(b=>getTou(b,state)>ap);
      const forced=state.o.life<=ap?valid[0]:null;
      const chosen=trade||survive||forced;
      if(chosen){
        alreadyBlocking.add(chosen.iid);
        acts.push({type:"DECLARE_BLOCKER",blId:chosen.iid,attId});
      }
    }
  }
  return acts;
}

function buildDuelState(pDeckIds,oppArchKey,ruleset,overworldHP,castleMod,anteEnabled){
  const pd=shuffle(pDeckIds.map(id=>mkInst(id,"p")).filter(Boolean));
  const od=shuffle((ARCHETYPES[oppArchKey]?.deck||ARCHETYPES.RED_BURN.deck).map(id=>mkInst(id,"o")).filter(Boolean));
  const ph=pd.splice(0,ruleset.startingHandSize);
  const oh=od.splice(0,ruleset.startingHandSize);
  const startLife=overworldHP??ruleset.startingLife;
  const anteP=anteEnabled&&pd.length?pd[0]:null;
  const anteO=anteEnabled&&od.length?od[0]:null;
  return{
    ruleset,phase:"MAIN1",active:"p",turn:1,landsPlayed:0,
    p:{life:startLife,lib:pd,hand:ph,bf:[],gy:[],exile:[],mana:{W:0,U:0,B:0,R:0,G:0,C:0},extraTurns:0,mulls:0},
    o:{life:ruleset.startingLife,lib:od,hand:oh,bf:[],gy:[],exile:[],mana:{W:0,U:0,B:0,R:0,G:0,C:0},extraTurns:0,mulls:0},
    stack:[],attackers:[],blockers:{},
    selCard:null,selTgt:null,xVal:1,
    log:[{text:"The duel begins.",type:"info",turn:1}],
    over:null,
    oppArch:ARCHETYPES[oppArchKey],
    castleMod:castleMod||null,
    anteP,anteO,anteEnabled,
  };
}

function duelReducer(state,action){
  if(state.over&&action.type!=="RESET")return state;
  let s=state;
  switch(action.type){
    case"TAP_LAND":return applyOvergrowthTap(s,action.who,action.iid,action.mana);
    case"TAP_ART_MANA":{const w=action.who,c=s[w].bf.find(x=>x.iid===action.iid);if(!c||c.tapped||!c.activated?.effect?.startsWith("addMana"))return s;const ms=c.activated.mana||"";s={...s,[w]:{...s[w],bf:s[w].bf.map(x=>x.iid===action.iid?{...x,tapped:true}:x)}};const mp={...s[w].mana};for(const ch of ms)if("WUBRGC".includes(ch))mp[ch]=(mp[ch]||0)+1;return dlog({...s,[w]:{...s[w],mana:mp}},`${w} taps ${c.name} for mana.`,"mana");}
    case"PLAY_LAND":{const w=action.who,c=s[w].hand.find(x=>x.iid===action.iid);if(!c||!isLand(c)||s.active!==w||(s.phase!=="MAIN1"&&s.phase!=="MAIN2")||s.landsPlayed>=1)return s;const lArr={...c,controller:w,tapped:false,summoningSick:false,attacking:false,blocking:null,damage:0,counters:{}};s={...s,[w]:{...s[w],hand:s[w].hand.filter(x=>x.iid!==action.iid),bf:[...s[w].bf,lArr]},landsPlayed:s.landsPlayed+1};return dlog(s,`${w} plays ${c.name}.`,"play");}
    case"CAST_SPELL":{
      const w=action.who,c=s[w].hand.find(x=>x.iid===action.iid);if(!c)return s;
      if(s.active!==w&&!isInst(c))return s;
      if((s.phase!=="MAIN1"&&s.phase!=="MAIN2")&&!isInst(c))return s;
      if(!canPay(s[w].mana,c.cost))return s;
      // Tidal Lock: player can only cast 1 spell per turn
      if(w==="p"&&s.castleMod?.name==="Tidal Lock"&&(s.spellsThisTurn||0)>=1)return dlog(s,"Tidal Lock prevents casting more than one spell per turn.","effect");
      s={...s,[w]:{...s[w],mana:payMana(s[w].mana,c.cost),hand:s[w].hand.filter(x=>x.iid!==action.iid)}};
      const item={id:mkId(),card:c,caster:w,targets:action.tgt?[action.tgt]:[],xVal:action.xVal||s.xVal||1};
      // Track spells cast this turn for Tidal Lock
      if(w==="p")s={...s,spellsThisTurn:(s.spellsThisTurn||0)+1};
      if(isPerm(c)&&!isLand(c)){const pArr={...c,controller:w,tapped:false,summoningSick:!hasKw(c,"HASTE"),attacking:false,blocking:null,damage:0,counters:{}};s={...s,[w]:{...s[w],bf:[...s[w].bf,pArr]}};return dlog(s,`${w} casts ${c.name}.`,"play");}
      if(s.ruleset.stackType==="batch"||isSort(c)){s=resolveEff(s,item);if(!isLand(c)&&!isPerm(c))s={...s,[w]:{...s[w],gy:[...s[w].gy,{...c}]}};return dlog(s,`${w} casts ${c.name}.`,"play");}
      return dlog({...s,stack:[...s.stack,item]},`${w} casts ${c.name} (stack).`,"play");
    }
    case"RESOLVE_STACK":{if(!s.stack.length)return s;const top=s.stack[s.stack.length-1];s={...s,stack:s.stack.slice(0,-1)};s=resolveEff(s,top);if(!isPerm(top.card))s={...s,[top.caster]:{...s[top.caster],gy:[...s[top.caster].gy,{...top.card}]}};return s;}
    case"DECLARE_ATTACKER":{if(s.phase!=="DECLARE_ATTACKERS"||s.active!=="p")return s;const c=s.p.bf.find(x=>x.iid===action.iid);if(!c||!isCre(c)||c.tapped||c.summoningSick)return s;const att=s.attackers.includes(action.iid);const atts=att?s.attackers.filter(id=>id!==action.iid):[...s.attackers,action.iid];return{...s,attackers:atts,p:{...s.p,bf:s.p.bf.map(x=>x.iid===action.iid?{...x,attacking:!att,tapped:!att&&!hasKw(x,"VIGILANCE")}:x)}};}
    case"DECLARE_BLOCKER":{const bl=s.o.bf.find(x=>x.iid===action.blId);const att=getBF(s,action.attId);if(!bl||!att||!s.attackers.includes(action.attId)||!canBlockDuel(bl,att))return s;const already=s.blockers[action.blId]===action.attId;const nb={...s.blockers};if(already)delete nb[action.blId];else nb[action.blId]=action.attId;return{...s,blockers:nb,o:{...s.o,bf:s.o.bf.map(x=>x.iid===action.blId?{...x,blocking:already?null:action.attId}:x)}};}
    case"ADVANCE_PHASE":return advPhase(s);
    case"SEL_CARD":return{...s,selCard:action.iid};
    case"SEL_TGT":return{...s,selTgt:action.iid};
    case"SET_X":return{...s,xVal:action.val};
    case"AI_ACTS":{let ns=s;for(const a of action.acts)ns=duelReducer(ns,a);return ns;}
    case"MULLIGAN":{const w=action.who||"p";if(w==="p"&&(s.turn>1||s.p.bf.length>0||s.landsPlayed>0))return s;const mulls=(s[w].mulls||0)+1;const lib=shuffle([...s[w].lib,...s[w].hand]);let ns={...s,[w]:{...s[w],lib,hand:[],mulls}};ns=drawD(ns,w,s.ruleset.startingHandSize);if(s.ruleset.londonMulligan)for(let i=0;i<mulls&&ns[w].hand.length>0;i++){const sorted=[...ns[w].hand].sort((a,b)=>b.cmc-a.cmc);const put=sorted[0];ns={...ns,[w]:{...ns[w],hand:ns[w].hand.filter(x=>x.iid!==put.iid),lib:[put,...ns[w].lib]}};}return dlog(ns,`${w} mulligans (${ns[w].hand.length} cards).`,"info");}
    case"ACTIVATE_ABILITY":{
      const{iid,tgt,chosenColor}=action;
      const card=s.p.bf.find(c=>c.iid===iid);
      if(!card||!card.activated)return s;
      const act=card.activated;
      if(act.cost.includes("T")){if(card.tapped)return dlog(s,`${card.name} is already tapped.`,"info");s={...s,p:{...s.p,bf:s.p.bf.map(c=>c.iid===iid?{...c,tapped:true}:c)}};}
      const item={id:mkId(),card:{...card,effect:act.effect,mana:act.mana},caster:"p",targets:tgt?[tgt]:[],xVal:1,chosenColor};
      s=resolveEff(s,item);
      return dlog(s,`${card.name} ability: ${act.effect}.`,"effect");
    }
    case"CHOOSE_LOTUS_COLOR":{
      const mp={...s.p.mana};mp[action.color]=(mp[action.color]||0)+3;
      return dlog({...s,p:{...s.p,mana:mp},pendingLotus:null},`Black Lotus adds 3${action.color}.`,"mana");
    }
    case"SET_PENDING_LOTUS":return{...s,pendingLotus:true};
    default:return s;
  }
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI  — mana symbols, card components, log
// ═══════════════════════════════════════════════════════════════
function Pip({sym,size=13}){
  const bg={W:"#f9f0d0",U:"#5588cc",B:"#8844bb",R:"#cc4422",G:"#449933","":"#666",C:"#999"};
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:bg[sym]||"#666",color:sym==="W"?"#665500":"#fff",fontSize:size*.58,fontWeight:700,border:"1px solid rgba(0,0,0,.4)",flexShrink:0,lineHeight:1,fontFamily:"'Fira Code',monospace"}}>{sym||"?"}</span>;
}
function Cost({cost,size=12}){
  if(!cost)return null;const parts=[];let i=0;
  while(i<cost.length){const ch=cost[i];if("WUBRG".includes(ch)){parts.push(<Pip key={i} sym={ch} size={size}/>);i++;}else if(ch==="X"){parts.push(<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#777",color:"#fff",fontSize:size*.6,fontWeight:700,border:"1px solid rgba(0,0,0,.4)"}}>X</span>);i++;}else if(!isNaN(parseInt(ch))){let n="";while(i<cost.length&&!isNaN(parseInt(cost[i]))){n+=cost[i];i++;}parts.push(<span key={i+n} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#555",color:"#ddd",fontSize:size*.6,fontWeight:700,border:"1px solid rgba(0,0,0,.4)"}}>{n}</span>);}else if(ch==="0"){parts.push(<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#555",color:"#ddd",fontSize:size*.6,fontWeight:700}}>0</span>);i++;}else i++;}
  return <span style={{display:"inline-flex",gap:2}}>{parts}</span>;
}
function PoolDisplay({pool,size=14}){
  const tot=Object.values(pool).reduce((a,b)=>a+b,0);
  if(!tot)return <span style={{fontSize:10,color:"#4a4030",fontFamily:"'Cinzel',serif"}}>—</span>;
  return <span style={{display:"inline-flex",gap:2,flexWrap:"wrap"}}>{["W","U","B","R","G","C"].map(c=>pool[c]>0&&Array.from({length:pool[c]}).map((_,i)=><Pip key={`${c}${i}`} sym={c} size={size}/>))}</span>;
}

// Card type themes — noticeably lighter backgrounds so cards are visible on dark playmat
const TYPE_THEME={Creature:{bg:"#243a1a",bd:"#5a8840",ac:"#88dd55"},Land:{bg:"#302a14",bd:"#907830",ac:"#ddb840"},Instant:{bg:"#102238",bd:"#3070b8",ac:"#66aaf0"},Sorcery:{bg:"#281030",bd:"#7030a8",ac:"#c060f0"},Artifact:{bg:"#282828",bd:"#788888",ac:"#c8d8d8"},Enchantment:{bg:"#1a1e34",bd:"#4858b0",ac:"#8898f0"}};
// Per-color card frame overrides (used when card has a color)
const CFRAME={W:{bg:"#342e18",bd:"#d4b040"},U:{bg:"#0e2036",bd:"#3888d0"},B:{bg:"#221030",bd:"#9960cc"},R:{bg:"#2e1008",bd:"#cc4422"},G:{bg:"#102418",bd:"#40a030"}};
const CCOLOR={W:"#f5e060",U:"#66bbff",B:"#cc88ff",R:"#ff8844",G:"#66ee44","":"#bbb"};
function thmOf(c){
  if(!c)return TYPE_THEME.Artifact;
  // Use color-keyed frame if card has a color
  if(c.color&&CFRAME[c.color]){const fr=CFRAME[c.color];if(isCre(c))return{bg:fr.bg,bd:fr.bd,ac:CCOLOR[c.color]};if(isLand(c))return{bg:fr.bg,bd:fr.bd,ac:CCOLOR[c.color]};}
  if(isCre(c))return TYPE_THEME.Creature;if(isLand(c))return TYPE_THEME.Land;if(isInst(c))return TYPE_THEME.Instant;if(isSort(c))return TYPE_THEME.Sorcery;if(isArt(c))return TYPE_THEME.Artifact;return TYPE_THEME.Enchantment;
}
const CARD_ICON=c=>isLand(c)?"🏔":isCre(c)?"⚔":isInst(c)?"✦":isSort(c)?"✸":isArt(c)?"⚙":"◆";

// ─── LandPip ────────────────────────────────────────────────────
// Compact land token for the horizontal land row — shows mana color,
// tapped state, name on hover. Much smaller vertical footprint than FieldCard.
function LandPip({card,tapped,selected,onClick,onMouseMove,onMouseLeave,isPlayer=false}){
  const manaColor=card.produces?.[0]||"C";
  const bg={W:"#c8a830",U:"#2860b0",B:"#6030a0",R:"#b02810",G:"#208030",C:"#606060"};
  const fg={W:"#fff8e0",U:"#c0d8ff",B:"#d8b8ff",R:"#ffe0c0",G:"#c0f0c0",C:"#e0e0e0"};
  const baseColor=bg[manaColor]||"#555";
  const textColor=fg[manaColor]||"#ddd";
  const sym={W:"☀",U:"💧",B:"💀",R:"🔥",G:"🌿",C:"◆"}[manaColor]||"◆";
  return(
    <div
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      title={`${card.name}${tapped?" (tapped)":""}`}
      style={{
        width:30,height:30,flexShrink:0,
        borderRadius:5,
        background:tapped?`${baseColor}55`:`${baseColor}cc`,
        border:`2px solid ${selected?(isPlayer?"#60ff60":"#ff6060"):tapped?"rgba(255,255,255,.15)":"rgba(255,255,255,.35)"}`,
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",
        transform:tapped?"rotate(90deg)":"none",
        transition:"transform .25s ease,border-color .15s",
        boxShadow:selected?`0 0 8px ${isPlayer?"#60ff60":"#ff6060"}`:tapped?"none":`0 0 6px ${baseColor}80`,
        fontSize:14,
        opacity:tapped?0.55:1,
      }}>
      <span style={{fontSize:13,lineHeight:1,userSelect:"none"}}>{sym}</span>
    </div>
  );
}

function FieldCard({card,state,selected,attacking,onClick,onActivate,sm=false}){
  const{bg,bd,ac}=thmOf(card);const ca=CCOLOR[card.color]||"#aaa";const w=sm?76:92,h=sm?100:124;
  const p=isCre(card)?getPow(card,state):null,t=isCre(card)?getTou(card,state):null;
  const hasActivated=card.activated&&!card.tapped&&card.controller==="p";
  const rarityColor=card.rarity==="R"?"#f0c040":card.rarity==="U"?"#90b8d0":"#888";
  return(
    <div onClick={onClick} title={`${card.name}\n${card.text||""}`} style={{
      width:w,height:h,background:bg,
      border:`2px solid ${selected?"#ffe060":attacking?"#ff5010":bd}`,
      borderRadius:7,cursor:"pointer",position:"relative",
      transform:card.tapped?"rotate(90deg)":"none",
      transition:"transform .3s,border-color .2s,box-shadow .2s",
      boxShadow:selected?`0 0 16px #ffe060,0 0 6px #ffe06080`:attacking?`0 0 14px rgba(255,80,16,.7),animation:combatGlow 1s infinite`:`0 3px 10px rgba(0,0,0,.6)`,
      flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",
    }}>
      {/* Rarity gem — top left */}
      <div style={{position:"absolute",top:3,left:3,width:7,height:7,borderRadius:"50%",background:rarityColor,boxShadow:`0 0 4px ${rarityColor}`,zIndex:5}}/>
      {/* Top color bar */}
      <div style={{height:4,background:`linear-gradient(90deg,${ca},${ca}88)`,flexShrink:0}}/>
      {/* Name + cost row */}
      <div style={{padding:"4px 5px 2px 10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0,borderBottom:`1px solid ${bd}40`}}>
        <span style={{fontSize:sm?7.5:8.5,fontFamily:"'Cinzel',serif",color:"#f0e8c0",fontWeight:700,lineHeight:1.2,flex:1,overflow:"hidden",textShadow:"0 1px 2px rgba(0,0,0,.8)"}}>{card.name}</span>
        <Cost cost={card.cost} size={sm?10:11}/>
      </div>
      {/* Art area */}
      <div style={{flex:1,margin:"3px 5px",background:`linear-gradient(135deg,${bg}dd,rgba(0,0,0,.55))`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",border:`1px solid ${bd}60`}}>
        <span style={{fontSize:sm?22:28,opacity:.65}}>{CARD_ICON(card)}</span>
        {card.damage>0&&<div style={{position:"absolute",top:2,right:2,background:"#cc0a0a",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:3,boxShadow:"0 0 8px #cc0a0a",animation:"damageFlash .3s ease-out"}}>💢{card.damage}</div>}
        {card.summoningSick&&isCre(card)&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}}><span style={{fontSize:8,color:"rgba(255,220,150,.65)",fontFamily:"'Cinzel',serif",letterSpacing:1}}>SICK</span></div>}
        {/* Activated ability button */}
        {hasActivated&&onActivate&&<button onClick={e=>{e.stopPropagation();onActivate(card);}} style={{position:"absolute",bottom:2,left:2,background:"rgba(200,160,40,.85)",border:"none",borderRadius:3,color:"#000",fontSize:7,fontWeight:700,padding:"1px 4px",cursor:"pointer",fontFamily:"'Cinzel',serif"}}>ACT</button>}
      </div>
      {/* Keywords */}
      {card.keywords?.length>0&&<div style={{padding:"2px 5px",display:"flex",flexWrap:"wrap",gap:1}}>{card.keywords.slice(0,2).map(k=><span key={k} style={{fontSize:6.5,background:ac+"25",color:ac,padding:"0 3px",borderRadius:2,fontFamily:"'Cinzel',serif"}}>{k.replace(/_/g," ")}</span>)}</div>}
      {/* P/T badge */}
      {isCre(card)&&<div style={{position:"absolute",bottom:4,right:5,fontSize:sm?10:13,fontWeight:700,color:card.damage>0?"#ff6050":ca,fontFamily:"'Fira Code',monospace",textShadow:"0 1px 4px rgba(0,0,0,.9)",background:"rgba(0,0,0,.55)",padding:"0 4px",borderRadius:3,border:`1px solid ${ca}40`}}>{p}/{t}</div>}
    </div>
  );
}

function HandCard({card,state,selected,playable,onClick}){
  const{bg,bd,ac}=thmOf(card);const ca=CCOLOR[card.color]||"#aaa";
  return(
    <div onClick={onClick} title={`${card.name}\n${card.text||""}`} style={{
      width:82,height:116,background:bg,
      border:`2px solid ${selected?"#ffe060":playable?"#60dd60":bd}`,
      borderRadius:8,cursor:"pointer",flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",
      boxShadow:selected?"0 0 16px #ffe060,0 -8px 24px rgba(255,224,96,.2)":playable?"0 0 10px #60dd6060,0 -4px 14px rgba(0,0,0,.7)":"0 -4px 14px rgba(0,0,0,.7)",
      transform:selected?"translateY(-18px) scale(1.06)":playable?"translateY(-8px)":"none",
      transition:"transform .2s,box-shadow .2s",animation:"cardIn .3s ease-out",position:"relative",
    }}>
      <div style={{height:4,background:ca,flexShrink:0}}/>
      <div style={{padding:"4px 6px 2px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0,borderBottom:`1px solid ${bd}40`}}>
        <span style={{fontSize:8,fontFamily:"'Cinzel',serif",color:"#f0e8c0",fontWeight:700,lineHeight:1.2,flex:1,textShadow:"0 1px 2px rgba(0,0,0,.8)"}}>{card.name}</span>
        <Cost cost={card.cost} size={11}/>
      </div>
      <div style={{flex:1,margin:"3px 5px",background:`linear-gradient(135deg,${bg}dd,rgba(0,0,0,.5))`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${bd}50`}}>
        <span style={{fontSize:24,opacity:.65}}>{CARD_ICON(card)}</span>
      </div>
      <div style={{padding:"2px 5px",fontSize:7,color:"#b0a070",fontFamily:"'Crimson Text',serif",flexShrink:0}}>{card.subtype||card.type}</div>
      {card.text&&<div style={{padding:"0 5px 2px",fontSize:7,color:"#c0b080",lineHeight:1.3,overflow:"hidden",maxHeight:26}}>{card.text.slice(0,55)}{card.text.length>55?"…":""}</div>}
      {isCre(card)&&<div style={{textAlign:"right",padding:"0 5px 4px",fontSize:11,fontWeight:700,color:ca,fontFamily:"'Fira Code',monospace",textShadow:"0 1px 3px rgba(0,0,0,.9)"}}>{getPow(card,state)}/{getTou(card,state)}</div>}
      {playable&&!selected&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(96,221,96,.6)",borderRadius:"0 0 6px 6px"}}/>}
    </div>
  );
}

function PhaseBar({phase}){
  return <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center"}}>{PHASE_SEQ.map(p=>{const on=p===phase;const cmbt=COMBAT_PHASES.includes(p);return <div key={p} style={{padding:"3px 6px",background:on?(cmbt?"rgba(220,80,20,.5)":"rgba(200,160,20,.35)"):"rgba(255,255,255,.05)",border:`1px solid ${on?(cmbt?"#ee6020":"#ddb830"):"rgba(255,255,255,.12)"}`,borderRadius:4,color:on?(cmbt?"#ffcc80":"#ffe060"):"#806040",fontSize:9,fontFamily:"'Cinzel',serif",fontWeight:on?700:400,animation:on?"phaseGlow 2s infinite":"none",whiteSpace:"nowrap"}}>{PHASE_LBL[p]}</div>;})}</div>;
}

function DuelLog({log}){
  const ref=useRef(null);useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[log]);
  const col={info:"#c0b880",draw:"#9090ee",play:"#f0d040",mana:"#60ee80",damage:"#ff6050",heal:"#60dd80",death:"#ee5050",combat:"#ffaa40",effect:"#cc90ff",phase:"#80aadd",discard:"#cc8840"};
  return <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 10px",background:"rgba(0,0,0,.4)",fontSize:11,fontFamily:"'Crimson Text',serif",scrollbarWidth:"thin"}}>
    {log.slice(-60).map((e,i)=><div key={i} style={{marginBottom:3,lineHeight:1.4,color:col[e.type]||"#c0b070"}}><span style={{color:"rgba(160,130,60,.5)",marginRight:4,fontSize:9}}>T{e.turn}</span>{e.text}</div>)}
  </div>;
}

function Tooltip({card,state,pos}){
  if(!card)return null;
  const{bg,ac}=thmOf(card);const ca=CCOLOR[card.color]||"#888";
  const p=isCre(card)?getPow(card,state):null,t=isCre(card)?getTou(card,state):null;
  return <div style={{position:"fixed",left:Math.min(pos.x+12,window.innerWidth-210),top:Math.min(pos.y-20,window.innerHeight-280),width:200,zIndex:1000,pointerEvents:"none",background:`linear-gradient(160deg,${bg},rgba(5,3,1,.98))`,border:`2px solid ${ca}60`,borderRadius:8,padding:12,boxShadow:`0 0 30px rgba(0,0,0,.9),0 0 10px ${ca}30`,animation:"fadeIn .15s ease-out"}}>
    <div style={{height:3,background:ca,marginBottom:8,borderRadius:2}}/>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontFamily:"'Cinzel',serif",color:"#e0d090",fontWeight:700,flex:1}}>{card.name}</span><Cost cost={card.cost} size={13}/></div>
    <div style={{fontSize:9,color:"#7a6040",marginBottom:6}}>{card.type}{card.subtype?` — ${card.subtype}`:""}</div>
    {card.keywords?.length>0&&<div style={{marginBottom:6}}>{card.keywords.map(k=><div key={k} style={{fontSize:9,color:ac||"#90d060",marginBottom:2}}><strong>{k.replace(/_/g," ")}</strong></div>)}</div>}
    {card.text&&<div style={{fontSize:10,color:"#c0b090",lineHeight:1.5,marginBottom:6}}>{card.text}</div>}
    {isCre(card)&&<div style={{textAlign:"right",fontSize:14,fontWeight:700,color:ca,fontFamily:"'Fira Code',monospace"}}>{p}/{t}</div>}
    <div style={{marginTop:4,fontSize:8,color:"#4a3820",fontFamily:"'Cinzel',serif"}}><span style={{background:card.rarity==="R"?"#6a4010":card.rarity==="U"?"#1a3050":"#2a2a2a",padding:"1px 4px",borderRadius:3}}>{card.rarity==="R"?"Rare":card.rarity==="U"?"Uncommon":"Common"}</span></div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// DUEL SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════════
function DuelScreen({config,onDuelEnd}){
  const init=useMemo(()=>buildDuelState(config.pDeckIds,config.oppArchKey,config.ruleset,config.overworldHP,config.castleMod,config.anteEnabled),[]);
  const[state,dispatch]=useReducer(duelReducer,init);
  const[tip,setTip]=useState(null);
  const aiRef=useRef(false);

  // AI loop
  useEffect(()=>{
    if(state.over){const delay=setTimeout(()=>onDuelEnd(state.over.winner==="p"?"win":"lose",state),900);return()=>clearTimeout(delay);}
    if(state.active!=="o"||aiRef.current)return;
    aiRef.current=true;
    const t=setTimeout(()=>{
      const acts=aiDecide(state);
      if(acts.length)dispatch({type:"AI_ACTS",acts});
      setTimeout(()=>{dispatch({type:"ADVANCE_PHASE"});aiRef.current=false;},320);
    },500+Math.random()*350);
    return()=>clearTimeout(t);
  },[state.phase,state.active,state.turn,state.over]);

  const s=state;

  const canCastNow=(c,who)=>{
    if(s.active!==who&&!isInst(c))return false;
    if((s.phase!=="MAIN1"&&s.phase!=="MAIN2")&&!isInst(c))return false;
    if(isLand(c))return s.active===who&&(s.phase==="MAIN1"||s.phase==="MAIN2")&&s.landsPlayed<1;
    return canPay(s[who].mana,c.cost);
  };
  const selDef=s.p.hand.find(c=>c.iid===s.selCard);
  const inMain=s.phase==="MAIN1"||s.phase==="MAIN2";
  const pMana=Object.values(s.p.mana).reduce((a,b)=>a+b,0);
  const oMana=Object.values(s.o.mana).reduce((a,b)=>a+b,0);

  const[pendingActivate,setPendingActivate]=useState(null);// {card, needsTarget, needsColor}
  const[lotusColor,setLotusColor]=useState(null);

  const handleActivate=(card)=>{
    const act=card.activated;
    if(!act)return;
    // If needs target, set selTgt mode
    if(["ping","destroyTapped","pumpCreature","gainFlying","pumpPower"].includes(act.effect)){
      setPendingActivate(card);
      dispatch({type:"SEL_CARD",iid:card.iid});
      return;
    }
    // Black Lotus needs color choice
    if(act.effect==="addMana3Any"){
      setLotusColor(card.iid);
      return;
    }
    // No target needed — activate immediately
    dispatch({type:"ACTIVATE_ABILITY",iid:card.iid,tgt:null});
    setPendingActivate(null);
  };

  const handleActivateWithTarget=(targetIid)=>{
    if(!pendingActivate)return;
    dispatch({type:"ACTIVATE_ABILITY",iid:pendingActivate.iid,tgt:targetIid});
    setPendingActivate(null);
    dispatch({type:"SEL_CARD",iid:null});dispatch({type:"SEL_TGT",iid:null});
  };

  const castSelected=()=>{
    if(!selDef)return;
    if(isLand(selDef)){dispatch({type:"PLAY_LAND",who:"p",iid:selDef.iid});dispatch({type:"SEL_CARD",iid:null});return;}
    const tgt=s.selTgt||((["damage3","damage5","damageX","psionicBlast","chainLightning"].includes(selDef.effect))||selDef.effect==="draw3"?null:null);
    const resolvedTgt=s.selTgt||(["damage3","damage5","damageX"].includes(selDef.effect)?"o":null);
    dispatch({type:"CAST_SPELL",who:"p",iid:selDef.iid,tgt:resolvedTgt,xVal:s.xVal});
    dispatch({type:"SEL_CARD",iid:null});dispatch({type:"SEL_TGT",iid:null});
  };

  const handleClick=(card,zone)=>{
    if(zone==="hand"){dispatch({type:"SEL_CARD",iid:s.selCard===card.iid?null:card.iid});return;}
    if(zone==="pBf"){
      if(isLand(card)&&!card.tapped){dispatch({type:"TAP_LAND",who:"p",iid:card.iid,mana:card.produces?.[0]||"C"});return;}
      if(isArt(card)&&!card.tapped&&card.activated?.effect?.startsWith("addMana")){dispatch({type:"TAP_ART_MANA",who:"p",iid:card.iid});return;}
      if(s.phase==="DECLARE_ATTACKERS"){dispatch({type:"DECLARE_ATTACKER",iid:card.iid});return;}
      if(s.phase==="DECLARE_BLOCKERS"){dispatch({type:"SEL_TGT",iid:card.iid});return;}
      if(pendingActivate){handleActivateWithTarget(card.iid);return;}
      dispatch({type:"SEL_TGT",iid:card.iid});return;
    }
    if(zone==="oBf"){
      if(s.phase==="DECLARE_BLOCKERS"&&s.selTgt){dispatch({type:"DECLARE_BLOCKER",blId:s.selTgt,attId:card.iid});dispatch({type:"SEL_TGT",iid:null});return;}
      dispatch({type:"SEL_TGT",iid:card.iid});return;
    }
  };

  return(
    <div style={{height:"100vh",width:"100vw",background:"#0a0e08",display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'Crimson Text',serif"}}>
      {/* Game over */}
      {s.over&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>{s.over.winner==="p"?"✦":"💀"}</div>
          <div style={{fontSize:24,fontFamily:"'Cinzel',serif",color:s.over.winner==="p"?"#80e080":"#e04040",marginBottom:8}}>{s.over.winner==="p"?"Victory!":"Defeat"}</div>
          <div style={{fontSize:12,color:"#a08060",marginBottom:16}}>{s.over.reason}</div>
          <div style={{fontSize:11,color:"#6a5030",fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>Returning to overworld…</div>
        </div>
      </div>}
      {/* Castle mod banner */}
      {s.castleMod&&<div style={{background:"rgba(100,20,0,.4)",borderBottom:"1px solid rgba(200,60,20,.3)",padding:"4px 14px",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:10,color:"#e08040",fontFamily:"'Cinzel',serif",letterSpacing:1}}>CASTLE MODIFIER:</span>
        <span style={{fontSize:10,color:"#f0c060",fontFamily:"'Cinzel',serif"}}>{s.castleMod.name}</span>
        <span style={{fontSize:10,color:"#a07040",fontStyle:"italic"}}>— {s.castleMod.desc}</span>
      </div>}
      {/* Ante display */}
      {s.anteEnabled&&(s.anteP||s.anteO)&&<div style={{background:"rgba(60,30,0,.4)",borderBottom:"1px solid rgba(180,120,40,.2)",padding:"3px 14px",display:"flex",gap:12,alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:9,color:"#c0a040",fontFamily:"'Cinzel',serif"}}>ANTE:</span>
        {s.anteP&&<span style={{fontSize:9,color:"#a09060"}}>You: <strong style={{color:"#f0c060"}}>{s.anteP.name}</strong></span>}
        {s.anteO&&<span style={{fontSize:9,color:"#a09060"}}>Opp: <strong style={{color:"#f0c060"}}>{s.anteO.name}</strong></span>}
      </div>}
      {/* Top bar */}
      <div style={{padding:"5px 10px",borderBottom:"2px solid rgba(200,160,40,.3)",background:"rgba(0,0,0,.7)",display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
            <span style={{fontSize:11,fontFamily:"'Cinzel',serif",color:"#d0a040",fontWeight:600,whiteSpace:"nowrap"}}>{config.ruleset.name}</span>
            <span style={{fontSize:10,color:"#a09050",whiteSpace:"nowrap"}}>T{s.turn}</span>
            {config.ruleset.manaBurn&&<span style={{fontSize:9,color:"#ee6030",fontFamily:"'Cinzel',serif",fontWeight:700,whiteSpace:"nowrap"}}>⚠ BURN</span>}
            {s.active==="o"&&<span style={{fontSize:10,color:"#9090dd",animation:"pulse 1s infinite",fontStyle:"italic",whiteSpace:"nowrap"}}>Opp…</span>}
          </div>
          <button onClick={()=>onDuelEnd("forfeit",s)} style={{background:"rgba(60,20,10,.7)",border:"1px solid rgba(180,80,40,.5)",color:"#e07050",padding:"3px 10px",borderRadius:5,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif",flexShrink:0}}>Forfeit</button>
        </div>
        <PhaseBar phase={s.phase}/>
      </div>
      {/* Battlefield */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Opponent side — capped height so player area always gets space */}
          <div style={{flex:"0 0 auto",maxHeight:"45vh",overflow:"hidden",borderBottom:"2px solid #6a2010",background:"linear-gradient(180deg,#1a0c08,#120808)"}}>
            <div style={{padding:"7px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid rgba(180,80,30,.3)",background:"rgba(0,0,0,.4)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#e05030",fontFamily:"'Cinzel',serif",letterSpacing:1}}>OPPONENT</span>
                <span style={{fontSize:24,fontWeight:700,fontFamily:"'Cinzel',serif",color:s.o.life<=5?"#ff2020":s.o.life<=10?"#e06030":"#ff9060",animation:s.o.life<=5?"pulse 1s infinite":s.o.lifeAnim==="damage"?"damageFlash .4s ease-out":s.o.lifeAnim==="heal"?"healFlash .4s ease-out":"none",textShadow:s.o.life<=5?"0 0 10px #ff2020":"none"}}>{s.o.life}</span>
                <div style={{width:70,height:8,background:"#1a0800",borderRadius:4,overflow:"hidden",border:"1px solid #6a3010"}}><div style={{width:`${Math.max(0,(s.o.life/config.ruleset.startingLife)*100)}%`,height:"100%",background:s.o.life<=5?"#cc1010":"linear-gradient(90deg,#aa3010,#dd5020)",transition:"width .4s",borderRadius:4}}/></div>
              </div>
              <span style={{fontSize:11,color:"#907050"}}>📚{s.o.lib.length} ✋{s.o.hand.length} 🪦{s.o.gy.length}</span>
              {oMana>0&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:"#706040"}}>Pool:</span><PoolDisplay pool={s.o.mana} size={13}/></div>}
              <div style={{display:"flex",gap:3,marginLeft:"auto"}}>{s.o.hand.map((_,i)=><div key={i} style={{width:26,height:40,background:"linear-gradient(135deg,#2a1a10,#1a100a)",border:"1px solid #5a3820",borderRadius:4,boxShadow:"0 2px 4px rgba(0,0,0,.5)"}}/>)}</div>
            </div>
            {/* Opponent battlefield — lands scroll horizontally, creatures below */}
            <div style={{display:"flex",flexDirection:"column"}}>
              {/* Opponent land row — horizontal scroll, fixed height */}
              <div style={{padding:"5px 10px 4px",borderBottom:"1px solid rgba(120,80,20,.2)",background:"rgba(0,0,0,.25)"}}>
                <div style={{fontSize:8,color:"#706028",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:4}}>LANDS ({s.o.bf.filter(isLand).length})</div>
                <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:4,minHeight:36}}>
                  {s.o.bf.filter(isLand).map(c=><LandPip key={c.iid} card={c} tapped={c.tapped} selected={s.selTgt===c.iid} onClick={()=>handleClick(c,"oBf")} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}/>)}
                  {!s.o.bf.filter(isLand).length&&<span style={{fontSize:9,color:"#2a1808",fontStyle:"italic",lineHeight:"28px"}}>—</span>}
                </div>
              </div>
              {/* Opponent creatures/spells row */}
              <div style={{padding:"6px 10px 8px",minHeight:90,display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
                {s.o.bf.filter(c=>!isLand(c)).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selTgt===c.iid} attacking={s.attackers.includes(c.iid)} onClick={()=>handleClick(c,"oBf")} sm/></div>)}
                {!s.o.bf.filter(c=>!isLand(c)).length&&<span style={{fontSize:10,color:"#2a1808",fontStyle:"italic"}}>No creatures in play</span>}
              </div>
            </div>
          </div>
          {/* Action bar */}
          <div style={{flexShrink:0,padding:"6px 14px",background:"rgba(0,0,0,.7)",borderBottom:"1px solid rgba(200,160,40,.2)",borderTop:"1px solid rgba(200,160,40,.15)",display:"flex",alignItems:"center",gap:8,minHeight:44}}>
            {s.active==="p"&&inMain&&selDef&&<button onClick={castSelected} style={{background:`linear-gradient(135deg,${thmOf(selDef).bg},rgba(0,0,0,.4))`,border:`2px solid ${CCOLOR[selDef.color]||"#aaa"}`,color:CCOLOR[selDef.color]||"#ccc",padding:"5px 14px",borderRadius:5,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif",fontWeight:700,boxShadow:`0 0 8px ${CCOLOR[selDef.color]||"#aaa"}40`}}>{isLand(selDef)?"▶ Play":"▶ Cast"} {selDef.name}</button>}
            {selDef?.cost?.includes("X")&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:"#c0a050",fontFamily:"'Cinzel',serif"}}>X=</span><input type="number" min={0} max={20} value={s.xVal} onChange={e=>dispatch({type:"SET_X",val:parseInt(e.target.value)||0})} style={{width:40,background:"rgba(20,15,0,.8)",border:"1px solid #7a6020",color:"#f0d050",padding:"3px 5px",borderRadius:4,fontSize:13,fontFamily:"'Fira Code',monospace"}}/></div>}
            {s.phase==="DECLARE_ATTACKERS"&&s.active==="p"&&<span style={{fontSize:11,color:"#ffaa40",fontFamily:"'Cinzel',serif",animation:"pulse 1.5s infinite",fontWeight:700}}>⚔ Click your creatures to declare attackers</span>}
            {s.phase==="DECLARE_BLOCKERS"&&s.active==="p"&&<span style={{fontSize:11,color:"#ffaa40",fontFamily:"'Cinzel',serif",animation:"pulse 1.5s infinite",fontWeight:700}}>🛡 Click an opponent's attacker, then your blocker</span>}
            {s.attackers.length>0&&<span style={{fontSize:11,color:"#ff9040",fontFamily:"'Cinzel',serif",fontWeight:700}}>⚔ {s.attackers.length} attacker{s.attackers.length!==1?"s":""}{Object.keys(s.blockers).length>0?` · 🛡 ${Object.keys(s.blockers).length} blocked`:""}</span>}
            {s.stack.length>0&&<div style={{display:"flex",gap:5,alignItems:"center",flex:1}}>
              <span style={{fontSize:10,color:"#b090e0",fontFamily:"'Cinzel',serif",fontWeight:700}}>STACK:</span>
              {s.stack.map(item=><div key={item.id} style={{padding:"3px 10px",borderRadius:5,fontSize:11,background:"rgba(100,60,180,.35)",border:"1px solid rgba(140,100,220,.6)",color:"#d0b0ff",animation:"stackIn .2s ease-out",fontFamily:"'Cinzel',serif"}}>{item.card.name}</div>)}
              <button onClick={()=>dispatch({type:"RESOLVE_STACK"})} style={{background:"rgba(60,40,0,.7)",border:"1px solid rgba(200,140,40,.6)",color:"#f0c040",padding:"3px 10px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif",fontWeight:700}}>Resolve ↓</button>
            </div>}
            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
              {s.active==="p"&&<button onClick={()=>dispatch({type:"ADVANCE_PHASE"})} style={{background:"linear-gradient(135deg,#1e1a04,#302808)",border:"2px solid rgba(220,180,40,.5)",color:"#f5d040",padding:"6px 18px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"'Cinzel',serif",fontWeight:700,letterSpacing:1,boxShadow:"0 0 8px rgba(220,180,40,.2)"}}>{s.phase==="CLEANUP"?"↺ End Turn":"Next Phase →"}</button>}
              {s.active==="o"&&<span style={{fontSize:11,color:"#6a5a30",padding:"6px 12px",fontFamily:"'Cinzel',serif",fontStyle:"italic"}}>Opponent's turn…</span>}
            </div>
          </div>
          {/* Player battlefield */}
          <div style={{flex:"1 1 0",minHeight:0,overflow:"auto",background:"linear-gradient(180deg,#0e1a0a,#0a140a)",borderTop:"2px solid #1a4010",display:"flex",flexDirection:"column"}}>
            {/* Player land row — horizontal scroll */}
            <div style={{flexShrink:0,padding:"5px 10px 4px",borderBottom:"1px solid rgba(60,120,20,.2)",background:"rgba(0,0,0,.2)"}}>
              <div style={{fontSize:8,color:"#407028",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:4}}>YOUR LANDS ({s.p.bf.filter(isLand).length})</div>
              <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:4,minHeight:36}}>
                {s.p.bf.filter(isLand).map(c=><LandPip key={c.iid} card={c} tapped={c.tapped} selected={s.selCard===c.iid||s.selTgt===c.iid} onClick={()=>handleClick(c,"pBf")} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)} isPlayer/>)}
                {!s.p.bf.filter(isLand).length&&<span style={{fontSize:9,color:"#182808",fontStyle:"italic",lineHeight:"28px"}}>—</span>}
              </div>
            </div>
            {/* Player creatures — flex fills remaining space */}
            <div style={{flex:1,padding:"6px 10px",overflow:"auto",display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
              {s.p.bf.filter(c=>!isLand(c)).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selCard===c.iid||s.selTgt===c.iid} attacking={s.attackers.includes(c.iid)} onClick={()=>handleClick(c,"pBf")} onActivate={c.activated?card=>handleActivate(card):null}/></div>)}
              {!s.p.bf.filter(c=>!isLand(c)).length&&<span style={{fontSize:10,color:"#182808",fontStyle:"italic"}}>No permanents in play</span>}
            </div>
          </div>
          {/* Player info */}
          <div style={{flexShrink:0,padding:"6px 14px",borderTop:"1px solid rgba(80,160,40,.3)",background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"#60ee60",fontFamily:"'Cinzel',serif",letterSpacing:1}}>YOU</span>
              <span style={{fontSize:24,fontWeight:700,fontFamily:"'Cinzel',serif",color:s.p.life<=5?"#ff2020":s.p.life<=10?"#e06030":"#60ee60",animation:s.p.life<=5?"pulse 1s infinite":s.p.lifeAnim==="damage"?"damageFlash .4s ease-out":s.p.lifeAnim==="heal"?"healFlash .4s ease-out":"none",textShadow:s.p.life<=5?"0 0 10px #ff2020":"none"}}>{s.p.life}</span>
              <div style={{width:70,height:8,background:"#081808",borderRadius:4,overflow:"hidden",border:"1px solid #2a6020"}}><div style={{width:`${Math.max(0,(s.p.life/config.ruleset.startingLife)*100)}%`,height:"100%",background:s.p.life<=5?"#cc1010":"linear-gradient(90deg,#208020,#40cc40)",transition:"width .4s",borderRadius:4}}/></div>
            </div>
            <span style={{fontSize:11,color:"#706850"}}>📚{s.p.lib.length} 🪦{s.p.gy.length}</span>
            {pMana>0&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:"#706040"}}>Pool:</span><PoolDisplay pool={s.p.mana} size={14}/>{config.ruleset.manaBurn&&<span style={{fontSize:10,color:"#ee6030",fontWeight:700}}>⚠ BURN</span>}</div>}
            <button onClick={()=>dispatch({type:"MULLIGAN",who:"p"})} style={{marginLeft:"auto",background:"rgba(0,0,0,.4)",border:"1px solid rgba(160,120,60,.4)",color:"#c0a050",padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>Mulligan</button>
          </div>
          {/* Hand */}
          <div style={{flexShrink:0,padding:"6px 10px 8px",display:"flex",gap:4,alignItems:"flex-end",background:"linear-gradient(180deg,#0c1808,#141c10)",overflowX:"auto",minHeight:120,borderTop:"1px solid rgba(60,120,30,.4)"}}>
            {s.p.hand.map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><HandCard card={c} state={s} selected={s.selCard===c.iid} playable={canCastNow(c,"p")} onClick={()=>handleClick(c,"hand")}/></div>)}
            {!s.p.hand.length&&<span style={{fontSize:12,color:"#2a3820",fontStyle:"italic",alignSelf:"center",fontFamily:"'Crimson Text',serif"}}>No cards in hand</span>}
          </div>
        </div>
        {/* Sidebar — hidden on very narrow screens via width clamp */}
        <div style={{width:"clamp(160px,22vw,210px)",borderLeft:"2px solid rgba(180,140,60,.25)",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0e0c08,#0a0a08)",flexShrink:0}}>
          <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(180,140,60,.2)"}}>
            <div style={{fontSize:11,color:"#c0a040",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:8,fontWeight:700}}>GRAVEYARDS</div>
            {["p","o"].map(w=><div key={w} style={{marginBottom:8,padding:"6px 8px",background:"rgba(255,255,255,.03)",borderRadius:5,border:"1px solid rgba(160,120,40,.15)"}}><div style={{fontSize:9,color:"#907040",marginBottom:3,fontFamily:"'Cinzel',serif",letterSpacing:1}}>{w==="p"?"YOUR":"OPPONENT"} ({s[w].gy.length})</div>{s[w].gy.slice(-1).map(c=><div key={c.iid} style={{fontSize:10,color:"#c0a870",fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>{c.name}</div>)}{!s[w].gy.length&&<div style={{fontSize:9,color:"#4a3820",fontStyle:"italic"}}>Empty</div>}</div>)}
          </div>
          {config.ruleset.exileZone&&<div style={{padding:"6px 12px",borderBottom:"1px solid rgba(180,140,60,.15)"}}><div style={{fontSize:10,color:"#7060a0",fontFamily:"'Cinzel',serif"}}>EXILE: {s.p.exile.length} / {s.o.exile.length}</div></div>}
          <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(180,140,60,.15)"}}>
            <div style={{fontSize:11,color:"#c0a040",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:8,fontWeight:700}}>RULESET</div>
            {[{l:"Mana Burn",v:config.ruleset.manaBurn},{l:"Stack",v:config.ruleset.stackType},{l:"Deathtouch",v:config.ruleset.deathtouch},{l:"Exile",v:config.ruleset.exileZone}].map(f=><div key={f.l} style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"'Fira Code',monospace",marginBottom:3}}><span style={{color:"#908060"}}>{f.l}</span><span style={{color:f.v===true?"#60ee60":f.v===false?"#ee4040":"#e0c040",fontWeight:700}}>{typeof f.v==="boolean"?(f.v?"✓":"✗"):f.v}</span></div>)}
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:"6px 0"}}>
            <div style={{fontSize:11,color:"#c0a040",fontFamily:"'Cinzel',serif",letterSpacing:1,padding:"0 12px 6px",fontWeight:700}}>GAME LOG</div>
            <DuelLog log={s.log}/>
          </div>
        </div>
      </div>
      {tip&&<Tooltip card={tip.card} state={s} pos={tip.pos}/>}

      {/* Black Lotus color chooser */}
      {lotusColor&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600}}>
        <div style={{background:"linear-gradient(160deg,#1a1010,#0a0808)",border:"2px solid rgba(200,160,40,.5)",borderRadius:10,padding:24,textAlign:"center",boxShadow:"0 0 60px rgba(0,0,0,.9)"}}>
          <div style={{fontSize:18,fontFamily:"'Cinzel',serif",color:"#f0c040",marginBottom:6}}>⚫ Black Lotus</div>
          <div style={{fontSize:12,color:"#a09060",marginBottom:18,fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>Choose which color of mana to add (×3).</div>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            {["W","U","B","R","G"].map(col=><button key={col} onClick={()=>{dispatch({type:"CHOOSE_LOTUS_COLOR",color:col});setLotusColor(null);}} style={{width:52,height:52,borderRadius:"50%",background:{"W":"#f9f0d0","U":"#3366bb","B":"#6633aa","R":"#bb3311","G":"#226611"}[col],border:"2px solid rgba(255,255,255,.3)",cursor:"pointer",fontSize:18,fontWeight:700,color:col==="W"?"#333":"#fff",boxShadow:`0 0 12px ${{ W:"#f9f0d0",U:"#3366bb",B:"#6633aa",R:"#bb3311",G:"#226611"}[col]}60`}}>{"WUBRG".indexOf(col)+1?["W","U","B","R","G"][["W","U","B","R","G"].indexOf(col)]:"?"}</button>)}
          </div>
          <button onClick={()=>setLotusColor(null)} style={{marginTop:16,background:"transparent",border:"1px solid #5a3020",color:"#806040",padding:"5px 14px",borderRadius:4,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif"}}>Cancel</button>
        </div>
      </div>}

      {/* Pending activate target instruction */}
      {pendingActivate&&<div style={{position:"fixed",bottom:220,left:"50%",transform:"translateX(-50%)",background:"rgba(200,160,40,.9)",borderRadius:6,padding:"8px 18px",fontSize:12,color:"#000",fontFamily:"'Cinzel',serif",fontWeight:700,zIndex:400,boxShadow:"0 4px 16px rgba(0,0,0,.6)"}}>
        ⚡ {pendingActivate.name}: click a target, or <button onClick={()=>{setPendingActivate(null);dispatch({type:"SEL_CARD",iid:null});}} style={{marginLeft:8,background:"rgba(0,0,0,.3)",border:"1px solid #000",color:"#000",padding:"2px 8px",borderRadius:3,cursor:"pointer",fontSize:11}}>Cancel</button>
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RUN SCORE SCREEN
// ═══════════════════════════════════════════════════════════════
function ScoreScreen({stats,onContinue,onNewGame}){
  const{playerName,playerColor,magesDefeated,dungeonsCleared,townsSaved,collection,manaLinksEstablished,won}=stats;
  const p9=collection.filter(c=>POWERED_NINE_IDS.includes(c.id)).length;
  const base=won?1000:0;
  const mageScore=magesDefeated.length*50;
  const dungScore=dungeonsCleared*10;
  const townScore=townsSaved*5;
  const cardScore=collection.length*2;
  const p9Score=p9*100;
  const linkPenalty=manaLinksEstablished*25;
  const total=Math.max(0,base+mageScore+dungScore+townScore+cardScore+p9Score-linkPenalty);
  const rows=[
    {label:"Victory",    val:base,   color:"#f0d040", show:won},
    {label:`Mages Defeated (×${magesDefeated.length})`, val:mageScore, color:"#ff9060"},
    {label:`Dungeons Cleared (×${dungeonsCleared})`,    val:dungScore,  color:"#aa88ff"},
    {label:`Towns Saved (×${townsSaved})`,              val:townScore,  color:"#60d080"},
    {label:`Cards Collected (×${collection.length})`,  val:cardScore,  color:"#88ccff"},
    {label:`Powered Nine (×${p9})`,                    val:p9Score,    color:"#f0c040", show:p9>0},
    {label:`Mana Links Established (×${manaLinksEstablished})`,val:-linkPenalty,color:"#ff5040",show:manaLinksEstablished>0},
  ];
  const colorName={"W":"White","U":"Blue","B":"Black","R":"Red","G":"Green"}[playerColor]||playerColor;
  return(
    <div style={{minHeight:"100vh",background:"#060402",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",backgroundImage:"radial-gradient(ellipse at 50% 30%,rgba(100,60,10,.5) 0%,transparent 70%)"}}>
      <div style={{width:520,background:"linear-gradient(160deg,#1a1408,#0e0c04)",border:"2px solid rgba(200,160,40,.4)",borderRadius:12,padding:36,boxShadow:"0 0 60px rgba(0,0,0,.9)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:36,marginBottom:8}}>{won?"✦":"💀"}</div>
          <div style={{fontSize:24,fontFamily:"'Cinzel Decorative',serif",color:won?"#f0d060":"#e04040",marginBottom:4}}>{won?"Shandalar Saved!":"The Plane Falls"}</div>
          <div style={{fontSize:13,color:"#a09060",fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>{playerName} · {colorName} Mage · {magesDefeated.length}/5 Mages Defeated</div>
        </div>
        <div style={{marginBottom:24}}>
          {rows.filter(r=>r.show!==false).map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",marginBottom:4,background:"rgba(255,255,255,.03)",borderRadius:5,border:"1px solid rgba(255,255,255,.06)",animation:`scoreReveal .4s ease-out ${i*80}ms both`}}>
              <span style={{fontSize:12,color:"#c0b080"}}>{r.label}</span>
              <span style={{fontSize:13,fontWeight:700,color:r.color,fontFamily:"'Fira Code',monospace"}}>{r.val>=0?"+":""}{r.val}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 12px",marginTop:8,background:"rgba(200,160,40,.12)",borderRadius:6,border:"2px solid rgba(200,160,40,.4)"}}>
            <span style={{fontSize:14,fontFamily:"'Cinzel',serif",color:"#f0c040",fontWeight:700,letterSpacing:1}}>FINAL SCORE</span>
            <span style={{fontSize:22,fontWeight:700,color:"#f0c040",fontFamily:"'Cinzel Decorative',serif"}}>{total.toLocaleString()}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          <button onClick={onNewGame} style={{background:"linear-gradient(135deg,#1a1004,#2e1c08)",border:"2px solid rgba(200,160,40,.5)",color:"#f0c040",padding:"12px 28px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"'Cinzel',serif",letterSpacing:1}}>New Game</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERWORLD UI COMPONENTS
// ═══════════════════════════════════════════════════════════════
function OWTile({tile,isPlayer,onClick}){
  const t=tile.terrain,s=tile.structure;
  if(!tile.revealed)return <div onClick={()=>onClick(tile)} style={{width:TSIZ,height:TSIZ,background:"#0a0806",border:"1px solid #100e08",cursor:"pointer"}}/>;
  const ml=tile.manaLink;
  return(
    <div onClick={()=>onClick(tile)} style={{width:TSIZ,height:TSIZ,background:t.color,border:"1px solid rgba(0,0,0,.25)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",boxShadow:isPlayer?"0 0 10px rgba(255,240,100,.8)":"none"}}>
      {ml&&<div style={{position:"absolute",inset:0,background:`${MHEX[ml]}40`,border:`2px solid ${MHEX[ml]}80`,animation:"pulse 2s infinite"}}/>}
      {s==="TOWN"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",zIndex:2,gap:1}}>
        <div style={{fontSize:TSIZ*.42,lineHeight:1}}>⌂</div>
        <div style={{fontSize:6,color:"#f0d090",fontFamily:"'Cinzel',serif",whiteSpace:"nowrap",textShadow:"0 1px 3px rgba(0,0,0,.9)",overflow:"hidden",maxWidth:TSIZ-4,textAlign:"center"}}>{tile.townData?.name?.slice(0,7)||""}</div>
      </div>}
      {s==="DUNGEON"&&<div style={{fontSize:TSIZ*.38,lineHeight:1,zIndex:2}}>⚑</div>}
      {s==="CASTLE"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",zIndex:2,gap:1}}>
        <div style={{fontSize:TSIZ*.38,lineHeight:1,filter:`drop-shadow(0 0 6px ${MHEX[tile.castleData?.color]||"#fff"})`,animation:tile.castleData?.defeated?"none":"pulse 3s infinite"}}>{tile.castleData?.defeated?"✓":"♔"}</div>
        <div style={{fontSize:5.5,color:MHEX[tile.castleData?.color]||"#fff",fontFamily:"'Cinzel',serif",textShadow:"0 1px 3px rgba(0,0,0,.9)",opacity:.9}}>{tile.castleData?.mage?.slice(0,6)||""}</div>
      </div>}
      {!s&&t!==TERRAIN.WATER&&<div style={{fontSize:TSIZ*.36,opacity:.45}}>{t.icon}</div>}
      {isPlayer&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}><div style={{width:TSIZ*.55,height:TSIZ*.55,borderRadius:"50%",background:"radial-gradient(circle at 35% 35%,#fff8e0,#e0c050)",border:"2px solid rgba(255,255,255,.8)",boxShadow:"0 0 10px rgba(255,240,100,.8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:TSIZ*.28,animation:"wizPulse 2s ease-in-out infinite"}}>🧙</div></div>}
    </div>
  );
}

function HUDBar({player,manaLinks,magesDefeated,artifacts,moves}){
  const hasWard=artifacts.some(a=>a.id==="ward"&&a.owned);const thr=hasWard?5:3;
  return(
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"6px 12px",background:"rgba(0,0,0,.5)",borderBottom:"1px solid rgba(200,160,60,.3)"}}>
      <div style={{display:"flex",alignItems:"center",gap:5}}>
        <span style={{fontSize:11,color:"#c8a060",fontFamily:"'Cinzel',serif"}}>HP</span>
        <div style={{width:78,height:12,background:"#1a0a00",borderRadius:6,border:"1px solid #5a3010",overflow:"hidden"}}><div style={{width:`${(player.hp/player.maxHP)*100}%`,height:"100%",background:player.hp>player.maxHP*.5?"linear-gradient(90deg,#c04020,#e06040)":"linear-gradient(90deg,#800010,#c01020)",transition:"width .4s",borderRadius:6}}/></div>
        <span style={{fontSize:11,color:"#e08060",fontFamily:"'Cinzel',serif",minWidth:36}}>{player.hp}/{player.maxHP}</span>
      </div>
      <span style={{fontSize:12,color:"#f0c040",fontFamily:"'Cinzel',serif"}}>⚙ {player.gold}g</span>
      <span style={{fontSize:12,color:"#a080e0",fontFamily:"'Cinzel',serif"}}>◆ {player.gems}</span>
      <span style={{fontSize:10,color:"#8090a0",fontFamily:"'Cinzel',serif"}}>Move {moves}</span>
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#a08060",fontFamily:"'Cinzel',serif"}}>LINKS:</span>
        {COLORS.map(c=>{const lnk=manaLinks[c]||0;const def=magesDefeated.includes(c);return(
          <div key={c} title={`${MAGE_N[c]}: ${lnk}/${thr}${def?" (defeated)":""}`} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
            <div style={{fontSize:10,color:def?"#405030":lnk>=thr?"#ff2020":lnk>=thr-1?"#f08020":"#a09070"}}>{MSYM[c]}</div>
            <div style={{display:"flex",gap:1}}>{Array.from({length:thr}).map((_,i)=><div key={i} style={{width:5,height:5,borderRadius:1,background:def?"#2a3020":i<lnk?MHEX[c]:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.1)"}}/>)}</div>
          </div>
        );})}
      </div>
      {artifacts.filter(a=>a.owned).map(a=><div key={a.id} title={`${a.name}: ${a.desc}`} style={{fontSize:14,filter:"drop-shadow(0 0 3px rgba(200,160,80,.6))",cursor:"help"}}>{a.icon}</div>)}
    </div>
  );
}

function OWLog({log}){
  const ref=useRef(null);useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[log]);
  const col={info:"#a8c0a0",warn:"#f0c060",danger:"#e06050",success:"#60c080",event:"#c0a0e0"};
  return <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 8px",background:"rgba(0,0,0,.35)",borderRadius:5,border:"1px solid rgba(200,170,100,.12)"}}>
    {log.map((e,i)=><div key={i} style={{fontSize:10,color:col[e.type]||"#a0b090",marginBottom:3,lineHeight:1.4,fontFamily:"'Crimson Text',serif"}}>— {e.text}</div>)}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// OVERWORLD MODALS
// ═══════════════════════════════════════════════════════════════
function TownModal({town,player,binder,gems,onClose,onBuy,onSell,onRest,onSage,onTrade,onGemBuy}){
  const[tab,setTab]=useState("shop");
  const restCost=Math.max(0,(player.maxHP-player.hp)*3);
  const hasGems=player.gems>0||true; // Always show gem merchant
  const sellPrice=c=>Math.max(1,Math.round(((c.cmc||1)*8+(c.rarity==="R"?32:c.rarity==="U"?12:0))*0.4));
  const tabs=[{id:"shop",l:"⚜ Shop"},{id:"sell",l:`💰 Sell (${binder.length})`},{id:"inn",l:"🏠 Inn"},...(town.hasSage?[{id:"sage",l:"📜 Sage"}]:[]),...(town.hasBlackMarket?[{id:"bm",l:"⚫ Market"}]:[]),{id:"gems",l:`◆ Gems (${player.gems})`},...(town.quest&&!town.questDone?[{id:"guild",l:"⚔ Guild"}]:[])];
  const cardPrice=c=>Math.round((c.cmc||1)*8+(c.rarity==="R"?32:c.rarity==="U"?12:0));
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{width:520,maxHeight:"80vh",background:"linear-gradient(160deg,#1a1008,#0e0c04)",border:"2px solid rgba(200,160,60,.5)",borderRadius:10,boxShadow:"0 0 40px rgba(0,0,0,.8)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"12px 16px 0",borderBottom:"1px solid rgba(200,160,60,.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><div style={{fontSize:17,fontFamily:"'Cinzel',serif",color:"#f0c060"}}>⌂ {town.name}</div><div style={{fontSize:10,color:"#6a4820",fontStyle:"italic"}}>A waypoint in Shandalar</div></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:13,color:"#f0c040",fontFamily:"'Cinzel',serif"}}>⚙ {player.gold}g</span><button onClick={onClose} style={{background:"transparent",border:"1px solid #5a3020",color:"#c08060",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:12}}>✕ Leave</button></div>
          </div>
          <div style={{display:"flex"}}>{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?"rgba(200,160,60,.15)":"transparent",border:"none",borderBottom:tab===t.id?"2px solid #f0c060":"2px solid transparent",color:tab===t.id?"#f0c060":"#806040",padding:"7px 13px",cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>{t.l}</button>)}</div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin"}}>
          {tab==="shop"&&<div>
            <div style={{fontSize:11,color:"#8a7050",marginBottom:10,fontStyle:"italic"}}>"{town.name}'s merchant deals in arcane arts."</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
              {town.stock.map((c,i)=>{const pr=cardPrice(c);return(
                <div key={i} onClick={()=>onBuy(c,pr)} style={{width:96,padding:"8px 7px 6px",background:thmOf(c).bg,border:`2px solid ${thmOf(c).bd}`,borderRadius:6,cursor:"pointer",position:"relative",boxShadow:"0 2px 6px rgba(0,0,0,.4)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
                  <div style={{position:"absolute",top:3,right:3,width:6,height:6,borderRadius:"50%",background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#a0b8d0":"#c0c0c0"}}/>
                  <div style={{fontSize:8,fontFamily:"'Cinzel',serif",color:"#d0c090",fontWeight:600,marginBottom:2,lineHeight:1.2,paddingRight:8}}>{c.name}</div>
                  <div style={{fontSize:7,color:"#6a5030",marginBottom:4}}>{c.subtype||c.type}</div>
                  {isCre(c)&&<div style={{fontSize:9,fontWeight:700,color:CCOLOR[c.color]||"#888",fontFamily:"'Fira Code',monospace",textAlign:"right"}}>{c.power}/{c.toughness}</div>}
                  <div style={{fontSize:9,color:"#8a6000",fontWeight:700}}>{pr}g</div>
                </div>
              );})}
            </div>
            {(binder.filter(c=>c.rarity==="C").length>=3||binder.filter(c=>c.rarity==="U").length>=5)&&<div style={{padding:10,background:"rgba(255,255,255,.03)",borderRadius:6,border:"1px solid rgba(200,160,60,.12)"}}>
              <div style={{fontSize:10,color:"#a08040",fontFamily:"'Cinzel',serif",marginBottom:6}}>CARD TRADES</div>
              <div style={{display:"flex",gap:6}}>
                {binder.filter(c=>c.rarity==="C").length>=3&&<button onClick={()=>onTrade("C")} style={{background:"rgba(80,80,80,.2)",border:"1px solid #606060",color:"#c0c0c0",padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>3 Commons → Uncommon</button>}
                {binder.filter(c=>c.rarity==="U").length>=5&&<button onClick={()=>onTrade("U")} style={{background:"rgba(40,80,120,.2)",border:"1px solid #6080a0",color:"#a0c0d0",padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>5 Uncommons → Rare</button>}
              </div>
            </div>}
          </div>}
          {tab==="sell"&&<div>
            <div style={{fontSize:11,color:"#8a7050",marginBottom:12,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>"I'll take those off your hands — not at full price, mind you."</div>
            {binder.length===0
              ?<div style={{color:"#504030",fontSize:12,fontStyle:"italic",textAlign:"center",padding:20}}>Your binder is empty. Win duels and buy cards to build your collection.</div>
              :<div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {binder.map((c,i)=>{const sp=sellPrice(c);return(
                  <div key={c.iid||i} onClick={()=>onSell(c,sp)} style={{width:96,padding:"8px 7px 6px",background:thmOf(c).bg,border:`2px solid ${thmOf(c).bd}`,borderRadius:6,cursor:"pointer",position:"relative",boxShadow:"0 2px 6px rgba(0,0,0,.4)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
                    <div style={{position:"absolute",top:3,right:3,width:6,height:6,borderRadius:"50%",background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#a0b8d0":"#c0c0c0"}}/>
                    <div style={{fontSize:8,fontFamily:"'Cinzel',serif",color:"#d0c090",fontWeight:600,marginBottom:2,lineHeight:1.2,paddingRight:8}}>{c.name}</div>
                    <div style={{fontSize:7,color:"#6a5030",marginBottom:4}}>{c.subtype||c.type}</div>
                    {isCre(c)&&<div style={{fontSize:9,fontWeight:700,color:CCOLOR[c.color]||"#888",fontFamily:"'Fira Code',monospace",textAlign:"right"}}>{c.power}/{c.toughness}</div>}
                    <div style={{fontSize:10,color:"#60c060",fontWeight:700}}>+{sp}g</div>
                  </div>
                );})}
              </div>
            }
          </div>}
          {tab==="inn"&&<div>
            <div style={{background:"rgba(255,255,255,.04)",borderRadius:8,padding:14,border:"1px solid rgba(200,160,60,.12)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:110,height:10,background:"#1a0a00",borderRadius:5,overflow:"hidden",border:"1px solid #5a3010"}}><div style={{width:`${(player.hp/player.maxHP)*100}%`,height:"100%",background:"linear-gradient(90deg,#c04020,#e06040)",borderRadius:5}}/></div>
                <span style={{fontSize:12,color:"#e08060",fontFamily:"'Cinzel',serif"}}>{player.hp}/{player.maxHP} HP</span>
              </div>
              {player.hp<player.maxHP?<>
                <div style={{fontSize:12,color:"#a09070",marginBottom:10}}>Full rest: +<strong style={{color:"#e08060"}}>{player.maxHP-player.hp} HP</strong> for <strong style={{color:"#f0c040"}}>{restCost}g</strong></div>
                <button onClick={()=>player.gold>=restCost&&onRest(restCost)} style={{background:player.gold>=restCost?"linear-gradient(135deg,#3a2010,#5a3020)":"rgba(0,0,0,.3)",border:`1px solid ${player.gold>=restCost?"#a06030":"#3a2810"}`,color:player.gold>=restCost?"#f0c060":"#5a4030",padding:"8px 18px",borderRadius:5,cursor:player.gold>=restCost?"pointer":"not-allowed",fontFamily:"'Cinzel',serif",fontSize:12}}>🏠 Rest ({restCost}g)</button>
              </>:<div style={{fontSize:12,color:"#60a060"}}>✓ At full health.</div>}
            </div>
          </div>}
          {tab==="sage"&&<div>
            <div style={{background:"rgba(255,255,255,.04)",borderRadius:8,padding:14,border:"1px solid rgba(200,160,60,.12)"}}>
              <div style={{fontSize:12,color:"#a09070",marginBottom:10}}>Dungeon clue for <strong style={{color:"#f0c040"}}>25 gold</strong>: reveals a hidden dungeon.</div>
              <button onClick={()=>player.gold>=25&&onSage()} style={{background:player.gold>=25?"linear-gradient(135deg,#1a2830,#2a4050)":"rgba(0,0,0,.3)",border:`1px solid ${player.gold>=25?"#4080a0":"#2a3810"}`,color:player.gold>=25?"#80c0e0":"#5a4030",padding:"8px 18px",borderRadius:5,cursor:player.gold>=25?"pointer":"not-allowed",fontFamily:"'Cinzel',serif",fontSize:12}}>📜 Seek Dungeon Knowledge (25g)</button>
            </div>
          </div>}
          {tab==="bm"&&<div>
            <div style={{fontSize:11,color:"#8a7050",marginBottom:10,fontStyle:"italic"}}>"Don't ask where these came from."</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {town.stock.filter(c=>c.rarity==="R").map((c,i)=>{const pr=Math.round(cardPrice(c)*1.5);return(
                <div key={i} onClick={()=>onBuy(c,pr)} style={{width:96,padding:"8px 7px 6px",background:thmOf(c).bg,border:"2px solid #f0c04050",borderRadius:6,cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.4)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
                  <div style={{fontSize:8,fontFamily:"'Cinzel',serif",color:"#f0c080",fontWeight:600,marginBottom:2}}>{c.name}</div>
                  <div style={{fontSize:9,color:"#f0c040",fontWeight:700,fontFamily:"'Fira Code',monospace",textAlign:"right",marginTop:4}}>{pr}g</div>
                </div>
              );})}
              {!town.stock.filter(c=>c.rarity==="R").length&&<div style={{color:"#504030",fontSize:12,fontStyle:"italic"}}>No rare goods today.</div>}
            </div>
          </div>}
          {tab==="gems"&&<div>
            <div style={{fontSize:11,color:"#a080e0",marginBottom:12,fontStyle:"italic",fontFamily:"'Crimson Text',serif"}}>"I deal only in the rarest currency. What would you like, traveler?"</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {cost:3,label:"Random Rare Card",desc:"Draw one rare card at random from the pool.",action:()=>{if(player.gems>=3)onGemBuy("rare");}},
                {cost:5,label:"Extra Max HP (+5)",desc:"Permanently increase your maximum hit points by 5.",action:()=>{if(player.gems>=5)onGemBuy("hp");}},
                {cost:2,label:"Full Heal",desc:"Restore your HP to maximum.",action:()=>{if(player.gems>=2){setPlayer(p=>({...p,hp:p.maxHP,gems:p.gems-2}));addLog("Gem merchant: fully healed. –2◆","success");}}},
              ].map((item,i)=>(
                <div key={i} style={{background:"rgba(80,40,100,.2)",borderRadius:7,padding:"12px 14px",border:"1px solid rgba(150,80,200,.3)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,color:"#c0a0e0",fontFamily:"'Cinzel',serif",marginBottom:3}}>{item.label}</div>
                    <div style={{fontSize:10,color:"#806090",fontFamily:"'Crimson Text',serif"}}>{item.desc}</div>
                  </div>
                  <button onClick={item.action} disabled={player.gems<item.cost} style={{background:player.gems>=item.cost?"linear-gradient(135deg,#3a1860,#5a2890)":"rgba(0,0,0,.3)",border:`1px solid ${player.gems>=item.cost?"#9060cc":"#3a2850"}`,color:player.gems>=item.cost?"#cc88ff":"#504060",padding:"7px 14px",borderRadius:5,cursor:player.gems>=item.cost?"pointer":"not-allowed",fontFamily:"'Cinzel',serif",fontSize:11,whiteSpace:"nowrap"}}>◆{item.cost}</button>
                </div>
              ))}
              <div style={{fontSize:11,color:"#604070",textAlign:"center",marginTop:4}}>Your gems: <strong style={{color:"#b080dd"}}>◆{player.gems}</strong></div>
            </div>
          </div>}
          {tab==="guild"&&town.quest&&<div>
            <div style={{background:"rgba(255,255,255,.04)",borderRadius:8,padding:14,border:"1px solid rgba(200,160,60,.12)"}}>
              <div style={{fontSize:14,color:"#e0c060",fontFamily:"'Cinzel',serif",marginBottom:6}}>⚔ {town.quest.title}</div>
              <div style={{fontSize:12,color:"#c0a070",marginBottom:10}}>{town.quest.desc}</div>
              <div style={{fontSize:11,color:"#80c080",marginBottom:10}}>Reward: {town.quest.rewardType==="card"?<strong>{cDef(town.quest.rewardId)?.name||town.quest.rewardId} (card)</strong>:<strong>{town.quest.rewardGold} gold</strong>}</div>
              <div style={{fontSize:10,color:"#6a5020",fontStyle:"italic"}}>Quest rewards granted automatically when conditions are met during overworld travel.</div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

function DungeonModal({dungeon,onClose,onEnter}){
  const m=dungeon.mod;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{width:400,background:"linear-gradient(160deg,#100a04,#0a0804)",border:"2px solid rgba(150,100,50,.4)",borderRadius:10,padding:22,boxShadow:"0 0 50px rgba(0,0,0,.9)"}}>
        <div style={{textAlign:"center",marginBottom:18}}><div style={{fontSize:26,marginBottom:6}}>⚑</div><div style={{fontSize:17,fontFamily:"'Cinzel',serif",color:"#c08040"}}>{dungeon.name}</div><div style={{fontSize:10,color:"#6a4820",fontStyle:"italic"}}>A place of shadow and terrible power…</div></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:6,padding:8,border:"1px solid rgba(150,100,50,.2)"}}><div style={{fontSize:9,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:3}}>ROOMS</div><div style={{fontSize:18,fontFamily:"'Cinzel',serif",color:"#e0a060"}}>{dungeon.rooms}</div></div>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:6,padding:8,border:"1px solid rgba(150,100,50,.2)"}}><div style={{fontSize:9,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:3}}>DOMINANT</div><Pip sym={dungeon.domColor} size={18}/></div>
        </div>
        <div style={{background:"rgba(80,20,0,.2)",borderRadius:6,padding:10,marginBottom:14,border:"1px solid rgba(150,60,20,.3)"}}><div style={{fontSize:9,color:"#a06040",fontFamily:"'Cinzel',serif",marginBottom:3}}>{m.icon} MODIFIER: {m.name.toUpperCase()}</div><div style={{fontSize:11,color:"#c08050"}}>{m.desc}</div></div>
        <div style={{fontSize:10,color:"#8a5020",fontStyle:"italic",marginBottom:14}}>⚠ HP does not restore between rooms. You cannot exit and return.</div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onEnter} style={{flex:1,background:"linear-gradient(135deg,#3a1a08,#5a2a10)",border:"1px solid #a06030",color:"#f0a040",padding:"9px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1}}>⚑ Enter Dungeon</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #4a3020",color:"#806040",padding:"9px 14px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>Retreat</button>
        </div>
      </div>
    </div>
  );
}

function CastleModal({castleData,onClose,onChallenge}){
  const{color,mage,defeated}=castleData;const hx=MHEX[color];const mod=CASTLE_MOD[color];
  const flavor={W:"Delenia rules with iron velvet. Her justice is merciless.",U:"Xylos has watched for centuries, pulling strings like a puppeteer.",B:"The stench of death precedes Mortis. Power is all he respects.",R:"Karag does not strategize. He burns. He relishes your challenge.",G:"Sylvara is ancient beyond reckoning. To fight her is to fight the land."};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.87)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{width:410,background:"linear-gradient(160deg,#0a0808,#050505)",border:`2px solid ${hx}50`,borderRadius:10,padding:26,boxShadow:`0 0 50px ${hx}30`}}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:30,marginBottom:8,filter:`drop-shadow(0 0 8px ${hx})`}}>{MSYM[color]}</div>
          <div style={{fontSize:11,color:hx,fontFamily:"'Cinzel',serif",letterSpacing:2,marginBottom:4}}>{CASTLE_N[color].toUpperCase()}</div>
          <div style={{fontSize:20,fontFamily:"'Cinzel',serif",color:"#f0e0c0",marginBottom:4}}>{mage}</div>
          <div style={{fontSize:12,color:"#8a7060",fontStyle:"italic"}}>{MAGE_T[color]}</div>
        </div>
        <div style={{background:`${hx}10`,borderRadius:8,padding:12,marginBottom:12,border:`1px solid ${hx}25`}}><div style={{fontSize:12,color:"#c0a070",fontStyle:"italic"}}>"{flavor[color]}"</div></div>
        <div style={{background:"rgba(80,20,0,.2)",borderRadius:6,padding:10,marginBottom:14,border:`1px solid ${hx}30`}}>
          <div style={{fontSize:9,color:hx,fontFamily:"'Cinzel',serif",marginBottom:3}}>CASTLE MODIFIER: {mod.name.toUpperCase()}</div>
          <div style={{fontSize:11,color:"#c08050"}}>{mod.desc}</div>
        </div>
        {defeated?<div style={{textAlign:"center",padding:10}}><div style={{fontSize:13,color:"#60a060",fontFamily:"'Cinzel',serif"}}>✓ Defeated. {mage}'s power is broken.</div></div>:
        <div style={{display:"flex",gap:10}}>
          <button onClick={onChallenge} style={{flex:1,background:`linear-gradient(135deg,${hx}20,${hx}10)`,border:`1px solid ${hx}60`,color:hx,padding:"11px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>⚔ Challenge {mage}</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #4a3020",color:"#806040",padding:"11px 14px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>Withdraw</button>
        </div>}
      </div>
    </div>
  );
}

// ── DeckManager card tile (must be outside DeckManager to avoid remount-on-render) ──
function DeckCardTile({c,selected,onClick,side}){
  const ca=CCOLOR[c.color]||"#888";
  return(
    <div onClick={onClick} style={{width:90,padding:"7px 7px 5px",background:selected?(side==="deck"?"rgba(240,192,64,.15)":"rgba(64,180,240,.15)"):thmOf(c).bg,border:`2px solid ${selected?(side==="deck"?"#f0c040":"#40b4f0"):thmOf(c).bd}`,borderRadius:6,cursor:"pointer",position:"relative",boxShadow:selected?"0 0 10px rgba(200,160,40,.4)":"0 2px 5px rgba(0,0,0,.4)",transition:"transform .12s,box-shadow .12s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
      <div style={{position:"absolute",top:3,left:3,width:6,height:6,borderRadius:"50%",background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#88b8d0":"#909090"}}/>
      <div style={{position:"absolute",top:3,right:4,fontSize:7,color:ca,fontFamily:"'Fira Code',monospace",fontWeight:700}}>{c.cost||""}</div>
      <div style={{fontSize:8,fontFamily:"'Cinzel',serif",color:"#e0d080",fontWeight:700,lineHeight:1.3,marginBottom:2,paddingLeft:8,paddingRight:20}}>{c.name}</div>
      <div style={{fontSize:7,color:"#806040",marginBottom:2}}>{c.subtype||c.type}</div>
      {isCre(c)&&<div style={{fontSize:9,fontWeight:700,color:ca,fontFamily:"'Fira Code',monospace",textAlign:"right"}}>{c.power}/{c.toughness}</div>}
    </div>
  );
}

function DeckManager({deck,binder,onClose,onSwap,onMoveToDeck,onMoveToBinder}){
  const[selD,setSelD]=useState(null);
  const[selB,setSelB]=useState(null);
  const[colorFilt,setColorFilt]=useState("ALL");
  const[search,setSearch]=useState("");
  const[sortBy,setSortBy]=useState("cmc"); // cmc | name | type
  const[activePanel,setActivePanel]=useState("both"); // deck | binder | both

  const applyFilters=(cards)=>{
    let r=[...cards];
    if(colorFilt!=="ALL")r=r.filter(c=>c.color===colorFilt);
    if(search.trim())r=r.filter(c=>c.name.toLowerCase().includes(search.trim().toLowerCase()));
    if(sortBy==="cmc")r.sort((a,b)=>a.cmc-b.cmc||a.name.localeCompare(b.name));
    else if(sortBy==="name")r.sort((a,b)=>a.name.localeCompare(b.name));
    else if(sortBy==="type")r.sort((a,b)=>(a.type||"").localeCompare(b.type||"")||a.name.localeCompare(b.name));
    return r;
  };
  const fD=applyFilters(deck);
  const fB=applyFilters(binder);

  // Deck stats
  const lands=deck.filter(isLand).length;
  const creatures=deck.filter(isCre).length;
  const spells=deck.filter(c=>!isLand(c)&&!isCre(c)).length;
  const avgCmc=deck.filter(c=>!isLand(c)).length?
    (deck.filter(c=>!isLand(c)).reduce((a,c)=>a+(c.cmc||0),0)/deck.filter(c=>!isLand(c)).length).toFixed(1):
    "—";
  // No minimum deck size — player decides

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",display:"flex",alignItems:"stretch",justifyContent:"center",zIndex:200,padding:"16px"}}>
      <div style={{width:"100%",maxWidth:760,background:"linear-gradient(160deg,#0e0c04,#080a04)",border:"2px solid rgba(180,160,60,.4)",borderRadius:12,display:"flex",flexDirection:"column",boxShadow:"0 0 60px rgba(0,0,0,.9)",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(180,160,60,.2)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:16,fontFamily:"'Cinzel',serif",color:"#e0c060",fontWeight:700}}>📖 Deck Manager</div>
            <div style={{fontSize:10,color:"#6a5020",marginTop:2,display:"flex",gap:10}}>
              <span style={{color:"#80c080"}}>{deck.length} cards</span>
              <span>{lands} lands · {creatures} creatures · {spells} spells</span>
              <span>Avg CMC: {avgCmc}</span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(80,20,10,.6)",border:"1px solid rgba(180,80,40,.5)",color:"#e08060",borderRadius:5,padding:"5px 14px",cursor:"pointer",fontSize:12,fontFamily:"'Cinzel',serif"}}>✕ Close</button>
        </div>

        {/* Controls bar */}
        <div style={{padding:"8px 16px",borderBottom:"1px solid rgba(180,160,60,.12)",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",flexShrink:0,background:"rgba(0,0,0,.2)"}}>
          {/* Search */}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cards…" style={{background:"rgba(0,0,0,.5)",border:"1px solid #5a4020",color:"#f0d080",padding:"4px 10px",borderRadius:5,fontSize:11,fontFamily:"'Cinzel',serif",width:140,outline:"none"}}/>
          {/* Color filter */}
          <div style={{display:"flex",gap:3}}>
            {["ALL","W","U","B","R","G",""].map(f=><button key={f} onClick={()=>setColorFilt(f)} style={{background:colorFilt===f?"rgba(200,160,40,.25)":"transparent",border:`1px solid ${colorFilt===f?"#c0a030":"#3a3010"}`,color:colorFilt===f?"#f0c040":"#6a5020",padding:"3px 8px",borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"'Cinzel',serif"}}>{f||"∅"}</button>)}
          </div>
          {/* Sort */}
          <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
            <span style={{fontSize:9,color:"#6a5020",lineHeight:"24px"}}>Sort:</span>
            {[["cmc","CMC"],["name","Name"],["type","Type"]].map(([k,l])=><button key={k} onClick={()=>setSortBy(k)} style={{background:sortBy===k?"rgba(200,160,40,.2)":"transparent",border:`1px solid ${sortBy===k?"#a08030":"#3a3010"}`,color:sortBy===k?"#f0c040":"#6a5020",padding:"3px 8px",borderRadius:4,cursor:"pointer",fontSize:9,fontFamily:"'Cinzel',serif"}}>{l}</button>)}
          </div>
        </div>

        {/* Action bar — shown when selection made */}
        {(selD!==null||selB!==null)&&<div style={{padding:"8px 16px",borderBottom:"1px solid rgba(180,160,60,.12)",background:"rgba(200,160,40,.08)",display:"flex",gap:10,alignItems:"center",flexShrink:0}}>
          {selD!==null&&selB!==null&&<>
            <span style={{fontSize:11,color:"#c0a860",flex:1}}>
              Move <strong style={{color:"#f0d060"}}>{fD[selD]?.name}</strong> → Binder, move <strong style={{color:"#60c0f0"}}>{fB[selB]?.name}</strong> → Deck
            </span>
            <button onClick={()=>{onSwap(fD[selD],fB[selB]);setSelD(null);setSelB(null);}} style={{background:"linear-gradient(135deg,#1a2a10,#2a4020)",border:"1px solid #5a9040",color:"#80d060",padding:"6px 14px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:700}}>⇄ Swap</button>
          </>}
          {selD!==null&&selB===null&&<>
            <span style={{fontSize:11,color:"#c0a860",flex:1}}>
              <strong style={{color:"#f0d060"}}>{fD[selD]?.name}</strong> selected from deck
            </span>
            <button onClick={()=>{onMoveToBinder(fD[selD]);setSelD(null);}} style={{background:"rgba(80,40,20,.5)",border:"1px solid #a06030",color:"#f0a050",padding:"6px 14px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>→ Move to Binder</button>
          </>}
          {selB!==null&&selD===null&&<>
            <span style={{fontSize:11,color:"#c0a860",flex:1}}>
              <strong style={{color:"#60c0f0"}}>{fB[selB]?.name}</strong> selected from binder
            </span>
            <button onClick={()=>{onMoveToDeck(fB[selB]);setSelB(null);}} style={{background:"rgba(20,60,30,.6)",border:"1px solid #408050",color:"#60e080",padding:"6px 14px",borderRadius:5,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>→ Add to Deck</button>
          </>}
          <button onClick={()=>{setSelD(null);setSelB(null);}} style={{background:"transparent",border:"1px solid #5a3020",color:"#806040",padding:"5px 10px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>✕</button>
        </div>}

        {/* Two-panel card grid */}
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",overflow:"hidden",minHeight:0}}>
          {/* Deck panel */}
          <div style={{borderRight:"1px solid rgba(180,160,60,.15)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 12px 6px",fontSize:10,fontFamily:"'Cinzel',serif",color:"#d0a040",fontWeight:700,borderBottom:"1px solid rgba(180,160,60,.08)",flexShrink:0}}>
              ⚔ DECK ({deck.length}) {fD.length!==deck.length&&`· showing ${fD.length}`}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start",scrollbarWidth:"thin"}}>
              {fD.map((c,i)=><DeckCardTile key={c.iid||i} c={c} selected={selD===i} onClick={()=>setSelD(selD===i?null:i)} side="deck"/>)}
              {!fD.length&&<div style={{fontSize:10,color:"#3a2810",fontStyle:"italic",padding:8}}>No cards match filter.</div>}
            </div>
          </div>
          {/* Binder panel */}
          <div style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 12px 6px",fontSize:10,fontFamily:"'Cinzel',serif",color:"#40a0d0",fontWeight:700,borderBottom:"1px solid rgba(180,160,60,.08)",flexShrink:0}}>
              📦 BINDER ({binder.length}) {fB.length!==binder.length&&`· showing ${fB.length}`}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start",scrollbarWidth:"thin"}}>
              {fB.map((c,i)=><DeckCardTile key={c.iid||i} c={c} selected={selB===i} onClick={()=>setSelB(selB===i?null:i)} side="binder"/>)}
              {!fB.length&&<div style={{fontSize:10,color:"#3a2810",fontStyle:"italic",padding:8}}>{binder.length===0?"Binder is empty.":"No cards match filter."}</div>}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div style={{padding:"8px 16px",borderTop:"1px solid rgba(180,160,60,.12)",fontSize:10,color:"#4a3820",fontStyle:"italic",flexShrink:0,textAlign:"center"}}>
          Click a card in one panel to select it · Select from both to swap · Select from one to move
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TITLE SCREEN
// ═══════════════════════════════════════════════════════════════
function TitleScreen({onStart}){
  const[col,setCol]=useState(null);const[name,setName]=useState("");const[step,setStep]=useState("intro");
  const meta={W:{label:"Order & Protection",hp:22,gold:40,flavor:"The light of justice guides your blade."},U:{label:"Control & Knowledge",hp:18,gold:50,flavor:"Knowledge is the mightiest spell of all."},B:{label:"Power & Sacrifice",hp:18,gold:35,flavor:"Power demands sacrifice — others' or yours."},R:{label:"Speed & Chaos",hp:20,gold:40,flavor:"Strike first. Strike hard. Ask questions never."},G:{label:"Growth & Might",hp:22,gold:30,flavor:"The land itself rises to answer your call."}};
  return(
    <div style={{minHeight:"100vh",background:"#050302",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",backgroundImage:"radial-gradient(ellipse at 50% 30%,rgba(80,40,10,.4) 0%,transparent 70%)"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,transparent,rgba(200,160,40,.6),transparent)"}}/>
      <div style={{textAlign:"center",maxWidth:620,padding:"0 20px"}}>
        <div style={{marginBottom:6,fontSize:11,letterSpacing:4,color:"rgba(180,140,40,.5)"}}>✦ ✦ ✦ MAGIC: THE GATHERING ✦ ✦ ✦</div>
        <h1 style={{fontSize:52,fontFamily:"'Cinzel Decorative',serif",color:"transparent",background:"linear-gradient(180deg,#f0d080,#8a6010)",WebkitBackgroundClip:"text",backgroundClip:"text",margin:"0 0 4px",lineHeight:1.1,letterSpacing:4}}>SHANDALAR</h1>
        <div style={{fontSize:13,color:"rgba(180,140,60,.5)",letterSpacing:3,marginBottom:36}}>MODERN EDITION · PHASE 4</div>
        {step==="intro"&&<div style={{animation:"fadeIn 1s ease-out"}}>
          <div style={{fontSize:14,color:"#8a7050",fontFamily:"'Crimson Text',serif",fontStyle:"italic",lineHeight:1.8,marginBottom:28,maxWidth:460,margin:"0 auto 28px"}}>The plane of Shandalar trembles. Five mages vie for dominion, and the planeswalker Arzakon waits beyond the barrier.<br/><br/>You are the last hope. Build your deck. Master the arcane. Seal the fate of Shandalar.</div>
          <button onClick={()=>setStep("choose")} style={{background:"linear-gradient(135deg,#1a1004,#2e1c08)",border:"2px solid rgba(200,160,40,.5)",color:"#f0c040",padding:"13px 46px",borderRadius:6,cursor:"pointer",fontSize:14,fontFamily:"'Cinzel',serif",letterSpacing:2}}>BEGIN YOUR JOURNEY</button>
        </div>}
        {step==="choose"&&<div style={{animation:"fadeIn .5s ease-out"}}>
          <div style={{fontSize:12,color:"#8a6040",marginBottom:16,fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>Choose the color of your magic.</div>
          <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:22}}>
            {COLORS.map(c=>{const m=meta[c];const hx=MHEX[c];const sel=col===c;return(
              <div key={c} onClick={()=>setCol(c)} style={{width:100,padding:"14px 8px",cursor:"pointer",background:sel?`${hx}18`:"rgba(255,255,255,.02)",border:`2px solid ${sel?hx:"rgba(255,255,255,.08)"}`,borderRadius:8,boxShadow:sel?`0 0 16px ${hx}50`:"none",transition:"all .2s",transform:sel?"translateY(-4px)":"none"}}>
                <div style={{fontSize:26,marginBottom:6}}>{MSYM[c]}</div>
                <div style={{fontSize:11,fontFamily:"'Cinzel',serif",color:sel?hx:"#6a5030",marginBottom:3}}>{["White","Blue","Black","Red","Green"][COLORS.indexOf(c)]}</div>
                <div style={{fontSize:8,color:"#5a4020",lineHeight:1.4}}>{m.label}</div>
                <div style={{marginTop:6,fontSize:9,color:sel?hx:"#4a3010"}}>♥{m.hp} ⚙{m.gold}g</div>
              </div>
            );})}
          </div>
          {col&&<div style={{marginBottom:14,fontStyle:"italic",fontSize:12,color:"#a09060",fontFamily:"'Crimson Text',serif"}}>"{meta[col].flavor}"</div>}
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button onClick={()=>setStep("intro")} style={{background:"transparent",border:"1px solid #3a2810",color:"#6a4820",padding:"8px 18px",borderRadius:5,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif"}}>← Back</button>
            <button disabled={!col} onClick={()=>setStep("name")} style={{background:col?"linear-gradient(135deg,#1a1004,#2e1c08)":"rgba(0,0,0,.3)",border:`1px solid ${col?MHEX[col]:"#2a1804"}`,color:col?MHEX[col]:"#3a2810",padding:"9px 26px",borderRadius:5,cursor:col?"pointer":"not-allowed",fontSize:12,fontFamily:"'Cinzel',serif"}}>Name Your Wizard →</button>
          </div>
        </div>}
        {step==="name"&&col&&<div style={{animation:"fadeIn .5s ease-out"}}>
          <div style={{fontSize:12,color:"#8a6040",marginBottom:14,fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>What is the name by which you shall be known in Shandalar?</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your wizard's name…" maxLength={24} style={{background:"rgba(0,0,0,.5)",border:"1px solid rgba(200,160,40,.4)",color:"#f0d080",padding:"10px 16px",borderRadius:6,fontSize:15,fontFamily:"'Cinzel',serif",width:280,outline:"none",marginBottom:18,letterSpacing:1}} onKeyDown={e=>e.key==="Enter"&&onStart({color:col,name:name.trim()||`The ${["White","Blue","Black","Red","Green"][COLORS.indexOf(col)]} Mage`,seed:Date.now()})}/>
          <br/>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button onClick={()=>setStep("choose")} style={{background:"transparent",border:"1px solid #3a2810",color:"#6a4820",padding:"8px 18px",borderRadius:5,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif"}}>← Back</button>
            <button onClick={()=>onStart({color:col,name:name.trim()||`The ${["White","Blue","Black","Red","Green"][COLORS.indexOf(col)]} Mage`,seed:Date.now()})} style={{background:`linear-gradient(135deg,${MHEX[col]}20,${MHEX[col]}10)`,border:`2px solid ${MHEX[col]}`,color:MHEX[col],padding:"11px 30px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"'Cinzel',serif",letterSpacing:2}}>✦ Enter Shandalar</button>
          </div>
        </div>}
      </div>
      <div style={{position:"absolute",bottom:18,fontSize:10,color:"rgba(100,80,40,.4)",letterSpacing:2}}>ALPHA–FOURTH EDITION · CLASSIC RULES · FULL INTEGRATION</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN GAME  — overworld + integrated duel engine
// ═══════════════════════════════════════════════════════════════
function Game({startConfig,onQuit,onScore}){
  const mapData=useMemo(()=>generateMap(startConfig.seed),[]);
  const[tiles,setTiles]=useState(mapData.tiles);
  const[pos,setPos]=useState({x:mapData.sx,y:mapData.sy});
  // Viewport is always centered on player — computed from pos, no manual state needed
  // mapContainerRef used to measure actual tile-visible area dynamically
  const mapContainerRef=useRef(null);
  const[moves,setMoves]=useState(0);
  const sd=START_DECKS[startConfig.color];
  const[player,setPlayer]=useState({name:startConfig.name,color:startConfig.color,hp:sd.hp,maxHP:sd.maxHP,gold:sd.gold,gems:0});
  const[deck,setDeck]=useState(()=>sd.deckIds.map(id=>{const d=cDef(id);return d?{...d,iid:mkId()}:null;}).filter(Boolean));
  const[binder,setBinder]=useState([]);
  const[artifacts,setArtifacts]=useState([...OW_ARTS]);
  const[manaLinks,setManaLinks]=useState({W:0,U:0,B:0,R:0,G:0});
  const[magesDefeated,setMagesDefeated]=useState([]);
  const[mlEvents,setMlEvents]=useState([]);
  const[log,setLog]=useState([{text:`${startConfig.name} enters the plane of Shandalar.`,type:"info"}]);
  const[modal,setModal]=useState(null);
  const[activeTile,setActiveTile]=useState(null);
  // Duel integration state
  const[duelCfg,setDuelCfg]=useState(null);
  const[dungeonProg,setDungeonProg]=useState(null);
  const[anteEnabled,setAnteEnabled]=useState(false);
  const[ruleset,setRuleset]=useState(RULESETS.CLASSIC);
  const[dungeonsCleared,setDungeonsCleared]=useState(0);
  const[townsSaved,setTownsSaved]=useState(0);
  const[manaLinksTotal,setManaLinksTotal]=useState(0);
  const[arzakonDefeated,setArzakonDefeated]=useState(false);

  const addLog=useCallback((text,type="info")=>setLog(p=>[...p.slice(-80),{text,type}]),[]);
  const hasBoots=artifacts.some(a=>a.id==="boots"&&a.owned);
  const hasWard=artifacts.some(a=>a.id==="ward"&&a.owned);
  const mlThreshold=hasWard?5:3;

  // ── DUEL LAUNCH HELPERS ──────────────────────────────────────
  const launchDuel=useCallback((oppArchKey,overworldHP,context,castleMod=null,extraData={})=>{
    setDuelCfg({pDeckIds:deck.map(c=>c.id).filter(Boolean),oppArchKey,ruleset,overworldHP,castleMod,anteEnabled,context,...extraData});
  },[deck,ruleset,anteEnabled]);

  // ── DUEL OUTCOME HANDLER ─────────────────────────────────────
  const handleDuelEnd=useCallback((outcome,duelState)=>{
    const won=outcome==="win";
    const finalHP=duelState?.p?.life??1;
    const ctx=duelCfg?.context;

    if(ctx==="arzakon"){
      if(won){
        setArzakonDefeated(true);
        setPlayer(p=>({...p,hp:Math.max(1,finalHP),gold:p.gold+500,gems:p.gems+10}));
        addLog("✦✦✦ Arzakon is defeated! Shandalar is saved! ✦✦✦","success");
      }else{
        setPlayer(p=>({...p,hp:Math.max(1,finalHP)}));
        addLog("Arzakon repels you. The fight continues...","danger");
      }
      setDuelCfg(null);
      return;
    }

    // Ante resolution
    if(anteEnabled&&duelState?.anteP&&duelState?.anteO){
      if(won){setBinder(b=>[...b,{...duelState.anteO,iid:mkId()}]);addLog(`Ante claimed: ${duelState.anteO.name}!`,"success");}
      else{const anteLostId=duelState.anteP.id;setDeck(d=>d.filter((c,i)=>i!==d.findIndex(x=>x.id===anteLostId)));addLog(`Ante lost: ${duelState.anteP.name}.`,"danger");}
    }

    if(ctx==="monster"){
      if(won){
        const gold=5+Math.floor(Math.random()*15);
        setPlayer(p=>({...p,hp:Math.max(1,finalHP),gold:p.gold+gold}));
        const arch=ARCHETYPES[duelCfg.oppArchKey];
        const pool=CARD_DB.filter(c=>c.color===arch.color&&!isLand(c));
        if(pool.length){const reward={...pool[Math.floor(Math.random()*pool.length)],iid:mkId()};setBinder(b=>[...b,reward]);addLog(`Victory! +${gold}g and ${reward.name}.`,"success");}
        else addLog(`Victory! +${gold}g.`,"success");
      }else{
        setPlayer(p=>({...p,hp:Math.max(1,finalHP)}));
        addLog(`Defeated. HP → ${Math.max(1,finalHP)}.`,"danger");
      }
    }else if(ctx==="castle"){
      const col=duelCfg.castleColor;
      if(won){
        setMagesDefeated(prev=>[...prev,col]);
        setTiles(prev=>{const n=prev.map(r=>[...r]);if(activeTile)n[activeTile.y][activeTile.x]={...n[activeTile.y][activeTile.x],castleData:{...n[activeTile.y][activeTile.x].castleData,defeated:true}};return n;});
        setPlayer(p=>({...p,hp:Math.max(1,finalHP),gold:p.gold+100,gems:p.gems+3}));
        const artId=ART_REWARD[col];setArtifacts(prev=>prev.map(a=>a.id===artId?{...a,owned:true}:a));
        const artName=OW_ARTS.find(a=>a.id===artId)?.name||"artifact";
        addLog(`✦ ${MAGE_N[col]} defeated! The ${artName} is yours. +100g +3◆`,"success");
      }else{
        const dmg=Math.floor(player.maxHP*.3);setPlayer(p=>({...p,hp:Math.max(1,p.hp-dmg)}));
        addLog(`${MAGE_N[col]} repels you. –${dmg} HP.`,"danger");
      }
    }else if(ctx==="dungeon"){
      const prog=dungeonProg;
      if(won){
        const gold=15+Math.floor(Math.random()*25)+prog.room*10;
        setPlayer(p=>({...p,hp:Math.max(1,finalHP),gold:p.gold+gold}));
        const nextRoom=prog.room+1;
        if(nextRoom<prog.totalRooms){
          addLog(`Room ${nextRoom} cleared! HP:${Math.max(1,finalHP)} +${gold}g — deeper rooms await…`,"success");
          setDungeonProg({...prog,room:nextRoom,entryHP:Math.max(1,finalHP)});
          // Launch next room immediately
          const nextArch=DUNGEON_ARCHS[Math.floor(Math.random()*DUNGEON_ARCHS.length)];
          setDuelCfg({pDeckIds:deck.map(c=>c.id).filter(Boolean),oppArchKey:nextArch,ruleset,overworldHP:Math.max(1,finalHP),castleMod:prog.mod,anteEnabled,context:"dungeon"});
          return; // don't clear duelCfg yet; the new config replaces it
        }else{
          // Final room complete — grant loot
          const loot=prog.tile?.dungeonData?.loot||[];
          if(loot.length){const reward={...loot[Math.floor(Math.random()*loot.length)],iid:mkId()};setBinder(b=>[...b,reward]);addLog(`Dungeon conquered! Found ${reward.name}. +${gold}g`,"success");}
          else addLog(`Dungeon conquered! +${gold}g`,"success");
          setDungeonProg(null);
        }
      }else{
        setPlayer(p=>({...p,hp:Math.max(1,finalHP)}));
        addLog(`Fallen in the dungeon. HP → ${Math.max(1,finalHP)}.`,"danger");
        setDungeonProg(null);
      }
    }
    setDuelCfg(null);
  },[duelCfg,dungeonProg,activeTile,anteEnabled,player.maxHP,deck,ruleset]);

  // ── MOVEMENT ────────────────────────────────────────────────
  const doMove=useCallback((nx,ny)=>{
    const t=tiles[ny]?.[nx];if(!t||t.terrain===TERRAIN.WATER)return;
    const nm=moves+1;setMoves(nm);
    // Reveal around new pos
    setTiles(prev=>{const n=prev.map(r=>[...r]);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(n[ny+dy]?.[nx+dx])n[ny+dy][nx+dx]={...n[ny+dy][nx+dx],revealed:true};return n;});
    setPos({x:nx,y:ny}); // viewport auto-centers on pos (computed in render)
    // Hunger
    if(nm%15===0){setPlayer(p=>({...p,gold:Math.max(0,p.gold-8)}));addLog("You pay 8g for food and supplies.","warn");}
    // Tick ML events
    setMlEvents(prev=>prev.map(e=>({...e,movesLeft:e.movesLeft-1})).filter(e=>{
      if(e.movesLeft<=0){
        setManaLinks(ml=>({...ml,[e.color]:Math.min(5,(ml[e.color]||0)+1)}));
        addLog(`⚠ ${MAGE_N[e.color]} establishes a mana link at ${e.townName}!`,"danger");
        setManaLinksTotal(t=>t+1);
        setTiles(prev=>{const n=prev.map(r=>[...r]);if(n[e.ty]?.[e.tx])n[e.ty][e.tx]={...n[e.ty][e.tx],manaLink:e.color};return n;});
        return false;
      }return true;
    }));
    // New ML event
    if(nm>5&&nm%12===0&&Math.random()>.42){
      const alive=COLORS.filter(c=>!magesDefeated.includes(c));
      if(alive.length){const col=alive[Math.floor(Math.random()*alive.length)];
        const towns=[];tiles.forEach(row=>row.forEach(tt=>{if(tt.structure==="TOWN"&&tt.townData&&!tt.manaLink)towns.push(tt);}));
        if(towns.length){const tgt=towns[Math.floor(Math.random()*towns.length)];
          const mnms={W:["Holy Crusader","Serra's Knight"],U:["Tidal Phantom","Xylos's Agent"],B:["Skeletal Minion","Mortis's Shade"],R:["Goblin Horde","Karag's Raider"],G:["Vine Elemental","Sylvara's Chosen"]};
          const mn=mnms[col][Math.floor(Math.random()*2)];
          setMlEvents(prev=>[...prev,{id:Date.now(),color:col,minionName:mn,townName:tgt.townData.name,tx:tgt.x,ty:tgt.y,movesLeft:10}]);
          addLog(`🚨 ${MAGE_N[col]} sends ${mn} to seize ${tgt.townData.name}!`,"danger");
        }
      }
    }
    // Structure interaction
    if(t.structure){
      const freshTile=tiles[ny]?.[nx];const tileWithReveal={...freshTile,revealed:true};setActiveTile(tileWithReveal);
      if(t.structure==="TOWN"){addLog(`You arrive at ${t.townData.name}.`,"info");setModal("town");return;}
      if(t.structure==="DUNGEON"){addLog(`The entrance to ${t.dungeonData.name} looms before you.`,"event");setModal("dungeon");return;}
      if(t.structure==="CASTLE"){addLog(`You approach ${t.castleData.mage}'s stronghold.`,"event");setModal("castle");return;}
    }
    // Random encounter
    if(t.terrain!==TERRAIN.WATER&&Math.random()<t.encChance){
      const mList=MONSTER_TABLE[t.terrain.id]||MONSTER_TABLE.PLAINS;
      const tier=nm<20?1:nm<60?Math.random()>.5?2:1:2;
      const monster={...mList[Math.min(tier-1,mList.length-1)],tier};
      addLog(`⚔ A ${monster.name} blocks your path!`,"danger");
      launchDuel(monster.archKey,player.hp,"monster");
    }
  },[tiles,moves,magesDefeated,player.hp,launchDuel,addLog]);

  const handleTileClick=useCallback((tile)=>{
    if(!tile.revealed||tile.terrain===TERRAIN.WATER)return;
    if(tile.x===pos.x&&tile.y===pos.y)return;
    const path=bfs(tiles,pos.x,pos.y,tile.x,tile.y);
    if(!path||!path.length){addLog("No path to that location.","warn");return;}
    doMove(path[0].x,path[0].y);
  },[tiles,pos,doMove,addLog]);

  // ── TOWN ACTIONS ────────────────────────────────────────────
  const handleBuy=useCallback((card,price)=>{
    if(player.gold<price){addLog("Not enough gold.","warn");return;}
    setPlayer(p=>({...p,gold:p.gold-price}));
    setBinder(b=>[...b,{...card,iid:mkId()}]);
    addLog(`Purchased ${card.name} for ${price}g. Added to binder.`,"success");
  },[player.gold,addLog]);

  const handleSell=useCallback((card,price)=>{
    setBinder(b=>b.filter(c=>c.iid!==card.iid));
    setPlayer(p=>({...p,gold:p.gold+price}));
    addLog(`Sold ${card.name} for ${price}g.`,"success");
  },[addLog]);

  const handleRest=useCallback((cost)=>{
    setPlayer(p=>({...p,hp:p.maxHP,gold:p.gold-cost}));
    addLog(`Rested at the inn — full HP restored. –${cost}g.`,"success");
  },[]);

  const handleSage=useCallback(()=>{
    if(player.gold<25)return;setPlayer(p=>({...p,gold:p.gold-25}));
    const dgs=[];tiles.forEach(row=>row.forEach(t=>{if(t.structure==="DUNGEON"&&!t.revealed)dgs.push(t);}));
    if(dgs.length){const d=dgs[Math.floor(Math.random()*dgs.length)];setTiles(prev=>{const n=prev.map(r=>[...r]);n[d.y][d.x]={...n[d.y][d.x],revealed:true};return n;});addLog(`The sage reveals ${d.dungeonData.name}. –25g`,"success");}
    else addLog("No unknown dungeons remain to reveal.","info");
  },[player.gold,tiles]);

  const handleTrade=useCallback((rarity)=>{
    if(rarity==="C"){
      const commons=binder.filter(c=>c.rarity==="C");if(commons.length<3){addLog("Need 3 commons to trade.","warn");return;}
      const rm=commons.slice(0,3);const pool=CARD_DB.filter(c=>c.rarity==="U"&&!isLand(c));if(!pool.length)return;
      const reward={...pool[Math.floor(Math.random()*pool.length)],iid:mkId()};
      setBinder(b=>[...b.filter(c=>!rm.find(r=>r.iid===c.iid)),reward]);addLog(`Traded 3 commons → ${reward.name}.`,"success");
    }else{
      const uncs=binder.filter(c=>c.rarity==="U");if(uncs.length<5){addLog("Need 5 uncommons to trade.","warn");return;}
      const rm=uncs.slice(0,5);const pool=CARD_DB.filter(c=>c.rarity==="R"&&!isLand(c));if(!pool.length)return;
      const reward={...pool[Math.floor(Math.random()*pool.length)],iid:mkId()};
      setBinder(b=>[...b.filter(c=>!rm.find(r=>r.iid===c.iid)),reward]);addLog(`Traded 5 uncommons → ${reward.name}.`,"success");
    }
  },[binder,addLog]);

  const handleSwap=useCallback((dc,bc)=>{
    setDeck(d=>d.map(c=>c.iid===dc.iid?{...bc,iid:dc.iid}:c));
    setBinder(b=>b.map(c=>c.iid===bc.iid?{...dc,iid:bc.iid}:c));
    addLog(`Swapped ${dc.name} ↔ ${bc.name}.`,"info");
  },[]);

  const handleMoveToDeck=useCallback((card)=>{
    setBinder(b=>b.filter(c=>c.iid!==card.iid));
    setDeck(d=>[...d,{...card,iid:card.iid||mkId()}]);
    addLog(`Added ${card.name} to deck.`,"info");
  },[]);

  const handleMoveToBinder=useCallback((card)=>{
    setDeck(d=>d.filter(c=>c.iid!==card.iid));
    setBinder(b=>[...b,{...card,iid:card.iid||mkId()}]);
    addLog(`Moved ${card.name} to binder.`,"info");
  },[]);

  const handleChallenge=useCallback(()=>{
    const col=activeTile?.castleData?.color;if(!col||activeTile.castleData.defeated)return;
    addLog(`⚔ You challenge ${MAGE_N[col]}! Castle modifier: ${CASTLE_MOD[col].name}.`,"event");
    setModal(null);
    launchDuel(MAGE_A[col],player.hp,"castle",CASTLE_MOD[col],{castleColor:col});
  },[activeTile,player.hp,launchDuel,addLog]);

  const handleEnterDungeon=useCallback(()=>{
    const dg=activeTile?.dungeonData;if(!dg)return;
    addLog(`You descend into ${dg.name}. Modifier: ${dg.mod.name}.`,"event");
    const prog={tile:activeTile,room:0,totalRooms:dg.rooms,mod:dg.mod,entryHP:player.hp};
    setDungeonProg(prog);setModal(null);
    launchDuel(DUNGEON_ARCHS[Math.floor(Math.random()*DUNGEON_ARCHS.length)],player.hp,"dungeon",dg.mod);
  },[activeTile,player.hp,launchDuel,addLog]);

  // Win/lose checks
  const allMagesDown=magesDefeated.length===5;
  const gameWon=allMagesDown&&arzakonDefeated;
  const arzakonReady=allMagesDown&&!arzakonDefeated&&!duelCfg;
  const gameLost=COLORS.some(c=>manaLinks[c]>=mlThreshold&&!magesDefeated.includes(c));

  const launchArzakon=()=>{
    addLog("⚡ Arzakon manifests! The final battle begins!","danger");
    setDuelCfg({
      pDeckIds:deck.map(c=>c.id).filter(Boolean),
      oppArchKey:"FIVE_COLOR_BOMB",
      ruleset,
      overworldHP:ruleset.startingLife, // Full HP reset for Arzakon
      castleMod:{name:"Dominion",desc:"Arzakon commands all five colors. The final battle for Shandalar begins."},
      anteEnabled:false,
      context:"arzakon",
    });
  };

  // ── RENDER DUEL IF ACTIVE ────────────────────────────────────
  if(duelCfg){
    return <DuelScreen key={JSON.stringify(duelCfg)} config={duelCfg} onDuelEnd={handleDuelEnd}/>;
  }

  // Dynamically compute how many tiles fit based on container size
  // TSIZ+1 = tile size + gap. Fall back to reasonable defaults.
  const viewW=Math.min(MAP_W,18);const viewH=Math.min(MAP_H,14);
  // Always center viewport on player
  const viewport={
    x:Math.max(0,Math.min(MAP_W-viewW,pos.x-Math.floor(viewW/2))),
    y:Math.max(0,Math.min(MAP_H-viewH,pos.y-Math.floor(viewH/2))),
  };

  return(
    <div style={{minHeight:"100vh",background:"#050302",color:"#c0b090",fontFamily:"'Crimson Text',serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Win/Lose overlays */}
      {gameWon&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.95)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,backgroundImage:"radial-gradient(ellipse at 50% 30%,rgba(120,80,10,.6) 0%,transparent 60%)"}}>
        <div style={{textAlign:"center",maxWidth:520}}>
          <div style={{fontSize:52,marginBottom:16,filter:"drop-shadow(0 0 20px #f0d060)"}}>✦</div>
          <div style={{fontSize:30,fontFamily:"'Cinzel Decorative',serif",color:"#f0d060",marginBottom:8,textShadow:"0 0 30px rgba(240,208,96,.5)"}}>Shandalar is Saved!</div>
          <div style={{fontSize:14,color:"#c0b070",fontFamily:"'Crimson Text',serif",marginBottom:8,fontStyle:"italic"}}>{player.name} has defeated Arzakon and all five mages.</div>
          <div style={{fontSize:12,color:"#806040",fontFamily:"'Crimson Text',serif",marginBottom:28}}>The barrier holds. The plane endures — for now.</div>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button onClick={()=>onScore&&onScore({playerName:player.name,playerColor:player.color,magesDefeated,dungeonsCleared,townsSaved,collection:[...deck,...binder],manaLinksEstablished:manaLinksTotal,won:true})} style={{background:"linear-gradient(135deg,#1a1404,#2e2008)",border:"2px solid rgba(200,160,40,.6)",color:"#f0c040",padding:"12px 28px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:1}}>📊 View Score</button>
            <button onClick={onQuit} style={{background:"transparent",border:"1px solid rgba(150,100,40,.5)",color:"#a08040",padding:"12px 22px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12}}>Return to Title</button>
          </div>
        </div>
      </div>}

      {/* Arzakon challenge overlay — appears after all 5 mages down */}
      {arzakonReady&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,backgroundImage:"radial-gradient(ellipse at 50% 40%,rgba(120,0,180,.4) 0%,transparent 60%)"}}>
        <div style={{textAlign:"center",maxWidth:500}}>
          <div style={{fontSize:48,marginBottom:12,animation:"arzakonPulse 2s infinite"}}>⚡</div>
          <div style={{fontSize:11,color:"#cc88ff",fontFamily:"'Cinzel',serif",letterSpacing:3,marginBottom:8}}>THE BARRIER CRACKS</div>
          <div style={{fontSize:26,fontFamily:"'Cinzel Decorative',serif",color:"#dd88ff",marginBottom:12,textShadow:"0 0 20px rgba(200,100,255,.6)"}}>Arzakon Manifests</div>
          <div style={{fontSize:13,color:"#c0a0d0",fontFamily:"'Crimson Text',serif",marginBottom:8,fontStyle:"italic",lineHeight:1.7}}>All five mages are defeated. The planeswalker Arzakon tears through the weakened barrier. This is the final battle for the soul of Shandalar.</div>
          <div style={{background:"rgba(100,20,120,.3)",border:"1px solid rgba(200,100,255,.3)",borderRadius:8,padding:"10px 16px",marginBottom:20,fontSize:12,color:"#cc88ff",fontFamily:"'Cinzel',serif"}}>
            <strong>DOMINION MODIFIER:</strong> Arzakon wields all five colors. Your HP is restored to {ruleset.startingLife}.
          </div>
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <button onClick={launchArzakon} style={{background:"linear-gradient(135deg,#2a0840,#4a1060)",border:"2px solid rgba(200,100,255,.6)",color:"#ee88ff",padding:"14px 32px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:1,boxShadow:"0 0 20px rgba(160,40,200,.3)"}}>⚔ Face Arzakon</button>
            <button onClick={()=>{addLog("You explore the overworld before the final battle.","info");}} style={{background:"transparent",border:"1px solid rgba(150,80,180,.4)",color:"#9060c0",padding:"14px 22px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12}}>Prepare First</button>
          </div>
        </div>
      </div>}
      {gameLost&&<div style={{position:"fixed",inset:0,background:"rgba(20,0,0,.94)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:14}}>💀</div><div style={{fontSize:22,fontFamily:"'Cinzel',serif",color:"#e03030",marginBottom:8}}>Shandalar Falls</div><div style={{fontSize:12,color:"#a06050",fontFamily:"'Crimson Text',serif",marginBottom:22,fontStyle:"italic"}}>Arzakon's ritual completes. The barrier crumbles.<br/>The plane of Shandalar is lost.</div><button onClick={onQuit} style={{background:"transparent",border:"2px solid rgba(200,60,40,.5)",color:"#e06040",padding:"9px 26px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:12}}>Accept Defeat</button></div>
      </div>}
      {/* Top bar */}
      <div style={{padding:"6px 14px",borderBottom:"1px solid rgba(200,160,60,.2)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,.4)",flexShrink:0}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:"#c09040"}}>✦ {player.name} &nbsp;·&nbsp; <Pip sym={player.color} size={12}/> <span style={{fontSize:10,color:"#6a5020"}}>{["White","Blue","Black","Red","Green"][COLORS.indexOf(player.color)]} Mage</span></div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {/* Ruleset picker */}
          <select value={ruleset.id} onChange={e=>setRuleset(RULESETS[e.target.value])} style={{background:"rgba(0,0,0,.6)",border:"1px solid rgba(180,140,40,.3)",color:"#a08040",padding:"3px 6px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>
            {Object.values(RULESETS).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label style={{fontSize:10,color:"#806040",fontFamily:"'Cinzel',serif",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
            <input type="checkbox" checked={anteEnabled} onChange={e=>setAnteEnabled(e.target.checked)} style={{accentColor:"#f0c040"}}/>Ante
          </label>
          <button onClick={()=>setModal("deck")} style={{background:"transparent",border:"1px solid rgba(180,140,40,.3)",color:"#a08040",padding:"3px 10px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>📖 Deck ({deck.length})</button>
          <button onClick={onQuit} style={{background:"transparent",border:"1px solid rgba(180,80,40,.3)",color:"#a06040",padding:"3px 10px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>✕ Quit</button>
        </div>
      </div>
      <HUDBar player={player} manaLinks={manaLinks} magesDefeated={magesDefeated} artifacts={artifacts} moves={moves}/>
      {/* Main */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Map */}
        <div style={{flex:1,position:"relative",overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${viewW},${TSIZ}px)`,gridTemplateRows:`repeat(${viewH},${TSIZ}px)`,gap:1,padding:8,background:"#080604"}}>
            {Array.from({length:viewH},(_,vy)=>Array.from({length:viewW},(_2,vx)=>{
              const x=viewport.x+vx,y=viewport.y+vy;const tile=tiles[y]?.[x];
              if(!tile)return <div key={`${vx}-${vy}`} style={{width:TSIZ,height:TSIZ,background:"#030202"}}/>;
              return <OWTile key={`${x}-${y}`} tile={tile} isPlayer={x===pos.x&&y===pos.y} onClick={handleTileClick}/>;
            }))}
          </div>
          {/* No manual scroll — map always centers on player 🧙 */}
          {/* Mana link alerts */}
          {mlEvents.slice(0,1).map(ev=>{const hx=MHEX[ev.color];return(
            <div key={ev.id} style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",zIndex:100,background:`linear-gradient(135deg,#1a0808,${hx}20)`,border:`2px solid ${hx}`,borderRadius:7,padding:"10px 16px",maxWidth:430,boxShadow:`0 0 20px ${hx}60`,animation:"alertDrop .3s ease-out"}}>
              <div style={{fontSize:11,fontFamily:"'Cinzel',serif",color:hx,marginBottom:4,letterSpacing:1}}>{MSYM[ev.color]} MANA LINK ALERT</div>
              <div style={{fontSize:12,color:"#e0c090",marginBottom:8}}><strong>{MAGE_N[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>! <strong style={{color:"#ff8040"}}>{ev.movesLeft} moves</strong> remaining.</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>{setMlEvents(p=>p.filter(e=>e.id!==ev.id));setTownsSaved(t=>t+1);addLog(`Rushing to defend ${ev.townName}!`,"event");}} style={{flex:2,background:`${hx}20`,border:`1px solid ${hx}`,color:hx,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>⚔ Rush to {ev.townName}</button>
                <button onClick={()=>setMlEvents(p=>p.filter(e=>e.id!==ev.id))} style={{flex:1,background:"transparent",border:"1px solid #5a3020",color:"#806040",padding:"5px",borderRadius:4,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:10}}>Ignore</button>
              </div>
            </div>
          );})}
          {/* Legend */}
          <div style={{position:"absolute",top:8,left:8,zIndex:10,background:"rgba(0,0,0,.75)",borderRadius:6,padding:"8px 12px",border:"1px solid rgba(200,160,60,.2)",fontSize:10,color:"#8a7050",fontFamily:"'Cinzel',serif"}}>
            <div style={{marginBottom:4,fontSize:9,color:"#6a5030",letterSpacing:1}}>LEGEND</div>
            {[["🧙","You"],["⌂","Town"],["⚑","Dungeon"],["♔","Castle"]].map(([ic,lb])=><div key={lb} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><span style={{fontSize:12}}>{ic}</span>{lb}</div>)}
          </div>
          {/* Mage status */}
          <div style={{position:"absolute",top:8,right:8,zIndex:10,background:"rgba(0,0,0,.75)",borderRadius:6,padding:"8px 12px",border:"1px solid rgba(200,160,60,.2)",fontSize:10,fontFamily:"'Cinzel',serif"}}>
            <div style={{fontSize:9,color:"#6a5030",letterSpacing:1,marginBottom:6}}>FIVE MAGES</div>
            {COLORS.map(c=>{const def=magesDefeated.includes(c);const lnk=manaLinks[c]||0;return(
              <div key={c} style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                <Pip sym={c} size={11}/>
                <span style={{color:def?"#405030":lnk>=mlThreshold?"#e02020":lnk>=mlThreshold-1?"#e08020":"#a09070",fontSize:10}}>{MAGE_N[c]}</span>
                <span style={{color:"#6a5030",fontSize:9}}>{def?"✓":lnk+"/"+mlThreshold}</span>
              </div>
            );})}
          </div>
          {/* Dungeon progress bar */}
          {dungeonProg&&<div style={{position:"absolute",bottom:50,left:"50%",transform:"translateX(-50%)",background:"rgba(60,20,0,.85)",border:"1px solid rgba(200,120,40,.5)",borderRadius:6,padding:"6px 14px",fontSize:10,color:"#f0a040",fontFamily:"'Cinzel',serif",zIndex:50}}>
            ⚑ Dungeon Room {dungeonProg.room+1} / {dungeonProg.totalRooms} &nbsp;·&nbsp; Modifier: {dungeonProg.mod.name}
          </div>}
        </div>
        {/* Sidebar */}
        <div style={{width:228,borderLeft:"1px solid rgba(200,160,60,.2)",display:"flex",flexDirection:"column",background:"rgba(0,0,0,.25)",overflow:"hidden"}}>
          {/* Current tile info */}
          <div style={{padding:"8px 12px",borderBottom:"1px solid rgba(200,160,60,.15)"}}>
            <div style={{fontSize:10,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:5,letterSpacing:1}}>CURRENT TILE</div>
            {(()=>{const t=tiles[pos.y]?.[pos.x];if(!t)return null;return(<div>
              <div style={{fontSize:13,color:"#c0a060",fontFamily:"'Cinzel',serif"}}>{t.structure==="TOWN"?t.townData?.name:t.structure==="CASTLE"?t.castleData?.mage+"'s stronghold":t.structure==="DUNGEON"?t.dungeonData?.name:t.terrain.label}</div>
              <div style={{fontSize:10,color:"#6a5020",marginTop:3}}>Cost: {Math.max(1,hasBoots?t.terrain.moveC-1:t.terrain.moveC)} move{t.terrain.moveC!==1?"s":""}</div>
            </div>);})()}
          </div>
          {/* Deck preview */}
          <div style={{padding:"8px 12px",borderBottom:"1px solid rgba(200,160,60,.15)"}}>
            <div style={{fontSize:10,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:5,letterSpacing:1}}>DECK ({deck.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>
              {deck.slice(0,10).map((c,i)=><div key={i} style={{background:CCOLOR[c.color]?`${CCOLOR[c.color]}30`:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:3,padding:"2px 5px",fontSize:8,color:"#a09060"}} title={c.name}>{c.name.slice(0,10)}</div>)}
              {deck.length>10&&<div style={{fontSize:8,color:"#6a5020"}}>+{deck.length-10}…</div>}
            </div>
            <div style={{fontSize:10,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:4}}>BINDER ({binder.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
              {binder.slice(-8).map((c,i)=><div key={i} style={{width:9,height:13,borderRadius:1,background:CCOLOR[c.color]||"#888",opacity:.7}} title={c.name}/>)}
              {binder.length>8&&<div style={{fontSize:8,color:"#6a5020"}}>+{binder.length-8}</div>}
            </div>
          </div>
          {/* Log */}
          <div style={{flex:1,padding:"8px 12px",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <div style={{fontSize:10,color:"#8a6030",fontFamily:"'Cinzel',serif",letterSpacing:1}}>CHRONICLE</div>
              <button onClick={()=>{
                const txt=log.map(e=>`[${e.type.toUpperCase()}] ${e.text}`).join('\n');
                navigator.clipboard?.writeText(txt).then(()=>addLog("Log copied to clipboard.","info")).catch(()=>addLog("Clipboard unavailable.","warn"));
              }} style={{background:"transparent",border:"1px solid rgba(150,120,60,.3)",color:"#806040",padding:"2px 7px",borderRadius:3,cursor:"pointer",fontSize:9,fontFamily:"'Cinzel',serif"}} title="Copy chronicle to clipboard">📋</button>
            </div>
            <OWLog log={log}/>
          </div>
        </div>
      </div>
      {/* Modals */}
      {modal==="town"&&activeTile?.townData&&<TownModal town={activeTile.townData} player={player} binder={binder} gems={player.gems} onClose={()=>setModal(null)} onBuy={handleBuy} onSell={handleSell} onRest={handleRest} onSage={handleSage} onTrade={handleTrade} onGemBuy={(type)=>{
        if(type==="rare"){const pool=CARD_DB.filter(c=>c.rarity==="R"&&!isLand(c));if(pool.length){const r={...pool[Math.floor(Math.random()*pool.length)],iid:mkId()};setBinder(b=>[...b,r]);setPlayer(p=>({...p,gems:p.gems-3}));addLog(`Gem merchant: received ${r.name}. –3◆`,"success");}}
        else if(type==="hp"){setPlayer(p=>({...p,maxHP:p.maxHP+5,hp:p.hp+5,gems:p.gems-5}));addLog("Max HP +5. –5◆","success");}
        else if(type==="heal"){setPlayer(p=>({...p,hp:p.maxHP,gems:p.gems-2}));addLog("Fully healed. –2◆","success");}
      }}/>}
      {modal==="dungeon"&&activeTile?.dungeonData&&<DungeonModal dungeon={activeTile.dungeonData} onClose={()=>setModal(null)} onEnter={handleEnterDungeon}/>}
      {modal==="castle"&&activeTile?.castleData&&<CastleModal castleData={activeTile.castleData} onClose={()=>setModal(null)} onChallenge={handleChallenge}/>}
      {modal==="deck"&&<DeckManager deck={deck} binder={binder} onClose={()=>setModal(null)} onSwap={handleSwap} onMoveToDeck={handleMoveToDeck} onMoveToBinder={handleMoveToBinder}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App(){
  const[screen,setScreen]=useState("title");
  const[cfg,setCfg]=useState(null);
  const[scoreData,setScoreData]=useState(null);
  if(screen==="score"&&scoreData)return <ScoreScreen stats={scoreData} onNewGame={()=>{setScreen("title");setScoreData(null);}} onContinue={()=>setScreen("title")}/>;
  if(screen==="game"&&cfg)return <Game startConfig={cfg} onQuit={()=>setScreen("title")} onScore={data=>{setScoreData(data);setScreen("score");}}/>;
  return <TitleScreen onStart={c=>{setCfg(c);setScreen("game");}}/>;
}
