// src/engine/DuelCore.js
// Central simulation engine ? the ONLY authority for GameState mutation.
// Per SYSTEMS.md S1 and MECHANICS_INDEX.md S1.1
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md S7):
//   - ONLY this module may mutate GameState
//   - All other systems submit GameAction objects
//   - Deterministic given identical GameState + rngSeed + action sequence

import { CARD_DB, ARCHETYPES } from '../data/cards.js';
import { PHASE, PHASE_SEQUENCE, SORCERY_SPEED_PHASES } from './phases.js';
import { CARD_HANDLERS } from './cardHandlers.js';
import KEYWORDS from '../data/keywords.js';
import { computeCharacteristics } from './layers.js';

// --- UTILITIES ----------------------------------------------------------------

export const makeId = () => Math.random().toString(36).slice(2, 9);

export const shuffle = (arr) => {
const r = [...arr];
for (let i = r.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[r[i], r[j]] = [r[j], r[i]];
}
return r;
};

// --- CARD TYPE GUARDS ---------------------------------------------------------

export const isLand   = c => c?.type === "Land";
export const isCre    = c => !!c?.type?.includes("Creature");
export const isInst   = c => c?.type === "Instant";
export const isSort   = c => c?.type === "Sorcery";
export const isArt    = c => !!c?.type?.includes("Artifact");
export const isEnch   = c => c?.type?.startsWith("Enchantment");
export const isPerm   = c => isCre(c) || isArt(c) || isEnch(c) || isLand(c);
export function hasKw(c, kw, state = null) {
  if (!state) {
    // No state: only check static card keywords (used pre-battlefield).
    const removedByEot = (c.eotBuffs || []).flatMap(b => b.removeKeywords || []);
    if (removedByEot.includes(kw)) return false;
    return (c.keywords     || []).includes(kw) ||
           (c.eotBuffs     || []).some(b => (b.keywords || []).includes(kw)) ||
           (c.enchantments || []).some(e => (e.mod?.keywords || []).includes(kw));
  }
  const ch = computeCharacteristics(c, state);
  return ch.keywords.includes(kw) ||
         ch.protection.some(() => kw === KEYWORDS.PROTECTION.id);
}

// Returns the most restrictive active life-floor value for player `who`, or null
// if no permanent they control currently grants one. General hook: any card can
// opt in by setting `lifeFloor: <number>` in its card-data entry; no further
// engine changes are needed for future cards using this pattern.
export function getLifeFloor(s, who) {
  const floors = (s[who]?.bf || [])
    .map(c => c.lifeFloor)
    .filter(f => typeof f === 'number');
  if (!floors.length) return null;
  return Math.max(...floors);
}

// --- CARD INSTANTIATION -------------------------------------------------------

export function makeCardInstance(id, controller) {
const def = CARD_DB.find(c => c.id === id);
if (!def) return null;
return { ...def,
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

// --- MANA SYSTEM --------------------------------------------------------------

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

export function canPay(pool, cost, xVal = 0) {
const r = parseMana(cost);
r.generic = (r.generic || 0) + xVal;
const a = { ...pool };
for (const c of ["W","U","B","R","G","C"]) {
if (a[c] < r[c]) return false;
a[c] -= r[c];
}
return Object.values(a).reduce((s, v) => s + v, 0) >= r.generic;
}

export function payMana(pool, cost) {
const r = parseMana(cost);
const p = { ...pool };
for (const c of ["W","U","B","R","G","C"]) p[c] = Math.max(0, p[c] - r[c]);
let g = r.generic;
for (const c of ["C","G","R","B","U","W"]) {
const s = Math.min(p[c], g);
p[c] -= s;
g -= s;
}
return p;
}

// --- STATE QUERIES ------------------------------------------------------------

export function getBF(state, iid) {
return state.p.bf.find(c => c.iid === iid) || state.o.bf.find(c => c.iid === iid) || null;
}

export function getPow(c, state) {
  if (!state) {
    // No state: fall back to base printed value (used in pre-game card display).
    return Math.max(0, typeof c.power === 'number' ? c.power : 0);
  }
  return computeCharacteristics(c, state).power;
}

export function getTou(c, state) {
  if (!state) {
    return typeof c.toughness === 'number' ? c.toughness : 0;   // No floor — display callers handle it
  }
  return computeCharacteristics(c, state).toughness;
}

/**
 * Returns { power, toughness } suitable for UI display.
 * Sums eotBuffs and counter deltas WITHOUT requiring full state (no lord layer).
 * Used by FieldCard components so pumped P/T shows correctly.
 * For combat/SBE accuracy always use getPow(c, state) / getTou(c, state) instead.
 */
export function getDisplayPT(c) {
  const base_p = typeof c.power     === 'number' ? c.power     : 0;
  const base_t = typeof c.toughness === 'number' ? c.toughness : 0;
  let dp = base_p;
  let dt = base_t;
  for (const buff of (c.eotBuffs ?? [])) {
    dp += buff.power     ?? 0;
    dt += buff.toughness ?? 0;
  }
  const p1p1 = c.counters?.P1P1 ?? 0;
  const m1m1 = c.counters?.M1M1 ?? 0;
  dp += p1p1 - m1m1;
  dt += p1p1 - m1m1;
  return { power: Math.max(0, dp), toughness: dt };
}

export function canBlockDuel(bl, at, defBf, state = null) {
// MTG rule 509.1a: blocking creatures must be untapped.
if (bl.tapped) return false;
if (hasKw(at, KEYWORDS.FLYING.id) && !hasKw(bl, KEYWORDS.FLYING.id) && !hasKw(bl, KEYWORDS.REACH.id)) return false;
// Support both string ("B") and array (["black"]) protection formats (S17.6)
const PROT_MAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
// Read protection through computeCharacteristics when state is available so that
// aura-granted protection (e.g. Ward cycle) is correctly enforced. Fall back to
// raw card field for callers that don't pass state.
const atProt = state ? computeCharacteristics(at, state).protection
                     : (Array.isArray(at.protection) ? at.protection : at.protection ? [at.protection] : []);
const blProt = state ? computeCharacteristics(bl, state).protection
                     : (Array.isArray(bl.protection) ? bl.protection : bl.protection ? [bl.protection] : []);
if (atProt.some(q => (PROT_MAP[q] || q) === bl.color)) return false;
if (blProt.some(q => (PROT_MAP[q] || q) === at.color)) return false;
// Invisibility: can only be blocked by Walls.
const atInvisible = at.enchantments?.some(e => e.mod?.invisibility);
if (atInvisible && !bl.subtype?.includes('Wall')) return false;
if (hasKw(at, KEYWORDS.FEAR.id) && bl.color !== "B" && !isArt(bl)) return false;
// Unblockable EOT grant (e.g. Tawnos's Wand).
if (at.eotBuffs?.some(b => b.unblockable)) return false;
// LANDWALK: unblockable if defending player controls a land of the attacker's walk type.
// defBf is the defending player's battlefield (optional -- skipped if not provided).
if (hasKw(at, KEYWORDS.LANDWALK.id, state) && at.landwalkType && defBf) {
  const landSub = at.landwalkType.toLowerCase();
  if (defBf.some(c => isLand(c) && c.subtype?.toLowerCase().includes(landSub))) return false;
}
// Specific landwalk keywords (including those granted via lord effects through hasKw lord layer)
if (defBf) {
  const SPECIFIC_WALKS = [
    [KEYWORDS.MOUNTAINWALK.id, 'mountain'],
    [KEYWORDS.FORESTWALK.id,   'forest'],
    [KEYWORDS.ISLANDWALK.id,   'island'],
    [KEYWORDS.SWAMPWALK.id,    'swamp'],
    [KEYWORDS.PLAINSWALK.id,   'plains'],
  ];
  for (const [kw, sub] of SPECIFIC_WALKS) {
    if (hasKw(at, kw, state) && defBf.some(c => isLand(c) && c.subtype?.toLowerCase().includes(sub))) return false;
  }
}
return true;
}

// --- STATE MUTATION HELPERS ---------------------------------------------------

export function dlog(s, text, type = "info") {
return { ...s, log: [...s.log.slice(-100), { text, type, turn: s.turn }] };
}

export function hurt(s, who, amt, src = "") {
const floor = amt > 0 ? getLifeFloor(s, who) : null;
const rawNl = s[who].life - amt;
const nl = (floor !== null && rawNl < floor) ? floor : rawNl;
let ns = { ...s, [who]: { ...s[who], life: nl, lifeAnim: amt > 0 ? "damage" : "heal" } };
if (amt > 0) {
  // Tracks total damage taken by each player this turn (Simulacrum). Reset at CLEANUP.
  ns = { ...ns, turnState: { ...ns.turnState, damageTakenThisTurn: { ...ns.turnState.damageTakenThisTurn, [who]: (ns.turnState.damageTakenThisTurn?.[who] || 0) + amt } } };
  ns = dlog(ns, `${who} takes ${amt} damage${src ? ` from ${src}` : ""}.`, "damage");
}
else if (amt < 0) ns = dlog(ns, `${who} gains ${-amt} life.`, "heal");
if (who === "p" && amt > 0) ns = { ...ns, peakDamage: Math.max(ns.peakDamage || 0, amt) };
if (nl <= 0 && !ns.over) ns = { ...ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} reached 0 life` } };
return ns;
}

export function drawD(s, who, n = 1) {
let ns = s;
for (let i = 0; i < n; i++) {
if (!ns[who].lib.length) {
return { ...ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} drew from empty library` } };
}
const [top, ...rest] = ns[who].lib;
ns = { ...ns, [who]: { ...ns[who], lib: rest, hand: [...ns[who].hand, top] } };
}
return ns;
}

export function zMove(s, iid, fw, tw, tz) {
let card = null;
let ns = { ...s };
for (const z of ["hand","bf","gy","exile","lib"]) {
const idx = ns[fw]?.[z]?.findIndex(c => c.iid === iid);
if (idx !== undefined && idx >= 0) {
card = ns[fw][z][idx];
ns = { ...ns, [fw]: { ...ns[fw], [z]: ns[fw][z].filter((_, i) => i !== idx) } };
break;
}
}
if (!card) return s;

// Cascade aura removal: when a permanent leaves the battlefield,
// all attached auras go to their controller's graveyard. (SYSTEMS.md S10)
if (card.enchantments?.length) {
for (const aura of card.enchantments) {
const auraOwner = aura.controller || fw;
ns = dlog(ns, `${aura.name} falls off ${card.name}.`, "effect");
ns = { ...ns, [auraOwner]: { ...ns[auraOwner], gy: [...ns[auraOwner].gy, { ...aura.cardData }] } };
}
}

let a = { ...card, controller: tw };
if (tz === "bf") {
// Assign a monotonic enter-timestamp for layer ordering (CR 613.7d).
const ts = (ns.layerClock ?? 0) + 1;
ns = { ...ns, layerClock: ts };
a = { ...a, tapped: false, summoningSick: !hasKw(card, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, eotBuffs: [], enchantments: [], enterTs: ts };
}
if (tz === "gy" || tz === "hand") {
a = { ...a, tapped: false, damage: 0, counters: {}, attacking: false, blocking: null, eotBuffs: [], enchantments: [] };
}
return { ...ns, [tw]: { ...ns[tw], [tz]: [...ns[tw][tz], a] } };
}

export function checkDeath(s) {
let ns = s;
// SBE loop: keep checking until no new deaths. Covers -X/-X dropping toughness to 0.
let changed = true;
while (changed) {
  changed = false;
  for (const w of ["p","o"]) {
    const dead = ns[w].bf.filter(c =>
      isCre(c) && (
        getTou(c, ns) <= 0 ||                           // SBE S5.4 — toughness <= 0 (indestructible does not save)
        (c.damage >= getTou(c, ns) && getTou(c, ns) > 0 && !hasKw(c, KEYWORDS.INDESTRUCTIBLE.id, ns)) // SBE S5.5
      )
    );
    for (const c of dead) {
      // Regenerate: tap, clear damage, remove flag — creature survives.
      // Hurr Jackal: cantRegenerateThisTurn prevents the shield from saving it.
      if (c.regenerating && !c.cantRegenerateThisTurn) {
        ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
          x.iid === c.iid ? { ...x, damage: 0, tapped: true, regenerating: false } : x
        )}};
        ns = dlog(ns, `${c.name} regenerates.`, "effect");
        changed = true;
        continue;
      }
      const dyingCard = c;
      // Creature Bond: scan enchantments BEFORE zMove strips them.
      const tou = getTou(dyingCard, ns);
      for (const aura of (dyingCard.enchantments ?? [])) {
        if (aura.mod?.creatureBond && tou > 0) {
          ns = hurt(ns, w, tou, 'Creature Bond');
          ns = dlog(ns, `Creature Bond deals ${tou} damage to ${w}.`, 'damage');
        }
      }
      // Abu Ja'far: capture combat partners BEFORE zMove clears blocking/attacking fields.
      const blockingId = dyingCard.blocking || null;
      const blockedByIds = [...ns.p.bf, ...ns.o.bf].filter(x => x.blocking === dyingCard.iid).map(x => x.iid);
      // Disintegrate exile override: if exileNextDeath is set, exile instead of GY.
      ns = zMove(ns, c.iid, w, w, ns.exileNextDeath ? "exile" : "gy");
      ns = dlog(ns, `${c.name} is ${ns.exileNextDeath ? "exiled" : "destroyed"}.`, "death");
      ns = emitEvent(ns, { type: 'ON_CREATURE_DIES', payload: { cardId: dyingCard.iid, previousController: w, blockingId, blockedByIds } });
      ns = processTriggerQueue(ns);
      changed = true;
    }
  }
}
ns = checkControlGrants(ns);
return ns;
}

// Moves a conditionally-controlled permanent back to its original controller.
// Called when a controlGrant condition is no longer satisfied.
function revertControlGrant(state, stolenIid) {
  const stolen = getBF(state, stolenIid);
  if (!stolen || !stolen.controlGrant) return state;
  const { grantorController } = stolen.controlGrant;
  const currentCtrl = stolen.controller;
  const { controlGrant: _cg, tapped: _t, summoningSick: _ss, attacking: _atk, blocking: _bl, ...rest } = stolen;
  const reverted = { ...rest, controller: grantorController, tapped: false, summoningSick: false, attacking: false, blocking: null };
  let ns = { ...state, [currentCtrl]: { ...state[currentCtrl], bf: state[currentCtrl].bf.filter(c => c.iid !== stolenIid) } };
  ns = { ...ns, [grantorController]: { ...ns[grantorController], bf: [...ns[grantorController].bf, reverted] } };
  return dlog(ns, `${reverted.name} reverts to ${grantorController} (control grant ended).`, 'effect');
}

// Evaluates all active controlGrant conditions and reverts any that are no longer satisfied.
// Called after checkDeath so that Aladdin leaving the battlefield is already processed.
function checkControlGrants(state) {
  let ns = state;
  const allBf = [...ns.p.bf, ...ns.o.bf];
  for (const card of allBf) {
    if (!card.controlGrant) continue;
    const grant = card.controlGrant;

    if (grant.condition === 'whileGrantorControlled') {
      // Revert if the grantor is no longer on either player's battlefield.
      const grantorOnBf = ns.p.bf.some(c => c.iid === grant.grantorIid) ||
                          ns.o.bf.some(c => c.iid === grant.grantorIid);
      if (!grantorOnBf) {
        ns = revertControlGrant(ns, card.iid);
      }
    } else if (grant.condition === 'whileTappedAndPowerLte') {
      // Revert if grantor left bf, grantor is untapped, or stolen creature's power exceeded maxPower.
      // (Real-time power recheck simplified to SBE pass — see completion notes.)
      const grantor = getBF(ns, grant.grantorIid);
      if (!grantor || !grantor.tapped || getPow(card, ns) > grant.maxPower) {
        ns = revertControlGrant(ns, card.iid);
      }
    }
  }
  return ns;
}

export function burnMana(s, who, ruleset) {
if (!ruleset.manaBurn) return { ...s, [who]: { ...s[who], mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
const u = Object.values(s[who].mana).reduce((a, b) => a + b, 0);
let ns = { ...s, [who]: { ...s[who], mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
if (u > 0) ns = hurt(ns, who, u, "mana burn");
return ns;
}

// --- WIN CONDITIONS -----------------------------------------------------------
// Checked after every SBE pass. Returns { winner, reason } or null.

export function checkWinConditions(state) {
  const poisonLimit = state.ruleset?.poisonCountersToWin ?? 5;
  if (state.p.life <= 0)                         return { winner: 'o', reason: 'LIFE' };
  if (state.o.life <= 0)                         return { winner: 'p', reason: 'LIFE' };
  if ((state.p.poisonCounters || 0) >= poisonLimit) return { winner: 'o', reason: 'POISON' };
  if ((state.o.poisonCounters || 0) >= poisonLimit) return { winner: 'p', reason: 'POISON' };
  return null;
}

// --- INTERRUPT PROMPT GUARD ---------------------------------------------------
// Returns true if the human player should be offered a response window.

export function shouldPromptPlayerForResponse(state) {
  const hand = state.p.hand;
  const battlefield = state.p.bf;
  const hasInstant = hand.some(c => c.type?.includes('Instant') || c.type?.includes('Interrupt'));
  const hasActivatedAbility = battlefield.some(p =>
    p.abilities?.some(a => a.type === 'ACTIVATED' && canPay(state.p.mana, a.cost))
  );
  return hasInstant || hasActivatedAbility;
}

// --- CASTLE MODIFIER: OVERGROWTH ---------------------------------------------

export function applyOvergrowthTap(s, who, iid, mana) {
const c = s[who].bf.find(x => x.iid === iid);
if (!c || c.tapped || !isLand(c)) return s;
const m = mana || c.produces?.[0] || "C";
// Mishra's Workshop: {T}: Add {C}{C}{C}.
// Adapted from Card-Forge/forge (m/mishras_workshop.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
// SIMPLIFICATION: the "spend this mana only to cast artifact spells" restriction
// isn't enforced -- this engine's mana pool doesn't track per-mana spend
// restrictions (no existing card enforces one either).
const amount = c.id === "mishrass_workshop" ? 3 : (s.castleMod?.name === "Overgrowth" ? 2 : 1);
let ns = { ...s,
[who]: { ...s[who],
bf: s[who].bf.map(x => x.iid === iid ? { ...x, tapped: true } : x),
mana: { ...s[who].mana, [m]: (s[who].mana[m] || 0) + amount },
},
};
ns = dlog(ns, `${who} taps ${c.name} → +${amount}${m}${amount > 1 ? " (Overgrowth)" : ""}.`, "mana");
const allBF_tap = [...ns.p.bf, ...ns.o.bf];
if (allBF_tap.some(x => x.id === "mana_flare")) {
ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, [m]: (ns[who].mana[m] || 0) + 1 } } };
ns = dlog(ns, `Mana Flare: ${who} gets +1${m}.`, "mana");
}
if (allBF_tap.some(x => x.id === "manabarbs")) {
ns = hurt(ns, who, 1, "Manabarbs");
}
// Wild Growth: enchanted land produces +1G when tapped
if (c.enchantments?.some(e => e.mod?.wildGrowth)) {
ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, G: (ns[who].mana.G || 0) + 1 }}};
ns = dlog(ns, `Wild Growth: ${who} gets +1G.`, "mana");
}
if (ns[who].bf.some(x => x.id === "sunglasses_of_urza") && c.subtype?.includes("Plains")) {
ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, R: (ns[who].mana.R || 0) + 1 } } };
ns = dlog(ns, `Sunglasses of Urza: ${who} gets +1R.`, "mana");
}
// Tron bonus: if this is a Tron piece and all three are in play, add extra colorless.
if (c.tronPiece) {
const ownerBf = ns[who].bf;
const hasTower = ownerBf.some(x => x.tronPiece === "tower");
const hasMine  = ownerBf.some(x => x.tronPiece === "mine");
const hasPlant = ownerBf.some(x => x.tronPiece === "plant");
if (hasTower && hasMine && hasPlant) {
  const bonus = c.tronPiece === "tower" ? 2 : 1;
  ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, C: (ns[who].mana.C || 0) + bonus } } };
  ns = dlog(ns, `Tron bonus: ${c.name} tapped for ${1 + bonus} colorless.`, "mana");
}
}
return ns;
}

// --- EFFECT RESOLVER ---------------------------------------------------------
// All spell/ability effects route through here.
// Only this function (via DuelCore) may mutate GameState.

// findStackTarget: resolve counter target by id, fallback to positional.
function findStackTarget(stack, tgt, counterItemId) {
  if (tgt) {
    const byId = stack.find(i => i.id === tgt && i.id !== counterItemId);
    if (byId) return byId;
  }
  // Fallback: item directly below the resolving counter spell.
  // stack has already had the top item (the counter) removed before resolveEff
  // is called, so stack[length - 1] IS the item below.
  return stack[stack.length - 1] ?? null;
}

export function resolveEff(s, item) {
const { card, caster, targets, xVal } = item;
const opp = caster === "p" ? "o" : "p";
let ns = s;
const tgt = targets?.[0];
const tgtC = tgt ? getBF(ns, tgt) : null;

// Priority 1: custom card handler (spec S7.2)
if (card.name && CARD_HANDLERS[card.name]) {
  const result = CARD_HANDLERS[card.name].onResolve(ns, card, targets || []);
  if (result) return result;
}

switch (card.effect) {
case "damage3": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 3, card.name);
else if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 3 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage5":    { const t5 = tgt === "p" || tgt === "o" ? tgt : opp; ns = hurt(ns, t5, 5, card.name); break; }
case "damageX":    { const t2 = tgt === "p" || tgt === "o" ? tgt : opp; ns = hurt(ns, t2, xVal, card.name); break; }
case "psionicBlast": {
if (tgt === "p" || tgt === "o") {
  ns = hurt(ns, tgt, 4, card.name);
} else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 4 } : c) } };
  ns = checkDeath(ns);
} else {
  ns = hurt(ns, opp, 4, card.name);
}
ns = hurt(ns, caster, 2, "Psionic Blast");
break;
}
case "counter": {
const top = findStackTarget(ns.stack, tgt, item.id);
if (!top) { ns = dlog(ns, `${card.name} fizzles -- no target on stack.`, "effect"); break; }

// Spell Blast: hard counter, CMC-gated at cast time. No payment interaction.
if (card.id === "spell_blast" && top.card.cmc !== xVal) {
  ns = dlog(ns, `${card.name} fizzles -- target CMC ${top.card.cmc} does not match X=${xVal}.`, "effect");
  break;
}

// Force Spike: counter unless controller pays {1}.
if (card.id === "force_spike") {
  const totalMana = Object.values(ns[top.caster].mana).reduce((acc, v) => acc + v, 0);
  ns = dlog(ns, `Force Spike targets ${top.card?.name}. ${top.caster} may pay {1}.`, "effect");
  return { ...ns, pendingConditionalCounter: {
    cardId: 'force_spike',
    cardName: 'Force Spike',
    stackItemId: top.id,
    targetCaster: top.caster,
    cost: 1,
    canPay: totalMana >= 1,
  }};
}

ns = { ...ns, stack: ns.stack.filter(i => i.id !== top.id),
  [top.caster]: { ...ns[top.caster], gy: [...ns[top.caster].gy, { ...top.card }] } };
ns = dlog(ns, `${card.name} counters ${top.card?.name}.`, "effect");
break;
}
case "counterCreature": {
const top = findStackTarget(ns.stack, tgt, item.id);
if (!top) { ns = dlog(ns, `${card.name} fizzles -- no target on stack.`, "effect"); break; }
if (!isCre(top.card)) { ns = dlog(ns, `${card.name} fizzles -- target is not a creature spell.`, "effect"); break; }
ns = { ...ns, stack: ns.stack.filter(i => i.id !== top.id),
  [top.caster]: { ...ns[top.caster], gy: [...ns[top.caster].gy, { ...top.card }] } };
ns = dlog(ns, `${card.name} counters ${top.card?.name}.`, "effect");
break;
}
case "powerSink": {
const top = findStackTarget(ns.stack, tgt, item.id);
if (!top) { ns = dlog(ns, `${card.name} fizzles -- no target on stack.`, "effect"); break; }
const totalMana = Object.values(ns[top.caster].mana).reduce((acc, v) => acc + v, 0);
const psX = totalMana;
ns = dlog(ns, `Power Sink targets ${top.card?.name}. ${top.caster} may pay {${psX}}.`, "effect");
return { ...ns, pendingConditionalCounter: {
  cardId: 'power_sink',
  cardName: 'Power Sink',
  stackItemId: top.id,
  targetCaster: top.caster,
  cost: psX,
  canPay: totalMana >= psX,
}};
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
ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "exile");
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
if (tgtC && isArt(tgtC)) {
  if (hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)) { ns = dlog(ns, `${tgtC.name} is indestructible.`, 'effect'); break; }
  ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect");
}
break;
}
case "destroyArtOrEnch": {
if (tgtC && (isArt(tgtC) || isEnch(tgtC))) {
  if (hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)) { ns = dlog(ns, `${tgtC.name} is indestructible.`, 'effect'); break; }
  ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect");
}
break;
}
case "destroyTargetLand": {
if (tgtC && isLand(tgtC)) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
else { ns = dlog(ns, `${card.name} fizzles -- no valid land target.`, "effect"); }
break;
}
case "destroyBlack": {
if (tgtC && tgtC.color === "B") { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "destroyBlueOrCounter": {
const permTarget = tgt ? (ns.p.bf.find(c => c.iid === tgt) || ns.o.bf.find(c => c.iid === tgt)) : null;
if (permTarget) {
  if (permTarget.color !== "U") { ns = dlog(ns, `${card.name} fizzles -- target is not blue.`, "effect"); break; }
  ns = zMove(ns, permTarget.iid, permTarget.controller, permTarget.controller, "gy");
  ns = dlog(ns, `${card.name} destroys ${permTarget.name}.`, "effect");
  break;
}
const stackTarget = findStackTarget(ns.stack, tgt, item.id);
if (!stackTarget) { ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect"); break; }
if (stackTarget.card?.color !== "U") { ns = dlog(ns, `${card.name} fizzles -- target spell is not blue.`, "effect"); break; }
ns = { ...ns, stack: ns.stack.filter(i => i.id !== stackTarget.id) };
ns = dlog(ns, `${card.name} counters ${stackTarget.card.name}.`, "effect");
break;
}
case "destroyRedOrCounter": {
const permTarget = tgt ? (ns.p.bf.find(c => c.iid === tgt) || ns.o.bf.find(c => c.iid === tgt)) : null;
if (permTarget) {
  if (permTarget.color !== "R") { ns = dlog(ns, `${card.name} fizzles -- target is not red.`, "effect"); break; }
  ns = zMove(ns, permTarget.iid, permTarget.controller, permTarget.controller, "gy");
  ns = dlog(ns, `${card.name} destroys ${permTarget.name}.`, "effect");
  break;
}
const stackTarget = findStackTarget(ns.stack, tgt, item.id);
if (!stackTarget) { ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect"); break; }
if (stackTarget.card?.color !== "R") { ns = dlog(ns, `${card.name} fizzles -- target spell is not red.`, "effect"); break; }
ns = { ...ns, stack: ns.stack.filter(i => i.id !== stackTarget.id) };
ns = dlog(ns, `${card.name} counters ${stackTarget.card.name}.`, "effect");
break;
}
case "wrathAll": {
ns = dlog(ns, "Wrath of God — all creatures destroyed!", "effect");
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isCre)) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "destroyAllLands": {
ns = dlog(ns, "Armageddon — all lands destroyed!", "effect");
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isLand)) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "destroyAllEnchantments": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isEnch)) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all enchantments.`, "effect");
break;
}
case "destroyIslands": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Island"))) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all Islands.`, "effect");
break;
}
case "destroyPlains": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Plains"))) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all Plains.`, "effect");
break;
}
case "pumpCreature": {
if (tgtC && card.mod) {
// Store in eotBuffs so the boost expires at CLEANUP. SYSTEMS.md S3.1
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: card.mod.power || 0, toughness: card.mod.toughness || 0 }] } : c) } };
ns = dlog(ns, `${card.name} pumps ${tgtC.name}.`, "effect");
}
break;
}
case "addMana": {
const ms = Array.isArray(card.mana) ? card.mana : [card.mana || "C"];
const mp = { ...ns[caster].mana };
for (const m of ms) if ("WUBRGC".includes(m)) mp[m] = (mp[m] || 0) + 1;
ns = { ...ns, [caster]: { ...ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} adds mana.`, "mana");
break;
}
case "addMana3Any": {
const col = item.chosenColor || "C";
const mp2 = { ...ns[caster].mana };
mp2[col] = (mp2[col] || 0) + 3;
ns = { ...ns, [caster]: { ...ns[caster], mana: mp2 } };
ns = dlog(ns, `Black Lotus adds 3${col}.`, "mana");
break;
}
case "addManaAny": {
// Birds of Paradise: T: Add one mana of any color.
// Color is chosen via BopColorPicker UI and pre-set as item.chosenColor,
// OR dispatched separately via CHOOSE_BOP_COLOR action.
if (item.chosenColor) {
const mp = { ...ns[caster].mana };
mp[item.chosenColor] = (mp[item.chosenColor] || 0) + 1;
ns = { ...ns, [caster]: { ...ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} adds 1${item.chosenColor}.`, "mana");
}
break;
}
case "tutor": {
const lib = ns[caster].lib;
if (!lib.length) break;
const shuttered = shuffle([...lib]);
ns = {
  ...ns,
  [caster]: { ...ns[caster], lib: shuttered },
  pendingTutor: {
    caster,
    filter: card.tutorFilter ?? 'any',
    destination: card.tutorDestination ?? 'hand',
    reveal: card.tutorReveal ?? false,
    shuffledLib: shuttered,
    _transmuteMode: false,
    _sacrificedCmc: 0,
  },
};
ns = dlog(ns, `${card.name} resolves — searching library.`, 'effect');
break;
}
case "discardX": {
for (let i = 0; i < xVal; i++) {
if (!ns[opp].hand.length) break;
const idx = Math.floor(Math.random() * ns[opp].hand.length);
const dc = ns[opp].hand[idx];
ns = { ...ns, [opp]: { ...ns[opp], hand: ns[opp].hand.filter((_, j) => j !== idx), gy: [...ns[opp].gy, dc] } };
ns = dlog(ns, `${opp} discards ${dc.name}.`, "effect");
}
break;
}
case "discardOne": {
if (ns[opp].hand.length) {
const idx = Math.floor(Math.random() * ns[opp].hand.length);
const dc = ns[opp].hand[idx];
ns = { ...ns, [opp]: { ...ns[opp], hand: ns[opp].hand.filter((_, i) => i !== idx), gy: [...ns[opp].gy, dc] } };
ns = dlog(ns, `${opp} discards ${dc.name}.`, "effect");
}
break;
}
case "wheelOfFortune": {
for (const w of ["p","o"]) { ns = { ...ns, [w]: { ...ns[w], gy: [...ns[w].gy, ...ns[w].hand], hand: [] } }; ns = drawD(ns, w, 7); }
ns = dlog(ns, "Wheel of Fortune!", "effect");
break;
}
case "timetwister": {
const shuffleArr = (arr) => {
const r = [...arr];
for (let i = r.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[r[i], r[j]] = [r[j], r[i]];
}
return r;
};
for (const w of ['p', 'o']) {
const newLib = shuffleArr([...ns[w].lib, ...ns[w].hand, ...ns[w].gy]);
ns = { ...ns, [w]: { ...ns[w], lib: newLib, hand: [], gy: [] } };
ns = drawD(ns, w, 7);
}
ns = dlog(ns, 'Timetwister ? all players shuffle and draw 7.', 'effect');
break;
}
case "extraTurn": {
ns = { ...ns, [caster]: { ...ns[caster], extraTurns: (ns[caster].extraTurns || 0) + 1 } };
ns = dlog(ns, `${caster} takes an extra turn!`, "effect");
break;
}
case "regrowth": {
const gyTgt = tgt ? ns[caster].gy.find(c => c.iid === tgt) : null;
const gyCard = gyTgt || (ns[caster].gy.length ? ns[caster].gy[ns[caster].gy.length - 1] : null);
if (gyCard) {
ns = zMove(ns, gyCard.iid, caster, caster, "hand");
ns = dlog(ns, `Regrowth returns ${gyCard.name}.`, "effect");
}
break;
}
case "regrowthCreature": {
const myC = ns[caster].gy.filter(isCre);
if (myC.length) { const top = myC[myC.length - 1]; ns = zMove(ns, top.iid, caster, caster, "hand"); ns = dlog(ns, `${card.name} returns ${top.name} to hand.`, "effect"); }
break;
}
case "reanimate": {
const allGY = [...ns[opp].gy, ...ns[caster].gy].filter(isCre);
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
const fl = ns[w].bf.filter(c => isCre(c) && hasKw(c, KEYWORDS.FLYING.id));
for (const c of fl) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, damage: x.damage + xVal } : x) } };
}
ns = checkDeath(ns);
break;
}
case "earthquake": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, xVal, "Earthquake");
const ground = ns[w].bf.filter(c => isCre(c) && !hasKw(c, KEYWORDS.FLYING.id));
for (const c of ground) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, damage: x.damage + xVal } : x) } };
}
ns = checkDeath(ns);
break;
}
case "armageddonDisk": {
ns = dlog(ns, "Nevinyrral's Disk fires!", "effect");
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isCre(c) || isArt(c) || isEnch(c))) ns = zMove(ns, c.iid, w, w, "gy");
break;
}
case "enchantCreature": {
// Attach aura to target permanent as a static modifier record.
// getPow/getTou/hasKw read enchantments[].mod. Cascade removal handled by zMove.
// SYSTEMS.md S10 (Card System), S5.2 (Damage Rules)
if (tgtC && card.mod) {
  // Animate Wall: Wall-only target guard -- reject before attaching.
  if (card.mod.enchantWallOnly && !tgtC.subtype?.includes('Wall')) {
    return dlog(s, `${card.name} can only enchant Walls.`, 'info');
  }
  // Guardian Beast: noncreature artifacts you control can't be enchanted (new auras only --
  // existing auras already attached are unaffected per card text).
  if (isArt(tgtC) && !isCre(tgtC) && ns[tgtC.controller].bf.some(c => c.id === 'guardian_beast' && !c.tapped)) {
    return dlog(s, `Guardian Beast prevents ${card.name} from enchanting ${tgtC.name}.`, 'effect');
  }
  const auraRecord = {
    iid:        card.iid,
    name:       card.name,
    mod:        { ...card.mod },
    controller: caster,
    cardData:   { ...card },
    enterTs:    ns.layerClock ?? 0,
  };
  ns = { ...ns,
    [tgtC.controller]: { ...ns[tgtC.controller],
      bf: ns[tgtC.controller].bf.map(c =>
        c.iid === tgtC.iid
          ? { ...c, enchantments: [...(c.enchantments || []), auraRecord] }
          : c
      ),
    },
  };
  const mods = [];
  if (card.mod.power)           mods.push(`+${card.mod.power}/+0`);
  if (card.mod.toughness)       mods.push(`+0/+${card.mod.toughness}`);
  if (card.mod.keywords)        mods.push(card.mod.keywords.join(', '));
  if (card.mod.removeKeywords)  mods.push(`removes ${card.mod.removeKeywords.join(', ')}`);
  if (card.mod.protection)      mods.push(`protection from ${card.mod.protection}`);
  ns = dlog(ns, `${card.name} enchants ${tgtC.name} (${mods.join(', ') || 'modified'}).`, 'effect');
  // Paralyze: tap the enchanted creature on entry.
  if (card.mod.paralyzed) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, tapped: true } : c
    )}};
  }
  // Regeneration Aura: grant {G}: Regenerate activated ability to the host creature.
  if (card.mod.regenerationAura) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, activated: c.activated || { cost: 'G', effect: 'regenerate' } } : c
    )}};
  }
  // Earthbind: if host has flying at attach time, deal 2 damage and gain "loses flying".
  if (card.mod.earthbind && hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller],
      bf: ns[tgtC.controller].bf.map(c =>
        c.iid === tgtC.iid ? { ...c, damage: c.damage + 2 } : c
      )
    }};
    ns = dlog(ns, `Earthbind deals 2 damage to ${tgtC.name}.`, 'effect');
    // Mutate the last-attached aura record to add removeKeywords: [FLYING].
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller],
      bf: ns[tgtC.controller].bf.map(c => {
        if (c.iid !== tgtC.iid) return c;
        const encs = [...c.enchantments];
        const idx = encs.length - 1;
        encs[idx] = { ...encs[idx], mod: { ...encs[idx].mod, removeKeywords: [KEYWORDS.FLYING.id] } };
        return { ...c, enchantments: encs };
      })
    }};
    ns = dlog(ns, `${tgtC.name} loses flying.`, 'effect');
    ns = checkDeath(ns);
  }
  // Return early -- aura stays attached to the permanent, NOT sent to graveyard.
  // The caller's post-resolution GY logic uses isPerm() which returns true for
  // Enchantments, so the aura card will not be double-added. Verify this holds
  // for both the CAST_SPELL and RESOLVE_STACK handlers.
  return ns;
}
break;
}
case "enchantLand": {
// Attach aura to target land.
if (tgtC && isLand(tgtC)) {
  if (card.mod) {
    // Wild Growth / Overgrowth: embed aura mod record in land's enchantments array.
    const auraRecord = {
      iid:        card.iid,
      name:       card.name,
      mod:        card.mod,
      controller: caster,
      cardData:   { ...card },
    };
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, enchantments: [...(c.enchantments || []), auraRecord] } : c
    )}};
    ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, "effect");
    return ns;
  } else {
    // Kudzu-style: card goes on caster's bf and tracks its host via enchantedLandIid.
    const pArr = { ...card, controller: caster, tapped: false, summoningSick: false,
      attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      enchantedLandIid: tgtC.iid };
    ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
    ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, "effect");
  }
}
break;
}
case "pumpPower": {
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, power: (c.power||0)+1 } : c) } }; ns = dlog(ns, `${tgtC.name} gets +1/+0.`, "effect"); }
break;
}
case "pumpToughness": {
// LEGACY: direct mutation -- bypasses layers. Kept for non-activated-ability call sites.
// All activated-ability calls now route through pumpToughnessEOT via effectOverride.
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, toughness: (c.toughness||0)+1 } : c) } }; }
break;
}
case "pumpSelf": {
// LEGACY: direct mutation -- bypasses layers. Kept for non-activated-ability call sites.
// All activated-ability calls now route through pumpSelfEOT via effectOverride.
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, power: (c.power||0)+1 } : c) } }; }
break;
}
case "pumpX": {
// LEGACY: direct mutation -- bypasses layers. Kept for non-activated-ability call sites.
// All activated-ability calls now route through pumpXEOT via effectOverride.
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, power: (c.power||0)+xVal } : c) } }; }
break;
}
case "gainFlying": {
if (tgtC) {
const kws = [...(tgtC.keywords||[])];
if (!kws.includes(KEYWORDS.FLYING.id)) kws.push(KEYWORDS.FLYING.id);
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, keywords: kws } : c) } };
ns = dlog(ns, `${tgtC.name} gains flying.`, "effect");
}
break;
}
case "pumpPowerEOT": {
// Shivan Dragon R: +1/+0 until end of turn. Stored in eotBuffs[], purged at CLEANUP.
// SYSTEMS.md S3.1 (End Phase: expire temporary modifiers)
const host = tgtC || ns[caster].bf.find(c => c.iid === item.card.iid);
if (host) {
ns = { ...ns,
[host.controller]: { ...ns[host.controller],
bf: ns[host.controller].bf.map(c =>
c.iid === host.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1 }] }
: c
),
},
};
ns = dlog(ns, `${host.name} gets +1/+0 until end of turn.`, "effect");
}
break;
}
case "gainFlyingEOT": {
// Goblin Balloon Brigade R: gains flying until end of turn.
// Stored in eotBuffs[], purged at CLEANUP. hasKw() reads eotBuffs. SYSTEMS.md S9
const self = ns[caster].bf.find(c => c.iid === item.card.iid);
if (self && !hasKw(self, KEYWORDS.FLYING.id)) {
ns = { ...ns,
[caster]: { ...ns[caster],
bf: ns[caster].bf.map(c =>
c.iid === self.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.FLYING.id] }] }
: c
),
},
};
ns = dlog(ns, `${self.name} gains flying until end of turn.`, "effect");
}
break;
}
case "pumpToughnessEOT": {
// Granite Gargoyle {R}: +0/+1 until end of turn. Stored in eotBuffs[], purged at CLEANUP.
const host = tgtC || ns[caster].bf.find(c => c.iid === item.card.iid);
if (host) {
ns = { ...ns,
[host.controller]: { ...ns[host.controller],
bf: ns[host.controller].bf.map(c =>
c.iid === host.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { toughness: 1 }] }
: c
),
},
};
ns = dlog(ns, `${host.name} gets +0/+1 until end of turn.`, "effect");
}
break;
}
case "pumpSelfEOT": {
// Frozen Shade / Vampire Bats {B}: +1/+1 until end of turn.
const self2 = ns[caster].bf.find(c => c.iid === item.card.iid);
if (self2) {
ns = { ...ns,
[caster]: { ...ns[caster],
bf: ns[caster].bf.map(c =>
c.iid === self2.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1, toughness: 1 }] }
: c
),
},
};
ns = dlog(ns, `${self2.name} gets +1/+1 until end of turn.`, "effect");
}
break;
}
case "pumpXEOT": {
// Berserk-style X pump until end of turn.
const hostX = tgtC || ns[caster].bf.find(c => c.iid === item.card.iid);
if (hostX) {
ns = { ...ns,
[hostX.controller]: { ...ns[hostX.controller],
bf: ns[hostX.controller].bf.map(c =>
c.iid === hostX.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: xVal }] }
: c
),
},
};
ns = dlog(ns, `${hostX.name} gets +${xVal}/+0 until end of turn.`, "effect");
}
break;
}
case "grantFlyingEOT": {
// Jump / Stone Giant: target creature gains flying until end of turn.
if (tgtC) {
ns = { ...ns,
[tgtC.controller]: { ...ns[tgtC.controller],
bf: ns[tgtC.controller].bf.map(c =>
c.iid === tgtC.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.FLYING.id] }] }
: c
),
},
};
ns = dlog(ns, `${tgtC.name} gains flying until end of turn.`, "effect");
}
break;
}
case "grantFlying": {
// LEGACY: direct mutation -- bypasses layers. Kept for non-activated-ability call sites.
// All activated-ability calls now route through grantFlyingEOT via effectOverride.
if (tgtC) {
const kws2 = [...(tgtC.keywords||[])];
if (!kws2.includes(KEYWORDS.FLYING.id)) kws2.push(KEYWORDS.FLYING.id);
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, keywords: kws2 } : c) } };
ns = dlog(ns, `${tgtC.name} gains flying.`, "effect");
}
break;
}
case "ping": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
else if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage+1 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage1": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
else if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage+1 } : c) } }; ns = checkDeath(ns); }
break;
}
case "damage2": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 2, card.name);
else if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage+2 } : c) } }; ns = checkDeath(ns); }
break;
}
case "destroyTapped": {
if (tgtC && tgtC.tapped) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
case "regenerate": {
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, regenerating: true } : c) } }; ns = dlog(ns, `${tgtC.name} will regenerate.`, "effect"); }
break;
}
case "regenerateTarget": {
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, regenerating: true } : c) } }; }
break;
}
case "paralyze": {
if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, paralyzed: true, tapped: true } : c) } }; ns = dlog(ns, `${tgtC?.name} is paralyzed.`, "effect"); }
break;
}
case "pestilence": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, 1, "Pestilence");
for (const c of ns[w].bf.filter(isCre)) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, damage: x.damage+1 } : x) } };
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
ns = { ...ns, fogActive: true };
ns = dlog(ns, `${card.name} ? combat damage prevented this turn.`, "effect");
break;
}
// --- GROUP P NEW CASES -------------------------------------------------------
case "pumpAttackersEOT": {
for (const w of ['p', 'o']) {
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
    c.attacking
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1, toughness: 1 }] }
      : c
  ) } };
}
ns = dlog(ns, `${card.name}: attacking creatures get +1/+1 until end of turn.`, 'effect');
break;
}
case "debuffNonwhiteEOT": {
for (const w of ['p', 'o']) {
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
    isCre(c) && c.color !== 'W'
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: -1, toughness: -1 }] }
      : c
  ) } };
}
ns = checkDeath(ns);
ns = dlog(ns, `${card.name}: nonwhite creatures get -1/-1 until end of turn.`, 'effect');
break;
}
case "destroyAllArtifacts": {
for (const w of ['p', 'o']) {
  const arts = [...ns[w].bf.filter(a => isArt(a) && !hasKw(a, KEYWORDS.INDESTRUCTIBLE.id, ns))];
  for (const a of arts) {
    ns = zMove(ns, a.iid, w, w, 'gy');
  }
}
ns = dlog(ns, `${card.name}: all artifacts destroyed.`, 'effect');
break;
}
case "inferno6": {
for (const w of ['p', 'o']) {
  ns = hurt(ns, w, 6, card.name);
  const cresSnap = ns[w].bf.filter(isCre).map(c => c.iid);
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
    cresSnap.includes(c.iid) ? { ...c, damage: c.damage + 6 } : c
  ) } };
}
ns = checkDeath(ns);
ns = dlog(ns, `${card.name}: 6 damage to each creature and each player.`, 'effect');
break;
}
case "damageAttackers1": {
for (const id of (ns.attackers || [])) {
  for (const w of ['p', 'o']) {
    const c = ns[w].bf.find(x => x.iid === id);
    if (c) {
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
        x.iid === id ? { ...x, damage: x.damage + 1 } : x
      ) } };
    }
  }
}
ns = checkDeath(ns);
ns = dlog(ns, `${card.name}: 1 damage to each attacking creature.`, 'effect');
break;
}
case "jovialEvil": {
const victim = tgt === 'p' || tgt === 'o' ? tgt : opp;
const whiteCount = ns[victim].bf.filter(c => isCre(c) && c.color === 'W').length;
const dmg = whiteCount * 2;
if (dmg > 0) ns = hurt(ns, victim, dmg, card.name);
ns = dlog(ns, `${card.name}: deals ${dmg} damage to ${victim} (${whiteCount} white creatures x 2).`, 'effect');
break;
}
case "destroyAllBlack": {
for (const w of ['p', 'o']) {
  const blacks = [...ns[w].bf.filter(c => isCre(c) && c.color === 'B')];
  for (const c of blacks) ns = zMove(ns, c.iid, w, w, 'gy');
}
ns = dlog(ns, `${card.name}: all black creatures destroyed.`, 'effect');
break;
}
case "ashesToAshes": {
const targets = (item.targets || []).slice(0, 2);
for (const tid of targets) {
  for (const w of ['p', 'o']) {
    const c = ns[w].bf.find(x => x.iid === tid);
    if (c && !isArt(c)) {
      ns = { ...ns, [w]: { ...ns[w], exile: [...(ns[w].exile || []), c],
        bf: ns[w].bf.filter(x => x.iid !== tid) } };
    }
  }
}
ns = hurt(ns, caster, 5, card.name);
ns = dlog(ns, `${card.name}: exiled ${targets.length} creature(s); ${caster} loses 5 life.`, 'effect');
break;
}
case "stormSeeker": {
const victim = tgt === 'p' || tgt === 'o' ? tgt : opp;
const handSize = ns[victim].hand.length;
if (handSize > 0) ns = hurt(ns, victim, handSize, card.name);
ns = dlog(ns, `${card.name}: deals ${handSize} damage to ${victim}.`, 'effect');
break;
}
case "destroyForests": {
for (const w of ['p', 'o']) {
  const forests = [...ns[w].bf.filter(c => isLand(c) && c.subtype?.toLowerCase().includes('forest'))];
  for (const f of forests) ns = zMove(ns, f.iid, w, w, 'gy');
}
ns = dlog(ns, `${card.name}: all Forests destroyed.`, 'effect');
break;
}
case "typhoon": {
const oppSide = caster === 'p' ? 'o' : 'p';
const islandCount = ns[oppSide].bf.filter(c => isLand(c) && c.subtype?.toLowerCase().includes('island')).length;
if (islandCount > 0) ns = hurt(ns, oppSide, islandCount, card.name);
ns = dlog(ns, `${card.name}: ${islandCount} damage to ${oppSide} (${islandCount} islands).`, 'effect');
break;
}
case "bloodLust": {
if (tgtC) {
  const curTou = (tgtC.toughness || 0) + (tgtC.counters?.P1P1 || 0) - (tgtC.counters?.M1M1 || 0);
  const touDelta = curTou <= 5 ? -(curTou - 1) : -4;
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 4, toughness: touDelta }] }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} gets +4/${touDelta} until end of turn.`, 'effect');
}
break;
}
case "detonate": {
if (tgtC && isArt(tgtC) && (tgtC.cmc || 0) === (item.xVal || 0)) {
  const xDmg = tgtC.cmc || 0;
  const victim = tgtC.controller;
  ns = zMove(ns, tgtC.iid, victim, victim, 'gy');
  if (xDmg > 0) ns = hurt(ns, victim, xDmg, card.name);
  ns = dlog(ns, `${card.name}: destroyed ${tgtC.name}; dealt ${xDmg} damage to ${victim}.`, 'effect');
}
break;
}
case "pumpWallsEOT": {
ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
  c.subtype?.includes('Wall')
    ? { ...c, eotBuffs: [...(c.eotBuffs || []), { toughness: 3 }] }
    : c
) } };
ns = dlog(ns, `${card.name}: your Walls get +0/+3 until end of turn.`, 'effect');
break;
}
case "mightstoneAttackPump": {
ns = dlog(ns, `${card.name} (Mightstone): attacking creatures get +1/+0.`, 'effect');
break;
}
case "energyTap": {
if (tgtC && !tgtC.tapped) {
  const mv = tgtC.cmc || 0;
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller],
    bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, tapped: true } : c),
    mana: { ...ns[tgtC.controller].mana, C: (ns[tgtC.controller].mana.C || 0) + mv }
  } };
  ns = dlog(ns, `${card.name}: tapped ${tgtC.name}; added ${mv} colorless mana.`, 'mana');
}
break;
}
case "gainFirstStrikeEOT": {
const self = ns[caster].bf.find(c => c.iid === item.card.iid);
if (self && !hasKw(self, KEYWORDS.FIRST_STRIKE.id)) {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
    c.iid === self.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.FIRST_STRIKE.id] }] }
      : c
  ) } };
  ns = dlog(ns, `${self.name} gains first strike until end of turn.`, 'effect');
}
break;
}
case "removeFlying": {
if (tgtC && hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { layerDef: { layer: '6', removeKeywords: [KEYWORDS.FLYING.id] } }] }
      : c
  ) } };
  ns = dlog(ns, `${tgtC.name} loses flying until end of turn.`, 'effect');
}
break;
}
case "destroyBlueCreature": {
if (tgtC && isCre(tgtC) && tgtC.color === 'U') {
  ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, 'gy');
  ns = dlog(ns, `${card.name}: destroyed ${tgtC.name}.`, 'effect');
}
break;
}
case "damage4Any": {
if (tgt === 'p' || tgt === 'o') ns = hurt(ns, tgt, 4, card.name);
else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, damage: c.damage + 4 } : c
  ) } };
  ns = checkDeath(ns);
}
ns = dlog(ns, `${card.name}: 4 damage.`, 'effect');
break;
}
case "untapTarget": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, tapped: false } : c
  ) } };
  ns = dlog(ns, `${card.name}: untapped ${tgtC.name}.`, 'effect');
}
break;
}
case "psionicEntity": {
if (tgt === 'p' || tgt === 'o') ns = hurt(ns, tgt, 2, card.name);
else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, damage: c.damage + 2 } : c
  ) } };
  ns = checkDeath(ns);
}
const pEntity = ns[caster].bf.find(c => c.name === 'Psionic Entity');
if (pEntity) {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
    c.name === 'Psionic Entity' ? { ...c, damage: c.damage + 3 } : c
  ) } };
  ns = checkDeath(ns);
}
ns = dlog(ns, `Psionic Entity: 2 damage to target; 3 damage to itself.`, 'effect');
break;
}
case "globalDebuffPower1EOT": {
for (const w of ['p', 'o']) {
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
    isCre(c) ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: -1 }] } : c
  ) } };
}
ns = dlog(ns, `${card.name}: all creatures get -1/-0 until end of turn.`, 'effect');
break;
}
case "debuffTargetPower1EOT": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: -1 }] }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} gets -1/-0 until end of turn.`, 'effect');
}
break;
}
case "preventDamage1Any":
case "preventDamage1Creature": {
if (tgt === 'p' || tgt === 'o') {
  ns = { ...ns, [tgt]: { ...ns[tgt], damageShield: (ns[tgt].damageShield || 0) + 1 } };
  ns = dlog(ns, `${card.name}: prevented 1 damage to ${tgt}.`, 'effect');
} else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + 1 } : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} has 1 damage prevented.`, 'effect');
}
break;
}
case "ebonyHorse": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, tapped: false, attacking: false, ebonyHorsed: true } : c
  ) } };
  ns = { ...ns, attackers: ns.attackers.filter(id => id !== tgtC.iid) };
  ns = dlog(ns, `${card.name}: ${tgtC.name} untapped and removed from combat.`, 'effect');
}
break;
}
case "fightTargets": {
const [f1id, f2id] = (item.targets || []);
let f1, f2, f1Side, f2Side;
for (const w of ['p', 'o']) {
  const c1 = ns[w].bf.find(c => c.iid === f1id);
  const c2 = ns[w].bf.find(c => c.iid === f2id);
  if (c1) { f1 = c1; f1Side = w; }
  if (c2) { f2 = c2; f2Side = w; }
}
if (f1 && f2) {
  const p1 = getPow(f1, ns), p2 = getPow(f2, ns);
  ns = { ...ns, [f1Side]: { ...ns[f1Side], bf: ns[f1Side].bf.map(c =>
    c.iid === f1id ? { ...c, damage: c.damage + p2 } : c) } };
  ns = { ...ns, [f2Side]: { ...ns[f2Side], bf: ns[f2Side].bf.map(c =>
    c.iid === f2id ? { ...c, damage: c.damage + p1 } : c) } };
  ns = checkDeath(ns);
  ns = dlog(ns, `${card.name}: ${f1.name} and ${f2.name} fight.`, 'effect');
}
break;
}
case "warBarge": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c,
          eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.ISLANDWALK.id] }],
          warBargeTargeted: card.iid
        }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} gains islandwalk until end of turn.`, 'effect');
}
break;
}
case "sandalsOfAbdallah": {
// Grants islandwalk until EOT. "Destroy artifact when target dies" clause omitted:
// no death-link hook exists in this engine (warBargeTargeted is set but never consumed).
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.ISLANDWALK.id] }], sandalsTargeted: card.iid }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} gains islandwalk until end of turn.`, 'effect');
}
break;
}
case "destroyLandAura": {
// Targets an Aura attached to a land. Two storage patterns exist:
//   1. BF-standalone cards with enchantedLandIid (Kudzu-style) -- tgtC resolves normally.
//   2. Embedded aura records in land.enchantments[] (Wild Growth-style) -- tgtC is null; match by iid.
if (tgtC && tgtC.enchantedLandIid) {
  ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy");
  ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect");
} else if (tgt) {
  // Search all lands for an embedded aura record matching tgt iid.
  let found = false;
  for (const side of ["p", "o"]) {
    const landIdx = ns[side].bf.findIndex(l => isLand(l) && (l.enchantments || []).some(e => e.iid === tgt));
    if (landIdx >= 0) {
      const land = ns[side].bf[landIdx];
      const aura = land.enchantments.find(e => e.iid === tgt);
      const auraOwner = aura.controller || side;
      ns = { ...ns, [side]: { ...ns[side], bf: ns[side].bf.map((l, i) =>
        i === landIdx ? { ...l, enchantments: l.enchantments.filter(e => e.iid !== tgt) } : l
      ) } };
      ns = { ...ns, [auraOwner]: { ...ns[auraOwner], gy: [...ns[auraOwner].gy, { ...aura.cardData }] } };
      ns = dlog(ns, `${card.name} destroys ${aura.name}.`, "effect");
      found = true;
      break;
    }
  }
  if (!found) ns = dlog(ns, `${card.name} fizzles -- no valid land Aura target.`, "effect");
}
break;
}
case "jadeStatue": {
ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
  c.iid === item.card.iid
    ? { ...c, type: 'Artifact Creature', subtype: 'Golem', power: 3, toughness: 6, isAnimatedArtifact: true, eotRevert: true }
    : c
) } };
ns = dlog(ns, `Jade Statue becomes a 3/6 Golem until end of combat.`, 'effect');
break;
}
case "grantBandingEOT": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.BANDING.id] }] }
      : c
  ) } };
  ns = dlog(ns, `${tgtC.name} gains banding until end of turn.`, 'effect');
}
break;
}
case "addManaWithSelfDamage": {
const manaColor = item.card.mana || 'B';
const selfDmg = item.card.selfDamage || (item.card.mod?.selfDamage) || 1;
ns = { ...ns, [caster]: { ...ns[caster], mana: { ...ns[caster].mana, [manaColor]: (ns[caster].mana[manaColor] || 0) + 1 } } };
ns = hurt(ns, caster, selfDmg, card.name);
ns = dlog(ns, `${card.name}: added {${manaColor}}; ${caster} takes ${selfDmg} damage.`, 'mana');
break;
}
// --- END GROUP P CASES -------------------------------------------------------
// --- BATCH 1B: Wall destruction, sacrifice-cost abilities --------------------
case "destroyWall": {
if (tgtC && tgtC.subtype?.includes('Wall')) {
  ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy");
  ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect");
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- no legal Wall target.`, "effect");
}
break;
}
case "destroyArtifactSac": {
if (tgtC && isArt(tgtC)) {
  if (hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)) {
    ns = dlog(ns, `${tgtC.name} is indestructible.`, 'effect');
  } else {
    ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy");
    ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect");
  }
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- no legal artifact target.`, "effect");
}
break;
}
case "pingCombatant": {
const isAttackingC = (ns.attackers || []).includes(tgtC?.iid);
const isBlockingC = tgtC?.blocking != null;
if (tgtC && (isAttackingC || isBlockingC)) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c) } };
  ns = checkDeath(ns);
  ns = dlog(ns, `${card.name} deals 1 damage to ${tgtC.name}.`, "effect");
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- target is not attacking or blocking.`, "effect");
}
break;
}
case "cuombajjWitches": {
// First damage: player-chosen target (creature or player).
// SIMPLIFICATION: second damage target (opponent's choice) resolved deterministically:
// highest-effective-toughness creature on the caster's side, or the caster player if none.
// True opponent-choice UI is deferred to a future batch.
if (tgt === "p" || tgt === "o") {
  ns = hurt(ns, tgt, 1, card.name);
  ns = dlog(ns, `${card.name} deals 1 damage to ${tgt} (player choice).`, "effect");
} else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c) } };
  ns = checkDeath(ns);
  ns = dlog(ns, `${card.name} deals 1 damage to ${tgtC.name} (player choice).`, "effect");
} else {
  ns = dlog(ns, `${card.name}'s first damage fizzles -- no target.`, "effect");
}
// Second damage: deterministic fallback for opponent's choice.
const cwCasterCres = ns[caster].bf.filter(isCre);
if (cwCasterCres.length > 0) {
  const cwOppTgt = cwCasterCres.reduce((best, c) => {
    const eff = (c.toughness || 0) + (c.counters?.P1P1 || 0) - (c.counters?.M1M1 || 0);
    const bestEff = (best.toughness || 0) + (best.counters?.P1P1 || 0) - (best.counters?.M1M1 || 0);
    return eff > bestEff || (eff === bestEff && c.iid < best.iid) ? c : best;
  });
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c => c.iid === cwOppTgt.iid ? { ...c, damage: c.damage + 1 } : c) } };
  ns = checkDeath(ns);
  ns = dlog(ns, `${card.name} deals 1 damage to ${cwOppTgt.name} (opponent's choice, deterministic).`, "effect");
} else {
  ns = hurt(ns, caster, 1, card.name);
  ns = dlog(ns, `${card.name} deals 1 damage to ${caster} (opponent's choice, deterministic).`, "effect");
}
break;
}
// --- END BATCH 1B CASES ------------------------------------------------------
case "balance": {
  const minLands = Math.min(ns.p.bf.filter(isLand).length, ns.o.bf.filter(isLand).length);
  const minCres  = Math.min(ns.p.bf.filter(isCre).length,  ns.o.bf.filter(isCre).length);
  const minHand  = Math.min(ns.p.hand.length, ns.o.hand.length);
  for (const w of ["p","o"]) {
    const excessLands = ns[w].bf.filter(isLand).slice(minLands);
    for (const l of excessLands) ns = zMove(ns, l.iid, w, w, "gy");
    const excessCres = ns[w].bf.filter(isCre).slice(minCres);
    for (const cr of excessCres) ns = zMove(ns, cr.iid, w, w, "gy");
    while (ns[w].hand.length > minHand) { const disc = ns[w].hand[ns[w].hand.length-1]; ns = { ...ns, [w]: { ...ns[w], hand: ns[w].hand.slice(0,-1), gy: [...ns[w].gy, disc] } }; }
  }
  ns = checkDeath(ns);
  ns = dlog(ns, "Balance: permanents and hands equalized.", "effect");
  break;
}
case "drainPower": {
const oppLands = ns[opp].bf.filter(c => isLand(c) && !c.tapped);
ns = { ...ns, [opp]: { ...ns[opp], bf: ns[opp].bf.map(c => isLand(c) ? { ...c, tapped: true } : c) } };
const mp = { ...ns[caster].mana };
oppLands.forEach(l => { const m = l.produces?.[0] || "C"; mp[m] = (mp[m] || 0) + 1; });
ns = { ...ns, [caster]: { ...ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} drains opponent's mana.`, "effect");
break;
}
case "manaShort": {
const who2 = tgt || opp;
ns = { ...ns, [who2]: { ...ns[who2], bf: ns[who2].bf.map(c => isLand(c) ? { ...c, tapped: true } : c), mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
ns = dlog(ns, `${card.name} taps all lands and drains mana pool.`, "effect");
break;
}
case "tapTarget": {
if (tgtC) ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, tapped: true } : c) } };
ns = dlog(ns, `${card.name} taps ${tgtC?.name || "target"}.`, "effect");
break;
}
case "mill2": {
for (let i = 0; i < 2; i++) {
if (!ns[opp].lib.length) break;
const [top, ...rest] = ns[opp].lib;
ns = { ...ns, [opp]: { ...ns[opp], lib: rest, gy: [...ns[opp].gy, top] } };
}
ns = dlog(ns, `${card.name} mills 2 cards.`, "effect");
break;
}
case "sacrificeForMana": {
const cres = ns[caster].bf.filter(isCre);
if (cres.length) {
const sac = cres[0];
ns = zMove(ns, sac.iid, caster, caster, "gy");
const mp3 = { ...ns[caster].mana }; mp3.C = (mp3.C || 0) + 2;
ns = { ...ns, [caster]: { ...ns[caster], mana: mp3 } };
ns = dlog(ns, `${sac.name} sacrificed for CC.`, "mana");
}
break;
}
case "untapLand": {
const tland = tgtC || ns[caster].bf.filter(isLand)[0];
if (tland) ns = { ...ns, [tland.controller]: { ...ns[tland.controller], bf: ns[tland.controller].bf.map(c => c.iid === tland.iid ? { ...c, tapped: false } : c) } };
break;
}
case "untapSelf": {
const self = tgtC || ns[caster].bf.find(c => c.id === card.id);
if (self) ns = { ...ns, [self.controller]: { ...ns[self.controller], bf: ns[self.controller].bf.map(c => c.iid === self.iid ? { ...c, tapped: false } : c) } };
break;
}
case "berserk": {
if (!tgtC) {
ns = dlog(ns, `Berserk fizzled — no valid target.`, "effect");
break;
}
const pow = getPow(tgtC, ns);
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, power: (c.power||0)+pow, keywords: [...(c.keywords||[]),KEYWORDS.TRAMPLE.id], berserked: true } : c) } };
ns = dlog(ns, `Berserk doubles ${tgtC.name}'s power.`, "effect");
break;
}
case "forkSpell": {
const top = ns.stack[ns.stack.length - 2];
if (top && top.card.effect !== "forkSpell") { ns = resolveEff(ns, { ...top, id: makeId(), caster }); ns = dlog(ns, `Fork copies ${top.card.name}.`, "effect"); }
break;
}
case "channel": {
  ns = { ...ns, [caster]: { ...ns[caster], channelActive: true }};
  ns = dlog(ns, `${card.name}: ${caster} may pay life for colorless mana this turn.`, "effect");
  break;
}
case "stealCreature": {
  if (tgtC) {
    const origCtrl = tgtC.controller;
    ns = { ...ns, [origCtrl]: { ...ns[origCtrl], bf: ns[origCtrl].bf.filter(c => c.iid !== tgtC.iid) }};
    const stolen = { ...tgtC, controller: caster, summoningSick: true, tapped: false, attacking: false, blocking: null };
    ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, stolen] }};
    ns = dlog(ns, `${card.name} takes control of ${tgtC.name}.`, "effect");
  }
  break;
}
case "copyPermanentCharacteristics": {
  // Layer 1: Copy Artifact. Copies printed (copiable) values from the target artifact's
  // CARD_DB entry -- not the live battlefield object, which may carry counters/auras.
  if (!tgtC || !isArt(tgtC)) break; // no legal artifact target; Copy Artifact stays inert
  const staticDef = CARD_DB.find(c => c.id === tgtC.id);
  if (!staticDef) throw new Error(`copyPermanentCharacteristics: no CARD_DB entry for id="${tgtC.id}"`);
  const baseType = staticDef.type ?? '';
  const newType = baseType.includes('Enchantment') ? baseType : (baseType ? baseType + ' Enchantment' : 'Enchantment');
  const newPerm = {
    name: staticDef.name, cost: staticDef.cost, cmc: staticDef.cmc, color: staticDef.color,
    type: newType, subtype: staticDef.subtype, power: staticDef.power, toughness: staticDef.toughness,
    text: staticDef.text, keywords: [...(staticDef.keywords ?? [])], effect: staticDef.effect,
    rarity: staticDef.rarity, id: staticDef.id, layerDef: staticDef.layerDef,
    activated: staticDef.activated, upkeep: staticDef.upkeep, mod: staticDef.mod,
    iid: card.iid, controller: caster, enterTs: ns.layerClock ?? 0,
    tapped: false, summoningSick: true, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], tokens: [], exerted: false,
  };
  // Push newPerm directly to bf -- RESOLVE_STACK's alreadyOnBf guard will skip adding pArr.
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, newPerm] } };
  ns = dlog(ns, `${card.name} enters as a copy of ${staticDef.name}.`, 'effect');
  break;
}
case "aladdinsSteal": {
  // Layer 2: Aladdin activated ability. Control change conditional on Aladdin staying in play.
  // Guardian Beast prevents control of noncreature artifacts.
  if (tgtC && isArt(tgtC) && !isCre(tgtC) && ns[tgtC.controller].bf.some(c => c.id === 'guardian_beast' && !c.tapped)) {
    ns = dlog(ns, `Guardian Beast prevents ${card.name} from stealing ${tgtC.name}.`, 'effect');
    break;
  }
  if (!tgtC || !isArt(tgtC)) break;
  const alOrigCtrl = tgtC.controller;
  ns = { ...ns, [alOrigCtrl]: { ...ns[alOrigCtrl], bf: ns[alOrigCtrl].bf.filter(c => c.iid !== tgtC.iid) } };
  const alStolen = { ...tgtC, controller: caster, summoningSick: true, tapped: false, attacking: false, blocking: null,
    controlGrant: { grantorIid: card.iid, grantorController: alOrigCtrl, condition: 'whileGrantorControlled' } };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, alStolen] } };
  ns = dlog(ns, `${card.name} takes control of ${tgtC.name}.`, 'effect');
  break;
}
case "oldManSteal": {
  // Layer 2: Old Man of the Sea activated ability. Control conditional on Old Man staying tapped
  // and stolen creature's power remaining <= Old Man's power at activation time.
  if (!tgtC || !isCre(tgtC)) break;
  const oldMan = ns[caster].bf.find(c => c.iid === card.iid);
  if (!oldMan) break;
  const oldManPow = getPow(oldMan, ns);
  if (getPow(tgtC, ns) > oldManPow) {
    ns = dlog(ns, `${card.name}: ${tgtC.name} has too much power — fizzles.`, 'effect');
    break;
  }
  const omOrigCtrl = tgtC.controller;
  ns = { ...ns, [omOrigCtrl]: { ...ns[omOrigCtrl], bf: ns[omOrigCtrl].bf.filter(c => c.iid !== tgtC.iid) } };
  const omStolen = { ...tgtC, controller: caster, summoningSick: true, tapped: false, attacking: false, blocking: null,
    controlGrant: { grantorIid: card.iid, grantorController: omOrigCtrl, condition: 'whileTappedAndPowerLte', maxPower: oldManPow } };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, omStolen] } };
  ns = dlog(ns, `${card.name} takes control of ${tgtC.name}.`, 'effect');
  break;
}
case "textSwapColor": {
  // Layer 3: Sleight of Mind. Baked-in field mutation so direct .color reads in the engine
  // and AI see the substituted value immediately.
  if (!tgtC) break;
  const fromColor = item.fromColor;
  const toColor = item.toColor;
  if (!fromColor || !toColor) { ns = dlog(ns, `${card.name}: no color substitution specified.`, 'info'); break; }
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, color: c.color === fromColor ? toColor : c.color,
          textSwap: { type: 'color', from: fromColor, to: toColor, enterTs: ns.layerClock ?? 0 } }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${fromColor} -> ${toColor} on ${tgtC.name}.`, 'effect');
  break;
}
case "textSwapLandtype": {
  // Layer 3: Magical Hack. Baked-in keyword swap so hasKw / AI reads the substituted value.
  if (!tgtC) break;
  const fromKw = item.fromKw;
  const toKw = item.toKw;
  if (!fromKw || !toKw) { ns = dlog(ns, `${card.name}: no land-type substitution specified.`, 'info'); break; }
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid
      ? { ...c, keywords: (c.keywords ?? []).map(kw => kw === fromKw ? toKw : kw),
          textSwap: { type: 'landtype', from: fromKw, to: toKw, enterTs: ns.layerClock ?? 0 } }
      : c
  ) } };
  ns = dlog(ns, `${card.name}: ${fromKw} -> ${toKw} on ${tgtC.name}.`, 'effect');
  break;
}
case "addCounterSelf": {
  const selfCard = tgtC || ns[caster].bf.find(c => c.iid === card.iid);
  if (selfCard) {
    ns = { ...ns, [selfCard.controller]: { ...ns[selfCard.controller], bf: ns[selfCard.controller].bf.map(c =>
      c.iid === selfCard.iid ? { ...c, counters: { ...c.counters, P1P1: (c.counters.P1P1 || 0) + 1 } } : c
    )}};
    ns = dlog(ns, `${card.name} adds a +1/+1 counter.`, "effect");
  }
  break;
}
case "drainLife": {
if (tgtC) {
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage+xVal } : c) } };
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
ns = { ...ns, [who3]: { ...ns[who3], lib: shuffle([...ns[who3].lib, ...ns[who3].gy]), gy: [] } };
ns = dlog(ns, `${card.name} shuffles graveyard into library.`, "effect");
break;
}
case "bazaarActivate": {
ns = drawD(ns, caster, 2);
for (let i = 0; i < 3; i++) { if (!ns[caster].hand.length) break; const disc = ns[caster].hand[ns[caster].hand.length-1]; ns = { ...ns, [caster]: { ...ns[caster], hand: ns[caster].hand.slice(0,-1), gy: [...ns[caster].gy, disc] } }; }
ns = dlog(ns, "Bazaar: drew 2, discarded 3.", "draw");
break;
}
case "counterBlack": {
const topB = ns.stack[ns.stack.length - 2];
if (topB && topB.card.color === "B") { ns = { ...ns, stack: ns.stack.filter(i => i.id !== topB.id), [topB.caster]: { ...ns[topB.caster], gy: [...ns[topB.caster].gy, { ...topB.card }] } }; ns = dlog(ns, `${card.name} counters ${topB.card.name}.`, "effect"); }
break;
}
case "counterGreen": {
const topG = ns.stack[ns.stack.length - 2];
if (topG && topG.card.color === "G") { ns = { ...ns, stack: ns.stack.filter(i => i.id !== topG.id), [topG.caster]: { ...ns[topG.caster], gy: [...ns[topG.caster].gy, { ...topG.card }] } }; ns = dlog(ns, `${card.name} counters ${topG.card.name}.`, "effect"); }
break;
}
case "counterWhite": {
const topW = ns.stack[ns.stack.length - 2];
if (topW && topW.card.color === "W") { ns = { ...ns, stack: ns.stack.filter(i => i.id !== topW.id), [topW.caster]: { ...ns[topW.caster], gy: [...ns[topW.caster].gy, { ...topW.card }] } }; ns = dlog(ns, `${card.name} counters ${topW.card.name}.`, "effect"); }
break;
}
case "returnArtifacts": {
const raTgt = tgt === "p" || tgt === "o" ? tgt : opp;
const raArts = [...ns[raTgt].bf.filter(isArt)];
for (const ra of raArts) ns = zMove(ns, ra.iid, raTgt, raTgt, "hand");
ns = dlog(ns, `${card.name} returns all artifacts to ${raTgt}'s hand.`, "effect");
break;
}
case "setPT02": {
if (tgtC && tgtC.iid !== card.iid) {
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
  c.iid === tgtC.iid
    ? { ...c, eotBuffs: [...(c.eotBuffs || []), { layerDef: { layer: "7b", setPower: 0, setToughness: 2 } }] }
    : c
) } };
ns = dlog(ns, `${tgtC.name} becomes 0/2 until end of turn.`, "effect");
}
break;
}
case "forceAttack": {
if (tgtC && !hasKw(tgtC, KEYWORDS.DEFENDER.id)) {
const faCtrl = tgtC.controller;
ns = { ...ns, [faCtrl]: { ...ns[faCtrl], bf: ns[faCtrl].bf.map(c => c.iid === tgtC.iid ? { ...c, mustAttack: true } : c) } };
ns = dlog(ns, `${tgtC.name} must attack this turn.`, "effect");
}
break;
}
case "triskelionPing": {
  const tri = ns[caster].bf.find(c => c.iid === card.iid);
  if (tri && (tri.counters?.P1P1 || 0) > 0) {
    ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
      c.iid === card.iid
        ? { ...c, counters: { ...c.counters, P1P1: (c.counters.P1P1 || 0) - 1 } }
        : c
    ) } };
    if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
    else if (tgtC) {
      ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
        c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c
      ) } };
      ns = checkDeath(ns);
    }
    ns = dlog(ns, `${card.name} removes a counter and deals 1 damage.`, "effect");
  }
  break;
}
// --- GROUP A NEW EFFECTS (Batch 2) -------------------------------------------
case "disintegrate": {
  if (tgt === "p" || tgt === "o") {
    ns = hurt(ns, tgt, xVal, card.name);
  } else if (tgtC) {
    ns = { ...ns, exileNextDeath: true,
      [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
        c.iid === tgtC.iid ? { ...c, damage: c.damage + xVal } : c
      )}
    };
    ns = checkDeath(ns);
    ns = { ...ns, exileNextDeath: false };
  }
  ns = dlog(ns, `${card.name} deals ${xVal} damage${tgtC ? ` to ${tgtC.name}` : ""}.`, "damage");
  break;
}
case "globalPump":
case "lordEffect": {
  // Continuous effect -- applied via getPow/getTou/hasKw lord layer at read time.
  // No state mutation here.
  ns = dlog(ns, `${card.name} is a continuous lord (${card.targets}).`, "effect");
  break;
}
case "stub": console.warn(`STUB: ${card.name} not yet implemented`); ns = dlog(ns, `${card.name} resolves (effect pending).`, "effect"); break;
// --- BATCH: SIMPLE-TIER STUB CARDS (Forge reference batch, GPL-3.0) ----------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "tapTargetWall": {
  // Adapted from Card-Forge/forge (a/ali_baba.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && tgtC.subtype?.includes('Wall')) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, tapped: true } : c) } };
    ns = dlog(ns, `${card.name} taps ${tgtC.name}.`, "effect");
  } else {
    ns = dlog(ns, `${card.name}'s ability fizzles -- no legal Wall target.`, "effect");
  }
  break;
}
case "discardAllNonland": {
  // Adapted from Card-Forge/forge (a/amnesia.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const dWho = tgt === 'p' || tgt === 'o' ? tgt : opp;
  const nonland = ns[dWho].hand.filter(c => !isLand(c));
  const landCards = ns[dWho].hand.filter(isLand);
  ns = { ...ns, [dWho]: { ...ns[dWho], hand: landCards, gy: [...ns[dWho].gy, ...nonland] } };
  ns = dlog(ns, `${card.name}: ${dWho} reveals hand and discards ${nonland.length} nonland card(s).`, "effect");
  break;
}
case "returnArtifactFromGYToHand": {
  // Adapted from Card-Forge/forge (a/argivian_archaeologist.txt, r/reconstruction.txt), GPL-3.0.
  // See THIRD_PARTY_NOTICES.md.
  const gyArt = tgt ? ns[caster].gy.find(c => c.iid === tgt && isArt(c)) : ns[caster].gy.filter(isArt).slice(-1)[0];
  if (gyArt) {
    ns = zMove(ns, gyArt.iid, caster, caster, "hand");
    ns = dlog(ns, `${card.name} returns ${gyArt.name} to hand.`, "effect");
  } else {
    ns = dlog(ns, `${card.name}'s ability fizzles -- no artifact card in graveyard.`, "effect");
  }
  break;
}
case "preventDamage2ArtifactCreature": {
  // Adapted from Card-Forge/forge (a/argivian_blacksmith.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isArt(tgtC) && isCre(tgtC)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + 2 } : c
    ) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} has 2 damage prevented this turn.`, "effect");
  }
  break;
}
case "pumpAttackersPower2EOT": {
  // Adapted from Card-Forge/forge (a/army_of_allah.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
      (ns.attackers || []).includes(c.iid) ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 2 }] } : c
    ) } };
  }
  ns = dlog(ns, `${card.name}: attacking creatures get +2/+0 until end of turn.`, "effect");
  break;
}
case "counterArtifact": {
  // Adapted from Card-Forge/forge (a/artifact_blast.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const artTop = findStackTarget(ns.stack, tgt, item.id);
  if (!artTop) { ns = dlog(ns, `${card.name} fizzles -- no target on stack.`, "effect"); break; }
  if (!isArt(artTop.card)) { ns = dlog(ns, `${card.name} fizzles -- target is not an artifact spell.`, "effect"); break; }
  ns = { ...ns, stack: ns.stack.filter(i => i.id !== artTop.id),
    [artTop.caster]: { ...ns[artTop.caster], gy: [...ns[artTop.caster].gy, { ...artTop.card }] } };
  ns = dlog(ns, `${card.name} counters ${artTop.card?.name}.`, "effect");
  break;
}
case "addMana3Red": {
  // Adapted from Card-Forge/forge (c/coal_golem.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const cgMp = { ...ns[caster].mana }; cgMp.R = (cgMp.R || 0) + 3;
  ns = { ...ns, [caster]: { ...ns[caster], mana: cgMp } };
  ns = dlog(ns, `${card.name} adds {R}{R}{R}.`, "mana");
  break;
}
case "preventDamage2Self": {
  // Adapted from Card-Forge/forge (c/conservator.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  ns = { ...ns, [caster]: { ...ns[caster], damageShield: (ns[caster].damageShield || 0) + 2 } };
  ns = dlog(ns, `${card.name}: ${caster} has 2 damage prevented this turn.`, "effect");
  break;
}
case "colorLace": {
  // Adapted from Card-Forge/forge (c/chaoslace.txt, d/deathlace.txt, l/lifelace.txt,
  // p/purelace.txt, t/thoughtlace.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const laceTo = card.laceColor;
  if (!laceTo) break;
  const permTarget = tgt ? (ns.p.bf.find(c => c.iid === tgt) || ns.o.bf.find(c => c.iid === tgt)) : null;
  if (permTarget) {
    ns = { ...ns, [permTarget.controller]: { ...ns[permTarget.controller], bf: ns[permTarget.controller].bf.map(c =>
      c.iid === permTarget.iid ? { ...c, color: laceTo } : c
    ) } };
    ns = dlog(ns, `${card.name}: ${permTarget.name} becomes ${laceTo}.`, "effect");
    break;
  }
  const laceStackTarget = tgt ? ns.stack.find(i => i.id === tgt) : null;
  if (laceStackTarget) {
    ns = { ...ns, stack: ns.stack.map(i => i.id === laceStackTarget.id ? { ...i, card: { ...i.card, color: laceTo } } : i) };
    ns = dlog(ns, `${card.name}: ${laceStackTarget.card?.name} becomes ${laceTo}.`, "effect");
    break;
  }
  ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
  break;
}
case "destroyBlackCreature": {
  // Adapted from Card-Forge/forge (e/exorcist.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && tgtC.color === "B") { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
  break;
}
case "shuffleGYIntoLibrary": {
  // Adapted from Card-Forge/forge (f/feldons_cane.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const gyCards = ns[caster].gy;
  ns = { ...ns, [caster]: { ...ns[caster], gy: [], lib: shuffle([...ns[caster].lib, ...gyCards]) } };
  ns = dlog(ns, `${card.name}: ${caster} shuffles their graveyard into their library.`, "effect");
  break;
}
case "addManaReflected": {
  // Adapted from Card-Forge/forge (f/fellwar_stone.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no color-choice UI wired for reflected mana; deterministic
  // first color in WUBRG order rather than a player-facing picker.
  const reflectColors = new Set();
  for (const l of ns[opp].bf.filter(isLand)) for (const p of (l.produces || [])) if ("WUBRG".includes(p)) reflectColors.add(p);
  const reflectPick = ["W", "U", "B", "R", "G"].find(cl => reflectColors.has(cl)) || "C";
  const fwMp = { ...ns[caster].mana }; fwMp[reflectPick] = (fwMp[reflectPick] || 0) + 1;
  ns = { ...ns, [caster]: { ...ns[caster], mana: fwMp } };
  ns = dlog(ns, `${card.name} adds 1${reflectPick} (reflected).`, "mana");
  break;
}
case "revealHand": {
  // Adapted from Card-Forge/forge (g/glasses_of_urza.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const revWho = tgt === 'p' || tgt === 'o' ? tgt : opp;
  const names = ns[revWho].hand.map(c => c.name).join(', ') || '(empty hand)';
  ns = dlog(ns, `${card.name}: ${revWho}'s hand is ${names}.`, "effect");
  break;
}
case "damage1Flying": {
  // Adapted from Card-Forge/forge (g/grapeshot_catapult.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c) } };
    ns = checkDeath(ns);
    ns = dlog(ns, `${card.name} deals 1 damage to ${tgtC.name}.`, "effect");
  }
  break;
}
case "tapOrUntapArtifact": {
  // Adapted from Card-Forge/forge (h/hyperion_blacksmith.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isArt(tgtC) && tgtC.controller !== caster) {
    const wasTapped = tgtC.tapped;
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, tapped: !c.tapped } : c) } };
    ns = dlog(ns, `${card.name} ${wasTapped ? 'untaps' : 'taps'} ${tgtC.name}.`, "effect");
  }
  break;
}
case "globalDebuffPower2EOT": {
  // Adapted from Card-Forge/forge (m/marsh_gas.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => isCre(c) ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: -2 }] } : c) } };
  }
  ns = dlog(ns, `${card.name}: all creatures get -2/-0 until end of turn.`, "effect");
  break;
}
case "destroyAuraOnOwnCreature": {
  // Adapted from Card-Forge/forge (m/miracle_worker.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  let mwFound = false;
  for (const c of ns[caster].bf.filter(isCre)) {
    const aura = (c.enchantments || []).find(e => e.iid === tgt);
    if (aura) {
      const auraOwner = aura.controller || caster;
      ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(x => x.iid === c.iid ? { ...x, enchantments: x.enchantments.filter(e => e.iid !== tgt) } : x) } };
      ns = { ...ns, [auraOwner]: { ...ns[auraOwner], gy: [...ns[auraOwner].gy, { ...aura.cardData }] } };
      ns = dlog(ns, `${card.name} destroys ${aura.name}.`, "effect");
      mwFound = true;
      break;
    }
  }
  if (!mwFound) ns = dlog(ns, `${card.name}'s ability fizzles -- no valid Aura target.`, "effect");
  break;
}
case "scryTop3Reveal": {
  // Adapted from Card-Forge/forge (n/natural_selection.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no reorder UI. Cards are revealed in the log then left in their
  // original order (a legal choice of "any order"); no shuffle offered (also legal --
  // "you may" -- since declining is always an option). True reorder/shuffle-choice UI
  // deferred to a future batch.
  const nsWho = tgt === 'p' || tgt === 'o' ? tgt : opp;
  const top3 = ns[nsWho].lib.slice(0, 3);
  const top3Names = top3.map(c => c.name).join(', ') || '(empty library)';
  ns = dlog(ns, `${card.name}: top of ${nsWho}'s library is ${top3Names} (order unchanged).`, "effect");
  break;
}
case "bouncePermanentControlled": {
  // Adapted from Card-Forge/forge (o/obelisk_of_undoing.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: this engine doesn't track permanent "owner" separately from
  // "controller" (no Control Magic-style theft persists across ownership), so
  // "you both own and control" is modeled as "a permanent you control."
  if (tgtC && tgtC.controller === caster) {
    ns = zMove(ns, tgtC.iid, caster, caster, "hand");
    ns = dlog(ns, `${card.name} returns ${tgtC.name} to hand.`, "effect");
  } else {
    ns = dlog(ns, `${card.name}'s ability fizzles -- no legal target.`, "effect");
  }
  break;
}
case "damage2Any": {
  // Adapted from Card-Forge/forge (o/orcish_mechanics.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgt === "p" || tgt === "o") { ns = hurt(ns, tgt, 2, card.name); }
  else if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 2 } : c) } };
    ns = checkDeath(ns);
  }
  ns = dlog(ns, `${card.name} deals 2 damage${tgtC ? ` to ${tgtC.name}` : (tgt ? ` to ${tgt}` : '')}.`, "effect");
  break;
}
case "pumpBlockersToughness3EOT": {
  // Adapted from Card-Forge/forge (p/piety.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.blocking != null ? { ...c, eotBuffs: [...(c.eotBuffs || []), { toughness: 3 }] } : c) } };
  }
  ns = dlog(ns, `${card.name}: blocking creatures get +0/+3 until end of turn.`, "effect");
  break;
}
case "debuffTargetPower2EOT": {
  // Adapted from Card-Forge/forge (p/pradesh_gypsies.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: -2 }] } : c
    ) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} gets -2/-0 until end of turn.`, "effect");
  }
  break;
}
case "untapAllOwnLands": {
  // Adapted from Card-Forge/forge (r/reset.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c => isLand(c) ? { ...c, tapped: false } : c) } };
  ns = dlog(ns, `${card.name}: ${caster} untaps all lands.`, "effect");
  break;
}
case "tapAllBlueCreatures": {
  // Adapted from Card-Forge/forge (r/riptide.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => (isCre(c) && c.color === 'U') ? { ...c, tapped: true } : c) } };
  }
  ns = dlog(ns, `${card.name}: all blue creatures tapped.`, "effect");
  break;
}
case "setAttackerPower0EOT": {
  // Adapted from Card-Forge/forge (s/singing_tree.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && (ns.attackers || []).includes(tgtC.iid)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { layerDef: { layer: '7b', setPower: 0 } }] } : c
    ) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} has base power 0 until end of turn.`, "effect");
  } else {
    ns = dlog(ns, `${card.name}'s ability fizzles -- target is not attacking.`, "effect");
  }
  break;
}
case "fetchBasicToBf": {
  // Adapted from Card-Forge/forge (u/untamed_wilds.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const basic = ns[caster].lib.find(c => isLand(c) && c.subtype?.startsWith("Basic"));
  if (basic) {
    ns = zMove(ns, basic.iid, caster, caster, "bf");
    ns = { ...ns, [caster]: { ...ns[caster], lib: shuffle(ns[caster].lib) } };
    ns = dlog(ns, `${card.name}: ${caster} fetches ${basic.name} onto the battlefield.`, "effect");
  } else {
    ns = { ...ns, [caster]: { ...ns[caster], lib: shuffle(ns[caster].lib) } };
    ns = dlog(ns, `${card.name}: no basic land found; library shuffled.`, "effect");
  }
  break;
}
// --- END BATCH: SIMPLE-TIER STUB CARDS ---------------------------------------
// --- BEGIN BATCH: MODERATE-TIER STUB CARDS (M1 -- activated abilities/spells) --
case "counterAndArtifactType": {
  // Adapted from Card-Forge/forge (a/ashnods_transmogrant.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && !isArt(tgtC)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid
      ? { ...c, counters: { ...c.counters, P1P1: (c.counters?.P1P1 || 0) + 1 }, type: c.type.includes('Artifact') ? c.type : `Artifact ${c.type}` }
      : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} gets a +1/+1 counter and becomes an artifact.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no legal nonartifact creature target.`, "effect");
  }
  break;
}
case "skipNextUntap": {
  // Adapted from Card-Forge/forge (b/barls_cage.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, skipNextUntap: true } : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} won't untap during its controller's next untap step.`, "effect");
  }
  break;
}
case "damage1AnySelf1": {
  // Adapted from Card-Forge/forge (b/brothers_of_fire.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name);
  else if (tgtC) { ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c) } }; ns = checkDeath(ns); }
  ns = hurt(ns, caster, 1, card.name);
  break;
}
case "untapXLands": {
  // Adapted from Card-Forge/forge (c/candelabra_of_tawnos.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no multi-target picker UI for X targets; auto-fills any
  // remaining slots with the activating player's own tapped lands.
  const explicitLands = (item.targets || []).filter(id => isLand(getBF(ns, id) || {}));
  const autoLands = ns[caster].bf.filter(c => isLand(c) && c.tapped && !explicitLands.includes(c.iid)).slice(0, Math.max(0, xVal - explicitLands.length)).map(c => c.iid);
  const toUntap = [...explicitLands, ...autoLands].slice(0, xVal);
  for (const lid of toUntap) {
    const owner = ns.p.bf.some(c => c.iid === lid) ? 'p' : 'o';
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === lid ? { ...c, tapped: false } : c) } };
  }
  ns = dlog(ns, `${card.name} untaps ${toUntap.length} land(s).`, "effect");
  break;
}
case "destroyArtifactGainCMC": {
  // Adapted from Card-Forge/forge (d/divine_offering.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isArt(tgtC)) {
    if (hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)) { ns = dlog(ns, `${tgtC.name} is indestructible.`, 'effect'); break; }
    const cmcGain = tgtC.cmc || 0;
    ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy");
    ns = hurt(ns, caster, -cmcGain, card.name);
    ns = dlog(ns, `${card.name} destroys ${tgtC.name}; ${caster} gains ${cmcGain} life.`, "effect");
  }
  break;
}
case "restoreArtifactsFromGYToLibrary": {
  // Adapted from Card-Forge/forge (d/drafnas_restoration.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no multi-select/reorder UI for "any number ... in any order";
  // returns all of the target player's artifact cards from their graveyard to the
  // top of their library, in their existing graveyard order.
  const explicitGYCard = tgt ? (ns.p.gy.find(c => c.iid === tgt) || ns.o.gy.find(c => c.iid === tgt)) : null;
  const drWho = tgt === 'p' || tgt === 'o' ? tgt
              : explicitGYCard ? (ns.p.gy.some(c => c.iid === tgt) ? 'p' : 'o')
              : opp;
  const arts = ns[drWho].gy.filter(isArt);
  if (arts.length) {
    ns = { ...ns, [drWho]: { ...ns[drWho], gy: ns[drWho].gy.filter(c => !isArt(c)), lib: [...arts, ...ns[drWho].lib] } };
    ns = dlog(ns, `${card.name}: ${arts.length} artifact card(s) go to the top of ${drWho}'s library.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no artifact cards in ${drWho}'s graveyard.`, "effect");
  }
  break;
}
case "tapNonFlyingTarget": {
  // Adapted from Card-Forge/forge (f/flood.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && !hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, tapped: true } : c) } };
    ns = dlog(ns, `${card.name} taps ${tgtC.name}.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target has flying or is not a creature.`, "effect");
  }
  break;
}
case "pumpToughnessByTargetCMC": {
  // Adapted from Card-Forge/forge (g/great_defender.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC) {
    const cmcBonus = tgtC.cmc || 0;
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { toughness: cmcBonus }] } : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} gets +0/+${cmcBonus} until end of turn.`, "effect");
  }
  break;
}
case "cantRegenTarget": {
  // Adapted from Card-Forge/forge (h/hurr_jackal.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, cantRegenerateThisTurn: true } : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} can't be regenerated this turn.`, "effect");
  }
  break;
}
case "damageByWhiteCardsInHand": {
  // Adapted from Card-Forge/forge (i/inquisition.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const revWho2 = tgt === 'p' || tgt === 'o' ? tgt : opp;
  const whiteCount = ns[revWho2].hand.filter(c => c.color === 'W').length;
  const names2 = ns[revWho2].hand.map(c => c.name).join(', ') || '(empty hand)';
  ns = dlog(ns, `${card.name}: ${revWho2} reveals hand (${names2}).`, "effect");
  if (whiteCount > 0) ns = hurt(ns, revWho2, whiteCount, card.name);
  break;
}
case "drawThenDiscardOwn": {
  // Adapted from Card-Forge/forge (j/jalum_tome.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no UI to choose which card to discard; discards the most
  // recently drawn card (same convention as forced cleanup discards).
  ns = drawD(ns, caster, 1);
  if (ns[caster].hand.length) {
    const disc2 = ns[caster].hand[ns[caster].hand.length - 1];
    ns = { ...ns, [caster]: { ...ns[caster], hand: ns[caster].hand.slice(0, -1), gy: [...ns[caster].gy, disc2] } };
    ns = dlog(ns, `${card.name}: ${caster} discards ${disc2.name}.`, "effect");
  }
  break;
}
case "gainLifeSacrificedToughness": {
  // Adapted from Card-Forge/forge (l/life_chisel.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const tou2 = item.sacrificedCard?.toughness || 0;
  if (tou2 > 0) ns = hurt(ns, caster, -tou2, card.name);
  ns = dlog(ns, `${card.name}: ${caster} gains ${tou2} life.`, "effect");
  break;
}
case "addBBySacrificedCmc": {
  // Adapted from Card-Forge/forge (p/priest_of_yawgmoth.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const cmcAmt = item.sacrificedCard?.cmc || 0;
  if (cmcAmt > 0) {
    const mp4 = { ...ns[caster].mana }; mp4.B = (mp4.B || 0) + cmcAmt;
    ns = { ...ns, [caster]: { ...ns[caster], mana: mp4 } };
  }
  ns = dlog(ns, `${card.name} adds ${cmcAmt}B.`, "mana");
  break;
}
case "preventDamage1AnyReturnEnd": {
  // Adapted from Card-Forge/forge (r/rakalite.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgt === 'p' || tgt === 'o') {
    ns = { ...ns, [tgt]: { ...ns[tgt], damageShield: (ns[tgt].damageShield || 0) + 1 } };
  } else if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + 1 } : c) } };
  }
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c => c.iid === card.iid ? { ...c, returnToHandNextEnd: true } : c) } };
  ns = dlog(ns, `${card.name}: prevents 1 damage; returns to hand at the next end step.`, "effect");
  break;
}
case "gainAndDealDamageThisTurn": {
  // Adapted from Card-Forge/forge (s/simulacrum.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const dmgAmt = ns.turnState.damageTakenThisTurn?.[caster] || 0;
  ns = hurt(ns, caster, -dmgAmt, card.name);
  if (tgtC && tgtC.controller === caster && dmgAmt > 0) {
    ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + dmgAmt } : c) } };
    ns = checkDeath(ns);
  }
  ns = dlog(ns, `${card.name}: ${caster} gains ${dmgAmt} life; deals ${dmgAmt} to ${tgtC?.name || 'target'}.`, "effect");
  break;
}
case "drawRevealDiscardIfNonland": {
  // Adapted from Card-Forge/forge (s/sindbad.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const beforeLen = ns[caster].hand.length;
  ns = drawD(ns, caster, 1);
  if (ns[caster].hand.length > beforeLen) {
    const drawn = ns[caster].hand[ns[caster].hand.length - 1];
    ns = dlog(ns, `${card.name}: ${caster} reveals ${drawn.name}.`, "effect");
    if (!isLand(drawn)) {
      ns = { ...ns, [caster]: { ...ns[caster], hand: ns[caster].hand.slice(0, -1), gy: [...ns[caster].gy, drawn] } };
      ns = dlog(ns, `${card.name}: ${drawn.name} isn't a land -- discarded.`, "effect");
    }
  }
  break;
}
case "unblockableTargetPowerLE2": {
  // Adapted from Card-Forge/forge (t/tawnoss_wand.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && getPow(tgtC, ns) <= 2) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { unblockable: true }] } : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} can't be blocked this turn.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target has power greater than 2.`, "effect");
  }
  break;
}
case "scryTop5Reveal": {
  // Adapted from Card-Forge/forge (v/visions.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no shuffle-choice UI (same convention as scryTop3Reveal /
  // Natural Selection); "you may shuffle" defaults to declining, which is always
  // a legal choice.
  const nsWho2 = tgt === 'p' || tgt === 'o' ? tgt : opp;
  const top5 = ns[nsWho2].lib.slice(0, 5);
  const top5Names = top5.map(c => c.name).join(', ') || '(empty library)';
  ns = dlog(ns, `${card.name}: top of ${nsWho2}'s library is ${top5Names} (order unchanged).`, "effect");
  break;
}
case "tapXCreatures": {
  // Adapted from Card-Forge/forge (w/word_of_binding.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no multi-target picker UI for X targets; auto-fills any
  // remaining slots with untapped creatures, preferring the opponent's.
  const explicitCres = (item.targets || []).filter(id => { const c = getBF(ns, id); return c && isCre(c) && !c.tapped; });
  const pool = [...ns[opp].bf, ...ns[caster].bf].filter(c => isCre(c) && !c.tapped && !explicitCres.includes(c.iid));
  const autoCres = pool.slice(0, Math.max(0, xVal - explicitCres.length)).map(c => c.iid);
  const toTap = [...explicitCres, ...autoCres].slice(0, xVal);
  for (const cid of toTap) {
    const owner2 = ns.p.bf.some(c => c.iid === cid) ? 'p' : 'o';
    ns = { ...ns, [owner2]: { ...ns[owner2], bf: ns[owner2].bf.map(c => c.iid === cid ? { ...c, tapped: true } : c) } };
  }
  ns = dlog(ns, `${card.name} taps ${toTap.length} creature(s).`, "effect");
  break;
}
case "animateArtifactUntilEnd": {
  // Adapted from Card-Forge/forge (x/xenic_poltergeist.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: "until your next upkeep" approximated as "until the end of
  // this turn" -- no delayed-duration infrastructure spans an opponent's turn
  // boundary. layers.js's type-changing layer isn't consulted by isCre/checkDeath/
  // combat eligibility (those read card.type directly), so the change must be a
  // direct, revertible field mutation rather than a layer-4 effect.
  if (tgtC && isArt(tgtC) && !isCre(tgtC)) {
    const amt2 = tgtC.cmc || 0;
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid
      ? { ...c, type: c.type.includes('Creature') ? c.type : `${c.type} Creature`, power: amt2, toughness: amt2,
          revertAnimateAtEnd: { type: c.type, power: c.power, toughness: c.toughness } }
      : c) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} becomes a ${amt2}/${amt2} artifact creature until end of turn.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target is not a noncreature artifact.`, "effect");
  }
  break;
}
// --- END BATCH: MODERATE-TIER STUB CARDS (M1) --------------------------------
// --- BEGIN BATCH: MODERATE-TIER STUB CARDS (M2 -- keyword-line cards) --------
case "damage1AttackerOrBlocker": {
  // Adapted from Card-Forge/forge (c/crimson_manticore.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && isCre(tgtC) && (tgtC.attacking || tgtC.blocking)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, damage: c.damage + 1 } : c) } };
    ns = checkDeath(ns);
    ns = dlog(ns, `${card.name} deals 1 damage to ${tgtC.name}.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target is not attacking or blocking.`, "effect");
  }
  break;
}
case "pumpSelf21EOT": {
  // Adapted from Card-Forge/forge (f/fallen_angel.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c => c.iid === card.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 2, toughness: 1 }] } : c) } };
  ns = dlog(ns, `${card.name} gets +2/+1 until end of turn.`, "effect");
  break;
}
// --- END BATCH: MODERATE-TIER STUB CARDS (M2) --------------------------------
default:      ns = dlog(ns, `${card.name} resolves.`, "effect");
}
return ns;
}

// --- COMBAT RESOLUTION -------------------------------------------------------

export function resolveCombat(s) {
let ns = s;
if (!ns.attackers.length) return ns;

if (ns.fogActive) {
ns = dlog(ns, "Fog prevents all combat damage!", "effect");
ns = { ...ns, attackers:[], blockers:{}, fogActive:false };
for (const w of ["p","o"]) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => ({ ...c, attacking:false, blocking:null })) } };
return ns;
}

ns = dlog(ns, "First strike damage.", "combat");

const isGaseous = c => c.enchantments?.some(e => e.mod?.gaseousForm);
// Spirit Link: returns 1 when host has a Spirit Link aura (caller multiplies by damage dealt).
const spiritLinkGain = (c) => (c.enchantments ?? []).some(e => e.mod?.spiritLink) ? 1 : 0;

// First-strike pass: only combatants with FIRST_STRIKE deal their damage here.
for (const attId of ns.attackers) {
const att = getBF(ns, attId);
if (!att) continue;
const ap = getPow(att, ns);
const actrl = att.controller;
const defW = actrl === "p" ? "o" : "p";
const hasLifelink = hasKw(att, KEYWORDS.LIFELINK.id) || (ns.castleMod?.name === "Death's Embrace" && actrl === "o");
const blockers = ns[defW].bf.filter(c => c.blocking === attId);
const attGaseous = isGaseous(att);
const attFS = hasKw(att, KEYWORDS.FIRST_STRIKE.id);

if (!blockers.length) {
  if (!attGaseous && attFS) {
    ns = hurt(ns, defW, ap, att.name);
    if (hasLifelink) ns = hurt(ns, actrl, -ap);
    if (ap > 0 && spiritLinkGain(att)) ns = hurt(ns, actrl, -ap);
  }
} else {
  let rem = ap;
  const PROT_CMAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
  for (const bl of blockers) {
    const blGaseous = isGaseous(bl);
    const bp = getPow(bl, ns);
    const bt = getTou(bl, ns);
    const dbl = Math.min(rem, bt - bl.damage);
    const blFS = hasKw(bl, KEYWORDS.FIRST_STRIKE.id);

    // S17.6.3: protection enforced inline, no trigger queue
    const blProt = Array.isArray(bl.protection) ? bl.protection : (bl.protection ? [bl.protection] : []);
    const attProt = Array.isArray(att.protection) ? att.protection : (att.protection ? [att.protection] : []);
    const blockerProtectsFromAtt = blProt.some(q => (PROT_CMAP[q] || q) === (att.color || ''));
    const attackerProtectsFromBl = attProt.some(q => (PROT_CMAP[q] || q) === (bl.color || ''));

    // Gaseous Form: attacker is gaseous -> blocker deals 0 to it; blocker is gaseous -> attacker deals 0 to it
    if (!attackerProtectsFromBl && !attGaseous && blFS) {
      ns = { ...ns, [actrl]: { ...ns[actrl], bf: ns[actrl].bf.map(c => c.iid === attId ? { ...c, damage: c.damage+bp } : c) } };
      if (bp > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: bl.iid, targetId: attId, amount: bp, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: bl.iid, targetId: attId, amount: bp, combat: true } });
        if (bl.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), attId] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && attFS) {
      ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: c.damage+dbl } : c) } };
      if (dbl > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: attId, targetId: bl.iid, amount: dbl, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: attId, targetId: bl.iid, amount: dbl, combat: true } });
        if (att.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), bl.iid] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && attFS) rem = Math.max(0, rem - dbl);
    if (hasLifelink && !blockerProtectsFromAtt && !blGaseous && attFS) ns = hurt(ns, actrl, -dbl);
    if (!blockerProtectsFromAtt && !blGaseous && dbl > 0 && spiritLinkGain(att) && attFS) ns = hurt(ns, actrl, -dbl);
    if (!attackerProtectsFromBl && !attGaseous && bp > 0 && spiritLinkGain(bl) && blFS) ns = hurt(ns, bl.controller, -bp);
    if (hasKw(att, KEYWORDS.DEATHTOUCH.id) && ns.ruleset.deathtouch && !blockerProtectsFromAtt && !blGaseous && attFS) ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: Math.max(c.toughness, c.damage+1) } : c) } };
  }
  if (hasKw(att, KEYWORDS.TRAMPLE.id) && rem > 0 && !attGaseous && attFS) ns = hurt(ns, defW, rem, `${att.name} (trample)`);
}

}

// State-based actions between first-strike and regular damage passes.
ns = checkDeath(ns);

// Regular damage pass: combatants without FIRST_STRIKE deal their damage here.
ns = dlog(ns, "Combat damage resolving.", "combat");

for (const attId of ns.attackers) {
const att = getBF(ns, attId);
if (!att) continue;
const ap = getPow(att, ns);
const actrl = att.controller;
const defW = actrl === "p" ? "o" : "p";
const hasLifelink = hasKw(att, KEYWORDS.LIFELINK.id) || (ns.castleMod?.name === "Death's Embrace" && actrl === "o");
const blockers = ns[defW].bf.filter(c => c.blocking === attId);
const attGaseous = isGaseous(att);
const attFS = hasKw(att, KEYWORDS.FIRST_STRIKE.id);

if (!blockers.length) {
  if (!attGaseous && !attFS) {
    ns = hurt(ns, defW, ap, att.name);
    if (hasLifelink) ns = hurt(ns, actrl, -ap);
    if (ap > 0 && spiritLinkGain(att)) ns = hurt(ns, actrl, -ap);
  }
} else {
  let rem = ap;
  const PROT_CMAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
  for (const bl of blockers) {
    const blGaseous = isGaseous(bl);
    const bp = getPow(bl, ns);
    const bt = getTou(bl, ns);
    const dbl = Math.min(rem, bt - bl.damage);
    const blFS = hasKw(bl, KEYWORDS.FIRST_STRIKE.id);

    // S17.6.3: protection enforced inline, no trigger queue
    const blProt = Array.isArray(bl.protection) ? bl.protection : (bl.protection ? [bl.protection] : []);
    const attProt = Array.isArray(att.protection) ? att.protection : (att.protection ? [att.protection] : []);
    const blockerProtectsFromAtt = blProt.some(q => (PROT_CMAP[q] || q) === (att.color || ''));
    const attackerProtectsFromBl = attProt.some(q => (PROT_CMAP[q] || q) === (bl.color || ''));

    // Gaseous Form: attacker is gaseous -> blocker deals 0 to it; blocker is gaseous -> attacker deals 0 to it
    if (!attackerProtectsFromBl && !attGaseous && !blFS) {
      ns = { ...ns, [actrl]: { ...ns[actrl], bf: ns[actrl].bf.map(c => c.iid === attId ? { ...c, damage: c.damage+bp } : c) } };
      if (bp > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: bl.iid, targetId: attId, amount: bp, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: bl.iid, targetId: attId, amount: bp, combat: true } });
        if (bl.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), attId] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !attFS) {
      ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: c.damage+dbl } : c) } };
      if (dbl > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: attId, targetId: bl.iid, amount: dbl, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: attId, targetId: bl.iid, amount: dbl, combat: true } });
        if (att.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), bl.iid] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !attFS) rem = Math.max(0, rem - dbl);
    if (hasLifelink && !blockerProtectsFromAtt && !blGaseous && !attFS) ns = hurt(ns, actrl, -dbl);
    if (!blockerProtectsFromAtt && !blGaseous && dbl > 0 && spiritLinkGain(att) && !attFS) ns = hurt(ns, actrl, -dbl);
    if (!attackerProtectsFromBl && !attGaseous && bp > 0 && spiritLinkGain(bl) && !blFS) ns = hurt(ns, bl.controller, -bp);
    if (hasKw(att, KEYWORDS.DEATHTOUCH.id) && ns.ruleset.deathtouch && !blockerProtectsFromAtt && !blGaseous && !attFS) ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: Math.max(c.toughness, c.damage+1) } : c) } };
  }
  if (hasKw(att, KEYWORDS.TRAMPLE.id) && rem > 0 && !attGaseous && !attFS) ns = hurt(ns, defW, rem, `${att.name} (trample)`);
}

}

// Wall of Dust: whenever it blocks, blocked creature can't attack next turn.
for (const w of ['p', 'o']) {
  for (const c of ns[w].bf) {
    if (c.name === 'Wall of Dust' && c.blocking) {
      const blockedId = c.blocking;
      for (const bw of ['p', 'o']) {
        const blocked = ns[bw].bf.find(x => x.iid === blockedId);
        if (blocked) {
          ns = { ...ns, [bw]: { ...ns[bw], bf: ns[bw].bf.map(x =>
            x.iid === blockedId ? { ...x, cantAttackTurn: ns.turn + 1 } : x
          ) } };
          ns = dlog(ns, `Wall of Dust: ${blocked.name} can't attack next turn.`, 'effect');
        }
      }
    }
  }
}
// Giant Badger: whenever it blocks, gets +2/+2 until end of turn.
for (const w of ['p', 'o']) {
  for (const c of ns[w].bf) {
    if (c.name === 'Giant Badger' && c.blocking) {
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
        x.iid === c.iid
          ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: 2, toughness: 2 }] }
          : x
      ) } };
    }
  }
}
// Murk Dwellers: gets +2/+0 when attacks and isn't blocked.
for (const attId of ns.attackers) {
  const isBlocked = Object.values(ns.blockers || {}).flat().includes(attId);
  if (!isBlocked) {
    for (const w of ['p', 'o']) {
      const c = ns[w].bf.find(x => x.iid === attId && x.name === 'Murk Dwellers');
      if (c) {
        ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
          x.iid === attId ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: 2 }] } : x
        ) } };
      }
    }
  }
}
ns = checkDeath(ns);
ns = { ...ns, attackers:[], blockers:{} };
for (const w of ["p","o"]) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => ({ ...c, attacking:false, blocking:null })) } };
return ns;
}

// --- PHASE ADVANCEMENT -------------------------------------------------------

export const PHASE_SEQ = PHASE_SEQUENCE;
export const PHASE_LBL = {
  [PHASE.UNTAP]:                  "Untap",
  [PHASE.UPKEEP]:                 "Upkeep",
  [PHASE.DRAW]:                   "Draw",
  [PHASE.MAIN_1]:                 "Main 1",
  [PHASE.COMBAT_BEGIN]:           "Cbt Begin",
  [PHASE.COMBAT_ATTACKERS]:       "Attackers",
  [PHASE.COMBAT_AFTER_ATTACKERS]: "After Atk",
  [PHASE.COMBAT_BLOCKERS]:        "Blockers",
  [PHASE.COMBAT_AFTER_BLOCKERS]:  "After Blk",
  [PHASE.COMBAT_DAMAGE]:          "Combat",
  [PHASE.COMBAT_END]:             "Cbt End",
  [PHASE.MAIN_2]:                 "Main 2",
  [PHASE.END]:                    "End",
  [PHASE.CLEANUP]:                "Cleanup",
};
export const COMBAT_PHASES = [
  PHASE.COMBAT_BEGIN,
  PHASE.COMBAT_ATTACKERS,
  PHASE.COMBAT_AFTER_ATTACKERS,
  PHASE.COMBAT_BLOCKERS,
  PHASE.COMBAT_AFTER_BLOCKERS,
  PHASE.COMBAT_DAMAGE,
  PHASE.COMBAT_END,
];

export function advPhase(s) {
if (s.stack && s.stack.length > 0) return s;
const idx = PHASE_SEQ.indexOf(s.phase);
let next = PHASE_SEQ[(idx + 1) % PHASE_SEQ.length];

// Issue B14: skip AFTER_ATTACKERS, BLOCKERS, and AFTER_BLOCKERS when no attackers declared.
if (
  (next === PHASE.COMBAT_AFTER_ATTACKERS ||
   next === PHASE.COMBAT_BLOCKERS ||
   next === PHASE.COMBAT_AFTER_BLOCKERS) &&
  (!s.attackers || s.attackers.length === 0)
) {
  next = PHASE.MAIN_2;
}

const turnChange = next === PHASE.UNTAP;
let ns = { ...s, phase: next };

// Mana burns at every phase boundary (Classic rule per GDD Bug B6)
for (const w of ["p","o"]) ns = burnMana(ns, w, ns.ruleset);

// Issue B11: auto-declare MUST_ATTACK creatures as attackers at start of declare-attackers step.
if (next === PHASE.COMBAT_ATTACKERS) {
  const activeWho = ns.active;
  // Snapshot eligibility before auto-declaring so we can distinguish "couldn't attack" from "chose not to" post-combat.
  const eligibleIids = ns[activeWho].bf
    .filter(c => c.keywords?.includes(KEYWORDS.MUST_ATTACK.id) && !c.tapped && !c.summoningSick)
    .map(c => c.iid);
  ns = { ...ns, turnState: { ...ns.turnState, mustAttackEligible: eligibleIids } };
  ns[activeWho].bf.forEach(c => {
    const mustAttack = c.keywords?.includes(KEYWORDS.MUST_ATTACK.id);
    if (mustAttack && !c.tapped && !c.summoningSick && !ns.attackers.includes(c.iid)) {
      ns = {
        ...ns,
        attackers: [...ns.attackers, c.iid],
        turnState: { ...ns.turnState, attackedThisCombat: [...ns.turnState.attackedThisCombat, c.iid] },
        [activeWho]: {
          ...ns[activeWho],
          bf: ns[activeWho].bf.map(x => x.iid === c.iid
            ? { ...x, tapped: !hasKw(x, KEYWORDS.VIGILANCE.id), attacking: true, mustAttack: true }
            : x
          ),
        },
      };
    }
  });
}

if (next === PHASE.COMBAT_END) {
  for (const iid of (ns.turnState.venomTargets ?? [])) {
    const who = ['p','o'].find(w => ns[w].bf.some(c => c.iid === iid));
    if (who) {
      const vic = ns[who].bf.find(c => c.iid === iid);
      if (vic && !vic.regenerating) {
        ns = zMove(ns, iid, who, who, 'gy');
        ns = dlog(ns, `Venom destroys ${vic.name}.`, 'effect');
        ns = emitEvent(ns, { type: 'ON_CREATURE_DIES', payload: { cardId: iid, previousController: who } });
      }
    }
  }
  ns = { ...ns, turnState: { ...ns.turnState, venomTargets: [] } };
  ns = processTriggerQueue(ns);
  ns = checkDeath(ns);
}

// Beginning-of-end-step delayed effects: Rakalite returns to hand, Xenic
// Poltergeist's animated artifact reverts.
if (next === PHASE.END) {
  for (const w of ['p', 'o']) {
    for (const c of [...ns[w].bf].filter(x => x.returnToHandNextEnd)) {
      ns = zMove(ns, c.iid, w, w, 'hand');
      ns = dlog(ns, `${c.name} returns to its owner's hand.`, 'effect');
    }
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.revertAnimateAtEnd
      ? { ...c, type: c.revertAnimateAtEnd.type, power: c.revertAnimateAtEnd.power, toughness: c.revertAnimateAtEnd.toughness, revertAnimateAtEnd: undefined }
      : c) } };
  }
}

if (next === PHASE.COMBAT_DAMAGE) {
ns = resolveCombat(ns);
for (const iid of ns.turnState.mustAttackEligible ?? []) {
  if (!ns.turnState.attackedThisCombat.includes(iid)) {
    const who = ['p','o'].find(w => ns[w].bf.some(c => c.iid === iid));
    if (who) {
      const c = ns[who].bf.find(x => x.iid === iid);
      ns = zMove(ns, iid, who, who, 'gy');
      ns = dlog(ns, `${c?.name ?? iid} destroyed for failing to attack.`, 'effect');
    }
  }
}
// Check win conditions after combat damage resolves.
const combatWin = checkWinConditions(ns);
if (combatWin && !ns.over) ns = { ...ns, over: { winner: combatWin.winner, reason: combatWin.reason } };
return ns;
}

if (turnChange) {
const whoExtra = ["p","o"].find(w => ns[w].extraTurns > 0);
if (whoExtra) {
ns = { ...ns, [whoExtra]: { ...ns[whoExtra], extraTurns: ns[whoExtra].extraTurns - 1 } };
ns = dlog(ns, `${whoExtra} takes an extra turn!`, "info");
} else {
const nx = ns.active === "p" ? "o" : "p";
ns = { ...ns, active: nx };
ns = dlog(ns, `-- Turn ${ns.turn + 1} — ${nx} --`, "phase");
}
ns = { ...ns, turn: ns.turn + 1, landsPlayed: 0, attackers: [], blockers: {}, spellsThisTurn: 0,
  turnState: { ...ns.turnState, sengirDamagedIids: [], powerSurgeUntappedCount: 0, attackedThisCombat: [], mustAttackEligible: [], venomTargets: [] } };
{
const allBF_s = [...ns.p.bf, ...ns.o.bf];
// Power Surge: snapshot tapped land count before untapping (SYSTEMS.md S20, Option A)
const powerSurgeOnField = ns[ns.active].bf.some(c => c.name === "Power Surge") ||
                          ns[ns.active === "p" ? "o" : "p"].bf.some(c => c.name === "Power Surge");
if (powerSurgeOnField) {
  const tappedLandCount = ns[ns.active].bf.filter(c => isLand(c) && c.tapped).length;
  ns = { ...ns, turnState: { ...ns.turnState, powerSurgeUntappedCount: tappedLandCount } };
}
const meekstoneOut = allBF_s.some(x => x.id === "meekstone");
const winterOrbOut = allBF_s.some(x => x.id === "winter_orb" && !x.tapped);
const smokeOut     = allBF_s.some(x => x.id === "smoke");
let landsUntapped = 0, cresUntapped = 0;
// Old Man of the Sea: revert stolen creatures before Old Man untaps.
// If Old Man would untap this step (not blocked by Meekstone/Paralyze), any creature
// stolen under whileTappedAndPowerLte reverts first, then Old Man untaps normally.
for (const om of ns[ns.active].bf.filter(c => c.id === 'old_man_of_the_sea' && c.tapped)) {
  const meekBlocked = meekstoneOut && getPow(om, ns) >= 3;
  const paralyzed = om.paralyzed || om.enchantments?.some(e => e.mod?.paralyzed);
  if (!meekBlocked && !paralyzed) {
    for (const stolen of [...ns.p.bf, ...ns.o.bf]) {
      if (stolen.controlGrant?.grantorIid === om.iid && stolen.controlGrant?.condition === 'whileTappedAndPowerLte') {
        ns = revertControlGrant(ns, stolen.iid);
      }
    }
  }
}
ns = { ...ns, [ns.active]: { ...ns[ns.active], bf: ns[ns.active].bf.map(c => {
const base = { ...c, summoningSick:false, damage:0 };
if (isLand(c)) {
if (winterOrbOut && landsUntapped >= 1) return base;
landsUntapped++;
return { ...base, tapped:false };
}
if (isCre(c)) {
// Barl's Cage: skip this creature's untap once, then clear the flag.
if (c.skipNextUntap) return { ...base, skipNextUntap: false };
if (meekstoneOut && getPow(c, ns) >= 3) return base;
if (smokeOut && cresUntapped >= 1) return base;
// Paralyze: creature never untaps while the aura is attached
if (c.paralyzed || c.enchantments?.some(e => e.mod?.paralyzed)) return { ...base, tapped: true };
cresUntapped++;
return { ...base, tapped:false };
}
return { ...base, tapped:false };
}) } };
}
}

if (next === PHASE.UPKEEP) {
if (!ns.dungeonMod || ns.dungeonMod !== 'SILENCE') {
  ns = emitEvent(ns, { type: 'ON_UPKEEP_START', payload: { activePlayer: ns.active } });
  ns = processTriggerQueue(ns);
}
for (const w of ["p","o"]) {
for (const c of [...ns[w].bf]) {
if (!c.controller || c.controller !== w) continue;
switch (c.upkeep) {
case "selfDamage1": ns = hurt(ns, w, 1, c.name); break;
case "forceOfNatureUpkeep": {
if (w !== ns.active) break;
if (w === "o") {
  if ((ns.o.mana.G ?? 0) >= 4) {
    ns = { ...ns, o: { ...ns.o, mana: { ...ns.o.mana, G: ns.o.mana.G - 4 } } };
    ns = dlog(ns, "Force of Nature: opponent paid GGGG upkeep.", "mana");
  } else {
    ns = hurt(ns, "o", 8, "Force of Nature");
    ns = dlog(ns, "Force of Nature: opponent takes 8 damage (could not pay GGGG).", "damage");
  }
} else {
  ns = { ...ns, pendingUpkeepChoice: {
    cardName: "Force of Nature",
    handlerKey: "forceOfNatureUpkeep",
    options: ["PAY_GGGG", "TAKE_DAMAGE"]
  }};
}
break;
}
case "lordsUpkeep": {
const others = ns[w].bf.filter(x => isCre(x) && x.iid !== c.iid);
if (others.length) { ns = zMove(ns, others[0].iid, w, w, "gy"); ns = dlog(ns, `Lord of the Pit devours ${others[0].name}.`, "death"); }
else ns = hurt(ns, w, 7, "Lord of the Pit");
break;
}
case "sacrificeSelf": if (next === PHASE.CLEANUP) ns = zMove(ns, c.iid, w, w, "gy"); break;
case "sacrificeUnless_U": {
const mp = { ...ns[w].mana };
if ((mp.U || 0) >= 1) { mp.U--; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
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
ns = { ...ns, [w]: { ...ns[w], hand: ns[w].hand.slice(0,-2), lib: [...put, ...ns[w].lib] } };
}
if (w === "p") ns = dlog(ns, "Sylvan Library: drew 2 extra cards.", "draw");
break;
}
case "karmaUpkeep": {
const kSwamps = ns[w].bf.filter(x => isLand(x) && x.subtype?.includes("Swamp")).length;
if (kSwamps > 0) ns = hurt(ns, w, kSwamps, "Karma");
break;
}
case "landTax": {
  if (w !== ns.active) break;
  const ltOpp = w === "p" ? "o" : "p";
  if (ns[ltOpp].bf.filter(isLand).length > ns[w].bf.filter(isLand).length) {
    const basics = ns[w].lib.filter(lc => isLand(lc) && lc.subtype?.startsWith("Basic"));
    const fetched = basics.slice(0, 3);
    for (const land of fetched) ns = zMove(ns, land.iid, w, w, "hand");
    if (fetched.length) {
      ns = { ...ns, [w]: { ...ns[w], lib: shuffle(ns[w].lib) } };
      ns = dlog(ns, `Land Tax: ${w} fetches ${fetched.length} basic land(s).`, "effect");
    }
  }
  break;
}
case "erhnamsUpkeep": {
  if (w !== ns.active) break;
  const erOpp = w === "p" ? "o" : "p";
  const erTargets = ns[erOpp].bf.filter(isCre);
  if (erTargets.length) {
    const chosen = erTargets[Math.floor(Math.random() * erTargets.length)];
    const kws = [...(chosen.keywords || [])];
    if (!kws.includes(KEYWORDS.FORESTWALK.id)) kws.push(KEYWORDS.FORESTWALK.id);
    ns = { ...ns, [erOpp]: { ...ns[erOpp], bf: ns[erOpp].bf.map(x =>
      x.iid === chosen.iid ? { ...x, keywords: kws } : x
    ) } };
    ns = dlog(ns, `Erhnam Djinn grants forestwalk to ${chosen.name}.`, "effect");
  }
  break;
}
case "demonicHordesUpkeep": {
  if (w !== ns.active) break;
  const demonPool = { ...ns[w].mana };
  if ((demonPool.B || 0) >= 3) {
    demonPool.B -= 3;
    ns = { ...ns, [w]: { ...ns[w], mana: demonPool } };
    ns = dlog(ns, `${c.name}: paid BBB upkeep.`, "mana");
  } else {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, tapped: true } : x) } };
    ns = hurt(ns, w, 3, c.name);
    ns = dlog(ns, `${c.name}: failed to pay BBB ? tapped and took 3 damage.`, "damage");
  }
  break;
}
case "powerSurgeUpkeep": {
  const dmg = ns.turnState.powerSurgeUntappedCount ?? 0;
  if (dmg > 0) {
    ns = hurt(ns, ns.active, dmg, "Power Surge");
    ns = dlog(ns, `Power Surge: ${ns.active} takes ${dmg} damage (${dmg} land(s) did not untap).`, "damage");
  } else {
    ns = dlog(ns, "Power Surge: no damage (all lands untapped).", "effect");
  }
  break;
}
case "kudzuUpkeep": {
  if (w !== ns.active) break;
  const enchLand = [...ns.p.bf, ...ns.o.bf].find(l => isLand(l) && l.iid === c.enchantedLandIid);
  if (!enchLand) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, "Kudzu: not attached to a land — goes to graveyard.", "effect");
    break;
  }
  const landCtrl = enchLand.controller;
  ns = zMove(ns, enchLand.iid, landCtrl, landCtrl, "gy");
  ns = dlog(ns, `Kudzu destroys ${enchLand.name}.`, "effect");
  const remLands = ns[landCtrl].bf.filter(isLand);
  if (remLands.length) {
    const seed = (ns.turn * 37 + remLands.length * 13) % remLands.length;
    const newHost = remLands[seed];
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
      x.iid === c.iid ? { ...x, enchantedLandIid: newHost.iid } : x
    )}};
    ns = dlog(ns, `Kudzu re-attaches to ${newHost.name}.`, "effect");
  } else {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, "Kudzu: no lands remain — goes to graveyard.", "effect");
  }
  break;
}
default: break;
}
}
}
if (ns.fogActive) ns = { ...ns, fogActive: false };
}

if (next === PHASE.DRAW) {
if (!(ns.turn === 1 && !ns.ruleset.drawOnFirstTurn && ns.active === "p")) {
ns = drawD(ns, ns.active);
// SBE: check deck-out
const drawWin = checkWinConditions(ns);
if (drawWin && !ns.over) ns = { ...ns, over: { winner: drawWin.winner, reason: drawWin.reason } };
}
}

if (next === PHASE.CLEANUP) {
ns = { ...ns, manaTapSnapshot: null, turnState: { ...ns.turnState, damageLog: [], damageTakenThisTurn: {}, activatedOnceIids: [] } };
const ac = ns.active;
while (ns[ac].hand.length > ns.ruleset.maxHandSize) {
const disc = ns[ac].hand[ns[ac].hand.length - 1];
ns = { ...ns, [ac]: { ...ns[ac], hand: ns[ac].hand.slice(0,-1), gy: [...ns[ac].gy, disc] } };
}
// Expire all EOT buffs on all permanents. SYSTEMS.md S3.1
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.eotBuffs?.length ? { ...c, eotBuffs: [] } : c) } };
}
// Hurr Jackal: "can't be regenerated" restriction only lasts the turn it's activated.
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.cantRegenerateThisTurn ? { ...c, cantRegenerateThisTurn: false } : c) } };
}
// Revert animated lands (e.g. Mishra's Factory) at end of turn.
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => {
  if (!c.eotRevert) return c;
  const { isAnimatedLand, power, toughness, subtype, eotRevert, ...rest } = c;
  return rest;
}) } };
}
// Clear mustAttack flags at end of turn
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.mustAttack ? { ...c, mustAttack: false } : c) } };
}
// Clear channelActive and damageShield at end of turn
for (const w of ["p","o"]) {
  if (ns[w].channelActive) ns = { ...ns, [w]: { ...ns[w], channelActive: false }};
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.damageShield ? { ...c, damageShield: 0 } : c) } };
}
// Pestilence: destroy if its controller has no black creatures
for (const w of ["p","o"]) {
for (const pest of [...ns[w].bf].filter(x => x.id === "pestilence")) {
  if (!ns[w].bf.some(c => isCre(c) && c.color === "B")) {
    ns = zMove(ns, pest.iid, w, w, "gy");
    ns = dlog(ns, "Pestilence: no black creatures — destroyed.", "effect");
  }
}
}
// Castle Inferno modifier
if (ns.castleMod?.name === "Inferno") { ns = hurt(ns, "p", 1, "Inferno"); ns = hurt(ns, "o", 1, "Inferno"); }
}

return ns;
}

// --- TRIGGERED ABILITY PIPELINE ----------------------------------------------
// S17 (SYSTEMS.md): deterministic trigger detection, queuing, and resolution.
// All helpers are pure functions: (GameState, ...) ? GameState.

function evaluateCondition(state, card, condition, payload) {
  if (condition.type === 'damagedByThisTurn') {
    return state.turnState.damageLog.some(
      entry => entry.sourceId === card.iid && entry.targetId === payload.cardId
    );
  }
  return true; // unknown conditions pass by default; add stricter handling as needed
}

function emitEvent(state, event) {
  const newTriggers = [];
  const allPlayers = ['p', 'o'];
  let ts = Date.now(); // tie-breaking integer only, not for timing

  for (const who of allPlayers) {
    for (const card of state[who].bf) {
      if (!card.triggeredAbilities) continue;
      for (const ability of card.triggeredAbilities) {
        if (ability.trigger.event !== event.type) continue;
        if (ability.trigger.scope === 'self' && card.iid !== event.payload?.sourceId) continue;
        if (ability.trigger.scope === 'controller' && card.controller !== event.payload?.activePlayer) continue;
        if (ability.condition && !evaluateCondition(state, card, ability.condition, event.payload)) continue;
        newTriggers.push({
          triggerId: ability.id,
          sourceCardId: card.iid,
          controller: who,
          eventPayload: event.payload,
          timestamp: ts++,
        });
      }
    }
  }

  if (event.type === 'ON_CREATURE_DIES') {
    for (const who of allPlayers) {
      for (const card of state[who].bf) {
        if (card.triggered === 'sengirCounter' &&
            (state.turnState.sengirDamagedIids || []).includes(event.payload.cardId)) {
          newTriggers.push({
            triggerId: 'sengirCounter',
            sourceCardId: card.iid,
            controller: who,
            eventPayload: event.payload,
            timestamp: ts++,
          });
        }
      }
    }
  }

  if (!newTriggers.length) return state;
  // APNAP ordering: active player's triggers first
  const sorted = [
    ...newTriggers.filter(t => t.controller === state.active),
    ...newTriggers.filter(t => t.controller !== state.active),
  ];
  return { ...state, triggerQueue: [...state.triggerQueue, ...sorted] };
}

function resolveTriggeredEffect(state, sourceCard, effect, payload) {
  switch (effect.type) {
    case 'addCounter': {
      // Map declarative counter names to the internal keys used by getPow/getTou
      const counterKey = effect.counter === '+1/+1' ? 'P1P1'
                       : effect.counter === '-1/-1' ? 'M1M1'
                       : effect.counter;
      const who = sourceCard.controller;
      const updated = state[who].bf.map(c =>
        c.iid === sourceCard.iid
          ? { ...c, counters: { ...c.counters, [counterKey]: (c.counters?.[counterKey] || 0) + effect.amount } }
          : c
      );
      return dlog(
        { ...state, [who]: { ...state[who], bf: updated } },
        `${sourceCard.name} gets a +1/+1 counter.`,
        'effect'
      );
    }
    case 'dealDamageToController': {
      const who = sourceCard.controller;
      const newLife = state[who].life - effect.amount;
      let s = { ...state, [who]: { ...state[who], life: newLife } };
      if (newLife <= 0) s = { ...s, over: { winner: who === 'p' ? 'o' : 'p', reason: `${sourceCard.name} triggered damage` } };
      return dlog(s, `${sourceCard.name} deals ${effect.amount} damage to ${who}.`, 'damage');
    }
    case 'payMana': {
      const who = sourceCard.controller;
      const cost = effect.cost;
      const pool = { ...state[who].mana };
      let canAfford = true;
      for (const [color, amount] of Object.entries(cost)) {
        if ((pool[color] || 0) < amount) { canAfford = false; break; }
      }
      if (!canAfford) {
        const newLife = state[who].life - 8;
        let s = { ...state, [who]: { ...state[who], life: newLife } };
        if (newLife <= 0) s = { ...s, over: { winner: who === 'p' ? 'o' : 'p', reason: 'Force of Nature upkeep' } };
        return dlog(s, `Force of Nature: ${who} could not pay GGGG — takes 8 damage.`, 'damage');
      }
      for (const [color, amount] of Object.entries(cost)) {
        pool[color] = pool[color] - amount;
      }
      return dlog(
        { ...state, [who]: { ...state[who], mana: pool } },
        `Force of Nature: ${who} pays GGGG.`,
        'effect'
      );
    }
    default:
      console.warn(`[DuelCore] Unknown triggered effect type: ${effect.type}`);
      return state;
  }
}

function resolveTrigger(state, inst) {
  const allBf = [...state.p.bf, ...state.o.bf];
  const sourceCard = allBf.find(c => c.iid === inst.sourceCardId);
  if (!sourceCard?.triggeredAbilities) return state;
  const ability = sourceCard.triggeredAbilities.find(a => a.id === inst.triggerId);
  if (!ability) return state;

  if (ability.requiresChoice) {
    // Suspend queue and present choice to the controlling player
    return {
      ...state,
      pendingChoice: {
        id: `choice_${inst.triggerId}_${inst.timestamp}`,
        type: 'triggered_ability_choice',
        sourceCardId: inst.sourceCardId,
        controller: inst.controller,
        options: ability.effect.options,
        required: true,
      },
      // Re-insert at front so it is re-resolved once the choice is made
      triggerQueue: [inst, ...state.triggerQueue],
    };
  }

  return resolveTriggeredEffect(state, sourceCard, ability.effect, inst.eventPayload);
}

function processTriggerQueue(state) {
  let s = state;
  while (s.triggerQueue.length > 0 && !s.pendingChoice) {
    const [next, ...rest] = s.triggerQueue;
    s = { ...s, triggerQueue: rest };
    if (next.triggerId === 'sengirCounter') {
      const allBf = [...s.p.bf, ...s.o.bf];
      const sengir = allBf.find(c => c.name === "Sengir Vampire");
      if (sengir) {
        const who = sengir.controller;
        s = { ...s, [who]: { ...s[who], bf: s[who].bf.map(c =>
          c.iid === sengir.iid
            ? { ...c, counters: { ...c.counters, P1P1: (c.counters?.P1P1 || 0) + 1 } }
            : c
        ) } };
        s = dlog(s, "Sengir Vampire: +1/+1 counter (creature it damaged died).", "effect");
      }
    } else {
      s = resolveTrigger(s, next);
    }
  }
  return s;
}

// --- DUEL STATE BUILDER -------------------------------------------------------

export function buildDuelState(pDeckIds, oppArchKey, ruleset, overworldHP, castleMod, anteEnabled, oppLife) {
const pd = shuffle(pDeckIds.map(id => makeCardInstance(id, "p")).filter(Boolean));
const od = shuffle((ARCHETYPES[oppArchKey]?.deck || ARCHETYPES.RED_BURN.deck).map(id => makeCardInstance(id, "o")).filter(Boolean));
const ph = pd.splice(0, ruleset.startingHandSize);
const oh = od.splice(0, ruleset.startingHandSize);
const startLife = overworldHP ?? ruleset.startingLife;
const anteP = anteEnabled && pd.length ? pd[0] : null;
const anteO = anteEnabled && od.length ? od[0] : null;

return {
ruleset,
phase: PHASE.MAIN_1,
active: "p",
turn: 1,
landsPlayed: 0,
spellsThisTurn: 0,
totalCardsCast: 0,
peakDamage: 0,
p: { life: startLife, lib: pd, hand: ph, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0, channelActive: false, mulliganDecided: false },
o: { life: oppLife ?? ruleset.startingLife, lib: od, hand: oh, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0, channelActive: false, mulliganDecided: false },
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
exileNextDeath: false,
pendingLotus: false,
pendingLotusIid: null,
pendingBop: false,
turnState: { damageLog: [], sengirDamagedIids: [], powerSurgeUntappedCount: 0, attackedThisCombat: [], mustAttackEligible: [], venomTargets: [], damageTakenThisTurn: {}, activatedOnceIids: [] },
triggerQueue: [],
pendingChoice: null,
pendingUpkeepChoice: null,
pendingConditionalCounter: null,
priorityWindow: false,
priorityPasser: null,
manaTapSnapshot: null,
pendingTutor: null,
pendingTransmuteSacrifice: null,
pendingTransmutePay: null,
pendingSphereTrigger: null,
};
}

// Phases where mana tapping and non-mana ability activation are illegal.
// Players declare attackers/blockers only; no priority is held.
const DECLARE_ONLY_PHASES = new Set([
  PHASE.COMBAT_ATTACKERS,
  PHASE.COMBAT_BLOCKERS,
]);

// --- DUEL REDUCER ------------------------------------------------------------
// Pure function: (GameState, GameAction) ? GameState
// This is the ONLY place GameState mutations are valid.

export function duelReducer(state, action) {
if (state.over && action.type !== "RESET" && action.type !== "LOAD_STATE") return state;
let s = state;

switch (action.type) {

case "LOAD_STATE": return action.state;

case "TAP_LAND": {
  if (DECLARE_ONLY_PHASES.has(s.phase)) return dlog(s, "Cannot tap mana during declare phase.", "rule");
  let ns = s;
  if (action.who === 'p' && ns.manaTapSnapshot === null && (ns.stack?.length ?? 0) === 0) {
    ns = {
      ...ns,
      manaTapSnapshot: {
        pBfTapped: ns.p.bf.map(c => ({ iid: c.iid, tapped: c.tapped })),
        pMana: { ...ns.p.mana },
      },
    };
  }
  return applyOvergrowthTap(ns, action.who, action.iid, action.mana);
}

case "TAP_ART_MANA": {
  if (DECLARE_ONLY_PHASES.has(s.phase)) return dlog(s, "Cannot tap mana during declare phase.", "rule");
  const w = action.who;
  const c = s[w].bf.find(x => x.iid === action.iid);
  if (!c || c.tapped || !c.activated?.effect?.startsWith("addMana")) return s;
  let ns = s;
  if (action.who === 'p' && ns.manaTapSnapshot === null && (ns.stack?.length ?? 0) === 0) {
    ns = {
      ...ns,
      manaTapSnapshot: {
        pBfTapped: ns.p.bf.map(card => ({ iid: card.iid, tapped: card.tapped })),
        pMana: { ...ns.p.mana },
      },
    };
  }
  const ms = c.activated.mana || "";
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === action.iid ? { ...x, tapped: true } : x) } };
  const mp = { ...ns[w].mana };
  for (const ch of ms) if ("WUBRGC".includes(ch)) mp[ch] = (mp[ch] || 0) + 1;
  return dlog({ ...ns, [w]: { ...ns[w], mana: mp } }, `${w} taps ${c.name} for mana.`, "mana");
}

case "UNDO_MANA_TAPS": {
  if (s.pendingLotus) return s; // cancel path owns rollback while picker is open
  const snap = s.manaTapSnapshot;
  if (!snap) return s;
  const restoredBf = s.p.bf.map(c => {
    const snapEntry = snap.pBfTapped.find(e => e.iid === c.iid);
    if (!snapEntry) return c;
    return { ...c, tapped: snapEntry.tapped };
  });
  let ns = {
    ...s,
    p: { ...s.p, bf: restoredBf, mana: { ...snap.pMana } },
    manaTapSnapshot: null,
  };
  return dlog(ns, "Mana taps undone.", "mana");
}

case "PLAY_LAND": {
  const w = action.who;
  const c = s[w].hand.find(x => x.iid === action.iid);
  const fastbondActive = s[w].bf.some(x => x.id === "fastbond");
  if (s.stack?.length > 0) return dlog(s, 'Cannot play a land while spells are on the stack.', 'rule');
  if (!c || !isLand(c) || s.active !== w || (s.phase !== PHASE.MAIN_1 && s.phase !== PHASE.MAIN_2) || (s.landsPlayed >= 1 && !fastbondActive)) return s;
  const prevLandsPlayed = s.landsPlayed;
  const lArr = { ...c, controller: w, tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {} };
  s = { ...s, [w]: { ...s[w], hand: s[w].hand.filter(x => x.iid !== action.iid), bf: [...s[w].bf, lArr] }, landsPlayed: s.landsPlayed + 1 };
  if (fastbondActive && prevLandsPlayed >= 1) {
    s = hurt(s, w, 1, "Fastbond");
    s = dlog(s, `Fastbond: ${w} takes 1 damage for playing an extra land.`, "damage");
  }
  return dlog(s, `${w} plays ${c.name}.`, "play");
}

case "CAST_SPELL": {
  const w = action.who;
  const c = s[w].hand.find(x => x.iid === action.iid);
  if (!c) return s;
  const isSorcerySpeed = !isInst(c);
  if (isSorcerySpeed) {
    if (s.active !== w) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} is sorcery speed and ${w} is not active player`);
      return s;
    }
    if (!SORCERY_SPEED_PHASES.includes(s.phase)) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} requires sorcery speed (phase=${s.phase})`);
      return s;
    }
    if (s.stack && s.stack.length > 0) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} requires sorcery speed (stack=${s.stack.length})`);
      return s;
    }
  }
  // Counter-spell legality: must have a valid target on the stack at cast time.
  const COUNTER_EFFECTS = new Set(['counter','counterCreature','powerSink']);
  if (COUNTER_EFFECTS.has(c.effect)) {
    const eligible = s.stack.filter(i => {
      if (c.effect === 'counterCreature') return isCre(i.card);
      return true;
    });
    if (!eligible.length) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} requires a spell on the stack`);
      return s;
    }
    if (c.id === 'spell_blast') {
      const xSpendCheck = action.xVal || s.xVal || 1;
      if (!s.stack.some(i => i.card.cmc === xSpendCheck)) {
        console.warn(`[DuelCore] CAST_SPELL blocked: Spell Blast X=${xSpendCheck} but no matching CMC on stack`);
        return s;
      }
    }
  }
  // BEB/REB legality: must have a red/blue spell on stack OR a red/blue permanent on bf.
  if (c.effect === 'destroyRedOrCounter') {
    const hasRedSpell = s.stack.some(i => i.card?.color === 'R');
    const hasRedPerm = s.p.bf.some(i => i.color === 'R') || s.o.bf.some(i => i.color === 'R');
    if (!hasRedSpell && !hasRedPerm) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Blue Elemental Blast requires a red target`);
      return s;
    }
  }
  if (c.effect === 'destroyBlueOrCounter') {
    const hasBlueSpell = s.stack.some(i => i.card?.color === 'U');
    const hasBluePerm = s.p.bf.some(i => i.color === 'U') || s.o.bf.some(i => i.color === 'U');
    if (!hasBlueSpell && !hasBluePerm) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Red Elemental Blast requires a blue target`);
      return s;
    }
  }
  // Reset: "Cast this spell only during an opponent's turn after their upkeep step."
  // Adapted from Card-Forge/forge (r/reset.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (c.id === 'reset') {
    if (s.active === w) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Reset can only be cast during an opponent's turn`);
      return s;
    }
    if (s.phase === PHASE.UNTAP || s.phase === PHASE.UPKEEP) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Reset can only be cast after the upkeep step`);
      return s;
    }
  }
  const xSpend = (c.cost?.toUpperCase().includes('X') && c.id !== 'power_sink')
    ? (action.xVal || s.xVal || 1)
    : 0;
  if (!canPay(s[w].mana, c.cost, xSpend)) return s;
  if (w === "p" && s.castleMod?.name === "Tidal Lock" && (s.spellsThisTurn || 0) >= 1) return dlog(s, "Tidal Lock: only one spell per turn.", "effect");
  s = { ...s, manaTapSnapshot: null };
  let manaAfterPay = payMana(s[w].mana, c.cost);
  if (xSpend > 0) {
    let remaining = xSpend;
    const xmp = { ...manaAfterPay };
    for (const col of ['W','U','B','R','G','C']) {
      if (remaining <= 0) break;
      const take = Math.min(xmp[col] || 0, remaining);
      xmp[col] = (xmp[col] || 0) - take;
      remaining -= take;
    }
    manaAfterPay = xmp;
  }
  s = { ...s, [w]: { ...s[w], mana: manaAfterPay, hand: s[w].hand.filter(x => x.iid !== action.iid) } };
  const item = { id: makeId(), card: c, caster: w, targets: action.tgt ? [action.tgt] : [], xVal: action.xVal || s.xVal || 1,
    fromColor: action.fromColor, toColor: action.toColor, fromKw: action.fromKw, toKw: action.toKw };
  if (w === "p") s = { ...s, spellsThisTurn: (s.spellsThisTurn || 0) + 1 };
  if (w === "p") s = { ...s, totalCardsCast: (s.totalCardsCast || 0) + 1 };
  const xSuffix = xSpend > 0 ? ` (X=${xSpend})` : '';
  const tgtLabel = (() => {
    const t = action.tgt;
    if (!t) return '';
    if (t === 'p' || t === 'player' || t === 'player-p') return ' targeting Player';
    if (t === 'o' || t === 'opponent' || t === 'player-o') return ' targeting Opponent';
    const tgtCard = s.p.bf.find(x => x.iid === t) || s.o.bf.find(x => x.iid === t)
                 || s.p.gy.find(x => x.iid === t) || s.o.gy.find(x => x.iid === t);
    if (tgtCard) return ` targeting ${tgtCard.name}`;
    const stackItem = s.stack.find(i => i.id === t);
    if (stackItem) return ` targeting ${stackItem.card?.name ?? 'stack spell'}`;
    return '';
  })();
  const castState = dlog(
    { ...s, stack: [...s.stack, item], priorityWindow: true, priorityPasser: null },
    `${w} casts ${c.name}${xSuffix}${tgtLabel}.`,
    "play"
  );
  // Sphere lifegain cycle: scan battlefields for matching artifact triggers.
  // Fires on cast (not resolution), includes caster's own spells per oracle text.
  const SPHERE_COLOR_MAP = { crystal_rod: 'U', iron_star: 'R', ivory_cup: 'W', wooden_sphere: 'G' };
  const castColor = c.color;
  if (castColor) {
    const triggers = [];
    for (const who of ['p', 'o']) {
      for (const perm of castState[who].bf) {
        if (SPHERE_COLOR_MAP[perm.id] === castColor) {
          const totalMana = Object.values(castState[who].mana).reduce((acc, v) => acc + v, 0);
          if (totalMana >= 1) {
            triggers.push({ sphereCardId: perm.id, sphereCardName: perm.name, controller: who });
          }
        }
      }
    }
    if (triggers.length > 0) {
      const [first, ...rest] = triggers;
      return { ...castState, pendingSphereTrigger: { sphereCardId: first.sphereCardId, sphereCardName: first.sphereCardName, controller: first.controller, queue: rest } };
    }
  }
  return castState;
}

case "RESOLVE_STACK": {
  if (!s.stack.length) return s;
  const top = s.stack[s.stack.length - 1];
  // Close the priority window when resolving; DuelScreen stack-length watcher reopens it
  // if more items remain.
  s = { ...s, stack: s.stack.slice(0, -1), priorityWindow: false, priorityPasser: null };
  s = resolveEff(s, top);
  if (isPerm(top.card) && !isLand(top.card) && !top.isAbility) {
    // Guard: if resolveEff already placed the permanent on the bf (e.g. copyPermanentCharacteristics),
    // skip the normal ETB push so we don't double-add the original card object.
    const alreadyOnBf = s[top.caster].bf.some(c => c.iid === top.card.iid);
    if (!alreadyOnBf) {
      const pArr = {
        ...top.card,
        controller: top.caster,
        tapped: false,
        summoningSick: !hasKw(top.card, KEYWORDS.HASTE.id),
        attacking: false,
        blocking: null,
        damage: 0,
        counters: { ...(top.card.etbCounters || {}) },
      };
      s = { ...s, [top.caster]: { ...s[top.caster], bf: [...s[top.caster].bf, pArr] } };
    }
    if (CARD_HANDLERS[top.card.name]?.onResolve) {
      const pOnBf = s[top.caster].bf.find(x => x.iid === top.card.iid) || pArr;
      const result = CARD_HANDLERS[top.card.name].onResolve(s, pOnBf, top.targets || [], top.xVal);
      if (result) s = result;
    }
  } else if (!isPerm(top.card) && !top.isAbility) {
    s = { ...s, [top.caster]: { ...s[top.caster], gy: [...s[top.caster].gy, { ...top.card }] } };
  }
  return s;
}

case "DECLARE_ATTACKER": {
  if (s.phase !== PHASE.COMBAT_ATTACKERS) return s;
  const side = s.active;
  const c = s[side].bf.find(x => x.iid === action.iid);
  if (!c || !isCre(c) || c.tapped || (c.summoningSick && !hasKw(c, KEYWORDS.HASTE.id, s))) return s;
  if (hasKw(c, KEYWORDS.DEFENDER.id, s)) return dlog(s, `${c.name} has defender and cannot attack.`, "rule");
  if (c.cantAttackTurn && c.cantAttackTurn >= s.turn) return dlog(s, `${c.name} can't attack this turn (Wall of Dust effect).`, 'rule');
  // Moat: "Creatures without flying can't attack."
  // Adapted from Card-Forge/forge (m/moat.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if ([...s.p.bf, ...s.o.bf].some(m => m.name === 'Moat') && !hasKw(c, KEYWORDS.FLYING.id, s)) {
    return dlog(s, `${c.name} can't attack -- Moat allows only creatures with flying to attack.`, 'rule');
  }
  const att = s.attackers.includes(action.iid);
  const atts = att ? s.attackers.filter(id => id !== action.iid) : [...s.attackers, action.iid];
  const atc = att
    ? (s.turnState.attackedThisCombat || []).filter(id => id !== action.iid)
    : [...(s.turnState.attackedThisCombat || []), action.iid];
  return { ...s, attackers: atts, turnState: { ...s.turnState, attackedThisCombat: atc }, [side]: { ...s[side], bf: s[side].bf.map(x => x.iid === action.iid ? { ...x, attacking: !att, tapped: !att && !hasKw(x, KEYWORDS.VIGILANCE.id) } : x) } };
}

case "DECLARE_BLOCKER": {
  const blOnP = s.p.bf.find(x => x.iid === action.blId);
  const blOnO = s.o.bf.find(x => x.iid === action.blId);
  const bl = blOnP || blOnO;
  const blSide = blOnP ? 'p' : 'o';
  const att = getBF(s, action.attId);
  if (!bl || !att || !s.attackers.includes(action.attId)) return s;
  // S17.6.2B: explicit protection enforcement with log message
  if (att.protection) {
    const prot = Array.isArray(att.protection) ? att.protection : [att.protection];
    const PROT_COLOR_MAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
    for (const quality of prot) {
      if (bl.color === (PROT_COLOR_MAP[quality] || quality)) {
        return dlog(s, `${bl.name} cannot block ${att.name} (protection from ${quality}).`, 'rule');
      }
    }
  }
  if (!canBlockDuel(bl, att, s[blSide].bf, s)) return s;
  // Venom: if either attacker or blocker has a Venom aura, record the other creature
  // for destruction at COMBAT_END. Non-Wall check is per oracle.
  let ns2 = s;
  const attHasVenom = att.enchantments?.some(e => e.mod?.venom);
  const blHasVenom  = bl.enchantments?.some(e => e.mod?.venom);
  const blIsWall    = bl.subtype?.includes('Wall');
  const attIsWall   = att.subtype?.includes('Wall');
  if (attHasVenom && !blIsWall) {
    ns2 = { ...ns2, turnState: { ...ns2.turnState, venomTargets: [...(ns2.turnState.venomTargets || []), bl.iid] } };
  }
  if (blHasVenom && !attIsWall) {
    ns2 = { ...ns2, turnState: { ...ns2.turnState, venomTargets: [...(ns2.turnState.venomTargets || []), att.iid] } };
  }
  const already = ns2.blockers[action.blId] === action.attId;
  const nb = { ...ns2.blockers };
  if (already) delete nb[action.blId]; else nb[action.blId] = action.attId;
  return { ...ns2, blockers: nb, [blSide]: { ...ns2[blSide], bf: ns2[blSide].bf.map(x => x.iid === action.blId ? { ...x, blocking: already ? null : action.attId } : x) } };
}

case "OPEN_PRIORITY_WINDOW":
  if (s.castleMod?.name === 'SILENCE' || s.dungeonMod === 'SILENCE') return s;
  return { ...s, priorityWindow: true, priorityPasser: null };

case "PASS_PRIORITY": {
  const who = action.who;
  if (!s.priorityWindow) return s;
  if (s.priorityPasser === who) return s;
  if (s.priorityPasser !== null) {
    return { ...s, priorityWindow: false, priorityPasser: null };
  }
  return { ...s, priorityPasser: who };
}

case "ADVANCE_PHASE": {
  if (s.priorityWindow) {
    console.warn('[DuelCore] ADVANCE_PHASE blocked: priority window open');
    return s;
  }
  if (s.stack && s.stack.length > 0) {
    console.warn('[DuelCore] ADVANCE_PHASE blocked: stack is not empty');
    return s;
  }
  if (s.pendingUpkeepChoice) return s;
  if (s.pendingConditionalCounter) return s;
  if (s.pendingSphereTrigger) return s;
  s = { ...s, manaTapSnapshot: null };
  return advPhase(s);
}

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
  if (w === "o" && s.o.mulliganDecided) return s;
  if (w === "p" && (s.turn > 1 || s.p.bf.length > 0 || s.landsPlayed > 0)) return s;
  const mulls = (s[w].mulls || 0) + 1;
  const lib = shuffle([...s[w].lib, ...s[w].hand]);
  let ns = { ...s, [w]: { ...s[w], lib, hand: [], mulls, ...(w === "o" ? { mulliganDecided: true } : {}) } };
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

case "MULLIGAN_KEEP": {
  if (s.o.mulliganDecided) return s;
  return { ...s, o: { ...s.o, mulliganDecided: true } };
}

case "ACTIVATE_ABILITY": {
  if (DECLARE_ONLY_PHASES.has(s.phase)) return dlog(s, "Cannot activate abilities during declare phase.", "rule");
  const { iid, tgt, chosenColor, abilityId } = action;
  const w = action.who || 'p';
  const card = s[w].bf.find(c => c.iid === iid);
  if (!card) return s;
  // X-cost activated abilities (e.g. Candelabra of Tawnos: "{X}, {T}: ..."), same
  // xVal source CAST_SPELL uses for X spells.
  const xValPaid = action.xVal ?? s.xVal ?? 1;

  // Handle cards with activatedAbilities array (e.g. Mishra's Factory).
  if (card.activatedAbilities && abilityId) {
    const ab = card.activatedAbilities.find(a => a.id === abilityId);
    if (!ab) return s;

    if (ab.effect === "animateLand") {
      // Pay {1} generic from pool.
      const totalMana = Object.values(s.p.mana).reduce((a, b) => a + b, 0);
      if (totalMana < 1) return dlog(s, "Not enough mana to animate Mishra's Factory.", "info");
      let ns = s;
      for (const col of ["C","W","U","B","R","G"]) {
        if ((ns.p.mana[col] || 0) > 0) {
          ns = { ...ns, p: { ...ns.p, mana: { ...ns.p.mana, [col]: ns.p.mana[col] - 1 } } };
          break;
        }
      }
      if (card.isAnimatedLand) return dlog(ns, "Mishra's Factory is already animated.", "info");
      ns = { ...ns, p: { ...ns.p, bf: ns.p.bf.map(c => c.iid === iid
        ? { ...c, isAnimatedLand: true, power: 2, toughness: 2, subtype: "Assembly-Worker", eotRevert: true }
        : c
      ) } };
      return dlog(ns, "Mishra's Factory becomes a 2/2 Assembly-Worker until end of turn.", "effect");
    }

    if (ab.effect === "pumpAssemblyWorker") {
      if (card.tapped) return dlog(s, "Mishra's Factory is already tapped.", "info");
      if (!tgt) return dlog(s, "No target selected for pump ability.", "info");
      // Tap the factory.
      let ns = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
      // Apply +1/+1 EOT buff to target (search both battlefields).
      const inP = ns.p.bf.find(c => c.iid === tgt);
      const inO = ns.o.bf.find(c => c.iid === tgt);
      if (inP) {
        ns = { ...ns, p: { ...ns.p, bf: ns.p.bf.map(c => c.iid === tgt
          ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1, toughness: 1 }] } : c) } };
      } else if (inO) {
        ns = { ...ns, o: { ...ns.o, bf: ns.o.bf.map(c => c.iid === tgt
          ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1, toughness: 1 }] } : c) } };
      }
      return dlog(ns, `Mishra's Factory pumps target Assembly-Worker +1/+1.`, "effect");
    }

    if (ab.effect === "desertPing") {
      if (s.phase !== PHASE.COMBAT_END) return dlog(s, "Desert's damage ability can only be activated during the end of combat step.", "info");
      if (card.tapped) return dlog(s, "Desert is already tapped.", "info");
      if (!tgt) return dlog(s, "No target selected for Desert.", "info");
      const allBf = [...s.p.bf, ...s.o.bf];
      const targetC = allBf.find(c => c.iid === tgt);
      if (!targetC) return dlog(s, "Desert: target not found.", "info");
      const isAttacker = (s.attackers || []).includes(tgt);
      if (!isAttacker) return dlog(s, "Desert can only target an attacking creature.", "info");
      const ownerSide = s.p.bf.find(c => c.iid === tgt) ? 'p' : 'o';
      if (targetC.preventsDesertDamage) return dlog(s, `${card.name} is prevented from damaging ${targetC.name}.`, "effect");
      if (targetC.preventsDesertDamageWhileAttacking && isAttacker) {
        // TODO: banding-group Desert prevention not yet handled
        return dlog(s, `${card.name} is prevented from damaging ${targetC.name} (camel protection).`, "effect");
      }
      let ns = { ...s, [w]: { ...s[w], bf: s[w].bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
      ns = { ...ns, [ownerSide]: { ...ns[ownerSide], bf: ns[ownerSide].bf.map(c => c.iid === tgt ? { ...c, damage: c.damage + 1 } : c) } };
      ns = checkDeath(ns);
      return dlog(ns, `${card.name} deals 1 damage to ${targetC.name}.`, "effect");
    }

    if (ab.effect === "grantWalkSelfDamage2") {
      // Adapted from Card-Forge/forge (w/wormwood_treefolk.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
      if (!canPay(s[w].mana, ab.mana)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      let ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, ab.mana) } };
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.iid === iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [ab.walkKeyword] }] } : c) } };
      ns = hurt(ns, w, 2, card.name);
      return dlog(ns, `${card.name} gains ${ab.walkName} until end of turn.`, "effect");
    }

    return s;
  }

  if (!card.activated) return s;
  const act = card.activated;
  // Birds of Paradise: tap the bird, set pendingBop flag, UI shows BopColorPicker.
  if (act.effect === "addManaAny" && !action.chosenColor) {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === action.iid ? { ...c, tapped: true } : c) }, pendingBop: true };
    return dlog(s, `${card.name} tapped ? choose a color.`, "mana");
  }
  // Black Lotus: tap, set pendingLotus + pendingLotusIid, UI shows LotusColorPicker.
  // Sacrifice is deferred to CHOOSE_LOTUS_COLOR so Cancel can restore untapped state.
  if (act.effect === "addMana3Any") {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    const snapshot = s.manaTapSnapshot ?? {
      pBfTapped: s.p.bf.map(c => ({ iid: c.iid, tapped: c.tapped })),
      pMana: { ...s.p.mana },
    };
    s = {
      ...s,
      p: { ...s.p, bf: s.p.bf.map(c => c.iid === action.iid ? { ...c, tapped: true } : c) },
      pendingLotus: true,
      pendingLotusIid: action.iid,
      manaTapSnapshot: snapshot,
    };
    return dlog(s, `${card.name} tapped -- choose a color.`, "mana");
  }
  // Mana abilities resolve immediately without using the stack (rule 605.3b).
  if (act.effect === "addMana") {
    if (act.cost.includes("T")) {
      if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
      // Take snapshot before tapping so UNDO_MANA_TAPS can restore this creature
      // alongside any lands already recorded. Guard: only if no snapshot yet and
      // stack is empty (same guard as TAP_LAND / TAP_ART_MANA).
      if (s.manaTapSnapshot === null && (s.stack?.length ?? 0) === 0) {
        s = {
          ...s,
          manaTapSnapshot: {
            pBfTapped: s.p.bf.map(c => ({ iid: c.iid, tapped: c.tapped })),
            pMana: { ...s.p.mana },
          },
        };
      }
      s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
    }
    const manaItem = { id: makeId(), card: { ...card, effect: act.effect, mana: act.mana }, caster: "p", targets: [], xVal: 1, chosenColor };
    s = resolveEff(s, manaItem);
    return dlog(s, `${card.name} adds mana.`, "mana");
  }
  // Fellwar Stone: T: Add one mana of any color a land an opponent controls could
  // produce. A mana ability (rule 605.3b) -- resolves immediately, same as addMana.
  // Adapted from Card-Forge/forge (f/fellwar_stone.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (act.effect === "addManaReflected") {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = { ...s, p: { ...s.p, bf: s.p.bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
    const reflectedItem = { id: makeId(), card: { ...card, effect: act.effect }, caster: "p", targets: [], xVal: 1 };
    s = resolveEff(s, reflectedItem);
    return s;
  }

  // ── Non-mana activated abilities: pay cost, push to stack, open priority window ──
  // From here on the case is who-aware (w) to support AI ('o') activation.

  // 0. Additional-cost preflight: reject activation before paying ANY cost if a
  // required additional cost cannot be paid (e.g. Orcish Mechanics: "sacrifice an
  // artifact" with none available). Must run before the tap/mana cost below so a
  // failed activation leaves the permanent untouched.
  if (act.cost.includes("sacArt") && !s[w].bf.some(c => isArt(c))) {
    return dlog(s, `${card.name}: no artifact available to sacrifice.`, "info");
  }
  if (act.cost.includes("sacCre") && !s[w].bf.some(c => isCre(c))) {
    return dlog(s, `${card.name}: no creature available to sacrifice.`, "info");
  }
  if (act.cost.includes("discardLastDrawn") && !s[w].hand.length) {
    return dlog(s, `${card.name}: no card to discard.`, "info");
  }
  // Gate to Phyrexia / Life Chisel: "Activate only during your upkeep".
  if (act.myUpkeepOnly && (s.phase !== PHASE.UPKEEP || s.active !== w)) {
    return dlog(s, `${card.name} can only be activated during your upkeep.`, "info");
  }
  // Gate to Phyrexia: "and only once each turn".
  if (act.onceEachTurn && (s.turnState.activatedOnceIids || []).includes(iid)) {
    return dlog(s, `${card.name} has already been activated this turn.`, "info");
  }

  // Sacrificed-card capture (Priest of Yawgmoth, Life Chisel): the resolving
  // effect needs the sacrificed permanent's stats, so it's threaded through
  // the ability item rather than re-derived after zMove strips it.
  let sacrificedCard = null;

  // 1. Tap cost
  if (act.cost.includes("T")) {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = { ...s, [w]: { ...s[w], bf: s[w].bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) } };
  }

  // 2. Sacrifice cost (e.g. Strip Mine: "T,sac"). Sacrifices the activating
  // permanent itself. Must happen before pushing to the stack so the source
  // is already gone by the time the ability resolves.
  if (act.cost.includes("sac") && !act.cost.includes("sacArt") && !act.cost.includes("sacCre")) {
    s = zMove(s, iid, w, w, "gy");
    s = dlog(s, `${card.name} sacrificed to activate its ability.`, "info");
  }

  // 2b. Sacrifice an artifact you control, not necessarily the activating
  // permanent itself (e.g. Orcish Mechanics: "T, Sacrifice an artifact:").
  // Adapted from Card-Forge/forge (o/orcish_mechanics.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no UI to choose which artifact; sacrifices the first one found.
  if (act.cost.includes("sacArt")) {
    const art = s[w].bf.find(c => isArt(c));
    sacrificedCard = art;
    s = zMove(s, art.iid, w, w, "gy");
    s = dlog(s, `${art.name} sacrificed to activate ${card.name}.`, "info");
  }

  // 2b'. Sacrifice a creature you control, not necessarily the activating
  // permanent itself (e.g. Gate to Phyrexia, Life Chisel, Fallen Angel:
  // "Sacrifice a creature:"). SIMPLIFICATION: no UI to choose which creature;
  // prefers any creature other than the activating permanent (so, e.g., Fallen
  // Angel doesn't sacrifice itself when another creature is available), falling
  // back to itself only if it's the only creature.
  if (act.cost.includes("sacCre")) {
    const cre = s[w].bf.find(c => isCre(c) && c.iid !== iid) || s[w].bf.find(c => isCre(c));
    sacrificedCard = cre;
    s = zMove(s, cre.iid, w, w, "gy");
    s = dlog(s, `${cre.name} sacrificed to activate ${card.name}.`, "info");
  }

  // 2e. Pay life as an additional cost (Book of Rass, Greed: "Pay 2 life:").
  if (act.cost.includes("payLife2")) {
    if (s[w].life < 2) return dlog(s, `${card.name}: not enough life to pay the cost.`, "info");
    const newLife = s[w].life - 2;
    s = { ...s, [w]: { ...s[w], life: newLife } };
    s = dlog(s, `${w} pays 2 life to activate ${card.name}.`, "info");
    if (newLife <= 0 && !s.over) s = { ...s, over: { winner: w === 'p' ? 'o' : 'p', reason: `${w} paid life down to 0` } };
  }

  // 2c. Exile this permanent as a cost (e.g. Feldon's Cane: "T, Exile this artifact:").
  // Adapted from Card-Forge/forge (f/feldons_cane.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (act.cost.includes("exile")) {
    s = zMove(s, iid, w, w, "exile");
    s = dlog(s, `${card.name} exiled to activate its ability.`, "info");
  }

  // 2d. Discard the last card drawn this turn as a cost (Jandor's Ring).
  // Adapted from Card-Forge/forge (j/jandors_ring.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: approximated as "the last card in the hand array" (hand is
  // append-only on draw) rather than tracking a dedicated per-turn lastDrawn field.
  if (act.cost.includes("discardLastDrawn")) {
    const h = s[w].hand;
    const last = h[h.length - 1];
    s = { ...s, [w]: { ...s[w], hand: h.slice(0, -1), gy: [...s[w].gy, last] } };
    s = dlog(s, `${card.name}: ${w} discards ${last.name}.`, "info");
  }

  // 3. Mana cost -- strip 'T', 'sac'-family tokens, and commas, parse remainder.
  // Any literal "X" is replaced with the paid xVal (Candelabra of Tawnos).
  const manaPart = act.cost
    .replace(/discardLastDrawn/g, "")
    .replace(/sacArt/g, "")
    .replace(/sacCre/g, "")
    .replace(/payLife2/g, "")
    .replace(/exile/g, "")
    .replace(/T/g, "")
    .replace(/sac/g, "")
    .replace(/,/g, "")
    .replace(/X/g, String(xValPaid))
    .trim();
  // Counter-cost abilities (e.g. Triskelion): cost is paid by removing a counter,
  // not by spending mana. The effect handler validates and removes the counter.
  if (manaPart && manaPart !== 'counter') {
    if (!canPay(s[w].mana, manaPart)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
    s = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, manaPart) } };
  }
  // Mana has been spent to activate a non-mana ability -- the snapshot is now
  // stale (it predates this payment). Clear it so UNDO_MANA_TAPS cannot refund
  // mana that was legitimately consumed by this activation.
  s = { ...s, manaTapSnapshot: null };

  // 4. Route EOT variants so CLEANUP expires them correctly.
  const effectOverride = act.effect === "pumpPower"     ? "pumpPowerEOT"
                       : act.effect === "pumpToughness" ? "pumpToughnessEOT"
                       : act.effect === "pumpSelf"      ? "pumpSelfEOT"
                       : act.effect === "pumpX"         ? "pumpXEOT"
                       : act.effect === "gainFlying"    ? "gainFlyingEOT"
                       : act.effect === "grantFlying"   ? "grantFlyingEOT"
                       : act.effect;

  // 5. Push to stack and open priority window (same pattern as CAST_SPELL).
  const abilityItem = {
    id: makeId(),
    card: { ...card, effect: effectOverride, mana: act.mana },
    caster: w,
    targets: tgt ? [tgt] : [],
    xVal: act.cost.includes("X") ? xValPaid : 1,
    chosenColor,
    isAbility: true,
    sacrificedCard,
  };
  if (act.onceEachTurn) {
    s = { ...s, turnState: { ...s.turnState, activatedOnceIids: [...(s.turnState.activatedOnceIids || []), iid] } };
  }
  s = { ...s, stack: [...s.stack, abilityItem], priorityWindow: true, priorityPasser: null };
  return dlog(s, `${card.name}: activated ${act.effect}.`, "effect");
}

case "CHOOSE_LOTUS_COLOR": {
  if (!s.pendingLotusIid) return s;
  const mp = { ...s.p.mana };
  mp[action.color] = (mp[action.color] || 0) + 3;
  let ns = { ...s, p: { ...s.p, mana: mp }, pendingLotus: false, pendingLotusIid: null, manaTapSnapshot: null };
  ns = zMove(ns, s.pendingLotusIid, 'p', 'p', 'gy');
  return dlog(ns, `Black Lotus adds 3${action.color}.`, "mana");
}

case "CANCEL_LOTUS": {
  if (!s.pendingLotus || !s.pendingLotusIid) return s;
  const ns = {
    ...s,
    p: {
      ...s.p,
      bf: s.p.bf.map(c => c.iid === s.pendingLotusIid ? { ...c, tapped: false } : c),
    },
    pendingLotus: false,
    pendingLotusIid: null,
    manaTapSnapshot: null,
  };
  return dlog(ns, "Black Lotus activation cancelled.", "info");
}

case "SET_PENDING_LOTUS": return { ...s, pendingLotus: true, pendingLotusIid: action.iid };

case "CITY_OF_BRASS_DAMAGE": {
  const ns = hurt(s, 'p', 1, 'City of Brass');
  return dlog(ns, 'City of Brass deals 1 damage to you.', 'damage');
}

case "CHOOSE_BOP_COLOR": {
  // Birds of Paradise color resolution. Adds 1 mana of chosen color. SYSTEMS.md S10
  const mp = { ...s.p.mana };
  mp[action.color] = (mp[action.color] || 0) + 1;
  return dlog({ ...s, p: { ...s.p, mana: mp }, pendingBop: false }, `Birds of Paradise adds 1${action.color}.`, "mana");
}

case "SET_PENDING_BOP": return { ...s, pendingBop: true };

case "CHOOSE_TUTOR": {
  const pt = s.pendingTutor;
  if (!pt) return s;
  const { caster, destination, reveal, shuffledLib } = pt;
  const chosen = shuffledLib.find(c => c.iid === action.iid);
  if (!chosen) return s;
  const remaining = shuffledLib.filter(c => c.iid !== action.iid);

  let ns = { ...s, pendingTutor: null };

  if (destination === 'hand') {
    ns = {
      ...ns,
      [caster]: {
        ...ns[caster],
        lib: remaining,
        hand: [...ns[caster].hand, { ...chosen, controller: caster }],
      },
    };
    const logMsg = reveal
      ? `${caster} tutors ${chosen.name} into hand.`
      : `${caster} searches their library and puts a card into hand.`;
    ns = dlog(ns, logMsg, 'effect');
  } else {
    const reshuffled = shuffle([...remaining]);
    ns = {
      ...ns,
      [caster]: {
        ...ns[caster],
        lib: [{ ...chosen, controller: caster }, ...reshuffled],
      },
    };
    const logMsg = reveal
      ? `${caster} tutors ${chosen.name} to top of library.`
      : `${caster} searches their library and places a card on top.`;
    ns = dlog(ns, logMsg, 'effect');
  }
  return ns;
}

case "DECLINE_TUTOR": {
  if (!s.pendingTutor) return s;
  const caster = s.pendingTutor.caster;
  let ns = { ...s, pendingTutor: null };
  ns = dlog(ns, `${caster} declines to find a card.`, 'effect');
  return ns;
}

case "CONFIRM_TRANSMUTE_SACRIFICE": {
  const pts = s.pendingTransmuteSacrifice;
  if (!pts) return s;
  const { caster } = pts;
  const art = s[caster].bf.find(c => c.iid === action.iid);
  if (!art) return s;

  let ns = zMove(s, art.iid, caster, caster, 'gy');
  const sacrificedCmc = art.cmc ?? 0;
  const shuttered = shuffle([...ns[caster].lib]);

  ns = {
    ...ns,
    [caster]: { ...ns[caster], lib: shuttered },
    pendingTransmuteSacrifice: null,
    pendingTutor: {
      caster,
      filter: 'artifact',
      destination: 'hand',
      reveal: true,
      shuffledLib: shuttered,
      _transmuteMode: true,
      _sacrificedCmc: sacrificedCmc,
    },
  };
  ns = dlog(ns, `${art.name} (CMC ${sacrificedCmc}) is sacrificed. Searching library for an artifact.`, 'effect');
  return ns;
}

case "DECLINE_TRANSMUTE_SACRIFICE": {
  if (!s.pendingTransmuteSacrifice) return s;
  let ns = { ...s, pendingTransmuteSacrifice: null };
  ns = dlog(ns, 'Transmute Artifact fizzles — no artifact sacrificed.', 'effect');
  return ns;
}

case "CHOOSE_TUTOR_TRANSMUTE": {
  const pt = s.pendingTutor;
  if (!pt || !pt._transmuteMode) return s;
  const { caster, shuffledLib, _sacrificedCmc } = pt;
  const chosen = shuffledLib.find(c => c.iid === action.iid);
  if (!chosen) return s;
  const remaining = shuffledLib.filter(c => c.iid !== action.iid);
  const chosenCmc = chosen.cmc ?? 0;
  const diff = chosenCmc - (_sacrificedCmc ?? 0);

  let ns = {
    ...s,
    pendingTutor: null,
    [caster]: { ...s[caster], lib: remaining },
  };
  ns = dlog(ns, `${chosen.name} (CMC ${chosenCmc}) found via Transmute Artifact.`, 'effect');

  if (diff <= 0) {
    const pArr = {
      ...chosen,
      controller: caster,
      tapped: false,
      summoningSick: !hasKw(chosen, 'HASTE'),
      attacking: false,
      blocking: null,
      damage: 0,
      counters: { ...(chosen.etbCounters || {}) },
    };
    ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
    ns = dlog(ns, `${chosen.name} enters the battlefield (no additional payment required).`, 'effect');
    return ns;
  }

  ns = {
    ...ns,
    pendingTransmutePay: { caster, tutored: chosen, required: diff },
  };
  ns = dlog(ns, `${diff} additional mana required to put ${chosen.name} onto the battlefield.`, 'effect');
  return ns;
}

case "CONFIRM_TRANSMUTE_PAY": {
  const ptp = s.pendingTransmutePay;
  if (!ptp) return s;
  const { caster, tutored, required } = ptp;
  const pool = s[caster].mana;
  const totalMana = Object.values(pool).reduce((a, b) => a + b, 0);
  if (totalMana < required) return s;

  const drainedPool = { ...pool };
  let toDrain = required;
  for (const c of ['C', 'G', 'R', 'B', 'U', 'W']) {
    const take = Math.min(drainedPool[c] ?? 0, toDrain);
    drainedPool[c] = (drainedPool[c] ?? 0) - take;
    toDrain -= take;
    if (toDrain === 0) break;
  }

  const pArr = {
    ...tutored,
    controller: caster,
    tapped: false,
    summoningSick: !hasKw(tutored, 'HASTE'),
    attacking: false,
    blocking: null,
    damage: 0,
    counters: { ...(tutored.etbCounters || {}) },
  };
  let ns = {
    ...s,
    [caster]: {
      ...s[caster],
      mana: drainedPool,
      bf: [...s[caster].bf, pArr],
    },
    pendingTransmutePay: null,
    manaTapSnapshot: null,
  };
  ns = dlog(ns, `${tutored.name} enters the battlefield. (${required} mana paid.)`, 'effect');
  return ns;
}

case "DECLINE_TRANSMUTE_PAY": {
  const ptp = s.pendingTransmutePay;
  if (!ptp) return s;
  const { caster, tutored } = ptp;

  let ns = s;
  if (ns.manaTapSnapshot) {
    const snap = ns.manaTapSnapshot;
    const restoredBf = ns[caster].bf.map(c => {
      const e = snap.pBfTapped.find(x => x.iid === c.iid);
      return e ? { ...c, tapped: e.tapped } : c;
    });
    ns = { ...ns, [caster]: { ...ns[caster], bf: restoredBf, mana: { ...snap.pMana } }, manaTapSnapshot: null };
  }

  ns = {
    ...ns,
    [caster]: { ...ns[caster], gy: [...ns[caster].gy, { ...tutored, controller: caster }] },
    pendingTransmutePay: null,
  };
  ns = dlog(ns, `${tutored.name} is put into the graveyard.`, 'effect');
  return ns;
}

case "USE_CHANNEL": {
  const w = action.who;
  if (!s[w]?.channelActive) return s;
  if (s[w].life <= 1) return dlog(s, "Channel: not enough life.", "effect");
  s = hurt(s, w, 1, "Channel");
  s = { ...s, [w]: { ...s[w], mana: { ...s[w].mana, C: (s[w].mana.C || 0) + 1 } } };
  return dlog(s, `${w} pays 1 life to add {C} (Channel).`, "mana");
}

case "RESOLVE_CHOICE": {
  if (!s.pendingChoice) return s;
  const choice = s.pendingChoice;
  // The re-inserted trigger sits at the front of the queue (put there by resolveTrigger)
  const [pendingTrigger, ...remainingQueue] = s.triggerQueue;
  const sourceCard = [...s.p.bf, ...s.o.bf].find(c => c.iid === choice.sourceCardId);
  const ability = sourceCard?.triggeredAbilities?.find(a => pendingTrigger?.triggerId === a.id);

  if (!ability) return { ...s, pendingChoice: null, triggerQueue: remainingQueue };

  const selectedOption = ability.effect.options?.find(o => o.id === action.optionId);
  if (!selectedOption) return s;

  let ns = resolveTriggeredEffect(
    { ...s, pendingChoice: null, triggerQueue: remainingQueue },
    sourceCard,
    selectedOption.effect,
    pendingTrigger?.eventPayload || {}
  );
  return processTriggerQueue(ns);
}

case "UPKEEP_CHOICE_RESOLVE": {
  const { choice } = action; // "PAY_GGGG" | "TAKE_DAMAGE"
  let ns = { ...s, pendingUpkeepChoice: null };
  if (choice === "PAY_GGGG") {
    ns = { ...ns, p: { ...ns.p, mana: { ...ns.p.mana, G: (ns.p.mana.G ?? 0) - 4 } } };
    ns = dlog(ns, "Force of Nature: paid GGGG upkeep.", "mana");
  } else {
    ns = hurt(ns, "p", 8, "Force of Nature");
    ns = dlog(ns, "Force of Nature: player takes 8 damage.", "damage");
  }
  return ns;
}

case "CONDITIONAL_COUNTER_CHOICE": {
  // action.paid: boolean
  if (!s.pendingConditionalCounter) return s;
  const { cardId, cardName, stackItemId, targetCaster, cost } = s.pendingConditionalCounter;
  let ns = { ...s, pendingConditionalCounter: null };

  if (action.paid) {
    // Deduct `cost` generic mana from cheapest available colors (C first, then GRBUOW)
    let remaining = cost;
    const pool = { ...ns[targetCaster].mana };
    for (const col of ['C','G','R','B','U','W']) {
      if (remaining <= 0) break;
      const take = Math.min(pool[col] || 0, remaining);
      pool[col] = (pool[col] || 0) - take;
      remaining -= take;
    }
    ns = { ...ns, [targetCaster]: { ...ns[targetCaster], mana: pool } };
    ns = dlog(ns, `${targetCaster} pays {${cost}}. ${cardName} is countered.`, "effect");
    // Targeted spell remains on stack; Force Spike / Power Sink already removed by RESOLVE_STACK.
  } else {
    // Targeted spell is countered
    const top = ns.stack.find(i => i.id === stackItemId);
    if (top) {
      ns = { ...ns,
        stack: ns.stack.filter(i => i.id !== stackItemId),
        [targetCaster]: { ...ns[targetCaster], gy: [...ns[targetCaster].gy, { ...top.card }] },
      };
      ns = dlog(ns, `${targetCaster} does not pay. ${cardName} counters ${top.card?.name}.`, "effect");
    }
    // Power Sink additional effect: tap all lands and drain mana if player declined
    if (cardId === 'power_sink') {
      ns = { ...ns, [targetCaster]: {
        ...ns[targetCaster],
        bf: ns[targetCaster].bf.map(c => isLand(c) ? { ...c, tapped: true } : c),
        mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
      }};
      ns = dlog(ns, `Power Sink taps all ${targetCaster}'s lands and drains their mana pool.`, "effect");
    }
  }
  return ns;
}

case "SPHERE_TRIGGER_RESOLVE": {
  if (!s.pendingSphereTrigger) return s;
  const { sphereCardId: _scid, sphereCardName, controller, queue } = s.pendingSphereTrigger;
  const nextTrigger = queue && queue.length > 0
    ? { sphereCardId: queue[0].sphereCardId, sphereCardName: queue[0].sphereCardName, controller: queue[0].controller, queue: queue.slice(1) }
    : null;
  let ns = { ...s, pendingSphereTrigger: nextTrigger };
  if (action.paid) {
    let remaining = 1;
    const pool = { ...ns[controller].mana };
    for (const col of ['C','G','R','B','U','W']) {
      if (remaining <= 0) break;
      const take = Math.min(pool[col] || 0, remaining);
      pool[col] = (pool[col] || 0) - take;
      remaining -= take;
    }
    ns = { ...ns, [controller]: { ...ns[controller], mana: pool } };
    ns = dlog(ns, `${controller} pays {1} for ${sphereCardName}.`, "effect");
    ns = hurt(ns, controller, -1, sphereCardName);
  } else {
    ns = dlog(ns, `${controller} declines ${sphereCardName} trigger.`, "effect");
  }
  return ns;
}

case 'SANDBOX_FORCE_HAND': {
  // Sandbox-only: inject cards into a player's hand and optionally set mana.
  // action.who:          'p' | 'o'  (defaults to 'p')
  // action.iids:         string[]   -- iids of cards in that player's lib to move to hand
  // action.cards:        object[]   -- full card objects to add directly to hand
  // action.cardIds:      string[]   -- CARD_DB ids to instantiate and add to hand
  // action.mana:         ManaPool   -- set (not add) specific mana amounts for that player
  // action.withManaSupport: boolean -- auto-add 5 of each color to cover injected cards
  const who = action.who || 'p';
  let ns = s;
  if (action.iids && action.iids.length) {
    const iidSet = new Set(action.iids);
    const moved  = ns[who].lib.filter(c => iidSet.has(c.iid));
    const newLib = ns[who].lib.filter(c => !iidSet.has(c.iid));
    ns = { ...ns, [who]: { ...ns[who], hand: [...ns[who].hand, ...moved], lib: newLib } };
  }
  if (action.cards && action.cards.length) {
    ns = { ...ns, [who]: { ...ns[who], hand: [...ns[who].hand, ...action.cards] } };
  }
  if (action.cardIds && action.cardIds.length) {
    const newCards = action.cardIds.map(id => makeCardInstance(id, who)).filter(Boolean);
    ns = { ...ns, [who]: { ...ns[who], hand: [...ns[who].hand, ...newCards] } };
  }
  if (action.mana) {
    ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, ...action.mana } } };
  }
  if (action.withManaSupport) {
    ns = { ...ns, [who]: { ...ns[who], mana: { W:5, U:5, B:5, R:5, G:5, C:5 } } };
  }
  return ns;
}

case 'GEMINI_LOG': {
  // Sandbox-only: append Gemini diagnostic entries to the game log.
  // action.entries: Array<{ text: string, type: string }>
  // Does not mutate any game state other than appending to s.log.
  if (!import.meta.env?.DEV && !import.meta.env?.VITE_SANDBOX) return s;
  const entries = (action.entries ?? []).map(e => ({
    text: e.text,
    type: e.type ?? 'gemini',
    turn: s.turn,
  }));
  return { ...s, log: [...s.log.slice(-100), ...entries] };
}

case 'DEBUG_SET_ACTIVE': {
  // Sandbox-only: force arbitrary state patches. Used by e2e tests.
  // action.who   -- sets active player (legacy, still supported)
  // action.patch -- spread into state (new; used by tutor/transmute tests)
  if (action.patch) return { ...s, ...action.patch };
  if (action.who) return { ...s, active: action.who };
  return s;
}

case 'SET_PHASE_FOR_TEST': {
  // Also clears priorityWindow and stack so ADVANCE_PHASE is not blocked.
  return { ...s, phase: action.phase, active: action.active ?? s.active,
           priorityWindow: false, stack: [], priorityPasser: null };
}

case 'DEBUG_SET_CONDITIONAL_COUNTER': {
  if (process.env.NODE_ENV !== 'test' && !import.meta.env?.DEV) return s;
  return { ...s, pendingConditionalCounter: {
    cardId: action.cardId,
    cardName: action.cardName,
    stackItemId: action.stackItemId,
    targetCaster: action.targetCaster,
    cost: action.cost,
    canPay: action.canPay,
  }};
}

case 'DEBUG_PATCH_CARD': {
  // Sandbox/dev-only: patch arbitrary fields onto a card on the battlefield.
  if (process.env.NODE_ENV !== 'development' && !import.meta.env?.DEV) return s;
  const { iid, patch } = action;
  for (const who of ['p', 'o']) {
    if (s[who].bf.some(c => c.iid === iid)) {
      return { ...s, [who]: { ...s[who], bf: s[who].bf.map(c => c.iid === iid ? { ...c, ...patch } : c) } };
    }
  }
  return s;
}

default: return s;

}
}

export function activateAbility(gameState, creatureId, ability, targetOrChoice) {
  const newState = JSON.parse(JSON.stringify(gameState));
  const creature = newState.p_battlefield.find(c => c.id === creatureId);

  if (!creature) {
    console.error(`activateAbility: creature ${creatureId} not found on p_battlefield`);
    return newState;
  }

  // Tap the creature as part of the cost
  creature.isTapped = true;

  // Resolve the effect
  if (ability.type === 'damage_target') {
    const target = targetOrChoice;
    if (target.type === 'creature') {
      const targetCreature =
        newState.p_battlefield.find(c => c.id === target.id) ||
        newState.a_battlefield.find(c => c.id === target.id);
      if (targetCreature) {
        targetCreature.damage = (targetCreature.damage || 0) + 1;
      } else {
        console.error(`activateAbility: target creature ${target.id} not found`);
      }
    } else if (target.type === 'player') {
      const playerKey = target.player === 'p' ? 'p' : 'a';
      newState[`${playerKey}_hp`] -= 1;
    }
  } else if (ability.type === 'mana_any_color') {
    const color = targetOrChoice?.color;
    if (!color) {
      console.error('activateAbility: mana_any_color called without a color choice');
      return newState;
    }
    newState.p_mana_pool[color] = (newState.p_mana_pool[color] || 0) + 1;
  } else if (ability.type === 'mana_green') {
    newState.p_mana_pool.G = (newState.p_mana_pool.G || 0) + 1;
  } else {
    console.error(`activateAbility: unknown ability type "${ability.type}"`);
  }

  return newState;
}

export default { duelReducer, buildDuelState, PHASE_SEQ, PHASE_LBL, COMBAT_PHASES };
