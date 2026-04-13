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
  WHITE_WEENIE:{name:"White Weenie",color:"W",strategy:"aggro",deck:[...Array(4).fill("savannah_lions"),...Array(4).fill("white_knight"),...Array(3).fill("benalish_hero"),...Array(2).fill("mesa_pegasus"),...Array(2).fill("pearl_unicorn"),...Array(2).fill("serra_angel"),...Array(2).fill("swords"),...Array(2).fill("disenchant"),...Array(2).fill("wog"),...Array(2).fill("healing_salve"),...Array(2).fill("holy_armor"),...Array(17).fill("plains")]},
  BLUE_CONTROL: {name:"Blue Control", color:"U",strategy:"control",deck:[...Array(4).fill("counterspell"),...Array(2).fill("ancestral"),...Array(3).fill("power_sink"),...Array(3).fill("unsummon"),...Array(2).fill("psionic_blast"),...Array(2).fill("braingeyser"),...Array(4).fill("merfolk_pearl"),...Array(2).fill("lord_atlantis"),...Array(2).fill("phantom_warrior"),...Array(2).fill("air_elemental"),...Array(2).fill("mahamoti_djinn"),...Array(1).fill("time_walk"),...Array(19).fill("island")]},
  BLACK_REANIMATOR:{name:"Black Reanimator",color:"B",strategy:"combo",deck:[...Array(4).fill("dark_ritual"),...Array(3).fill("hypnotic_specter"),...Array(2).fill("juzam_djinn"),...Array(3).fill("sengir_vampire"),...Array(3).fill("terror"),...Array(2).fill("dark_banishing"),...Array(2).fill("demonic_tutor"),...Array(2).fill("mind_twist"),...Array(2).fill("animate_dead"),...Array(2).fill("drudge_skeletons"),...Array(2).fill("royal_assassin"),...Array(2).fill("black_knight"),...Array(19).fill("swamp")]},
  RED_BURN:     {name:"Red Burn",     color:"R",strategy:"aggro",deck:[...Array(4).fill("lightning_bolt"),...Array(4).fill("chain_lightning"),...Array(3).fill("fireball"),...Array(2).fill("lava_axe"),...Array(4).fill("mons_goblin"),...Array(3).fill("goblin_balloon"),...Array(3).fill("goblin_king"),...Array(2).fill("shivan_dragon"),...Array(2).fill("shatter"),...Array(2).fill("wheel_of_fortune"),...Array(19).fill("mountain")]},
  GREEN_STOMPY: {name:"Green Stompy",color:"G",strategy:"aggro",deck:[...Array(4).fill("llanowar_elves"),...Array(4).fill("fyndhorn_elves"),...Array(4).fill("grizzly_bears"),...Array(3).fill("giant_spider"),...Array(2).fill("craw_wurm"),...Array(2).fill("force_of_nature"),...Array(2).fill("birds_of_paradise"),...Array(3).fill("giant_growth"),...Array(2).fill("regrowth"),...Array(2).fill("stream_of_life"),...Array(2).fill("hurricane"),...Array(18).fill("forest")]},
  FIVE_COLOR_BOMB:{name:"Five-Color Chaos",color:"WUBRG",strategy:"bomb",deck:["black_lotus","sol_ring","ancestral","time_walk","demonic_tutor",...Array(2).fill("mox_pearl"),...Array(2).fill("mox_sapphire"),...Array(2).fill("mox_jet"),...Array(2).fill("mox_ruby"),...Array(2).fill("mox_emerald"),"swords","wog","armageddon","counterspell","mind_twist","serra_angel","mahamoti_djinn","shivan_dragon","force_of_nature","juzam_djinn",...Array(4).fill("plains"),...Array(3).fill("island"),...Array(3).fill("swamp"),...Array(3).fill("mountain"),...Array(4).fill("forest")]},
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
const CASTLE_N={W:"White Keep",U:"Azure Tower",B:"Shadow Spire",R:"Fire Citadel",G:"Root Throne"};
const CASTLE_MOD={
  W:{name:"Holy Ground",     desc:"All creatures have protection from non-white spells."},
  U:{name:"Tidal Lock",      desc:"Player may only cast one spell per turn."},
  B:{name:"Death's Embrace", desc:"Mage's creatures gain lifelink."},
  R:{name:"Inferno",         desc:"At end of each turn, all players take 1 damage."},
  G:{name:"Overgrowth",      desc:"All lands tap for 2 mana instead of 1."},
};
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
  PLAINS:  [{name:"Pegasus Cavalry",hp:20,archKey:"WHITE_WEENIE",tier:1},{name:"Knight of the Keep",hp:22,archKey:"WHITE_WEENIE",tier:2}],
  FOREST:  [{name:"Forest Spider",  hp:20,archKey:"GREEN_STOMPY", tier:1},{name:"Elder Druid",      hp:24,archKey:"GREEN_STOMPY", tier:2}],
  SWAMP:   [{name:"Risen Zombie",   hp:20,archKey:"BLACK_REANIMATOR",tier:1},{name:"Shadow Specter",hp:22,archKey:"BLACK_REANIMATOR",tier:2}],
  MOUNTAIN:[{name:"Goblin Raider",  hp:18,archKey:"RED_BURN",     tier:1},{name:"Mountain Ogre",   hp:24,archKey:"RED_BURN",     tier:2}],
  ISLAND:  [{name:"Sea Serpent",    hp:20,archKey:"BLUE_CONTROL",  tier:1},{name:"Tidal Sorcerer",  hp:22,archKey:"BLUE_CONTROL",  tier:2}],
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
function getPow(c,state){let p=c.power??0;if(c.dynamic&&c.name==="Plague Rats")p=[...state.p.bf,...state.o.bf].filter(x=>x.name==="Plague Rats").length;return Math.max(0,p+(c.counters?.P1P1??0)-(c.counters?.M1M1??0));}
function getTou(c,state){let t=c.toughness??0;if(c.dynamic&&c.name==="Plague Rats")t=[...state.p.bf,...state.o.bf].filter(x=>x.name==="Plague Rats").length;return Math.max(0,t+(c.counters?.P1P1??0)-(c.counters?.M1M1??0));}
function canBlockDuel(bl,at){if(hasKw(at,"FLYING")&&!hasKw(bl,"FLYING")&&!hasKw(bl,"REACH"))return false;if(hasKw(at,"PROTECTION")&&at.protection===bl.color)return false;if(hasKw(bl,"PROTECTION")&&bl.protection===at.color)return false;return true;}
function dlog(s,text,type="info"){return{...s,log:[...s.log.slice(-100),{text,type,turn:s.turn}]};}
function hurt(s,who,amt,src=""){const nl=s[who].life-amt;let ns={...s,[who]:{...s[who],life:nl}};if(amt>0)ns=dlog(ns,`${who} takes ${amt} damage${src?` from ${src}`:""}.`,"damage");else if(amt<0)ns=dlog(ns,`${who} gains ${-amt} life.`,"heal");if(nl<=0&&!ns.over)ns={...ns,over:{winner:who==="p"?"o":"p",reason:`${who} reached 0 life`}};return ns;}
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
    case"reanimate":{const cres=ns[opp].gy.filter(isCre);if(cres.length){const top=cres[cres.length-1];ns=zMove(ns,top.iid,opp,caster,"bf");ns=dlog(ns,`${card.name} reanimates ${top.name}.`,"effect");}break;}
    case"hurricane":{for(const w of["p","o"]){ns=hurt(ns,w,xVal,"Hurricane");const fl=ns[w].bf.filter(c=>isCre(c)&&hasKw(c,"FLYING"));for(const c of fl)ns={...ns,[w]:{...ns[w],bf:ns[w].bf.map(x=>x.iid===c.iid?{...x,damage:x.damage+xVal}:x)}};}ns=checkDeath(ns);break;}
    case"armageddonDisk":{ns=dlog(ns,"Nevinyrral's Disk fires!","effect");for(const w of["p","o"]){for(const c of ns[w].bf.filter(c=>isCre(c)||isArt(c)||isEnch(c)))ns=zMove(ns,c.iid,w,w,"gy");}break;}
    default:ns=dlog(ns,`${card.name} resolves.`,"effect");
  }
  return ns;
}

function resolveCombat(s){
  let ns=s;if(!ns.attackers.length)return ns;
  ns=dlog(ns,"⚔ Combat damage resolving…","combat");
  for(const attId of ns.attackers){
    const att=getBF(ns,attId);if(!att)continue;
    const ap=getPow(att,ns),actrl=att.controller,defW=actrl==="p"?"o":"p";
    const blockers=ns[defW].bf.filter(c=>c.blocking===attId);
    if(!blockers.length){ns=hurt(ns,defW,ap,att.name);if(hasKw(att,"LIFELINK"))ns=hurt(ns,actrl,-ap);}
    else{
      let rem=ap;
      for(const bl of blockers){
        const bp=getPow(bl,ns),bt=getTou(bl,ns),dbl=Math.min(rem,bt-bl.damage);
        ns={...ns,[actrl]:{...ns[actrl],bf:ns[actrl].bf.map(c=>c.iid===attId?{...c,damage:c.damage+bp}:c)}};
        ns={...ns,[defW]:{...ns[defW],bf:ns[defW].bf.map(c=>c.iid===bl.iid?{...c,damage:c.damage+dbl}:c)}};
        rem=Math.max(0,rem-dbl);if(hasKw(att,"LIFELINK"))ns=hurt(ns,actrl,-dbl);
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
  if(next==="COMBAT_DAMAGE"){ns=resolveCombat(ns);return ns;}
  if(turnChange){
    const whoHasExtra=["p","o"].find(w=>ns[w].extraTurns>0);
    if(whoHasExtra){ns={...ns,[whoHasExtra]:{...ns[whoHasExtra],extraTurns:ns[whoHasExtra].extraTurns-1}};ns=dlog(ns,`${whoHasExtra} takes an extra turn!`,"info");}
    else{const nx=ns.active==="p"?"o":"p";ns={...ns,active:nx};ns=dlog(ns,`── Turn ${ns.turn+1} · ${nx} ──`,"phase");}
    ns={...ns,turn:ns.turn+(turnChange?1:0),landsPlayed:0,attackers:[],blockers:{}};
    ns={...ns,[ns.active]:{...ns[ns.active],bf:ns[ns.active].bf.map(c=>({...c,tapped:false,summoningSick:false,damage:0}))}};
  }
  if(next==="UPKEEP"){
    for(const w of["p","o"])for(const c of ns[w].bf){if(c.upkeep==="selfDamage1"&&c.controller===w)ns=hurt(ns,w,1,c.name);}
    for(const w of["p","o"])ns=burnMana(ns,w,ns.ruleset);
  }
  if(next==="DRAW"){if(!(ns.turn===1&&!ns.ruleset.drawOnFirstTurn&&ns.active==="p"))ns=drawD(ns,ns.active);}
  if(next==="CLEANUP"){
    const ac=ns.active;
    while(ns[ac].hand.length>ns.ruleset.maxHandSize){const disc=ns[ac].hand[ns[ac].hand.length-1];ns={...ns,[ac]:{...ns[ac],hand:ns[ac].hand.slice(0,-1),gy:[...ns[ac].gy,disc]}};}
    for(const w of["p","o"])ns=burnMana(ns,w,ns.ruleset);
  }
  return ns;
}

function aiDecide(state){
  const acts=[];const arch=state.oppArch||ARCHETYPES.RED_BURN;const strat=arch.strategy;
  const inMain=(state.phase==="MAIN1"||state.phase==="MAIN2")&&state.active==="o";
  if(inMain){
    for(const c of state.o.bf.filter(c=>isLand(c)&&!c.tapped))acts.push({type:"TAP_LAND",who:"o",iid:c.iid,mana:c.produces?.[0]||"C"});
    for(const c of state.o.bf.filter(c=>isArt(c)&&!c.tapped&&c.activated?.effect?.startsWith("addMana")))acts.push({type:"TAP_ART_MANA",who:"o",iid:c.iid});
  }
  if(inMain&&state.landsPlayed<1){const l=state.o.hand.find(isLand);if(l)acts.push({type:"PLAY_LAND",who:"o",iid:l.iid});}
  if(inMain){
    const castable=state.o.hand.filter(c=>!isLand(c)&&canPay(state.o.mana,c.cost));
    const sorted=[...castable].sort((a,b)=>strat==="aggro"?b.cmc-a.cmc:a.cmc-b.cmc);
    if(sorted.length){const c=sorted[0];let tgt=null;
      if(["damage3","damage5","damageX"].includes(c.effect))tgt="p";
      else if(["destroy","exileCreature","bounce"].includes(c.effect)){const th=state.p.bf.filter(isCre);if(th.length)tgt=th.reduce((a,b)=>getPow(a,state)>getPow(b,state)?a:b).iid;}
      else if(c.effect==="draw3"||c.effect==="tutor")tgt="o";
      acts.push({type:"CAST_SPELL",who:"o",iid:c.iid,tgt,xVal:3});
    }
  }
  if(state.phase==="DECLARE_ATTACKERS"&&state.active==="o"){
    const can=state.o.bf.filter(c=>isCre(c)&&!c.tapped&&!c.summoningSick);
    for(const c of can){
      if(strat==="aggro"||(strat==="control"&&state.p.life<=8)||(strat==="bomb"&&getPow(c,state)>=4))
        acts.push({type:"DECLARE_ATTACKER",iid:c.iid});
    }
  }
  if(state.phase==="DECLARE_BLOCKERS"&&state.active==="p"){
    const can=state.o.bf.filter(c=>isCre(c)&&!c.tapped&&!c.attacking);
    for(const attId of state.attackers){const att=getBF(state,attId);if(!att)continue;
      const valid=can.filter(b=>!b.blocking&&canBlockDuel(b,att));
      const trade=valid.find(b=>getPow(b,state)>=getTou(att,state));
      const force=state.o.life<=getPow(att,state)?valid[0]:null;
      const chosen=trade||force;if(chosen)acts.push({type:"DECLARE_BLOCKER",blId:chosen.iid,attId});}
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
    case"TAP_LAND":{const w=action.who,c=s[w].bf.find(x=>x.iid===action.iid);if(!c||c.tapped||!isLand(c))return s;const m=action.mana||c.produces?.[0]||"C";s={...s,[w]:{...s[w],bf:s[w].bf.map(x=>x.iid===action.iid?{...x,tapped:true}:x),mana:{...s[w].mana,[m]:(s[w].mana[m]||0)+1}}};return dlog(s,`${w} taps ${c.name} → +1${m}.`,"mana");}
    case"TAP_ART_MANA":{const w=action.who,c=s[w].bf.find(x=>x.iid===action.iid);if(!c||c.tapped||!c.activated?.effect?.startsWith("addMana"))return s;const ms=c.activated.mana||"";s={...s,[w]:{...s[w],bf:s[w].bf.map(x=>x.iid===action.iid?{...x,tapped:true}:x)}};const mp={...s[w].mana};for(const ch of ms)if("WUBRGC".includes(ch))mp[ch]=(mp[ch]||0)+1;return dlog({...s,[w]:{...s[w],mana:mp}},`${w} taps ${c.name} for mana.`,"mana");}
    case"PLAY_LAND":{const w=action.who,c=s[w].hand.find(x=>x.iid===action.iid);if(!c||!isLand(c)||s.active!==w||(s.phase!=="MAIN1"&&s.phase!=="MAIN2")||s.landsPlayed>=1)return s;const lArr={...c,controller:w,tapped:false,summoningSick:false,attacking:false,blocking:null,damage:0,counters:{}};s={...s,[w]:{...s[w],hand:s[w].hand.filter(x=>x.iid!==action.iid),bf:[...s[w].bf,lArr]},landsPlayed:s.landsPlayed+1};return dlog(s,`${w} plays ${c.name}.`,"play");}
    case"CAST_SPELL":{
      const w=action.who,c=s[w].hand.find(x=>x.iid===action.iid);if(!c)return s;
      if(s.active!==w&&!isInst(c))return s;
      if((s.phase!=="MAIN1"&&s.phase!=="MAIN2")&&!isInst(c))return s;
      if(!canPay(s[w].mana,c.cost))return s;
      s={...s,[w]:{...s[w],mana:payMana(s[w].mana,c.cost),hand:s[w].hand.filter(x=>x.iid!==action.iid)}};
      const item={id:mkId(),card:c,caster:w,targets:action.tgt?[action.tgt]:[],xVal:action.xVal||s.xVal||1};
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

function FieldCard({card,state,selected,attacking,onClick,sm=false}){
  const{bg,bd,ac}=thmOf(card);const ca=CCOLOR[card.color]||"#aaa";const w=sm?76:92,h=sm?100:124;
  const p=isCre(card)?getPow(card,state):null,t=isCre(card)?getTou(card,state):null;
  return(
    <div onClick={onClick} title={`${card.name}\n${card.text||""}`} style={{
      width:w,height:h,background:bg,
      border:`2px solid ${selected?"#ffe060":attacking?"#ff5010":bd}`,
      borderRadius:7,cursor:"pointer",position:"relative",
      transform:card.tapped?"rotate(90deg)":"none",
      transition:"transform .3s,border-color .2s",
      boxShadow:selected?`0 0 14px #ffe060,0 0 4px #ffe06080`:attacking?`0 0 14px #ff501080,animation:combatGlow 1s infinite`:`0 3px 10px rgba(0,0,0,.6)`,
      flexShrink:0,display:"flex",flexDirection:"column",overflow:"hidden",
    }}>
      {/* Top color bar */}
      <div style={{height:4,background:ca,flexShrink:0}}/>
      {/* Name + cost row */}
      <div style={{padding:"4px 5px 2px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0,borderBottom:`1px solid ${bd}40`}}>
        <span style={{fontSize:sm?7.5:8.5,fontFamily:"'Cinzel',serif",color:"#f0e8c0",fontWeight:700,lineHeight:1.2,flex:1,overflow:"hidden",textShadow:"0 1px 2px rgba(0,0,0,.8)"}}>{card.name}</span>
        <Cost cost={card.cost} size={sm?10:11}/>
      </div>
      {/* Art area */}
      <div style={{flex:1,margin:"3px 5px",background:`linear-gradient(135deg,${bg}dd,rgba(0,0,0,.5))`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",border:`1px solid ${bd}60`}}>
        <span style={{fontSize:sm?22:28,opacity:.7}}>{CARD_ICON(card)}</span>
        {card.damage>0&&<div style={{position:"absolute",top:2,right:2,background:"#d01010",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:3,boxShadow:"0 0 6px #d01010"}}>💢{card.damage}</div>}
        {card.summoningSick&&isCre(card)&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:4}}><span style={{fontSize:8,color:"rgba(255,220,150,.7)",fontFamily:"'Cinzel',serif",letterSpacing:1}}>SICK</span></div>}
      </div>
      {/* Keywords */}
      {card.keywords?.length>0&&<div style={{padding:"2px 5px",display:"flex",flexWrap:"wrap",gap:1}}>{card.keywords.slice(0,2).map(k=><span key={k} style={{fontSize:6.5,background:ac+"22",color:ac,padding:"0 3px",borderRadius:2,fontFamily:"'Cinzel',serif"}}>{k.replace("_"," ")}</span>)}</div>}
      {/* P/T badge */}
      {isCre(card)&&<div style={{position:"absolute",bottom:4,right:5,fontSize:sm?10:13,fontWeight:700,color:card.damage>0?"#ff8060":ca,fontFamily:"'Fira Code',monospace",textShadow:"0 1px 3px rgba(0,0,0,.9)",background:"rgba(0,0,0,.5)",padding:"0 3px",borderRadius:3}}>{p}/{t}</div>}
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
  return <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{PHASE_SEQ.map(p=>{const on=p===phase;const cmbt=COMBAT_PHASES.includes(p);return <div key={p} style={{padding:"4px 8px",background:on?(cmbt?"rgba(220,80,20,.5)":"rgba(200,160,20,.35)"):"rgba(255,255,255,.05)",border:`1px solid ${on?(cmbt?"#ee6020":"#ddb830"):"rgba(255,255,255,.12)"}`,borderRadius:4,color:on?(cmbt?"#ffcc80":"#ffe060"):"#806040",fontSize:10,fontFamily:"'Cinzel',serif",fontWeight:on?700:400,animation:on?"phaseGlow 2s infinite":"none",whiteSpace:"nowrap",letterSpacing:.5}}>{PHASE_LBL[p]}</div>;})}</div>;
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
  const{bg}=thmOf(card);const ca=CCOLOR[card.color]||"#888";
  const p=isCre(card)?getPow(card,state):null,t=isCre(card)?getTou(card,state):null;
  return <div style={{position:"fixed",left:Math.min(pos.x+12,window.innerWidth-210),top:Math.min(pos.y-20,window.innerHeight-280),width:200,zIndex:1000,pointerEvents:"none",background:`linear-gradient(160deg,${bg},rgba(5,3,1,.98))`,border:`2px solid ${ca}60`,borderRadius:8,padding:12,boxShadow:`0 0 30px rgba(0,0,0,.9),0 0 10px ${ca}30`,animation:"fadeIn .15s ease-out"}}>
    <div style={{height:3,background:ca,marginBottom:8,borderRadius:2}}/>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontFamily:"'Cinzel',serif",color:"#e0d090",fontWeight:700,flex:1}}>{card.name}</span><Cost cost={card.cost} size={13}/></div>
    <div style={{fontSize:9,color:"#7a6040",marginBottom:6}}>{card.type}{card.subtype?` — ${card.subtype}`:""}</div>
    {card.keywords?.length>0&&<div style={{marginBottom:6}}>{card.keywords.map(k=><div key={k} style={{fontSize:9,color:thmOf(card).ac,marginBottom:2}}><strong>{k}</strong></div>)}</div>}
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
      <div style={{padding:"6px 14px",borderBottom:"2px solid rgba(200,160,40,.3)",background:"rgba(0,0,0,.7)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,fontFamily:"'Cinzel',serif",color:"#d0a040",fontWeight:600}}>{config.ruleset.name}</span>
          <span style={{fontSize:11,color:"#a09050",fontFamily:"'Cinzel',serif"}}>Turn {s.turn}</span>
          {config.ruleset.manaBurn&&<span style={{fontSize:10,color:"#ee6030",fontFamily:"'Cinzel',serif",fontWeight:700}}>⚠ MANA BURN</span>}
          {s.active==="o"&&<span style={{fontSize:11,color:"#9090dd",animation:"pulse 1s infinite",fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>Opponent thinking…</span>}
        </div>
        <PhaseBar phase={s.phase}/>
        <button onClick={()=>onDuelEnd("forfeit",s)} style={{background:"rgba(60,20,10,.7)",border:"1px solid rgba(180,80,40,.5)",color:"#e07050",padding:"4px 12px",borderRadius:5,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif"}}>Forfeit</button>
      </div>
      {/* Battlefield */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {/* Opponent side */}
          <div style={{flex:"0 0 auto",borderBottom:"2px solid #6a2010",background:"linear-gradient(180deg,#1a0c08,#120808)"}}>
            <div style={{padding:"7px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid rgba(180,80,30,.3)",background:"rgba(0,0,0,.4)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"#e05030",fontFamily:"'Cinzel',serif",letterSpacing:1}}>OPPONENT</span>
                <span style={{fontSize:24,fontWeight:700,fontFamily:"'Cinzel',serif",color:s.o.life<=5?"#ff2020":s.o.life<=10?"#e06030":"#ff9060",animation:s.o.life<=5?"pulse 1s infinite":"none",textShadow:s.o.life<=5?"0 0 10px #ff2020":"none"}}>{s.o.life}</span>
                <div style={{width:70,height:8,background:"#1a0800",borderRadius:4,overflow:"hidden",border:"1px solid #6a3010"}}><div style={{width:`${Math.max(0,(s.o.life/config.ruleset.startingLife)*100)}%`,height:"100%",background:s.o.life<=5?"#cc1010":"linear-gradient(90deg,#aa3010,#dd5020)",transition:"width .4s",borderRadius:4}}/></div>
              </div>
              <span style={{fontSize:11,color:"#907050"}}>📚{s.o.lib.length} ✋{s.o.hand.length} 🪦{s.o.gy.length}</span>
              {oMana>0&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:"#706040"}}>Pool:</span><PoolDisplay pool={s.o.mana} size={13}/></div>}
              <div style={{display:"flex",gap:3,marginLeft:"auto"}}>{s.o.hand.map((_,i)=><div key={i} style={{width:26,height:40,background:"linear-gradient(135deg,#2a1a10,#1a100a)",border:"1px solid #5a3820",borderRadius:4,boxShadow:"0 2px 4px rgba(0,0,0,.5)"}}/>)}</div>
            </div>
            {/* Opponent battlefield — separated land zone + spell zone */}
            <div style={{minHeight:140,display:"flex",gap:0}}>
              {/* Opponent lands */}
              <div style={{width:160,flexShrink:0,padding:"8px 10px",borderRight:"1px solid rgba(180,120,40,.2)",background:"rgba(0,0,0,.2)"}}>
                <div style={{fontSize:9,color:"#806030",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:6}}>LANDS</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {s.o.bf.filter(isLand).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selTgt===c.iid} onClick={()=>handleClick(c,"oBf")} sm/></div>)}
                  {!s.o.bf.filter(isLand).length&&<span style={{fontSize:10,color:"#3a2818",fontStyle:"italic"}}>—</span>}
                </div>
              </div>
              {/* Opponent spells/creatures */}
              <div style={{flex:1,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#806030",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:6}}>BATTLEFIELD</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {s.o.bf.filter(c=>!isLand(c)).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selTgt===c.iid} attacking={s.attackers.includes(c.iid)} onClick={()=>handleClick(c,"oBf")}/></div>)}
                  {!s.o.bf.filter(c=>!isLand(c)).length&&<span style={{fontSize:10,color:"#2a1808",fontStyle:"italic"}}>No permanents in play</span>}
                </div>
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
          <div style={{flex:"1 1 auto",overflow:"auto",background:"linear-gradient(180deg,#0e1a0a,#0a140a)",borderTop:"2px solid #1a4010"}}>
            <div style={{minHeight:140,display:"flex",gap:0}}>
              {/* Player lands — left column */}
              <div style={{width:160,flexShrink:0,padding:"8px 10px",borderRight:"1px solid rgba(80,160,40,.2)",background:"rgba(0,0,0,.2)"}}>
                <div style={{fontSize:9,color:"#508030",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:6}}>YOUR LANDS</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {s.p.bf.filter(isLand).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selCard===c.iid||s.selTgt===c.iid} onClick={()=>handleClick(c,"pBf")} sm/></div>)}
                  {!s.p.bf.filter(isLand).length&&<span style={{fontSize:10,color:"#203818",fontStyle:"italic"}}>—</span>}
                </div>
              </div>
              {/* Player creatures/spells */}
              <div style={{flex:1,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#508030",fontFamily:"'Cinzel',serif",letterSpacing:1,marginBottom:6}}>YOUR BATTLEFIELD</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {s.p.bf.filter(c=>!isLand(c)).map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><FieldCard card={c} state={s} selected={s.selCard===c.iid||s.selTgt===c.iid} attacking={s.attackers.includes(c.iid)} onClick={()=>handleClick(c,"pBf")}/></div>)}
                  {!s.p.bf.filter(c=>!isLand(c)).length&&<span style={{fontSize:10,color:"#182808",fontStyle:"italic"}}>No permanents in play</span>}
                </div>
              </div>
            </div>
          </div>
          {/* Player info */}
          <div style={{flexShrink:0,padding:"6px 14px",borderTop:"1px solid rgba(80,160,40,.3)",background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,color:"#60ee60",fontFamily:"'Cinzel',serif",letterSpacing:1}}>YOU</span>
              <span style={{fontSize:24,fontWeight:700,fontFamily:"'Cinzel',serif",color:s.p.life<=5?"#ff2020":s.p.life<=10?"#e06030":"#60ee60",animation:s.p.life<=5?"pulse 1s infinite":"none",textShadow:s.p.life<=5?"0 0 10px #ff2020":"none"}}>{s.p.life}</span>
              <div style={{width:70,height:8,background:"#081808",borderRadius:4,overflow:"hidden",border:"1px solid #2a6020"}}><div style={{width:`${Math.max(0,(s.p.life/config.ruleset.startingLife)*100)}%`,height:"100%",background:s.p.life<=5?"#cc1010":"linear-gradient(90deg,#208020,#40cc40)",transition:"width .4s",borderRadius:4}}/></div>
            </div>
            <span style={{fontSize:11,color:"#706850"}}>📚{s.p.lib.length} 🪦{s.p.gy.length}</span>
            {pMana>0&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:"#706040"}}>Pool:</span><PoolDisplay pool={s.p.mana} size={14}/>{config.ruleset.manaBurn&&<span style={{fontSize:10,color:"#ee6030",fontWeight:700}}>⚠ BURN</span>}</div>}
            <button onClick={()=>dispatch({type:"MULLIGAN",who:"p"})} style={{marginLeft:"auto",background:"rgba(0,0,0,.4)",border:"1px solid rgba(160,120,60,.4)",color:"#c0a050",padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif"}}>Mulligan</button>
          </div>
          {/* Hand */}
          <div style={{flexShrink:0,padding:"8px 14px 10px",display:"flex",gap:6,alignItems:"flex-end",background:"linear-gradient(180deg,#0c1808,#141c10)",overflowX:"auto",minHeight:132,borderTop:"1px solid rgba(60,120,30,.4)"}}>
            {s.p.hand.map(c=><div key={c.iid} onMouseMove={e=>setTip({card:c,pos:{x:e.clientX,y:e.clientY}})} onMouseLeave={()=>setTip(null)}><HandCard card={c} state={s} selected={s.selCard===c.iid} playable={canCastNow(c,"p")} onClick={()=>handleClick(c,"hand")}/></div>)}
            {!s.p.hand.length&&<span style={{fontSize:12,color:"#2a3820",fontStyle:"italic",alignSelf:"center",fontFamily:"'Crimson Text',serif"}}>No cards in hand</span>}
          </div>
        </div>
        {/* Sidebar */}
        <div style={{width:210,borderLeft:"2px solid rgba(180,140,60,.25)",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0e0c08,#0a0a08)",flexShrink:0}}>
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
      {s==="TOWN"&&<div style={{fontSize:TSIZ*.42,lineHeight:1,zIndex:2}}>⌂</div>}
      {s==="DUNGEON"&&<div style={{fontSize:TSIZ*.38,lineHeight:1,zIndex:2}}>⚑</div>}
      {s==="CASTLE"&&<div style={{fontSize:TSIZ*.38,lineHeight:1,zIndex:2,filter:`drop-shadow(0 0 4px ${MHEX[tile.castleData?.color]||"#fff"})`}}>♔</div>}
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
function TownModal({town,player,binder,onClose,onBuy,onRest,onSage,onTrade}){
  const[tab,setTab]=useState("shop");
  const restCost=Math.max(0,(player.maxHP-player.hp)*3);
  const tabs=[{id:"shop",l:"⚜ Shop"},{id:"inn",l:"🏠 Inn"},...(town.hasSage?[{id:"sage",l:"📜 Sage"}]:[]),...(town.hasBlackMarket?[{id:"bm",l:"⚫ Market"}]:[]),...(town.quest&&!town.questDone?[{id:"guild",l:"⚔ Guild"}]:[])];
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

function DeckManager({deck,binder,onClose,onSwap}){
  const[sD,setSD]=useState(null);const[sB,setSB]=useState(null);const[filt,setFilt]=useState("ALL");
  const fD=deck.filter(c=>filt==="ALL"||c.color===filt);
  const fB=binder.filter(c=>filt==="ALL"||c.color===filt);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.87)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{width:660,maxHeight:"88vh",background:"linear-gradient(160deg,#0e0c04,#080a04)",border:"2px solid rgba(180,160,60,.35)",borderRadius:10,display:"flex",flexDirection:"column",boxShadow:"0 0 50px rgba(0,0,0,.9)"}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(180,160,60,.2)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:15,fontFamily:"'Cinzel',serif",color:"#e0c060"}}>📖 Deck Manager</div><div style={{fontSize:10,color:"#6a5020",marginTop:2}}>Deck: {deck.length}{deck.length<40&&<span style={{color:"#e05030",marginLeft:6}}>⚠ Below 40 min</span>} | Binder: {binder.length}</div></div>
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            {["ALL","W","U","B","R","G",""].map(f=><button key={f} onClick={()=>setFilt(f)} style={{background:filt===f?"rgba(200,160,40,.2)":"transparent",border:`1px solid ${filt===f?"#a08030":"#3a3010"}`,color:filt===f?"#f0c040":"#6a5020",padding:"2px 7px",borderRadius:3,cursor:"pointer",fontSize:9,fontFamily:"'Cinzel',serif"}}>{f||"∅"}</button>)}
            <button onClick={onClose} style={{background:"transparent",border:"1px solid #5a3020",color:"#c08060",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:12}}>✕</button>
          </div>
        </div>
        <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",overflow:"hidden"}}>
          {[{label:`⚔ DECK (${deck.length})`,cards:fD,sel:sD,setSel:setSD},{label:`📦 BINDER (${binder.length})`,cards:fB,sel:sB,setSel:setSB}].map(({label,cards,sel,setSel},pi)=>(
            <div key={pi} style={{borderRight:pi===0?"1px solid rgba(180,160,60,.15)":"none",display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"8px 12px",fontSize:10,fontFamily:"'Cinzel',serif",color:"#a08040",borderBottom:"1px solid rgba(180,160,60,.08)"}}>{label}</div>
              <div style={{flex:1,overflowY:"auto",padding:8,display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start",scrollbarWidth:"thin"}}>
                {cards.map((c,i)=>(
                  <div key={i} onClick={()=>setSel(sel===i?null:i)} style={{width:86,padding:"6px 6px 4px",background:thmOf(c).bg,border:`2px solid ${sel===i?"#f0c040":thmOf(c).bd}`,borderRadius:5,cursor:"pointer",position:"relative",boxShadow:sel===i?"0 0 8px #f0c040":"0 2px 5px rgba(0,0,0,.4)",transition:"transform .15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:c.rarity==="R"?"#f0c040":c.rarity==="U"?"#a0b8d0":"#c0c0c0",position:"absolute",top:3,left:3}}/>
                    <div style={{fontSize:7.5,fontFamily:"'Cinzel',serif",color:"#d0c090",fontWeight:600,lineHeight:1.2,marginBottom:2,paddingLeft:7}}>{c.name}</div>
                    <div style={{fontSize:7,color:"#6a5030",marginBottom:2}}>{c.subtype||c.type}</div>
                    {isCre(c)&&<div style={{fontSize:9,fontWeight:700,color:CCOLOR[c.color]||"#888",fontFamily:"'Fira Code',monospace",textAlign:"right"}}>{c.power}/{c.toughness}</div>}
                  </div>
                ))}
                {!cards.length&&<div style={{fontSize:10,color:"#3a2810",fontStyle:"italic",padding:8}}>Empty for this filter.</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid rgba(180,160,60,.15)",display:"flex",gap:10,alignItems:"center"}}>
          {sD!==null&&sB!==null?<>
            <div style={{fontSize:11,color:"#a09060",flex:1}}>Swap <strong style={{color:"#f0c060"}}>{fD[sD]?.name}</strong> ↔ <strong style={{color:"#f0c060"}}>{fB[sB]?.name}</strong></div>
            <button onClick={()=>{onSwap(fD[sD],fB[sB]);setSD(null);setSB(null);}} style={{background:"linear-gradient(135deg,#1a2a10,#2a4020)",border:"1px solid #5a9040",color:"#80d060",padding:"5px 14px",borderRadius:4,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>⇄ Swap</button>
          </>:<div style={{fontSize:10,color:"#4a3820",fontStyle:"italic"}}>Select one card from each column to swap.</div>}
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
        <div style={{fontSize:13,color:"rgba(180,140,60,.5)",letterSpacing:3,marginBottom:36}}>MODERN EDITION · PHASE 3</div>
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
function Game({startConfig,onQuit}){
  const mapData=useMemo(()=>generateMap(startConfig.seed),[]);
  const[tiles,setTiles]=useState(mapData.tiles);
  const[pos,setPos]=useState({x:mapData.sx,y:mapData.sy});
  const[viewport,setVP]=useState({x:Math.max(0,mapData.sx-9),y:Math.max(0,mapData.sy-7)});
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
  const[duelCfg,setDuelCfg]=useState(null); // null means overworld; non-null triggers DuelScreen
  const[dungeonProg,setDungeonProg]=useState(null); // { tile, room, totalRooms, mod, entryHP }
  const[anteEnabled,setAnteEnabled]=useState(false);
  const[ruleset,setRuleset]=useState(RULESETS.CLASSIC);

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
          const archKeys=Object.keys(ARCHETYPES).filter(k=>k!=="FIVE_COLOR_BOMB");
          const nextArch=archKeys[Math.floor(Math.random()*archKeys.length)];
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
    setPos({x:nx,y:ny});
    setVP({x:Math.max(0,Math.min(MAP_W-18,nx-9)),y:Math.max(0,Math.min(MAP_H-14,ny-7))});
    // Hunger
    if(nm%15===0){setPlayer(p=>({...p,gold:Math.max(0,p.gold-8)}));addLog("You pay 8g for food and supplies.","warn");}
    // Tick ML events
    setMlEvents(prev=>prev.map(e=>({...e,movesLeft:e.movesLeft-1})).filter(e=>{
      if(e.movesLeft<=0){
        setManaLinks(ml=>({...ml,[e.color]:Math.min(5,(ml[e.color]||0)+1)}));
        addLog(`⚠ ${MAGE_N[e.color]} establishes a mana link at ${e.townName}!`,"danger");
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

  const handleSwap=useCallback((dc,bc)=>{setDeck(d=>d.map(c=>c.iid===dc.iid?{...bc,iid:dc.iid}:c));setBinder(b=>b.map(c=>c.iid===bc.iid?{...dc,iid:bc.iid}:c));addLog(`Swapped ${dc.name} ↔ ${bc.name}.`,"info");},[]);

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
    const archKeys=Object.keys(ARCHETYPES).filter(k=>k!=="FIVE_COLOR_BOMB");
    launchDuel(archKeys[Math.floor(Math.random()*archKeys.length)],player.hp,"dungeon",dg.mod);
  },[activeTile,player.hp,launchDuel,addLog]);

  // Win/lose checks
  const gameWon=magesDefeated.length===5;
  const gameLost=COLORS.some(c=>manaLinks[c]>=mlThreshold&&!magesDefeated.includes(c));

  // ── RENDER DUEL IF ACTIVE ────────────────────────────────────
  if(duelCfg){
    return <DuelScreen key={JSON.stringify(duelCfg)} config={duelCfg} onDuelEnd={handleDuelEnd}/>;
  }

  const viewW=Math.min(18,MAP_W),viewH=Math.min(14,MAP_H);

  return(
    <div style={{minHeight:"100vh",background:"#050302",color:"#c0b090",fontFamily:"'Crimson Text',serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Win/Lose overlays */}
      {gameWon&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400}}>
        <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:14}}>✦</div><div style={{fontSize:26,fontFamily:"'Cinzel Decorative',serif",color:"#f0d060",marginBottom:8}}>Shandalar is Saved!</div><div style={{fontSize:13,color:"#a09060",fontFamily:"'Crimson Text',serif",marginBottom:22,fontStyle:"italic"}}>{player.name} has defeated all five mages. Arzakon's ritual is broken.<br/>The plane endures — for now.</div><button onClick={onQuit} style={{background:"linear-gradient(135deg,#1a1404,#2e2008)",border:"2px solid rgba(200,160,40,.6)",color:"#f0c040",padding:"11px 30px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13}}>Return to Title</button></div>
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
          {/* Map scroll controls */}
          <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",display:"flex",gap:4}}>
            {[["↑",0,-3],["←",-3,0],["↓",0,3],["→",3,0]].map(([l,dx,dy])=><button key={l} onClick={()=>setVP(v=>({x:Math.max(0,Math.min(MAP_W-viewW,v.x+dx)),y:Math.max(0,Math.min(MAP_H-viewH,v.y+dy))}))} style={{width:30,height:30,background:"rgba(0,0,0,.7)",border:"1px solid rgba(200,160,60,.3)",color:"#a08040",cursor:"pointer",borderRadius:4,fontSize:13}}>{l}</button>)}
            <button onClick={()=>setVP({x:Math.max(0,Math.min(MAP_W-viewW,pos.x-Math.floor(viewW/2))),y:Math.max(0,Math.min(MAP_H-viewH,pos.y-Math.floor(viewH/2)))})} style={{padding:"0 10px",height:30,background:"rgba(0,0,0,.7)",border:"1px solid rgba(200,160,60,.3)",color:"#c0a050",cursor:"pointer",borderRadius:4,fontSize:10,fontFamily:"'Cinzel',serif"}}>Ctr</button>
          </div>
          {/* Mana link alerts */}
          {mlEvents.slice(0,1).map(ev=>{const hx=MHEX[ev.color];return(
            <div key={ev.id} style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",zIndex:100,background:`linear-gradient(135deg,#1a0808,${hx}20)`,border:`2px solid ${hx}`,borderRadius:7,padding:"10px 16px",maxWidth:430,boxShadow:`0 0 20px ${hx}60`,animation:"alertDrop .3s ease-out"}}>
              <div style={{fontSize:11,fontFamily:"'Cinzel',serif",color:hx,marginBottom:4,letterSpacing:1}}>{MSYM[ev.color]} MANA LINK ALERT</div>
              <div style={{fontSize:12,color:"#e0c090",marginBottom:8}}><strong>{MAGE_N[ev.color]}</strong> sends <strong>{ev.minionName}</strong> to seize <strong>{ev.townName}</strong>! <strong style={{color:"#ff8040"}}>{ev.movesLeft} moves</strong> remaining.</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setMlEvents(p=>p.filter(e=>e.id!==ev.id))} style={{flex:2,background:`${hx}20`,border:`1px solid ${hx}`,color:hx,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11}}>⚔ Rush to {ev.townName}</button>
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
            <div style={{fontSize:10,color:"#8a6030",fontFamily:"'Cinzel',serif",marginBottom:5,letterSpacing:1}}>CHRONICLE</div>
            <OWLog log={log}/>
          </div>
        </div>
      </div>
      {/* Modals */}
      {modal==="town"&&activeTile?.townData&&<TownModal town={activeTile.townData} player={player} binder={binder} onClose={()=>setModal(null)} onBuy={handleBuy} onRest={handleRest} onSage={handleSage} onTrade={handleTrade}/>}
      {modal==="dungeon"&&activeTile?.dungeonData&&<DungeonModal dungeon={activeTile.dungeonData} onClose={()=>setModal(null)} onEnter={handleEnterDungeon}/>}
      {modal==="castle"&&activeTile?.castleData&&<CastleModal castleData={activeTile.castleData} onClose={()=>setModal(null)} onChallenge={handleChallenge}/>}
      {modal==="deck"&&<DeckManager deck={deck} binder={binder} onClose={()=>setModal(null)} onSwap={handleSwap}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App(){
  const[screen,setScreen]=useState("title");
  const[cfg,setCfg]=useState(null);
  if(screen==="game"&&cfg)return <Game startConfig={cfg} onQuit={()=>setScreen("title")}/>;
  return <TitleScreen onStart={c=>{setCfg(c);setScreen("game");}}/>;
}
