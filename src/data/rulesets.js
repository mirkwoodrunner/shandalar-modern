// src/data/rulesets.js
// Ruleset definitions — read-only configuration for DuelCore.
// Per SYSTEMS.md §8 and MECHANICS_INDEX.md §4.1
//
// CONSTRAINTS (ENGINE_CONTRACT_SPEC.md):
//   - Cannot mutate GameState
//   - Cannot execute logic independently
//   - Must be interpreted by DuelCore only

export const RULESETS = {
CLASSIC: {
id: “CLASSIC”,
name: “Classic (Alpha–4th Ed.)”,
description: “Original 1993–1995 rules. Mana burn, banding, LIFO stack, 7-card mulligan (no free).”,
manaBurn: true,
freeMulligan: false,
londonMulligan: false,
stackType: “lifo”,           // “batch” | “lifo”
planeswalkers: false,
commandZone: false,
scry: false,
exileZone: false,
deathtouch: false,
infect: false,
dayNight: false,
companions: false,
startingHandSize: 7,
startingLife: 20,
drawOnFirstTurn: false,
maxHandSize: 7,
poisonCountersToWin: 5,      // original Shandalar rule (not 10)
combatDamageOnStack: true,
},

MODERN: {
id: “MODERN”,
name: “Modern (8th Ed.+)”,
description: “2003+ rules. No mana burn, LIFO stack, London mulligan, combat damage off stack.”,
manaBurn: false,
freeMulligan: false,
londonMulligan: true,
stackType: “lifo”,
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
id: “CONTEMPORARY”,
name: “Contemporary (2020+)”,
description: “Current rules. London mulligan, companions, day/night, full keyword suite.”,
manaBurn: false,
freeMulligan: false,
londonMulligan: true,
stackType: “lifo”,
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

export default RULESETS;