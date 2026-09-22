// src/data/cardsLearn.js
// Learn Mode card pool. 27 cards, curated from docs/LEARN_CURRICULUM.md's
// Tier 1-3 skill tags and bounded by docs/LEARN_MODE_ROADMAP.md L4a.
//
// Do not edit by hand -- regenerate via: node tools/generate-learn-pool.mjs
//
// Oracle text here is CURRENT Scryfall templating, deliberately unlike CARD_DB's
// classic-flavored wording. That is the point of the pool, not drift to reconcile.
// scripts/learn-check.js gates on a mismatch against the pinned bulk data.
//
// Each entry carries a 'skills' array: the docs/LEARN_CURRICULUM.md skill tags the
// card was selected for. It is selection provenance, not engine data -- DuelCore
// never reads it.

import KEYWORDS from './keywords.js';

export const LEARN_POOL_META = {
  "generatedAt": "2026-09-22T15:30:13.338Z",
  "scryfallBulkDataFile": "oracle-cards-20260419090229.zip",
  "scryfallBulkDataDate": "2026-04-19"
};

export const CARD_DB_LEARN = [
  {id:"air_elemental",name:"Air Elemental",type:"Creature",subtype:"Elemental",color:"U",cmc:5,cost:"3UU",power:4,toughness:4,keywords:[KEYWORDS.FLYING.id],text:"Flying",rarity:"U",skills:["chump-block","race-or-block"]},
  {id:"child_of_night",name:"Child of Night",type:"Creature",subtype:"Vampire",color:"B",cmc:2,cost:"1B",power:2,toughness:1,keywords:[KEYWORDS.LIFELINK.id],text:"Lifelink",rarity:"C",skills:["plan-two-turns","race-or-block"]},
  {id:"counterspell",name:"Counterspell",type:"Instant",color:"U",cmc:2,cost:"UU",text:"Counter target spell.",rarity:"U",effect:"counter",skills:["holding-priority","respond-to-a-spell","stack-order"]},
  {id:"day_of_judgment",name:"Day of Judgment",type:"Sorcery",color:"W",cmc:4,cost:"2WW",text:"Destroy all creatures.",rarity:"R",effect:"wrathAll",skills:["instant-vs-sorcery-timing","when-can-i-cast-this","zero-toughness"]},
  {id:"essence_scatter",name:"Essence Scatter",type:"Instant",color:"U",cmc:2,cost:"1U",text:"Counter target creature spell.",rarity:"C",effect:"counterCreature",skills:["legal-target","stack-order"]},
  {id:"forest",name:"Forest",type:"Land",subtype:"Forest",color:"",cmc:0,cost:"",produces:["G"],text:"({T}: Add {G}.)",rarity:"C",skills:["colored-vs-generic","land-per-turn","tap-for-mana"]},
  {id:"giant_growth",name:"Giant Growth",type:"Instant",color:"G",cmc:1,cost:"G",text:"Target creature gets +3/+3 until end of turn.",rarity:"C",effect:"pumpCreature",mod:{power:3,toughness:3},skills:["bait-a-block","pump-after-blocks","target-your-own"]},
  {id:"giant_spider",name:"Giant Spider",type:"Creature",subtype:"Spider",color:"G",cmc:4,cost:"3G",power:2,toughness:4,keywords:[KEYWORDS.REACH.id],text:"Reach (This creature can block creatures with flying.)",rarity:"C",skills:["choose-a-blocker","trade-or-take"]},
  {id:"goblin_piker",name:"Goblin Piker",type:"Creature",subtype:"Goblin Warrior",color:"R",cmc:2,cost:"1R",power:2,toughness:1,keywords:[],text:"",rarity:"C",skills:["bait-a-block","double-block","trade-or-take"]},
  {id:"grizzly_bears",name:"Grizzly Bears",type:"Creature",subtype:"Bear",color:"G",cmc:2,cost:"1G",power:2,toughness:2,keywords:[],text:"",rarity:"C",skills:["choose-a-blocker","pump-after-blocks","trade-or-take"]},
  {id:"hill_giant",name:"Hill Giant",type:"Creature",subtype:"Giant",color:"R",cmc:4,cost:"3R",power:3,toughness:3,keywords:[],text:"",rarity:"C",skills:["chump-block","double-block","trade-or-take"]},
  {id:"island",name:"Island",type:"Land",subtype:"Island",color:"",cmc:0,cost:"",produces:["U"],text:"({T}: Add {U}.)",rarity:"C",skills:["colored-vs-generic","land-per-turn","tap-for-mana"]},
  {id:"lightning_bolt",name:"Lightning Bolt",type:"Instant",color:"R",cmc:1,cost:"R",text:"Lightning Bolt deals 3 damage to any target.",rarity:"U",effect:"damage3",skills:["burn-for-lethal","legal-target","lethal-damage"]},
  {id:"manalith",name:"Manalith",type:"Artifact",color:"",cmc:3,cost:"3",text:"{T}: Add one mana of any color.",rarity:"C",activated:{cost:"T",effect:"addManaAny"},skills:["identify-card-type","main-phase-timing","permanent-vs-spell"]},
  {id:"mountain",name:"Mountain",type:"Land",subtype:"Mountain",color:"",cmc:0,cost:"",produces:["R"],text:"({T}: Add {R}.)",rarity:"C",skills:["colored-vs-generic","land-per-turn","tap-for-mana"]},
  {id:"murder",name:"Murder",type:"Instant",color:"B",cmc:3,cost:"1BB",text:"Destroy target creature.",rarity:"C",effect:"destroy",skills:["legal-target","removal-after-blocks"]},
  {id:"naturalize",name:"Naturalize",type:"Instant",color:"G",cmc:2,cost:"1G",text:"Destroy target artifact or enchantment.",rarity:"C",effect:"destroyArtOrEnch",skills:["identify-card-type","legal-target"]},
  {id:"plains",name:"Plains",type:"Land",subtype:"Plains",color:"",cmc:0,cost:"",produces:["W"],text:"({T}: Add {W}.)",rarity:"C",skills:["colored-vs-generic","land-per-turn","tap-for-mana"]},
  {id:"raging_goblin",name:"Raging Goblin",type:"Creature",subtype:"Goblin Berserker",color:"R",cmc:1,cost:"R",power:1,toughness:1,keywords:[KEYWORDS.HASTE.id],text:"Haste (This creature can attack and {T} as soon as it comes under your control.)",rarity:"C",skills:["chump-block","hold-back-a-blocker","untap-and-upkeep"]},
  {id:"serra_angel",name:"Serra Angel",type:"Creature",subtype:"Angel",color:"W",cmc:5,cost:"3WW",power:4,toughness:4,keywords:[KEYWORDS.FLYING.id,KEYWORDS.VIGILANCE.id],text:"Flying\nVigilance (Attacking doesn't cause this creature to tap.)",rarity:"U",skills:["hold-back-a-blocker","race-or-block"]},
  {id:"shock",name:"Shock",type:"Instant",color:"R",cmc:1,cost:"R",text:"Shock deals 2 damage to any target.",rarity:"C",effect:"damage2",skills:["burn-for-lethal","lethal-damage","zero-toughness"]},
  {id:"steel_wall",name:"Steel Wall",type:"Artifact Creature",subtype:"Wall",color:"",cmc:1,cost:"1",power:0,toughness:4,keywords:[KEYWORDS.DEFENDER.id],text:"Defender (This creature can't attack.)",rarity:"C",skills:["choose-a-blocker","identify-card-type"]},
  {id:"storm_crow",name:"Storm Crow",type:"Creature",subtype:"Bird",color:"U",cmc:2,cost:"1U",power:1,toughness:2,keywords:[KEYWORDS.FLYING.id],text:"Flying (This creature can't be blocked except by creatures with flying or reach.)",rarity:"C",skills:["choose-a-blocker","chump-block"]},
  {id:"swamp",name:"Swamp",type:"Land",subtype:"Swamp",color:"",cmc:0,cost:"",produces:["B"],text:"({T}: Add {B}.)",rarity:"C",skills:["colored-vs-generic","land-per-turn","tap-for-mana"]},
  {id:"unholy_strength",name:"Unholy Strength",type:"Enchantment",subtype:"Aura",color:"B",cmc:1,cost:"B",text:"Enchant creature\nEnchanted creature gets +2/+1.",rarity:"C",effect:"enchantCreature",mod:{power:2,toughness:1},skills:["identify-card-type","permanent-vs-spell","target-your-own"]},
  {id:"unsummon",name:"Unsummon",type:"Instant",color:"U",cmc:1,cost:"U",text:"Return target creature to its owner's hand.",rarity:"C",effect:"bounce",skills:["respond-to-a-spell","when-can-i-cast-this"]},
  {id:"wind_drake",name:"Wind Drake",type:"Creature",subtype:"Drake",color:"U",cmc:3,cost:"2U",power:2,toughness:2,keywords:[KEYWORDS.FLYING.id],text:"Flying",rarity:"C",skills:["choose-a-blocker","race-or-block"]},
];

export default CARD_DB_LEARN;
