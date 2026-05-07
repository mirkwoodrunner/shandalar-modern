// src/data/cards.js
// Immutable card templates and AI archetype deck lists.
// Per SYSTEMS.md S10 and MECHANICS_INDEX.md S5.1
//
// CONSTRAINTS:
//   - Card definitions are static data only ? no runtime mutation logic
//   - DuelCore.js instantiates cards into gameplay objects via makeCardInstance()
//   - getCardById() is a convenience lookup only

// --- CARD DATABASE ------------------------------------------------------------

export const CARD_DB = [
// -- LANDS --------------------------------------------------
{id:"plains",    name:"Plains",   type:"Land",subtype:"Basic Plains",  color:"",cmc:0,cost:"",text:"T: Add W.",produces:["W"],rarity:"C"},
{id:"island",    name:"Island",   type:"Land",subtype:"Basic Island",  color:"",cmc:0,cost:"",text:"T: Add U.",produces:["U"],rarity:"C"},
{id:"swamp",     name:"Swamp",    type:"Land",subtype:"Basic Swamp",   color:"",cmc:0,cost:"",text:"T: Add B.",produces:["B"],rarity:"C"},
{id:"mountain",  name:"Mountain", type:"Land",subtype:"Basic Mountain",color:"",cmc:0,cost:"",text:"T: Add R.",produces:["R"],rarity:"C"},
{id:"forest",    name:"Forest",   type:"Land",subtype:"Basic Forest",  color:"",cmc:0,cost:"",text:"T: Add G.",produces:["G"],rarity:"C"},
// Dual lands
{id:"tundra",          name:"Tundra",          type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {W} or {U}.)",produces:["W","U"],rarity:"R"},
{id:"underground_sea", name:"Underground Sea", type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {U} or {B}.)",produces:["U","B"],rarity:"R"},
{id:"badlands",        name:"Badlands",        type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {B} or {R}.)",produces:["B","R"],rarity:"R"},
{id:"taiga",           name:"Taiga",           type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {R} or {G}.)",produces:["R","G"],rarity:"R"},
{id:"savannah",        name:"Savannah",        type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {G} or {W}.)",produces:["G","W"],rarity:"R"},
{id:"scrubland",       name:"Scrubland",       type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {W} or {B}.)",produces:["W","B"],rarity:"R"},
{id:"volcanic_island", name:"Volcanic Island", type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {U} or {R}.)",produces:["U","R"],rarity:"R"},
{id:"bayou",           name:"Bayou",           type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {B} or {G}.)",produces:["B","G"],rarity:"R"},
{id:"plateau",         name:"Plateau",         type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {R} or {W}.)",produces:["R","W"],rarity:"R"},
{id:"tropical_island", name:"Tropical Island", type:"Land",color:"",cmc:0,cost:"",text:"({T}: Add {G} or {U}.)",produces:["G","U"],rarity:"R"},
// Special lands
{id:"city_of_brass",   name:"City of Brass",   type:"Land",color:"",cmc:0,cost:"",text:"Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color.",produces:["W","U","B","R","G"],rarity:"U"},
{id:"strip_mine",      name:"Strip Mine",      type:"Land",color:"",cmc:0,cost:"",text:"{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land.",produces:["C"],rarity:"U",activated:{cost:"T,sac",effect:"destroyTargetLand"}},
{id:"library_of_alexandria",name:"Library of Alexandria",type:"Land",color:"",cmc:0,cost:"",text:"{T}: Add {C}.\n{T}: Draw a card. Activate only if you have exactly seven cards in hand.",produces:["C"],rarity:"U",activated:{cost:"T",effect:"draw1"}},

// -- WHITE CREATURES -----------------------------------------
{id:"savannah_lions",   name:"Savannah Lions",   type:"Creature",subtype:"Cat",          color:"W",cmc:1,cost:"W",   power:2,toughness:1,keywords:[],rarity:"R",text:""},
{id:"white_knight",     name:"White Knight",     type:"Creature",subtype:"Knight",       color:"W",cmc:2,cost:"WW",  power:2,toughness:2,keywords:["FIRST_STRIKE","PROTECTION"],protection:["black"],rarity:"U",text:"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"},
{id:"serra_angel",      name:"Serra Angel",      type:"Creature",subtype:"Angel",        color:"W",cmc:5,cost:"3WW", power:4,toughness:4,keywords:["FLYING","VIGILANCE"],rarity:"U",text:"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"},
{id:"mesa_pegasus",     name:"Mesa Pegasus",     type:"Creature",subtype:"Pegasus",      color:"W",cmc:2,cost:"1W",  power:1,toughness:1,keywords:["FLYING","BANDING"],rarity:"C",text:"Flying; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"},
{id:"benalish_hero",    name:"Benalish Hero",    type:"Creature",subtype:"Human",        color:"W",cmc:1,cost:"W",   power:1,toughness:1,keywords:["BANDING"],rarity:"C",text:"Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"},
{id:"pearl_unicorn",    name:"Pearl Unicorn",    type:"Creature",subtype:"Unicorn",      color:"W",cmc:2,cost:"1W",  power:1,toughness:2,keywords:[],rarity:"C",text:""},
{id:"elder_land_wurm",  name:"Elder Land Wurm",  type:"Creature",subtype:"Wurm",         color:"W",cmc:8,cost:"5WWW",power:5,toughness:5,keywords:["TRAMPLE"],rarity:"R",text:"Defender, trample\nWhen this creature blocks, it loses defender."},
{id:"northern_paladin", name:"Northern Paladin", type:"Creature",subtype:"Human Knight", color:"W",cmc:4,cost:"2WW", power:3,toughness:3,keywords:[],rarity:"R",text:"{W}{W}, {T}: Destroy target black permanent.",activated:{cost:"WW,T",effect:"destroyBlack"}},
{id:"samite_healer",    name:"Samite Healer",    type:"Creature",subtype:"Human Cleric", color:"W",cmc:2,cost:"1W",  power:1,toughness:1,keywords:[],rarity:"C",text:"{T}: Prevent the next 1 damage that would be dealt to any target this turn.",activated:{cost:"T",effect:"gainLife1"}},
{id:"tundra_wolves",    name:"Tundra Wolves",    type:"Creature",subtype:"Wolf",         color:"W",cmc:1,cost:"W",   power:1,toughness:1,keywords:["FIRST_STRIKE"],rarity:"C",text:"First strike (This creature deals combat damage before creatures without first strike.)"},
{id:"pearled_unicorn",  name:"Pearled Unicorn",  type:"Creature",subtype:"Unicorn",      color:"W",cmc:2,cost:"1W",  power:2,toughness:2,keywords:[],rarity:"C",text:""},
{id:"pikemen",          name:"Pikemen",          type:"Creature",subtype:"Human Soldier", color:"W",cmc:2,cost:"1W",  power:1,toughness:1,keywords:["FIRST_STRIKE","BANDING"],rarity:"C",text:"First strike; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"},
{id:"moorish_cavalry",  name:"Moorish Cavalry",  type:"Creature",subtype:"Human Knight", color:"W",cmc:4,cost:"3W",  power:3,toughness:3,keywords:["FIRST_STRIKE"],rarity:"U",text:"Trample"},
{id:"war_elephant",     name:"War Elephant",     type:"Creature",subtype:"Elephant",     color:"W",cmc:4,cost:"3W",  power:2,toughness:2,keywords:["TRAMPLE","BANDING"],rarity:"U",text:"Trample; banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"},
{id:"wall_of_swords",   name:"Wall of Swords",   type:"Creature",subtype:"Wall",          color:"W",cmc:4,cost:"3W",  power:3,toughness:5,keywords:["FLYING","DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)\nFlying"},
{id:"witch_hunter",     name:"Witch Hunter",     type:"Creature",subtype:"Human Cleric",  color:"W",cmc:3,cost:"2W",  power:1,toughness:1,keywords:[],rarity:"U",text:"{T}: This creature deals 1 damage to target player or planeswalker.\n{1}{W}{W}, {T}: Return target creature an opponent controls to its owner's hand.",activated:{cost:"T",effect:"ping"}},

// -- BLUE CREATURES ------------------------------------------
{id:"merfolk_of_the_pearl_trident",    name:"Merfolk of the Pearl Trident",type:"Creature",subtype:"Merfolk",       color:"U",cmc:1,cost:"U",   power:1,toughness:1,keywords:[],rarity:"C",text:""},
{id:"lord_of_atlantis",    name:"Lord of Atlantis",            type:"Creature",subtype:"Merfolk",       color:"U",cmc:2,cost:"UU",  power:2,toughness:2,keywords:[],rarity:"R",text:"Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)"},
{id:"phantom_warrior",  name:"Phantom Warrior",             type:"Creature",subtype:"Illusion",      color:"U",cmc:3,cost:"1UU", power:2,toughness:2,keywords:[],rarity:"U",text:"Unblockable."},
{id:"air_elemental",    name:"Air Elemental",               type:"Creature",subtype:"Elemental",     color:"U",cmc:5,cost:"3UU", power:4,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying"},
{id:"mahamoti_djinn",   name:"Mahamoti Djinn",              type:"Creature",subtype:"Djinn",         color:"U",cmc:6,cost:"4UU", power:5,toughness:6,keywords:["FLYING"],rarity:"R",text:"Flying (This creature can't be blocked except by creatures with flying or reach.)"},
{id:"prodigal_sorcerer",name:"Prodigal Sorcerer",           type:"Creature",subtype:"Human Wizard",  color:"U",cmc:3,cost:"2U",  power:1,toughness:1,keywords:[],rarity:"C",text:"{T}: This creature deals 1 damage to any target.",activated:{cost:"T",effect:"ping"}},
{id:"azure_drake",      name:"Azure Drake",                 type:"Creature",subtype:"Drake",         color:"U",cmc:4,cost:"3U",  power:2,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying"},
{id:"phantom_monster",  name:"Phantom Monster",             type:"Creature",subtype:"Illusion",      color:"U",cmc:4,cost:"3U",  power:3,toughness:3,keywords:["FLYING"],rarity:"U",text:"Flying"},
{id:"flying_men",       name:"Flying Men",                  type:"Creature",subtype:"Human",         color:"U",cmc:1,cost:"U",   power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying"},
{id:"dandan",           name:"Dand?n",                      type:"Creature",subtype:"Fish",          color:"U",cmc:2,cost:"UU",  power:4,toughness:1,keywords:[],rarity:"C",text:"Dand?n can't attack unless defending player controls an Island."},
{id:"sea_serpent",      name:"Sea Serpent",                 type:"Creature",subtype:"Serpent",       color:"U",cmc:6,cost:"5U",  power:5,toughness:5,keywords:[],rarity:"C",text:"This creature can't attack unless defending player controls an Island.\nWhen you control no Islands, sacrifice this creature."},
{id:"phantasmal_forces",name:"Phantasmal Forces",           type:"Creature",subtype:"Illusion",      color:"U",cmc:4,cost:"3U",  power:4,toughness:1,keywords:["FLYING"],rarity:"U",text:"Flying\nAt the beginning of your upkeep, sacrifice this creature unless you pay {U}.",upkeep:"sacrificeUnless_U"},
{id:"wall_of_air",      name:"Wall of Air",                 type:"Creature",subtype:"Wall",          color:"U",cmc:3,cost:"1UU", power:1,toughness:5,keywords:["FLYING","DEFENDER"],rarity:"U",text:"Defender, flying (This creature can't attack, and it can block creatures with flying.)"},
{id:"ghost_ship",       name:"Ghost Ship",                  type:"Creature",subtype:"Spirit",        color:"U",cmc:4,cost:"2UU", power:2,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying\n{U}{U}{U}: Regenerate this creature.",activated:{cost:"UUU",effect:"regenerate"}},
{id:"merfolk_assassin", name:"Merfolk Assassin",            type:"Creature",subtype:"Merfolk Assassin",color:"U",cmc:3,cost:"2U",power:1,toughness:1,keywords:[],rarity:"U",text:"{T}: Destroy target creature with islandwalk.",activated:{cost:"T",effect:"destroyTapped"}},
{id:"clone",            name:"Clone",                       type:"Creature",subtype:"Shapeshifter",  color:"U",cmc:4,cost:"3U",  power:0,toughness:0,keywords:[],rarity:"U",text:"You may have this creature enter as a copy of any creature on the battlefield.",effect:"clone"},
{id:"giant_tortoise",   name:"Giant Tortoise",              type:"Creature",subtype:"Turtle",       color:"U",cmc:2,cost:"1U",  power:1,toughness:4,keywords:[],rarity:"C",text:"This creature gets +0/+3 as long as it's untapped."},
{id:"glacial_wall",     name:"Glacial Wall",                type:"Creature",subtype:"Wall",         color:"U",cmc:3,cost:"2U",  power:0,toughness:7,keywords:["FLYING","DEFENDER"],rarity:"U",text:"Flying."},
{id:"water_elemental",  name:"Water Elemental",             type:"Creature",subtype:"Elemental",    color:"U",cmc:5,cost:"3UU", power:5,toughness:4,keywords:[],rarity:"U",text:""},
{id:"zephyr_falcon",    name:"Zephyr Falcon",               type:"Creature",subtype:"Bird",         color:"U",cmc:2,cost:"1U",  power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying, vigilance"},

// -- BLACK CREATURES -----------------------------------------
{id:"hypnotic_specter", name:"Hypnotic Specter", type:"Creature",subtype:"Specter",         color:"B",cmc:3,cost:"1BB", power:2,toughness:2,keywords:["FLYING"],rarity:"U",text:"Flying\nWhenever this creature deals damage to an opponent, that player discards a card at random."},
{id:"sengir_vampire",   name:"Sengir Vampire",   type:"Creature",subtype:"Vampire",         color:"B",cmc:5,cost:"3BB", power:4,toughness:4,keywords:["FLYING"],rarity:"U",text:"Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature.",triggered:"vampireCounter",triggeredAbilities:[{id:"sengir_counter",trigger:{event:"ON_CREATURE_DIES",scope:"global"},condition:{type:"damagedByThisTurn"},effect:{type:"addCounter",counter:"+1/+1",amount:1},optional:false,requiresChoice:false}]},
{id:"juzam_djinn",      name:"Juzam Djinn",      type:"Creature",subtype:"Djinn",           color:"B",cmc:4,cost:"2BB", power:5,toughness:5,keywords:[],rarity:"R",text:"At upkeep, Juzam Djinn deals 1 damage to you.",upkeep:"selfDamage1"},
{id:"drudge_skeletons", name:"Drudge Skeletons", type:"Creature",subtype:"Skeleton",        color:"B",cmc:2,cost:"1B",  power:1,toughness:1,keywords:[],rarity:"C",text:"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)",activated:{cost:"B",effect:"regenerate"}},
{id:"black_knight",     name:"Black Knight",     type:"Creature",subtype:"Knight",          color:"B",cmc:2,cost:"BB",  power:2,toughness:2,keywords:["FIRST_STRIKE","PROTECTION"],protection:["white"],rarity:"U",text:"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)"},
{id:"royal_assassin",   name:"Royal Assassin",   type:"Creature",subtype:"Human Assassin",  color:"B",cmc:3,cost:"1BB", power:1,toughness:1,keywords:[],rarity:"R",text:"{T}: Destroy target tapped creature.",activated:{cost:"T",effect:"destroyTapped"}},
{id:"plague_rats",      name:"Plague Rats",      type:"Creature",subtype:"Rat",             color:"B",cmc:2,cost:"2B",  power:0,toughness:0,keywords:[],rarity:"C",text:"Plague Rats's power and toughness are each equal to the number of creatures named Plague Rats on the battlefield.",dynamic:true},
{id:"lord_of_the_pit",      name:"Lord of the Pit",  type:"Creature",subtype:"Demon",           color:"B",cmc:7,cost:"4BBB",power:7,toughness:7,keywords:["FLYING","TRAMPLE"],rarity:"R",text:"Flying, trample\nAt the beginning of your upkeep, sacrifice a creature other than this creature. If you can't, this creature deals 7 damage to you.",upkeep:"lordsUpkeep"},
{id:"nightmare",        name:"Nightmare",        type:"Creature",subtype:"Horse",           color:"B",cmc:6,cost:"5B",  power:0,toughness:0,keywords:["FLYING"],rarity:"R",text:"Flying (This creature can't be blocked except by creatures with flying or reach.)\nNightmare's power and toughness are each equal to the number of Swamps you control.",dynamic:true,dynamicType:"swampCount"},
{id:"frozen_shade",     name:"Frozen Shade",     type:"Creature",subtype:"Shade",           color:"B",cmc:2,cost:"1B",  power:0,toughness:1,keywords:[],rarity:"C",text:"{B}: This creature gets +1/+1 until end of turn.",activated:{cost:"B",effect:"pumpSelf"}},
{id:"bog_wraith",       name:"Bog Wraith",       type:"Creature",subtype:"Wraith",          color:"B",cmc:4,cost:"3B",  power:3,toughness:3,keywords:["SWAMPWALK"],rarity:"U",text:"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)"},
{id:"scathe_zombies",   name:"Scathe Zombies",   type:"Creature",subtype:"Zombie",          color:"B",cmc:3,cost:"2B",  power:2,toughness:2,keywords:[],rarity:"C",text:""},
{id:"vampire_bats",     name:"Vampire Bats",     type:"Creature",subtype:"Bat",             color:"B",cmc:1,cost:"B",   power:0,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying (This creature can't be blocked except by creatures with flying or reach.)\n{B}: This creature gets +1/+0 until end of turn. Activate no more than twice each turn.",activated:{cost:"B",effect:"pumpSelf"}},
{id:"zombie_master",    name:"Zombie Master",    type:"Creature",subtype:"Zombie",          color:"B",cmc:3,cost:"1BB", power:2,toughness:3,keywords:[],rarity:"R",text:"Other Zombie creatures have swampwalk. (They can't be blocked as long as defending player controls a Swamp.)\nOther Zombies have \"{B}: Regenerate this permanent.\""},
{id:"walking_dead",     name:"Walking Dead",     type:"Creature",subtype:"Zombie",          color:"B",cmc:1,cost:"B",   power:1,toughness:1,keywords:[],rarity:"C",text:"{B}: Regenerate this creature.",activated:{cost:"B",effect:"regenerate"}},
{id:"bog_imp",          name:"Bog Imp",          type:"Creature",subtype:"Imp",             color:"B",cmc:2,cost:"1B",  power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying (This creature can't be blocked except by creatures with flying or reach.)"},
{id:"rag_man",          name:"Rag Man",          type:"Creature",subtype:"Human Minion",    color:"B",cmc:4,cost:"1BBB",power:2,toughness:1,keywords:[],rarity:"R",text:"{B}{B}{B}, {T}: Target opponent reveals their hand and discards a creature card at random. Activate only during your turn.",activated:{cost:"T",effect:"discardOne"}},
{id:"demonic_hordes",   name:"Demonic Hordes",   type:"Creature",subtype:"Demon",           color:"B",cmc:5,cost:"2BBB",power:5,toughness:5,keywords:[],rarity:"R",text:"{T}: Destroy target land.\nAt the beginning of your upkeep, unless you pay {B}{B}{B}, tap this creature and sacrifice a land of an opponent's choice.",activated:{cost:"BBB,T",effect:"destroyTargetLand"},upkeep:"demonicHordesUpkeep"},
{id:"erg_raiders",      name:"Erg Raiders",      type:"Creature",subtype:"Human Warrior",   color:"B",cmc:2,cost:"1B",  power:2,toughness:3,keywords:[],rarity:"C",text:"At the beginning of your end step, if this creature didn't attack this turn, it deals 2 damage to you unless it came under your control this turn."},
{id:"nettling_imp",     name:"Nettling Imp",     type:"Creature",subtype:"Imp",             color:"B",cmc:3,cost:"2B",  power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"{T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That creature attacks this turn if able. Destroy it at the beginning of the next end step if it didn't attack this turn. Activate only during an opponent's turn, before attackers are declared.",activated:{cost:"T",effect:"forceAttack"}},
{id:"sorceress_queen",  name:"Sorceress Queen",  type:"Creature",subtype:"Human Wizard",    color:"B",cmc:4,cost:"2BB", power:1,toughness:1,keywords:[],rarity:"R",text:"{T}: Target creature other than this creature has base power and toughness 0/2 until end of turn.",activated:{cost:"T",effect:"setPT02"}},
{id:"stromgald_cabal",  name:"Stromgald Cabal",  type:"Creature",subtype:"Human Knight",    color:"B",cmc:4,cost:"2BB", power:3,toughness:3,keywords:[],rarity:"R",text:"BB: Counter target white spell.",activated:{cost:"BB",effect:"counterWhite"}},

// -- RED CREATURES -------------------------------------------
{id:"goblin_king",      name:"Goblin King",              type:"Creature",subtype:"Goblin",    color:"R",cmc:3,cost:"1RR", power:2,toughness:2,keywords:[],rarity:"R",text:"Other Goblins get +1/+1 and have mountainwalk."},
{id:"shivan_dragon",    name:"Shivan Dragon",            type:"Creature",subtype:"Dragon",    color:"R",cmc:6,cost:"4RR", power:5,toughness:5,keywords:["FLYING"],rarity:"R",text:"Flying\n{R}: This creature gets +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"}},
{id:"earth_elemental",  name:"Earth Elemental",          type:"Creature",subtype:"Elemental", color:"R",cmc:5,cost:"3RR", power:4,toughness:5,keywords:[],rarity:"U",text:""},
{id:"goblin_balloon_brigade",   name:"Goblin Balloon Brigade",   type:"Creature",subtype:"Goblin",    color:"R",cmc:1,cost:"R",   power:1,toughness:1,keywords:[],rarity:"C",text:"{R}: This creature gains flying until end of turn.",activated:{cost:"R",effect:"gainFlying"}},
{id:"monss_goblin_raiders",      name:"Mons's Goblin Raiders",    type:"Creature",subtype:"Goblin",    color:"R",cmc:1,cost:"R",   power:1,toughness:1,keywords:[],rarity:"C",text:""},
{id:"ball_lightning",   name:"Ball Lightning",           type:"Creature",subtype:"Elemental", color:"R",cmc:3,cost:"RRR", power:6,toughness:1,keywords:["TRAMPLE","HASTE"],rarity:"R",text:"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nHaste (This creature can attack and {T} as soon as it comes under your control.)\nAt the beginning of the end step, sacrifice this creature.",upkeep:"sacrificeSelf"},
{id:"kird_ape",         name:"Kird Ape",                 type:"Creature",subtype:"Ape",       color:"R",cmc:1,cost:"R",   power:1,toughness:1,keywords:[],rarity:"U",text:"This creature gets +1/+2 as long as you control a Forest.",dynamic:true,dynamicType:"forestBonus"},
{id:"hill_giant",       name:"Hill Giant",               type:"Creature",subtype:"Giant",     color:"R",cmc:4,cost:"3R",  power:3,toughness:3,keywords:[],rarity:"C",text:""},
{id:"ironclaw_orcs",    name:"Ironclaw Orcs",            type:"Creature",subtype:"Orc",       color:"R",cmc:2,cost:"1R",  power:2,toughness:2,keywords:[],rarity:"C",text:"This creature can't block creatures with power 2 or greater."},
{id:"orcish_artillery", name:"Orcish Artillery",         type:"Creature",subtype:"Orc",       color:"R",cmc:3,cost:"1RR", power:1,toughness:3,keywords:[],rarity:"U",text:"{T}: This creature deals 2 damage to any target and 3 damage to you.",activated:{cost:"T",effect:"orcishArtillery"}},
{id:"hurloon_minotaur", name:"Hurloon Minotaur",         type:"Creature",subtype:"Minotaur",  color:"R",cmc:3,cost:"1RR", power:2,toughness:3,keywords:[],rarity:"C",text:""},
{id:"dragon_whelp",     name:"Dragon Whelp",             type:"Creature",subtype:"Dragon",    color:"R",cmc:4,cost:"2RR", power:2,toughness:3,keywords:["FLYING"],rarity:"U",text:"Flying\n{R}: This creature gets +1/+0 until end of turn. If this ability has been activated four or more times this turn, sacrifice this creature at the beginning of the next end step.",activated:{cost:"R",effect:"pumpPower"}},
{id:"fire_elemental",   name:"Fire Elemental",           type:"Creature",subtype:"Elemental", color:"R",cmc:5,cost:"3RR", power:5,toughness:4,keywords:[],rarity:"U",text:""},
{id:"goblin_hero",      name:"Goblin Hero",              type:"Creature",subtype:"Goblin Warrior",color:"R",cmc:2,cost:"1R",power:2,toughness:1,keywords:[],rarity:"C",text:""},
{id:"sedge_troll",      name:"Sedge Troll",              type:"Creature",subtype:"Troll",     color:"R",cmc:3,cost:"2R",  power:2,toughness:2,keywords:["TRAMPLE"],rarity:"R",text:"This creature gets +1/+1 as long as you control a Swamp.\n{B}: Regenerate this creature."},
{id:"roc_of_kher_ridges",      name:"Roc of Kher Ridges",       type:"Creature",subtype:"Bird",      color:"R",cmc:4,cost:"3R",  power:3,toughness:3,keywords:["FLYING"],rarity:"R",text:"Flying"},
{id:"granite_gargoyle", name:"Granite Gargoyle",         type:"Creature",subtype:"Gargoyle",  color:"R",cmc:2,cost:"1R",  power:2,toughness:2,keywords:["FLYING"],rarity:"R",text:"Flying\n{R}: This creature gets +0/+1 until end of turn.",activated:{cost:"R",effect:"pumpToughness"}},
{id:"two_headed_giant_of_foriys", name:"Two-Headed Giant of Foriys",type:"Creature",subtype:"Giant",    color:"R",cmc:6,cost:"4RR", power:4,toughness:4,keywords:[],rarity:"R",text:"Trample\nThis creature can block an additional creature each combat."},
{id:"fire_sprites",     name:"Fire Sprites",             type:"Creature",subtype:"Faerie",    color:"R",cmc:2,cost:"1R",  power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying\n{G}, {T}: Add {R}.",activated:{cost:"T",effect:"addMana",mana:"R"}},
{id:"stone_giant",      name:"Stone Giant",              type:"Creature",subtype:"Giant",     color:"R",cmc:4,cost:"2RR", power:3,toughness:4,keywords:[],rarity:"U",text:"{T}: Target creature you control with toughness less than this creature's power gains flying until end of turn. Destroy that creature at the beginning of the next end step.",activated:{cost:"T",effect:"grantFlying"}},
{id:"gray_ogre",        name:"Gray Ogre",                type:"Creature",subtype:"Ogre",      color:"R",cmc:3,cost:"2R",  power:2,toughness:2,keywords:[],rarity:"C",text:""},
{id:"rock_hydra",       name:"Rock Hydra",               type:"Creature",subtype:"Hydra",     color:"R",cmc:2,cost:"XRR", power:0,toughness:0,keywords:[],rarity:"R",text:"This creature enters with X +1/+1 counters on it.\nFor each 1 damage that would be dealt to this creature, if it has a +1/+1 counter on it, remove a +1/+1 counter from it and prevent that 1 damage.\n{R}: Prevent the next 1 damage that would be dealt to this creature this turn.\n{R}{R}{R}: Put a +1/+1 counter on this creature. Activate only during your upkeep.",effect:"stub" /* STUB: enter with X counters; RRR adds counter; combat damage removes counters */},
{id:"uthden_troll",     name:"Uthden Troll",             type:"Creature",subtype:"Troll",     color:"R",cmc:3,cost:"2R",  power:2,toughness:2,keywords:[],rarity:"U",text:"{R}: Regenerate this creature.",activated:{cost:"R",effect:"regenerate"}},

// -- GREEN CREATURES -----------------------------------------
{id:"llanowar_elves",    name:"Llanowar Elves",   type:"Creature",subtype:"Elf Druid",  color:"G",cmc:1,cost:"G",    power:1,toughness:1,keywords:[],rarity:"C",text:"{T}: Add {G}.",activated:{cost:"T",effect:"addMana",mana:"G"}},
{id:"fyndhorn_elves",    name:"Fyndhorn Elves",   type:"Creature",subtype:"Elf Druid",  color:"G",cmc:1,cost:"G",    power:1,toughness:1,keywords:[],rarity:"C",text:"T: Add G.",activated:{cost:"T",effect:"addMana",mana:"G"}},
{id:"birds_of_paradise", name:"Birds of Paradise",type:"Creature",subtype:"Bird",       color:"G",cmc:1,cost:"G",    power:0,toughness:1,keywords:["FLYING"],rarity:"R",text:"Flying\n{T}: Add one mana of any color.",activated:{cost:"T",effect:"addManaAny"}},
{id:"grizzly_bears",     name:"Grizzly Bears",    type:"Creature",subtype:"Bear",       color:"G",cmc:2,cost:"1G",   power:2,toughness:2,keywords:[],rarity:"C",text:""},
{id:"giant_spider",      name:"Giant Spider",     type:"Creature",subtype:"Spider",     color:"G",cmc:4,cost:"3G",   power:2,toughness:4,keywords:["REACH"],rarity:"C",text:"Reach (This creature can block creatures with flying.)"},
{id:"craw_wurm",         name:"Craw Wurm",        type:"Creature",subtype:"Wurm",       color:"G",cmc:6,cost:"4GG",  power:6,toughness:4,keywords:[],rarity:"C",text:""},
{id:"force_of_nature",   name:"Force of Nature",  type:"Creature",subtype:"Elemental",  color:"G",cmc:8,cost:"2GGGG",power:8,toughness:8,keywords:["TRAMPLE"],rarity:"R",text:"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nAt the beginning of your upkeep, this creature deals 8 damage to you unless you pay {G}{G}{G}{G}.",upkeep:"forceOfNatureUpkeep"},
{id:"erhnam_djinn",      name:"Erhnam Djinn",     type:"Creature",subtype:"Djinn",      color:"G",cmc:4,cost:"3G",   power:4,toughness:5,keywords:[],rarity:"U",text:"At the beginning of your upkeep, target non-Wall creature an opponent controls gains forestwalk until your next upkeep. (It can't be blocked as long as defending player controls a Forest.)",upkeep:"erhnamsUpkeep"},
{id:"war_mammoth",       name:"War Mammoth",      type:"Creature",subtype:"Elephant",   color:"G",cmc:3,cost:"2G",   power:3,toughness:3,keywords:["TRAMPLE"],rarity:"C",text:"Trample"},
{id:"whirling_dervish",  name:"Whirling Dervish", type:"Creature",subtype:"Human Monk", color:"G",cmc:2,cost:"GG",   power:1,toughness:1,keywords:[],rarity:"U",text:"Protection from black\nAt the beginning of each end step, if this creature dealt damage to an opponent this turn, put a +1/+1 counter on it."},
{id:"thicket_basilisk",  name:"Thicket Basilisk", type:"Creature",subtype:"Basilisk",   color:"G",cmc:5,cost:"3GG",  power:2,toughness:4,keywords:[],rarity:"U",text:"Whenever this creature blocks or becomes blocked by a non-Wall creature, destroy that creature at end of combat."},
{id:"scryb_sprites",     name:"Scryb Sprites",    type:"Creature",subtype:"Faerie",     color:"G",cmc:1,cost:"G",    power:1,toughness:1,keywords:["FLYING"],rarity:"C",text:"Flying"},
{id:"ley_druid",         name:"Ley Druid",        type:"Creature",subtype:"Human Druid",color:"G",cmc:3,cost:"2G",   power:1,toughness:1,keywords:[],rarity:"U",text:"{T}: Untap target land.",activated:{cost:"T",effect:"untapLand"}},
{id:"verduran_enchantress",name:"Verduran Enchantress",type:"Creature",subtype:"Human Druid",color:"G",cmc:3,cost:"1GG",power:0,toughness:2,keywords:[],rarity:"R",text:"Whenever you cast an enchantment spell, you may draw a card."},
{id:"timber_wolves",     name:"Timber Wolves",    type:"Creature",subtype:"Wolf",       color:"G",cmc:1,cost:"G",    power:1,toughness:1,keywords:["BANDING"],rarity:"R",text:"Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)"},
{id:"gaea_liege",        name:"Gaea's Liege",     type:"Creature",subtype:"Avatar",     color:"G",cmc:6,cost:"3GGG", power:0,toughness:0,keywords:[],rarity:"R",text:"P/T = number of forests you control.",dynamic:true,dynamicType:"forestCount"},
{id:"keldon_warlord",    name:"Keldon Warlord",   type:"Creature",subtype:"Human Barbarian",color:"R",cmc:4,cost:"2RR",power:0,toughness:0,keywords:[],rarity:"U",text:"Keldon Warlord's power and toughness are each equal to the number of non-Wall creatures you control.",dynamic:true,dynamicType:"creatureCount"},
{id:"carnivorous_plant",  name:"Carnivorous Plant",type:"Creature",subtype:"Plant",     color:"G",cmc:4,cost:"3G",   power:4,toughness:5,keywords:["DEFENDER"],rarity:"C",text:"Defender"},
{id:"argothian_treefolk", name:"Argothian Treefolk",type:"Creature",subtype:"Treefolk", color:"G",cmc:5,cost:"3GG",  power:3,toughness:5,keywords:[],rarity:"C",text:"Prevent all damage that would be dealt to this creature by artifact sources."},
{id:"elven_riders",      name:"Elven Riders",     type:"Creature",subtype:"Elf",        color:"G",cmc:5,cost:"3GG",  power:3,toughness:3,keywords:[],rarity:"U",text:"This creature can't be blocked except by Walls and/or creatures with flying."},
{id:"elvish_archers",    name:"Elvish Archers",   type:"Creature",subtype:"Elf Archer", color:"G",cmc:2,cost:"1G",   power:2,toughness:1,keywords:["FIRST_STRIKE","REACH"],rarity:"R",text:"First strike"},
{id:"fungusaur",         name:"Fungusaur",         type:"Creature",subtype:"Lizard",     color:"G",cmc:4,cost:"3G",   power:2,toughness:2,keywords:[],rarity:"R",text:"Whenever this creature is dealt damage, put a +1/+1 counter on it."},

// -- ARTIFACT CREATURES --------------------------------------
{id:"ornithopter",       name:"Ornithopter",       type:"Artifact Creature",subtype:"Thopter",    color:"",cmc:0,cost:"0",power:0,toughness:2,keywords:["FLYING"],rarity:"U",text:"Flying"},
{id:"juggernaut",        name:"Juggernaut",        type:"Artifact Creature",subtype:"Juggernaut", color:"",cmc:4,cost:"4",power:5,toughness:3,keywords:[],rarity:"U",text:"This creature attacks each combat if able.\nThis creature can't be blocked by Walls."},
{id:"triskelion",        name:"Triskelion",        type:"Artifact Creature",subtype:"Construct",  color:"",cmc:6,cost:"6",power:1,toughness:1,keywords:[],rarity:"R",text:"This creature enters with three +1/+1 counters on it.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.",etbCounters:{P1P1:3},activated:{cost:"counter",effect:"triskelionPing"}},
{id:"su_chi",            name:"Su-Chi",            type:"Artifact Creature",subtype:"Construct",  color:"",cmc:4,cost:"4",power:4,toughness:4,keywords:[],rarity:"U",text:"When this creature dies, add {C}{C}{C}{C}."},
{id:"colossus_of_sardia",name:"Colossus of Sardia",type:"Artifact Creature",subtype:"Golem",     color:"",cmc:9,cost:"9",power:9,toughness:9,keywords:["TRAMPLE"],rarity:"R",text:"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nThis creature doesn't untap during your untap step.\n{9}: Untap this creature. Activate only during your upkeep.",activated:{cost:"9",effect:"untapSelf"}},
{id:"clay_statue",       name:"Clay Statue",       type:"Artifact Creature",subtype:"Golem",     color:"",cmc:4,cost:"4",power:3,toughness:1,keywords:[],rarity:"C",text:"{2}: Regenerate this creature.",activated:{cost:"2",effect:"regenerate"}},
{id:"brass_man",         name:"Brass Man",         type:"Artifact Creature",subtype:"Construct",  color:"",cmc:1,cost:"1",power:1,toughness:3,keywords:[],rarity:"U",text:"This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {1}. If you do, untap this creature.",activated:{cost:"1",effect:"untapSelf"}},
{id:"dragon_engine",     name:"Dragon Engine",     type:"Artifact Creature",subtype:"Construct",  color:"",cmc:3,cost:"3",power:1,toughness:3,keywords:[],rarity:"U",text:"{2}: This creature gets +1/+0 until end of turn.",activated:{cost:"2",effect:"pumpPower"}},
{id:"clockwork_beast",   name:"Clockwork Beast",   type:"Artifact Creature",subtype:"Beast",     color:"",cmc:6,cost:"6",power:7,toughness:4,keywords:[],rarity:"R",text:"This creature enters with seven +1/+0 counters on it.\nAt end of combat, if this creature attacked or blocked this combat, remove a +1/+0 counter from it.\n{X}, {T}: Put up to X +1/+0 counters on this creature. This ability can't cause the total number of +1/+0 counters on this creature to be greater than seven. Activate only during your upkeep."},

// -- WALLS --------------------------------------------------
{id:"wall_of_ice",      name:"Wall of Ice",      type:"Creature",subtype:"Wall",color:"U",cmc:3,cost:"1UU",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)"},
{id:"wall_of_stone",    name:"Wall of Stone",    type:"Creature",subtype:"Wall",color:"R",cmc:3,cost:"1RR",power:0,toughness:8,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)"},
{id:"wall_of_fire",     name:"Wall of Fire",     type:"Creature",subtype:"Wall",color:"R",cmc:3,cost:"1RR",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)\n{R}: This creature gets +1/+0 until end of turn.",activated:{cost:"R",effect:"pumpPower"}},
{id:"wall_of_brambles", name:"Wall of Brambles", type:"Creature",subtype:"Wall",color:"G",cmc:3,cost:"2G", power:2,toughness:3,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)\n{G}: Regenerate this creature.",activated:{cost:"G",effect:"regenerate"}},
{id:"wall_of_bone",     name:"Wall of Bone",     type:"Creature",subtype:"Wall",color:"B",cmc:2,cost:"1B", power:1,toughness:3,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)\n{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)",activated:{cost:"B",effect:"regenerate"}},
{id:"living_wall",      name:"Living Wall",      type:"Artifact Creature",subtype:"Wall",color:"",cmc:3,cost:"3",power:0,toughness:5,keywords:["DEFENDER"],rarity:"U",text:"Defender (This creature can't attack.)\n{1}: Regenerate this creature.",activated:{cost:"1",effect:"regenerate"}},

// -- WHITE SPELLS --------------------------------------------
{id:"swords_to_plowshares",         name:"Swords to Plowshares",type:"Instant", color:"W",cmc:1,cost:"W",   text:"Exile target creature. Its controller gains life equal to its power.",effect:"exileCreature",rarity:"U"},
{id:"wrath_of_god",            name:"Wrath of God",         type:"Sorcery", color:"W",cmc:4,cost:"2WW", text:"Destroy all creatures. They can't be regenerated.",effect:"wrathAll",rarity:"R"},
{id:"disenchant",     name:"Disenchant",           type:"Instant", color:"W",cmc:2,cost:"1W",  text:"Destroy target artifact or enchantment.",effect:"destroyArtOrEnch",rarity:"C"},
{id:"armageddon",     name:"Armageddon",           type:"Sorcery", color:"W",cmc:4,cost:"3W",  text:"Destroy all lands.",effect:"destroyAllLands",rarity:"R"},
{id:"healing_salve",  name:"Healing Salve",        type:"Instant", color:"W",cmc:1,cost:"W",   text:"Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.",effect:"gainLife3",rarity:"C"},
{id:"holy_armor",     name:"Holy Armor",           type:"Enchantment",subtype:"Aura",color:"W",cmc:2,cost:"1W",text:"Enchant creature\nEnchanted creature gets +0/+2.\n{W}: Enchanted creature gets +0/+1 until end of turn.",effect:"enchantCreature",mod:{toughness:2},rarity:"C"},
{id:"balance",        name:"Balance",              type:"Sorcery", color:"W",cmc:2,cost:"1W",  text:"Each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and sacrifice creatures the same way.",effect:"balance",rarity:"R"},
{id:"holy_day",       name:"Holy Day",             type:"Instant", color:"W",cmc:1,cost:"W",   text:"Prevent all combat damage that would be dealt this turn.",effect:"fog",rarity:"C"},
{id:"resurrection",   name:"Resurrection",         type:"Sorcery", color:"W",cmc:4,cost:"3W",  text:"Return target creature card from your graveyard to the battlefield.",effect:"reanimateOwn",rarity:"U"},
{id:"holy_strength",  name:"Holy Strength",        type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchant creature\nEnchanted creature gets +1/+2.",effect:"enchantCreature",mod:{power:1,toughness:2},rarity:"C"},
{id:"crusade",        name:"Crusade",              type:"Enchantment",color:"W",cmc:2,cost:"WW",text:"White creatures get +1/+1.",effect:"globalPump",targets:"white",mod:{power:1,toughness:1},rarity:"R"},
{id:"lance",          name:"Lance",                type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",text:"Enchant creature\nEnchanted creature has first strike.",effect:"enchantCreature",mod:{keywords:["FIRST_STRIKE"]},rarity:"U"},
{id:"death_ward",     name:"Death Ward",           type:"Instant", color:"W",cmc:1,cost:"W",   text:"Regenerate target creature.",effect:"regenerateTarget",rarity:"C"},
{id:"consecrate_land",       name:"Consecrate Land",       type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",   text:"Enchant land\nEnchanted land has indestructible and can't be enchanted by other Auras.",effect:"stub" /* STUB: make enchanted land indestructible and untargetable */,rarity:"R"},
{id:"conversion",            name:"Conversion",            type:"Enchantment",color:"W",cmc:4,cost:"2WW", text:"At the beginning of your upkeep, sacrifice this enchantment unless you pay {W}{W}.\nAll Mountains are Plains.",effect:"stub" /* STUB: convert all Mountains to Plains globally */,rarity:"U"},
{id:"divine_transformation", name:"Divine Transformation", type:"Enchantment",subtype:"Aura",color:"W",cmc:3,cost:"2W",  text:"Enchant creature\nEnchanted creature gets +3/+3.",effect:"stub" /* STUB: set enchanted creature base P/T to 5/5 */,rarity:"U"},
{id:"karma",                 name:"Karma",                 type:"Enchantment",color:"W",cmc:4,cost:"2WW", text:"At the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of Swamps they control.",upkeep:"karmaUpkeep",rarity:"U"},
{id:"righteousness",         name:"Righteousness",         type:"Instant", color:"W",cmc:1,cost:"W",   text:"Target blocking creature gets +7/+7 until end of turn.",effect:"pumpCreature",mod:{power:7,toughness:7},rarity:"R"},
{id:"reverse_damage",        name:"Reverse Damage",        type:"Instant", color:"W",cmc:3,cost:"1WW", text:"The next time a source of your choice would deal damage to you this turn, prevent that damage. You gain life equal to the damage prevented this way.",effect:"stub" /* STUB: prevent all damage from chosen source; gain that much life */,rarity:"R"},
{id:"spirit_link",           name:"Spirit Link",           type:"Enchantment",subtype:"Aura",color:"W",cmc:1,cost:"W",   text:"Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nWhenever enchanted creature deals damage, you gain that much life.",effect:"enchantCreature",mod:{keywords:["LIFELINK"]},rarity:"U"},

// -- BLUE SPELLS ---------------------------------------------
{id:"counterspell",       name:"Counterspell",    type:"Instant", color:"U",cmc:2,cost:"UU",  text:"Counter target spell.",effect:"counter",rarity:"U"},
{id:"ancestral_recall",          name:"Ancestral Recall",type:"Instant", color:"U",cmc:1,cost:"U",   text:"Target player draws three cards.",effect:"draw3",rarity:"R"},
{id:"time_walk",          name:"Time Walk",       type:"Sorcery", color:"U",cmc:2,cost:"1U",  text:"Take an extra turn after this one.",effect:"extraTurn",rarity:"R"},
{id:"braingeyser",        name:"Braingeyser",     type:"Sorcery", color:"U",cmc:3,cost:"XUU", text:"Target player draws X cards.",effect:"drawX",rarity:"R"},
{id:"unsummon",           name:"Unsummon",        type:"Instant", color:"U",cmc:1,cost:"U",   text:"Return target creature to its owner's hand.",effect:"bounce",rarity:"C"},
{id:"psionic_blast",      name:"Psionic Blast",   type:"Instant", color:"U",cmc:3,cost:"2U",  text:"Psionic Blast deals 4 damage to any target and 2 damage to you.",effect:"psionicBlast",rarity:"U"},
{id:"power_sink",         name:"Power Sink",      type:"Instant", color:"U",cmc:2,cost:"XU",  text:"Counter target spell unless its controller pays {X}. If that player doesn't, they tap all lands with mana abilities they control and lose all unspent mana.",effect:"powerSink",rarity:"C"},
{id:"boomerang",          name:"Boomerang",       type:"Instant", color:"U",cmc:2,cost:"UU",  text:"Return target permanent to its owner's hand.",effect:"bounce",rarity:"C"},
{id:"control_magic",      name:"Control Magic",   type:"Enchantment",subtype:"Aura",color:"U",cmc:4,cost:"2UU",text:"Enchant creature\nYou control enchanted creature.",effect:"controlCreature",rarity:"U"},
{id:"timetwister",        name:"Timetwister",     type:"Sorcery", color:"U",cmc:3,cost:"2U",  text:"Each player shuffles their hand and graveyard into their library, then draws seven cards. (Then put Timetwister into its owner's graveyard.)",effect:"timetwister",rarity:"R"},
{id:"mana_short",         name:"Mana Short",      type:"Instant", color:"U",cmc:3,cost:"2U",  text:"Tap all lands target player controls and that player loses all unspent mana.",effect:"manaShort",rarity:"R"},
{id:"remove_soul",        name:"Remove Soul",     type:"Instant", color:"U",cmc:2,cost:"1U",  text:"Counter target creature spell.",effect:"counterCreature",rarity:"C"},
{id:"force_spike",        name:"Force Spike",     type:"Instant", color:"U",cmc:1,cost:"U",   text:"Counter target spell unless its controller pays {1}.",effect:"counter",rarity:"C"},
{id:"blue_elemental_blast",name:"Blue Elemental Blast",type:"Instant",color:"U",cmc:1,cost:"U",text:"Choose one —\n• Counter target red spell.\n• Destroy target red permanent.",effect:"destroyRedOrCounter",rarity:"C"},
{id:"drain_power",        name:"Drain Power",     type:"Instant", color:"U",cmc:2,cost:"UU",  text:"Target player activates a mana ability of each land they control. Then that player loses all unspent mana and you add the mana lost this way.",effect:"drainPower",rarity:"R"},
{id:"jump",               name:"Jump",            type:"Instant", color:"U",cmc:1,cost:"U",   text:"Target creature gains flying until end of turn.",effect:"grantFlying",rarity:"C"},
{id:"animate_artifact",  name:"Animate Artifact",  type:"Enchantment",subtype:"Aura",color:"U",cmc:4,cost:"3U",  text:"Enchant artifact\nAs long as enchanted artifact isn't a creature, it's an artifact creature with power and toughness each equal to its mana value.",effect:"stub" /* STUB: animate artifact as creature with P/T equal to its CMC */,rarity:"U"},
{id:"copy_artifact",     name:"Copy Artifact",     type:"Enchantment",color:"U",cmc:2,cost:"1U",  text:"You may have this enchantment enter as a copy of any artifact on the battlefield, except it's an enchantment in addition to its other types.",effect:"stub" /* STUB: copy target artifact as enchantment in addition to its types */,rarity:"R"},
{id:"flight",            name:"Flight",            type:"Enchantment",subtype:"Aura",color:"U",cmc:1,cost:"U",   text:"Enchant creature\nEnchanted creature has flying.",effect:"enchantCreature",mod:{keywords:["FLYING"]},rarity:"C"},
{id:"hurkyls_recall",    name:"Hurkyl's Recall",   type:"Instant", color:"U",cmc:2,cost:"1U",  text:"Return all artifacts target player owns to their hand.",effect:"returnArtifacts",rarity:"R"},
{id:"lifetap",           name:"Lifetap",           type:"Enchantment",color:"U",cmc:3,cost:"2U",  text:"Whenever a Forest an opponent controls becomes tapped, you gain 1 life.",effect:"stub" /* STUB: draw a card when any Forest is tapped for mana */,rarity:"U"},
{id:"sleight_of_mind",   name:"Sleight of Mind",   type:"Instant", color:"U",cmc:1,cost:"U",   text:"Change the text of target spell or permanent by replacing all instances of one color word with another. (For example, you may change \"target black spell\" to \"target blue spell.\" This effect lasts indefinitely.)",effect:"stub" /* STUB: change a color word in target instant or sorcery */,rarity:"R"},
{id:"spell_blast",       name:"Spell Blast",       type:"Instant", color:"U",cmc:1,cost:"XU",  text:"Counter target spell with mana value X. (For example, if that spell's mana cost is {3}{U}{U}, X is 5.)",effect:"counter",rarity:"C"},
{id:"stasis",            name:"Stasis",            type:"Enchantment",color:"U",cmc:2,cost:"1U",  text:"Players skip their untap steps.\nAt the beginning of your upkeep, sacrifice this enchantment unless you pay {U}.",effect:"stub" /* STUB: all players skip untap; sacrifice unless paying U each upkeep */,rarity:"R"},
{id:"steal_artifact",    name:"Steal Artifact",    type:"Enchantment",subtype:"Aura",color:"U",cmc:4,cost:"3U",  text:"Enchant artifact\nYou control enchanted artifact.",effect:"controlCreature",rarity:"U"},
{id:"twiddle",           name:"Twiddle",           type:"Instant", color:"U",cmc:1,cost:"U",   text:"You may tap or untap target artifact, creature, or land.",effect:"tapTarget",rarity:"C"},

// -- BLACK SPELLS --------------------------------------------
{id:"dark_ritual",    name:"Dark Ritual",   type:"Instant", color:"B",cmc:1,cost:"B",   text:"Add {B}{B}{B}.",effect:"addMana",mana:["B","B","B"],rarity:"C"},
{id:"terror",         name:"Terror",        type:"Instant", color:"B",cmc:2,cost:"1B",  text:"Destroy target nonartifact, nonblack creature. It can't be regenerated.",effect:"destroy",restriction:"nonArtifactNonBlack",rarity:"C"},
{id:"demonic_tutor",  name:"Demonic Tutor", type:"Sorcery", color:"B",cmc:2,cost:"1B",  text:"Search your library for a card, put that card into your hand, then shuffle.",effect:"tutor",rarity:"U"},
{id:"mind_twist",     name:"Mind Twist",    type:"Sorcery", color:"B",cmc:2,cost:"XB",  text:"Target player discards X cards at random.",effect:"discardX",rarity:"R"},
{id:"animate_dead",   name:"Animate Dead",  type:"Enchantment",subtype:"Aura",color:"B",cmc:2,cost:"1B",text:"Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0.",effect:"reanimate",rarity:"U"},
{id:"dark_banishing", name:"Dark Banishing",type:"Instant", color:"B",cmc:3,cost:"2B",  text:"Destroy target non-black creature.",effect:"destroy",restriction:"nonBlack",rarity:"C"},
{id:"drain_life",     name:"Drain Life",    type:"Sorcery", color:"B",cmc:2,cost:"X1B", text:"Spend only black mana on X.\nDrain Life deals X damage to any target. You gain life equal to the damage dealt, but not more life than the player's life total before the damage was dealt, the planeswalker's loyalty before the damage was dealt, or the creature's toughness.",effect:"drainLife",rarity:"C"},
{id:"disintegrate",   name:"Disintegrate",  type:"Sorcery", color:"R",cmc:1,cost:"XR",  text:"Disintegrate deals X damage to any target. If it's a creature, it can't be regenerated this turn, and if it would die this turn, exile it instead.",effect:"damageX",rarity:"C"},
{id:"sinkhole",       name:"Sinkhole",      type:"Sorcery", color:"B",cmc:2,cost:"BB",  text:"Destroy target land.",effect:"destroyTargetLand",rarity:"C"},
{id:"bad_moon",       name:"Bad Moon",      type:"Enchantment",color:"B",cmc:2,cost:"1B",text:"Black creatures get +1/+1.",effect:"globalPump",targets:"black",mod:{power:1,toughness:1},rarity:"R"},
{id:"unholy_strength",name:"Unholy Strength",type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchant creature\nEnchanted creature gets +2/+1.",effect:"enchantCreature",mod:{power:2,toughness:1},rarity:"C"},
{id:"weakness",       name:"Weakness",      type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchant creature\nEnchanted creature gets -2/-1.",effect:"enchantCreature",mod:{power:-2,toughness:-1},rarity:"C"},
{id:"paralyze",       name:"Paralyze",      type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {4}. If the player does, untap the creature.",effect:"paralyze",rarity:"C"},
{id:"pestilence",     name:"Pestilence",    type:"Enchantment",color:"B",cmc:4,cost:"2BB",text:"At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.\n{B}: This enchantment deals 1 damage to each creature and each player.",activated:{cost:"B",effect:"pestilence"},rarity:"C"},
{id:"raise_dead",     name:"Raise Dead",    type:"Sorcery", color:"B",cmc:1,cost:"B",   text:"Return target creature card from your graveyard to your hand.",effect:"regrowthCreature",rarity:"C"},
{id:"consume_spirit",  name:"Consume Spirit",  type:"Sorcery", color:"B",cmc:1,cost:"X1B", text:"Spend only black mana on X. Consume Spirit deals X damage to target creature; you gain X life.",effect:"drainLife",rarity:"U"},
{id:"deathgrip",       name:"Deathgrip",       type:"Enchantment",color:"B",cmc:2,cost:"BB",  text:"{B}{B}: Counter target green spell.",activated:{cost:"BB",effect:"counterGreen"},rarity:"U"},
{id:"fear",            name:"Fear",            type:"Enchantment",subtype:"Aura",color:"B",cmc:2,cost:"1B",  text:"Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nEnchanted creature has fear. (It can't be blocked except by artifact creatures and/or black creatures.)",effect:"enchantCreature",mod:{keywords:["FEAR"]},rarity:"C"},
{id:"gloom",           name:"Gloom",           type:"Enchantment",color:"B",cmc:3,cost:"2B",  text:"White spells cost {3} more to cast.\nActivated abilities of white enchantments cost {3} more to activate.",effect:"stub" /* STUB: white spells and abilities cost 3 more to cast or activate */,rarity:"U"},
{id:"howl_from_beyond",name:"Howl from Beyond",type:"Instant", color:"B",cmc:1,cost:"XB",  text:"Target creature gets +X/+0 until end of turn.",effect:"pumpX",rarity:"C"},

// -- RED SPELLS ----------------------------------------------
{id:"lightning_bolt",  name:"Lightning Bolt",  type:"Instant", color:"R",cmc:1,cost:"R",   text:"Lightning Bolt deals 3 damage to any target.",effect:"damage3",rarity:"C"},
{id:"fireball",        name:"Fireball",        type:"Sorcery", color:"R",cmc:2,cost:"XR",  text:"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.",effect:"damageX",rarity:"C"},
{id:"chain_lightning", name:"Chain Lightning", type:"Sorcery", color:"R",cmc:1,cost:"R",   text:"Chain Lightning deals 3 damage to any target. Then that player or that permanent's controller may pay {R}{R}. If the player does, they may copy this spell and may choose a new target for that copy.",effect:"damage3",rarity:"C"},
{id:"wheel_of_fortune",name:"Wheel of Fortune",type:"Sorcery", color:"R",cmc:3,cost:"2R",  text:"Each player discards their hand, then draws seven cards.",effect:"wheelOfFortune",rarity:"R"},
{id:"shatter",         name:"Shatter",         type:"Instant", color:"R",cmc:2,cost:"1R",  text:"Destroy target artifact.",effect:"destroyArtifact",rarity:"C"},
{id:"lava_axe",        name:"Lava Axe",        type:"Sorcery", color:"R",cmc:5,cost:"4R",  text:"Lava Axe deals 5 damage to target player.",effect:"damage5",rarity:"C"},
{id:"stone_rain",      name:"Stone Rain",      type:"Sorcery", color:"R",cmc:3,cost:"2R",  text:"Destroy target land.",effect:"destroyTargetLand",rarity:"C"},
{id:"earthquake",      name:"Earthquake",      type:"Sorcery", color:"R",cmc:1,cost:"XR",  text:"Earthquake deals X damage to each creature without flying and each player.",effect:"earthquake",rarity:"R"},
{id:"berserk",         name:"Berserk",         type:"Instant", color:"G",cmc:1,cost:"G",   text:"Cast this spell only before the combat damage step.\nTarget creature gains trample and gets +X/+0 until end of turn, where X is its power. At the beginning of the next end step, destroy that creature if it attacked this turn.",effect:"berserk",rarity:"R",castRestriction:"beforeCombatDamage"},
{id:"fork",            name:"Fork",            type:"Instant", color:"R",cmc:2,cost:"RR",  text:"Copy target instant or sorcery spell, except that the copy is red. You may choose new targets for the copy.",effect:"forkSpell",rarity:"R"},
{id:"pyrotechnics",    name:"Pyrotechnics",    type:"Sorcery", color:"R",cmc:5,cost:"4R",  text:"Pyrotechnics deals 4 damage divided as you choose among any number of targets.",effect:"damageX",rarity:"C"},
{id:"red_elemental_blast",name:"Red Elemental Blast",type:"Instant",color:"R",cmc:1,cost:"R",text:"Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent.",effect:"destroyBlueOrCounter",rarity:"C"},
{id:"flashfires",      name:"Flashfires",      type:"Sorcery", color:"R",cmc:4,cost:"3R",  text:"Destroy all Plains.",effect:"destroyPlains",rarity:"U"},
{id:"fissure",         name:"Fissure",         type:"Instant", color:"R",cmc:5,cost:"4R",  text:"Destroy target creature or land. It can't be regenerated.",effect:"destroy",rarity:"U"},
{id:"manabarbs",       name:"Manabarbs",       type:"Enchantment",color:"R",cmc:4,cost:"3R",  text:"Whenever a player taps a land for mana, this enchantment deals 1 damage to that player.",rarity:"R"},
{id:"mana_flare",      name:"Mana Flare",      type:"Enchantment",color:"R",cmc:3,cost:"2R",  text:"Whenever a player taps a land for mana, that player adds one mana of any type that land produced.",rarity:"R"},
{id:"power_surge",     name:"Power Surge",     type:"Enchantment",color:"R",cmc:2,cost:"1R",  text:"At the beginning of each player's upkeep, this enchantment deals X damage to that player, where X is the number of untapped lands they controlled at the beginning of this turn.",upkeep:"powerSurgeUpkeep",rarity:"R"},
{id:"smoke",           name:"Smoke",           type:"Enchantment",color:"R",cmc:2,cost:"1R",  text:"Players can't untap more than one creature during their untap steps.",rarity:"R"},

// -- GREEN SPELLS --------------------------------------------
{id:"giant_growth",   name:"Giant Growth",   type:"Instant", color:"G",cmc:1,cost:"G",   text:"Target creature gets +3/+3 until end of turn.",effect:"pumpCreature",mod:{power:3,toughness:3},rarity:"C"},
{id:"stream_of_life", name:"Stream of Life", type:"Sorcery", color:"G",cmc:2,cost:"XG",  text:"Target player gains X life.",effect:"gainLifeX",rarity:"C"},
{id:"regrowth",       name:"Regrowth",       type:"Sorcery", color:"G",cmc:2,cost:"1G",  text:"Return target card from your graveyard to your hand.",effect:"regrowth",rarity:"U"},
{id:"hurricane",      name:"Hurricane",      type:"Sorcery", color:"G",cmc:2,cost:"XG",  text:"Hurricane deals X damage to each creature with flying and each player.",effect:"hurricane",rarity:"U"},
{id:"tranquility",    name:"Tranquility",    type:"Sorcery", color:"G",cmc:3,cost:"2G",  text:"Destroy all enchantments.",effect:"destroyAllEnchantments",rarity:"C"},
{id:"fog",            name:"Fog",            type:"Instant", color:"G",cmc:1,cost:"G",   text:"Prevent all combat damage that would be dealt this turn.",effect:"fog",rarity:"C"},
{id:"wild_growth",    name:"Wild Growth",    type:"Enchantment",subtype:"Aura",color:"G",cmc:1,cost:"G",text:"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.",effect:"enchantLand",mod:{bonus:"G"},rarity:"C"},
{id:"lure",           name:"Lure",           type:"Enchantment",subtype:"Aura",color:"G",cmc:3,cost:"1GG",text:"Enchant creature\nAll creatures able to block enchanted creature do so.",effect:"enchantCreature",mod:{keywords:["LURE"]},rarity:"U"},
{id:"instill_energy", name:"Instill Energy", type:"Enchantment",subtype:"Aura",color:"G",cmc:1,cost:"G",text:"Enchant creature\nEnchanted creature can attack as though it had haste.\n{0}: Untap enchanted creature. Activate only during your turn and only once each turn.",effect:"enchantCreature",mod:{keywords:["HASTE"]},rarity:"U"},
{id:"sylvan_library", name:"Sylvan Library", type:"Enchantment",color:"G",cmc:2,cost:"1G",text:"At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library.",upkeep:"sylvanLibrary",rarity:"R"},
{id:"land_tax",       name:"Land Tax",       type:"Enchantment",color:"W",cmc:1,cost:"W",text:"At the beginning of your upkeep, if an opponent controls more lands than you, you may search your library for up to three basic land cards, reveal them, put them into your hand, then shuffle.",upkeep:"landTax",rarity:"R"},
{id:"tsunami",        name:"Tsunami",        type:"Sorcery", color:"G",cmc:4,cost:"3G",  text:"Destroy all Islands.",effect:"destroyIslands",rarity:"U"},
{id:"ice_storm",      name:"Ice Storm",      type:"Sorcery", color:"G",cmc:3,cost:"2G",  text:"Destroy target land.",effect:"destroyTargetLand",rarity:"U"},
{id:"channel",         name:"Channel",         type:"Sorcery",    color:"G",cmc:2,cost:"GG",  text:"Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.",effect:"stub" /* STUB: pay life equal to desired colorless mana until EOT */,rarity:"R"},
{id:"crumble",         name:"Crumble",         type:"Instant",    color:"G",cmc:1,cost:"G",   text:"Destroy target artifact. It can't be regenerated. That artifact's controller gains life equal to its mana value.",effect:"destroyArtifact",rarity:"C"},
{id:"fastbond",        name:"Fastbond",        type:"Enchantment",color:"G",cmc:1,cost:"G",   text:"You may play any number of lands on each of your turns.\nWhenever you play a land, if it wasn't the first land you played this turn, this enchantment deals 1 damage to you.",effect:"stub" /* STUB: allow unlimited land drops; lose 1 life per extra land played */,rarity:"R"},
{id:"giant_strength",  name:"Giant Strength",  type:"Enchantment",subtype:"Aura",color:"G",cmc:2,cost:"1G",  text:"Enchant creature\nEnchanted creature gets +2/+2.",effect:"enchantCreature",mod:{power:2,toughness:2},rarity:"C"},
{id:"kudzu",           name:"Kudzu",           type:"Enchantment",subtype:"Aura",color:"G",cmc:3,cost:"1GG", text:"Enchant land\nWhen enchanted land becomes tapped, destroy it. That land's controller may attach this Aura to a land of their choice.",effect:"stub" /* STUB: destroy enchanted land each upkeep and jump to a new land target */,rarity:"R"},
{id:"lifeforce",       name:"Lifeforce",       type:"Enchantment",color:"G",cmc:2,cost:"GG",  text:"{G}{G}: Counter target black spell.",activated:{cost:"GG",effect:"counterBlack"},rarity:"U"},
{id:"regeneration",    name:"Regeneration",    type:"Enchantment",subtype:"Aura",color:"G",cmc:2,cost:"1G",  text:"Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\n{G}: Regenerate enchanted creature. (The next time that creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)",effect:"stub" /* STUB: grant activated regeneration ability to enchanted creature */,rarity:"C"},

// -- ARTIFACTS -----------------------------------------------
{id:"black_lotus",     name:"Black Lotus",         type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}, Sacrifice this artifact: Add three mana of any one color.",rarity:"R",activated:{cost:"T,sac",effect:"addMana3Any"}},
{id:"mox_pearl",       name:"Mox Pearl",           type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}: Add {W}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"W"}},
{id:"mox_sapphire",    name:"Mox Sapphire",        type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}: Add {U}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"U"}},
{id:"mox_jet",         name:"Mox Jet",             type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}: Add {B}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"B"}},
{id:"mox_ruby",        name:"Mox Ruby",            type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}: Add {R}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"R"}},
{id:"mox_emerald",     name:"Mox Emerald",         type:"Artifact",color:"",cmc:0,cost:"0",text:"{T}: Add {G}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"G"}},
{id:"sol_ring",        name:"Sol Ring",            type:"Artifact",color:"",cmc:1,cost:"1",text:"{T}: Add {C}{C}.",rarity:"U",activated:{cost:"T",effect:"addMana",mana:"CC"}},
{id:"jayemdae_tome",   name:"Jayemdae Tome",       type:"Artifact",color:"",cmc:4,cost:"4",text:"{4}, {T}: Draw a card.",rarity:"R",activated:{cost:"4,T",effect:"draw1"}},
{id:"nevinyrral_disk", name:"Nevinyrral's Disk",   type:"Artifact",color:"",cmc:4,cost:"4",text:"1,T,Sacrifice: Destroy all creatures, artifacts, and enchantments.",rarity:"U",activated:{cost:"1,T,sac",effect:"armageddonDisk"}},
{id:"black_vise",      name:"Black Vise",          type:"Artifact",color:"",cmc:1,cost:"1",text:"As this artifact enters, choose an opponent.\nAt the beginning of the chosen player's upkeep, this artifact deals X damage to that player, where X is the number of cards in their hand minus 4.",upkeep:"blackVise",rarity:"U"},
{id:"howling_mine",    name:"Howling Mine",        type:"Artifact",color:"",cmc:2,cost:"2",text:"At the beginning of each player's draw step, if this artifact is untapped, that player draws an additional card.",upkeep:"howlingMine",rarity:"R"},
{id:"icy_manipulator", name:"Icy Manipulator",     type:"Artifact",color:"",cmc:4,cost:"4",text:"{1}, {T}: Tap target artifact, creature, or land.",activated:{cost:"1,T",effect:"tapTarget"},rarity:"U"},
{id:"mana_vault",      name:"Mana Vault",          type:"Artifact",color:"",cmc:1,cost:"1",text:"This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"CC"}},
{id:"basalt_monolith", name:"Basalt Monolith",     type:"Artifact",color:"",cmc:3,cost:"3",text:"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.",rarity:"U",activated:{cost:"T",effect:"addMana",mana:"CCC"}},
{id:"disrupting_scepter",name:"Disrupting Scepter",type:"Artifact",color:"",cmc:3,cost:"3",text:"{3}, {T}: Target player discards a card. Activate only during your turn.",activated:{cost:"3,T",effect:"discardOne"},rarity:"R"},
{id:"rod_of_ruin",     name:"Rod of Ruin",         type:"Artifact",color:"",cmc:4,cost:"4",text:"{3}, {T}: This artifact deals 1 damage to any target.",activated:{cost:"3,T",effect:"damage1"},rarity:"U"},
{id:"millstone",       name:"Millstone",           type:"Artifact",color:"",cmc:2,cost:"2",text:"{2}, {T}: Target player mills two cards.",activated:{cost:"2,T",effect:"mill2"},rarity:"U"},
{id:"ashnods_altar",   name:"Ashnod's Altar",      type:"Artifact",color:"",cmc:2,cost:"2",text:"Sacrifice a creature: Add {C}{C}.",activated:{cost:"sac",effect:"sacrificeForMana"},rarity:"U"},
{id:"mana_crypt",      name:"Mana Crypt",          type:"Artifact",color:"",cmc:0,cost:"0",text:"At the beginning of your upkeep, flip a coin. If you lose the flip, this artifact deals 3 damage to you.\n{T}: Add {C}{C}.",rarity:"R",activated:{cost:"T",effect:"addMana",mana:"CC"}},
{id:"ivory_tower",     name:"Ivory Tower",         type:"Artifact",color:"",cmc:1,cost:"1",text:"At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4.",upkeep:"ivoryTower",rarity:"R"},
{id:"crystal_rod",        name:"Crystal Rod",         type:"Artifact",color:"",cmc:1,cost:"1",text:"Whenever a player casts a blue spell, you may pay {1}. If you do, you gain 1 life.",effect:"stub" /* STUB: gain 1 life when any blue spell is cast (pay 1) */,rarity:"U"},
{id:"jade_monolith",      name:"Jade Monolith",       type:"Artifact",color:"",cmc:4,cost:"4",text:"{1}: The next time a source of your choice would deal damage to target creature this turn, that source deals that damage to you instead.",activated:{cost:"1",effect:"stub" /* STUB: redirect damage from controller to this artifact until EOT */},rarity:"R"},
{id:"meekstone",          name:"Meekstone",           type:"Artifact",color:"",cmc:1,cost:"1",text:"Creatures with power 3 or greater don't untap during their controllers' untap steps.",rarity:"R"},
{id:"relic_barrier",      name:"Relic Barrier",       type:"Artifact",color:"",cmc:2,cost:"2",text:"{T}: Tap target artifact.",activated:{cost:"T",effect:"tapTarget"},rarity:"U"},
{id:"rocket_launcher",    name:"Rocket Launcher",     type:"Artifact",color:"",cmc:4,cost:"4",text:"{2}: This artifact deals 1 damage to any target. Destroy this artifact at the beginning of the next end step. Activate only if you've controlled this artifact continuously since the beginning of your most recent turn.",activated:{cost:"2,T",effect:"damage1"},rarity:"U"},
{id:"staff_of_zegon",     name:"Staff of Zegon",      type:"Artifact",color:"",cmc:4,cost:"4",text:"{3}, {T}: Target creature gets -2/-0 until end of turn.",activated:{cost:"2,T",effect:"stub" /* STUB: target creature gets -1/-0 until end of turn */},rarity:"U"},
{id:"sunglasses_of_urza", name:"Sunglasses of Urza",  type:"Artifact",color:"",cmc:3,cost:"3",text:"You may spend white mana as though it were red mana.",rarity:"U"},
{id:"tawnos_coffin",      name:"Tawnos's Coffin",     type:"Artifact",color:"",cmc:4,cost:"4",text:"{3,T}: Exile target creature and attached Auras. Return them when Tawnos's Coffin leaves the battlefield.",activated:{cost:"3,T",effect:"stub" /* STUB: exile target creature; return them when this artifact leaves */},rarity:"R"},
{id:"winter_orb",         name:"Winter Orb",          type:"Artifact",color:"",cmc:2,cost:"2",text:"As long as this artifact is untapped, players can't untap more than one land during their untap steps.",rarity:"R"},
{id:"wooden_sphere",      name:"Wooden Sphere",       type:"Artifact",color:"",cmc:1,cost:"1",text:"Whenever a player casts a green spell, you may pay {1}. If you do, you gain 1 life.",effect:"stub" /* STUB: gain 1 life when any green spell is cast (pay 1) */,rarity:"U"},
];

// --- CONVENIENCE LOOKUP ------------------------------------------------------

/** Find a card definition by its canonical ID. */
export const getCardById = (id) => CARD_DB.find(c => c.id === id) || null;

// --- POWER NINE IDS ----------------------------------------------------------

export const POWERED_NINE_IDS = [
"black_lotus","mox_pearl","mox_sapphire","mox_jet","mox_ruby","mox_emerald",
"ancestral_recall","time_walk",
];

// --- ARCHETYPES --------------------------------------------------------------
// Deck lists for AI opponents. Keys are canonical archetype IDs.
// See MECHANICS_INDEX.md S2.1 ? AI generates GameAction objects only.

export const ARCHETYPES = {
WHITE_WEENIE: {
name:"White Weenie", color:"W", strategy:"aggro",
deck:[
...Array(4).fill("savannah_lions"), ...Array(4).fill("white_knight"), ...Array(2).fill("benalish_hero"), ...Array(2).fill("tundra_wolves"), ...Array(2).fill("pearled_unicorn"), ...Array(2).fill("moorish_cavalry"), ...Array(2).fill("serra_angel"), ...Array(2).fill("mesa_pegasus"), ...Array(2).fill("swords_to_plowshares"), ...Array(2).fill("disenchant"), ...Array(2).fill("wrath_of_god"), ...Array(1).fill("balance"), ...Array(1).fill("crusade"), ...Array(2).fill("holy_armor"), ...Array(17).fill("plains"),
]},

BLUE_CONTROL: {
name:"Blue Control", color:"U", strategy:"control",
deck:[
...Array(4).fill("counterspell"), ...Array(2).fill("force_spike"), ...Array(2).fill("remove_soul"), ...Array(2).fill("power_sink"), ...Array(3).fill("unsummon"), ...Array(2).fill("boomerang"), ...Array(2).fill("psionic_blast"), ...Array(1).fill("braingeyser"), ...Array(1).fill("ancestral_recall"), ...Array(1).fill("time_walk"), ...Array(2).fill("phantom_monster"), ...Array(2).fill("azure_drake"), ...Array(2).fill("air_elemental"), ...Array(1).fill("mahamoti_djinn"), ...Array(2).fill("mana_short"), ...Array(17).fill("island"),
]},

BLUE_TEMPO: {
name:"Blue Tempo", color:"U", strategy:"control",
deck:[
...Array(4).fill("flying_men"), ...Array(4).fill("dandan"), ...Array(3).fill("phantom_warrior"), ...Array(2).fill("azure_drake"), ...Array(4).fill("counterspell"), ...Array(3).fill("unsummon"), ...Array(3).fill("boomerang"), ...Array(2).fill("force_spike"), ...Array(2).fill("mana_short"), ...Array(2).fill("psionic_blast"), ...Array(1).fill("braingeyser"), ...Array(1).fill("ancestral_recall"), ...Array(1).fill("time_walk"), ...Array(18).fill("island"),
]},

BLACK_REANIMATOR: {
name:"Black Reanimator", color:"B", strategy:"combo",
deck:[
...Array(4).fill("dark_ritual"), ...Array(3).fill("hypnotic_specter"), ...Array(2).fill("sengir_vampire"), ...Array(2).fill("lord_of_the_pit"), ...Array(2).fill("nightmare"), ...Array(2).fill("juzam_djinn"), ...Array(3).fill("terror"), ...Array(2).fill("sinkhole"), ...Array(2).fill("demonic_tutor"), ...Array(2).fill("mind_twist"), ...Array(2).fill("animate_dead"), ...Array(1).fill("drain_life"), ...Array(2).fill("black_knight"), ...Array(2).fill("royal_assassin"), ...Array(17).fill("swamp"),
]},

BLACK_CONTROL: {
name:"Black Control", color:"B", strategy:"control",
deck:[
...Array(4).fill("dark_ritual"), ...Array(4).fill("hypnotic_specter"), ...Array(3).fill("frozen_shade"), ...Array(3).fill("bog_wraith"), ...Array(2).fill("vampire_bats"), ...Array(2).fill("zombie_master"), ...Array(4).fill("terror"), ...Array(2).fill("dark_banishing"), ...Array(2).fill("sinkhole"), ...Array(2).fill("mind_twist"), ...Array(2).fill("pestilence"), ...Array(1).fill("demonic_tutor"), ...Array(1).fill("drain_life"), ...Array(18).fill("swamp"),
]},

RED_BURN: {
name:"Red Burn", color:"R", strategy:"aggro",
deck:[
...Array(4).fill("lightning_bolt"), ...Array(4).fill("chain_lightning"), ...Array(3).fill("fireball"), ...Array(2).fill("disintegrate"), ...Array(2).fill("lava_axe"), ...Array(2).fill("earthquake"), ...Array(3).fill("monss_goblin_raiders"), ...Array(2).fill("goblin_balloon_brigade"), ...Array(2).fill("goblin_king"), ...Array(2).fill("hill_giant"), ...Array(2).fill("dragon_whelp"), ...Array(1).fill("shivan_dragon"), ...Array(19).fill("mountain"),
]},

RED_AGGRO: {
name:"Goblin Horde", color:"R", strategy:"aggro",
deck:[
...Array(4).fill("monss_goblin_raiders"), ...Array(4).fill("goblin_hero"), ...Array(3).fill("goblin_balloon_brigade"), ...Array(3).fill("goblin_king"), ...Array(2).fill("ironclaw_orcs"), ...Array(2).fill("orcish_artillery"), ...Array(2).fill("hurloon_minotaur"), ...Array(4).fill("lightning_bolt"), ...Array(4).fill("chain_lightning"), ...Array(2).fill("fireball"), ...Array(2).fill("earthquake"), ...Array(18).fill("mountain"),
]},

GREEN_STOMPY: {
name:"Green Stompy", color:"G", strategy:"aggro",
deck:[
...Array(4).fill("llanowar_elves"), ...Array(4).fill("fyndhorn_elves"), ...Array(2).fill("kird_ape"), ...Array(3).fill("grizzly_bears"), ...Array(2).fill("war_mammoth"), ...Array(2).fill("erhnam_djinn"), ...Array(2).fill("craw_wurm"), ...Array(1).fill("force_of_nature"), ...Array(2).fill("birds_of_paradise"), ...Array(3).fill("giant_growth"), ...Array(2).fill("berserk"), ...Array(1).fill("regrowth"), ...Array(2).fill("tranquility"), ...Array(2).fill("taiga"), ...Array(16).fill("forest"),
]},

ARTIFACT_CONTROL: {
name:"Artifact Control", color:"", strategy:"control",
deck:[
"black_lotus","sol_ring","mana_vault","basalt_monolith", ...Array(2).fill("ornithopter"), ...Array(2).fill("juggernaut"), ...Array(2).fill("clockwork_beast"), ...Array(2).fill("colossus_of_sardia"), ...Array(2).fill("triskelion"), ...Array(2).fill("su_chi"),
"nevinyrral_disk","icy_manipulator","disrupting_scepter","rod_of_ruin", ...Array(2).fill("living_wall"), ...Array(2).fill("brass_man"), ...Array(2).fill("mox_pearl"), ...Array(2).fill("mox_sapphire"), ...Array(2).fill("mox_jet"), ...Array(2).fill("mox_ruby"), ...Array(2).fill("mox_emerald"), ...Array(4).fill("plains"), ...Array(3).fill("island"), ...Array(3).fill("swamp"), ...Array(3).fill("mountain"), ...Array(3).fill("forest"),
]},

FIVE_COLOR_BOMB: {
name:"Five-Color Chaos", color:"WUBRG", strategy:"bomb",
deck:[
"black_lotus","sol_ring","ancestral_recall","time_walk","demonic_tutor", ...Array(2).fill("mox_pearl"), ...Array(2).fill("mox_sapphire"), ...Array(2).fill("mox_jet"), ...Array(2).fill("mox_ruby"), ...Array(2).fill("mox_emerald"),
"swords_to_plowshares","wrath_of_god","armageddon","balance","counterspell","mind_twist",
"earthquake","berserk","serra_angel","mahamoti_djinn",
"shivan_dragon","force_of_nature","juzam_djinn","lord_of_the_pit", ...Array(3).fill("plains"), ...Array(3).fill("island"), ...Array(3).fill("swamp"), ...Array(3).fill("mountain"), ...Array(4).fill("forest"),
]},

// --- BOSS DECKS ---------------------------------------------------------------
// Tied to AI_PROFILES keys in AI.js. profileId on the opponent archetype must
// match the key exactly (DELENIA, XYLOS, MORTIS, KARAG, SYLVARA).

BOSS_WHITE: {
  name: "Aegis of Dawn", color: "W", strategy: "aggro-control",
  profileId: "DELENIA",
  deck: [
    // Creatures (12)
    ...Array(4).fill("savannah_lions"),
    ...Array(2).fill("white_knight"),
    ...Array(2).fill("serra_angel"),
    ...Array(2).fill("benalish_hero"),
    ...Array(2).fill("mesa_pegasus"),
    // Spells (10)
    ...Array(4).fill("swords_to_plowshares"),
    ...Array(2).fill("disenchant"),
    ...Array(2).fill("wrath_of_god"),
    ...Array(1).fill("armageddon"),
    ...Array(1).fill("holy_strength"),
    // Artifacts (2)
    ...Array(1).fill("sol_ring"),
    ...Array(1).fill("jayemdae_tome"),
    // Lands (16)
    ...Array(16).fill("plains"),
  ],
  // Total: 4+2+2+2+2 + 4+2+2+1+1 + 1+1 + 16 = 40 ?
},

BOSS_BLUE: {
  name: "Mind of the Maelstrom", color: "U", strategy: "control",
  profileId: "XYLOS",
  deck: [
    // Creatures (8)
    ...Array(2).fill("mahamoti_djinn"),
    ...Array(2).fill("air_elemental"),
    ...Array(2).fill("phantom_warrior"),
    ...Array(2).fill("prodigal_sorcerer"),
    // Spells (14)
    ...Array(4).fill("counterspell"),
    ...Array(1).fill("ancestral_recall"),
    ...Array(1).fill("time_walk"),
    ...Array(2).fill("unsummon"),
    ...Array(2).fill("psionic_blast"),
    ...Array(2).fill("control_magic"),
    ...Array(2).fill("mana_short"),
    // Artifacts (2)
    ...Array(1).fill("sol_ring"),
    ...Array(1).fill("jayemdae_tome"),
    // Lands (16)
    ...Array(16).fill("island"),
  ],
  // Total: 2+2+2+2 + 4+1+1+2+2+2+2 + 1+1 + 16 = 40 ?
},

BOSS_BLACK: {
  name: "Grasp of Midnight", color: "B", strategy: "discard-removal",
  profileId: "MORTIS",
  deck: [
    // Creatures (12)
    ...Array(4).fill("hypnotic_specter"),
    ...Array(2).fill("sengir_vampire"),
    ...Array(2).fill("juzam_djinn"),
    ...Array(2).fill("drudge_skeletons"),
    ...Array(2).fill("royal_assassin"),
    // Spells (12)
    ...Array(4).fill("dark_ritual"),
    ...Array(2).fill("terror"),
    ...Array(1).fill("mind_twist"),
    ...Array(1).fill("demonic_tutor"),
    ...Array(2).fill("drain_life"),
    ...Array(2).fill("pestilence"),
    // Artifacts (2)
    ...Array(1).fill("sol_ring"),
    ...Array(1).fill("nevinyrral_disk"),
    // Lands (14)
    ...Array(14).fill("swamp"),
  ],
  // Total: 4+2+2+2+2 + 4+2+1+1+2+2 + 1+1 + 14 = 40 ?
},

BOSS_RED: {
  name: "Inferno Sovereign", color: "R", strategy: "burn-aggro",
  profileId: "KARAG",
  deck: [
    // Creatures (14)
    ...Array(4).fill("goblin_balloon_brigade"),  // goblin_balloon_brigade substitute
    ...Array(4).fill("goblin_king"),
    ...Array(2).fill("hill_giant"),
    ...Array(2).fill("earth_elemental"),
    ...Array(2).fill("shivan_dragon"),
    // Spells (10)
    ...Array(4).fill("lightning_bolt"),
    ...Array(4).fill("chain_lightning"),
    ...Array(2).fill("fireball"),
    // Artifacts (2)
    ...Array(1).fill("sol_ring"),
    ...Array(1).fill("black_lotus"),
    // Lands (14)
    ...Array(14).fill("mountain"),
  ],
  // Total: 4+4+2+2+2 + 4+4+2 + 1+1 + 14 = 40 ?
},

BOSS_GREEN: {
  name: "Heart of the Wilds", color: "G", strategy: "ramp-stomp",
  profileId: "SYLVARA",
  deck: [
    // Creatures (16)
    ...Array(4).fill("llanowar_elves"),
    ...Array(2).fill("birds_of_paradise"),
    ...Array(4).fill("grizzly_bears"),
    ...Array(2).fill("giant_spider"),
    ...Array(2).fill("war_mammoth"),     // replaces ironroot_treefolk
    ...Array(2).fill("force_of_nature"),
    // Spells (8)
    ...Array(4).fill("giant_growth"),
    ...Array(2).fill("regrowth"),
    ...Array(2).fill("hurricane"),
    // Artifacts (2)
    ...Array(1).fill("sol_ring"),
    ...Array(1).fill("mox_emerald"),
    // Lands (14)
    ...Array(14).fill("forest"),
  ],
  // Total: 4+2+4+2+2+2 + 4+2+2 + 1+1 + 14 = 40 ?
},
};

// --- DEV-MODE ID VALIDATOR ---------------------------------------------------
// Run once at game init (dev builds only) to surface ID drift early.
// Strip or tree-shake for production.

export function validateCardIds(cardDatabase) {
  cardDatabase.forEach(card => {
    const derived = card.name
      .toLowerCase()
      .replace(/['']/g, 's')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (card.id !== derived) {
      console.warn(`ID mismatch: "${card.id}" should be "${derived}" for card "${card.name}"`);
    }
  });
}

export default CARD_DB;