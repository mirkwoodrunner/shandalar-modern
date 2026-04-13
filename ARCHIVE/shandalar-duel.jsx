import { useState, useEffect, useCallback, useReducer, useRef, useMemo } from "react";

// ============================================================
// FONT + GLOBAL STYLES
// ============================================================
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Fira+Code:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #060402; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #0a0804; }
  ::-webkit-scrollbar-thumb { background: #4a3010; border-radius: 3px; }

  @keyframes cardDraw {
    from { transform: translateY(-40px) rotate(-5deg); opacity: 0; }
    to   { transform: translateY(0) rotate(0deg); opacity: 1; }
  }
  @keyframes cardPlay {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.12); }
    100% { transform: scale(1); }
  }
  @keyframes tapAnim {
    from { transform: rotate(0deg); }
    to   { transform: rotate(90deg); }
  }
  @keyframes damageFlash {
    0%,100% { filter: none; }
    50%      { filter: brightness(2) saturate(0); }
  }
  @keyframes healFlash {
    0%,100% { filter: none; }
    50%      { filter: brightness(1.5) hue-rotate(90deg); }
  }
  @keyframes phaseGlow {
    0%,100% { box-shadow: 0 0 6px rgba(200,160,40,0.4); }
    50%      { box-shadow: 0 0 14px rgba(200,160,40,0.8); }
  }
  @keyframes stackEntry {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0); opacity: 1; }
  }
  @keyframes pulse {
    0%,100% { opacity: 0.7; }
    50%      { opacity: 1; }
  }
  @keyframes combatGlow {
    0%,100% { box-shadow: 0 0 6px rgba(220,80,40,0.5); }
    50%      { box-shadow: 0 0 18px rgba(220,80,40,0.9); }
  }
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lifeChange {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
`;

// ============================================================
// RULESET DEFINITIONS  — swappable per format
// ============================================================
const RULESETS = {
  CLASSIC: {
    id: "CLASSIC",
    name: "Classic (Alpha–4th Ed.)",
    description: "Original 1993–1995 rules. Mana burn, banding, batch stack, 7-card mulligan (no free).",
    manaBurn: true,
    freeMulligan: false,           // no Paris/Vancouver free first mull
    londonMulligan: false,
    stackType: "batch",            // "batch" | "lifo"
    planeswalkers: false,
    commandZone: false,
    scry: false,
    exileZone: false,              // no exile in classic — "removed from game"
    deathtouch: false,
    infect: false,
    dayNight: false,
    companions: false,
    startingHandSize: 7,
    startingLife: 20,
    drawOnFirstTurn: false,        // active player doesn't draw turn 1 (classic rule)
    maxHandSize: 7,
    poisonCountersToWin: 10,
    combatDamageOnStack: true,     // classic: damage goes on stack
  },
  MODERN: {
    id: "MODERN",
    name: "Modern (8th Ed.+)",
    description: "2003+ rules. No mana burn, LIFO stack, Paris mulligan, combat damage off stack.",
    manaBurn: false,
    freeMulligan: false,
    londonMulligan: true,
    stackType: "lifo",
    planeswalkers: false,
    commandZone: false,
    scry: true,
    exileZone: true,
    deathtouch: true,
    infect: false,
    dayNight: false,
    companions: false,
    startingHandSize: 7,
    startingLife: 20,
    drawOnFirstTurn: false,
    maxHandSize: 7,
    poisonCountersToWin: 10,
    combatDamageOnStack: false,
  },
  CONTEMPORARY: {
    id: "CONTEMPORARY",
    name: "Contemporary (2020+)",
    description: "Current rules. London mulligan, companions, day/night, full keyword suite.",
    manaBurn: false,
    freeMulligan: false,
    londonMulligan: true,
    stackType: "lifo",
    planeswalkers: true,
    commandZone: false,
    scry: true,
    exileZone: true,
    deathtouch: true,
    infect: true,
    dayNight: true,
    companions: true,
    startingHandSize: 7,
    startingLife: 20,
    drawOnFirstTurn: false,
    maxHandSize: 7,
    poisonCountersToWin: 10,
    combatDamageOnStack: false,
  },
};

// ============================================================
// KEYWORD REGISTRY
// ============================================================
const KEYWORDS = {
  FLYING:       { id:"FLYING",       name:"Flying",       classic:true,  modern:true,  desc:"Can only be blocked by creatures with flying or reach." },
  FIRST_STRIKE: { id:"FIRST_STRIKE", name:"First Strike",  classic:true,  modern:true,  desc:"Deals combat damage before creatures without first strike." },
  DOUBLE_STRIKE:{ id:"DOUBLE_STRIKE",name:"Double Strike", classic:false, modern:true,  desc:"Deals both first-strike and regular combat damage." },
  TRAMPLE:      { id:"TRAMPLE",      name:"Trample",       classic:true,  modern:true,  desc:"Excess combat damage is dealt to the defending player." },
  HASTE:        { id:"HASTE",        name:"Haste",         classic:true,  modern:true,  desc:"Can attack and use tap abilities the turn it enters the battlefield." },
  VIGILANCE:    { id:"VIGILANCE",    name:"Vigilance",     classic:true,  modern:true,  desc:"Attacking doesn't cause this creature to tap." },
  LIFELINK:     { id:"LIFELINK",     name:"Lifelink",      classic:false, modern:true,  desc:"Damage dealt also causes its controller to gain that much life." },
  DEATHTOUCH:   { id:"DEATHTOUCH",   name:"Deathtouch",    classic:false, modern:true,  desc:"Any amount of damage from this is enough to destroy a creature." },
  REACH:        { id:"REACH",        name:"Reach",         classic:false, modern:true,  desc:"Can block creatures with flying." },
  MENACE:       { id:"MENACE",       name:"Menace",        classic:false, modern:true,  desc:"Can only be blocked by two or more creatures." },
  PROTECTION:   { id:"PROTECTION",   name:"Protection",    classic:true,  modern:true,  desc:"Protected from damage, enchantments, blocking, and targeting by specified quality." },
  BANDING:      { id:"BANDING",      name:"Banding",       classic:true,  modern:false, desc:"Classic banding rules — can attack or block together with other banding creatures." },
  FLASH:        { id:"FLASH",        name:"Flash",         classic:false, modern:true,  desc:"Can be cast any time you could cast an instant." },
  HEXPROOF:     { id:"HEXPROOF",     name:"Hexproof",      classic:false, modern:true,  desc:"Can't be the target of spells or abilities your opponents control." },
  SHROUD:       { id:"SHROUD",       name:"Shroud",        classic:true,  modern:true,  desc:"Can't be the target of spells or abilities." },
  INDESTRUCTIBLE:{id:"INDESTRUCTIBLE",name:"Indestructible",classic:false,modern:true, desc:"Can't be destroyed by damage or destroy effects." },
  INFECT:       { id:"INFECT",       name:"Infect",        classic:false, modern:false, desc:"Deals damage in the form of -1/-1 counters to creatures, poison counters to players." },
};

// ============================================================
// CARD DATABASE  (Alpha–4th Ed. core + keywords)
// ============================================================
const CARD_DB = [
  // ── LANDS ──
  { id:"plains",   name:"Plains",   type:"Land", subtype:"Basic Plains",   color:"", cmc:0, cost:"",     text:"T: Add W.",   produces:["W"], rarity:"C" },
  { id:"island",   name:"Island",   type:"Land", subtype:"Basic Island",   color:"", cmc:0, cost:"",     text:"T: Add U.",   produces:["U"], rarity:"C" },
  { id:"swamp",    name:"Swamp",    type:"Land", subtype:"Basic Swamp",    color:"", cmc:0, cost:"",     text:"T: Add B.",   produces:["B"], rarity:"C" },
  { id:"mountain", name:"Mountain", type:"Land", subtype:"Basic Mountain", color:"", cmc:0, cost:"",     text:"T: Add R.",   produces:["R"], rarity:"C" },
  { id:"forest",   name:"Forest",   type:"Land", subtype:"Basic Forest",   color:"", cmc:0, cost:"",     text:"T: Add G.",   produces:["G"], rarity:"C" },
  { id:"scrubland",     name:"Scrubland",     type:"Land", subtype:"Land", color:"", cmc:0, cost:"", text:"T: Add W or B.", produces:["W","B"], rarity:"R" },
  { id:"tundra",        name:"Tundra",        type:"Land", subtype:"Land", color:"", cmc:0, cost:"", text:"T: Add W or U.", produces:["W","U"], rarity:"R" },
  { id:"underground_sea",name:"Underground Sea",type:"Land",subtype:"Land",color:"",cmc:0,cost:"",text:"T: Add U or B.", produces:["U","B"], rarity:"R" },
  { id:"badlands",      name:"Badlands",      type:"Land", subtype:"Land", color:"", cmc:0, cost:"", text:"T: Add B or R.", produces:["B","R"], rarity:"R" },
  { id:"taiga",         name:"Taiga",         type:"Land", subtype:"Land", color:"", cmc:0, cost:"", text:"T: Add R or G.", produces:["R","G"], rarity:"R" },

  // ── WHITE CREATURES ──
  { id:"savannah_lions",   name:"Savannah Lions",   type:"Creature", subtype:"Cat",     color:"W", cmc:1, cost:"W",   power:2, toughness:1, keywords:[], rarity:"R", text:"" },
  { id:"white_knight",     name:"White Knight",     type:"Creature", subtype:"Knight",  color:"W", cmc:2, cost:"WW",  power:2, toughness:2, keywords:["FIRST_STRIKE","PROTECTION"], protection:"B", rarity:"U", text:"First strike, protection from black." },
  { id:"serra_angel",      name:"Serra Angel",      type:"Creature", subtype:"Angel",   color:"W", cmc:5, cost:"3WW", power:4, toughness:4, keywords:["FLYING","VIGILANCE"], rarity:"U", text:"Flying, vigilance." },
  { id:"elder_land_wurm",  name:"Elder Land Wurm",  type:"Creature", subtype:"Wurm",   color:"W", cmc:8, cost:"5WWW",power:5, toughness:5, keywords:["TRAMPLE"], rarity:"R", text:"Trample. Elder Land Wurm can't be blocked by walls." },
  { id:"pearl_unicorn",    name:"Pearl Unicorn",    type:"Creature", subtype:"Unicorn", color:"W", cmc:2, cost:"1W",  power:1, toughness:2, keywords:[], rarity:"C", text:"" },
  { id:"benalish_hero",    name:"Benalish Hero",    type:"Creature", subtype:"Human",   color:"W", cmc:1, cost:"W",   power:1, toughness:1, keywords:["BANDING"], rarity:"C", text:"Banding." },
  { id:"mesa_pegasus",     name:"Mesa Pegasus",     type:"Creature", subtype:"Pegasus", color:"W", cmc:2, cost:"1W",  power:1, toughness:1, keywords:["FLYING","BANDING"], rarity:"C", text:"Flying, banding." },

  // ── BLUE CREATURES ──
  { id:"merfolk_pearl",    name:"Merfolk of the Pearl Trident", type:"Creature", subtype:"Merfolk", color:"U", cmc:1, cost:"U", power:1, toughness:1, keywords:[], rarity:"C", text:"Islandwalk." },
  { id:"mahamoti_djinn",   name:"Mahamoti Djinn",   type:"Creature", subtype:"Djinn",  color:"U", cmc:6, cost:"4UU", power:5, toughness:6, keywords:["FLYING"], rarity:"R", text:"Flying." },
  { id:"air_elemental",    name:"Air Elemental",    type:"Creature", subtype:"Elemental",color:"U",cmc:5, cost:"3UU", power:4, toughness:4, keywords:["FLYING"], rarity:"U", text:"Flying." },
  { id:"lord_atlantis",    name:"Lord of Atlantis", type:"Creature", subtype:"Merfolk", color:"U", cmc:2, cost:"UU",  power:2, toughness:2, keywords:[], rarity:"R", text:"Other Merfolk get +1/+1 and have islandwalk." },
  { id:"phantom_warrior",  name:"Phantom Warrior",  type:"Creature", subtype:"Illusion",color:"U", cmc:3, cost:"1UU", power:2, toughness:2, keywords:[], rarity:"U", text:"Phantom Warrior is unblockable." },
  { id:"prodigal_sorcerer",name:"Prodigal Sorcerer",type:"Creature", subtype:"Human Wizard",color:"U",cmc:3,cost:"2U",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Prodigal Sorcerer deals 1 damage to any target.",activated:{cost:"T",effect:"ping"} },

  // ── BLACK CREATURES ──
  { id:"hypnotic_specter",  name:"Hypnotic Specter",  type:"Creature", subtype:"Specter",  color:"B", cmc:3, cost:"1BB", power:2, toughness:2, keywords:["FLYING"], rarity:"U", text:"Flying. Whenever Hypnotic Specter deals combat damage to a player, that player discards a card at random." },
  { id:"sengir_vampire",    name:"Sengir Vampire",    type:"Creature", subtype:"Vampire",  color:"B", cmc:5, cost:"3BB", power:4, toughness:4, keywords:["FLYING"], rarity:"U", text:"Flying. Whenever a creature dealt damage by Sengir Vampire dies, put a +1/+1 counter on Sengir Vampire.", triggered:"vampireCounter" },
  { id:"juzam_djinn",       name:"Juzam Djinn",       type:"Creature", subtype:"Djinn",    color:"B", cmc:4, cost:"2BB", power:5, toughness:5, keywords:[], rarity:"R", text:"At the beginning of your upkeep, Juzam Djinn deals 1 damage to you.", upkeep:"selfDamage1" },
  { id:"drudge_skeletons",  name:"Drudge Skeletons",  type:"Creature", subtype:"Skeleton", color:"B", cmc:2, cost:"1B",  power:1, toughness:1, keywords:[], rarity:"C", text:"B: Regenerate Drudge Skeletons.", activated:{cost:"B",effect:"regenerate"} },
  { id:"black_knight",      name:"Black Knight",      type:"Black Knight", subtype:"Knight",color:"B",cmc:2,cost:"BB",power:2,toughness:2,keywords:["FIRST_STRIKE","PROTECTION"],protection:"W",rarity:"U",text:"First strike, protection from white." },
  { id:"royal_assassin",    name:"Royal Assassin",    type:"Creature", subtype:"Human Assassin",color:"B",cmc:3,cost:"1BB",power:1,toughness:1,keywords:[],rarity:"R",text:"T: Destroy target tapped creature.",activated:{cost:"T",effect:"destroyTapped"} },

  // ── RED CREATURES ──
  { id:"goblin_king",       name:"Goblin King",      type:"Creature", subtype:"Goblin",  color:"R", cmc:3, cost:"1RR", power:2, toughness:2, keywords:[], rarity:"R", text:"Other Goblins get +1/+1 and have mountainwalk." },
  { id:"shivan_dragon",     name:"Shivan Dragon",    type:"Creature", subtype:"Dragon",  color:"R", cmc:6, cost:"4RR", power:5, toughness:5, keywords:["FLYING"], rarity:"R", text:"Flying. R: Shivan Dragon gets +1/+0 until end of turn.", activated:{cost:"R",effect:"pumpPower"} },
  { id:"earth_elemental",   name:"Earth Elemental",  type:"Creature", subtype:"Elemental",color:"R",cmc:5, cost:"3RR", power:4, toughness:5, keywords:[], rarity:"U", text:"" },
  { id:"goblin_balloon",    name:"Goblin Balloon Brigade",type:"Creature",subtype:"Goblin",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"C",text:"R: Goblin Balloon Brigade gains flying until end of turn.",activated:{cost:"R",effect:"gainFlying"} },
  { id:"mons_goblin",       name:"Mons's Goblin Raiders",type:"Creature",subtype:"Goblin",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[],rarity:"C",text:"" },

  // ── GREEN CREATURES ──
  { id:"llanowar_elves",    name:"Llanowar Elves",   type:"Creature", subtype:"Elf Druid",color:"G", cmc:1, cost:"G",   power:1, toughness:1, keywords:[], rarity:"C", text:"T: Add G.", activated:{cost:"T",effect:"addMana",mana:"G"} },
  { id:"craw_wurm",         name:"Craw Wurm",        type:"Creature", subtype:"Wurm",    color:"G", cmc:6, cost:"4GG",  power:6, toughness:4, keywords:[], rarity:"C", text:"" },
  { id:"force_of_nature",   name:"Force of Nature",  type:"Creature", subtype:"Elemental",color:"G",cmc:8, cost:"2GGGG",power:8, toughness:8, keywords:["TRAMPLE"], rarity:"R", text:"Trample. At the beginning of your upkeep, pay GGGG or Force of Nature deals 8 damage to you.", upkeep:"forestChoice" },
  { id:"grizzly_bears",     name:"Grizzly Bears",    type:"Creature", subtype:"Bear",    color:"G", cmc:2, cost:"1G",   power:2, toughness:2, keywords:[], rarity:"C", text:"" },
  { id:"birds_of_paradise", name:"Birds of Paradise",type:"Creature", subtype:"Bird",    color:"G", cmc:1, cost:"G",    power:0, toughness:1, keywords:["FLYING"], rarity:"R", text:"Flying. T: Add one mana of any color.", activated:{cost:"T",effect:"addManaAny"} },
  { id:"giant_spider",      name:"Giant Spider",     type:"Creature", subtype:"Spider",  color:"G", cmc:4, cost:"3G",   power:2, toughness:4, keywords:["REACH"], rarity:"C", text:"Reach." },

  // ── WHITE SPELLS ──
  { id:"swords",    name:"Swords to Plowshares", type:"Instant", color:"W", cmc:1, cost:"W",   text:"Exile target creature. Its controller gains life equal to its power.", effect:"exileCreature", rarity:"U" },
  { id:"wog",       name:"Wrath of God",         type:"Sorcery", color:"W", cmc:4, cost:"2WW", text:"Destroy all creatures. They can't be regenerated.", effect:"wrathAllCreatures", rarity:"R" },
  { id:"disenchant",name:"Disenchant",           type:"Instant", color:"W", cmc:2, cost:"1W",  text:"Destroy target artifact or enchantment.", effect:"destroyArtifactEnchantment", rarity:"C" },
  { id:"armageddon",name:"Armageddon",           type:"Sorcery", color:"W", cmc:4, cost:"3W",  text:"Destroy all lands.", effect:"destroyAllLands", rarity:"R" },
  { id:"holy_armor",name:"Holy Armor",           type:"Enchantment", subtype:"Aura", color:"W", cmc:2, cost:"1W", text:"Enchanted creature gets +0/+2 and W: it gets an additional +0/+1.", effect:"enchantCreature", mod:{toughness:2}, rarity:"C" },
  { id:"healing_salve",name:"Healing Salve",     type:"Instant", color:"W", cmc:1, cost:"W",   text:"Choose one — Target player gains 3 life; or prevent the next 3 damage that would be dealt to any target this turn.", effect:"gainLife3", rarity:"C" },

  // ── BLUE SPELLS ──
  { id:"counterspell",  name:"Counterspell",    type:"Instant", color:"U", cmc:2, cost:"UU",  text:"Counter target spell.", effect:"counter", rarity:"U" },
  { id:"ancestral",     name:"Ancestral Recall",type:"Instant", color:"U", cmc:1, cost:"U",   text:"Target player draws three cards.", effect:"draw3", rarity:"R" },
  { id:"time_walk",     name:"Time Walk",       type:"Sorcery", color:"U", cmc:2, cost:"1U",  text:"Take an extra turn after this one.", effect:"extraTurn", rarity:"R" },
  { id:"braingeyser",   name:"Braingeyser",     type:"Sorcery", color:"U", cmc:3, cost:"XUU", text:"Target player draws X cards.", effect:"drawX", rarity:"R" },
  { id:"unsummon",      name:"Unsummon",        type:"Instant", color:"U", cmc:1, cost:"U",   text:"Return target creature to its owner's hand.", effect:"bounce", rarity:"C" },
  { id:"psionic_blast", name:"Psionic Blast",   type:"Instant", color:"U", cmc:3, cost:"2U",  text:"Psionic Blast deals 4 damage to any target and 2 damage to you.", effect:"psionicBlast", rarity:"U" },
  { id:"power_sink",    name:"Power Sink",      type:"Instant", color:"U", cmc:2, cost:"XU",  text:"Counter target spell unless its controller pays X. If they don't, they tap all lands and lose all unspent mana.", effect:"powerSink", rarity:"C" },

  // ── BLACK SPELLS ──
  { id:"dark_ritual",  name:"Dark Ritual",    type:"Instant", color:"B", cmc:1, cost:"B",   text:"Add BBB.", effect:"addMana", mana:["B","B","B"], rarity:"C" },
  { id:"terror",       name:"Terror",         type:"Instant", color:"B", cmc:2, cost:"1B",  text:"Destroy target non-artifact, non-black creature. It can't be regenerated.", effect:"destroy", restriction:"nonArtifactNonBlack", rarity:"C" },
  { id:"demonic_tutor",name:"Demonic Tutor",  type:"Sorcery", color:"B", cmc:2, cost:"1B",  text:"Search your library for a card, put that card into your hand, then shuffle.", effect:"tutor", rarity:"U" },
  { id:"mind_twist",   name:"Mind Twist",     type:"Sorcery", color:"B", cmc:2, cost:"XB",  text:"Target player discards X cards at random.", effect:"discardX", rarity:"R" },
  { id:"royal_decree", name:"Animate Dead",   type:"Enchantment", subtype:"Aura", color:"B", cmc:2, cost:"1B", text:"Return target creature card from a graveyard to the battlefield under your control. It gets -1/-0.", effect:"reanimate", rarity:"U" },
  { id:"dark_banishing",name:"Dark Banishing",type:"Instant", color:"B", cmc:3, cost:"2B",  text:"Destroy target non-black creature. It can't be regenerated.", effect:"destroy", restriction:"nonBlack", rarity:"C" },
  { id:"plague_rats",  name:"Plague Rats",    type:"Creature", subtype:"Rat", color:"B", cmc:2, cost:"2B", power:0, toughness:0, keywords:[], rarity:"C", text:"Plague Rats' power and toughness are each equal to the number of Plague Rats on the battlefield.", dynamic:true },

  // ── RED SPELLS ──
  { id:"lightning_bolt",name:"Lightning Bolt", type:"Instant", color:"R", cmc:1, cost:"R",   text:"Lightning Bolt deals 3 damage to any target.", effect:"damage3", rarity:"C" },
  { id:"fireball",      name:"Fireball",       type:"Sorcery", color:"R", cmc:2, cost:"XR",  text:"Fireball deals X damage divided among any number of targets.", effect:"damageX", divided:true, rarity:"C" },
  { id:"chain_lightning",name:"Chain Lightning",type:"Sorcery",color:"R", cmc:1, cost:"R",   text:"Chain Lightning deals 3 damage to any target. If a player is dealt damage this way, they may pay RR. If they do, they may copy this spell.", effect:"chainLightning", rarity:"C" },
  { id:"wheel_of_fortune",name:"Wheel of Fortune",type:"Sorcery",color:"R",cmc:3,cost:"2R", text:"Each player discards their hand, then draws seven cards.", effect:"wheelOfFortune", rarity:"R" },
  { id:"shatter",       name:"Shatter",        type:"Instant", color:"R", cmc:2, cost:"1R",  text:"Destroy target artifact.", effect:"destroyArtifact", rarity:"C" },
  { id:"lava_axe",      name:"Lava Axe",       type:"Sorcery", color:"R", cmc:5, cost:"4R",  text:"Lava Axe deals 5 damage to target player or planeswalker.", effect:"damage5", targetType:"player", rarity:"C" },

  // ── GREEN SPELLS ──
  { id:"giant_growth",  name:"Giant Growth",   type:"Instant", color:"G", cmc:1, cost:"G",   text:"Target creature gets +3/+3 until end of turn.", effect:"pumpCreature", mod:{power:3,toughness:3}, rarity:"C" },
  { id:"stream_of_life",name:"Stream of Life", type:"Sorcery", color:"G", cmc:2, cost:"XG",  text:"Target player gains X life.", effect:"gainLifeX", rarity:"C" },
  { id:"regrowth",      name:"Regrowth",       type:"Sorcery", color:"G", cmc:2, cost:"1G",  text:"Return target card from your graveyard to your hand.", effect:"regrowth", rarity:"U" },
  { id:"natural_order", name:"Hurricane",      type:"Sorcery", color:"G", cmc:2, cost:"XG",  text:"Hurricane deals X damage to each creature with flying and each player.", effect:"hurricane", rarity:"U" },
  { id:"fyndhorn_elves",name:"Fyndhorn Elves", type:"Creature",subtype:"Elf Druid",color:"G",cmc:1,cost:"G",power:1,toughness:1,keywords:[],rarity:"C",text:"T: Add G.",activated:{cost:"T",effect:"addMana",mana:"G"} },

  // ── ARTIFACTS ──
  { id:"black_lotus",   name:"Black Lotus",    type:"Artifact", color:"", cmc:0, cost:"0",   text:"T, Sacrifice Black Lotus: Add three mana of any one color.", rarity:"R", effect:"lotusActivated", activated:{cost:"T,sac",effect:"addMana3Any"} },
  { id:"mox_pearl",     name:"Mox Pearl",      type:"Artifact", color:"", cmc:0, cost:"0",   text:"T: Add W.", rarity:"R", activated:{cost:"T",effect:"addMana",mana:"W"} },
  { id:"mox_sapphire",  name:"Mox Sapphire",   type:"Artifact", color:"", cmc:0, cost:"0",   text:"T: Add U.", rarity:"R", activated:{cost:"T",effect:"addMana",mana:"U"} },
  { id:"mox_jet",       name:"Mox Jet",        type:"Artifact", color:"", cmc:0, cost:"0",   text:"T: Add B.", rarity:"R", activated:{cost:"T",effect:"addMana",mana:"B"} },
  { id:"mox_ruby",      name:"Mox Ruby",       type:"Artifact", color:"", cmc:0, cost:"0",   text:"T: Add R.", rarity:"R", activated:{cost:"T",effect:"addMana",mana:"R"} },
  { id:"mox_emerald",   name:"Mox Emerald",    type:"Artifact", color:"", cmc:0, cost:"0",   text:"T: Add G.", rarity:"R", activated:{cost:"T",effect:"addMana",mana:"G"} },
  { id:"sol_ring",      name:"Sol Ring",        type:"Artifact", color:"", cmc:1, cost:"1",   text:"T: Add CC.", rarity:"U", activated:{cost:"T",effect:"addMana",mana:"CC"} },
  { id:"jayemdae_tome", name:"Jayemdae Tome",  type:"Artifact", color:"", cmc:4, cost:"4",   text:"4, T: Draw a card.", rarity:"R", activated:{cost:"4,T",effect:"draw1"} },
  { id:"nevinyrral_disk",name:"Nevinyrral's Disk",type:"Artifact",color:"",cmc:4,cost:"4",   text:"Nevinyrral's Disk enters tapped. 1, T, Sacrifice it: Destroy all artifacts, creatures, and enchantments.", rarity:"U", activated:{cost:"1,T,sac",effect:"armageddonDisk"} },
];

const cardById = id => CARD_DB.find(c => c.id === id) || null;

// ============================================================
// DECK ARCHETYPES  (AI opponents)
// ============================================================
const ARCHETYPES = {
  WHITE_WEENIE: {
    name:"White Weenie", color:"W", strategy:"aggro",
    deck: [
      ...Array(4).fill("savannah_lions"), ...Array(4).fill("white_knight"),
      ...Array(3).fill("benalish_hero"),  ...Array(3).fill("mesa_pegasus"),
      ...Array(2).fill("pearl_unicorn"),  ...Array(2).fill("serra_angel"),
      ...Array(2).fill("swords"),         ...Array(2).fill("disenchant"),
      ...Array(2).fill("wog"),            ...Array(2).fill("healing_salve"),
      ...Array(2).fill("holy_armor"),
      ...Array(18).fill("plains"),
    ]
  },
  BLUE_CONTROL: {
    name:"Blue Control", color:"U", strategy:"control",
    deck: [
      ...Array(4).fill("counterspell"),   ...Array(2).fill("ancestral"),
      ...Array(3).fill("power_sink"),     ...Array(3).fill("unsummon"),
      ...Array(2).fill("psionic_blast"),  ...Array(2).fill("braingeyser"),
      ...Array(4).fill("merfolk_pearl"),  ...Array(2).fill("lord_atlantis"),
      ...Array(3).fill("phantom_warrior"),  ...Array(2).fill("air_elemental"),
      ...Array(2).fill("mahamoti_djinn"), ...Array(1).fill("time_walk"),
      ...Array(20).fill("island"),
    ]
  },
  BLACK_REANIMATOR: {
    name:"Black Reanimator", color:"B", strategy:"combo",
    deck: [
      ...Array(4).fill("dark_ritual"),    ...Array(3).fill("hypnotic_specter"),
      ...Array(2).fill("juzam_djinn"),    ...Array(3).fill("sengir_vampire"),
      ...Array(3).fill("terror"),         ...Array(2).fill("dark_banishing"),
      ...Array(2).fill("demonic_tutor"),  ...Array(2).fill("mind_twist"),
      ...Array(2).fill("royal_decree"),   ...Array(2).fill("drudge_skeletons"),
      ...Array(2).fill("royal_assassin"), ...Array(2).fill("black_knight"),
      ...Array(19).fill("swamp"),
    ]
  },
  RED_BURN: {
    name:"Red Burn", color:"R", strategy:"aggro",
    deck: [
      ...Array(4).fill("lightning_bolt"), ...Array(4).fill("chain_lightning"),
      ...Array(3).fill("fireball"),       ...Array(2).fill("lava_axe"),
      ...Array(4).fill("mons_goblin"),    ...Array(3).fill("goblin_balloon"),
      ...Array(3).fill("goblin_king"),    ...Array(2).fill("shivan_dragon"),
      ...Array(2).fill("shatter"),        ...Array(2).fill("wheel_of_fortune"),
      ...Array(19).fill("mountain"),
    ]
  },
  GREEN_STOMPY: {
    name:"Green Stompy", color:"G", strategy:"aggro",
    deck: [
      ...Array(4).fill("llanowar_elves"), ...Array(4).fill("fyndhorn_elves"),
      ...Array(4).fill("grizzly_bears"),  ...Array(3).fill("giant_spider"),
      ...Array(2).fill("craw_wurm"),      ...Array(2).fill("force_of_nature"),
      ...Array(2).fill("birds_of_paradise"), ...Array(3).fill("giant_growth"),
      ...Array(2).fill("regrowth"),       ...Array(2).fill("stream_of_life"),
      ...Array(2).fill("natural_order"),
      ...Array(18).fill("forest"),
    ]
  },
  FIVE_COLOR_BOMB: {
    name:"Five-Color Chaos", color:"WUBRG", strategy:"bomb",
    deck: [
      "black_lotus","sol_ring","ancestral","time_walk","demonic_tutor",
      ...Array(2).fill("mox_pearl"), ...Array(2).fill("mox_sapphire"),
      ...Array(2).fill("mox_jet"),   ...Array(2).fill("mox_ruby"),
      ...Array(2).fill("mox_emerald"),
      "swords","wog","armageddon","counterspell","mind_twist",
      "serra_angel","mahamoti_djinn","shivan_dragon","force_of_nature","juzam_djinn",
      ...Array(4).fill("plains"), ...Array(4).fill("island"),
      ...Array(3).fill("swamp"),  ...Array(4).fill("mountain"), ...Array(3).fill("forest"),
    ]
  },
};

// ============================================================
// GAME STATE SHAPE
// ============================================================
const ZONES = { LIBRARY:"library", HAND:"hand", BATTLEFIELD:"battlefield", GRAVEYARD:"graveyard", EXILE:"exile", STACK:"stack" };
const PHASES = ["UNTAP","UPKEEP","DRAW","MAIN1","DECLARE_ATTACKERS","DECLARE_BLOCKERS","FIRST_STRIKE","COMBAT_DAMAGE","POST_COMBAT","MAIN2","END","CLEANUP"];
const PHASE_LABELS = {
  UNTAP:"Untap", UPKEEP:"Upkeep", DRAW:"Draw", MAIN1:"Main 1",
  DECLARE_ATTACKERS:"Attackers", DECLARE_BLOCKERS:"Blockers",
  FIRST_STRIKE:"First Strike", COMBAT_DAMAGE:"Combat Damage",
  POST_COMBAT:"Post Combat", MAIN2:"Main 2", END:"End", CLEANUP:"Cleanup"
};

function makeId() { return Math.random().toString(36).slice(2,9); }

function makeCardInstance(cardId, controller) {
  const def = CARD_DB.find(c => c.id === cardId);
  if (!def) return null;
  return {
    ...def,
    iid: makeId(),          // instance id (unique per card object on battlefield)
    controller,
    tapped: false,
    summoningSick: true,
    attacking: false,
    blocking: null,         // iid of creature being blocked
    damage: 0,              // damage marked on this permanent
    counters: {},           // { "P1P1": 2, "M1M1": 1 }
    enchantments: [],       // auras attached
    tokens: [],
    exerted: false,
  };
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [d[i],d[j]] = [d[j],d[i]];
  }
  return d;
}

function buildInitialState(playerDeckIds, opponentArchetypeKey, ruleset) {
  const playerDeck  = shuffleDeck(playerDeckIds.map(id => makeCardInstance(id, "player")));
  const opDeckIds   = ARCHETYPES[opponentArchetypeKey]?.deck || ARCHETYPES.RED_BURN.deck;
  const opDeck      = shuffleDeck(opDeckIds.map(id => makeCardInstance(id, "opponent")));

  const playerHand  = playerDeck.splice(0, ruleset.startingHandSize);
  const opHand      = opDeck.splice(0, ruleset.startingHandSize);

  return {
    ruleset,
    phase: "MAIN1",
    activePlayer: "player",           // whose turn
    priorityPlayer: "player",
    turn: 1,
    landsPlayedThisTurn: 0,

    player: {
      id: "player",
      life: ruleset.startingLife,
      library: playerDeck,
      hand: playerHand,
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: { W:0, U:0, B:0, R:0, G:0, C:0 },
      poisonCounters: 0,
      extraTurns: 0,
      mulligansThisTurn: 0,
    },
    opponent: {
      id: "opponent",
      life: ruleset.startingLife,
      library: opDeck,
      hand: opHand,
      battlefield: [],
      graveyard: [],
      exile: [],
      manaPool: { W:0, U:0, B:0, R:0, G:0, C:0 },
      poisonCounters: 0,
      extraTurns: 0,
      mulligansThisTurn: 0,
    },

    stack: [],                        // array of StackItem
    attackers: [],                    // iids of attacking creatures
    blockers: {},                     // { blockerIid: attackerIid }

    log: [],
    animationQueue: [],
    gameOver: null,                   // null | { winner: "player"|"opponent", reason }
    selectedCard: null,               // iid of selected card in hand
    selectedTarget: null,             // iid of selected target on battlefield
    awaitingTarget: null,             // { spell: StackItem, targetType }
    firstStrikeHandled: false,
    opponentMulligan: false,
  };
}

// ============================================================
// CORE RULES ENGINE  (pure functions)
// ============================================================

function getOwner(state, iid) {
  for (const who of ["player","opponent"]) {
    for (const zone of Object.values(ZONES)) {
      const list = zone === "stack" ? state.stack : (state[who]?.[zone] || []);
      if (list.find?.(c => c?.iid === iid)) return who;
    }
  }
  return null;
}

function getBattlefieldCard(state, iid) {
  return state.player.battlefield.find(c=>c.iid===iid)
      || state.opponent.battlefield.find(c=>c.iid===iid)
      || null;
}

function getAllCreatures(state) {
  return [
    ...state.player.battlefield.filter(c=>c.type?.startsWith("Creature")),
    ...state.opponent.battlefield.filter(c=>c.type?.startsWith("Creature")),
  ];
}

function getPower(card, state) {
  let p = card.power ?? 0;
  if (card.dynamic && card.name === "Plague Rats") {
    p = getAllCreatures(state).filter(c=>c.name==="Plague Rats").length;
  }
  p += card.counters?.["P1P1"] ?? 0;
  p -= card.counters?.["M1M1"] ?? 0;
  return Math.max(0, p);
}

function getToughness(card, state) {
  let t = card.toughness ?? 0;
  if (card.dynamic && card.name === "Plague Rats") {
    t = getAllCreatures(state).filter(c=>c.name==="Plague Rats").length;
  }
  t += card.counters?.["P1P1"] ?? 0;
  t -= card.counters?.["M1M1"] ?? 0;
  return Math.max(0, t);
}

function hasKeyword(card, kw) {
  return card.keywords?.includes(kw);
}

function canBlock(blocker, attacker) {
  if (hasKeyword(attacker, "FLYING") && !hasKeyword(blocker, "FLYING") && !hasKeyword(blocker, "REACH")) return false;
  if (hasKeyword(attacker, "MENACE")) {
    // handled at declaration level
  }
  return true;
}

function parseManaString(cost) {
  if (!cost) return { W:0, U:0, B:0, R:0, G:0, C:0, generic:0 };
  const pool = { W:0, U:0, B:0, R:0, G:0, C:0, generic:0 };
  let i = 0;
  while (i < cost.length) {
    const ch = cost[i];
    if ("WUBRG".includes(ch)) { pool[ch]++; i++; }
    else if (ch === "C") { pool.C++; i++; }
    else if (ch === "X") { i++; }          // X handled separately
    else if (!isNaN(parseInt(ch))) {
      let num = "";
      while (i < cost.length && !isNaN(parseInt(cost[i]))) { num += cost[i]; i++; }
      pool.generic += parseInt(num);
    } else i++;
  }
  return pool;
}

function canAfford(manaPool, cost) {
  const req = parseManaString(cost);
  const avail = { ...manaPool };
  for (const color of ["W","U","B","R","G","C"]) {
    if (avail[color] < req[color]) return false;
    avail[color] -= req[color];
  }
  const totalAvail = Object.values(avail).reduce((a,b)=>a+b,0);
  return totalAvail >= req.generic;
}

function spendMana(manaPool, cost) {
  const req = parseManaString(cost);
  const pool = { ...manaPool };
  for (const color of ["W","U","B","R","G","C"]) {
    pool[color] = Math.max(0, pool[color] - req[color]);
  }
  let generic = req.generic;
  for (const color of ["C","G","R","B","U","W"]) {
    const spend = Math.min(pool[color], generic);
    pool[color] -= spend;
    generic -= spend;
  }
  return pool;
}

function isLand(card) { return card.type === "Land"; }
function isCreature(card) { return card.type?.startsWith("Creature"); }
function isInstant(card) { return card.type === "Instant"; }
function isSorcery(card) { return card.type === "Sorcery"; }
function isArtifact(card) { return card.type === "Artifact"; }
function isEnchantment(card) { return card.type?.startsWith("Enchantment"); }

function canCastNow(card, state, who) {
  const isActive = state.activePlayer === who;
  const mainPhase = state.phase === "MAIN1" || state.phase === "MAIN2";
  if (isLand(card)) return isActive && mainPhase && state.landsPlayedThisTurn < 1;
  if (isInstant(card) || hasKeyword(card, "FLASH")) return canAfford(state[who].manaPool, card.cost);
  if (isCreature(card) || isSorcery(card) || isArtifact(card) || isEnchantment(card)) {
    return isActive && mainPhase && state.stack.length === 0 && canAfford(state[who].manaPool, card.cost);
  }
  return false;
}

// ============================================================
// STATE REDUCER  (all game actions run through here)
// ============================================================
function addLog(state, text, type="info") {
  return { ...state, log: [...state.log.slice(-120), { text, type, turn:state.turn, phase:state.phase }] };
}

function modifyLife(state, who, delta, source="") {
  const newLife = state[who].life + delta;
  let s = { ...state, [who]: { ...state[who], life: newLife } };
  if (delta > 0) s = addLog(s, `${who} gains ${delta} life. (now ${newLife})`, "heal");
  else if (delta < 0) s = addLog(s, `${who} takes ${-delta} damage${source?` from ${source}`:""}.`, "damage");
  if (newLife <= 0) s = { ...s, gameOver: { winner: who==="player"?"opponent":"player", reason:`${who} reached 0 life` } };
  if (state[who].library.length === 0 && delta < 0) {
    // checked at draw time
  }
  return s;
}

function drawCard(state, who, n=1) {
  let s = state;
  for (let i = 0; i < n; i++) {
    if (s[who].library.length === 0) {
      s = { ...s, gameOver: { winner: who==="player"?"opponent":"player", reason:`${who} tried to draw from an empty library` } };
      return s;
    }
    const [top, ...rest] = s[who].library;
    s = { ...s, [who]: { ...s[who], library: rest, hand: [...s[who].hand, top] } };
    s = addLog(s, `${who} draws a card.`, "draw");
  }
  return s;
}

function moveCard(state, iid, fromWho, fromZone, toWho, toZone) {
  let card = state[fromWho][fromZone]?.find(c=>c.iid===iid);
  if (!card) {
    // check other zones
    for (const z of Object.values(ZONES)) {
      const found = state[fromWho]?.[z]?.find?.(c=>c.iid===iid);
      if (found) { card=found; break; }
    }
  }
  if (!card) return state;
  let s = { ...state };
  // remove from source
  for (const z of Object.values(ZONES)) {
    if (s[fromWho]?.[z]) {
      s = { ...s, [fromWho]: { ...s[fromWho], [z]: s[fromWho][z].filter(c=>c.iid!==iid) } };
    }
  }
  // reset card state when entering a zone
  let arriving = { ...card };
  if (toZone === "battlefield") {
    arriving = { ...arriving, tapped: false, summoningSick: true, attacking: false, blocking: null, damage: 0, controller: toWho };
    if (hasKeyword(card, "HASTE")) arriving.summoningSick = false;
  }
  if (toZone === "graveyard" || toZone === "hand" || toZone === "library") {
    arriving = { ...arriving, tapped: false, damage: 0, counters: {}, attacking: false, blocking: null };
  }
  s = { ...s, [toWho]: { ...s[toWho], [toZone]: [...(s[toWho][toZone]||[]), arriving] } };
  return s;
}

function untapAll(state, who) {
  return {
    ...state,
    [who]: {
      ...state[who],
      battlefield: state[who].battlefield.map(c => ({ ...c, tapped: false, summoningSick: false, damage: 0 }))
    }
  };
}

function tapLand(state, who, iid, manaColor) {
  const land = state[who].battlefield.find(c=>c.iid===iid);
  if (!land || land.tapped || !isLand(land)) return state;
  // determine what mana it produces
  let produced = manaColor;
  if (!produced) {
    produced = land.produces?.[0] || "C";
  }
  let s = {
    ...state,
    [who]: {
      ...state[who],
      battlefield: state[who].battlefield.map(c=>c.iid===iid?{...c,tapped:true}:c),
      manaPool: { ...state[who].manaPool, [produced]: (state[who].manaPool[produced]||0)+1 },
    }
  };
  return addLog(s, `${who} taps ${land.name} → +1 ${produced}.`, "mana");
}

function tapArtifactForMana(state, who, iid) {
  const artifact = state[who].battlefield.find(c=>c.iid===iid);
  if (!artifact || artifact.tapped || !isArtifact(artifact) || !artifact.activated) return state;
  const act = artifact.activated;
  if (!act.effect.startsWith("addMana")) return state;
  const manaStr = act.mana || "";
  let s = {
    ...state,
    [who]: {
      ...state[who],
      battlefield: state[who].battlefield.map(c=>c.iid===iid?{...c,tapped:true}:c),
    }
  };
  // parse mana string
  for (const ch of manaStr) {
    if ("WUBRGC".includes(ch)) {
      s = { ...s, [who]: { ...s[who], manaPool: { ...s[who].manaPool, [ch]: (s[who].manaPool[ch]||0)+1 } } };
    }
  }
  return addLog(s, `${who} taps ${artifact.name} for mana.`, "mana");
}

function clearManaBurn(state, who, ruleset) {
  if (!ruleset.manaBurn) {
    return { ...state, [who]: { ...state[who], manaPool: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
  }
  const pool = state[who].manaPool;
  const unspent = Object.values(pool).reduce((a,b)=>a+b,0);
  let s = { ...state, [who]: { ...state[who], manaPool: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
  if (unspent > 0) {
    s = modifyLife(s, who, -unspent, "mana burn");
    s = addLog(s, `⚠ Mana burn! ${who} takes ${unspent} damage from unspent mana.`, "damage");
  }
  return s;
}

// ── RESOLUTION EFFECTS ──────────────────────────────────────
function resolveEffect(state, stackItem) {
  const { card, caster, targets } = stackItem;
  let s = state;
  const effect = card.effect;
  const opp = caster === "player" ? "opponent" : "player";

  const targetCreature = targets?.[0] ? getBattlefieldCard(s, targets[0]) : null;
  const targetPlayer = targets?.[0] === "player" || targets?.[0] === "opponent" ? targets[0] : null;

  switch(effect) {
    case "damage3": {
      const t = targets?.[0];
      if (t === "player" || t === "opponent") s = modifyLife(s, t, -3, card.name);
      else if (targetCreature) {
        s = { ...s, [targetCreature.controller]: { ...s[targetCreature.controller], battlefield: s[targetCreature.controller].battlefield.map(c=>c.iid===targetCreature.iid?{...c,damage:c.damage+3}:c) } };
        s = addLog(s, `${card.name} deals 3 damage to ${targetCreature.name}.`, "damage");
        s = checkCreatureDeath(s);
      }
      break;
    }
    case "damage5": {
      const t = targets?.[0] || opp;
      s = modifyLife(s, t, -5, card.name);
      break;
    }
    case "damageX": {
      const x = stackItem.xValue || 0;
      const t = targets?.[0] || opp;
      if (t === "player" || t === "opponent") s = modifyLife(s, t, -x, card.name);
      break;
    }
    case "chainLightning": {
      const t = targets?.[0] || opp;
      if (t === "player" || t === "opponent") s = modifyLife(s, t, -3, card.name);
      break;
    }
    case "psionicBlast": {
      const t = targets?.[0] || opp;
      if (t === "player" || t === "opponent") s = modifyLife(s, t, -4, card.name);
      s = modifyLife(s, caster, -2, "Psionic Blast (self)");
      break;
    }
    case "counter": {
      const topped = s.stack[s.stack.length-1];
      if (topped && topped.id !== stackItem.id) {
        s = { ...s, stack: s.stack.filter(i=>i.id!==topped.id) };
        const tCard = topped.card;
        if (tCard) {
          s = { ...s, [topped.caster]: { ...s[topped.caster], graveyard: [...s[topped.caster].graveyard, {...tCard}] } };
        }
        s = addLog(s, `${card.name} counters ${topped.card?.name||"a spell"}.`, "effect");
      } else {
        s = addLog(s, `${card.name} fizzles — nothing to counter.`, "info");
      }
      break;
    }
    case "draw3": {
      const t = targets?.[0] || caster;
      if (t === "player" || t === "opponent") s = drawCard(s, t, 3);
      else s = drawCard(s, caster, 3);
      break;
    }
    case "draw1": {
      s = drawCard(s, caster, 1);
      break;
    }
    case "drawX": {
      s = drawCard(s, caster, stackItem.xValue || 0);
      break;
    }
    case "gainLife3": {
      s = modifyLife(s, caster, 3);
      break;
    }
    case "gainLifeX": {
      s = modifyLife(s, caster, stackItem.xValue || 0);
      break;
    }
    case "bounce": {
      if (targetCreature) {
        const ctrl = targetCreature.controller;
        s = moveCard(s, targetCreature.iid, ctrl, "battlefield", ctrl, "hand");
        s = addLog(s, `${card.name} returns ${targetCreature.name} to ${ctrl}'s hand.`, "effect");
      }
      break;
    }
    case "exileCreature": {
      if (targetCreature) {
        const ctrl = targetCreature.controller;
        const lifeGain = getPower(targetCreature, s);
        s = moveCard(s, targetCreature.iid, ctrl, "battlefield", ctrl, s.ruleset.exileZone?"exile":"graveyard");
        s = modifyLife(s, ctrl, lifeGain, "Swords to Plowshares");
        s = addLog(s, `${card.name} exiles ${targetCreature.name}. ${ctrl} gains ${lifeGain} life.`, "effect");
      }
      break;
    }
    case "destroy": {
      if (targetCreature) {
        const r = card.restriction;
        let ok = true;
        if (r === "nonArtifactNonBlack" && (targetCreature.color==="B" || isArtifact(targetCreature))) ok=false;
        if (r === "nonBlack" && targetCreature.color==="B") ok=false;
        if (ok) {
          s = moveCard(s, targetCreature.iid, targetCreature.controller, "battlefield", targetCreature.controller, "graveyard");
          s = addLog(s, `${card.name} destroys ${targetCreature.name}.`, "effect");
        } else {
          s = addLog(s, `${card.name} can't destroy ${targetCreature.name} (restriction).`, "info");
        }
      }
      break;
    }
    case "destroyArtifact": {
      if (targetCreature && isArtifact(targetCreature)) {
        s = moveCard(s, targetCreature.iid, targetCreature.controller, "battlefield", targetCreature.controller, "graveyard");
        s = addLog(s, `${card.name} destroys ${targetCreature.name}.`, "effect");
      }
      break;
    }
    case "destroyArtifactEnchantment": {
      if (targetCreature && (isArtifact(targetCreature)||isEnchantment(targetCreature))) {
        s = moveCard(s, targetCreature.iid, targetCreature.controller, "battlefield", targetCreature.controller, "graveyard");
        s = addLog(s, `${card.name} destroys ${targetCreature.name}.`, "effect");
      }
      break;
    }
    case "wrathAllCreatures": {
      s = addLog(s, `${card.name} — all creatures are destroyed!`, "effect");
      for (const who of ["player","opponent"]) {
        const creatures = s[who].battlefield.filter(isCreature);
        for (const c of creatures) {
          s = moveCard(s, c.iid, who, "battlefield", who, "graveyard");
        }
      }
      break;
    }
    case "destroyAllLands": {
      s = addLog(s, `${card.name} — all lands are destroyed!`, "effect");
      for (const who of ["player","opponent"]) {
        const lands = s[who].battlefield.filter(isLand);
        for (const c of lands) {
          s = moveCard(s, c.iid, who, "battlefield", who, "graveyard");
        }
      }
      break;
    }
    case "pumpCreature": {
      if (targetCreature && card.mod) {
        s = { ...s, [targetCreature.controller]: { ...s[targetCreature.controller],
          battlefield: s[targetCreature.controller].battlefield.map(c=>c.iid===targetCreature.iid
            ? { ...c,
                power: (c.power||0) + (card.mod.power||0),
                toughness: (c.toughness||0) + (card.mod.toughness||0) }
            : c)
        }};
        s = addLog(s, `${card.name} pumps ${targetCreature.name} until end of turn.`, "effect");
      }
      break;
    }
    case "addMana": {
      const manaStr = card.mana || "";
      for (const ch of (Array.isArray(manaStr)?manaStr:[manaStr])) {
        if ("WUBRGC".includes(ch)) {
          s = { ...s, [caster]: { ...s[caster], manaPool: { ...s[caster].manaPool, [ch]: (s[caster].manaPool[ch]||0)+1 } } };
        }
      }
      s = addLog(s, `${card.name} adds ${Array.isArray(card.mana)?card.mana.join(""):card.mana} to ${caster}'s mana pool.`, "mana");
      break;
    }
    case "tutor": {
      // Show library — for now just add a random non-land
      const lib = s[caster].library;
      const nonLand = lib.filter(c=>!isLand(c));
      if (nonLand.length > 0) {
        const chosen = nonLand[Math.floor(Math.random()*nonLand.length)];
        s = moveCard(s, chosen.iid, caster, "library", caster, "hand");
        s = addLog(s, `${card.name} — ${caster} searches library for ${chosen.name}.`, "effect");
        // Shuffle
        s = { ...s, [caster]: { ...s[caster], library: shuffleDeck(s[caster].library) } };
      }
      break;
    }
    case "discardX": {
      const x = stackItem.xValue || 0;
      for (let i=0; i<x; i++) {
        const hand = s[opp].hand;
        if (!hand.length) break;
        const idx = Math.floor(Math.random()*hand.length);
        const card2 = hand[idx];
        s = { ...s, [opp]: { ...s[opp], hand: hand.filter((_,i2)=>i2!==idx), graveyard: [...s[opp].graveyard, card2] } };
        s = addLog(s, `${opp} discards ${card2.name}.`, "effect");
      }
      break;
    }
    case "wheelOfFortune": {
      for (const who of ["player","opponent"]) {
        const hand = s[who].hand;
        s = { ...s, [who]: { ...s[who], graveyard: [...s[who].graveyard, ...hand], hand: [] } };
        s = drawCard(s, who, 7);
      }
      s = addLog(s, `Wheel of Fortune — each player discards and draws 7.`, "effect");
      break;
    }
    case "extraTurn": {
      s = { ...s, [caster]: { ...s[caster], extraTurns: (s[caster].extraTurns||0)+1 } };
      s = addLog(s, `${card.name} — ${caster} will take an extra turn!`, "effect");
      break;
    }
    case "regrowth": {
      const gy = s[caster].graveyard;
      if (gy.length > 0) {
        const card2 = gy[gy.length-1];
        s = moveCard(s, card2.iid, caster, "graveyard", caster, "hand");
        s = addLog(s, `Regrowth returns ${card2.name} from graveyard to hand.`, "effect");
      }
      break;
    }
    case "hurricane": {
      const x = stackItem.xValue || 0;
      s = addLog(s, `Hurricane deals ${x} damage to each flying creature and each player.`, "effect");
      for (const who of ["player","opponent"]) {
        s = modifyLife(s, who, -x, "Hurricane");
        const flyers = s[who].battlefield.filter(c=>isCreature(c)&&hasKeyword(c,"FLYING"));
        for (const c of flyers) {
          s = { ...s, [who]: { ...s[who], battlefield: s[who].battlefield.map(cr=>cr.iid===c.iid?{...cr,damage:cr.damage+x}:cr) } };
        }
        s = checkCreatureDeath(s);
      }
      break;
    }
    case "reanimate": {
      const gy = s[opp].graveyard.filter(isCreature);
      if (gy.length > 0) {
        const target = gy[gy.length-1];
        s = moveCard(s, target.iid, opp, "graveyard", caster, "battlefield");
        s = addLog(s, `${card.name} reanimates ${target.name} under ${caster}'s control.`, "effect");
      }
      break;
    }
    case "armageddonDisk": {
      s = addLog(s, `Nevinyrral's Disk fires — all artifacts, creatures, and enchantments destroyed!`, "effect");
      for (const who of ["player","opponent"]) {
        const toDestroy = s[who].battlefield.filter(c=>isCreature(c)||isArtifact(c)||isEnchantment(c));
        for (const c of toDestroy) s = moveCard(s, c.iid, who, "battlefield", who, "graveyard");
      }
      break;
    }
    default:
      s = addLog(s, `${card.name} resolves. (effect: ${effect||"none"})`, "effect");
  }
  return s;
}

function checkCreatureDeath(state) {
  let s = state;
  for (const who of ["player","opponent"]) {
    const dead = s[who].battlefield.filter(c => {
      if (!isCreature(c)) return false;
      const t = getToughness(c, s);
      return c.damage >= t && t > 0;
    });
    for (const c of dead) {
      s = moveCard(s, c.iid, who, "battlefield", who, "graveyard");
      s = addLog(s, `${c.name} is destroyed.`, "death");
    }
  }
  return s;
}

// ============================================================
// AI ENGINE
// ============================================================
function aiDecide(state) {
  // Returns array of actions: {type, ...args}
  const actions = [];
  const opp = "opponent";
  const player = "player";
  const arch = state.opponentArchetype || ARCHETYPES.RED_BURN;
  const strategy = arch.strategy || "aggro";
  const oppState = state[opp];

  // 1. Tap lands for mana if in main phase
  if ((state.phase === "MAIN1" || state.phase === "MAIN2") && state.activePlayer === opp) {
    const lands = oppState.battlefield.filter(c => isLand(c) && !c.tapped);
    for (const land of lands) {
      actions.push({ type:"TAP_LAND", who:opp, iid:land.iid, mana:land.produces?.[0]||"C" });
    }
    // Tap artifact mana sources
    const moxen = oppState.battlefield.filter(c => isArtifact(c) && c.activated?.effect?.startsWith("addMana") && !c.tapped);
    for (const m of moxen) {
      actions.push({ type:"TAP_ARTIFACT_MANA", who:opp, iid:m.iid });
    }
  }

  // 2. Play land from hand
  if ((state.phase === "MAIN1" || state.phase === "MAIN2") && state.activePlayer === opp && state.landsPlayedThisTurn < 1) {
    const landInHand = oppState.hand.find(isLand);
    if (landInHand) actions.push({ type:"PLAY_LAND", who:opp, iid:landInHand.iid });
  }

  // 3. Cast spells
  if ((state.phase === "MAIN1" || state.phase === "MAIN2") && state.activePlayer === opp) {
    const castable = oppState.hand.filter(c => !isLand(c) && canAfford(oppState.manaPool, c.cost));
    // Sort by strategy
    const sorted = [...castable].sort((a,b) => {
      if (strategy === "aggro") return b.cmc - a.cmc; // cast biggest
      if (strategy === "control") return a.cmc - b.cmc; // hold mana
      return 0;
    });
    for (const c of sorted.slice(0,1)) { // cast one spell per cycle
      let target = null;
      if (c.effect === "damage3" || c.effect === "damage5") target = "player";
      if (c.effect === "destroy" || c.effect === "exileCreature" || c.effect === "bounce") {
        const threats = state[player].battlefield.filter(isCreature);
        if (threats.length) target = threats.reduce((a,b)=>getPower(a,state)>getPower(b,state)?a:b).iid;
      }
      if (c.effect === "draw3" || c.effect === "tutor") target = opp;
      actions.push({ type:"CAST_SPELL", who:opp, iid:c.iid, target, xValue:3 });
    }
  }

  // 4. Declare attackers
  if (state.phase === "DECLARE_ATTACKERS" && state.activePlayer === opp) {
    const canAttack = oppState.battlefield.filter(c =>
      isCreature(c) && !c.tapped && !c.summoningSick && !c.attacking
    );
    const playerLife = state[player].life;
    for (const c of canAttack) {
      // Aggro always attacks; control attacks if ahead; combo rarely attacks
      if (strategy === "aggro") actions.push({ type:"DECLARE_ATTACKER", iid:c.iid });
      else if (strategy === "control" && playerLife <= 8) actions.push({ type:"DECLARE_ATTACKER", iid:c.iid });
      else if (strategy === "bomb") {
        const p = getPower(c, state);
        if (p >= 4) actions.push({ type:"DECLARE_ATTACKER", iid:c.iid });
      }
      else if (strategy === "combo") {
        // don't attack unless something is very threatening
      }
    }
  }

  // 5. Declare blockers
  if (state.phase === "DECLARE_BLOCKERS" && state.activePlayer !== opp) {
    const canBlock = oppState.battlefield.filter(c => isCreature(c) && !c.tapped && !c.attacking);
    const attackerIids = state.attackers;
    const attackers = attackerIids.map(id => getBattlefieldCard(state, id)).filter(Boolean);

    // Assign blockers — try to trade up or save life
    for (const attacker of attackers) {
      const ap = getPower(attacker, state);
      const at = getToughness(attacker, state);
      // Find a valid blocker that can trade or survive
      const validBlockers = canBlock.filter(b =>
        !b.blocking &&
        canBlock2(b, attacker) &&
        !attackerIids.includes(b.iid) // not itself
      );
      const tradeBlocker = validBlockers.find(b => {
        const bp = getPower(b, state);
        const bt = getToughness(b, state);
        return bp >= at; // can kill attacker
      });
      const surviveBlocker = validBlockers.find(b => {
        const bp = getPower(b, state);
        const bt = getToughness(b, state);
        return bp < at && bt > ap; // survives
      });
      const chosen = tradeBlocker || (oppState.life <= ap ? surviveBlocker || validBlockers[0] : null);
      if (chosen) {
        actions.push({ type:"DECLARE_BLOCKER", blockerIid:chosen.iid, attackerIid:attacker.iid });
      }
    }
  }

  // 6. Instants in response
  if (state.phase === "DECLARE_ATTACKERS" || state.phase === "COMBAT_DAMAGE") {
    const instants = oppState.hand.filter(c => isInstant(c) && canAfford(oppState.manaPool, c.cost));
    // Counterspell if stack has opponent's spell
    const topStack = state.stack[state.stack.length-1];
    if (topStack && topStack.caster === "player") {
      const counter = instants.find(c => c.effect === "counter");
      if (counter && strategy === "control") {
        actions.push({ type:"CAST_SPELL", who:opp, iid:counter.iid, target:null });
      }
    }
  }

  return actions;
}

function canBlock2(blocker, attacker) {
  if (hasKeyword(attacker, "FLYING") && !hasKeyword(blocker, "FLYING") && !hasKeyword(blocker, "REACH")) return false;
  if (hasKeyword(blocker, "PROTECTION") && blocker.protection === attacker.color) return false;
  if (hasKeyword(attacker, "PROTECTION") && attacker.protection === blocker.color) return false;
  return true;
}

// ============================================================
// TURN ADVANCEMENT
// ============================================================
function advancePhase(state) {
  const phases = state.ruleset.combatDamageOnStack
    ? PHASES
    : PHASES.filter(p => p !== "FIRST_STRIKE" || state.attackers.some(id=>hasKeyword(getBattlefieldCard(state,id)||{},"FIRST_STRIKE")));

  const idx = phases.indexOf(state.phase);
  const nextPhase = phases[(idx+1) % phases.length];
  const newTurn = nextPhase === "UNTAP" ? state.turn + 1 : state.turn;
  const turnChange = nextPhase === "UNTAP";

  let s = { ...state, phase: nextPhase, turn: newTurn };

  if (turnChange) {
    // Check for extra turns
    if (s[state.activePlayer].extraTurns > 0) {
      s = { ...s, [state.activePlayer]: { ...s[state.activePlayer], extraTurns: s[state.activePlayer].extraTurns-1 } };
      s = addLog(s, `${state.activePlayer} takes an extra turn!`, "info");
      // don't switch active player
    } else {
      const nextPlayer = state.activePlayer === "player" ? "opponent" : "player";
      s = { ...s, activePlayer: nextPlayer, priorityPlayer: nextPlayer };
    }
    s = { ...s, landsPlayedThisTurn: 0, attackers: [], blockers: {} };
  }

  // Phase entry effects
  if (nextPhase === "UNTAP") {
    s = untapAll(s, s.activePlayer);
    s = addLog(s, `── Turn ${newTurn} begins. ${s.activePlayer}'s turn. ──`, "phase");
  }
  if (nextPhase === "DRAW") {
    if (!(newTurn === 1 && !state.ruleset.drawOnFirstTurn && s.activePlayer === "player")) {
      s = drawCard(s, s.activePlayer);
    }
  }
  if (nextPhase === "UPKEEP") {
    // Upkeep triggers
    for (const who of ["player","opponent"]) {
      for (const c of s[who].battlefield) {
        if (c.upkeep === "selfDamage1" && c.controller === who) {
          s = modifyLife(s, who, -1, c.name);
        }
      }
    }
    // Mana burn at end of previous phase
    if (!turnChange) {
      for (const who of ["player","opponent"]) {
        s = clearManaBurn(s, who, s.ruleset);
      }
    }
  }
  if (nextPhase === "CLEANUP") {
    // Discard to max hand size
    const active = s.activePlayer;
    while (s[active].hand.length > s.ruleset.maxHandSize) {
      const disc = s[active].hand[s[active].hand.length-1];
      s = { ...s, [active]: { ...s[active], hand: s[active].hand.slice(0,-1), graveyard: [...s[active].graveyard, disc] } };
      s = addLog(s, `${active} discards ${disc.name} (hand size limit).`, "discard");
    }
    // Clear mana burn
    for (const who of ["player","opponent"]) {
      s = clearManaBurn(s, who, s.ruleset);
    }
  }
  if (nextPhase === "COMBAT_DAMAGE") {
    s = resolveCombatDamage(s);
  }
  if (nextPhase === "POST_COMBAT") {
    // Clear attacker/blocker state
    for (const who of ["player","opponent"]) {
      s = { ...s, [who]: { ...s[who], battlefield: s[who].battlefield.map(c=>({...c,attacking:false,blocking:null})) } };
    }
  }
  if (nextPhase === "MAIN1") {
    s = addLog(s, `${s.activePlayer}'s main phase.`, "phase");
  }

  return s;
}

function resolveCombatDamage(state) {
  let s = state;
  const attackerIids = state.attackers;
  if (!attackerIids.length) return s;

  s = addLog(s, "⚔ Resolving combat damage...", "combat");

  for (const attId of attackerIids) {
    const attacker = getBattlefieldCard(s, attId);
    if (!attacker) continue;
    const ap = getPower(attacker, s);
    const attackerCtrl = attacker.controller;
    const defenderWho = attackerCtrl === "player" ? "opponent" : "player";

    // Find blocker(s)
    const blockingCreatures = s[defenderWho].battlefield.filter(c => c.blocking === attId);

    if (blockingCreatures.length === 0) {
      // Unblocked — hit player
      s = modifyLife(s, defenderWho, -ap, attacker.name);
      if (hasKeyword(attacker, "LIFELINK")) s = modifyLife(s, attackerCtrl, ap, `${attacker.name} lifelink`);
    } else {
      // Assign damage to blockers
      let remainingDmg = ap;
      for (const blocker of blockingCreatures) {
        const bp = getPower(blocker, s);
        const bt = getToughness(blocker, s);
        const dmgToBlocker = Math.min(remainingDmg, bt - blocker.damage);
        // Apply damage to attacker from blocker
        s = { ...s, [attackerCtrl]: { ...s[attackerCtrl], battlefield: s[attackerCtrl].battlefield.map(c=>c.iid===attId?{...c,damage:c.damage+bp}:c) } };
        // Apply damage to blocker from attacker
        s = { ...s, [defenderWho]: { ...s[defenderWho], battlefield: s[defenderWho].battlefield.map(c=>c.iid===blocker.iid?{...c,damage:c.damage+dmgToBlocker}:c) } };
        remainingDmg = Math.max(0, remainingDmg - dmgToBlocker);
        if (hasKeyword(attacker, "LIFELINK")) s = modifyLife(s, attackerCtrl, dmgToBlocker, `${attacker.name} lifelink`);
      }
      // Trample excess
      if (hasKeyword(attacker, "TRAMPLE") && remainingDmg > 0) {
        s = modifyLife(s, defenderWho, -remainingDmg, `${attacker.name} (trample)`);
      }
      // Deathtouch
      if (hasKeyword(attacker, "DEATHTOUCH") && state.ruleset.deathtouch) {
        for (const blocker of blockingCreatures) {
          s = { ...s, [defenderWho]: { ...s[defenderWho], battlefield: s[defenderWho].battlefield.map(c=>c.iid===blocker.iid?{...c,damage:Math.max(c.toughness,c.damage+1)}:c) } };
        }
      }
    }
  }

  s = checkCreatureDeath(s);
  s = { ...s, attackers: [], blockers: {} };
  return s;
}

// ============================================================
// GAME REDUCER
// ============================================================
function gameReducer(state, action) {
  if (state.gameOver) return state;
  let s = state;

  switch (action.type) {
    case "TAP_LAND":
      return tapLand(s, action.who, action.iid, action.mana);
    case "TAP_ARTIFACT_MANA":
      return tapArtifactForMana(s, action.who, action.iid);

    case "PLAY_LAND": {
      const who = action.who;
      const card = s[who].hand.find(c=>c.iid===action.iid);
      if (!card || !isLand(card)) return s;
      if (s.activePlayer !== who) return s;
      if (s.phase !== "MAIN1" && s.phase !== "MAIN2") return s;
      if (s.landsPlayedThisTurn >= 1) return s;
      s = moveCard(s, action.iid, who, "hand", who, "battlefield");
      s = { ...s, landsPlayedThisTurn: s.landsPlayedThisTurn+1 };
      return addLog(s, `${who} plays ${card.name}.`, "play");
    }

    case "CAST_SPELL": {
      const who = action.who;
      const card = s[who].hand.find(c=>c.iid===action.iid);
      if (!card) return s;
      if (!canCastNow(card, s, who)) return s;
      // Spend mana
      s = { ...s, [who]: { ...s[who], manaPool: spendMana(s[who].manaPool, card.cost), hand: s[who].hand.filter(c=>c.iid!==action.iid) } };
      const stackItem = { id:makeId(), card, caster:who, targets:action.target?[action.target]:[], xValue:action.xValue||0 };
      // For instants/sorceries with no stack interactions: resolve immediately (batch mode)
      if (s.ruleset.stackType === "batch" || !isInstant(card)) {
        s = resolveEffect(s, stackItem);
        s = { ...s, [who]: { ...s[who], graveyard: isLand(card)?s[who].graveyard:[...s[who].graveyard, {...card}] } };
        return addLog(s, `${who} casts ${card.name}.`, "play");
      } else {
        s = { ...s, stack: [...s.stack, stackItem] };
        return addLog(s, `${who} casts ${card.name} — on stack.`, "play");
      }
    }

    case "CAST_CREATURE": {
      const who = action.who;
      const card = s[who].hand.find(c=>c.iid===action.iid);
      if (!card || !isCreature(card)) return s;
      if (!canCastNow(card, s, who)) return s;
      s = { ...s, [who]: { ...s[who], manaPool: spendMana(s[who].manaPool, card.cost), hand: s[who].hand.filter(c=>c.iid!==action.iid) } };
      s = moveCard(s, action.iid, who, "hand", who, "battlefield");
      return addLog(s, `${who} casts ${card.name}.`, "play");
    }

    case "CAST_PERMANENT": {
      const who = action.who;
      const card = s[who].hand.find(c=>c.iid===action.iid);
      if (!card) return s;
      if (!canCastNow(card, s, who)) return s;
      s = { ...s, [who]: { ...s[who], manaPool: spendMana(s[who].manaPool, card.cost), hand: s[who].hand.filter(c=>c.iid!==action.iid) } };
      s = moveCard(s, action.iid, who, "hand", who, "battlefield");
      return addLog(s, `${who} casts ${card.name}.`, "play");
    }

    case "RESOLVE_STACK": {
      if (!s.stack.length) return s;
      const top = s.stack[s.stack.length-1];
      s = { ...s, stack: s.stack.slice(0,-1) };
      s = resolveEffect(s, top);
      if (!isLand(top.card) && !isCreature(top.card) && !isArtifact(top.card) && !isEnchantment(top.card)) {
        s = { ...s, [top.caster]: { ...s[top.caster], graveyard: [...s[top.caster].graveyard, {...top.card}] } };
      }
      return s;
    }

    case "DECLARE_ATTACKER": {
      const c = s.player.battlefield.find(c=>c.iid===action.iid);
      if (!c || !isCreature(c) || c.tapped || c.summoningSick) return s;
      if (s.phase !== "DECLARE_ATTACKERS" || s.activePlayer !== "player") return s;
      const alreadyAttacking = s.attackers.includes(action.iid);
      const newAttackers = alreadyAttacking ? s.attackers.filter(id=>id!==action.iid) : [...s.attackers, action.iid];
      s = { ...s, attackers: newAttackers,
        player: { ...s.player, battlefield: s.player.battlefield.map(c=>c.iid===action.iid?{...c,attacking:!alreadyAttacking,tapped:!hasKeyword(c,"VIGILANCE")}:c) }
      };
      return s;
    }

    case "DECLARE_BLOCKER": {
      const { blockerIid, attackerIid } = action;
      const blocker = s.opponent.battlefield.find(c=>c.iid===blockerIid);
      const attacker = getBattlefieldCard(s, attackerIid);
      if (!blocker || !attacker || !s.attackers.includes(attackerIid)) return s;
      if (!canBlock2(blocker, attacker)) return s;
      const alreadyBlocking = s.blockers[blockerIid] === attackerIid;
      const newBlockers = { ...s.blockers };
      if (alreadyBlocking) delete newBlockers[blockerIid];
      else newBlockers[blockerIid] = attackerIid;
      s = { ...s, blockers: newBlockers,
        opponent: { ...s.opponent, battlefield: s.opponent.battlefield.map(c=>c.iid===blockerIid?{...c,blocking:alreadyBlocking?null:attackerIid}:c) }
      };
      return s;
    }

    case "ADVANCE_PHASE":
      return advancePhase(s);

    case "SELECT_CARD":
      return { ...s, selectedCard: action.iid };

    case "SELECT_TARGET":
      return { ...s, selectedTarget: action.iid };

    case "AI_ACTIONS": {
      let ns = s;
      for (const act of action.actions) {
        ns = gameReducer(ns, act);
      }
      return ns;
    }

    case "PASS_PRIORITY": {
      const next = s.priorityPlayer === "player" ? "opponent" : "player";
      if (next === s.activePlayer && !s.stack.length) {
        // Both players passed — advance phase
        return advancePhase(s);
      }
      return { ...s, priorityPlayer: next };
    }

    case "MULLIGAN": {
      const who = action.who || "player";
      const newMulls = (s[who].mulligansThisTurn||0) + 1;
      const newHandSize = Math.max(0, s.ruleset.startingHandSize - (s.ruleset.londonMulligan ? 0 : newMulls));
      // London: draw 7, then put mulls-count back
      const newLibrary = shuffleDeck([...s[who].library, ...s[who].hand]);
      let ns = { ...s, [who]: { ...s[who], library: newLibrary, hand: [], mulligansThisTurn: newMulls } };
      ns = drawCard(ns, who, s.ruleset.startingHandSize);
      if (s.ruleset.londonMulligan && newMulls > 0) {
        // Player puts newMulls cards back (auto: put back most expensive)
        for (let i = 0; i < newMulls && ns[who].hand.length > 0; i++) {
          const sorted = [...ns[who].hand].sort((a,b)=>b.cmc-a.cmc);
          const put = sorted[0];
          ns = { ...ns, [who]: { ...ns[who], hand: ns[who].hand.filter(c=>c.iid!==put.iid), library: [put, ...ns[who].library] } };
        }
      }
      ns = addLog(ns, `${who} takes a mulligan (hand size ${ns[who].hand.length}).`, "info");
      return ns;
    }

    default:
      return s;
  }
}

// ============================================================
// MANA SYMBOL COMPONENT
// ============================================================
const MANA_BG = { W:"#f9f0d0",U:"#5588cc",B:"#8844bb",R:"#cc4422",G:"#449933","":"#666",C:"#999" };
function ManaSymbol({ sym, size=13 }) {
  const label = { W:"W",U:"U",B:"B",R:"R",G:"G",C:"C","":"∅" };
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      width:size,height:size,borderRadius:"50%",
      background:MANA_BG[sym]||"#666",
      color:sym==="W"?"#665500":"#fff",
      fontSize:size*0.58,fontWeight:700,border:"1px solid rgba(0,0,0,0.4)",
      flexShrink:0,lineHeight:1,fontFamily:"'Fira Code',monospace",
    }}>{label[sym]||sym}</span>
  );
}

function ManaCost({ cost, size=13 }) {
  if (!cost) return null;
  const parts = [];
  let i = 0;
  while (i < cost.length) {
    if (!isNaN(parseInt(cost[i]))) {
      let num = "";
      while (i < cost.length && !isNaN(parseInt(cost[i]))) { num+=cost[i]; i++; }
      parts.push(<span key={i} style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#555",color:"#ddd",fontSize:size*0.6,fontWeight:700,border:"1px solid rgba(0,0,0,0.4)" }}>{num}</span>);
    } else if ("WUBRG".includes(cost[i])) {
      parts.push(<ManaSymbol key={i} sym={cost[i]} size={size}/>);
      i++;
    } else if (cost[i] === "X") {
      parts.push(<span key={i} style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#777",color:"#fff",fontSize:size*0.6,fontWeight:700,border:"1px solid rgba(0,0,0,0.4)" }}>X</span>);
      i++;
    } else if (cost[i] === "0") {
      parts.push(<span key={i} style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:"#555",color:"#ddd",fontSize:size*0.6,fontWeight:700,border:"1px solid rgba(0,0,0,0.4)" }}>0</span>);
      i++;
    } else i++;
  }
  return <span style={{ display:"inline-flex",gap:2 }}>{parts}</span>;
}

// ============================================================
// CARD COMPONENT  (battlefield + hand versions)
// ============================================================
const TYPE_COLORS = {
  Creature:    { bg:"#1a2010", border:"#4a6030", accent:"#70a050" },
  Land:        { bg:"#1a1808", border:"#4a4020", accent:"#a08030" },
  Instant:     { bg:"#0a1a2a", border:"#204060", accent:"#4080c0" },
  Sorcery:     { bg:"#1a0a20", border:"#4a2060", accent:"#8040c0" },
  Artifact:    { bg:"#1a1a1a", border:"#505050", accent:"#909090" },
  Enchantment: { bg:"#1a1520", border:"#3a3060", accent:"#6050a0" },
};

function getTypeColors(card) {
  if (!card) return TYPE_COLORS.Artifact;
  if (isCreature(card)) return TYPE_COLORS.Creature;
  if (isLand(card)) return TYPE_COLORS.Land;
  if (isInstant(card)) return TYPE_COLORS.Instant;
  if (isSorcery(card)) return TYPE_COLORS.Sorcery;
  if (isArtifact(card)) return TYPE_COLORS.Artifact;
  if (isEnchantment(card)) return TYPE_COLORS.Enchantment;
  return TYPE_COLORS.Artifact;
}

const CARD_ACCENT_COLOR = { W:"#d4b44a", U:"#5599dd", B:"#9966cc", R:"#dd6633", G:"#66aa44", "":"#888" };

function BattlefieldCard({ card, state, selected, attacking, beingBlocked, onClick, onRightClick, small=false }) {
  const { bg, border, accent } = getTypeColors(card);
  const colorAccent = CARD_ACCENT_COLOR[card.color] || "#888";
  const p = isCreature(card) ? getPower(card, state) : null;
  const t = isCreature(card) ? getToughness(card, state) : null;
  const hasDamage = card.damage > 0;
  const isAlmostDead = isCreature(card) && card.damage >= (t - 1) && t > 0;
  const w = small ? 72 : 86;
  const h = small ? 96 : 116;

  return (
    <div
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onRightClick?.(card); }}
      title={`${card.name}\n${card.text||""}`}
      style={{
        width: w, height: h,
        background: bg,
        border: `2px solid ${selected ? "#f0c040" : attacking ? "#ff6020" : beingBlocked ? "#ff2060" : border}`,
        borderRadius: 6,
        cursor: "pointer",
        position: "relative",
        transform: card.tapped ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.3s ease, border-color 0.2s, box-shadow 0.2s",
        boxShadow: selected
          ? `0 0 10px #f0c040, 0 0 20px rgba(240,192,64,0.3)`
          : attacking
          ? `0 0 10px rgba(255,96,32,0.6), 0 0 20px rgba(255,96,32,0.3), animation: combatGlow 1s infinite`
          : `0 3px 8px rgba(0,0,0,0.5)`,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: card.damage > 0 ? "none" : "none",
      }}>
      {/* Color bar */}
      <div style={{ height: 3, background: colorAccent, flexShrink: 0 }}/>

      {/* Header */}
      <div style={{ padding: "4px 5px 2px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
        <span style={{ fontSize: small?7:8, fontFamily:"'Cinzel',serif", color:"#d0c090", fontWeight:600, lineHeight:1.2, flex:1, overflow:"hidden" }}>
          {card.name}
        </span>
        <ManaCost cost={card.cost} size={small?9:10}/>
      </div>

      {/* Art area */}
      <div style={{ flex:1, margin:"2px 4px", background:`linear-gradient(135deg,${bg},rgba(0,0,0,0.3))`, borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
        <span style={{ fontSize: small?18:22, opacity:0.4 }}>
          {isLand(card) ? "🗻" : isCreature(card) ? "⚔" : isInstant(card) ? "✦" : isSorcery(card) ? "✸" : isArtifact(card) ? "⚙" : "◆"}
        </span>
        {/* Damage counter */}
        {hasDamage && (
          <div style={{
            position:"absolute", top:2, right:2,
            background: isAlmostDead ? "#c01010" : "#802010",
            color:"#fff", fontSize:8, fontWeight:700,
            padding:"1px 3px", borderRadius:2, fontFamily:"'Fira Code',monospace",
          }}>💢{card.damage}</div>
        )}
        {/* Summoning sick overlay */}
        {card.summoningSick && isCreature(card) && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:8, color:"rgba(200,200,200,0.7)", fontFamily:"'Cinzel',serif" }}>SICK</span>
          </div>
        )}
        {/* Counters */}
        {Object.entries(card.counters||{}).map(([k,v])=>v>0&&(
          <div key={k} style={{ position:"absolute", bottom:2, left:2, background:"rgba(0,0,0,0.7)", color:k.startsWith("P")?"#80ff80":"#ff8080", fontSize:7, padding:"1px 2px", borderRadius:2 }}>
            {k}×{v}
          </div>
        ))}
      </div>

      {/* Type line */}
      <div style={{ padding:"1px 4px", fontSize:small?6:7, color:"#8a7050", fontFamily:"'Crimson Text',serif", flexShrink:0 }}>
        {card.subtype||card.type}
      </div>

      {/* Keywords */}
      {card.keywords?.length > 0 && (
        <div style={{ padding:"0 4px 2px", display:"flex", flexWrap:"wrap", gap:1 }}>
          {card.keywords.slice(0,3).map(kw=>(
            <span key={kw} style={{ fontSize:6, background:"rgba(255,255,255,0.08)", color:accent, padding:"0 2px", borderRadius:2, fontFamily:"'Cinzel',serif" }}>
              {KEYWORDS[kw]?.name||kw}
            </span>
          ))}
        </div>
      )}

      {/* P/T */}
      {isCreature(card) && (
        <div style={{ position:"absolute", bottom:3, right:4, fontSize:small?9:11, fontWeight:700, color:hasDamage?"#ff8060":accent, fontFamily:"'Fira Code',monospace" }}>
          {p}/{t}
        </div>
      )}

      {/* Attacking indicator */}
      {attacking && (
        <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, border:"2px solid #ff6020", borderRadius:6, pointerEvents:"none", animation:"combatGlow 1s infinite" }}/>
      )}
    </div>
  );
}

function HandCard({ card, state, selected, playable, onClick }) {
  const { bg, border } = getTypeColors(card);
  const colorAccent = CARD_ACCENT_COLOR[card.color] || "#888";
  return (
    <div
      onClick={onClick}
      title={`${card.name}\n${card.text||""}`}
      style={{
        width: 80, height: 112,
        background: bg,
        border: `2px solid ${selected?"#f0c040":playable?"rgba(100,200,100,0.6)":border}`,
        borderRadius: 7,
        cursor: "pointer",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: selected
          ? "0 0 12px #f0c040, 0 -6px 20px rgba(240,192,64,0.2)"
          : playable
          ? "0 0 8px rgba(100,200,100,0.3), 0 -4px 12px rgba(0,0,0,0.6)"
          : "0 -4px 12px rgba(0,0,0,0.6)",
        transform: selected ? "translateY(-16px) scale(1.05)" : playable ? "translateY(-6px)" : "translateY(0)",
        transition: "transform 0.2s, box-shadow 0.2s, border-color 0.2s",
        animation: "cardDraw 0.3s ease-out",
        position: "relative",
      }}>
      <div style={{ height:3, background:colorAccent, flexShrink:0 }}/>
      <div style={{ padding:"4px 5px 2px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexShrink:0 }}>
        <span style={{ fontSize:7.5, fontFamily:"'Cinzel',serif", color:"#d0c090", fontWeight:600, lineHeight:1.2, flex:1 }}>{card.name}</span>
        <ManaCost cost={card.cost} size={10}/>
      </div>
      <div style={{ flex:1, margin:"2px 4px", background:`linear-gradient(135deg,${bg},rgba(0,0,0,0.4))`, borderRadius:3, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:20, opacity:0.35 }}>
          {isLand(card)?"🗻":isCreature(card)?"⚔":isInstant(card)?"✦":isSorcery(card)?"✸":isArtifact(card)?"⚙":"◆"}
        </span>
      </div>
      <div style={{ padding:"1px 4px", fontSize:6.5, color:"#8a7050", fontFamily:"'Crimson Text',serif", flexShrink:0 }}>{card.subtype||card.type}</div>
      {card.text && <div style={{ padding:"0 4px 2px", fontSize:6.5, color:"#7a7060", lineHeight:1.3, overflow:"hidden", maxHeight:28 }}>{card.text.slice(0,50)}{card.text.length>50?"…":""}</div>}
      {isCreature(card) && (
        <div style={{ textAlign:"right", padding:"0 4px 3px", fontSize:10, fontWeight:700, color:colorAccent, fontFamily:"'Fira Code',monospace" }}>
          {getPower(card,state)}/{getToughness(card,state)}
        </div>
      )}
      {playable && !selected && (
        <div style={{ position:"absolute", bottom:-1, left:0, right:0, height:2, background:"rgba(100,200,100,0.5)", borderRadius:"0 0 5px 5px" }}/>
      )}
    </div>
  );
}

// ============================================================
// PHASE TRACKER
// ============================================================
function PhaseTracker({ phase, activePlayer, ruleset }) {
  const combatPhases = ["DECLARE_ATTACKERS","DECLARE_BLOCKERS","FIRST_STRIKE","COMBAT_DAMAGE","POST_COMBAT"];
  return (
    <div style={{ display:"flex", gap:2, alignItems:"center", overflow:"hidden" }}>
      {PHASES.map(p => {
        if (p==="FIRST_STRIKE" && !ruleset.combatDamageOnStack) return null;
        const active = p === phase;
        const isCombat = combatPhases.includes(p);
        return (
          <div key={p} style={{
            padding:"3px 7px",
            background: active ? (isCombat?"rgba(180,60,20,0.35)":"rgba(180,140,20,0.25)") : "transparent",
            border: `1px solid ${active?(isCombat?"rgba(200,80,40,0.8)":"rgba(200,160,40,0.8)"):"rgba(255,255,255,0.07)"}`,
            borderRadius:4,
            color: active?(isCombat?"#f08060":"#f0c040"):"#4a4030",
            fontSize:9,
            fontFamily:"'Cinzel',serif",
            letterSpacing:0.5,
            whiteSpace:"nowrap",
            animation: active ? "phaseGlow 2s infinite" : "none",
            transition:"all 0.2s",
          }}>{PHASE_LABELS[p]}</div>
        );
      })}
    </div>
  );
}

// ============================================================
// MANA POOL DISPLAY
// ============================================================
function ManaPool({ pool, size=16 }) {
  const colors = ["W","U","B","R","G","C"];
  const total = Object.values(pool).reduce((a,b)=>a+b,0);
  if (total === 0) return <span style={{ fontSize:10, color:"#4a4030", fontFamily:"'Cinzel',serif" }}>No mana</span>;
  return (
    <span style={{ display:"inline-flex", gap:3, alignItems:"center", flexWrap:"wrap" }}>
      {colors.map(c => pool[c]>0 && Array.from({length:pool[c]}).map((_,i)=>(
        <ManaSymbol key={`${c}${i}`} sym={c} size={size}/>
      )))}
    </span>
  );
}

// ============================================================
// GAME LOG
// ============================================================
function GameLog({ log }) {
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  const colors = {
    info:"#8a9080", draw:"#8888c0", play:"#c0a840", mana:"#60a060",
    damage:"#e06050", heal:"#60c080", death:"#c04040", combat:"#e08040",
    effect:"#a080c0", phase:"#6080a0", discard:"#a06040"
  };
  return (
    <div ref={ref} style={{ flex:1, overflowY:"auto", padding:"6px 8px", background:"rgba(0,0,0,0.3)", fontSize:10, fontFamily:"'Crimson Text',serif" }}>
      {log.slice(-60).map((entry,i)=>(
        <div key={i} style={{ marginBottom:2, lineHeight:1.4, color:colors[entry.type]||"#888" }}>
          <span style={{ color:"rgba(150,120,60,0.4)", marginRight:4, fontSize:9 }}>T{entry.turn}</span>
          {entry.text}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CARD TOOLTIP (detailed popup)
// ============================================================
function CardTooltip({ card, state, pos }) {
  if (!card) return null;
  const { bg, border, accent } = getTypeColors(card);
  const colorAccent = CARD_ACCENT_COLOR[card.color] || "#888";
  const p = isCreature(card) ? getPower(card, state) : null;
  const t = isCreature(card) ? getToughness(card, state) : null;

  return (
    <div style={{
      position:"fixed", left:pos.x+12, top:Math.min(pos.y-20, window.innerHeight-280),
      width:200, zIndex:1000, pointerEvents:"none",
      background:`linear-gradient(160deg,${bg},rgba(5,3,1,0.98))`,
      border:`2px solid ${colorAccent}60`,
      borderRadius:8, padding:12,
      boxShadow:`0 0 30px rgba(0,0,0,0.9), 0 0 10px ${colorAccent}30`,
      animation:"fadeSlideIn 0.15s ease-out",
    }}>
      <div style={{ height:3, background:colorAccent, marginBottom:8, borderRadius:2 }}/>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:12, fontFamily:"'Cinzel',serif", color:"#e0d090", fontWeight:700 }}>{card.name}</span>
        <ManaCost cost={card.cost} size={13}/>
      </div>
      <div style={{ fontSize:9, color:"#7a6040", fontFamily:"'Crimson Text',serif", marginBottom:6 }}>
        {card.type}{card.subtype?` — ${card.subtype}`:""}
      </div>
      {card.keywords?.length > 0 && (
        <div style={{ marginBottom:6 }}>
          {card.keywords.map(kw=>(
            <div key={kw} style={{ fontSize:9, color:accent, fontFamily:"'Cinzel',serif", marginBottom:2 }}>
              <strong>{KEYWORDS[kw]?.name||kw}:</strong> <span style={{ color:"#908070" }}>{KEYWORDS[kw]?.desc||""}</span>
            </div>
          ))}
        </div>
      )}
      {card.text && <div style={{ fontSize:10, color:"#c0b090", fontFamily:"'Crimson Text',serif", lineHeight:1.5, marginBottom:6 }}>{card.text}</div>}
      {isCreature(card) && (
        <div style={{ textAlign:"right", fontSize:14, fontWeight:700, color:colorAccent, fontFamily:"'Fira Code',monospace" }}>
          {p}/{t}
        </div>
      )}
      <div style={{ marginTop:4, fontSize:8, color:"#4a3820", fontFamily:"'Cinzel',serif", display:"flex", gap:4 }}>
        <span style={{ background:card.rarity==="R"?"#6a4010":card.rarity==="U"?"#1a3050":"#2a2a2a", padding:"1px 4px", borderRadius:3 }}>
          {card.rarity==="R"?"Rare":card.rarity==="U"?"Uncommon":"Common"}
        </span>
        {card.color && <span style={{ background:MANA_BG[card.color]+"20", padding:"1px 4px", borderRadius:3, color:colorAccent }}>{card.color}</span>}
      </div>
    </div>
  );
}

// ============================================================
// SETUP SCREEN (choose deck & opponent & ruleset)
// ============================================================
function SetupScreen({ onStart }) {
  const [ruleset, setRuleset] = useState("CLASSIC");
  const [archetype, setArchetype] = useState("WHITE_WEENIE");
  const [oppArchetype, setOppArchetype] = useState("RED_BURN");

  const archetypeKeys = Object.keys(ARCHETYPES);
  return (
    <div style={{
      minHeight:"100vh", background:"#050302",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"'Cinzel',serif", padding:20,
      backgroundImage:"radial-gradient(ellipse at 50% 20%,rgba(60,30,10,0.5) 0%,transparent 70%)",
    }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ textAlign:"center", marginBottom:32 }}>
        <div style={{ fontSize:10, letterSpacing:4, color:"rgba(180,140,40,0.4)", marginBottom:8 }}>✦ ✦ ✦ SHANDALAR: MODERN EDITION ✦ ✦ ✦</div>
        <h1 style={{ fontSize:36, fontFamily:"'Cinzel Decorative',serif", color:"transparent",
          background:"linear-gradient(180deg,#f0d080,#8a6010)",
          WebkitBackgroundClip:"text", backgroundClip:"text", letterSpacing:3 }}>DUEL ENGINE</h1>
        <div style={{ fontSize:11, color:"rgba(160,120,50,0.5)", letterSpacing:2, marginTop:4 }}>Phase 2 — Rules Engine Test</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20, maxWidth:820, width:"100%", marginBottom:28 }}>
        {/* Ruleset */}
        <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(200,160,60,0.2)", borderRadius:8, padding:16 }}>
          <div style={{ fontSize:11, color:"#8a6030", letterSpacing:1, marginBottom:12 }}>RULESET</div>
          {Object.values(RULESETS).map(r=>(
            <div key={r.id} onClick={()=>setRuleset(r.id)} style={{
              padding:"10px 12px", borderRadius:6, marginBottom:8, cursor:"pointer",
              background:ruleset===r.id?"rgba(200,160,40,0.12)":"rgba(255,255,255,0.02)",
              border:`1px solid ${ruleset===r.id?"rgba(200,160,40,0.5)":"rgba(255,255,255,0.06)"}`,
            }}>
              <div style={{ fontSize:11, color:ruleset===r.id?"#f0c060":"#706040", marginBottom:3 }}>{r.name}</div>
              <div style={{ fontSize:9, color:"#4a3820", lineHeight:1.4 }}>{r.description}</div>
            </div>
          ))}
        </div>

        {/* Your deck */}
        <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(200,160,60,0.2)", borderRadius:8, padding:16 }}>
          <div style={{ fontSize:11, color:"#8a6030", letterSpacing:1, marginBottom:12 }}>YOUR DECK</div>
          {archetypeKeys.map(k=>{
            const a = ARCHETYPES[k];
            return (
              <div key={k} onClick={()=>setArchetype(k)} style={{
                padding:"8px 10px", borderRadius:5, marginBottom:6, cursor:"pointer",
                background:archetype===k?`${MANA_BG[a.color]||"#555"}18`:"rgba(255,255,255,0.02)",
                border:`1px solid ${archetype===k?(MANA_BG[a.color]||"#888")+"50":"rgba(255,255,255,0.05)"}`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  {a.color.split("").filter(c=>"WUBRG".includes(c)).map((c,i)=><ManaSymbol key={i} sym={c} size={12}/>)}
                  <span style={{ fontSize:11, color:archetype===k?"#f0c060":"#706040" }}>{a.name}</span>
                </div>
                <div style={{ fontSize:9, color:"#4a3820" }}>{a.strategy} · {a.deck.length} cards</div>
              </div>
            );
          })}
        </div>

        {/* Opponent */}
        <div style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(200,160,60,0.2)", borderRadius:8, padding:16 }}>
          <div style={{ fontSize:11, color:"#8a6030", letterSpacing:1, marginBottom:12 }}>OPPONENT</div>
          {archetypeKeys.map(k=>{
            const a = ARCHETYPES[k];
            return (
              <div key={k} onClick={()=>setOppArchetype(k)} style={{
                padding:"8px 10px", borderRadius:5, marginBottom:6, cursor:"pointer",
                background:oppArchetype===k?`rgba(180,60,30,0.15)`:"rgba(255,255,255,0.02)",
                border:`1px solid ${oppArchetype===k?"rgba(200,80,40,0.5)":"rgba(255,255,255,0.05)"}`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  {a.color.split("").filter(c=>"WUBRG".includes(c)).map((c,i)=><ManaSymbol key={i} sym={c} size={12}/>)}
                  <span style={{ fontSize:11, color:oppArchetype===k?"#f08060":"#706040" }}>{a.name}</span>
                </div>
                <div style={{ fontSize:9, color:"#4a3820" }}>{a.strategy}</div>
              </div>
            );
          })}
        </div>
      </div>

      <button onClick={()=>onStart({ ruleset:RULESETS[ruleset], playerArchetype:archetype, opponentArchetype:oppArchetype })} style={{
        background:"linear-gradient(135deg,#1c1006,#302010)",
        border:"2px solid rgba(200,160,40,0.5)", color:"#f0c040",
        padding:"14px 52px", borderRadius:6, cursor:"pointer",
        fontSize:15, fontFamily:"'Cinzel',serif", letterSpacing:2,
        boxShadow:"0 0 20px rgba(200,140,20,0.2)",
      }}>⚔ BEGIN DUEL</button>
    </div>
  );
}

// ============================================================
// MAIN DUEL SCREEN
// ============================================================
function DuelScreen({ config, onExit }) {
  const initialState = useMemo(() => {
    const playerDeckIds = ARCHETYPES[config.playerArchetype].deck;
    const s = buildInitialState(playerDeckIds, config.opponentArchetype, config.ruleset);
    return { ...s, opponentArchetype: ARCHETYPES[config.opponentArchetype] };
  }, []);

  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [tooltip, setTooltip] = useState(null); // { card, pos }
  const [xInput, setXInput] = useState(1);
  const [aiThinking, setAiThinking] = useState(false);
  const [floatingText, setFloatingText] = useState([]); // [{id,text,color,x,y}]

  // AI turn
  const aiTurnRef = useRef(false);
  useEffect(() => {
    if (state.gameOver) return;
    const isOpponentPhase = state.activePlayer === "opponent";
    const isOpponentPriority = state.priorityPlayer === "opponent";
    if ((!isOpponentPhase && !isOpponentPriority) || aiTurnRef.current) return;
    aiTurnRef.current = true;
    setAiThinking(true);
    const delay = 600 + Math.random()*400;
    const timer = setTimeout(() => {
      const actions = aiDecide(state);
      if (actions.length > 0) {
        dispatch({ type:"AI_ACTIONS", actions });
      }
      // Advance phase after AI acts
      setTimeout(() => {
        if (state.activePlayer === "opponent") {
          dispatch({ type:"ADVANCE_PHASE" });
        } else {
          dispatch({ type:"PASS_PRIORITY" });
        }
        setAiThinking(false);
        aiTurnRef.current = false;
      }, 300);
    }, delay);
    return () => clearTimeout(timer);
  }, [state.phase, state.activePlayer, state.priorityPlayer, state.turn]);

  // Floating damage text
  const addFloat = (text, color, e) => {
    if (!e?.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = makeId();
    setFloatingText(ft=>[...ft, { id, text, color, x:rect.left+rect.width/2, y:rect.top }]);
    setTimeout(()=>setFloatingText(ft=>ft.filter(f=>f.id!==id)), 1200);
  };

  const handleCardClick = (card, zone, who) => {
    if (state.gameOver) return;

    // LAND — tap for mana
    if (zone === "battlefield" && isLand(card) && !card.tapped && who === "player") {
      const manaColor = card.produces?.[0] || "C";
      dispatch({ type:"TAP_LAND", who:"player", iid:card.iid, mana:manaColor });
      return;
    }

    // ARTIFACT with mana — tap
    if (zone === "battlefield" && isArtifact(card) && !card.tapped && card.activated?.effect?.startsWith("addMana") && who==="player") {
      dispatch({ type:"TAP_ARTIFACT_MANA", who:"player", iid:card.iid });
      return;
    }

    // HAND card — select
    if (zone === "hand" && who === "player") {
      if (state.selectedCard === card.iid) {
        dispatch({ type:"SELECT_CARD", iid:null });
      } else {
        dispatch({ type:"SELECT_CARD", iid:card.iid });
      }
      return;
    }

    // BATTLEFIELD — play creature/permanent if selected from hand, or select as target
    if (zone === "battlefield") {
      const selectedCard = state.player.hand.find(c=>c.iid===state.selectedCard);
      if (selectedCard && (isCreature(selectedCard)||isArtifact(selectedCard)||isEnchantment(selectedCard))) {
        // Target selected — cast with this creature as target context
        dispatch({ type:"CAST_PERMANENT", who:"player", iid:selectedCard.iid });
        dispatch({ type:"SELECT_CARD", iid:null });
        return;
      }
      dispatch({ type:"SELECT_TARGET", iid:card.iid });
      return;
    }
  };

  const handleCastSelectedCard = () => {
    const card = state.player.hand.find(c=>c.iid===state.selectedCard);
    if (!card) return;
    if (isLand(card)) {
      dispatch({ type:"PLAY_LAND", who:"player", iid:card.iid });
      dispatch({ type:"SELECT_CARD", iid:null });
      return;
    }
    if (isCreature(card)) {
      dispatch({ type:"CAST_CREATURE", who:"player", iid:card.iid });
      dispatch({ type:"SELECT_CARD", iid:null });
      return;
    }
    if (isArtifact(card)||isEnchantment(card)) {
      dispatch({ type:"CAST_PERMANENT", who:"player", iid:card.iid });
      dispatch({ type:"SELECT_CARD", iid:null });
      return;
    }
    // Spell — find target
    const targetIid = state.selectedTarget;
    const targetCreature = targetIid ? getBattlefieldCard(state, targetIid) : null;
    let target = null;
    if (card.effect?.includes("player") || card.effect === "draw3" || card.effect === "gainLife3") target = "player";
    else if (card.effect === "damage3" || card.effect === "damage5" || card.effect === "damageX") target = targetCreature?.iid || "opponent";
    else if (targetCreature) target = targetCreature.iid;
    else target = "opponent";
    dispatch({ type:"CAST_SPELL", who:"player", iid:card.iid, target, xValue: xInput });
    dispatch({ type:"SELECT_CARD", iid:null });
    dispatch({ type:"SELECT_TARGET", iid:null });
  };

  const handleAttackerClick = (iid) => {
    if (state.phase !== "DECLARE_ATTACKERS" || state.activePlayer !== "player") return;
    dispatch({ type:"DECLARE_ATTACKER", iid });
  };

  const handleBlockerClick = (blockerIid) => {
    if (state.phase !== "DECLARE_BLOCKERS") return;
    // need an attacker selected
    if (state.selectedTarget) {
      dispatch({ type:"DECLARE_BLOCKER", blockerIid, attackerIid:state.selectedTarget });
      dispatch({ type:"SELECT_TARGET", iid:null });
    } else {
      dispatch({ type:"SELECT_TARGET", iid:blockerIid });
    }
  };

  const selectedCardDef = state.player.hand.find(c=>c.iid===state.selectedCard);
  const isInCombat = ["DECLARE_ATTACKERS","DECLARE_BLOCKERS","FIRST_STRIKE","COMBAT_DAMAGE"].includes(state.phase);
  const playerManaTotal = Object.values(state.player.manaPool).reduce((a,b)=>a+b,0);
  const opponentManaTotal = Object.values(state.opponent.manaPool).reduce((a,b)=>a+b,0);

  return (
    <div style={{
      height:"100vh", width:"100vw", background:"#0a0806",
      display:"flex", flexDirection:"column",
      fontFamily:"'Crimson Text',serif",
      backgroundImage:"radial-gradient(ellipse at 50% 50%,rgba(30,15,5,0.8) 0%,transparent 80%)",
      overflow:"hidden",
    }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Floating damage numbers */}
      {floatingText.map(f=>(
        <div key={f.id} style={{
          position:"fixed", left:f.x, top:f.y, zIndex:2000,
          fontSize:18, fontWeight:700, color:f.color,
          fontFamily:"'Cinzel',serif", pointerEvents:"none",
          animation:"cardDraw 1.2s ease-out forwards",
          textShadow:`0 0 10px ${f.color}`,
        }}>{f.text}</div>
      ))}

      {/* GAME OVER OVERLAY */}
      {state.gameOver && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{state.gameOver.winner==="player"?"✦":"💀"}</div>
            <div style={{ fontSize:28, fontFamily:"'Cinzel',serif", color:state.gameOver.winner==="player"?"#80e080":"#e04040", marginBottom:8 }}>
              {state.gameOver.winner==="player"?"Victory!":"Defeat"}
            </div>
            <div style={{ fontSize:13, color:"#a09060", marginBottom:24 }}>{state.gameOver.reason}</div>
            <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
              <button onClick={onExit} style={{ background:"transparent",border:"1px solid #5a4020",color:"#a08040",padding:"10px 24px",borderRadius:6,cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:13 }}>Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <div style={{ padding:"6px 14px", borderBottom:"1px solid rgba(200,160,60,0.15)", background:"rgba(0,0,0,0.5)", display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:12, fontFamily:"'Cinzel',serif", color:"#8a6030" }}>
            {config.ruleset.name}
          </span>
          <span style={{ fontSize:10, color:"#4a3820" }}>Turn {state.turn}</span>
          {config.ruleset.manaBurn && <span style={{ fontSize:9, color:"#c06030", fontFamily:"'Cinzel',serif" }}>⚠ MANA BURN</span>}
          {aiThinking && <span style={{ fontSize:10, color:"#8080c0", animation:"pulse 1s infinite" }}>Opponent thinking…</span>}
        </div>
        <PhaseTracker phase={state.phase} activePlayer={state.activePlayer} ruleset={config.ruleset}/>
        <button onClick={onExit} style={{ background:"transparent",border:"1px solid rgba(150,80,40,0.3)",color:"#806040",padding:"3px 10px",borderRadius:4,cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif" }}>✕ Exit</button>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* BATTLEFIELD (main area) */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>

          {/* OPPONENT SIDE */}
          <div style={{ flex:"0 0 auto", borderBottom:"1px solid rgba(180,60,20,0.2)", background:"rgba(30,10,5,0.4)" }}>
            {/* Opponent life / info bar */}
            <div style={{ padding:"8px 14px", display:"flex", alignItems:"center", gap:16, borderBottom:"1px solid rgba(100,40,20,0.2)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:11, color:"#e05030", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>OPP</div>
                <div style={{
                  fontSize:22, fontWeight:700, fontFamily:"'Cinzel',serif",
                  color: state.opponent.life <= 5 ? "#ff2020" : state.opponent.life <= 10 ? "#e06030" : "#e09060",
                  animation: state.opponent.life <= 5 ? "pulse 1s infinite" : "none",
                  minWidth:36,
                }}>{state.opponent.life}</div>
                <div style={{ width:60, height:8, background:"#1a0a00", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ width:`${Math.max(0,(state.opponent.life/config.ruleset.startingLife)*100)}%`, height:"100%", background:state.opponent.life<=5?"#c01010":state.opponent.life<=10?"#a04020":"#c06030", transition:"width 0.4s", borderRadius:4 }}/>
                </div>
              </div>
              <div style={{ fontSize:10, color:"#5a3820" }}>
                📚{state.opponent.library.length} ✋{state.opponent.hand.length} 🪦{state.opponent.graveyard.length}
              </div>
              {opponentManaTotal > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:9, color:"#5a4020" }}>Pool:</span>
                  <ManaPool pool={state.opponent.manaPool} size={12}/>
                </div>
              )}
              <div style={{ fontSize:10, color:"#4a3020" }}>
                {ARCHETYPES[config.opponentArchetype]?.name} ({ARCHETYPES[config.opponentArchetype]?.strategy})
              </div>
              {/* Opponent hand (face down) */}
              <div style={{ display:"flex", gap:3, marginLeft:"auto" }}>
                {state.opponent.hand.map((_,i)=>(
                  <div key={i} style={{ width:28,height:40,background:"linear-gradient(135deg,#1a1008,#0e0c04)",border:"1px solid #3a2810",borderRadius:4 }}/>
                ))}
              </div>
            </div>

            {/* Opponent battlefield */}
            <div style={{ padding:"8px 14px 10px", minHeight:130, display:"flex", alignItems:"center" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {state.opponent.battlefield.filter(isLand).map(c=>(
                  <BattlefieldCard key={c.iid} card={c} state={state}
                    selected={state.selectedTarget===c.iid}
                    attacking={state.attackers.includes(c.iid)}
                    beingBlocked={Object.values(state.blockers).includes(c.iid)}
                    onClick={()=>dispatch({type:"SELECT_TARGET",iid:c.iid})}
                    onRightClick={c=>setTooltip(t=>t?.card?.iid===c.iid?null:{card:c,pos:{x:0,y:0}})}
                    small/>
                ))}
                {state.opponent.battlefield.filter(isLand).length > 0 && state.opponent.battlefield.filter(c=>!isLand(c)).length > 0 && (
                  <div style={{ width:1, background:"rgba(255,255,255,0.1)", margin:"0 4px", alignSelf:"stretch" }}/>
                )}
                {state.opponent.battlefield.filter(c=>!isLand(c)).map(c=>(
                  <div key={c.iid}
                    onMouseMove={e=>setTooltip({card:c,pos:{x:e.clientX,y:e.clientY}})}
                    onMouseLeave={()=>setTooltip(null)}>
                    <BattlefieldCard card={c} state={state}
                      selected={state.selectedTarget===c.iid}
                      attacking={state.attackers.includes(c.iid)}
                      beingBlocked={Object.values(state.blockers).includes(c.iid)}
                      onClick={()=>{
                        if (state.phase==="DECLARE_BLOCKERS") handleBlockerClick(c.iid);
                        else dispatch({type:"SELECT_TARGET",iid:c.iid});
                      }}/>
                  </div>
                ))}
                {state.opponent.battlefield.length === 0 && (
                  <div style={{ fontSize:11, color:"#3a2810", fontStyle:"italic", padding:"0 8px" }}>No permanents</div>
                )}
              </div>
            </div>
          </div>

          {/* CENTER DIVIDER — stack, attack arrows, phase actions */}
          <div style={{
            flexShrink:0, padding:"6px 14px",
            background:"rgba(0,0,0,0.5)",
            borderTop:"1px solid rgba(200,160,60,0.1)",
            borderBottom:"1px solid rgba(200,160,60,0.1)",
            display:"flex", alignItems:"center", gap:10,
          }}>
            {/* Phase action buttons */}
            <div style={{ display:"flex", gap:6 }}>
              {state.activePlayer === "player" && (
                <>
                  {/* Main phase actions */}
                  {(state.phase==="MAIN1"||state.phase==="MAIN2") && selectedCardDef && (
                    <button onClick={handleCastSelectedCard} style={{
                      background:`linear-gradient(135deg,${MANA_BG[selectedCardDef.color]||"#555"}20,rgba(0,0,0,0.5))`,
                      border:`1px solid ${MANA_BG[selectedCardDef.color]||"#888"}60`,
                      color:CARD_ACCENT_COLOR[selectedCardDef.color]||"#ccc",
                      padding:"4px 12px", borderRadius:4, cursor:"pointer",
                      fontSize:10, fontFamily:"'Cinzel',serif",
                    }}>
                      {isLand(selectedCardDef)?"Play":"Cast"} {selectedCardDef.name}
                    </button>
                  )}
                  {(state.phase==="DECLARE_ATTACKERS") && (
                    <div style={{ fontSize:10, color:"#e08040", fontFamily:"'Cinzel',serif", animation:"pulse 1.5s infinite" }}>
                      ⚔ Click creatures to declare attackers
                    </div>
                  )}
                  {(state.phase==="DECLARE_BLOCKERS") && (
                    <div style={{ fontSize:10, color:"#e08040", fontFamily:"'Cinzel',serif", animation:"pulse 1.5s infinite" }}>
                      🛡 Click your creatures to assign blockers
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stack display */}
            {state.stack.length > 0 && (
              <div style={{ display:"flex", gap:4, alignItems:"center", flex:1 }}>
                <span style={{ fontSize:9, color:"#6a5030", fontFamily:"'Cinzel',serif" }}>STACK:</span>
                {state.stack.map((item,i)=>(
                  <div key={item.id} style={{
                    padding:"3px 8px", borderRadius:4, fontSize:10,
                    background:"rgba(100,60,160,0.2)", border:"1px solid rgba(120,80,180,0.4)",
                    color:"#c0a0e0", fontFamily:"'Cinzel',serif",
                    animation:"stackEntry 0.2s ease-out",
                  }}>{item.card.name}</div>
                ))}
                {state.player.hand.some(c=>c.effect==="counter" && canAfford(state.player.manaPool, c.cost)) && state.stack.length>0 && (
                  <button onClick={()=>{
                    const counter = state.player.hand.find(c=>c.effect==="counter"&&canAfford(state.player.manaPool,c.cost));
                    if(counter) dispatch({type:"CAST_SPELL",who:"player",iid:counter.iid,target:null});
                  }} style={{
                    background:"rgba(0,30,60,0.5)",border:"1px solid rgba(80,120,200,0.5)",
                    color:"#80a0e0",padding:"3px 8px",borderRadius:4,cursor:"pointer",
                    fontSize:10,fontFamily:"'Cinzel',serif",
                  }}>Counter</button>
                )}
                {state.activePlayer==="player" && (
                  <button onClick={()=>dispatch({type:"RESOLVE_STACK"})} style={{
                    background:"rgba(40,20,0,0.5)",border:"1px solid rgba(180,120,40,0.4)",
                    color:"#c09040",padding:"3px 8px",borderRadius:4,cursor:"pointer",
                    fontSize:10,fontFamily:"'Cinzel',serif",
                  }}>Resolve</button>
                )}
              </div>
            )}

            {/* Attack info */}
            {state.attackers.length > 0 && (
              <div style={{ fontSize:10, color:"#f08040", fontFamily:"'Cinzel',serif" }}>
                ⚔ {state.attackers.length} attacker{state.attackers.length!==1?"s":""}
                {Object.keys(state.blockers).length>0&&` | 🛡 ${Object.keys(state.blockers).length} blocked`}
              </div>
            )}

            {/* X input */}
            {selectedCardDef && selectedCardDef.cost?.includes("X") && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#6a5030" }}>X =</span>
                <input type="number" min={0} max={20} value={xInput} onChange={e=>setXInput(parseInt(e.target.value)||0)}
                  style={{ width:40,background:"rgba(0,0,0,0.5)",border:"1px solid #5a4020",color:"#f0c040",padding:"2px 4px",borderRadius:3,fontSize:12,fontFamily:"'Fira Code',monospace" }}/>
              </div>
            )}

            {/* Pass / Next Phase */}
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              {state.activePlayer==="player" && (
                <button onClick={()=>dispatch({type:"ADVANCE_PHASE"})} style={{
                  background:"linear-gradient(135deg,#1a1004,#2a1808)",
                  border:"1px solid rgba(200,160,40,0.4)", color:"#f0c040",
                  padding:"5px 16px", borderRadius:5, cursor:"pointer",
                  fontSize:11, fontFamily:"'Cinzel',serif", letterSpacing:1,
                }}>
                  {state.phase==="CLEANUP"?"End Turn":"Next Phase →"}
                </button>
              )}
              {state.activePlayer!=="player" && (
                <div style={{ fontSize:10, color:"#5a4020", fontFamily:"'Cinzel',serif", padding:"5px 12px" }}>
                  Opponent's Turn…
                </div>
              )}
            </div>
          </div>

          {/* PLAYER BATTLEFIELD */}
          <div style={{ flex:"1 1 auto", overflow:"auto", background:"rgba(0,0,0,0.2)", borderBottom:"1px solid rgba(200,160,60,0.15)" }}>
            <div style={{ padding:"8px 14px", minHeight:130, display:"flex", alignItems:"center" }}>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {state.player.battlefield.filter(isLand).map(c=>(
                  <div key={c.iid}
                    onMouseMove={e=>setTooltip({card:c,pos:{x:e.clientX,y:e.clientY}})}
                    onMouseLeave={()=>setTooltip(null)}>
                    <BattlefieldCard card={c} state={state}
                      selected={state.selectedCard===c.iid||state.selectedTarget===c.iid}
                      onClick={()=>handleCardClick(c,"battlefield","player")}
                      small/>
                  </div>
                ))}
                {state.player.battlefield.filter(isLand).length>0 && state.player.battlefield.filter(c=>!isLand(c)).length>0 && (
                  <div style={{ width:1, background:"rgba(255,255,255,0.08)", margin:"0 4px", alignSelf:"stretch" }}/>
                )}
                {state.player.battlefield.filter(c=>!isLand(c)).map(c=>(
                  <div key={c.iid}
                    onMouseMove={e=>setTooltip({card:c,pos:{x:e.clientX,y:e.clientY}})}
                    onMouseLeave={()=>setTooltip(null)}>
                    <BattlefieldCard card={c} state={state}
                      selected={state.selectedCard===c.iid||state.selectedTarget===c.iid}
                      attacking={state.attackers.includes(c.iid)}
                      onClick={()=>{
                        if (state.phase==="DECLARE_ATTACKERS") handleAttackerClick(c.iid);
                        else if (state.phase==="DECLARE_BLOCKERS") handleBlockerClick(c.iid);
                        else handleCardClick(c,"battlefield","player");
                      }}/>
                  </div>
                ))}
                {state.player.battlefield.length===0 && (
                  <div style={{ fontSize:11, color:"#2a1808", fontStyle:"italic", padding:"0 8px" }}>Empty battlefield</div>
                )}
              </div>
            </div>
          </div>

          {/* PLAYER INFO BAR */}
          <div style={{ flexShrink:0, padding:"6px 14px", borderBottom:"1px solid rgba(200,160,60,0.15)", background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontSize:11, color:"#60d060", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>YOU</div>
              <div style={{
                fontSize:22, fontWeight:700, fontFamily:"'Cinzel',serif",
                color: state.player.life<=5?"#ff2020":state.player.life<=10?"#e06030":"#60d060",
                animation: state.player.life<=5?"pulse 1s infinite":"none",
              }}>{state.player.life}</div>
              <div style={{ width:60, height:8, background:"#0a1a0a", borderRadius:4, overflow:"hidden" }}>
                <div style={{ width:`${Math.max(0,(state.player.life/config.ruleset.startingLife)*100)}%`, height:"100%", background:state.player.life<=5?"#c01010":state.player.life<=10?"#80a020":"#30a040", transition:"width 0.4s", borderRadius:4 }}/>
              </div>
            </div>
            <div style={{ fontSize:10, color:"#4a4020" }}>
              📚{state.player.library.length} 🪦{state.player.graveyard.length}
            </div>
            {playerManaTotal > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ fontSize:9, color:"#5a5020" }}>Pool:</span>
                <ManaPool pool={state.player.manaPool} size={14}/>
                {config.ruleset.manaBurn && <span style={{ fontSize:9, color:"#c06020" }}>⚠ burn</span>}
              </div>
            )}
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <button onClick={()=>dispatch({type:"MULLIGAN",who:"player"})} style={{
                background:"transparent",border:"1px solid rgba(150,100,40,0.3)",color:"#806040",
                padding:"3px 8px",borderRadius:4,cursor:"pointer",fontSize:10,fontFamily:"'Cinzel',serif",
              }}>Mulligan</button>
            </div>
          </div>

          {/* PLAYER HAND */}
          <div style={{ flexShrink:0, padding:"8px 14px", display:"flex", gap:5, alignItems:"flex-end", background:"rgba(0,0,0,0.3)", overflowX:"auto", minHeight:130 }}>
            {state.player.hand.map(c => {
              const playable = canCastNow(c, state, "player");
              return (
                <div key={c.iid}
                  onMouseMove={e=>setTooltip({card:c,pos:{x:e.clientX,y:e.clientY}})}
                  onMouseLeave={()=>setTooltip(null)}>
                  <HandCard
                    card={c} state={state}
                    selected={state.selectedCard===c.iid}
                    playable={playable}
                    onClick={()=>handleCardClick(c,"hand","player")}/>
                </div>
              );
            })}
            {state.player.hand.length===0 && (
              <div style={{ fontSize:11, color:"#2a2010", fontStyle:"italic", padding:"0 8px", alignSelf:"center" }}>No cards in hand</div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR — log + graveyard + controls */}
        <div style={{ width:220, borderLeft:"1px solid rgba(200,160,60,0.15)", display:"flex", flexDirection:"column", background:"rgba(0,0,0,0.3)", flexShrink:0 }}>
          {/* Graveyard preview */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(200,160,60,0.1)" }}>
            <div style={{ fontSize:10, color:"#6a5030", fontFamily:"'Cinzel',serif", letterSpacing:1, marginBottom:6 }}>GRAVEYARDS</div>
            <div style={{ display:"flex", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:"#4a3020", marginBottom:4 }}>You ({state.player.graveyard.length})</div>
                {state.player.graveyard.slice(-1).map(c=>(
                  <div key={c.iid} style={{ fontSize:9, color:"#a08060", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>{c.name}</div>
                ))}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:"#4a3020", marginBottom:4 }}>Opp ({state.opponent.graveyard.length})</div>
                {state.opponent.graveyard.slice(-1).map(c=>(
                  <div key={c.iid} style={{ fontSize:9, color:"#a08060", fontFamily:"'Crimson Text',serif", fontStyle:"italic" }}>{c.name}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Exile (if ruleset has it) */}
          {config.ruleset.exileZone && (
            <div style={{ padding:"8px 12px", borderBottom:"1px solid rgba(200,160,60,0.1)" }}>
              <div style={{ fontSize:9, color:"#5a4030", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>EXILE ({state.player.exile.length} / {state.opponent.exile.length})</div>
            </div>
          )}

          {/* Keyword guide */}
          <div style={{ padding:"10px 12px", borderBottom:"1px solid rgba(200,160,60,0.1)" }}>
            <div style={{ fontSize:10, color:"#6a5030", fontFamily:"'Cinzel',serif", letterSpacing:1, marginBottom:6 }}>RULESET FLAGS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {[
                { label:"Mana Burn",    val:config.ruleset.manaBurn },
                { label:"Mana Burn",    val:config.ruleset.manaBurn },
                { label:"Stack",        val:config.ruleset.stackType },
                { label:"Free Mull",    val:config.ruleset.freeMulligan },
                { label:"London Mull",  val:config.ruleset.londonMulligan },
                { label:"Deathtouch",   val:config.ruleset.deathtouch },
                { label:"Planeswalkers",val:config.ruleset.planeswalkers },
              ].filter((x,i,arr)=>arr.findIndex(y=>y.label===x.label)===i).map(f=>(
                <div key={f.label} style={{ display:"flex", justifyContent:"space-between", fontSize:9, fontFamily:"'Fira Code',monospace" }}>
                  <span style={{ color:"#6a5030" }}>{f.label}</span>
                  <span style={{ color:f.val===true?"#60c060":f.val===false?"#c04040":"#a08040" }}>
                    {typeof f.val==="boolean"?(f.val?"✓":"✗"):f.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Game Log */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:"6px 0" }}>
            <div style={{ fontSize:10, color:"#6a5030", fontFamily:"'Cinzel',serif", letterSpacing:1, padding:"0 12px 4px" }}>GAME LOG</div>
            <GameLog log={state.log}/>
          </div>
        </div>
      </div>

      {/* TOOLTIP */}
      {tooltip && (
        <CardTooltip card={tooltip.card} state={state} pos={tooltip.pos}/>
      )}
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const [screen, setScreen] = useState("setup");
  const [config, setConfig] = useState(null);

  if (screen === "duel" && config) {
    return <DuelScreen config={config} onExit={()=>setScreen("setup")}/>;
  }
  return <SetupScreen onStart={c=>{ setConfig(c); setScreen("duel"); }}/>;
}
