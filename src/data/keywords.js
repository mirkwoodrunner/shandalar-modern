// src/data/keywords.js
// Keyword registry — stateless definitions only.
// DuelCore.js is the sole authority for interpreting these during gameplay.
// Per SYSTEMS.md §9 and MECHANICS_INDEX.md §4.2

export const KEYWORDS = {
FLYING:        { id:“FLYING”,        name:“Flying”,        classic:true,  modern:true,  desc:“Can only be blocked by creatures with flying or reach.” },
FIRST_STRIKE:  { id:“FIRST_STRIKE”,  name:“First Strike”,  classic:true,  modern:true,  desc:“Deals combat damage before creatures without first strike.” },
DOUBLE_STRIKE: { id:“DOUBLE_STRIKE”, name:“Double Strike”, classic:false, modern:true,  desc:“Deals both first-strike and regular combat damage.” },
TRAMPLE:       { id:“TRAMPLE”,       name:“Trample”,       classic:true,  modern:true,  desc:“Excess combat damage is dealt to the defending player.” },
HASTE:         { id:“HASTE”,         name:“Haste”,         classic:true,  modern:true,  desc:“Can attack and use tap abilities the turn it enters.” },
VIGILANCE:     { id:“VIGILANCE”,     name:“Vigilance”,     classic:true,  modern:true,  desc:“Attacking doesn’t cause this creature to tap.” },
LIFELINK:      { id:“LIFELINK”,      name:“Lifelink”,      classic:false, modern:true,  desc:“Damage dealt also causes its controller to gain that much life.” },
DEATHTOUCH:    { id:“DEATHTOUCH”,    name:“Deathtouch”,    classic:false, modern:true,  desc:“Any amount of damage from this is enough to destroy a creature.”, rulesetGated:“deathtouch” },
REACH:         { id:“REACH”,         name:“Reach”,         classic:false, modern:true,  desc:“Can block creatures with flying.” },
MENACE:        { id:“MENACE”,        name:“Menace”,        classic:false, modern:true,  desc:“Can only be blocked by two or more creatures.” },
PROTECTION:    { id:“PROTECTION”,    name:“Protection”,    classic:true,  modern:true,  desc:“Protected from damage, enchantments, blocking, and targeting by specified quality.” },
BANDING:       { id:“BANDING”,       name:“Banding”,       classic:true,  modern:false, desc:“Classic banding rules — can attack or block together with other banding creatures.” },
FLASH:         { id:“FLASH”,         name:“Flash”,         classic:false, modern:true,  desc:“Can be cast any time you could cast an instant.” },
HEXPROOF:      { id:“HEXPROOF”,      name:“Hexproof”,      classic:false, modern:true,  desc:“Can’t be the target of spells or abilities opponents control.” },
SHROUD:        { id:“SHROUD”,        name:“Shroud”,        classic:true,  modern:true,  desc:“Can’t be the target of spells or abilities.” },
INDESTRUCTIBLE:{ id:“INDESTRUCTIBLE”,name:“Indestructible”,classic:false, modern:true,  desc:“Can’t be destroyed by damage or destroy effects.” },
INFECT:        { id:“INFECT”,        name:“Infect”,        classic:false, modern:false, desc:“Deals damage in the form of -1/-1 counters to creatures, poison counters to players.”, rulesetGated:“infect” },
};

export default KEYWORDS;
