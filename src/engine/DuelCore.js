// src/engine/DuelCore.js
// Central simulation engine — the ONLY authority for GameState mutation.
// Per SYSTEMS.md §1 and MECHANICS_INDEX.md §1.1
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md §7):
//   - ONLY this module may mutate GameState
//   - All other systems submit GameAction objects
//   - Deterministic given identical GameState + rngSeed + action sequence

import { CARD_DB, ARCHETYPES } from '../data/cards.js';

// ─── UTILITIES ────────────────────────────────────────────────────────────────

export const makeId = () => Math.random().toString(36).slice(2, 9);

export const shuffle = (arr) => {
const r = […arr];
for (let i = r.length - 1; i > 0; i–) {
const j = Math.floor(Math.random() * (i + 1));
[r[i], r[j]] = [r[j], r[i]];
}
return r;
};

// ─── CARD TYPE GUARDS ─────────────────────────────────────────────────────────

export const isLand   = c => c?.type === "Land";
export const isCre    = c => c?.type?.startsWith("Creature");
export const isInst   = c => c?.type === "Instant";
export const isSort   = c => c?.type === "Sorcery";
export const isArt    = c => c?.type === "Artifact";
export const isEnch   = c => c?.type?.startsWith("Enchantment");
export const isPerm   = c => isCre(c) || isArt(c) || isEnch(c) || isLand(c);
export const hasKw    = (c, k) => c?.keywords?.includes(k);

// ─── CARD INSTANTIATION ───────────────────────────────────────────────────────

export function makeCardInstance(id, controller) {
const def = CARD_DB.find(c => c.id === id);
if (!def) return null;
return {
…def,
iid: makeId(),
controller,
tapped: false,
summoningSick: true,
attacking: false,
blocking: null,
damage: 0,
counters: {},
enchantments: [],
tokens: [],
exerted: false,
};
}

// ─── MANA SYSTEM ──────────────────────────────────────────────────────────────

export function parseMana(cost) {
if (!cost) return { W:0, U:0, B:0, R:0, G:0, C:0, generic:0 };
const p = { W:0, U:0, B:0, R:0, G:0, C:0, generic:0 };
let i = 0;
while (i < cost.length) {
const ch = cost[i];
if ("WUBRG".includes(ch)) { p[ch]++; i++; }
else if (ch === "C")       { p.C++; i++; }
else if (ch === "X")       { i++; }
else if (!isNaN(parseInt(ch))) {
let n = "";
while (i < cost.length && !isNaN(parseInt(cost[i]))) { n += cost[i]; i++; }
p.generic += parseInt(n);
} else i++;
}
return p;
}

export function canPay(pool, cost) {
const r = parseMana(cost);
const a = { …pool };
for (const c of ["W","U","B","R","G","C"]) {
if (a[c] < r[c]) return false;
a[c] -= r[c];
}
return Object.values(a).reduce((s, v) => s + v, 0) >= r.generic;
}

export function payMana(pool, cost) {
const r = parseMana(cost);
const p = { …pool };
for (const c of ["W","U","B","R","G","C"]) p[c] = Math.max(0, p[c] - r[c]);
let g = r.generic;
for (const c of ["C","G","R","B","U","W"]) {
const s = Math.min(p[c], g);
p[c] -= s;
g -= s;
}
return p;
}

// ─── STATE QUERIES ────────────────────────────────────────────────────────────

export function getBF(state, iid) {
return state.p.bf.find(c => c.iid === iid) || state.o.bf.find(c => c.iid === iid) || null;
}

export function getPow(c, state) {
let p = c.power ?? 0;
if (c.dynamic) {
if (c.name === "Plague Rats")        p = […state.p.bf, …state.o.bf].filter(x => x.name === "Plague Rats").length;
else if (c.dynamicType === "swampCount")   p = state[c.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes("Swamp")).length ?? 0;
else if (c.dynamicType === "forestCount")  p = state[c.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes("Forest")).length ?? 0;
else if (c.dynamicType === "creatureCount")p = […state.p.bf, …state.o.bf].filter(x => isCre(x) && x.controller === c.controller).length;
else if (c.dynamicType === "forestBonus")  p = 1 + (state[c.controller]?.bf.some(x => isLand(x) && x.subtype?.includes("Forest")) ? 1 : 0);
}
return Math.max(0, p + (c.counters?.P1P1 ?? 0) - (c.counters?.M1M1 ?? 0));
}

export function getTou(c, state) {
let t = c.toughness ?? 0;
if (c.dynamic) {
if (c.name === "Plague Rats")        t = […state.p.bf, …state.o.bf].filter(x => x.name === "Plague Rats").length;
else if (c.dynamicType === "swampCount")   t = state[c.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes("Swamp")).length ?? 0;
else if (c.dynamicType === "forestCount")  t = state[c.controller]?.bf.filter(x => isLand(x) && x.subtype?.includes("Forest")).length ?? 0;
else if (c.dynamicType === "creatureCount")t = […state.p.bf, …state.o.bf].filter(x => isCre(x) && x.controller === c.controller).length;
else if (c.dynamicType === "forestBonus")  t = 1 + (state[c.controller]?.bf.some(x => isLand(x) && x.subtype?.includes("Forest")) ? 2 : 1);
}
return Math.max(0, t + (c.counters?.P1P1 ?? 0) - (c.counters?.M1M1 ?? 0));
}

export function canBlockDuel(bl, at) {
if (hasKw(at, "FLYING") && !hasKw(bl, "FLYING") && !hasKw(bl, "REACH")) return false;
if (hasKw(at, "PROTECTION") && at.protection === bl.color) return false;
if (hasKw(bl, "PROTECTION") && bl.protection === at.color) return false;
return true;
}

// ─── STATE MUTATION HELPERS ───────────────────────────────────────────────────

export function dlog(s, text, type = "info") {
return { …s, log: […s.log.slice(-100), { text, type, turn: s.turn }] };
}

export function hurt(s, who, amt, src = "") {
const nl = s[who].life - amt;
let ns = { …s, [who]: { …s[who], life: nl, lifeAnim: amt > 0 ? "damage" : "heal" } };
if (amt > 0) ns = dlog(ns, `${who} takes ${amt} damage${src ? ` from ${src}` : ""}.`, "damage");
else if (amt < 0) ns = dlog(ns, `${who} gains ${-amt} life.`, "heal");
if (nl <= 0 && !ns.over) ns = { …ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} reached 0 life` } };
return ns;
}

export function drawD(s, who, n = 1) {
let ns = s;
for (let i = 0; i < n; i++) {
if (!ns[who].lib.length) {
return { …ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} drew from empty library` } };
}
const [top, …rest] = ns[who].lib;
ns = { …ns, [who]: { …ns[who], lib: rest, hand: […ns[who].hand, top] } };
}
return ns;
}

export function zMove(s, iid, fw, tw, tz) {
let card = null;
let ns = { …s };
for (const z of ["hand","bf","gy","exile","lib"]) {
const idx = ns[fw]?.[z]?.findIndex(c => c.iid === iid);
if (idx !== undefined && idx >= 0) {
card = ns[fw][z][idx];
ns = { …ns, [fw]: { …ns[fw], [z]: ns[fw][z].filter((_, i) => i !== idx) } };
break;
}
}
if (!card) return s;
let a = { …card, controller: tw };
if (tz === "bf") a = { …a, tapped: false, summoningSick: !hasKw(card, "HASTE"), attacking: false, blocking: null, damage: 0 };
if (tz === "gy" || tz === "hand") a = { …a, tapped: false, damage: 0, counters: {}, attacking: false, blocking: null };
return { …ns, [tw]: { …ns[tw], [tz]: […ns[tw][tz], a] } };
}

export function checkDeath(s) {
let ns = s;
for (const w of ["p","o"]) {
const dead = ns[w].bf.filter(c => isCre(c) && c.damage >= getTou(c, ns) && getTou(c, ns) > 0);
for (const c of dead) {
ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${c.name} is destroyed.`, "death");
}
}
return ns;
}

export function burnMana(s, who, ruleset) {
if (!ruleset.manaBurn) return { …s, [who]: { …s[who], mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
const u = Object.values(s[who].mana).reduce((a, b) => a + b, 0);
let ns = { …s, [who]: { …s[who], mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
if (u > 0) ns = hurt(ns, who, u, "mana burn");
return ns;
}

// ─── CASTLE MODIFIER: OVERGROWTH ─────────────────────────────────────────────

export function applyOvergrowthTap(s, who, iid, mana) {
const c = s[who].bf.find(x => x.iid === iid);
if (!c || c.tapped || !isLand(c)) return s;
const m = mana || c.produces?.[0] || "C";
const amount = s.castleMod?.name === "Overgrowth" ? 2 : 1;
let ns = {
…s,
[who]: {
…s[who],
bf: s[who].bf.map(x => x.iid === iid ? { …x, tapped: true } : x),
mana: { …s[who].mana, [m]: (s[who].mana[m] || 0) + amount },
},
};
return dlog(ns, `${who} taps ${c.name} → +${amount}${m}${amount > 1 ? " (Overgrowth)" : ""}.`, "mana");
}

// ─── EFFECT RESOLVER ─────────────────────────────────────────────────────────
// All spell/ability effects route through here.
// Only this function (via DuelCore) may mutate GameState.

export function resolveEff(s, item) {
const { card, caster, targets, xVal } = item;
const opp = caster === "p" ? "o" : "p";
let ns = s;
const tgt = targets?.[0];
const tgtC = tgt ? getBF(ns, tgt) : null;

switch (card.effect) {
case "damage3": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 3, card.name);
else if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, damage: c.damage + 3 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage5":    ns = hurt(ns, tgt || opp, 5, card.name); break;
case "damageX":    { const t2 = tgt === "p" || tgt === "o" ? tgt : opp; ns = hurt(ns, t2, xVal, card.name); break; }
case "psionicBlast": ns = hurt(hurt(ns, tgt || opp, 4, card.name), caster, 2, "Psionic Blast"); break;
case "counter": {
const top = ns.stack[ns.stack.length - 2];
if (top) {
ns = { …ns, stack: ns.stack.filter(i => i.id !== top.id), [top.caster]: { …ns[top.caster], gy: […ns[top.caster].gy, { …top.card }] } };
ns = dlog(ns, `${card.name} counters ${top.card?.name}.`, "effect");
}
break;
}
case "counterCreature": {
const top = ns.stack[ns.stack.length - 2];
if (top && isCre(top.card)) { ns = { …ns, stack: ns.stack.filter(i => i.id !== top.id), [top.caster]: { …ns[top.caster], gy: […ns[top.caster].gy, { …top.card }] } }; ns = dlog(ns, `${card.name} counters ${top.card?.name}.`, "effect"); }
break;
}
case "powerSink": {
const top = ns.stack[ns.stack.length - 2];
if (top) {
ns = { …ns, stack: ns.stack.filter(i => i.id !== top.id), [top.caster]: { …ns[top.caster], gy: […ns[top.caster].gy, { …top.card }] } };
ns = { …ns, [opp]: { …ns[opp], bf: ns[opp].bf.map(c => isLand(c) ? { …c, tapped: true } : c), mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
ns = dlog(ns, `Power Sink counters ${top.card?.name} and drains ${opp}'s mana.`, "effect");
}
break;
}
case "draw3":   ns = drawD(ns, tgt === "p" || tgt === "o" ? tgt : caster, 3); break;
case "draw1":   ns = drawD(ns, caster, 1); break;
case "drawX":   ns = drawD(ns, caster, xVal); break;
case "gainLife3": ns = hurt(ns, caster, -3); break;
case "gainLifeX": ns = hurt(ns, caster, -xVal); break;
case "gainLife1": ns = hurt(ns, caster, -1); break;
case "gainLife2": ns = hurt(ns, caster, -2); break;
case "gainLife6": ns = hurt(ns, caster, -6); break;
case "bounce": {
if (tgtC) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "hand"); ns = dlog(ns, `${card.name} returns ${tgtC.name}.`, "effect"); }
break;
}
case "exileCreature": {
if (tgtC) {
const lf = getPow(tgtC, ns);
ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, ns.ruleset.exileZone ? "exile" : "gy");
ns = hurt(ns, tgtC.controller, -lf, "Swords to Plowshares");
ns = dlog(ns, `${card.name} exiles ${tgtC.name}.`, "effect");
}
break;
}
case "destroy": {
if (tgtC) {
const r = card.restriction;
let ok = true;
if (r === "nonArtifactNonBlack" && (tgtC.color === "B" || isArt(tgtC))) ok = false;
if (r === "nonBlack" && tgtC.color === "B") ok = false;
if (ok) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
}
break;
}
case "destroyArtifact": {
if (tgtC && isArt(tgtC)) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "destroyArtOrEnch": {
if (tgtC && (isArt(tgtC) || isEnch(tgtC))) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "destroyTargetLand": {
if (tgtC && isLand(tgtC)) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "destroyBlack": {
if (tgtC && tgtC.color === "B") { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "destroyBlueOrCounter": {
if (tgtC && tgtC.color === "U") { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
else { const top = ns.stack[ns.stack.length-2]; if (top && top.card?.color === "U") { ns = { …ns, stack: ns.stack.filter(i => i.id !== top.id) }; ns = dlog(ns, `${card.name} counters ${top.card.name}.`, "effect"); } }
break;
}
case "destroyRedOrCounter": {
if (tgtC && tgtC.color === "R") { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
else { const top = ns.stack[ns.stack.length-2]; if (top && top.card?.color === "R") { ns = { …ns, stack: ns.stack.filter(i => i.id !== top.id) }; ns = dlog(ns, `${card.name} counters ${top.card.name}.`, "effect"); } }
break;
}
case "wrathAll": {
ns = dlog(ns, "Wrath of God — all creatures destroyed!", "effect");
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(isCre)) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "destroyAllLands": {
ns = dlog(ns, "Armageddon — all lands destroyed!", "effect");
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(isLand)) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "destroyAllEnchantments": {
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(isEnch)) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all enchantments.`, "effect");
break;
}
case "destroyIslands": {
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Island"))) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all Islands.`, "effect");
break;
}
case "destroyPlains": {
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Plains"))) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all Plains.`, "effect");
break;
}
case "pumpCreature": {
if (tgtC && card.mod) {
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, power: (c.power||0)+(card.mod.power||0), toughness: (c.toughness||0)+(card.mod.toughness||0) } : c) } };
ns = dlog(ns, `${card.name} pumps ${tgtC.name}.`, "effect");
}
break;
}
case "addMana": {
const ms = Array.isArray(card.mana) ? card.mana : [card.mana || "C"];
const mp = { …ns[caster].mana };
for (const m of ms) if ("WUBRGC".includes(m)) mp[m] = (mp[m] || 0) + 1;
ns = { …ns, [caster]: { …ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} adds mana.`, "mana");
break;
}
case "addMana3Any": {
const col = item.chosenColor || "C";
const mp2 = { …ns[caster].mana };
mp2[col] = (mp2[col] || 0) + 3;
ns = { …ns, [caster]: { …ns[caster], mana: mp2 } };
ns = dlog(ns, `Black Lotus adds 3${col}.`, "mana");
break;
}
case "tutor": {
const nl = ns[caster].lib.filter(c => !isLand(c));
if (nl.length) {
const f = nl[Math.floor(Math.random() * nl.length)];
ns = zMove(ns, f.iid, caster, caster, "hand");
ns = { …ns, [caster]: { …ns[caster], lib: shuffle(ns[caster].lib) } };
ns = dlog(ns, `${card.name} — found ${f.name}.`, "effect");
}
break;
}
case "discardX": {
for (let i = 0; i < xVal; i++) {
if (!ns[opp].hand.length) break;
const idx = Math.floor(Math.random() * ns[opp].hand.length);
const dc = ns[opp].hand[idx];
ns = { …ns, [opp]: { …ns[opp], hand: ns[opp].hand.filter((*, j) => j !== idx), gy: […ns[opp].gy, dc] } };
ns = dlog(ns, `${opp} discards ${dc.name}.`, "effect");
}
break;
}
case "discardOne": {
if (ns[opp].hand.length) {
const idx = Math.floor(Math.random() * ns[opp].hand.length);
const dc = ns[opp].hand[idx];
ns = { …ns, [opp]: { …ns[opp], hand: ns[opp].hand.filter((*, i) => i !== idx), gy: […ns[opp].gy, dc] } };
ns = dlog(ns, `${opp} discards ${dc.name}.`, "effect");
}
break;
}
case "wheelOfFortune": {
for (const w of ["p","o"]) { ns = { …ns, [w]: { …ns[w], gy: […ns[w].gy, …ns[w].hand], hand: [] } }; ns = drawD(ns, w, 7); }
ns = dlog(ns, "Wheel of Fortune!", "effect");
break;
}
case "extraTurn": {
ns = { …ns, [caster]: { …ns[caster], extraTurns: (ns[caster].extraTurns || 0) + 1 } };
ns = dlog(ns, `${caster} takes an extra turn!`, "effect");
break;
}
case "regrowth": {
if (ns[caster].gy.length) {
const top = ns[caster].gy[ns[caster].gy.length - 1];
ns = zMove(ns, top.iid, caster, caster, "hand");
ns = dlog(ns, `Regrowth returns ${top.name}.`, "effect");
}
break;
}
case "regrowthCreature": {
const myC = ns[caster].gy.filter(isCre);
if (myC.length) { const top = myC[myC.length - 1]; ns = zMove(ns, top.iid, caster, caster, "hand"); ns = dlog(ns, `${card.name} returns ${top.name} to hand.`, "effect"); }
break;
}
case "reanimate": {
const allGY = […ns[opp].gy, …ns[caster].gy].filter(isCre);
if (allGY.length) {
const oppCres = ns[opp].gy.filter(isCre);
const target = oppCres.length ? oppCres[oppCres.length - 1] : allGY[allGY.length - 1];
const fromWho = ns[opp].gy.find(c => c.iid === target.iid) ? opp : caster;
ns = zMove(ns, target.iid, fromWho, caster, "bf");
ns = dlog(ns, `${card.name} returns ${target.name} under ${caster}'s control.`, "effect");
}
break;
}
case "reanimateOwn": {
const myCreatures = ns[caster].gy.filter(isCre);
if (myCreatures.length) { const top = myCreatures[myCreatures.length - 1]; ns = zMove(ns, top.iid, caster, caster, "bf"); ns = dlog(ns, `${card.name} returns ${top.name}.`, "effect"); }
break;
}
case "controlCreature": {
if (tgtC) { ns = zMove(ns, tgtC.iid, tgtC.controller, caster, "bf"); ns = dlog(ns, `${card.name} takes control of ${tgtC.name}.`, "effect"); }
break;
}
case "hurricane": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, xVal, "Hurricane");
const fl = ns[w].bf.filter(c => isCre(c) && hasKw(c, "FLYING"));
for (const c of fl) ns = { …ns, [w]: { …ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { …x, damage: x.damage + xVal } : x) } };
}
ns = checkDeath(ns);
break;
}
case "earthquake": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, xVal, "Earthquake");
const ground = ns[w].bf.filter(c => isCre(c) && !hasKw(c, "FLYING"));
for (const c of ground) ns = { …ns, [w]: { …ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { …x, damage: x.damage + xVal } : x) } };
}
ns = checkDeath(ns);
break;
}
case "armageddonDisk": {
ns = dlog(ns, "Nevinyrral's Disk fires!", "effect");
for (const w of ["p","o"]) for (const c of […ns[w].bf].filter(c => isCre(c) || isArt(c) || isEnch(c))) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "enchantCreature": {
if (tgtC && card.mod) {
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, toughness: (c.toughness||0)+(card.mod.toughness||0), power: (c.power||0)+(card.mod.power||0), enchantments: […(c.enchantments||[]), card.id] } : c) } };
ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, "effect");
}
break;
}
case "pumpPower": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, power: (c.power||0)+1 } : c) } }; ns = dlog(ns, `${tgtC.name} gets +1/+0.`, "effect"); }
break;
}
case "pumpToughness": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, toughness: (c.toughness||0)+1 } : c) } }; }
break;
}
case "pumpSelf": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, power: (c.power||0)+1 } : c) } }; }
break;
}
case "pumpX": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, power: (c.power||0)+xVal } : c) } }; }
break;
}
case "gainFlying": {
if (tgtC) {
const kws = […(tgtC.keywords||[])];
if (!kws.includes("FLYING")) kws.push("FLYING");
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, keywords: kws } : c) } };
ns = dlog(ns, `${tgtC.name} gains flying.`, "effect");
}
break;
}
case "grantFlying": {
if (tgtC) {
const kws2 = […(tgtC.keywords||[])];
if (!kws2.includes("FLYING")) kws2.push("FLYING");
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, keywords: kws2 } : c) } };
ns = dlog(ns, `${tgtC.name} gains flying.`, "effect");
}
break;
}
case "ping": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
else if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, damage: c.damage+1 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage1": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
else if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, damage: c.damage+1 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage2": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 2, card.name);
else if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, damage: c.damage+2 } : c) } }; ns = checkDeath(ns); }
break;
}
case "destroyTapped": {
if (tgtC && tgtC.tapped) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "regenerate": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, regenerating: true } : c) } }; ns = dlog(ns, `${tgtC.name} will regenerate.`, "effect"); }
break;
}
case "regenerateTarget": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, regenerating: true } : c) } }; }
break;
}
case "paralyze": {
if (tgtC) { ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, paralyzed: true, tapped: true } : c) } }; ns = dlog(ns, `${tgtC?.name} is paralyzed.`, "effect"); }
break;
}
case "pestilence": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, 1, "Pestilence");
for (const c of ns[w].bf.filter(isCre)) ns = { …ns, [w]: { …ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { …x, damage: x.damage+1 } : x) } };
}
ns = checkDeath(ns);
break;
}
case "orcishArtillery": {
ns = hurt(ns, tgt === "o" || tgt === "p" ? tgt : opp, 2, card.name);
ns = hurt(ns, caster, 3, card.name);
break;
}
case "fog": {
ns = { …ns, fogActive: true };
ns = dlog(ns, `${card.name} — combat damage prevented this turn.`, "effect");
break;
}
case "balance": {
const minLands = Math.min(ns.p.bf.filter(isLand).length, ns.o.bf.filter(isLand).length);
const minHand  = Math.min(ns.p.hand.length, ns.o.hand.length);
for (const w of ["p","o"]) {
const excess = ns[w].bf.filter(isLand).slice(minLands);
for (const l of excess) ns = zMove(ns, l.iid, w, w, "gy");
while (ns[w].hand.length > minHand) { const disc = ns[w].hand[ns[w].hand.length-1]; ns = { …ns, [w]: { …ns[w], hand: ns[w].hand.slice(0,-1), gy: […ns[w].gy, disc] } }; }
}
ns = dlog(ns, "Balance — players equalize lands and hands.", "effect");
break;
}
case "drainPower": {
const oppLands = ns[opp].bf.filter(c => isLand(c) && !c.tapped);
ns = { …ns, [opp]: { …ns[opp], bf: ns[opp].bf.map(c => isLand(c) ? { …c, tapped: true } : c) } };
const mp = { …ns[caster].mana };
oppLands.forEach(l => { const m = l.produces?.[0] || "C"; mp[m] = (mp[m] || 0) + 1; });
ns = { …ns, [caster]: { …ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} drains opponent's mana.`, "effect");
break;
}
case "manaShort": {
const who2 = tgt || opp;
ns = { …ns, [who2]: { …ns[who2], bf: ns[who2].bf.map(c => isLand(c) ? { …c, tapped: true } : c), mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
ns = dlog(ns, `${card.name} taps all lands and drains mana pool.`, "effect");
break;
}
case "tapTarget": {
if (tgtC) ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, tapped: true } : c) } };
ns = dlog(ns, `${card.name} taps ${tgtC?.name || "target"}.`, "effect");
break;
}
case "mill2": {
for (let i = 0; i < 2; i++) {
if (!ns[opp].lib.length) break;
const [top, …rest] = ns[opp].lib;
ns = { …ns, [opp]: { …ns[opp], lib: rest, gy: […ns[opp].gy, top] } };
}
ns = dlog(ns, `${card.name} mills 2 cards.`, "effect");
break;
}
case "sacrificeForMana": {
const cres = ns[caster].bf.filter(isCre);
if (cres.length) {
const sac = cres[0];
ns = zMove(ns, sac.iid, caster, caster, "gy");
const mp3 = { …ns[caster].mana }; mp3.C = (mp3.C || 0) + 2;
ns = { …ns, [caster]: { …ns[caster], mana: mp3 } };
ns = dlog(ns, `${sac.name} sacrificed for CC.`, "mana");
}
break;
}
case "untapLand": {
const tland = tgtC || ns[caster].bf.filter(isLand)[0];
if (tland) ns = { …ns, [tland.controller]: { …ns[tland.controller], bf: ns[tland.controller].bf.map(c => c.iid === tland.iid ? { …c, tapped: false } : c) } };
break;
}
case "untapSelf": {
const self = tgtC || ns[caster].bf.find(c => c.id === card.id);
if (self) ns = { …ns, [self.controller]: { …ns[self.controller], bf: ns[self.controller].bf.map(c => c.iid === self.iid ? { …c, tapped: false } : c) } };
break;
}
case "berserk": {
if (tgtC) {
const pow = getPow(tgtC, ns);
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, power: (c.power||0)+pow, keywords: […(c.keywords||[]),"TRAMPLE"], berserked: true } : c) } };
ns = dlog(ns, `Berserk doubles ${tgtC.name}'s power.`, "effect");
}
break;
}
case "forkSpell": {
const top = ns.stack[ns.stack.length - 2];
if (top) { ns = resolveEff(ns, { …top, id: makeId(), caster }); ns = dlog(ns, `Fork copies ${top.card.name}.`, "effect"); }
break;
}
case "drainLife": {
if (tgtC) {
ns = { …ns, [tgtC.controller]: { …ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { …c, damage: c.damage+xVal } : c) } };
ns = checkDeath(ns);
ns = hurt(ns, caster, -xVal);
} else if (tgt === "p" || tgt === "o") {
ns = hurt(ns, tgt, xVal, "Drain Life");
ns = hurt(ns, caster, -xVal);
}
break;
}
case "syphonSoul": ns = hurt(hurt(ns, opp, 2, "Syphon Soul"), caster, -2); break;
case "shuffleGraveyardIn": {
const who3 = tgt || caster;
ns = { …ns, [who3]: { …ns[who3], lib: shuffle([…ns[who3].lib, …ns[who3].gy]), gy: [] } };
ns = dlog(ns, `${card.name} shuffles graveyard into library.`, "effect");
break;
}
case "bazaarActivate": {
ns = drawD(ns, caster, 2);
for (let i = 0; i < 3; i++) { if (!ns[caster].hand.length) break; const disc = ns[caster].hand[ns[caster].hand.length-1]; ns = { …ns, [caster]: { …ns[caster], hand: ns[caster].hand.slice(0,-1), gy: […ns[caster].gy, disc] } }; }
ns = dlog(ns, "Bazaar: drew 2, discarded 3.", "draw");
break;
}
case "stub": ns = dlog(ns, `${card.name} resolves (effect pending).`, "effect"); break;
default:      ns = dlog(ns, `${card.name} resolves.`, "effect");
}
return ns;
}

// ─── COMBAT RESOLUTION ───────────────────────────────────────────────────────

export function resolveCombat(s) {
let ns = s;
if (!ns.attackers.length) return ns;

if (ns.fogActive) {
ns = dlog(ns, "🌫 Fog prevents all combat damage!", "effect");
ns = { …ns, attackers:[], blockers:{}, fogActive:false };
for (const w of ["p","o"]) ns = { …ns, [w]: { …ns[w], bf: ns[w].bf.map(c => ({ …c, attacking:false, blocking:null })) } };
return ns;
}

ns = dlog(ns, "⚔ Combat damage resolving…", "combat");

for (const attId of ns.attackers) {
const att = getBF(ns, attId);
if (!att) continue;
const ap = getPow(att, ns);
const actrl = att.controller;
const defW = actrl === "p" ? "o" : "p";
const hasLifelink = hasKw(att, "LIFELINK") || (ns.castleMod?.name === "Death's Embrace" && actrl === "o");
const blockers = ns[defW].bf.filter(c => c.blocking === attId);

```
if (!blockers.length) {
  ns = hurt(ns, defW, ap, att.name);
  if (hasLifelink) ns = hurt(ns, actrl, -ap);
} else {
  let rem = ap;
  for (const bl of blockers) {
    const bp = getPow(bl, ns);
    const bt = getTou(bl, ns);
    const dbl = Math.min(rem, bt - bl.damage);
    ns = { ...ns, [actrl]: { ...ns[actrl], bf: ns[actrl].bf.map(c => c.iid === attId ? { ...c, damage: c.damage+bp } : c) } };
    ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: c.damage+dbl } : c) } };
    rem = Math.max(0, rem - dbl);
    if (hasLifelink) ns = hurt(ns, actrl, -dbl);
    if (hasKw(att, "DEATHTOUCH") && ns.ruleset.deathtouch) ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: Math.max(c.toughness, c.damage+1) } : c) } };
  }
  if (hasKw(att, "TRAMPLE") && rem > 0) ns = hurt(ns, defW, rem, `${att.name} (trample)`);
}
```

}

ns = checkDeath(ns);
ns = { …ns, attackers:[], blockers:{} };
for (const w of ["p","o"]) ns = { …ns, [w]: { …ns[w], bf: ns[w].bf.map(c => ({ …c, attacking:false, blocking:null })) } };
return ns;
}

// ─── PHASE ADVANCEMENT ───────────────────────────────────────────────────────

export const PHASE_SEQ = ["UNTAP","UPKEEP","DRAW","MAIN1","DECLARE_ATTACKERS","DECLARE_BLOCKERS","COMBAT_DAMAGE","MAIN2","END","CLEANUP"];
export const PHASE_LBL = {
UNTAP:"Untap", UPKEEP:"Upkeep", DRAW:"Draw", MAIN1:"Main 1",
DECLARE_ATTACKERS:"Attackers", DECLARE_BLOCKERS:"Blockers",
COMBAT_DAMAGE:"Combat", MAIN2:"Main 2", END:"End", CLEANUP:"Cleanup",
};
export const COMBAT_PHASES = ["DECLARE_ATTACKERS","DECLARE_BLOCKERS","COMBAT_DAMAGE"];

export function advPhase(s) {
const idx = PHASE_SEQ.indexOf(s.phase);
const next = PHASE_SEQ[(idx + 1) % PHASE_SEQ.length];
const turnChange = next === "UNTAP";
let ns = { …s, phase: next };

// Mana burns at every phase boundary (Classic rule per GDD Bug B6)
for (const w of ["p","o"]) ns = burnMana(ns, w, ns.ruleset);

if (next === "COMBAT_DAMAGE") { ns = resolveCombat(ns); return ns; }

if (turnChange) {
const whoExtra = ["p","o"].find(w => ns[w].extraTurns > 0);
if (whoExtra) {
ns = { …ns, [whoExtra]: { …ns[whoExtra], extraTurns: ns[whoExtra].extraTurns - 1 } };
ns = dlog(ns, `${whoExtra} takes an extra turn!`, "info");
} else {
const nx = ns.active === "p" ? "o" : "p";
ns = { …ns, active: nx };
ns = dlog(ns, `── Turn ${ns.turn + 1} · ${nx} ──`, "phase");
}
ns = { …ns, turn: ns.turn + 1, landsPlayed: 0, attackers: [], blockers: {}, spellsThisTurn: 0 };
ns = { …ns, [ns.active]: { …ns[ns.active], bf: ns[ns.active].bf.map(c => ({ …c, tapped:false, summoningSick:false, damage:0 })) } };
}

if (next === "UPKEEP") {
for (const w of ["p","o"]) {
for (const c of […ns[w].bf]) {
if (!c.controller || c.controller !== w) continue;
switch (c.upkeep) {
case "selfDamage1": ns = hurt(ns, w, 1, c.name); break;
case "forestChoice": {
const pool = { …ns[w].mana };
if ((pool.G || 0) >= 4) { pool.G -= 4; ns = { …ns, [w]: { …ns[w], mana: pool } }; ns = dlog(ns, `${c.name}: paid GGGG upkeep.`, "mana"); }
else ns = hurt(ns, w, 8, `${c.name} upkeep`);
break;
}
case "lordsUpkeep": {
const others = ns[w].bf.filter(x => isCre(x) && x.iid !== c.iid);
if (others.length) { ns = zMove(ns, others[0].iid, w, w, "gy"); ns = dlog(ns, `Lord of the Pit devours ${others[0].name}.`, "death"); }
else ns = hurt(ns, w, 7, "Lord of the Pit");
break;
}
case "sacrificeSelf": if (next === "CLEANUP") ns = zMove(ns, c.iid, w, w, "gy"); break;
case "sacrificeUnless_U": {
const mp = { …ns[w].mana };
if ((mp.U || 0) >= 1) { mp.U–; ns = { …ns, [w]: { …ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
case "blackVise": {
const opp2 = w === "p" ? "o" : "p";
const over = Math.max(0, ns[opp2].hand.length - 4);
if (over > 0) ns = hurt(ns, opp2, over, "Black Vise");
break;
}
case "howlingMine": for (const dw of ["p","o"]) ns = drawD(ns, dw, 1); ns = dlog(ns, "Howling Mine: each player draws a card.", "draw"); break;
case "ivoryTower": { const gain = Math.max(0, ns[w].hand.length - 4); if (gain > 0) ns = hurt(ns, w, -gain, "Ivory Tower"); break; }
case "sylvanLibrary": {
ns = drawD(ns, w, 2);
if (w === "o" && ns[w].hand.length >= 2) {
const put = ns[w].hand.slice(-2);
ns = { …ns, [w]: { …ns[w], hand: ns[w].hand.slice(0,-2), lib: […put, …ns[w].lib] } };
}
if (w === "p") ns = dlog(ns, "Sylvan Library: drew 2 extra cards.", "draw");
break;
}
default: break;
}
}
}
if (ns.fogActive) ns = { …ns, fogActive: false };
}

if (next === "DRAW") {
if (!(ns.turn === 1 && !ns.ruleset.drawOnFirstTurn && ns.active === "p")) {
ns = drawD(ns, ns.active);
}
}

if (next === "CLEANUP") {
const ac = ns.active;
while (ns[ac].hand.length > ns.ruleset.maxHandSize) {
const disc = ns[ac].hand[ns[ac].hand.length - 1];
ns = { …ns, [ac]: { …ns[ac], hand: ns[ac].hand.slice(0,-1), gy: […ns[ac].gy, disc] } };
}
// Castle Inferno modifier
if (ns.castleMod?.name === "Inferno") { ns = hurt(ns, "p", 1, "Inferno"); ns = hurt(ns, "o", 1, "Inferno"); }
}

return ns;
}

// ─── DUEL STATE BUILDER ───────────────────────────────────────────────────────

export function buildDuelState(pDeckIds, oppArchKey, ruleset, overworldHP, castleMod, anteEnabled) {
const pd = shuffle(pDeckIds.map(id => makeCardInstance(id, "p")).filter(Boolean));
const od = shuffle((ARCHETYPES[oppArchKey]?.deck || ARCHETYPES.RED_BURN.deck).map(id => makeCardInstance(id, "o")).filter(Boolean));
const ph = pd.splice(0, ruleset.startingHandSize);
const oh = od.splice(0, ruleset.startingHandSize);
const startLife = overworldHP ?? ruleset.startingLife;
const anteP = anteEnabled && pd.length ? pd[0] : null;
const anteO = anteEnabled && od.length ? od[0] : null;

return {
ruleset,
phase: "MAIN1",
active: "p",
turn: 1,
landsPlayed: 0,
spellsThisTurn: 0,
p: { life: startLife, lib: pd, hand: ph, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null },
o: { life: ruleset.startingLife, lib: od, hand: oh, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null },
stack: [],
attackers: [],
blockers: {},
selCard: null,
selTgt: null,
xVal: 1,
log: [{ text: "The duel begins.", type: "info", turn: 1 }],
over: null,
oppArch: ARCHETYPES[oppArchKey],
castleMod: castleMod || null,
anteP,
anteO,
anteEnabled,
fogActive: false,
pendingLotus: false,
};
}

// ─── DUEL REDUCER ────────────────────────────────────────────────────────────
// Pure function: (GameState, GameAction) → GameState
// This is the ONLY place GameState mutations are valid.

export function duelReducer(state, action) {
if (state.over && action.type !== "RESET") return state;
let s = state;

switch (action.type) {

```
case "TAP_LAND":
  return applyOvergrowthTap(s, action.who, action.iid, action.mana);

case "TAP_ART_MANA": {
  const w = action.who;
  const c = s[w].bf.find(x => x.iid === action.iid);
  if (!c || c.tapped || !c.activated?.effect?.startsWith("addMana")) return s;
  const ms = c.activated.mana || "";
  s = { ...s, [w]: { ...s[w], bf: s[w].bf.map(x => x.iid === action.iid ? { ...x, tapped: true } : x) } };
  const mp = { ...s[w].mana };
  for (const ch of ms) if ("WUBRGC".includes(ch)) mp[ch] = (mp[ch] || 0) + 1;
  return dlog({ ...s, [w]: { ...s[w], mana: mp } }, `${w} taps ${c.name} for mana.`, "mana");
}

case "PLAY_LAND": {
  const w = action.who;
  const c = s[w].hand.find(x => x.iid === action.iid);
  if (!c || !isLand(c) || s.active !== w || (s.phase !== "MAIN1" && s.phase !== "MAIN2") || s.landsPlayed >= 1) return s;
  const lArr = { ...c, controller: w, tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {} };
  s = { ...s, [w]: { ...s[w], hand: s[w].hand.filter(x => x.iid !== action.iid), bf: [...s[w].bf, lArr] }, landsPlayed: s.landsPlayed + 1 };
  return dlog(s, `${w} plays ${c.name}.`, "play");
}

case "CAST_SPELL": {
  const w = action.who;
  const c = s[w].hand.find(x => x.iid === action.iid);
  if (!c) return s;
  if (s.active !== w && !isInst(c)) return s;
  if ((s.phase !== "MAIN1" && s.phase !== "MAIN2") && !isInst(c)) return s;
  if (!canPay(s[w].mana, c.cost)) return s;
  if (w === "p" && s.castleMod?.name === "Tidal Lock" && (s.spellsThisTurn || 0) >= 1) return dlog(s, "Tidal Lock prevents casting more than one spell per turn.", "effect");
  s = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, c.cost), hand: s[w].hand.filter(x => x.iid !== action.iid) } };
  const item = { id: makeId(), card: c, caster: w, targets: action.tgt ? [action.tgt] : [], xVal: action.xVal || s.xVal || 1 };
  if (w === "p") s = { ...s, spellsThisTurn: (s.spellsThisTurn || 0) + 1 };
  if (isPerm(c) && !isLand(c)) {
    const pArr = { ...c, controller: w, tapped: false, summoningSick: !hasKw(c, "HASTE"), attacking: false, blocking: null, damage: 0, counters: {} };
    s = { ...s, [w]: { ...s[w], bf: [...s[w].bf, pArr] } };
    return dlog(s, `${w} casts ${c.name}.`, "play");
  }
  if (s.ruleset.stackType === "batch" || isSort(c)) {
    s = resolveEff(s, item);
    if (!isLand(c) && !isPerm(c)) s = { ...s, [w]: { ...s[w], gy: [...s[w].gy, { ...c }] } };
    return dlog(s, `${w} casts ${c.name}.`, "play");
  }
  return dlog({ ...s, stack: [...s.stack, item] }, `${w} casts ${c.name} (stack).`, "play");
}

case "RESOLVE_STACK": {
  if (!s.stack.length) return s;
  const top = s.stack[s.stack.length - 1];
  s = { ...s, stack: s.stack.slice(0, -1) };
  s = resolveEff(s, top);
  if (!isPerm(top.card)) s = { ...s, [top.caster]: { ...s[top.caster], gy: [...s[top.caster].gy, { ...top.card }] } };
  return s;
}

case "DECLARE_ATTACKER": {
  if (s.phase !== "DECLARE_ATTACKERS" || s.active !== "p") return s;
  const c = s.p.bf.find(x => x.iid === action.iid);
  if (!c || !isCre(c) || c.tapped || c.summoningSick) return s;
  const att = s.attackers.includes(action.iid);
  const atts = att ? s.attackers.filter(id => id !== action.iid) : [...s.attackers, action.iid];
  return { ...s, attackers: atts, p: { ...s.p, bf: s.p.bf.map(x => x.iid === action.iid ? { ...x, attacking: !att, tapped: !att && !hasKw(x, "VIGILANCE") } : x) } };
}

case "DECLARE_BLOCKER": {
  const bl = s.o.bf.find(x => x.iid === action.blId);
  const att = getBF(s, action.attId);
  if (!bl || !att || !s.attackers.includes(action.attId) || !canBlockDuel(bl, att)) return s;
  const already = s.blockers[action.blId] === action.attId;
  const nb = { ...s.blockers };
  if (already) delete nb[action.blId]; else nb[action.blId] = action.attId;
  return { ...s, blockers: nb, o: { ...s.o, bf: s.o.bf.map(x => x.iid === action.blId ? { ...x, blocking: already ? null : action.attId } : x) } };
}

case "ADVANCE_PHASE": return advPhase(s);

case "SEL_CARD": return { ...s, selCard: action.iid };
case "SEL_TGT":  return { ...s, selTgt: action.iid };
case "SET_X":    return { ...s, xVal: action.val };

case "AI_ACTS": {
  let ns = s;
  for (const a of action.acts) ns = duelReducer(ns, a);
  return ns;
}

case "MULLIGAN": {
  const w = action.who || "p";
  if (w === "p" && (s.turn > 1 || s.p.bf.length > 0 || s.landsPlayed > 0)) return s;
  const mulls = (s[w].mulls || 0) + 1;
  const lib = shuffle([...s[w].lib, ...s[w].hand]);
  let ns = { ...s, [w]: { ...s[w], lib, hand: [], mulls } };
  ns = drawD(ns, w, s.ruleset.startingHandSize);
  if (s.ruleset.londonMulligan) {
    for (let i = 0; i < mulls && ns[w].hand.length > 0; i++) {
      const sorted = [...ns[w].hand].sort((a, b) => b.cmc - a.cmc);
      const put = sorted[0];
      ns = { ...ns, [w]: { ...ns[w], hand: ns[w].hand.filter(x => x.iid !== put.iid), lib: [put, ...ns[w].lib] } };
    }
  }
  return dlog(ns, `${w} mulligans (${ns[w].hand.length} cards).`, "info");
}

case "ACTIVATE_ABILITY": {
  const { iid, tgt, chosenColor } = action;
  const card = s.p.bf.find(c => c.iid === iid);
  if (!card || !card.activated) return s;
  const act = card.activated;
  if (act.cost.includes("T")) {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
  }
  const item = { id: makeId(), card: { ...card, effect: act.effect, mana: act.mana }, caster: "p", targets: tgt ? [tgt] : [], xVal: 1, chosenColor };
  s = resolveEff(s, item);
  return dlog(s, `${card.name} ability: ${act.effect}.`, "effect");
}

case "CHOOSE_LOTUS_COLOR": {
  const mp = { ...s.p.mana };
  mp[action.color] = (mp[action.color] || 0) + 3;
  return dlog({ ...s, p: { ...s.p, mana: mp }, pendingLotus: false }, `Black Lotus adds 3${action.color}.`, "mana");
}

case "SET_PENDING_LOTUS": return { ...s, pendingLotus: true };

default: return s;
```

}
}

export default { duelReducer, buildDuelState, PHASE_SEQ, PHASE_LBL, COMBAT_PHASES };
