// src/engine/DuelCore.js
// Central simulation engine ? the ONLY authority for GameState mutation.
// Per SYSTEMS.md S1 and MECHANICS_INDEX.md S1.1
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md S7):
//   - ONLY this module may mutate GameState
//   - All other systems submit GameAction objects
//   - Deterministic given identical GameState + rngSeed + action sequence

import { CARD_DB, ARCHETYPES } from '../data/cards.js';
import { TOKEN_DB } from '../data/tokens.js';
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

// isCre/isLand read the baked typeEff/subtypeEff-adjacent typeEff field (see
// recomputeTypeEffects below) when present, falling back to the printed type.
// CAUTION: isLand intentionally keeps the strict-equality branch alongside the
// substring branch -- Living Lands/Kormus Bell produce a typeEff of "Land Creature",
// which must still satisfy isLand. See docs/SYSTEMS.md S18.9 for the full audit of
// call sites whose behavior changes now that isLand can be true for a non-strict match.
export const isLand   = c => { const t = c?.typeEff ?? c?.type; return t === "Land" || !!t?.includes("Land"); };
export const isCre    = c => !!(c?.typeEff ?? c?.type)?.includes("Creature");
// NOTE (observed, not fixed -- out of scope for this prompt): Mishra's Factory's
// animateLand ability (below, ~line 3963) sets power/toughness/subtype directly but
// never changes card.type, and UI components read a separate ad-hoc `isAnimatedLand`
// flag instead of isCre/isLand. isCre(mishrasFactory) returns false even while
// animated, so DECLARE_ATTACKER's `!isCre(c)` guard blocks it from attacking. Predates
// this prompt and is unrelated to the Living Lands/Kormus Bell/Blood Moon/Evil
// Presence gap being closed here.
export const isInst   = c => c?.type === "Instant";
export const isSort   = c => c?.type === "Sorcery";
export const isArt    = c => !!c?.type?.includes("Artifact");
export const isEnch   = c => c?.type?.startsWith("Enchantment");
export const isPerm   = c => isCre(c) || isArt(c) || isEnch(c) || isLand(c);
// isLegendary: CR 205.4a -- Legendary is a supertype, printed as a prefix on
// the type line ("Legendary Creature", "Legendary Artifact", ...). Same
// typeEff-first fallback as isCre/isLand above so a future type-changing
// effect that adds "Legendary" would be picked up immediately -- no such
// effect exists in this pool yet. Backs checkLegendRule's CR 704.5j SBA
// below; no card in cards.js sets this yet (infra-only, see CURRENT_SPRINT.md).
export const isLegendary = c => !!(c?.typeEff ?? c?.type)?.includes("Legendary");
// Maps a source card object to the coarse sourceType bucket used by hurt()'s
// meta param (damageBySourceType tracking, damage shields, CoP-style effects).
export function inferSourceType(card) {
  if (!card) return null;
  if (card.type === "Planeswalker") return 'planeswalker';
  if (isCre(card)) return 'creature';
  if (isArt(card)) return 'artifact';
  if (isEnch(card)) return 'enchantment';
  if (isLand(card)) return 'land';
  if (isInst(card) || isSort(card)) return 'spell';
  return 'spell';
}
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

// Token instantiation -- same instance shape as makeCardInstance, sourced from
// TOKEN_DB instead of CARD_DB. isToken:true drives the CR 111.7 "ceases to
// exist once it leaves the battlefield" rule in zMove below.
export function makeTokenInstance(tokenId, controller) {
const def = TOKEN_DB.find(t => t.tokenId === tokenId);
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
isToken: true,
};
}

// Creates `count` copies of tokenId on controller's battlefield. sourceIid,
// when given, tags each token so later effects can distinguish tokens made by
// this specific permanent (e.g. Tetravus's remembered-token tracking) from
// any other source of the same token type.
export function createToken(state, tokenId, count, controller, sourceIid = null) {
let ns = state;
for (let i = 0; i < count; i++) {
  const token = makeTokenInstance(tokenId, controller);
  if (!token) continue;
  const ts = (ns.layerClock ?? 0) + 1;
  const inst = { ...token, enterTs: ts, sourceIid: sourceIid ?? undefined };
  ns = { ...ns, layerClock: ts, [controller]: { ...ns[controller], bf: [...ns[controller].bf, inst] } };
}
return checkLegendRule(recomputeTypeEffects(ns));
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

// Gloom: "White spells cost {3} more to cast. Activated abilities of white
// enchantments cost {3} more to activate." Appending a plain digit string to
// the end of a raw cost string is safe against parseMana's digit-run
// accumulation and the activated-ability cost-stripping regex chain -- see
// docs/ENGINE_CONTRACT_SPEC.md for the full argument. Scans the battlefield
// fresh on every call (no caching) so the tax always reflects current board
// state. targetCard is the card being cast (spells) or the permanent whose
// ability is being activated (abilities) -- never Gloom itself.
export function applyCostTax(costStr, targetCard, state, requireEnchantment = false) {
if (!costStr) return costStr;
const gloomOut = [...state.p.bf, ...state.o.bf].some(x => x.id === 'gloom');
if (!gloomOut) return costStr;
if (targetCard.color !== 'W') return costStr;
if (requireEnchantment && !isEnch(targetCard)) return costStr;
return costStr + '3';
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
// Ydwen Efreet: lost the coin flip this combat -- can't block again this turn.
if (bl.cantBlockThisTurn) return false;
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
// Read color through computeCharacteristics when state is available so Layer-5
// color-setting effects (Kormus Bell: animated Swamps are black) are correctly
// enforced by protection/Fear, not just the printed .color. See docs/SYSTEMS.md S18.9.
const atColor = state ? computeCharacteristics(at, state).color : at.color;
const blColor = state ? computeCharacteristics(bl, state).color : bl.color;
if (atProt.some(q => (PROT_MAP[q] || q) === blColor || (q === 'artifact' && isArt(bl)))) return false;
if (blProt.some(q => (PROT_MAP[q] || q) === atColor || (q === 'artifact' && isArt(at)))) return false;
// Invisibility: can only be blocked by Walls.
const atInvisible = at.enchantments?.some(e => e.mod?.invisibility);
if (atInvisible && !bl.subtype?.includes('Wall')) return false;
if (hasKw(at, KEYWORDS.FEAR.id) && blColor !== "B" && !isArt(bl)) return false;
// Unblockable EOT grant (e.g. Tawnos's Wand).
if (at.eotBuffs?.some(b => b.unblockable)) return false;
// Seeker: "Enchanted creature can't be blocked except by artifact creatures
// and/or white creatures."
// Adapted from Card-Forge/forge (s/seeker.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (at.enchantments?.some(e => e.mod?.blockRestrictionArtifactOrWhite) && bl.color !== "W" && !isArt(bl)) return false;
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
// Amrou Kithkin / Bog Rats / Elder Spawn: attacker-side "can't be blocked by
// ..." restrictions declared via card.mod. cantBlockedByPower and
// cantBlockedByWalls existed on cards.js entries but were never read anywhere
// until this check was added.
// Adapted from Card-Forge/forge (a/amrou_kithkin.txt, b/bog_rats.txt, e/elder_spawn.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (at.mod?.cantBlockedByPower !== undefined && getPow(bl, state) >= at.mod.cantBlockedByPower) return false;
if (at.mod?.cantBlockedByWalls && bl.subtype?.includes('Wall')) return false;
if (at.mod?.cantBlockedByColor && blColor === at.mod.cantBlockedByColor) return false;
// Raging River: non-flying blockers can only block attackers on their pile's side.
// Flying blockers are unaffected. Unpiled post-divide entrants cannot block sided attackers.
if (at.riverSide && !hasKw(bl, KEYWORDS.FLYING.id, state)) {
  if (bl.riverPile !== at.riverSide) return false;
}
return true;
}

// --- STATE MUTATION HELPERS ---------------------------------------------------

export function dlog(s, text, type = "info") {
return { ...s, log: [...s.log.slice(-100), { text, type, turn: s.turn }] };
}

// Returns the battlefield permanent that should absorb damage described by `meta`
// instead of player `who`, or null if no redirection applies. General hook: any
// card can opt in by setting `damageRedirect: { from: <'artifacts'|'unblockedCreatures'> }`
// in its card-data entry; the redirect only applies while the permanent is untapped
// (both current cards -- Martyrs of Korlis, Veteran Bodyguard -- read "as long as
// this creature is untapped" on their Oracle text). No further engine changes are
// needed for future cards using this pattern, as long as they fit one of these two
// `from` shapes.
function getDamageRedirectTarget(s, who, meta) {
  if (!meta) return null;
  const candidates = (s[who]?.bf || []).filter(c => c.damageRedirect && !c.tapped);
  for (const c of candidates) {
    const { from } = c.damageRedirect;
    if (from === 'artifacts' && meta.sourceType === 'artifact') return c;
    if (from === 'unblockedCreatures' && meta.sourceType === 'creature' && meta.combat && meta.unblocked) return c;
  }
  return null;
}

// Circle of Protection / Eye for an Eye / Greater Realm of Preservation: builds
// the "source of your choice" matcher for a shield-granting card. `card.
// damageShieldColors` (e.g. ['B']) matches by colorEff-or-color; `card.
// damageShieldTypes` (e.g. ['artifact']) matches by inferSourceType. Neither set
// (Eye for an Eye) matches any source. See docs/SYSTEMS.md -- Damage Shields.
function damageShieldMatches(card, candidate) {
  const colors = card.damageShieldColors;
  const types = card.damageShieldTypes;
  if (!colors && !types) return true;
  if (colors && colors.includes(candidate.colorEff ?? candidate.color)) return true;
  if (types && types.includes(inferSourceType(candidate))) return true;
  return false;
}

// Legal "source of your choice" pool for a damage-shield activation: every
// permanent on either battlefield plus every spell currently on the stack that
// matches the shield card's filter. Spell entries carry `controller` (the
// caster) alongside the usual card fields so a chosen spell target can still
// be attributed correctly if it goes on to deal damage (Eye for an Eye's
// redirect needs "that source's controller").
function buildDamageShieldPool(state, card) {
  const perms = [...state.p.bf, ...state.o.bf].filter(c => damageShieldMatches(card, c));
  const spells = state.stack
    .map(item => ({ ...item.card, controller: item.caster }))
    .filter(c => damageShieldMatches(card, c));
  return [...perms, ...spells];
}

// Shared pool-building + AI-vs-human branching for chooseDamageShieldSource
// (Circle of Protection / Eye for an Eye / Greater Realm of Preservation --
// shields the caster) and chooseDamageShieldSourceForTarget (Jade Monolith --
// shields a targeted creature). tgtC is present only for the latter; its
// presence selects turnState.creatureDamageShields[tgtC.iid] as the store
// instead of turnState.damageShields[caster], and produces the
// { mode:'redirect', redirectToPlayer: caster } creature-shield entry shape
// instead of the player-shield entry shape. See docs/ENGINE_CONTRACT_SPEC.md.
function resolveDamageShieldChoice(ns, card, caster, tgtC) {
  const pool = buildDamageShieldPool(ns, card);
  if (!pool.length) {
    return dlog(ns, `${card.name}: no legal source to choose -- fizzles.`, "effect");
  }
  // SIMPLIFICATION: no UI exists for the opponent to browse this picker (same
  // convention as other "no UI to choose which X" auto-decides in this file,
  // e.g. sacArt/sacCre above); the opponent auto-chooses the first legal
  // source instead of opening pendingDamageShieldChoice (which only the human
  // player's screens render).
  if (caster === 'o') {
    const chosen = pool[0];
    if (tgtC) {
      const entry = { mode: 'redirect', chosenSourceIid: chosen.iid, redirectToPlayer: caster, shieldSourceIid: card.iid, shieldSourceName: card.name };
      ns = { ...ns, turnState: { ...ns.turnState, creatureDamageShields: { ...ns.turnState.creatureDamageShields, [tgtC.iid]: [...(ns.turnState.creatureDamageShields?.[tgtC.iid] || []), entry] } } };
    } else {
      const entry = {
        chosenSourceIid: chosen.iid,
        chosenSourceController: chosen.controller,
        mode: card.damageShieldMode || 'prevent',
        shieldSourceIid: card.iid,
        shieldSourceName: card.name,
        ...(card.gainLifeOnPrevent ? { gainLifeOnPrevent: true } : {}),
      };
      ns = { ...ns, turnState: { ...ns.turnState, damageShields: { ...ns.turnState.damageShields, [caster]: [...(ns.turnState.damageShields?.[caster] || []), entry] } } };
    }
    return dlog(ns, `${card.name}: shields against ${chosen.name}.`, "effect");
  }
  return {
    ...ns,
    pendingDamageShieldChoice: {
      caster,
      mode: card.damageShieldMode || 'prevent',
      shieldSourceIid: card.iid,
      shieldSourceName: card.name,
      ...(card.gainLifeOnPrevent ? { gainLifeOnPrevent: true } : {}),
      ...(tgtC ? { tgtIid: tgtC.iid } : {}),
      pool,
    },
  };
}

// Applies combat damage to a creature, consuming its flat damageShield first (if any).
// Used at the resolveCombat call sites, which mutate c.damage inline rather than via hurt().
// Adapted from Card-Forge/forge (a/alabaster_potion.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
function dmgWithShield(c, amount) {
  const shield = c.damageShield || 0;
  if (shield <= 0 || amount <= 0) return { damage: c.damage + amount };
  const prevented = Math.min(shield, amount);
  return { damage: c.damage + (amount - prevented), damageShield: shield - prevented };
}

// Protection-from-quality check (S17.6 DEBT extension -- see
// docs/ENGINE_CONTRACT_SPEC.md). Reads target protection through
// computeCharacteristics so Aura-granted protection (the Ward cycle,
// Artifact Ward) is respected, not just intrinsic card.protection. Covers
// the "artifact" type-quality alongside the pre-existing color qualities.
export function isProtectedFromSource(target, sourceCard, state) {
  const prot = computeCharacteristics(target, state).protection;
  if (prot.some(q => q === 'artifact' && isArt(sourceCard))) return true;
  const PROT_MAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
  const srcColor = state ? computeCharacteristics(sourceCard, state).color : sourceCard.color;
  return prot.some(q => (PROT_MAP[q] || q) === srcColor);
}

// Creature-side damage shields (Jade Monolith / Personal Incarnation): mirrors
// hurt()'s player-level turnState.damageShields, but keyed by creature iid and
// checked by hurtCreature() BEFORE dmgWithShield()'s separate flat-shield system.
// Two entry shapes -- see docs/ENGINE_CONTRACT_SPEC.md -- Creature Damage Shields:
//   { mode: 'redirect', chosenSourceIid, redirectToPlayer, shieldSourceIid, shieldSourceName }
//   { mode: 'redirectPoint', redirectToPlayer, shieldSourceIid, shieldSourceName }
//
// Protection is a static property, not a consumable resource -- unlike the
// shield passes below, a protection match prevents the ENTIRE amount and
// never consumes a creatureDamageShields entry (S17.6.3/T extension).
export function consumeCreatureDamageShields(state, targetIid, amt, srcMeta) {
  let ns = state;
  const targetCreature = ns.p.bf.find(c => c.iid === targetIid) || ns.o.bf.find(c => c.iid === targetIid);
  const sourceCard = srcMeta?.sourceIid
    ? (getBF(ns, srcMeta.sourceIid) || ns.stack.find(item => item.card?.iid === srcMeta.sourceIid)?.card)
    : null;
  if (targetCreature && sourceCard && isProtectedFromSource(targetCreature, sourceCard, ns)) {
    const quality = isArt(sourceCard) ? 'artifact' : ({ W:'white', U:'blue', B:'black', R:'red', G:'green' }[computeCharacteristics(sourceCard, ns).color] || 'colorless');
    ns = dlog(ns, `${targetCreature.name} is protected from ${sourceCard.name} (protection from ${quality}).`, 'effect');
    return { state: ns, remainingAmt: 0 };
  }
  const shields = ns.turnState.creatureDamageShields?.[targetIid] || [];
  if (!shields.length) return { state: ns, remainingAmt: amt };

  // Exact-source pass first (Jade Monolith): consumes the whole event.
  const exactIdx = shields.findIndex(sh => sh.mode === 'redirect' && sh.chosenSourceIid === srcMeta?.sourceIid);
  if (exactIdx >= 0) {
    const shield = shields[exactIdx];
    const remaining = [...shields.slice(0, exactIdx), ...shields.slice(exactIdx + 1)];
    ns = { ...ns, turnState: { ...ns.turnState, creatureDamageShields: { ...ns.turnState.creatureDamageShields, [targetIid]: remaining } } };
    ns = hurt(ns, shield.redirectToPlayer, amt, shield.shieldSourceName, null);
    ns = dlog(ns, `${shield.shieldSourceName}: redirects ${amt} damage to ${shield.redirectToPlayer}.`, 'effect');
    return { state: ns, remainingAmt: 0 };
  }

  // Point-redirect pass, only if no exact-source match: consume 1 point per
  // shield, FIFO (array order = add order), until remainingAmt or shields run out.
  let remainingAmt = amt;
  while (remainingAmt > 0) {
    const arr = ns.turnState.creatureDamageShields?.[targetIid] || [];
    const idx = arr.findIndex(sh => sh.mode === 'redirectPoint');
    if (idx < 0) break;
    const shield = arr[idx];
    const nextArr = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    ns = { ...ns, turnState: { ...ns.turnState, creatureDamageShields: { ...ns.turnState.creatureDamageShields, [targetIid]: nextArr } } };
    ns = hurt(ns, shield.redirectToPlayer, 1, shield.shieldSourceName, null);
    ns = dlog(ns, `${shield.shieldSourceName}: redirects 1 damage to ${shield.redirectToPlayer}.`, 'effect');
    remainingAmt -= 1;
  }
  return { state: ns, remainingAmt };
}

// Creature-damage choke point (Jade Monolith / Personal Incarnation): checks
// turnState.creatureDamageShields first via consumeCreatureDamageShields, then
// applies any remaining amount as a raw damage mutation and runs checkDeath
// once. The sole migration target for what used to be dozens of inline
// creature-damage mutations throughout resolveEff -- NOT a replacement for
// dmgWithShield()'s flat-shield system, which remains separate and is checked
// afterward at its own 9 call sites. See docs/ENGINE_CONTRACT_SPEC.md --
// Creature Damage Shields.
export function hurtCreature(state, targetIid, amt, src = "", meta = null) {
  const inP = state.p.bf.some(c => c.iid === targetIid);
  const inO = state.o.bf.some(c => c.iid === targetIid);
  if (!inP && !inO) {
    console.error(`[DuelCore] hurtCreature: target ${targetIid} not found`);
    return state;
  }
  const { state: ns0, remainingAmt } = consumeCreatureDamageShields(state, targetIid, amt, meta);
  let ns = ns0;
  if (remainingAmt > 0) {
    const side = inP ? 'p' : 'o';
    ns = { ...ns, [side]: { ...ns[side], bf: ns[side].bf.map(c => {
      if (c.iid !== targetIid) return c;
      const bumped = c.damage + remainingAmt;
      return { ...c, damage: bumped };
    }) } };
  }
  return checkDeath(ns);
}

// Land-destruction choke point (Pyramids): checks turnState.landDestructionShields
// first, consuming the FIRST entry (FIFO) if present -- the land survives and no
// zMove happens. Otherwise moves the land to its owner's graveyard as before.
// The sole migration target for what used to be ad hoc zMove(...,"gy") calls
// scattered across 8 land-destroy mechanics. `src`, when given, produces the
// default "<src> destroys <land>." dlog; pass meta.message to override with a
// site's exact pre-existing wording, or omit both to stay silent (mass-destroy
// loops that already log their own single batch message). See
// docs/ENGINE_CONTRACT_SPEC.md -- Land Destruction.
export function destroyLand(state, targetIid, src = "", meta = null) {
  const inP = state.p.bf.some(c => c.iid === targetIid);
  const inO = state.o.bf.some(c => c.iid === targetIid);
  if (!inP && !inO) {
    console.error(`[DuelCore] destroyLand: target ${targetIid} not found`);
    return state;
  }
  const side = inP ? 'p' : 'o';
  const tgtC = state[side].bf.find(c => c.iid === targetIid);
  const shields = state.turnState.landDestructionShields?.[targetIid] || [];
  if (shields.length) {
    const [shield, ...rest] = shields;
    const ns = { ...state, turnState: { ...state.turnState, landDestructionShields: { ...state.turnState.landDestructionShields, [targetIid]: rest } } };
    return dlog(ns, `${shield.shieldSourceName}: ${tgtC.name} is not destroyed.`, 'effect');
  }
  let ns = zMove(state, targetIid, side, side, "gy");
  const message = meta?.message ?? (src ? `${src} destroys ${tgtC.name}.` : null);
  if (message) ns = dlog(ns, message, "effect");
  return ns;
}

export function hurt(s, who, amt, src = "", meta = null) {
// Lich: "If you would gain life, draw that many cards instead."
// Adapted from Card-Forge/forge (l/lich.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (amt < 0 && s[who].lichActive) {
  return drawD(dlog(s, `${who}'s Lich: draws ${-amt} card(s) instead of gaining life.`, "effect"), who, -amt);
}
// Forethought Amulet: "If an instant or sorcery source would deal 3 or more
// damage to you, it deals 2 damage to you instead." A replacement effect
// (reduces the amount), not prevention -- turnState.damageShields is built
// for full prevention keyed by a specific chosen source (CoP-style, checked
// just below), not this "any qualifying source, always active" reduction, so
// it doesn't fit that shape. Narrowly scoped: only checked when a
// Forethought Amulet with a damageReplacement field is actually in play, so
// it can't affect any other card's damage math.
// Adapted from Card-Forge/forge (f/forethought_amulet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (amt > 0 && meta?.sourceType) {
  const amulet = s[who].bf.find(c => c.name === 'Forethought Amulet' && c.damageReplacement);
  if (amulet) {
    const dr = amulet.damageReplacement;
    if (dr.sourceTypes.includes(meta.sourceType) && amt >= dr.minAmount) {
      const before = amt;
      amt = dr.replaceWith;
      s = dlog(s, `${amulet.name} reduces ${before} damage to ${who} down to ${amt}.`, 'effect');
    }
  }
}
if (amt > 0 && meta?.sourceIid) {
  // Circle of Protection / Eye for an Eye / Greater Realm of Preservation:
  // "the next time [a source of your choice] would deal damage to you this
  // turn" -- a one-time shield against one specific, already-chosen source
  // (exact iid match), not a standing color/type ward re-checked generically.
  // See docs/SYSTEMS.md -- Damage Shields.
  const shields = s.turnState.damageShields?.[who] || [];
  const matchIdx = shields.findIndex(sh => sh.chosenSourceIid === meta.sourceIid);
  if (matchIdx >= 0) {
    const shield = shields[matchIdx];
    const remaining = [...shields.slice(0, matchIdx), ...shields.slice(matchIdx + 1)];
    const ns0 = { ...s, turnState: { ...s.turnState, damageShields: { ...s.turnState.damageShields, [who]: remaining } } };
    if (shield.mode === 'prevent') {
      const prevented = amt;
      const ns1 = dlog(ns0, `${shield.shieldSourceName || 'Prevention effect'} prevents ${prevented} damage to ${who}${src ? ` from ${src}` : ''}.`, 'effect');
      // Reverse Damage: "You gain life equal to the damage prevented this way."
      // meta:null is the same recursion guard used by the redirect branch below.
      if (shield.gainLifeOnPrevent) {
        return hurt(ns1, who, -prevented, shield.shieldSourceName, null);
      }
      return ns1;
    }
    // redirect (Eye for an Eye): re-enter hurt() with the shield already
    // consumed so the primary damage applies normally (and any other
    // meta-driven bookkeeping for the original source still fires), then deal
    // an equal, independent instance of damage to the original source's
    // controller from Eye for an Eye itself. meta:null on the second call is a
    // recursion guard -- it cannot match any shield entry.
    let ns = hurt(ns0, who, amt, src, meta);
    ns = hurt(ns, shield.chosenSourceController, amt, shield.shieldSourceName, null);
    return ns;
  }
}
if (amt > 0) {
  const redirectTarget = getDamageRedirectTarget(s, who, meta);
  if (redirectTarget) {
    let ns = { ...s, [who]: { ...s[who], bf: s[who].bf.map(c =>
      c.iid === redirectTarget.iid ? { ...c, damage: c.damage + amt } : c
    ) } };
    ns = dlog(ns, `${amt} damage redirected from ${who} to ${redirectTarget.name}${src ? ` (from ${src})` : ""}.`, "damage");
    return checkDeath(ns);
  }
}
if (amt > 0) {
  // Forcefield-style identity-scoped shield: "prevent all but N of the next combat
  // damage from creature X" -- only matches the exact declared source, combat only.
  // Adapted from Card-Forge/forge (f/forcefield.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const cshield = s[who].combatDamageShield;
  if (cshield && meta?.combat && meta?.sourceIid === cshield.sourceIid) {
    const prevented = Math.max(0, amt - cshield.allowThrough);
    if (prevented > 0) {
      s = dlog({ ...s, [who]: { ...s[who], combatDamageShield: null } }, `${cshield.cardName || "Prevention effect"} prevents ${prevented} damage.`, "effect");
      amt -= prevented;
    }
  }
  // Flat "prevent the next N damage" shield -- Alabaster Potion and the existing
  // (previously inert) preventDamage1Any/preventDamage2ArtifactCreature/
  // preventDamage2Self/preventDamage1AnyReturnEnd cases all write this field.
  const shield = s[who].damageShield || 0;
  if (shield > 0 && amt > 0) {
    const prevented = Math.min(shield, amt);
    s = dlog({ ...s, [who]: { ...s[who], damageShield: shield - prevented } }, `Prevented ${prevented} damage to ${who}.`, "effect");
    amt -= prevented;
  }
}
const floor = amt > 0 ? getLifeFloor(s, who) : null;
const rawNl = s[who].life - amt;
const nl = (floor !== null && rawNl < floor) ? floor : rawNl;
let ns = { ...s, [who]: { ...s[who], life: nl, lifeAnim: amt > 0 ? "damage" : "heal" } };
if (amt > 0) {
  // Tracks total damage taken by each player this turn (Simulacrum). Reset at CLEANUP.
  ns = { ...ns, turnState: { ...ns.turnState, damageTakenThisTurn: { ...ns.turnState.damageTakenThisTurn, [who]: (ns.turnState.damageTakenThisTurn?.[who] || 0) + amt } } };
  // Tracks damage taken this turn by source permanent type (Reverse Polarity). Reset at CLEANUP.
  if (meta?.sourceType) {
    ns = { ...ns, turnState: { ...ns.turnState, damageBySourceType: {
      ...ns.turnState.damageBySourceType,
      [who]: {
        ...ns.turnState.damageBySourceType?.[who],
        [meta.sourceType]: (ns.turnState.damageBySourceType?.[who]?.[meta.sourceType] || 0) + amt,
      },
    } } };
  }
  ns = dlog(ns, `${who} takes ${amt} damage${src ? ` from ${src}` : ""}.`, "damage");
  // Living Artifact: "Whenever you're dealt damage, put that many vitality
  // counters on this Aura." Distinct from ON_DAMAGE_DEALT (which fires at
  // specific combat call sites and would double-count here) -- this is the
  // single hurt() choke point, so it fires exactly once per net amount
  // actually applied to a player, after all shields/redirects/floor logic.
  // Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  ns = emitEvent(ns, { type: 'ON_PLAYER_DAMAGED', payload: { who, amount: amt, sourceIid: meta?.sourceIid, sourceType: meta?.sourceType } });
}
else if (amt < 0) ns = dlog(ns, `${who} gains ${-amt} life.`, "heal");
if (who === "p" && amt > 0) ns = { ...ns, peakDamage: Math.max(ns.peakDamage || 0, amt) };
// Lich: "You don't lose the game for having 0 or less life."
// Adapted from Card-Forge/forge (l/lich.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (nl <= 0 && !ns.over && !ns[who].lichActive) ns = { ...ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} reached 0 life` } };
// Lich: "Whenever you're dealt damage, sacrifice that many nontoken
// permanents. If you can't, you lose the game." No token tracking exists
// (every permanent treated as nontoken, matching the Beasts of Bogardan
// SIMPLIFICATION in layers.js). Gated on !meta?.isLifeLoss so Lich's own
// "you lose life equal to your life total" ETB (life loss, not damage,
// per MTG rules) doesn't itself trigger the sacrifice clause.
// Adapted from Card-Forge/forge (l/lich.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (amt > 0 && ns[who].lichActive && !meta?.isLifeLoss) {
  const perms = ns[who].bf;
  if (perms.length < amt) {
    ns = { ...ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} could not sacrifice enough permanents (Lich)` } };
  } else {
    let toSac = perms.slice(0, amt);
    for (const p of toSac) ns = zMove(ns, p.iid, who, who, "gy");
    ns = dlog(ns, `${who}'s Lich: sacrifices ${amt} permanent(s).`, "effect");
  }
}
return ns;
}

// --- DRAW REPLACEMENT CORE (Aladdin's Lamp replacement effect dispatcher) ----
// Core infrastructure for Aladdin's Lamp's "replace next draw" mechanic.
// Adapted from Card-Forge/forge (a/aladdins_lamp.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.

const DRAW_FOLLOWUPS = {
  bazaarDiscard3(ns, who) {
    // Bazaar of Baghdad: "draw 2, discard 3" logic.
    for (let i = 0; i < 3; i++) {
      if (!ns[who].hand.length) break;
      const disc = ns[who].hand[ns[who].hand.length - 1];
      ns = discardCard(ns, who, disc.iid, { cause: 'effect', sourceName: 'Bazaar of Baghdad' });
    }
    ns = dlog(ns, "Bazaar: drew 2, discarded 3.", "draw");
    return ns;
  },

  discardLastDrawn(ns, who, fu) {
    // Jalum Tome: draw 1, discard the drawn card.
    if (ns[who].hand.length) {
      const disc = ns[who].hand[ns[who].hand.length - 1];
      ns = discardCard(ns, who, disc.iid, { cause: 'effect', sourceName: fu.sourceName });
      ns = dlog(ns, `${fu.sourceName}: ${who} discards ${disc.name}.`, "effect");
    }
    return ns;
  },

  revealDiscardIfNonland(ns, who, fu) {
    // Sindbad: draw 1, reveal, discard if not land.
    if (ns[who].hand.length) {
      const drawn = ns[who].hand[ns[who].hand.length - 1];
      ns = dlog(ns, `${fu.sourceName}: ${who} reveals ${drawn.name}.`, "effect");
      if (!isLand(drawn)) {
        ns = discardCard(ns, who, drawn.iid, { cause: 'effect', sourceName: fu.sourceName });
        ns = dlog(ns, `${fu.sourceName}: ${drawn.name} isn't a land -- discarded.`, "effect");
      }
    }
    return ns;
  },

  sylvanPutBackTwo(ns, who) {
    // Sylvan Library o-branch: draw 2 for AI opponent, optionally put back.
    if (ns[who].hand.length >= 2) {
      const put = ns[who].hand.slice(-2);
      ns = { ...ns, [who]: { ...ns[who], hand: ns[who].hand.slice(0, -2), lib: [...put, ...ns[who].lib] } };
    }
    return ns;
  },

  dlogText(ns, who, fu) {
    // Generic dlog-only followup (e.g., Sylvan Library player branch).
    return dlog(ns, fu.text, fu.type || "effect");
  },
};

function runDrawFollowUps(ns, who, followUps) {
  for (const fu of followUps || []) {
    const fn = DRAW_FOLLOWUPS[fu.id];
    if (!fn) throw new Error(`[DuelCore] Unknown draw followUp: ${fu.id}`);
    ns = fn(ns, who, fu);
  }
  return ns;
}

function performDraws(s, who, n, followUps = []) {
  let ns = s;
  for (let i = 0; i < n; i++) {
    // Ring of Ma'ruf: draw replacement. Consumed BEFORE Aladdin's Lamp when both
    // are pending (documented ordering simplification -- real rules would let the
    // player order simultaneous replacements). See docs/ENGINE_CONTRACT_SPEC.md.
    // Adapted from Card-Forge/forge (r/ring_of_maruf.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    if ((ns[who].marufCharges || 0) > 0) {
      ns = { ...ns, [who]: { ...ns[who], marufCharges: ns[who].marufCharges - 1 } };
      if ((ns[who].binderIds || []).length) {
        // Suspend the draw loop like the lamp. No cardIids integrity list: the
        // pick shows the binder, which cannot change while the pick is pending.
        const pick = { who, remainingDraws: n - i - 1, followUps };
        ns = { ...ns, pendingMarufPicks: [...(ns.pendingMarufPicks || []), pick] };
        return dlog(ns, `Ring of Ma'r\u00fbf: ${who} chooses a card from outside the game.`, "effect");
      }
      // Empty binder: charge consumed, fizzle to a normal draw (fall through).
      ns = dlog(ns, `Ring of Ma'r\u00fbf: no cards outside the game -- drawing normally.`, "effect");
    }
    const charges = ns[who].lampCharges || [];
    if (charges.length && ns[who].lib.length) {
      // Aladdin's Lamp: LIFO charge consumption. Suspend the draw loop.
      const x = charges[charges.length - 1];
      ns = { ...ns, [who]: { ...ns[who], lampCharges: charges.slice(0, -1) } };
      const shownIids = ns[who].lib.slice(0, Math.min(x, ns[who].lib.length)).map(c => c.iid);
      const pick = { who, x: shownIids.length, cardIids: shownIids, remainingDraws: n - i - 1, followUps };
      ns = { ...ns, pendingLampPicks: [...(ns.pendingLampPicks || []), pick] };
      return dlog(ns, `Aladdin's Lamp: ${who} looks at the top ${shownIids.length} card(s).`, "effect");
    }
    if (charges.length && !ns[who].lib.length) {
      // Charge queued but library empty: consume charge, fall through to deck-out.
      ns = { ...ns, [who]: { ...ns[who], lampCharges: charges.slice(0, -1) } };
    }
    // === Single-draw body: identical to legacy drawD logic ===
    if (!ns[who].lib.length) {
      return { ...ns, over: { winner: who === "p" ? "o" : "p", reason: `${who} drew from empty library` } };
    }
    const [top, ...rest] = ns[who].lib;
    ns = { ...ns, [who]: { ...ns[who], lib: rest, hand: [...ns[who].hand, top] } };
    // Fasting: "When you draw a card, destroy this enchantment." performDraws
    // is the single choke point for every draw this engine performs (draw
    // step, Ancestral Recall, Sylvan Library, Howling Mine, ...), so this one
    // insertion point covers all of them. Scoped to `who` (Fasting's own
    // controller) -- doesn't fire when a different player draws. The
    // draw-step skip-instead replacement (DRAW phase block above) bypasses
    // this function entirely, so it correctly never fires there either.
    const fastingCard = ns[who].bf.find(c => c.name === "Fasting");
    if (fastingCard) {
      ns = zMove(ns, fastingCard.iid, who, who, "gy");
      ns = dlog(ns, "Fasting is destroyed -- a card was drawn.", "effect");
    }
  }
  return runDrawFollowUps(ns, who, followUps);
}

export function drawD(s, who, n = 1) {
  return performDraws(s, who, n, []);
}

export function zMove(s, iid, fw, tw, tz, opts = {}) {
// Worms of the Earth: "Lands can't enter the battlefield." zMove is the
// single choke point for every zone move, so this one check (alongside the
// PLAY_LAND gate in the reducer, which blocks the *other* half of the
// card's text -- "players can't play lands") covers every current path a
// land could reach the battlefield. Bails out before removing the card from
// its origin zone, so the land simply stays put.
if (tz === "bf") {
  const preCard = ["hand","bf","gy","exile","lib"].map(z => s[fw]?.[z]?.find(c => c.iid === iid)).find(Boolean);
  if (preCard && isLand(preCard) && [...s.p.bf, ...s.o.bf].some(x => x.name === "Worms of the Earth")) {
    return dlog(s, "Worms of the Earth: lands can't enter the battlefield.", "rule");
  }
}
let card = null;
let fromZone = null;
let ns = { ...s };
for (const z of ["hand","bf","gy","exile","lib"]) {
const idx = ns[fw]?.[z]?.findIndex(c => c.iid === iid);
if (idx !== undefined && idx >= 0) {
card = ns[fw][z][idx];
fromZone = z;
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
// Takklemaggot: "When enchanted creature dies, that creature's controller
// chooses a creature this card could enchant..." -- the generic fall-off
// above already dropped it into auraOwner's graveyard (the baseline every
// aura gets); this extends that with Takklemaggot's own death trigger,
// specifically scoped to the host actually dying (tz === "gy"), not just
// leaving the battlefield some other way (bounce/exile).
if (aura.name === "Takklemaggot" && isCre(card) && tz === "gy") {
  ns = takklemaggotDeathTrigger(ns, fw, aura);
}
}
}

let a = { ...card, controller: tw };
if (tz === "bf") {
// Assign a monotonic enter-timestamp for layer ordering (CR 613.7d).
const ts = (ns.layerClock ?? 0) + 1;
ns = { ...ns, layerClock: ts };
a = { ...a, tapped: false, summoningSick: !hasKw(card, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, eotBuffs: [], enchantments: [], enterTs: ts };
}
if (tz === "gy" || tz === "hand" || tz === "exile" || tz === "lib") {
// Strip typeEff/subtypeEff/colorEff/landTypeOverride here too -- a land that dies
// while animated by Living Lands must arrive in the gy as a plain land, not a creature.
// Also strip Raging River-related fields.
a = { ...a, tapped: false, damage: 0, counters: {}, attacking: false, blocking: null, eotBuffs: [], enchantments: [],
  typeEff: undefined, subtypeEff: undefined, colorEff: undefined, landTypeOverride: undefined,
  riverSide: undefined, riverPile: undefined };
}
// CR 111.7: a token that leaves the battlefield ceases to exist -- do not
// place it into the destination zone. zMove is the single choke point for
// every bf -> gy/exile/hand/lib move, so this one check covers every path a
// token could leave the battlefield (death, bounce, exile, sacrifice).
const tokenVanishes = card.isToken && fromZone === 'bf' && tz !== 'bf';
let moved = tokenVanishes ? ns : { ...ns, [tw]: { ...ns[tw], [tz]: [...ns[tw][tz], a] } };

// ON_PERMANENT_LEAVES_BF: generic leaves-the-battlefield event. Fires alongside
// ON_CREATURE_DIES (emitted separately by callers such as checkDeath) rather than
// replacing it -- zMove is the single choke point for every bf -> gy/exile/hand
// move, so this one emission site covers lands, artifacts, enchantments, and
// creatures. Does not fire for bf -> bf control changes.
// opts.suppressLeaveEvent: one-shot phasing (Oubliette) -- a phased-out
// permanent has not "left the battlefield" for trigger purposes (CR 702.26),
// so the phase-out zMove passes this flag to skip the emission entirely.
// Nothing else in this function reads opts.
if (fromZone === 'bf' && tz !== 'bf' && !opts.suppressLeaveEvent) {
  if (isCre(card) && tz === 'gy') {
    // Tracks creatures that died this turn (Khabál Ghoul). Reset at CLEANUP.
    moved = { ...moved, turnState: { ...moved.turnState, creaturesDiedThisTurn: [...(moved.turnState.creaturesDiedThisTurn || []), iid] } };
  }
  moved = emitEvent(moved, { type: 'ON_PERMANENT_LEAVES_BF', payload: {
    cardIid: iid,
    previousController: fw,
    wasLand: isLand(card),
    wasArtifact: isArt(card),
    wasCreature: isCre(card),
    destination: tz,
  } });
  moved = processTriggerQueue(moved);
}
// Battlefield membership changed in either direction -- re-bake typeEff/subtypeEff/
// colorEff/landTypeOverride for every remaining permanent (e.g. Living Lands itself
// leaving reverts every animated Forest; a land entering while Blood Moon is out is
// immediately neutered). zMove is the single choke point for every zone move, so one
// call here covers checkDeath, destroy/bounce effects, and tutor-to-bf effects alike.
if (tz === 'bf' || fromZone === 'bf') {
  moved = recomputeTypeEffects(moved);
}
return moved;
}

// --- LAYER 4 TYPE-EFFECT BAKING -----------------------------------------------
// Bakes the Layer 3/4 (and Layer-5 color, where a type effect also sets it) result
// of computeCharacteristics onto each battlefield permanent as typeEff/subtypeEff/
// colorEff/landTypeOverride. isCre/isLand and every hot-loop combat/death/AI
// predicate read these baked fields instead of calling computeCharacteristics
// per-invocation (walking every battlefield effect on every isCre() call would be
// far too expensive in combat resolution and MCTS/AI search). Absent fields mean
// "no active type-changing effect, use the printed value." See docs/SYSTEMS.md S18.9.
export function recomputeTypeEffects(state) {
  let ns = state;
  for (const w of ["p", "o"]) {
    let lostCombatIids = [];
    const bf = ns[w].bf.map(c => {
      const ch = computeCharacteristics(c, ns);
      const baseTypeStr = c.type ?? "";
      const baseSubtypeStr = c.subtype ?? "";
      const computedTypeStr = ch.types.join(" ");
      const computedSubtypeStr = ch.subtypes.join(" ");
      const next = { ...c };
      next.typeEff = computedTypeStr !== baseTypeStr ? computedTypeStr : undefined;
      next.subtypeEff = computedSubtypeStr !== baseSubtypeStr ? computedSubtypeStr : undefined;
      next.colorEff = ch.color !== (c.color ?? "") ? ch.color : undefined;
      next.landTypeOverride = ch.landTypeOverride || undefined;
      // CR 506.4-adjacent: a permanent that stops being a creature is removed from
      // combat. Follows the same pattern as the ebonyHorse case (clear attacking/
      // blocking, splice from state.attackers) for a creature leaving combat alive --
      // see docs/SYSTEMS.md S18.9 for why this doesn't also touch state.blockers.
      if (isCre(c) && !isCre(next) && (c.attacking || c.blocking)) {
        lostCombatIids.push(c.iid);
        next.attacking = false;
        next.blocking = null;
        // CR 702.22f: removed from combat means removed from its band too.
        next.bandId = null;
      }
      return next;
    });
    ns = { ...ns, [w]: { ...ns[w], bf } };
    if (lostCombatIids.length) {
      ns = { ...ns, attackers: ns.attackers.filter(id => !lostCombatIids.includes(id)) };
    }
  }
  return ns;
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
        ns = tapPermanent(ns, w, c.iid);
        ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x =>
          x.iid === c.iid ? { ...x, damage: 0, regenerating: false } : x
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
          ns = hurt(ns, w, tou, 'Creature Bond', { sourceIid: aura.iid, sourceType: 'enchantment' });
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
// CR 704.5j (legend rule): checked here so every one of checkDeath's ~15+
// manual call sites gets it for free, same as checkControlGrants immediately
// above -- both are "battlefield composition may have just changed" follow-up
// checks that piggyback on checkDeath's own centralization rather than adding
// a fresh manual call at each site individually.
ns = checkLegendRule(ns);
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

// Builds a human-readable disambiguation label for a legendRuleChoice option.
// Every option in the group shares the same card.name (that's what triggered
// the rule), so the label has to surface whatever instance-specific state
// actually differs. enterTs is NOT reliably populated -- RESOLVE_STACK's
// default ETB push (the most common entry path, e.g. two normally-cast
// Legendary creatures) never sets it, only zMove's tz:'bf' branch and a
// handful of direct-placement effects do -- so it's tried but not relied on.
// Falls back to a plain ordinal when nothing on the card distinguishes it.
function legendRuleOptionLabel(c, index) {
  const parts = [];
  if (typeof c.enterTs === 'number') parts.push(`entered #${c.enterTs}`);
  if (c.damage > 0) parts.push(`${c.damage} damage marked`);
  const counterParts = Object.entries(c.counters || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (counterParts.length) parts.push(counterParts.join(', '));
  if (c.tapped) parts.push('tapped');
  return parts.length ? `${c.name} (${parts.join(', ')})` : `${c.name} (Copy ${index + 1})`;
}

// checkLegendRule: CR 704.5j state-based action. "If a player controls two or
// more legendary permanents with the same name, that player chooses one of
// them, and the rest are put into their owners' graveyards." Checked
// independently per player -- two different players each controlling a
// same-named legendary permanent is legal and must not trigger anything.
// Unlike checkDeath, the loser(s) here aren't picked automatically: CR
// 704.5j hands the choice to the controller, so this creates a pendingChoice
// (kind: 'legendRuleChoice') via the same createPendingChoice() factory used
// by Blaze of Glory/Primal Clay/color choices, and RESOLVE_CHOICE performs
// the actual graveyard move once an option is picked (see that case below).
// ASSUMPTION B (collision degradation, same convention as Library of Leng's
// discardToLibraryChoice above): pendingChoice is a single slot. If it's
// already occupied, skip creating a new one for now -- the next SBA-
// triggering event that calls checkLegendRule will re-detect the violation
// once the slot frees up. If both players have a violation at once, only the
// first found (p, then o) gets a pendingChoice here; RESOLVE_CHOICE's
// 'legendRuleChoice' branch re-invokes checkLegendRule after resolving so the
// second violation is re-detected and queued next, matching checkDeath's own
// while(changed)-until-clean shape.
export function checkLegendRule(state) {
  if (state.pendingChoice) return state;
  for (const w of ["p", "o"]) {
    const legendaries = state[w].bf.filter(isLegendary);
    const byName = new Map();
    for (const c of legendaries) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    }
    for (const [name, group] of byName) {
      if (group.length < 2) continue;
      return createPendingChoice(state, {
        sourceCardId: group[0].iid,
        controller: w,
        kind: 'legendRuleChoice',
        legendName: name,
        options: group.map((c, i) => ({ id: c.iid, label: legendRuleOptionLabel(c, i) })),
      });
    }
  }
  return state;
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
  const poisonLimit = state.ruleset?.poisonCountersToWin ?? 10;
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

// --- TAP CENTRALIZATION (PHASE 1) --------------------------------------------
// Tap centralization Phase 1. The single choke point for "a permanent becomes
// tapped" (CR 701.21). No-ops silently if the permanent is already tapped or
// not found -- "becomes tapped" only fires on an actual untapped->tapped
// transition, never a redundant one. Does NOT add a dlog message -- callers
// keep their own existing dlog calls describing the specific effect (mana
// gained, damage dealt, etc.); this only performs the mutation and emits the
// event other triggered abilities (Relic Bind, Blight, Psychic Venom, and
// Phase 2's Haunting Wind/Powerleech/Artifact Possession) listen for.
export function tapPermanent(state, who, iid) {
  const card = state[who]?.bf.find(c => c.iid === iid);
  if (!card || card.tapped) return state;
  let ns = {
    ...state,
    [who]: { ...state[who], bf: state[who].bf.map(c => c.iid === iid ? { ...c, tapped: true } : c) },
  };
  ns = emitEvent(ns, { type: 'ON_TAP', payload: { cardId: iid, controller: who } });
  // Deviation from the prompt's literal snippet: emitEvent alone only enqueues
  // triggers (state.triggerQueue) -- every other emitEvent call site in this
  // file pairs it with an immediate processTriggerQueue so the effect actually
  // resolves rather than sitting queued until some unrelated later action
  // happens to drain it. Same pairing here so Blight/Psychic Venom/Relic Bind
  // resolve at the moment of tapping, not on a delay.
  return processTriggerQueue(ns);
}

// --- DISCARD CENTRALIZATION (PHASE 1) ----------------------------------------
// Discard centralization Phase 1. The single choke point for "a card moves
// from a player's hand to their graveyard as a discard." Mirrors
// tapPermanent/ON_TAP directly above: consults a replacement registry before
// mutating (Forge's intercept-before-mutate model, CR 614.5), performs the
// move, then emits ON_DISCARD paired with an immediate processTriggerQueue.
// See docs/ENGINE_CONTRACT_SPEC.md S7.7.
//
// DISCARD_REPLACEMENTS: keyed by permanent card id. Entry shape:
// { matches(state, who, payload) => boolean, apply(state, who, payload) => state }.
export const DISCARD_REPLACEMENTS = {};

// performDiscardMutation: the actual hand->gy move + ON_DISCARD emission +
// trigger drain, factored out so discardCard's non-replaced path and any
// DISCARD_REPLACEMENTS entry's apply() (which still owes the game a real
// discard, just with a different eventual resting zone) share one mutation
// tail instead of duplicating it.
function performDiscardMutation(state, who, card, payload) {
  let ns = {
    ...state,
    [who]: { ...state[who], hand: state[who].hand.filter(c => c.iid !== card.iid), gy: [...state[who].gy, card] },
  };
  ns = emitEvent(ns, { type: 'ON_DISCARD', payload });
  return processTriggerQueue(ns);
}

export function discardCard(state, who, iid, opts) {
  if (opts?.cause !== 'effect' && opts?.cause !== 'cost' && opts?.cause !== 'gameRule') {
    throw new Error(`discardCard: invalid or missing opts.cause "${opts?.cause}"`);
  }
  const card = state[who]?.hand.find(c => c.iid === iid);
  if (!card) {
    console.error(`[DuelCore] discardCard: card ${iid} not found in ${who} hand`);
    return state;
  }
  const payload = { who, iid, cardId: card.id, cardName: card.name, cause: opts.cause, sourceName: opts.sourceName };

  // Replacement pass (CR 614.5 loop protection: one-shot per invocation).
  const hasRun = new Set();
  for (const permanent of state[who].bf) {
    const entry = DISCARD_REPLACEMENTS[permanent.id];
    if (!entry || hasRun.has(permanent.id)) continue;
    if (entry.matches(state, who, payload)) {
      hasRun.add(permanent.id);
      return entry.apply(state, who, payload);
    }
  }

  return performDiscardMutation(state, who, card, payload);
}

// Library of Leng: "If an effect causes you to discard a card, discard it,
// but you may put it on top of your library instead of into your graveyard."
// ASSUMPTION A (graveyard-first, retroactive lift, see docs/ENGINE_CONTRACT_SPEC.md
// S7.7): the discard is NOT suspended -- the card moves to the graveyard and
// ON_DISCARD fires normally via performDiscardMutation, then the player is
// offered a choice to lift it from the graveyard to the top of the library.
// ASSUMPTION B (collision degradation): pendingChoice is a single slot. If
// it's already occupied by something other than this player's own
// discardToLibraryChoice, log and leave the card in the graveyard --
// unreachable today, but never silently overwrite an existing choice.
DISCARD_REPLACEMENTS['library_of_leng'] = {
  matches(state, who, payload) {
    return payload.cause === 'effect';
  },
  apply(state, who, payload) {
    const card = state[who].hand.find(c => c.iid === payload.iid);
    if (!card) return state;
    let ns = performDiscardMutation(state, who, card, payload);

    const leng = state[who].bf.find(c => c.id === 'library_of_leng');
    const existing = ns.pendingChoice;
    if (!existing) {
      ns = createPendingChoice(ns, {
        sourceCardId: leng?.iid,
        controller: who,
        kind: 'discardToLibraryChoice',
        options: [
          { id: 'graveyard', label: `Put ${card.name} into your graveyard` },
          { id: 'library', label: `Put ${card.name} on top of your library` },
        ],
        cardIid: payload.iid,
        queuedIids: [],
      });
    } else if (existing.kind === 'discardToLibraryChoice' && existing.controller === who) {
      ns = { ...ns, pendingChoice: { ...existing, queuedIids: [...existing.queuedIids, payload.iid] } };
    } else {
      console.error(`[DuelCore] Library of Leng: pendingChoice collision -- ${card.name} stays in graveyard.`);
    }
    return ns;
  },
};

// --- CASTLE MODIFIER: OVERGROWTH ---------------------------------------------

export function applyOvergrowthTap(s, who, iid, mana) {
const c = s[who].bf.find(x => x.iid === iid);
if (!c || c.tapped || !isLand(c)) return s;
// Blood Moon / Evil Presence: a land whose subtype was fully replaced by a basic
// land type (landTypeOverride) taps for ONLY that type's mana, overriding whatever
// color the caller requested and whatever this land normally produces.
// See docs/SYSTEMS.md S18.9.
const LAND_TYPE_MANA = { Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" };
const m = c.landTypeOverride ? LAND_TYPE_MANA[c.landTypeOverride] : (mana || c.produces?.[0] || "C");
// Mishra's Workshop: {T}: Add {C}{C}{C}.
// Adapted from Card-Forge/forge (m/mishras_workshop.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
// SIMPLIFICATION: the "spend this mana only to cast artifact spells" restriction
// isn't enforced -- this engine's mana pool doesn't track per-mana spend
// restrictions (no existing card enforces one either).
const amount = c.id === "mishrass_workshop" ? 3 : (s.castleMod?.name === "Overgrowth" ? 2 : 1);
let ns = tapPermanent(s, who, iid);
ns = { ...ns,
[who]: { ...ns[who],
mana: { ...ns[who].mana, [m]: (ns[who].mana[m] || 0) + amount },
},
};
ns = dlog(ns, `${who} taps ${c.name} → +${amount}${m}${amount > 1 ? " (Overgrowth)" : ""}.`, "mana");
const allBF_tap = [...ns.p.bf, ...ns.o.bf];
if (allBF_tap.some(x => x.id === "mana_flare")) {
ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, [m]: (ns[who].mana[m] || 0) + 1 } } };
ns = dlog(ns, `Mana Flare: ${who} gets +1${m}.`, "mana");
}
const manabarbsCard = allBF_tap.find(x => x.id === "manabarbs");
if (manabarbsCard) {
ns = hurt(ns, who, 1, "Manabarbs", { sourceIid: manabarbsCard.iid, sourceType: inferSourceType(manabarbsCard) });
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
// Gauntlet of Might: "Whenever a Mountain is tapped for mana, its controller
// adds an additional {R}." Adapted from Card-Forge/forge (g/gauntlet_of_might.txt),
// GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (isLand(c) && c.subtype?.includes("Mountain") && [...ns.p.bf, ...ns.o.bf].some(x => x.name === "Gauntlet of Might")) {
  ns = { ...ns, [who]: { ...ns[who], mana: { ...ns[who].mana, R: (ns[who].mana.R || 0) + 1 } } };
  ns = dlog(ns, `Gauntlet of Might: ${who} gets +1R.`, "mana");
}
// Lifeblood: "Whenever a Mountain an opponent controls becomes tapped, you
// gain 1 life." Adapted from Card-Forge/forge (l/lifeblood.txt), GPL-3.0.
// See THIRD_PARTY_NOTICES.md.
if (isLand(c) && c.subtype?.includes("Mountain")) {
  const oppOfTapper = who === "p" ? "o" : "p";
  const lifebloodCard = ns[oppOfTapper].bf.find(x => x.name === "Lifeblood");
  if (lifebloodCard) {
    ns = hurt(ns, oppOfTapper, -1, "Lifeblood", { sourceIid: lifebloodCard.iid, sourceType: inferSourceType(lifebloodCard) });
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

// applyPermanentCopy: generalized Layer 1 copy helper (CR 707.2 -- copies
// printed/copiable values from CARD_DB, never the live battlefield object,
// so counters/auras/damage on the source creature are never copied).
// Two callers, two shapes:
//   - ETB copy (Copy Artifact, Vesuvan Doppelganger's initial copy): sourceCardIid
//     is not yet on any battlefield. Returns `copied` only; the caller builds
//     the fresh permanent (iid, controller, entering-battlefield defaults) and
//     pushes it themselves -- this function does not guess a controller.
//   - Re-copy (Vesuvan Doppelganger's upkeep trigger): sourceCardIid IS already
//     on a battlefield. `copied` is merged onto that existing object in place,
//     so iid/controller/counters/tapped/damage/attacking/blocking/summoningSick/
//     eotBuffs/enchantments/tokens/exerted/triggeredAbilities are all preserved
//     (none of those keys appear in `copied`) -- which is also how the recurring
//     copy ability survives being re-copied without any extra plumbing.
// `targetCard` must already be a legality-validated target (isArt/isCre, etc.)
// -- that check is the caller's job, not this helper's.
function applyPermanentCopy(state, sourceCardIid, targetCard, opts = {}) {
  const { typeSuffix, colorOverride } = opts;
  const staticDef = CARD_DB.find(c => c.id === targetCard.id);
  if (!staticDef) throw new Error(`applyPermanentCopy: no CARD_DB entry for id="${targetCard.id}"`);
  const baseType = staticDef.type ?? '';
  const newType = typeSuffix
    ? (baseType.includes(typeSuffix) ? baseType : (baseType ? `${baseType} ${typeSuffix}` : typeSuffix))
    : baseType;
  const copied = {
    name: staticDef.name, cost: staticDef.cost, cmc: staticDef.cmc,
    color: colorOverride !== undefined ? colorOverride : staticDef.color,
    type: newType, subtype: staticDef.subtype, power: staticDef.power, toughness: staticDef.toughness,
    text: staticDef.text, keywords: [...(staticDef.keywords ?? [])], effect: staticDef.effect,
    rarity: staticDef.rarity, id: staticDef.id, layerDef: staticDef.layerDef,
    activated: staticDef.activated, upkeep: staticDef.upkeep, mod: staticDef.mod,
  };
  for (const who of ['p', 'o']) {
    if (state[who].bf.some(c => c.iid === sourceCardIid)) {
      return {
        copied,
        state: { ...state, [who]: { ...state[who], bf: state[who].bf.map(c => c.iid === sourceCardIid ? { ...c, ...copied } : c) } },
      };
    }
  }
  return { copied, state };
}

// Vesuvan Doppelganger is printed blue (verified against current Scryfall
// oracle text/mana cost, not trusted from Forge's `SetColor$ Blue` literal) --
// both the initial ETB copy and every subsequent upkeep re-copy force this
// color instead of the copied creature's own color.
const VESUVAN_DOPPELGANGER_COLOR = 'U';
const VESUVAN_RECOPY_TRIGGER_ID = 'vesuvan_doppelganger_upkeep_recopy';
// The recurring ability granted alongside every copy (ETB or re-copy) --
// stored on the permanent's own triggeredAbilities, never on the printed
// CARD_DB entry, so declining the initial ETB copy leaves a plain 0/0
// Shapeshifter with no upkeep ability (matches the printed card's "except it
// doesn't copy... and it has [ability]" wording -- the ability only exists on
// the copy, not on Vesuvan's own printed characteristics).
const VESUVAN_RECOPY_ABILITY = {
  id: VESUVAN_RECOPY_TRIGGER_ID,
  trigger: { event: 'ON_UPKEEP_START', scope: 'controller' },
  requiresTarget: true,
  effect: { type: 'vesuvanRecopy' },
};

// Dance of Many's token-side "when the token leaves the battlefield,
// sacrifice Dance of Many" trigger. Attached to the token itself for
// symmetry with the enchantment-side ability below, but see
// danceOfManySacrificeSource's comment: tokens vanish on leaving the
// battlefield (CR 111.7) rather than landing in gy/exile, so
// findLeftBattlefieldCard can never locate this token afterward and this
// scope:'self' trigger is not reachable in practice -- the actual detection
// is the dance_of_many orphan-check in the PHASE.UPKEEP block instead.
const DANCE_OF_MANY_TOKEN_LEAVES_ABILITY = {
  id: 'dance_of_many_token_leaves',
  trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' },
  effect: { type: 'danceOfManySacrificeSource' },
};
// Dance of Many's own "when Dance of Many leaves the battlefield, exile the
// token" trigger. Dance of Many is never a token itself, so its own
// leaves-bf event is found normally via findLeftBattlefieldCard.
const DANCE_OF_MANY_ITSELF_LEAVES_ABILITY = {
  id: 'dance_of_many_itself_leaves',
  trigger: { event: 'ON_PERMANENT_LEAVES_BF', scope: 'self' },
  effect: { type: 'danceOfManyExileToken' },
};

export function resolveEff(s, item) {
const { card, caster, targets, xVal } = item;
const opp = caster === "p" ? "o" : "p";
let ns = s;
// Source damage meta for the small ping/damage1/damage2 effect keys below. `card`
// here is the spell or activated permanent dealing the damage -- covers artifacts
// (Rod of Ruin, Rocket Launcher, Aladdin's Ring, read by Reverse Polarity/Martyrs
// of Korlis via damageBySourceType.artifact) as well as any other source type.
const srcMeta = { sourceIid: card.iid, sourceType: inferSourceType(card), combat: false };
const tgt = targets?.[0];
const tgtC = tgt ? getBF(ns, tgt) : null;

// Priority 1: custom card handler (spec S7.2)
if (card.name && CARD_HANDLERS[card.name]) {
  const result = CARD_HANDLERS[card.name].onResolve(ns, card, targets || []);
  if (result) return result;
}

switch (card.effect) {
// The Hive: "{5}, {T}: Create a 1/1 colorless Insect artifact creature token
// with flying named Wasp."
// Adapted from Card-Forge/forge (t/the_hive.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "createWaspToken": {
  ns = createToken(ns, 'wasp', 1, caster);
  ns = dlog(ns, `${card.name} creates a 1/1 Wasp token.`, 'effect');
  break;
}
// Serpent Generator: "{4}, {T}: Create a 1/1 colorless Snake artifact
// creature token. It has 'Whenever this creature deals damage to a player,
// that player gets a poison counter.'"
// Adapted from Card-Forge/forge (s/serpent_generator.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "createSerpentToken": {
  ns = createToken(ns, 'snake_poison', 1, caster);
  ns = dlog(ns, `${card.name} creates a 1/1 Snake token.`, 'effect');
  break;
}
case "damage3": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
else if (tgtC) ns = hurtCreature(ns, tgtC.iid, 3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
break;
}
case "damage5":    { const t5 = tgt === "p" || tgt === "o" ? tgt : opp; ns = hurt(ns, t5, 5, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break; }
case "damageX":    { const t2 = tgt === "p" || tgt === "o" ? tgt : opp; ns = hurt(ns, t2, xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break; }
case "psionicBlast": {
if (tgt === "p" || tgt === "o") {
  ns = hurt(ns, tgt, 4, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
} else if (tgtC) {
  ns = hurtCreature(ns, tgtC.iid, 4, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
} else {
  ns = hurt(ns, opp, 4, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
}
ns = hurt(ns, caster, 2, "Psionic Blast", { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
// draw1Tgt (Xira Arien -- "target player draws a card") shares this body with draw1
// (Library of Alexandria/Jayemdae Tome/Jandor's Ring/Book of Rass/Greed, none of which
// pass a tgt), so the caster-only fallback below is unchanged for those cards.
case "draw1Tgt":
case "draw1":   ns = drawD(ns, tgt === "p" || tgt === "o" ? tgt : caster, 1); break;
case "drawX":   ns = drawD(ns, caster, xVal); break;
case "gainLife3": ns = hurt(ns, caster, -3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
case "gainLifeX": ns = hurt(ns, caster, -xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
case "gainLife1": ns = hurt(ns, caster, -1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
case "gainLife2": ns = hurt(ns, caster, -2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
case "gainLife6": ns = hurt(ns, caster, -6, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
// Reverse Polarity: "You gain X life, where X is twice the damage dealt to you
// so far this turn by artifacts."
// Adapted from Card-Forge/forge (r/reverse_polarity.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "reversePolarityGain": {
  const artDmg = ns.turnState.damageBySourceType?.[caster]?.artifact || 0;
  ns = hurt(ns, caster, -(artDmg * 2), card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  break;
}
case "bounce": {
if (tgtC) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "hand"); ns = dlog(ns, `${card.name} returns ${tgtC.name}.`, "effect"); }
break;
}
case "exileCreature": {
if (tgtC) {
const lf = getPow(tgtC, ns);
ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "exile");
ns = hurt(ns, tgtC.controller, -lf, "Swords to Plowshares", { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
if (tgtC && isLand(tgtC)) {
  if (hasKw(tgtC, KEYWORDS.INDESTRUCTIBLE.id, ns)) { ns = dlog(ns, `${tgtC.name} is indestructible.`, 'effect'); break; }
  ns = destroyLand(ns, tgtC.iid, card.name);
}
else { ns = dlog(ns, `${card.name} fizzles -- no valid land target.`, "effect"); }
break;
}
// Cyclopean Tomb: "{2}, {T}: Put a mire counter on target non-Swamp land."
// Also records the land on the source artifact's own mireLandIids list, while
// it's still on the battlefield, for the leaves-battlefield emblem to
// snapshot later. Same land-target fizzle shape as destroyTargetLand above --
// no declarative targetFilter system exists for activated abilities (only
// spell-side effects like destroyTargetLand have this shape), so legality is
// checked here at resolution rather than a pre-activation gate.
// Adapted from Card-Forge/forge (c/cyclopean_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "cyclopeanTombMireCounter": {
  const alreadySwamp = tgtC && (tgtC.subtypeEff ?? tgtC.subtype ?? '').includes('Swamp');
  if (!tgtC || !isLand(tgtC) || alreadySwamp) {
    ns = dlog(ns, `${card.name} fizzles -- no valid non-Swamp land target.`, "effect");
    break;
  }
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, counters: { ...c.counters, MIRE: (c.counters?.MIRE || 0) + 1 } } : c
  ) } };
  // Record provenance on the Tomb itself (not the emblem yet -- it's still alive).
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
    c.iid === card.iid ? { ...c, mireLandIids: [...(c.mireLandIids || []), tgtC.iid] } : c
  ) } };
  ns = dlog(ns, `${card.name}: put a mire counter on ${tgtC.name}.`, "effect");
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
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isLand)) ns = destroyLand(ns, c.iid);
break;
}
case "destroyAllEnchantments": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(isEnch)) ns = zMove(ns, c.iid, w, w, "gy");
ns = dlog(ns, `${card.name} destroys all enchantments.`, "effect");
break;
}
case "destroyIslands": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Island"))) ns = destroyLand(ns, c.iid);
ns = dlog(ns, `${card.name} destroys all Islands.`, "effect");
break;
}
case "destroyPlains": {
for (const w of ["p","o"]) for (const c of [...ns[w].bf].filter(c => isLand(c) && c.subtype?.includes("Plains"))) ns = destroyLand(ns, c.iid);
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
case "aladdinsLampCharge": {
// Aladdin's Lamp activation: charge the lamp with X value for a future draw replacement.
const x = xVal ?? 1;
if (x < 1) {
  ns = dlog(ns, `${card.name} fizzles -- X can't be 0.`, "effect");
  break;
}
ns = { ...ns, [caster]: { ...ns[caster], lampCharges: [...(ns[caster].lampCharges || []), x] } };
ns = dlog(ns, `${card.name}: ${caster} charges the Lamp with ${x}.`, "effect");
break;
}
// Adapted from Card-Forge/forge (r/ring_of_maruf.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "marufCharge": {
// Ring of Ma'ruf: the exile-self cost was paid at activation time via the
// existing "exile" cost token (see ACTIVATE_ABILITY). No target, no UI step.
// The charge is consumed by performDraws; the pick resolves via MARUF_PICK.
ns = { ...ns, [caster]: { ...ns[caster], marufCharges: (ns[caster].marufCharges || 0) + 1 } };
ns = dlog(ns, `${card.name}: the next card ${caster} would draw this turn is replaced.`, "effect");
break;
}
case "guardianAngel": {
// Guardian Angel clause 1: prevent X damage to target.
if (tgt === 'p' || tgt === 'o') {
  ns = { ...ns, [tgt]: { ...ns[tgt], damageShield: (ns[tgt].damageShield || 0) + xVal } };
} else if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + xVal } : c
  ) } };
} else {
  ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
  break;
}
// Clause 2: grant temporary {1} prevention ability for rest of turn.
// 1994 fast-effect convention: this applies DIRECTLY (no stack, no priority window)
// when activated. It's documented in SYSTEMS.md S12 (Temporary Player Abilities).
ns = { ...ns, [caster]: { ...ns[caster], tempAbilities: [...(ns[caster].tempAbilities || []), {
  id: makeId(),
  source: 'guardian_angel',
  label: 'Guardian Angel — pay {1}: prevent 1',
  cost: '1',
  kind: 'preventOne',
  targetIid: tgtC?.iid || null,
  targetPlayer: (tgt === 'p' || tgt === 'o') ? tgt : null,
}] } };
ns = dlog(ns, `Prevent the next ${xVal} damage to that target this turn. ${caster} gains a temporary {1} prevention ability.`, "effect");
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
ns = discardCard(ns, opp, dc.iid, { cause: 'effect', sourceName: card.name });
ns = dlog(ns, `${opp} discards ${dc.name}.`, "effect");
}
break;
}
// discardOneTgt (Gwendlyn Di Corci -- "target player discards a card at random") shares
// this body with discardOne (Rag Man/Disrupting Scepter, neither of which pass a tgt),
// so the opp-only fallback below is unchanged for those cards.
case "discardOneTgt":
case "discardOne": {
const discTgt = (tgt === "p" || tgt === "o") ? tgt : opp;
if (ns[discTgt].hand.length) {
const idx = Math.floor(Math.random() * ns[discTgt].hand.length);
const dc = ns[discTgt].hand[idx];
ns = discardCard(ns, discTgt, dc.iid, { cause: 'effect', sourceName: card.name });
ns = dlog(ns, `${discTgt} discards ${dc.name}.`, "effect");
}
break;
}
case "wheelOfFortune": {
for (const w of ["p","o"]) {
for (const c of ns[w].hand) { ns = discardCard(ns, w, c.iid, { cause: 'effect', sourceName: card.name }); }
ns = drawD(ns, w, 7);
}
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
if (gyTgt) {
ns = applyRegrowthReturn(ns, gyTgt.iid, caster);
} else if (ns[caster].gy.length > 1) {
// Regrowth/Adun Oakenshield graveyard-card picker: 2+ eligible cards means a
// real choice exists, so present it via the generic pendingChoice/ChoiceModal
// mechanism (kind: 'gyCardChoice') instead of silently taking the most recent
// card. RESOLVE_CHOICE below relocates to applyRegrowthReturn with the chosen iid.
ns = createPendingChoice(ns, {
sourceCardId: card.iid,
controller: caster,
kind: 'gyCardChoice',
mode: 'regrowth',
options: ns[caster].gy.map(c => ({ id: c.iid, label: c.name })),
});
} else if (ns[caster].gy.length === 1) {
ns = applyRegrowthReturn(ns, ns[caster].gy[0].iid, caster);
}
break;
}
case "regrowthCreature": {
const myC = ns[caster].gy.filter(isCre);
const gyTgtC = tgt ? myC.find(c => c.iid === tgt) : null;
if (gyTgtC) {
ns = applyRegrowthCreatureReturn(ns, gyTgtC.iid, caster, card.name);
} else if (myC.length > 1) {
// Same gyCardChoice mechanism as "regrowth" above, restricted to the
// creature-only eligible set.
ns = createPendingChoice(ns, {
sourceCardId: card.iid,
controller: caster,
kind: 'gyCardChoice',
mode: 'regrowthCreature',
cardName: card.name,
options: myC.map(c => ({ id: c.iid, label: c.name })),
});
} else if (myC.length === 1) {
ns = applyRegrowthCreatureReturn(ns, myC[0].iid, caster, card.name);
}
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
ns = hurt(ns, w, xVal, "Hurricane", { sourceIid: card.iid, sourceType: inferSourceType(card) });
const fl = ns[w].bf.filter(c => isCre(c) && hasKw(c, KEYWORDS.FLYING.id));
for (const c of fl) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, damage: x.damage + xVal } : x) } };
}
ns = checkDeath(ns);
break;
}
case "earthquake": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, xVal, "Earthquake", { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  // Bartel Runeaxe: "can't be the target of Aura spells" -- reject before attaching.
  if (tgtC.cantBeTargetOfAuraSpells) {
    return dlog(s, `${tgtC.name} can't be the target of Aura spells.`, 'info');
  }
  // Animate Wall: Wall-only target guard -- reject before attaching.
  if (card.mod.enchantWallOnly && !tgtC.subtype?.includes('Wall')) {
    return dlog(s, `${card.name} can only enchant Walls.`, 'info');
  }
  // Cocoon: "Enchant creature you control" -- reject an opponent's creature
  // before attaching.
  if (card.mod.enchantOwnOnly && tgtC.controller !== caster) {
    return dlog(s, `${card.name} can only enchant a creature you control.`, 'info');
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
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
  }
  // Regeneration Aura: grant {G}: Regenerate activated ability to the host creature.
  if (card.mod.regenerationAura) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, activated: c.activated || { cost: 'G', effect: 'regenerate' } } : c
    )}};
  }
  // Earthbind: if host has flying at attach time, deal 2 damage and gain "loses flying".
  if (card.mod.earthbind && hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
    ns = hurtCreature(ns, tgtC.iid, 2, 'Earthbind', { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  // Cocoon: "When this Aura enters, tap enchanted creature and put three pupa
  // counters on this Aura." Counters live on the aura record itself (not the
  // creature) -- the doesNotUntapNormally-idiom check in the untap step reads
  // them via enchantments?.find(e => e.name === "Cocoon").
  if (card.name === "Cocoon") {
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller],
      bf: ns[tgtC.controller].bf.map(c => {
        if (c.iid !== tgtC.iid) return c;
        const encs = [...c.enchantments];
        const idx = encs.length - 1;
        encs[idx] = { ...encs[idx], counters: { PUPA: 3 } };
        return { ...c, enchantments: encs };
      })
    }};
    ns = dlog(ns, `Cocoon taps ${tgtC.name} and puts three pupa counters on itself.`, 'effect');
  }
  // Venarian Gold: "When this Aura enters, tap enchanted creature and put X
  // sleep counters on it." Counters live on the CREATURE (not the Aura,
  // unlike Cocoon above) -- the doesNotUntapNormally-idiom check reads
  // c.counters?.SLEEP directly.
  if (card.name === "Venarian Gold") {
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
    const vgX = Math.max(0, xVal || 0);
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, counters: { ...c.counters, SLEEP: (c.counters?.SLEEP || 0) + vgX } } : c
    ) } };
    ns = dlog(ns, `Venarian Gold taps ${tgtC.name} and puts ${vgX} sleep counter(s) on it.`, 'effect');
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
case "enchantArtifact": {
  if (tgtC && isArt(tgtC)) {
    if (card.mod) {
      // Animate Artifact: embed aura mod record in the artifact's enchantments
      // array, same shape as enchantCreature/enchantLand's embedded path.
      // Guardian Beast check ported from enchantCreature -- a genuine "can this
      // permanent be newly enchanted" rule, not specific to that case.
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
      ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
        c.iid === tgtC.iid ? { ...c, enchantments: [...(c.enchantments || []), auraRecord] } : c
      )}};
      ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, 'effect');
      return ns;
    }
    // Living Artifact: Kudzu-style bf-permanent aura -- must remain a first-class
    // permanent (not an embedded enchantments[] record) so its triggeredAbilities
    // (ON_PLAYER_DAMAGED) and its own upkeep field are dispatched normally by the
    // existing per-permanent scan loops (emitEvent, the UPKEEP switch).
    // Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    const pArr = { ...card, controller: caster, tapped: false, summoningSick: false,
      attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
      enchantedArtifactIid: tgtC.iid };
    ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
    ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, "effect");
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
case "nalathniDragonPump": {
// Nalathni Dragon {R}: +1/+0 until end of turn -- same shape as
// pumpPowerEOT above, plus turnState.activationCounts[iid] tracking for the
// "if this ability has been activated four or more times this turn,
// sacrifice this creature at the beginning of the next end step" clause
// (see the activationCountAtLeast condition / nalathniDragonSacrifice
// triggered effect).
// Adapted from Card-Forge/forge (n/nalathni_dragon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const self = ns[caster].bf.find(c => c.iid === item.card.iid);
if (self) {
ns = { ...ns,
[caster]: { ...ns[caster],
bf: ns[caster].bf.map(c =>
c.iid === self.iid
? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1 }] }
: c
),
},
};
ns = { ...ns, turnState: { ...ns.turnState, activationCounts: { ...ns.turnState.activationCounts, [self.iid]: (ns.turnState.activationCounts?.[self.iid] || 0) + 1 } } };
ns = dlog(ns, `${self.name} gets +1/+0 until end of turn.`, "effect");
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
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name, srcMeta);
else if (tgtC) ns = hurtCreature(ns, tgtC.iid, 1, card.name, srcMeta);
break;
}
case "damage1": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name, srcMeta);
else if (tgtC) ns = hurtCreature(ns, tgtC.iid, 1, card.name, srcMeta);
break;
}
case "damage2": {
if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 2, card.name, srcMeta);
else if (tgtC) ns = hurtCreature(ns, tgtC.iid, 2, card.name, srcMeta);
break;
}
case "grantMountainwalkTarget": {
// Cave People: "{1}{R}{R}, {T}: Target creature gains mountainwalk until end of turn."
// Adapted from Card-Forge/forge (c/cave_people.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.MOUNTAINWALK.id] }] } : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} gains mountainwalk until end of turn.`, 'effect');
}
break;
}
case "destroyTapped": {
if (tgtC && tgtC.tapped) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
// Ramses Overdark: "Destroy target enchanted creature." Same shape as destroyTapped
// above, restricted to creatures with at least one attached Aura instead of tapped.
case "destroyEnchantedCreature": {
if (tgtC && tgtC.enchantments?.length) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
break;
}
// Tetsuo Umezawa: "Destroy target tapped or blocking creature." Same shape as
// destroyTapped/destroyEnchantedCreature above, predicate widened to tapped OR
// currently blocking.
case "destroyTappedOrBlocking": {
if (tgtC && (tgtC.tapped || tgtC.blocking != null)) { ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "gy"); ns = dlog(ns, `${card.name} destroys ${tgtC.name}.`, "effect"); }
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
if (tgtC) { ns = tapPermanent(ns, tgtC.controller, tgtC.iid); ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, paralyzed: true } : c) } }; ns = dlog(ns, `${tgtC?.name} is paralyzed.`, "effect"); }
break;
}
case "pestilence": {
for (const w of ["p","o"]) {
ns = hurt(ns, w, 1, "Pestilence", { sourceIid: card.iid, sourceType: inferSourceType(card) });
for (const c of ns[w].bf.filter(isCre)) ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, damage: x.damage+1 } : x) } };
}
ns = checkDeath(ns);
break;
}
case "orcishArtillery": {
ns = hurt(ns, tgt === "o" || tgt === "p" ? tgt : opp, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
ns = hurt(ns, caster, 3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  ns = hurt(ns, w, 6, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  const cresSnap = ns[w].bf.filter(isCre).map(c => c.iid);
  for (const cid of cresSnap) {
    ns = hurtCreature(ns, cid, 6, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  }
}
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
if (dmg > 0) ns = hurt(ns, victim, dmg, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
      ns = zMove(ns, tid, w, w, "exile");
    }
  }
}
ns = hurt(ns, caster, 5, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
ns = dlog(ns, `${card.name}: exiled ${targets.length} creature(s); ${caster} loses 5 life.`, 'effect');
break;
}
case "stormSeeker": {
const victim = tgt === 'p' || tgt === 'o' ? tgt : opp;
const handSize = ns[victim].hand.length;
if (handSize > 0) ns = hurt(ns, victim, handSize, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
ns = dlog(ns, `${card.name}: deals ${handSize} damage to ${victim}.`, 'effect');
break;
}
case "destroyForests": {
for (const w of ['p', 'o']) {
  const forests = [...ns[w].bf.filter(c => isLand(c) && c.subtype?.toLowerCase().includes('forest'))];
  for (const f of forests) ns = destroyLand(ns, f.iid);
}
ns = dlog(ns, `${card.name}: all Forests destroyed.`, 'effect');
break;
}
case "typhoon": {
const oppSide = caster === 'p' ? 'o' : 'p';
const islandCount = ns[oppSide].bf.filter(c => isLand(c) && c.subtype?.toLowerCase().includes('island')).length;
if (islandCount > 0) ns = hurt(ns, oppSide, islandCount, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  if (xDmg > 0) ns = hurt(ns, victim, xDmg, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller],
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
if (tgt === 'p' || tgt === 'o') ns = hurt(ns, tgt, 4, card.name, srcMeta);
else if (tgtC) {
  ns = hurtCreature(ns, tgtC.iid, 4, card.name, srcMeta);
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
if (tgt === 'p' || tgt === 'o') ns = hurt(ns, tgt, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
else if (tgtC) {
  ns = hurtCreature(ns, tgtC.iid, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
}
const pEntity = ns[caster].bf.find(c => c.name === 'Psionic Entity');
if (pEntity) {
  ns = hurtCreature(ns, pEntity.iid, 3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
// preventDamage2Creature (Kei Takahashi) is a new sibling rather than a parameterized
// preventDamage1Creature -- Oasis relies on the fixed 1-damage amount above.
case "preventDamage2Creature": {
if (tgtC) {
  ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + 2 } : c
  ) } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} has 2 damage prevented.`, 'effect');
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- no legal creature target.`, 'effect');
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
  ns = hurtCreature(ns, f1id, p2, f2.name, { sourceIid: f2.iid, sourceType: 'creature' });
  ns = hurtCreature(ns, f2id, p1, f1.name, { sourceIid: f1.iid, sourceType: 'creature' });
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
// Pyramids mode 2: "The next time target land would be destroyed this turn,
// remove all damage marked on it instead." Pushes a shield entry consumed by
// destroyLand(). Land-only targeting is enforced pre-resolution by
// isLandOnlyTarget's click-routing guard -- this check is defense-in-depth,
// matching the established convention (unreachable through normal play).
case "preventLandDestructionOnce": {
if (!tgtC || !isLand(tgtC)) { ns = dlog(ns, `${card.name} fizzles -- no valid land target.`, "effect"); break; }
ns = { ...ns, turnState: { ...ns.turnState, landDestructionShields: { ...ns.turnState.landDestructionShields, [tgtC.iid]: [...(ns.turnState.landDestructionShields?.[tgtC.iid] || []), { shieldSourceIid: card.iid, shieldSourceName: card.name }] } } };
ns = dlog(ns, `${card.name} shields ${tgtC.name} against destruction.`, "effect");
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
ns = hurt(ns, caster, selfDmg, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = dlog(ns, `${card.name} deals 1 damage to ${tgtC.name}.`, "effect");
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- target is not attacking or blocking.`, "effect");
}
break;
}
// pingCombatant2/pingCombatant3 (Tor Wauki/Lady Caleria) are new sibling cases rather
// than a parameterized pingCombatant -- D'Avenant Archer relies on the fixed 1-damage
// amount above and is left untouched.
case "pingCombatant2": {
const isAttackingC2 = (ns.attackers || []).includes(tgtC?.iid);
const isBlockingC2 = tgtC?.blocking != null;
if (tgtC && (isAttackingC2 || isBlockingC2)) {
  ns = hurtCreature(ns, tgtC.iid, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = dlog(ns, `${card.name} deals 2 damage to ${tgtC.name}.`, "effect");
} else {
  ns = dlog(ns, `${card.name}'s ability fizzles -- target is not attacking or blocking.`, "effect");
}
break;
}
case "pingCombatant3": {
const isAttackingC3 = (ns.attackers || []).includes(tgtC?.iid);
const isBlockingC3 = tgtC?.blocking != null;
if (tgtC && (isAttackingC3 || isBlockingC3)) {
  ns = hurtCreature(ns, tgtC.iid, 3, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = dlog(ns, `${card.name} deals 3 damage to ${tgtC.name}.`, "effect");
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
  ns = hurt(ns, tgt, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = dlog(ns, `${card.name} deals 1 damage to ${tgt} (player choice).`, "effect");
} else if (tgtC) {
  ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  ns = hurtCreature(ns, cwOppTgt.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = dlog(ns, `${card.name} deals 1 damage to ${cwOppTgt.name} (opponent's choice, deterministic).`, "effect");
} else {
  ns = hurt(ns, caster, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
    while (ns[w].hand.length > minHand) { const disc = ns[w].hand[ns[w].hand.length-1]; ns = discardCard(ns, w, disc.iid, { cause: 'effect', sourceName: card.name }); }
  }
  ns = checkDeath(ns);
  ns = dlog(ns, "Balance: permanents and hands equalized.", "effect");
  break;
}
case "drainPower": {
const oppLands = ns[opp].bf.filter(c => isLand(c) && !c.tapped);
for (const l of oppLands) ns = tapPermanent(ns, opp, l.iid);
const mp = { ...ns[caster].mana };
oppLands.forEach(l => { const m = l.produces?.[0] || "C"; mp[m] = (mp[m] || 0) + 1; });
ns = { ...ns, [caster]: { ...ns[caster], mana: mp } };
ns = dlog(ns, `${card.name} drains opponent's mana.`, "effect");
break;
}
case "manaShort": {
const who2 = tgt || opp;
const shortLands = ns[who2].bf.filter(c => isLand(c));
for (const l of shortLands) ns = tapPermanent(ns, who2, l.iid);
ns = { ...ns, [who2]: { ...ns[who2], mana: { W:0,U:0,B:0,R:0,G:0,C:0 } } };
ns = dlog(ns, `${card.name} taps all lands and drains mana pool.`, "effect");
break;
}
case "tapTarget": {
if (tgtC) ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
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
ns = { ...ns, turnState: { ...ns.turnState, sacrificedIids: [...(ns.turnState.sacrificedIids || []), sac.iid] } };
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
// Blaze of Glory: "Target creature defending player controls can block any
// number of creatures this turn. It blocks each attacking creature this
// turn if able." Sets a flag only -- no explicit DECLARE_BLOCKER action is
// required or expected for the extra attackers; getEffectiveBlockers (below)
// synthesizes this creature as blocking every attacker it can legally block
// at read time. "If able" falls out of that same canBlockDuel check, so no
// separate must-block enforcement is needed (this is a hard capability
// grant, unlike Lure's must-block requirement, which stays AI-only per
// existing precedent -- see planBlock's lureAttId handling in AI.js).
case "blazeOfGlory": {
if (!tgtC || !isCre(tgtC)) {
ns = dlog(ns, `Blaze of Glory fizzles -- no valid creature target.`, "effect");
break;
}
ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c => c.iid === tgtC.iid ? { ...c, blocksAllAttackers: true } : c) } };
ns = dlog(ns, `${tgtC.name} can block any number of attacking creatures this turn.`, "effect");
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
  const { copied } = applyPermanentCopy(ns, card.iid, tgtC, { typeSuffix: 'Enchantment' });
  const newPerm = {
    ...copied, iid: card.iid, controller: caster, enterTs: ns.layerClock ?? 0,
    tapped: false, summoningSick: true, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], tokens: [], exerted: false,
  };
  // Push newPerm directly to bf -- RESOLVE_STACK's alreadyOnBf guard will skip adding pArr.
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, newPerm] } };
  ns = dlog(ns, `${card.name} enters as a copy of ${copied.name}.`, 'effect');
  break;
}
// Vesuvan Doppelganger: "You may have this creature enter as a copy of any
// creature on the battlefield, except it doesn't copy that creature's color
// and it has 'At the beginning of your upkeep, you may have this creature
// become a copy of target creature, except it doesn't copy that creature's
// color and it has this ability.'" Layer 1 copy via applyPermanentCopy,
// generalized from Copy Artifact above (creature target instead of artifact,
// colorOverride instead of typeSuffix). Declining (no target) leaves the
// printed 0/0 Shapeshifter, which dies to state-based actions (checkDeath's
// toughness<=0 check) at the next opportunity -- not new logic.
// Adapted from Card-Forge/forge (v/vesuvan_doppelganger.txt), GPL-3.0. See
// THIRD_PARTY_NOTICES.md.
case "vesuvanEtbCopy": {
  if (!tgtC || !isCre(tgtC)) break; // declined or no legal target -- enters as a 0/0 Shapeshifter
  const { copied } = applyPermanentCopy(ns, card.iid, tgtC, { colorOverride: VESUVAN_DOPPELGANGER_COLOR });
  const newPerm = {
    ...copied, iid: card.iid, controller: caster, enterTs: ns.layerClock ?? 0,
    tapped: false, summoningSick: true, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], tokens: [], exerted: false,
    triggeredAbilities: [VESUVAN_RECOPY_ABILITY],
  };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, newPerm] } };
  ns = dlog(ns, `${card.name} enters as a copy of ${copied.name}.`, 'effect');
  break;
}
// Dance of Many: "When Dance of Many enters, create a token that's a copy of
// target nontoken creature." Uses the same ETB-copy call shape as Copy
// Artifact/Vesuvan Doppelganger above (applyPermanentCopy with a
// not-yet-on-any-battlefield sourceCardIid), but the token is a SEPARATE
// permanent from Dance of Many itself (Dance of Many stays on the
// battlefield as its own Enchantment, unlike Copy Artifact which becomes the
// copy). Wires the bidirectional link (linkedTokenIid on Dance of Many,
// sourceIid on the token) so each side's leaves-the-battlefield trigger can
// find the other -- see danceOfManyExileToken/the dance_of_many
// orphan-check in the PHASE.UPKEEP block.
// Adapted from Card-Forge/forge (d/dance_of_many.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "danceOfManyCopy": {
  if (!tgtC || !isCre(tgtC) || tgtC.isToken) { ns = dlog(ns, `${card.name}: no legal nontoken creature target -- fizzles.`, "effect"); break; }
  const tokenIid = makeId();
  const { copied } = applyPermanentCopy(ns, tokenIid, tgtC, {});
  const newToken = {
    ...copied, iid: tokenIid, controller: caster, enterTs: ns.layerClock ?? 0,
    tapped: false, summoningSick: true, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], tokens: [], exerted: false,
    isToken: true, sourceIid: card.iid,
    triggeredAbilities: [DANCE_OF_MANY_TOKEN_LEAVES_ABILITY],
  };
  // Dance of Many resolves before RESOLVE_STACK's own ETB push runs (see its
  // alreadyOnBf guard), so its own bf entry -- carrying linkedTokenIid and
  // the leaves-bf trigger -- must be pushed here directly, same as Copy
  // Artifact/Oubliette above, rather than relying on a .map() over an entry
  // that doesn't exist on the battlefield yet.
  const domPerm = {
    ...card, controller: caster, enterTs: ns.layerClock ?? 0,
    tapped: false, summoningSick: true, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [], tokens: [], exerted: false,
    linkedTokenIid: tokenIid,
    triggeredAbilities: [DANCE_OF_MANY_ITSELF_LEAVES_ABILITY],
  };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, newToken, domPerm] } };
  ns = dlog(ns, `${card.name} creates a token copy of ${tgtC.name}.`, "effect");
  break;
}
// Hazezon Tamar: "create X Sand Warrior tokens at the beginning of your next
// upkeep, where X is the number of lands you control at that time." Lands
// are counted NOW (at ETB resolution) per the printed wording ("at that
// time" refers to the moment of counting, i.e. resolution, not the later
// upkeep) and queued via pendingUpkeepTokens -- same delayed-token shape as
// Rukh Egg's pendingEndStepTokens, drained in the PHASE.UPKEEP block instead
// of PHASE.END.
// Adapted from Card-Forge/forge (h/hazezon_tamar.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "hazezonTamarEtb": {
  const landCount = ns[caster].bf.filter(isLand).length;
  ns = { ...ns, pendingUpkeepTokens: [...(ns.pendingUpkeepTokens || []), { tokenId: 'sand_warrior', count: landCount, controller: caster, sourceIid: card.iid }] };
  ns = dlog(ns, `${card.name}: will create ${landCount} Sand Warrior token(s) at the beginning of your next upkeep.`, "effect");
  break;
}
// Giant Slug: "{5}: At the beginning of your next upkeep, choose a basic land
// type. This creature gains landwalk of the chosen type until the end of
// that turn." Queued via pendingUpkeepLandwalk -- same delayed-effect shape
// as Hazezon Tamar's pendingUpkeepTokens above, drained in the PHASE.UPKEEP
// block instead of resolving anything here.
// Adapted from Card-Forge/forge (g/giant_slug.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "giantSlugScheduleLandwalk": {
  ns = { ...ns, pendingUpkeepLandwalk: [...(ns.pendingUpkeepLandwalk || []), { controller: caster, sourceIid: card.iid }] };
  ns = dlog(ns, `${card.name}: will choose a basic land type at the beginning of your next upkeep.`, "effect");
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
ns = hurtCreature(ns, tgtC.iid, xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
ns = hurt(ns, caster, -xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
} else if (tgt === "p" || tgt === "o") {
ns = hurt(ns, tgt, xVal, "Drain Life", { sourceIid: card.iid, sourceType: inferSourceType(card) });
ns = hurt(ns, caster, -xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
}
break;
}
case "syphonSoul": ns = hurt(hurt(ns, opp, 2, "Syphon Soul", { sourceIid: card.iid, sourceType: inferSourceType(card) }), caster, -2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); break;
case "shuffleGraveyardIn": {
const who3 = tgt || caster;
ns = { ...ns, [who3]: { ...ns[who3], lib: shuffle([...ns[who3].lib, ...ns[who3].gy]), gy: [] } };
ns = dlog(ns, `${card.name} shuffles graveyard into library.`, "effect");
break;
}
case "bazaarActivate": {
ns = performDraws(ns, caster, 2, [{ id: "bazaarDiscard3" }]);
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
    if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    else if (tgtC) {
      ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    }
    ns = dlog(ns, `${card.name} removes a counter and deals 1 damage.`, "effect");
  }
  break;
}
// Osai Vultures: "Remove two carrion counters from this creature: This
// creature gets +1/+1 until end of turn." Cost-availability is also gated at
// the ACTIVATE_ABILITY pre-flight step (mirrors the sacArt/sacCre gate); this
// inline check mirrors Triskelion's belt-and-suspenders pattern.
// Adapted from Card-Forge/forge (o/osai_vultures.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "osaiVulturesPump": {
  const ov = ns[caster].bf.find(c => c.iid === card.iid);
  if (ov && (ov.counters?.CARRION || 0) >= 2) {
    ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
      c.iid === card.iid
        ? { ...c, counters: { ...c.counters, CARRION: c.counters.CARRION - 2 }, eotBuffs: [...(c.eotBuffs || []), { power: 1, toughness: 1 }] }
        : c
    ) } };
    ns = dlog(ns, `${card.name} removes two carrion counters and gets +1/+1 until end of turn.`, "effect");
  }
  break;
}
// Scavenging Ghoul: "Remove a corpse counter from this creature: Regenerate
// this creature." Checked inline (Triskelion's counter-cost convention), not
// via a generic pre-flight gate.
// Adapted from Card-Forge/forge (s/scavenging_ghoul.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "scavengingGhoulRegen": {
  const sg = ns[caster].bf.find(c => c.iid === card.iid);
  if (sg && (sg.counters?.CORPSE || 0) > 0) {
    ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
      c.iid === card.iid
        ? { ...c, counters: { ...c.counters, CORPSE: c.counters.CORPSE - 1 }, regenerating: true }
        : c
    ) } };
    ns = dlog(ns, `${card.name} removes a corpse counter and will regenerate.`, "effect");
  }
  break;
}
// Sage of Lat-Nam: "{T}, Sacrifice an artifact: Draw a card." Same shape as
// Priest of Yawgmoth's addBBySacrificedCmc (cost: T,sacArt), but the drawn
// amount is fixed at 1 -- no CMC scaling.
// Adapted from Card-Forge/forge (s/sage_of_lat_nam.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "drawCardSacArt": {
  ns = drawD(ns, caster, 1);
  ns = dlog(ns, `${card.name} draws a card.`, "effect");
  break;
}
// Island of Wak-Wak: "Target creature with flying has base power 0 until end
// of turn." Same shape as Singing Tree's setAttackerPower0EOT, but the
// legality check is "has flying" instead of "is attacking".
// Adapted from Card-Forge/forge (i/island_of_wak_wak.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "setFlyingCreaturePower0EOT": {
  if (tgtC && isCre(tgtC) && hasKw(tgtC, KEYWORDS.FLYING.id, ns)) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { layerDef: { layer: '7b', setPower: 0 } }] } : c
    ) } };
    ns = dlog(ns, `${card.name}: ${tgtC.name} has base power 0 until end of turn.`, "effect");
  } else {
    ns = dlog(ns, `${card.name}'s ability fizzles -- target does not have flying.`, "effect");
  }
  break;
}
// Urza's Avenger: "{0}: This creature gets -1/-1 and gains your choice of
// banding, flying, first strike, or trample until end of turn." Reuses the
// generic modalChoice pendingChoice kind (Alabaster Potion); each option
// re-enters resolveEff via its own effect id below.
// Adapted from Card-Forge/forge (u/urzas_avenger.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "urzasAvengerChoice": {
  ns = createPendingChoice(ns, {
    sourceCardId: card.iid,
    controller: caster,
    kind: 'modalChoice',
    card: { name: card.name, iid: card.iid },
    tgt: null,
    xVal,
    options: [
      { id: 'banding', label: 'Gains banding', effect: 'urzasAvengerBanding' },
      { id: 'flying', label: 'Gains flying', effect: 'urzasAvengerFlying' },
      { id: 'firststrike', label: 'Gains first strike', effect: 'urzasAvengerFirstStrike' },
      { id: 'trample', label: 'Gains trample', effect: 'urzasAvengerTrample' },
    ],
  });
  break;
}
// Urza's Avenger option resolutions: flat -1/-1 applies regardless of choice.
// Banding itself is a currently-unenforced keyword in this engine (tracked as
// its own batch) -- choosing it is legal and tags the keyword, but it won't
// affect combat damage division yet.
// Adapted from Card-Forge/forge (u/urzas_avenger.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "urzasAvengerBanding": {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(x => x.iid === card.iid
    ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: -1, toughness: -1, keywords: [KEYWORDS.BANDING.id] }] } : x) } };
  ns = dlog(ns, `${card.name} gets -1/-1 and gains banding until end of turn.`, "effect");
  break;
}
case "urzasAvengerFlying": {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(x => x.iid === card.iid
    ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: -1, toughness: -1, keywords: [KEYWORDS.FLYING.id] }] } : x) } };
  ns = dlog(ns, `${card.name} gets -1/-1 and gains flying until end of turn.`, "effect");
  break;
}
case "urzasAvengerFirstStrike": {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(x => x.iid === card.iid
    ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: -1, toughness: -1, keywords: [KEYWORDS.FIRST_STRIKE.id] }] } : x) } };
  ns = dlog(ns, `${card.name} gets -1/-1 and gains first strike until end of turn.`, "effect");
  break;
}
case "urzasAvengerTrample": {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(x => x.iid === card.iid
    ? { ...x, eotBuffs: [...(x.eotBuffs || []), { power: -1, toughness: -1, keywords: [KEYWORDS.TRAMPLE.id] }] } : x) } };
  ns = dlog(ns, `${card.name} gets -1/-1 and gains trample until end of turn.`, "effect");
  break;
}
// --- GROUP A NEW EFFECTS (Batch 2) -------------------------------------------
case "disintegrate": {
  if (tgt === "p" || tgt === "o") {
    ns = hurt(ns, tgt, xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  } else if (tgtC) {
    ns = { ...ns, exileNextDeath: true };
    ns = hurtCreature(ns, tgtC.iid, xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
case "globalTypeEffect": {
  // Living Lands, Kormus Bell, Blood Moon: continuous type/color/P-T-changing
  // effect applied via layers.js collectEffects' globalTypeEffect scan at read
  // time (RESOLVE_STACK's recomputeTypeEffects call bakes the result onto every
  // matching land right after this resolves). No state mutation here.
  // See docs/SYSTEMS.md S18.9.
  ns = dlog(ns, `${card.name} is now in effect (${card.globalTypeEffect?.filter}).`, "effect");
  break;
}
case "stub": console.warn(`STUB: ${card.name} not yet implemented`); ns = dlog(ns, `${card.name} resolves (effect pending).`, "effect"); break;
// --- BATCH: SIMPLE-TIER STUB CARDS (Forge reference batch, GPL-3.0) ----------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "tapTargetWall": {
  // Adapted from Card-Forge/forge (a/ali_baba.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (tgtC && tgtC.subtype?.includes('Wall')) {
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
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
  for (const nc of nonland) { ns = discardCard(ns, dWho, nc.iid, { cause: 'effect', sourceName: card.name }); }
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
case "colorChoiceTarget": {
  // Adapted from Card-Forge/forge (a/alchors_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // Alchor's Tomb: "Target permanent you control becomes the color of your choice."
  // Presents a 5-option pendingChoice (kind: colorChoice); RESOLVE_CHOICE sets
  // the target's color permanently, same field colorLace mutates above.
  if (!tgtC || tgtC.controller !== caster) {
    ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
    break;
  }
  ns = createPendingChoice(ns, {
    sourceCardId: card.iid,
    controller: caster,
    kind: 'colorChoice',
    targetIid: tgtC.iid,
    sourceCardName: card.name,
    options: [
      { id: 'W', label: 'White' },
      { id: 'U', label: 'Blue' },
      { id: 'B', label: 'Black' },
      { id: 'R', label: 'Red' },
      { id: 'G', label: 'Green' },
    ],
  });
  break;
}
// Primal Clay: "As this creature enters, it becomes your choice of a 3/3
// artifact creature, a 2/2 artifact creature with flying, or a 1/6 Wall
// artifact creature with defender in addition to its other types." A fixed
// three-mode ETB choice, NOT a copy effect (confirmed against current
// Scryfall oracle text -- not routed through applyPermanentCopy). Same
// direct-from-resolveEff pendingChoice convention as colorChoiceTarget above
// (kind: 'primalClayChoice'); no triggered ability involved.
// Adapted from Card-Forge/forge (p/primal_clay.txt), GPL-3.0. See
// THIRD_PARTY_NOTICES.md.
case "primalClayChoice": {
  ns = createPendingChoice(ns, {
    sourceCardId: card.iid,
    controller: caster,
    kind: 'primalClayChoice',
    options: [
      { id: 'vanilla', label: '3/3 artifact creature', power: 3, toughness: 3, keywords: [] },
      { id: 'flying', label: '2/2 artifact creature with flying', power: 2, toughness: 2, keywords: [KEYWORDS.FLYING.id] },
      { id: 'wall', label: '1/6 Wall artifact creature with defender', power: 1, toughness: 6, keywords: [KEYWORDS.DEFENDER.id], subtypeSuffix: 'Wall' },
    ],
  });
  break;
}
case "pumpWhileTapped": {
  // Adapted from Card-Forge/forge (a/ashnods_battle_gear.txt, t/tawnoss_weaponry.txt),
  // GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // "Target creature [you control] gets +X/+Y for as long as this artifact
  // remains tapped." Stored on the source artifact (whileTappedPump) and read
  // by layers.js as a Layer 7c continuous effect gated on source.tapped --
  // the bonus ends automatically the moment the artifact untaps, no separate
  // duration/expiry tracking needed. card.pumpRequiresControl (Ashnod's Battle
  // Gear only) restricts the target to creatures the caster controls.
  if (!tgtC || !isCre(tgtC) || (card.pumpRequiresControl && tgtC.controller !== caster)) {
    ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
    break;
  }
  const srcOwner = ns.p.bf.some(c => c.iid === card.iid) ? 'p' : 'o';
  ns = { ...ns, [srcOwner]: { ...ns[srcOwner], bf: ns[srcOwner].bf.map(c => c.iid === card.iid
    ? { ...c, whileTappedPump: { targetIid: tgtC.iid, power: card.pumpPower ?? 0, toughness: card.pumpToughness ?? 0 } }
    : c) } };
  const pStr = (card.pumpPower ?? 0) >= 0 ? `+${card.pumpPower ?? 0}` : `${card.pumpPower ?? 0}`;
  const tStr = (card.pumpToughness ?? 0) >= 0 ? `+${card.pumpToughness ?? 0}` : `${card.pumpToughness ?? 0}`;
  ns = dlog(ns, `${card.name}: ${tgtC.name} gets ${pStr}/${tStr} while ${card.name} remains tapped.`, "effect");
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
    ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
  if (tgt === "p" || tgt === "o") { ns = hurt(ns, tgt, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) }); }
  else if (tgtC) {
    ns = hurtCreature(ns, tgtC.iid, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
    const blueCreatures = ns[w].bf.filter(c => isCre(c) && c.color === 'U');
    for (const c of blueCreatures) ns = tapPermanent(ns, w, c.iid);
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
  if (tgt === "p" || tgt === "o") ns = hurt(ns, tgt, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  else if (tgtC) ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = hurt(ns, caster, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
    ns = hurt(ns, caster, -cmcGain, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
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
  if (whiteCount > 0) ns = hurt(ns, revWho2, whiteCount, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  break;
}
case "drawThenDiscardOwn": {
  // Adapted from Card-Forge/forge (j/jalum_tome.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no UI to choose which card to discard; discards the most
  // recently drawn card (same convention as forced cleanup discards).
  ns = performDraws(ns, caster, 1, [{ id: "discardLastDrawn", sourceName: card.name }]);
  break;
}
case "gainLifeSacrificedToughness": {
  // Adapted from Card-Forge/forge (l/life_chisel.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const tou2 = item.sacrificedCard?.toughness || 0;
  if (tou2 > 0) ns = hurt(ns, caster, -tou2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
case "addManaFromSacrificedValue": {
  // Sacrifice: "...Add an amount of {B} equal to the sacrificed creature's mana value."
  const mv = item.additionalCostPaid?.card?.cmc || 0;
  if (mv > 0) {
    const mp5 = { ...ns[caster].mana }; mp5.B = (mp5.B || 0) + mv;
    ns = { ...ns, [caster]: { ...ns[caster], mana: mp5 } };
  }
  ns = dlog(ns, `${card.name} adds ${mv}B.`, "mana");
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
  ns = hurt(ns, caster, -dmgAmt, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  if (tgtC && tgtC.controller === caster && dmgAmt > 0) {
    ns = hurtCreature(ns, tgtC.iid, dmgAmt, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  }
  ns = dlog(ns, `${card.name}: ${caster} gains ${dmgAmt} life; deals ${dmgAmt} to ${tgtC?.name || 'target'}.`, "effect");
  break;
}
case "drawRevealDiscardIfNonland": {
  // Adapted from Card-Forge/forge (s/sindbad.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  ns = performDraws(ns, caster, 1, [{ id: "revealDiscardIfNonland", sourceName: card.name }]);
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
    ns = tapPermanent(ns, owner2, cid);
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
    ns = hurtCreature(ns, tgtC.iid, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
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
// --- BEGIN BATCH: ANTE CARDS -------------------------------------------------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "contractFromBelow": {
  // Adapted from Card-Forge/forge (c/contract_from_below.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const hc of ns[caster].hand) { ns = discardCard(ns, caster, hc.iid, { cause: 'effect', sourceName: card.name }); }
  if (ns[caster].lib.length) {
    const [anted, ...restLib] = ns[caster].lib;
    const extraKey = caster === 'p' ? 'anteExtraP' : 'anteExtraO';
    ns = { ...ns, [caster]: { ...ns[caster], lib: restLib }, [extraKey]: [...ns[extraKey], anted] };
    ns = dlog(ns, `${card.name}: ${caster} antes ${anted.name}.`, "effect");
  }
  ns = drawD(ns, caster, 7);
  break;
}
case "demonicAttorney": {
  // Adapted from Card-Forge/forge (d/demonic_attorney.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    if (!ns[w].lib.length) continue;
    const [anted, ...restLib] = ns[w].lib;
    const extraKey = w === 'p' ? 'anteExtraP' : 'anteExtraO';
    ns = { ...ns, [w]: { ...ns[w], lib: restLib }, [extraKey]: [...ns[extraKey], anted] };
    ns = dlog(ns, `${card.name}: ${w} antes ${anted.name}.`, "effect");
  }
  break;
}
case "rebirthAnte": {
  // Adapted from Card-Forge/forge (r/rebirth.txt), GPL-3.0.
  // SIMPLIFICATION: the real card lets each player individually choose whether
  // to ante (no downside besides the ante risk, upside is a life reset to 20).
  // No per-player yes/no UI exists for this niche legacy ante decision, so each
  // player auto-antes only when it would raise their life (life < 20) --
  // consistent with existing "auto-decide" conventions elsewhere in this file
  // (Brainwash, Hasran Ogress: no UI to decline, decision made automatically).
  for (const w of ['p', 'o']) {
    if (ns[w].life >= 20 || !ns[w].lib.length) continue;
    const [anted, ...restLib] = ns[w].lib;
    const extraKey = w === 'p' ? 'anteExtraP' : 'anteExtraO';
    ns = { ...ns, [w]: { ...ns[w], lib: restLib, life: 20 }, [extraKey]: [...ns[extraKey], anted] };
    ns = dlog(ns, `${card.name}: ${w} antes ${anted.name} -- life becomes 20.`, "effect");
  }
  break;
}
case "jeweledBirdAnte": {
  // Adapted from Card-Forge/forge (j/jeweled_bird.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const extraKey = caster === 'p' ? 'anteExtraP' : 'anteExtraO';
  const anteScalarKey = caster === 'p' ? 'anteP' : 'anteO';
  const oldStake = [...(ns[anteScalarKey] ? [ns[anteScalarKey]] : []), ...ns[extraKey]];
  ns = {
    ...ns,
    [caster]: { ...ns[caster], gy: [...ns[caster].gy, ...oldStake] },
    [anteScalarKey]: null,
    [extraKey]: [card],
  };
  ns = drawD(ns, caster, 1);
  ns = dlog(ns, `${card.name}: ${caster} antes it, discards the rest of their ante, and draws a card.`, "effect");
  break;
}
case "bronzeTabletExchange": {
  // Adapted from Card-Forge/forge (b/bronze_tablet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // SIMPLIFICATION: no per-player yes/no UI exists for this legacy ante decision
  // (same convention as rebirthAnte above); the targeted player auto-pays 10
  // life when it wouldn't be lethal, else declines.
  if (tgtC) {
    const owner = tgtC.controller;
    const willPay = ns[owner].life > 10;
    ns = zMove(ns, card.iid, caster, caster, "exile");
    ns = zMove(ns, tgtC.iid, owner, owner, "exile");
    if (willPay) {
      ns = { ...ns, [owner]: { ...ns[owner], life: ns[owner].life - 10 } };
      ns = zMove(ns, card.iid, caster, caster, "gy");
      ns = dlog(ns, `${owner} pays 10 life -- ${card.name} is put into its owner's graveyard.`, "effect");
    } else {
      ns = {
        ...ns,
        ownershipChanges: [
          ...ns.ownershipChanges,
          { cardId: card.id, card, newOwner: owner },
          { cardId: tgtC.id, card: tgtC, newOwner: caster },
        ],
      };
      ns = dlog(ns, `${owner} declines -- ownership of ${card.name} and ${tgtC.name} is permanently exchanged.`, "effect");
    }
  }
  break;
}
case "tempestEfreetExchange": {
  // Adapted from Card-Forge/forge (t/tempest_efreet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // Tempest Efreet is already sacrificed to caster's gy as the activation cost
  // (see ACTIVATE_ABILITY's sac-cost handling); this resolves the exchange.
  // SIMPLIFICATION: no per-player yes/no UI exists for this legacy ante
  // decision; the targeted opponent auto-pays 10 life when it wouldn't be
  // lethal, else declines (same convention as bronzeTabletExchange above).
  const willPay = ns[opp].life > 10;
  if (willPay) {
    ns = { ...ns, [opp]: { ...ns[opp], life: ns[opp].life - 10 } };
    ns = dlog(ns, `${opp} pays 10 life to save their hand from ${card.name}.`, "effect");
  } else if (ns[opp].hand.length) {
    // OBSERVED (out of scope for this prompt): Math.random() here violates the
    // project's "all randomness routes through the seeded RNG" rule. Pre-existing,
    // unrelated to the generalized-choice-mechanisms work -- not fixed here.
    const idx = Math.floor(Math.random() * ns[opp].hand.length);
    const revealed = ns[opp].hand[idx];
    ns = { ...ns, [opp]: { ...ns[opp], hand: ns[opp].hand.filter((_, i) => i !== idx) } };
    ns = { ...ns, [caster]: { ...ns[caster], hand: [...ns[caster].hand, revealed], gy: ns[caster].gy.filter(c => c.iid !== card.iid) } };
    ns = { ...ns, [opp]: { ...ns[opp], gy: [...ns[opp].gy, card] } };
    ns = {
      ...ns,
      ownershipChanges: [
        ...ns.ownershipChanges,
        { cardId: revealed.id, card: revealed, newOwner: caster },
        { cardId: card.id, card, newOwner: opp },
      ],
    };
    ns = dlog(ns, `${opp} declines -- reveals ${revealed.name}. Ownership of ${revealed.name} and ${card.name} is permanently exchanged.`, "effect");
  }
  break;
}
case "darkpactExchange": {
  // Adapted from Card-Forge/forge (d/darkpact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // "You own target card in the ante. Exchange that card with the top card of
  // your library." Read as a targeting restriction ("target card in the ante
  // that you own") rather than an ownership-changing effect -- see completion
  // summary for the Forge-naming (GainOwnership) vs. Oracle-text discrepancy
  // this resolves. Only the caster's own ante contributions are legal targets;
  // picking which one is deferred to pendingAnteExchange (reuses TutorModal).
  const scalarKey = caster === 'p' ? 'anteP' : 'anteO';
  const extraKey  = caster === 'p' ? 'anteExtraP' : 'anteExtraO';
  const ownAnteCards = [...(ns[scalarKey] ? [ns[scalarKey]] : []), ...ns[extraKey]];
  if (!ownAnteCards.length) {
    ns = dlog(ns, `${card.name} fizzles -- ${caster} owns no card in the ante.`, "effect");
    break;
  }
  ns = { ...ns, pendingAnteExchange: { caster, cards: ownAnteCards } };
  break;
}
// --- END BATCH: ANTE CARDS ----------------------------------------------------
// --- BEGIN BATCH: COMPLEX-TIER C1 (activated abilities and spells) -----------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "alabasterPotionChoice": {
  // Alabaster Potion: "Choose one -- target player gains X life. / Prevent the
  // next X damage that would be dealt to any target this turn."
  ns = createPendingChoice(ns, {
    sourceCardId: card.iid,
    controller: caster,
    kind: 'modalChoice',
    card: { name: card.name, iid: card.iid },
    tgt,
    xVal,
    options: [
      { id: 'gain', label: `Target player gains ${xVal} life`, effect: 'gainLifeXTarget' },
      { id: 'prevent', label: `Prevent the next ${xVal} damage to any target`, effect: 'preventDamageXAny' },
    ],
  });
  break;
}
case "gainLifeXTarget": {
  const who = tgt === 'p' || tgt === 'o' ? tgt : (tgtC ? tgtC.controller : null);
  if (who) ns = hurt(ns, who, -xVal, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  else ns = dlog(ns, `${card.name} fizzles -- no valid player target.`, "effect");
  break;
}
case "preventDamageXAny": {
  if (tgt === 'p' || tgt === 'o') {
    ns = { ...ns, [tgt]: { ...ns[tgt], damageShield: (ns[tgt].damageShield || 0) + xVal } };
  } else if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, damageShield: (c.damageShield || 0) + xVal } : c
    ) } };
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
    break;
  }
  ns = dlog(ns, `Prevent the next ${xVal} damage to that target this turn.`, "effect");
  break;
}
// Sewers of Estark: "Choose target creature. If it's attacking, it can't be
// blocked this turn. If it's blocking, prevent all combat damage that would be
// dealt this combat by it and each creature it's blocking."
case "sewersOfEstark": {
  if (!tgtC) { ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect"); break; }
  if (tgtC.attacking) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { unblockable: true }] } : c
    ) } };
    ns = dlog(ns, `${tgtC.name} can't be blocked this turn.`, "effect");
  } else if (tgtC.blocking) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, preventCombatDamageDealt: true } : c
    ) } };
    const atkC = getBF(ns, tgtC.blocking);
    if (atkC) {
      ns = { ...ns, [atkC.controller]: { ...ns[atkC.controller], bf: ns[atkC.controller].bf.map(c =>
        c.iid === atkC.iid ? { ...c, preventCombatDamageDealt: true } : c
      ) } };
    }
    ns = dlog(ns, `${tgtC.name}: prevents combat damage this combat between it and what it's blocking.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- ${tgtC.name} is neither attacking nor blocking.`, "effect");
  }
  break;
}
// Lady Evangela: "Prevent all combat damage that would be dealt by target creature
// this turn." One-shot, unconditional version of the preventCombatDamageDealt flag
// Sewers of Estark sets on blockers/attackers above -- same flag, same combat-damage
// checkpoints, same CLEANUP expiry, just set directly on the chosen target instead
// of derived from attacking/blocking state.
case "preventCombatDamageDealtTarget": {
  if (tgtC) {
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, preventCombatDamageDealt: true } : c
    ) } };
    ns = dlog(ns, `${card.name}: prevents all combat damage ${tgtC.name} would deal this turn.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid creature target.`, "effect");
  }
  break;
}
// Siren's Call: "Creatures the active player controls attack this turn if
// able. At the beginning of the next end step, destroy all non-Wall creatures
// that player controls that didn't attack this turn." SIMPLIFICATION: the
// "cast only during an opponent's turn, before attackers are declared" timing
// restriction is not hard-enforced at cast time (no CAST_SPELL timing-gate
// mechanism exists yet); the effect below is only meaningful if cast legally.
case "sirensCall": {
  const activeWho = ns.active;
  const eligible = ns[activeWho].bf.filter(c => isCre(c) && !c.summoningSick);
  for (const c of eligible) {
    ns = { ...ns, [activeWho]: { ...ns[activeWho], bf: ns[activeWho].bf.map(x =>
      x.iid === c.iid ? { ...x, eotBuffs: [...(x.eotBuffs || []), { keywords: [KEYWORDS.MUST_ATTACK.id] }] } : x
    ) } };
  }
  ns = { ...ns, pendingSirenSweep: { activePlayer: activeWho, eligibleIids: eligible.map(c => c.iid) } };
  ns = dlog(ns, `${card.name}: ${activeWho}'s creatures attack this turn if able.`, "effect");
  break;
}
// Tracker: "{G}{G}, {T}: This creature deals damage equal to its power to
// target creature. That creature deals damage equal to its power to this
// creature." Both powers read before either damage instance is applied.
case "trackerDamageExchange": {
  if (tgtC) {
    const selfPow = getPow(card, ns);
    const tgtPow = getPow(tgtC, ns);
    let selfPowRemaining, tgtPowRemaining;
    ({ state: ns, remainingAmt: selfPowRemaining } = consumeCreatureDamageShields(ns, tgtC.iid, selfPow, { sourceIid: card.iid, sourceType: inferSourceType(card) }));
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, ...dmgWithShield(c, selfPowRemaining) } : c
    ) } };
    ({ state: ns, remainingAmt: tgtPowRemaining } = consumeCreatureDamageShields(ns, card.iid, tgtPow, { sourceIid: tgtC.iid, sourceType: 'creature' }));
    ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
      c.iid === card.iid ? { ...c, ...dmgWithShield(c, tgtPowRemaining) } : c
    ) } };
    ns = dlog(ns, `${card.name} and ${tgtC.name} trade damage.`, "damage");
    ns = checkDeath(ns);
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
  }
  break;
}
// Winter Blast: "Tap X target creatures. Winter Blast deals 2 damage to each
// of those creatures with flying." SIMPLIFICATION: no multi-target picker UI
// for X targets (same convention as tapXCreatures/untapXLands above);
// auto-fills remaining slots with untapped creatures, preferring the opponent's.
case "winterBlastTapX": {
  const explicitCres = (targets || []).filter(id => { const c = getBF(ns, id); return c && isCre(c) && !c.tapped; });
  const pool = [...ns[opp].bf, ...ns[caster].bf].filter(c => isCre(c) && !c.tapped && !explicitCres.includes(c.iid));
  const autoCres = pool.slice(0, Math.max(0, xVal - explicitCres.length)).map(c => c.iid);
  const toTap = [...explicitCres, ...autoCres].slice(0, xVal);
  for (const cid of toTap) {
    const owner = ns.p.bf.some(c => c.iid === cid) ? 'p' : 'o';
    ns = tapPermanent(ns, owner, cid);
  }
  for (const cid of toTap) {
    const owner = ns.p.bf.some(c => c.iid === cid) ? 'p' : 'o';
    const c = ns[owner].bf.find(x => x.iid === cid);
    if (c && hasKw(c, KEYWORDS.FLYING.id)) {
      let wbRemaining;
      ({ state: ns, remainingAmt: wbRemaining } = consumeCreatureDamageShields(ns, cid, 2, { sourceIid: card.iid, sourceType: inferSourceType(card) }));
      ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(x => x.iid === cid ? { ...x, ...dmgWithShield(x, wbRemaining) } : x) } };
    }
  }
  ns = dlog(ns, `${card.name}: taps ${toTap.length} creature(s), damages fliers among them.`, "effect");
  ns = checkDeath(ns);
  break;
}
// Banshee: "{X}, {T}: This creature deals half X damage, rounded down, to any
// target, and half X damage, rounded up, to you."
case "bansheeDrain": {
  const down = Math.floor(xVal / 2);
  const up = Math.ceil(xVal / 2);
  if (tgt === 'p' || tgt === 'o') {
    ns = hurt(ns, tgt, down, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  } else if (tgtC) {
    let bansheeRemaining;
    ({ state: ns, remainingAmt: bansheeRemaining } = consumeCreatureDamageShields(ns, tgtC.iid, down, { sourceIid: card.iid, sourceType: inferSourceType(card) }));
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, ...dmgWithShield(c, bansheeRemaining) } : c
    ) } };
    ns = checkDeath(ns);
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid target.`, "effect");
  }
  ns = hurt(ns, caster, up, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  break;
}
// Eternal Flame: "deals X damage to target opponent or planeswalker and half X
// damage, rounded up, to you, where X is the number of Mountains you control."
// No planeswalkers in this engine -- target is always the opponent player.
case "eternalFlameDrain": {
  const mountains = ns[caster].bf.filter(c => isLand(c) && c.subtype?.includes("Mountain")).length;
  ns = hurt(ns, opp, mountains, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  ns = hurt(ns, caster, Math.ceil(mountains / 2), card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
  break;
}
// Martyr's Cry: "Exile all white creatures. For each creature exiled this way,
// its controller draws a card."
case "martyrsCry": {
  const whites = [...ns.p.bf, ...ns.o.bf].filter(c => isCre(c) && c.color === "W");
  for (const c of whites) {
    const owner = ns.p.bf.some(x => x.iid === c.iid) ? 'p' : 'o';
    ns = zMove(ns, c.iid, owner, owner, "exile");
    ns = drawD(ns, owner);
  }
  ns = dlog(ns, `${card.name}: exiles ${whites.length} white creature(s); controllers draw.`, "effect");
  break;
}
// Volcanic Eruption: "Destroy X target Mountains. Volcanic Eruption deals
// damage to each creature and each player equal to the number of Mountains put
// into a graveyard this way." SIMPLIFICATION: no multi-target picker UI for X
// targets (same convention as tapXCreatures/untapXLands above).
case "volcanicEruption": {
  const explicitMtn = (targets || []).filter(id => { const c = getBF(ns, id); return c && isLand(c) && c.subtype?.includes("Mountain"); });
  const pool = [...ns.p.bf, ...ns.o.bf].filter(c => isLand(c) && c.subtype?.includes("Mountain") && !explicitMtn.includes(c.iid));
  const autoMtn = pool.slice(0, Math.max(0, xVal - explicitMtn.length)).map(c => c.iid);
  const toDestroy = [...explicitMtn, ...autoMtn].slice(0, xVal);
  let destroyedCount = 0;
  for (const lid of toDestroy) {
    const owner = ns.p.bf.some(c => c.iid === lid) ? 'p' : 'o';
    ns = zMove(ns, lid, owner, owner, "gy");
    destroyedCount++;
  }
  if (destroyedCount > 0) {
    for (const c of [...ns.p.bf, ...ns.o.bf].filter(isCre)) {
      const owner = ns.p.bf.some(x => x.iid === c.iid) ? 'p' : 'o';
      let veRemaining;
      ({ state: ns, remainingAmt: veRemaining } = consumeCreatureDamageShields(ns, c.iid, destroyedCount, { sourceIid: card.iid, sourceType: inferSourceType(card) }));
      ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(x => x.iid === c.iid ? { ...x, ...dmgWithShield(x, veRemaining) } : x) } };
    }
    ns = hurt(ns, 'p', destroyedCount, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    ns = hurt(ns, 'o', destroyedCount, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    ns = checkDeath(ns);
  }
  ns = dlog(ns, `${card.name}: destroys ${destroyedCount} Mountain(s), deals ${destroyedCount} damage to each creature and player.`, "effect");
  break;
}
// Winds of Change: "Each player shuffles the cards from their hand into their
// library, then draws that many cards."
case "windsOfChange": {
  for (const w of ["p", "o"]) {
    const n = ns[w].hand.length;
    ns = { ...ns, [w]: { ...ns[w], lib: shuffle([...ns[w].lib, ...ns[w].hand]), hand: [] } };
    ns = drawD(ns, w, n);
  }
  ns = dlog(ns, `${card.name}: each player shuffles their hand into their library and draws that many cards.`, "effect");
  break;
}
// Mana Clash: "You and target opponent each flip a coin. Mana Clash deals 1
// damage to each player whose coin comes up tails. Repeat this process until
// both players' coins come up heads on the same flip." No flipCoin primitive
// exists in this engine; Math.random() follows the same already-flagged
// idiom used elsewhere (e.g. tempestEfreetExchange above) for coin-flip-shaped
// randomness pending a seeded-RNG migration (out of scope for this batch).
case "manaClash": {
  let bothHeads = false;
  let rounds = 0;
  while (!bothHeads && rounds < 100) {
    rounds++;
    const casterHeads = Math.random() < 0.5;
    const oppHeads = Math.random() < 0.5;
    if (!casterHeads) ns = hurt(ns, caster, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    if (!oppHeads) ns = hurt(ns, opp, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
    bothHeads = casterHeads && oppHeads;
    if (ns.over) break;
  }
  ns = dlog(ns, `${card.name}: ${rounds} round(s) of coin flips.`, "effect");
  break;
}
// Mind Bomb: "Each player may discard up to three cards. Mind Bomb deals
// damage to each player equal to 3 minus the number of cards they discarded
// this way." Chained numberChoice per player (caster first, then opponent).
case "mindBomb": {
  ns = createPendingChoice(ns, {
    sourceCardId: card.iid,
    controller: caster,
    kind: 'numberChoice',
    handlerKey: 'mindBombDiscard',
    sourceCardName: card.name,
    forPlayer: caster,
    nextPlayer: opp,
    options: [0, 1, 2, 3].map(n => ({ id: String(n), label: `Discard ${n}` })),
  });
  break;
}
// Forcefield: "{1}: The next time an unblocked creature of your choice would
// deal combat damage to you this turn, prevent all but 1 of that damage."
case "forcefieldShield": {
  const isUnblocked = tgtC && tgtC.attacking && getEffectiveBlockers(ns, tgtC.iid).length === 0;
  if (isUnblocked) {
    ns = { ...ns, [caster]: { ...ns[caster], combatDamageShield: { sourceIid: tgtC.iid, allowThrough: 1, cardName: card.name } } };
    ns = dlog(ns, `${card.name}: shields against ${tgtC.name} (all but 1 damage prevented).`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target is not an unblocked attacker.`, "effect");
  }
  break;
}
// Circle of Protection (all six) / Greater Realm of Preservation (activated
// ability, {1}/{2}/{1}{W} per card) and Eye for an Eye (cast trigger, no
// activation): "The next time a [color/type] source of your choice would deal
// damage to you this turn, prevent that damage [or redirect it, for Eye for an
// Eye]." Opens a TutorModal-style picker over every matching permanent plus
// every matching spell on the stack; RESOLVE_DAMAGE_SHIELD_CHOICE records the
// specific chosen iid in turnState.damageShields, checked by exact-identity
// match in hurt() (see docs/SYSTEMS.md -- Damage Shields). `card` here is
// either the CoP/Greater Realm permanent itself (activated ability) or Eye for
// an Eye (still resolving as an Instant, before it moves to the graveyard) --
// card.iid is stable across both and becomes shieldSourceIid.
case "chooseDamageShieldSource": {
  ns = resolveDamageShieldChoice(ns, card, caster, null);
  break;
}
// Jade Monolith: "{1}: The next time a source of your choice would deal
// damage to target creature this turn, that source deals that damage to you
// instead." Same picker machinery as chooseDamageShieldSource (pool-building,
// AI-vs-human branching), but the resulting shield lands on the TARGET
// creature in turnState.creatureDamageShields, not on the caster in
// turnState.damageShields, and always redirects to the caster regardless of
// which source is chosen. Click-routing already restricts this ability's
// target to a creature (see isCreatureOnlyTarget in useDuelController.ts);
// the isCre(tgtC) check below is defense-in-depth, not the primary enforcement.
case "chooseDamageShieldSourceForTarget": {
  if (!tgtC || !isCre(tgtC)) {
    ns = dlog(ns, `${card.name} fizzles -- no legal creature target.`, "effect");
    break;
  }
  ns = resolveDamageShieldChoice(ns, card, caster, tgtC);
  break;
}
// Personal Incarnation: "{0}: The next 1 damage that would be dealt to this
// creature this turn is dealt to its owner instead." Self-only, no target.
// Freely repeatable in the same window -- no per-activation limiter exists in
// this engine (see docs/SYSTEMS.md), so each activation pushes one more
// one-point shield onto the stack for this turn.
case "addCreatureDamageShieldSelf": {
  const entry = { mode: 'redirectPoint', redirectToPlayer: card.controller, shieldSourceIid: card.iid, shieldSourceName: card.name };
  ns = { ...ns, turnState: { ...ns.turnState, creatureDamageShields: { ...ns.turnState.creatureDamageShields, [card.iid]: [...(ns.turnState.creatureDamageShields?.[card.iid] || []), entry] } } };
  ns = dlog(ns, `${card.name}: the next 1 damage to it this turn is redirected to its owner.`, "effect");
  break;
}
// --- END BATCH: COMPLEX-TIER C1 ----------------------------------------------
// --- BEGIN BATCH: COMPLEX-TIER C2 (keyword-line cards) -----------------------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
// Phyrexian Gremlins: "{T}: Tap target artifact. It doesn't untap during its
// controller's untap step for as long as this creature remains tapped."
// The "you may choose not to untap" clause is handled by optionalUntapAlways
// (set on the card in cards.js) via the UNTAP-phase optionalUntap machinery.
case "lockArtifactWhileTapped": {
  if (tgtC && isArt(tgtC)) {
    ns = tapPermanent(ns, tgtC.controller, tgtC.iid);
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, lockedByIid: card.iid } : c
    ) } };
    ns = dlog(ns, `${card.name} taps and locks ${tgtC.name}.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid artifact target.`, "effect");
  }
  break;
}
// Tawnos's Coffin: "{3}, {T}: Exile target creature and all Auras attached
// to it. Note the number and kind of counters that were on that creature."
// zMove unconditionally strips counters and cascades embedded Auras to their
// controller's graveyard whenever a permanent leaves the battlefield (S10) --
// neither of which this card wants -- so the snapshot happens BEFORE zMove is
// called, onto Tawnos's Coffin itself. The return (leaves-bf trigger, or
// becomes-untapped via the two insertion points in the UNTAP phase block) is
// handled by the shared tawnosCoffinReturn() helper. See
// docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return.
case "tawnosCoffinExile": {
  if (!tgtC || !isCre(tgtC)) {
    ns = dlog(ns, `${card.name} fizzles -- no valid creature target.`, "effect");
    break;
  }
  const { state: nsExiled, tracking } = snapshotAndExileCreature(ns, tgtC);
  ns = nsExiled;
  const srcOwner = ns.p.bf.some(c => c.iid === card.iid) ? 'p' : 'o';
  ns = { ...ns, [srcOwner]: { ...ns[srcOwner], bf: ns[srcOwner].bf.map(c => c.iid === card.iid
    ? { ...c, ...tracking }
    : c) } };
  ns = dlog(ns, `${card.name} exiles ${tgtC.name}${tracking.exiledAuraRecords.length ? " and its Auras" : ""}.`, "effect");
  break;
}
// Oubliette: "When this enchantment enters, target creature phases out until
// this enchantment leaves the battlefield. Tap that creature as it phases in
// this way." One-shot phasing built on the Tawnos's Coffin snapshot/exile/
// return machinery: the phase-out leg suppresses ON_PERMANENT_LEAVES_BF
// (phasing fires no leave triggers, CR 702.26), and the phase-in leg
// ('oubliettePhaseIn' below) returns the creature tapped WITHOUT summoning
// sickness. Oubliette places itself on the battlefield here carrying the
// tracking fields (RESOLVE_STACK's alreadyOnBf guard then skips the normal
// ETB push) -- the effect resolves before that push, so the fields must ride
// in on the object placed here. The fizzle branch does NOT place Oubliette:
// the normal ETB push handles it, like any other fizzled targeted permanent.
// See docs/ENGINE_CONTRACT_SPEC.md -- One-Shot Phasing (Oubliette).
// Adapted from Card-Forge/forge (o/oubliette.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "oubliettePhaseOut": {
  if (!tgtC || !isCre(tgtC)) {
    ns = dlog(ns, `${card.name} fizzles -- no valid creature target.`, "effect");
    break;
  }
  const { state: nsPhased, tracking } = snapshotAndExileCreature(ns, tgtC, { suppressLeaveEvent: true });
  const newPerm = {
    ...card, controller: caster, enterTs: nsPhased.layerClock ?? 0,
    tapped: false, summoningSick: false, attacking: false, blocking: null,
    damage: 0, counters: {}, eotBuffs: [], enchantments: [],
    ...tracking,
  };
  ns = { ...nsPhased, [caster]: { ...nsPhased[caster], bf: [...nsPhased[caster].bf, newPerm] } };
  ns = dlog(ns, `${card.name}: ${tgtC.name} phases out${tracking.exiledAuraRecords.length ? " with its Auras" : ""}.`, "effect");
  break;
}
// Wall of Wonder: "gets +4/-4 until end of turn and can attack this turn as
// though it didn't have defender."
case "wallOfWonderPump": {
  ns = { ...ns, [caster]: { ...ns[caster], bf: ns[caster].bf.map(c =>
    c.iid === card.iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 4, toughness: -4 }], canAttackDespiteDefender: true } : c
  ) } };
  ns = dlog(ns, `${card.name} gets +4/-4 and can attack this turn.`, "effect");
  break;
}
// --- END BATCH: COMPLEX-TIER C2 ----------------------------------------------
// --- BEGIN BATCH: COMPLEX-TIER C3 (static/continuous) ------------------------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
// Phantasmal Terrain: "Enchant land. As this Aura enters, choose a basic land
// type. Enchanted land is the chosen type." Attach first (empty mod), then
// present the basic-land-type choice; RESOLVE_CHOICE fills in mod.layerDef.
case "phantasmalTerrainEnchant": {
  if (tgtC && isLand(tgtC)) {
    const auraRecord = { iid: card.iid, name: card.name, mod: {}, controller: caster, cardData: { ...card } };
    ns = { ...ns, [tgtC.controller]: { ...ns[tgtC.controller], bf: ns[tgtC.controller].bf.map(c =>
      c.iid === tgtC.iid ? { ...c, enchantments: [...(c.enchantments || []), auraRecord] } : c
    ) } };
    ns = dlog(ns, `${card.name} enchants ${tgtC.name}.`, "effect");
    ns = createPendingChoice(ns, {
      sourceCardId: card.iid,
      controller: caster,
      kind: 'basicLandTypeChoice',
      targetIid: tgtC.iid,
      options: [
        { id: 'Plains', label: 'Plains' },
        { id: 'Island', label: 'Island' },
        { id: 'Swamp', label: 'Swamp' },
        { id: 'Mountain', label: 'Mountain' },
        { id: 'Forest', label: 'Forest' },
      ],
    });
  } else {
    ns = dlog(ns, `${card.name} fizzles -- no valid land target.`, "effect");
  }
  break;
}
// --- END BATCH: COMPLEX-TIER C3 ----------------------------------------------
// --- BEGIN BATCH: COMPLEX-TIER C4 (triggered abilities) ----------------------
// Adapted from Card-Forge/forge, GPL-3.0. See THIRD_PARTY_NOTICES.md.
// Mold Demon: "When this creature enters, sacrifice it unless you sacrifice
// two Swamps." Places the permanent on the battlefield itself (mirroring the
// RESOLVE_STACK ETB-push guard) so the sacrifice condition can be checked
// immediately after entry, then removes it again if the condition fails.
case "moldDemonETB": {
  const pArr = { ...card, controller: caster, tapped: false, summoningSick: !hasKw(card, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, counters: {} };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
  const swamps = ns[caster].bf.filter(c => isLand(c) && c.subtype?.includes("Swamp") && c.iid !== pArr.iid);
  if (swamps.length >= 2) {
    for (const sw of swamps.slice(0, 2)) ns = zMove(ns, sw.iid, caster, caster, "gy");
    ns = dlog(ns, `${card.name}: sacrifices two Swamps to remain on the battlefield.`, "effect");
  } else {
    ns = zMove(ns, pArr.iid, caster, caster, "gy");
    ns = { ...ns, skipEtbPush: true };
    ns = dlog(ns, `${card.name}: sacrificed (not enough Swamps to sacrifice).`, "death");
  }
  break;
}
// Time Elemental: "Return target permanent that isn't enchanted to its owner's hand."
case "bounceUnenchanted": {
  if (tgtC && !tgtC.enchantments?.length) {
    ns = zMove(ns, tgtC.iid, tgtC.controller, tgtC.controller, "hand");
    ns = dlog(ns, `${card.name} returns ${tgtC.name}.`, "effect");
  } else {
    ns = dlog(ns, `${card.name} fizzles -- target is enchanted or no longer exists.`, "effect");
  }
  break;
}
// Shapeshifter: "As this creature enters, choose a number between 0 and 7."
// Places itself on the battlefield (mirroring Mold Demon's ETB pattern above)
// then queues the choice; power/toughness read the result via CDA.
case "shapeshifterETB": {
  const pArr = { ...card, controller: caster, tapped: false, summoningSick: !hasKw(card, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, counters: {}, chosenNumber: 0 };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
  ns = { ...ns, skipEtbPush: true };
  ns = createPendingChoice(ns, {
    sourceCardId: pArr.iid,
    controller: caster,
    kind: 'numberChoice',
    handlerKey: 'shapeshifterChoose',
    iid: pArr.iid,
    options: [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ id: String(n), label: String(n) })),
  });
  break;
}
// Jihad: "As this enchantment enters, choose a color and an opponent."
case "jihadETB": {
  const pArr = { ...card, controller: caster, tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {} };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
  ns = { ...ns, skipEtbPush: true };
  ns = createPendingChoice(ns, {
    sourceCardId: pArr.iid,
    controller: caster,
    kind: 'jihadColorChoice',
    options: [
      { id: 'W', label: 'White' },
      { id: 'U', label: 'Blue' },
      { id: 'B', label: 'Black' },
      { id: 'R', label: 'Red' },
      { id: 'G', label: 'Green' },
    ],
  });
  break;
}
// Psychic Allergy: "As this enchantment enters, choose a color." Reuses the
// jihadColorChoice pendingChoice kind (sets chosenColor on this card, plus
// an unused chosenPlayer field) rather than a new one-off kind -- Jihad's
// kind is already generic enough ("set chosenColor on the source card") to
// cover this without any new plumbing. The AI falls through to
// useDuelController.ts's generic pendingChoice options[0] fallback (same as
// Jihad already does), so it always picks White.
case "psychicAllergyETB": {
  const pArr = { ...card, controller: caster, tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {} };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr] } };
  ns = { ...ns, skipEtbPush: true };
  ns = createPendingChoice(ns, {
    sourceCardId: pArr.iid,
    controller: caster,
    kind: 'jihadColorChoice',
    options: [
      { id: 'W', label: 'White' },
      { id: 'U', label: 'Blue' },
      { id: 'B', label: 'Black' },
      { id: 'R', label: 'Red' },
      { id: 'G', label: 'Green' },
    ],
  });
  break;
}
// Lich: "As this enchantment enters, you lose life equal to your life
// total." Sets lichActive on the controller, read by hurt()'s overrides.
case "lichETB": {
  const pArr = { ...card, controller: caster, tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {} };
  ns = { ...ns, [caster]: { ...ns[caster], bf: [...ns[caster].bf, pArr], lichActive: true } };
  ns = { ...ns, skipEtbPush: true };
  ns = hurt(ns, caster, ns[caster].life, card.name, { isLifeLoss: true, sourceIid: card.iid, sourceType: inferSourceType(card) });
  break;
}
// Goblin Artisans: "{T}: Flip a coin. If you win the flip, draw a card. If
// you lose the flip, counter target artifact spell you control..."
// SIMPLIFICATION: the "...that isn't the target of an ability from another
// creature named Goblin Artisans" clause is not enforced (multi-copy edge
// case). Adapted from Card-Forge/forge (g/goblin_artisans.txt), GPL-3.0. See
// THIRD_PARTY_NOTICES.md.
case "coinFlipDrawOrCounterArtifact": {
  // OBSERVED (out of scope for this prompt): Math.random() here follows the
  // same already-flagged coin-flip idiom used elsewhere (Mana Clash, Ydwen
  // Efreet) pending a seeded-RNG migration.
  const won = Math.random() < 0.5;
  if (won) {
    ns = drawD(ns, caster);
    ns = dlog(ns, `${card.name}: wins the flip -- draws a card.`, "effect");
  } else {
    const stackItem = ns.stack.find(i => i.id === tgt && i.caster === caster && isArt(i.card));
    if (stackItem) {
      ns = { ...ns, stack: ns.stack.filter(i => i.id !== tgt) };
      ns = dlog(ns, `${card.name}: loses the flip -- counters ${stackItem.card.name}.`, "effect");
    } else {
      ns = dlog(ns, `${card.name}: loses the flip -- no valid artifact spell to counter.`, "effect");
    }
  }
  break;
}
// --- END BATCH: COMPLEX-TIER C4 ----------------------------------------------
default:      ns = dlog(ns, `${card.name} resolves.`, "effect");
}
return ns;
}

// --- BANDING (CR 702.22) -----------------------------------------------------
// Band membership is looked up live against s.attackers/bandId rather than
// cached at declaration time, so CR 702.22f ("a creature removed from combat
// is also removed from its band") and 702.22e ("a band lasts the rest of
// combat even if banding is later removed from a member") both fall out for
// free -- membership only depends on (a) still being in s.attackers and
// (b) still carrying the bandId assigned at FORM_BAND time, never on still
// having the banding keyword.
// SIMPLIFICATION: the "bands with other [quality]" variant (702.22b/c) is not
// modeled -- no card in this project's pool uses it. Banding also does not
// let a band satisfy a blocker's "must block a specific creature" restriction
// -- out of scope for this phase. See docs/SYSTEMS.md Banding section.

// getBandMemberIds: all currently-attacking iids sharing attId's bandId (or
// just [attId] if it isn't banded). Dead/removed members drop out naturally
// because getBF returns null for them and null?.bandId never matches.
function getBandMemberIds(ns, attId) {
  const att = getBF(ns, attId);
  if (!att?.bandId) return [attId];
  return ns.attackers.filter(id => getBF(ns, id)?.bandId === att.bandId);
}

// getBlockerRecipients: every attacker iid that `bl` is currently blocking --
// its own explicit single-value block assignment (extended to that
// attacker's whole band, CR 702.22h/i), UNION, for a Blaze of Glory-flagged
// creature, every OTHER attacker canBlockDuel says it could legally block
// ("if able" -- computed live so a mid-combat legality change, e.g. a
// Twiddle tapping bl, is picked up for free, same as banding's live
// recompute). The `explicit` set already covers band-membership fully, so a
// BoG creature that's ALSO an explicit blocker of a banded attacker doesn't
// get double-counted for that one attacker -- it's excluded from the BoG
// half by the `explicit.includes(attId)` check.
function getBlockerRecipients(ns, bl) {
  const explicit = getBandMemberIds(ns, bl.blocking).filter(id => ns.attackers.includes(id));
  if (!bl.blocksAllAttackers) return explicit;
  const bogExtra = ns.attackers.filter(attId => {
    if (explicit.includes(attId)) return false;
    const att = getBF(ns, attId);
    return att && canBlockDuel(bl, att, ns[bl.controller].bf, ns);
  });
  return [...explicit, ...bogExtra];
}

// getEffectiveBlockers (CR 702.22h/i, plus Blaze of Glory): every creature
// that getBlockerRecipients says is blocking attId. Recomputing this live on
// every call (rather than caching at block-declaration time) is what makes
// it cover 702.22i ("becomes blocked due to an effect") and Blaze of Glory's
// live legality re-check for free.
export function getEffectiveBlockers(ns, attId) {
  return [...ns.p.bf, ...ns.o.bf].filter(c => getBlockerRecipients(ns, c).includes(attId));
}

// Small helper: all permutations of a short array. Band/blocker-side recipient
// counts in this card pool are tiny (2-3), so a plain permutation list is
// simpler and safer than a generic reorder-UI widget.
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

// Resolves a stored damage-assignment order against the CURRENT recipient
// set, preserving as much of the stored relative order as survived (a
// recipient can only have left the set by dying between the first-strike and
// regular damage passes -- see the resolveCombat gating comment below).
function resolveStoredOrder(storedOrder, recipients) {
  if (!storedOrder) return recipients;
  const filtered = storedOrder.filter(id => recipients.includes(id));
  return filtered.length === recipients.length ? filtered : recipients;
}

// CR 702.22j: if any of attId's blockers has banding, the DEFENDING player
// (not the attacker's controller) chooses how attId's damage is divided
// among them. Only meaningful with 2+ blockers -- a single blocker has
// nothing to divide between.
function bandAttackerChoiceKey(attId) { return `att_${attId}`; }
// CR 702.22k: if a blocker is blocking 2+ band members (via 702.22h
// propagation), the ACTIVE player chooses how the blocker's damage is
// divided among them.
function bandBlockerChoiceKey(blId) { return `blk_${blId}`; }

// getNextBandingChoice: scans current combat for the first still-unanswered
// 702.22j/k choice, or null if none remain. "Unanswered" = no entry yet in
// ns.turnState.combatDamageOrders under that interaction's key. Called once
// before the first-strike pass and again before the regular pass (deaths
// during first strike can only shrink a recipient set, never introduce a
// pairing that wasn't already a candidate, so no third check is needed).
function getNextBandingChoice(ns) {
  const answered = ns.turnState?.combatDamageOrders || {};
  for (const attId of ns.attackers) {
    const att = getBF(ns, attId);
    if (!att || !isCre(att)) continue;
    const blockers = getEffectiveBlockers(ns, attId);
    const key = bandAttackerChoiceKey(attId);
    if (blockers.length >= 2 && blockers.some(b => hasKw(b, KEYWORDS.BANDING.id, ns)) && !answered[key]) {
      const defW = att.controller === 'p' ? 'o' : 'p';
      return {
        sourceCardId: attId,
        controller: defW,
        kind: 'bandAttackerDamageOrder',
        key,
        options: permutations(blockers.map(b => b.iid)).map((order, i) => ({
          id: `order_${i}`,
          order,
          label: order.map(id => getBF(ns, id)?.name || id).join(' -> '),
        })),
      };
    }
  }
  const seenBlockers = new Set();
  for (const w of ['p', 'o']) {
    for (const bl of ns[w].bf) {
      if (!bl.blocking || seenBlockers.has(bl.iid)) continue;
      seenBlockers.add(bl.iid);
      const recipients = getBandMemberIds(ns, bl.blocking).filter(id => ns.attackers.includes(id));
      const key = bandBlockerChoiceKey(bl.iid);
      if (recipients.length >= 2 && !answered[key]) {
        return {
          sourceCardId: bl.iid,
          controller: ns.active,
          kind: 'bandBlockerDamageOrder',
          key,
          options: permutations(recipients).map((order, i) => ({
            id: `order_${i}`,
            order,
            label: order.map(id => getBF(ns, id)?.name || id).join(' -> '),
          })),
        };
      }
    }
  }
  // Blaze of Glory (general combat rule, NOT banding): if a creature with
  // "can block any number of creatures" is blocking 2+ attackers purely via
  // that grant (not via band membership -- that case is fully handled by
  // the loop above, and correctly keeps controller=ns.active per CR
  // 702.22k), its OWN controller chooses the damage assignment order. This
  // is the ordinary, non-banding rule (CR 509.2's blocker-side mirror): the
  // blocking creature's controller orders a blocker that's blocking
  // multiple attackers, full stop. Reuses bandBlockerChoiceKey's storage
  // slot -- computeBandBlockerShares reads from that key regardless of
  // which loop produced the answer, and the two loops' trigger conditions
  // are mutually exclusive (explicit band-recipients >=2 above vs <2 here),
  // so there is no slot collision. Uses its own seen-set: a creature can
  // have `.blocking` set (added to the set above) AND be blocksAllAttackers
  // -- that combination must still reach this loop.
  const seenBogBlockers = new Set();
  for (const w of ['p', 'o']) {
    for (const bl of ns[w].bf) {
      if (!bl.blocksAllAttackers || seenBogBlockers.has(bl.iid)) continue;
      seenBogBlockers.add(bl.iid);
      const recipients = getBlockerRecipients(ns, bl);
      const key = bandBlockerChoiceKey(bl.iid);
      if (recipients.length >= 2 && !answered[key]) {
        return {
          sourceCardId: bl.iid,
          controller: w,
          kind: 'blazeOfGloryDamageOrder',
          key,
          options: permutations(recipients).map((order, i) => ({
            id: `order_${i}`,
            order,
            label: order.map(id => getBF(ns, id)?.name || id).join(' -> '),
          })),
        };
      }
    }
  }
  return null;
}

// computeBandBlockerShares: for every blocker effectively blocking 2+ band
// members, precompute how much of its power each member receives (CR
// 702.22k), using the same lethal-then-remainder assignment order already
// used elsewhere in this file for an attacker dividing damage among multiple
// blockers. Computed once per pass, off the pass's pre-damage snapshot, so
// re-deriving it per attId iteration can't see partially-applied damage from
// a sibling band member processed earlier in the same pass. Blockers with a
// single recipient are skipped entirely -- callers fall back to dealing full
// power, identical to pre-banding behavior.
function computeBandBlockerShares(ns) {
  const shareMap = {};
  const answered = ns.turnState?.combatDamageOrders || {};
  const seenBlockers = new Set();
  for (const w of ['p', 'o']) {
    for (const bl of ns[w].bf) {
      // Blaze of Glory blockers may have no explicit .blocking value at all
      // (the extra recipients are read-time synthesis, not a stored
      // assignment) -- widened from `!bl.blocking` alone so those blockers
      // aren't skipped before getBlockerRecipients ever runs.
      if ((!bl.blocking && !bl.blocksAllAttackers) || seenBlockers.has(bl.iid)) continue;
      seenBlockers.add(bl.iid);
      const recipients = getBlockerRecipients(ns, bl);
      if (recipients.length <= 1) continue;
      const order = resolveStoredOrder(answered[bandBlockerChoiceKey(bl.iid)], recipients);
      const bp = getPow(bl, ns);
      let rem = bp;
      for (const rid of order) {
        const rCard = getBF(ns, rid);
        const lethal = Math.max(0, getTou(rCard, ns) - (rCard?.damage || 0));
        const share = Math.min(rem, lethal);
        shareMap[`${bl.iid}|${rid}`] = share;
        rem = Math.max(0, rem - share);
      }
    }
  }
  return shareMap;
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

// Pause for an unanswered CR 702.22j/k damage-division choice before doing any
// damage math. Re-entrant: RESOLVE_CHOICE stores the answer and calls
// resolveCombat again, so this runs once per still-unanswered choice.
const bandingChoice = getNextBandingChoice(ns);
if (bandingChoice) return createPendingChoice(ns, bandingChoice);

// Only announce the first-strike step if someone in this combat actually has
// first strike -- the pass below is already a correctly-gated no-op otherwise,
// but logging "First strike damage." unconditionally read as a bug report
// (see: Goblin King mountainwalk block investigation, no first-strike
// creatures involved at all).
const anyFirstStrike = ns.attackers.some(attId => {
  const att = getBF(ns, attId);
  if (att && hasKw(att, KEYWORDS.FIRST_STRIKE.id)) return true;
  return getEffectiveBlockers(ns, attId).some(bl => hasKw(bl, KEYWORDS.FIRST_STRIKE.id));
});
if (anyFirstStrike) ns = dlog(ns, "First strike damage.", "combat");

const isGaseous = c => c.enchantments?.some(e => e.mod?.gaseousForm);
// Spirit Link: returns 1 when host has a Spirit Link aura (caller multiplies by damage dealt).
const spiritLinkGain = (c) => (c.enchantments ?? []).some(e => e.mod?.spiritLink) ? 1 : 0;
const fsBlockerShares = computeBandBlockerShares(ns);

// First-strike pass: only combatants with FIRST_STRIKE deal their damage here.
for (const attId of ns.attackers) {
const att = getBF(ns, attId);
// A permanent that stopped being a creature (e.g. an animated land reverting
// mid-combat when its animating enchantment left) can't deal or receive combat
// damage. See docs/SYSTEMS.md S18.9.
if (!att || !isCre(att)) continue;
const ap = getPow(att, ns);
const actrl = att.controller;
const defW = actrl === "p" ? "o" : "p";
const hasLifelink = hasKw(att, KEYWORDS.LIFELINK.id) || (ns.castleMod?.name === "Death's Embrace" && actrl === "o");
const rawBlockers = getEffectiveBlockers(ns, attId);
const attOrder = resolveStoredOrder((ns.turnState?.combatDamageOrders || {})[bandAttackerChoiceKey(attId)], rawBlockers.map(b => b.iid));
const blockers = attOrder.map(id => rawBlockers.find(b => b.iid === id));
const attGaseous = isGaseous(att);
const attFS = hasKw(att, KEYWORDS.FIRST_STRIKE.id);

if (!blockers.length) {
  if (!attGaseous && !att.preventCombatDamageDealt && attFS) {
    ns = hurt(ns, defW, ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true, unblocked: true });
    if (ap > 0) ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: att.iid, targetId: defW, amount: ap, combat: true } });
    if (hasLifelink) ns = hurt(ns, actrl, -ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (ap > 0 && spiritLinkGain(att)) ns = hurt(ns, actrl, -ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    // Merchant Ship: "Whenever this creature attacks and isn't blocked, you gain 2 life."
    // Adapted from Card-Forge/forge (m/merchant_ship.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    if (att.unblockedAttackGainLife) ns = hurt(ns, actrl, -att.unblockedAttackGainLife, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
  }
} else {
  let rem = ap;
  const PROT_CMAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
  for (const bl of blockers) {
    const blGaseous = isGaseous(bl);
    const bp = getPow(bl, ns);
    // CR 702.22k: if bl is blocking 2+ band members (via 702.22h propagation),
    // its power is divided among them instead of dealt in full to each --
    // fsBlockerShares is empty/absent for an ordinary single-recipient block,
    // so bpForAtt === bp there and nothing about non-banding combat changes.
    const bandRecipients = getBlockerRecipients(ns, bl);
    const bpForAtt = bandRecipients.length > 1 ? (fsBlockerShares[`${bl.iid}|${attId}`] ?? 0) : bp;
    const bt = getTou(bl, ns);
    const dbl = Math.min(rem, bt - bl.damage);
    const blFS = hasKw(bl, KEYWORDS.FIRST_STRIKE.id);

    // S17.6.3: protection enforced inline, no trigger queue
    const blProt = Array.isArray(bl.protection) ? bl.protection : (bl.protection ? [bl.protection] : []);
    const attProt = Array.isArray(att.protection) ? att.protection : (att.protection ? [att.protection] : []);
    // Artifact leg reads through computeCharacteristics (not the raw arrays above)
    // so Aura-granted protection (Artifact Ward) is caught here too -- raw
    // card.protection never carries an Aura's mod.protection.
    const blockerProtectsFromAtt = blProt.some(q => (PROT_CMAP[q] || q) === (att.color || ''))
      || (isArt(att) && computeCharacteristics(bl, ns).protection.includes('artifact'));
    const attackerProtectsFromBl = attProt.some(q => (PROT_CMAP[q] || q) === (bl.color || ''))
      || (isArt(bl) && computeCharacteristics(att, ns).protection.includes('artifact'));

    // Gaseous Form: attacker is gaseous -> blocker deals 0 to it; blocker is gaseous -> attacker deals 0 to it
    // Sewers of Estark: bl.preventCombatDamageDealt / att.preventCombatDamageDealt stop that
    // specific creature from dealing (source-side), independent of the gaseous receiver checks.
    if (!attackerProtectsFromBl && !attGaseous && !bl.preventCombatDamageDealt && blFS) {
      let bpForAttRemaining;
      ({ state: ns, remainingAmt: bpForAttRemaining } = consumeCreatureDamageShields(ns, attId, bpForAtt, { sourceIid: bl.iid, sourceType: 'creature', combat: true }));
      ns = { ...ns, [actrl]: { ...ns[actrl], bf: ns[actrl].bf.map(c => c.iid === attId ? { ...c, ...dmgWithShield(c, bpForAttRemaining) } : c) } };
      if (bpForAtt > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: bl.iid, targetId: attId, amount: bpForAtt, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: bl.iid, targetId: attId, amount: bpForAtt, combat: true } });
        if (bl.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), attId] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && attFS) {
      let dblRemaining;
      ({ state: ns, remainingAmt: dblRemaining } = consumeCreatureDamageShields(ns, bl.iid, dbl, { sourceIid: attId, sourceType: 'creature', combat: true }));
      ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, ...dmgWithShield(c, dblRemaining) } : c) } };
      if (dbl > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: attId, targetId: bl.iid, amount: dbl, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: attId, targetId: bl.iid, amount: dbl, combat: true } });
        if (att.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), bl.iid] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && attFS) rem = Math.max(0, rem - dbl);
    if (hasLifelink && !blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && attFS) ns = hurt(ns, actrl, -dbl, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && dbl > 0 && spiritLinkGain(att) && attFS) ns = hurt(ns, actrl, -dbl, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (!attackerProtectsFromBl && !attGaseous && !bl.preventCombatDamageDealt && bpForAtt > 0 && spiritLinkGain(bl) && blFS) ns = hurt(ns, bl.controller, -bpForAtt, bl.name, { sourceIid: bl.iid, sourceType: 'creature', combat: true });
    if (hasKw(att, KEYWORDS.DEATHTOUCH.id) && ns.ruleset.deathtouch && !blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && attFS) ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: Math.max(c.toughness, c.damage+1) } : c) } };
  }
  if (hasKw(att, KEYWORDS.TRAMPLE.id) && rem > 0 && !attGaseous && !att.preventCombatDamageDealt && attFS) ns = hurt(ns, defW, rem, `${att.name} (trample)`, { sourceIid: att.iid, sourceType: 'creature', combat: true, unblocked: false });
}

}

// State-based actions between first-strike and regular damage passes.
ns = checkDeath(ns);

// Regular damage pass: combatants without FIRST_STRIKE deal their damage here.
ns = dlog(ns, "Combat damage resolving.", "combat");
const regBlockerShares = computeBandBlockerShares(ns);

for (const attId of ns.attackers) {
const att = getBF(ns, attId);
// A permanent that stopped being a creature (e.g. an animated land reverting
// mid-combat when its animating enchantment left) can't deal or receive combat
// damage. See docs/SYSTEMS.md S18.9.
if (!att || !isCre(att)) continue;
const ap = getPow(att, ns);
const actrl = att.controller;
const defW = actrl === "p" ? "o" : "p";
const hasLifelink = hasKw(att, KEYWORDS.LIFELINK.id) || (ns.castleMod?.name === "Death's Embrace" && actrl === "o");
const rawBlockers2 = getEffectiveBlockers(ns, attId);
const attOrder2 = resolveStoredOrder((ns.turnState?.combatDamageOrders || {})[bandAttackerChoiceKey(attId)], rawBlockers2.map(b => b.iid));
const blockers = attOrder2.map(id => rawBlockers2.find(b => b.iid === id));
const attGaseous = isGaseous(att);
const attFS = hasKw(att, KEYWORDS.FIRST_STRIKE.id);

if (!blockers.length) {
  if (!attGaseous && !att.preventCombatDamageDealt && !attFS) {
    ns = hurt(ns, defW, ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true, unblocked: true });
    if (ap > 0) ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: att.iid, targetId: defW, amount: ap, combat: true } });
    if (hasLifelink) ns = hurt(ns, actrl, -ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (ap > 0 && spiritLinkGain(att)) ns = hurt(ns, actrl, -ap, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    // Merchant Ship: "Whenever this creature attacks and isn't blocked, you gain 2 life."
    // Adapted from Card-Forge/forge (m/merchant_ship.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    if (att.unblockedAttackGainLife) ns = hurt(ns, actrl, -att.unblockedAttackGainLife, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
  }
} else {
  let rem = ap;
  const PROT_CMAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
  for (const bl of blockers) {
    const blGaseous = isGaseous(bl);
    const bp = getPow(bl, ns);
    const bandRecipients = getBlockerRecipients(ns, bl);
    const bpForAtt = bandRecipients.length > 1 ? (regBlockerShares[`${bl.iid}|${attId}`] ?? 0) : bp;
    const bt = getTou(bl, ns);
    const dbl = Math.min(rem, bt - bl.damage);
    const blFS = hasKw(bl, KEYWORDS.FIRST_STRIKE.id);

    // S17.6.3: protection enforced inline, no trigger queue
    const blProt = Array.isArray(bl.protection) ? bl.protection : (bl.protection ? [bl.protection] : []);
    const attProt = Array.isArray(att.protection) ? att.protection : (att.protection ? [att.protection] : []);
    // Artifact leg reads through computeCharacteristics (not the raw arrays above)
    // so Aura-granted protection (Artifact Ward) is caught here too -- raw
    // card.protection never carries an Aura's mod.protection.
    const blockerProtectsFromAtt = blProt.some(q => (PROT_CMAP[q] || q) === (att.color || ''))
      || (isArt(att) && computeCharacteristics(bl, ns).protection.includes('artifact'));
    const attackerProtectsFromBl = attProt.some(q => (PROT_CMAP[q] || q) === (bl.color || ''))
      || (isArt(bl) && computeCharacteristics(att, ns).protection.includes('artifact'));

    // Gaseous Form: attacker is gaseous -> blocker deals 0 to it; blocker is gaseous -> attacker deals 0 to it
    // Sewers of Estark: bl.preventCombatDamageDealt / att.preventCombatDamageDealt stop that
    // specific creature from dealing (source-side), independent of the gaseous receiver checks.
    if (!attackerProtectsFromBl && !attGaseous && !bl.preventCombatDamageDealt && !blFS) {
      let bpForAttRemaining;
      ({ state: ns, remainingAmt: bpForAttRemaining } = consumeCreatureDamageShields(ns, attId, bpForAtt, { sourceIid: bl.iid, sourceType: 'creature', combat: true }));
      ns = { ...ns, [actrl]: { ...ns[actrl], bf: ns[actrl].bf.map(c => c.iid === attId ? { ...c, ...dmgWithShield(c, bpForAttRemaining) } : c) } };
      if (bpForAtt > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: bl.iid, targetId: attId, amount: bpForAtt, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: bl.iid, targetId: attId, amount: bpForAtt, combat: true } });
        if (bl.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), attId] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && !attFS) {
      let dblRemaining;
      ({ state: ns, remainingAmt: dblRemaining } = consumeCreatureDamageShields(ns, bl.iid, dbl, { sourceIid: attId, sourceType: 'creature', combat: true }));
      ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, ...dmgWithShield(c, dblRemaining) } : c) } };
      if (dbl > 0) {
        ns = { ...ns, turnState: { ...ns.turnState, damageLog: [...ns.turnState.damageLog, { sourceId: attId, targetId: bl.iid, amount: dbl, turnId: ns.turn }] } };
        ns = emitEvent(ns, { type: 'ON_DAMAGE_DEALT', payload: { sourceId: attId, targetId: bl.iid, amount: dbl, combat: true } });
        if (att.name === "Sengir Vampire") {
          ns = { ...ns, turnState: { ...ns.turnState, sengirDamagedIids: [...(ns.turnState.sengirDamagedIids || []), bl.iid] } };
        }
      }
    }
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && !attFS) rem = Math.max(0, rem - dbl);
    if (hasLifelink && !blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && !attFS) ns = hurt(ns, actrl, -dbl, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (!blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && dbl > 0 && spiritLinkGain(att) && !attFS) ns = hurt(ns, actrl, -dbl, att.name, { sourceIid: att.iid, sourceType: 'creature', combat: true });
    if (!attackerProtectsFromBl && !attGaseous && !bl.preventCombatDamageDealt && bpForAtt > 0 && spiritLinkGain(bl) && !blFS) ns = hurt(ns, bl.controller, -bpForAtt, bl.name, { sourceIid: bl.iid, sourceType: 'creature', combat: true });
    if (hasKw(att, KEYWORDS.DEATHTOUCH.id) && ns.ruleset.deathtouch && !blockerProtectsFromAtt && !blGaseous && !att.preventCombatDamageDealt && !attFS) ns = { ...ns, [defW]: { ...ns[defW], bf: ns[defW].bf.map(c => c.iid === bl.iid ? { ...c, damage: Math.max(c.toughness, c.damage+1) } : c) } };
  }
  if (hasKw(att, KEYWORDS.TRAMPLE.id) && rem > 0 && !attGaseous && !att.preventCombatDamageDealt && !attFS) ns = hurt(ns, defW, rem, `${att.name} (trample)`, { sourceIid: att.iid, sourceType: 'creature', combat: true, unblocked: false });
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
  const isBlocked = getEffectiveBlockers(ns, attId).length > 0;
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

// Runs once combat damage has actually resolved (resolveCombat returned with
// no pendingChoice) -- shared by advPhase's normal COMBAT_DAMAGE transition
// and by RESOLVE_CHOICE, which re-invokes resolveCombat after storing a
// 702.22j/k damage-order answer and must run these same post-steps once no
// further choice is pending.
function finishCombatDamagePostSteps(ns) {
  // ON_DAMAGE_DEALT triggers (El-Hajjaj, "whenever this creature deals damage,
  // you gain that much life") are queued by emitEvent() calls inside
  // resolveCombat() but were never actually processed anywhere -- this is the
  // first card needing that queue drained. Safe to add unconditionally: no
  // pre-existing triggeredAbilities entry keys off ON_DAMAGE_DEALT (Sengir
  // Vampire's counter uses a separate hardcoded ON_CREATURE_DIES path).
  ns = processTriggerQueue(ns);
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

// ON_COMBAT_BEGIN: fires once on the transition into PHASE.COMBAT_BEGIN --
// same unscoped-per-turn-cycle idiom as ON_END_STEP/ON_UPKEEP_START above.
// Battering Ram ("at the beginning of combat on your turn, this creature
// gains banding until end of combat").
if (next === PHASE.COMBAT_BEGIN) {
  ns = emitEvent(ns, { type: 'ON_COMBAT_BEGIN', payload: { activePlayer: ns.active } });
  ns = processTriggerQueue(ns);
}

// ON_ATTACKS_DECLARED: fires once when leaving COMBAT_ATTACKERS with at least one
// attacker committed -- the same boundary the B14 skip logic above uses to count
// declared attackers (s.attackers, pre-transition).
if (s.phase === PHASE.COMBAT_ATTACKERS && s.attackers && s.attackers.length > 0) {
  ns = emitEvent(ns, { type: 'ON_ATTACKS_DECLARED', payload: { attackerIids: [...s.attackers], attackingPlayer: s.active, activePlayer: s.active } });
  ns = processTriggerQueue(ns);
}

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
  // End-of-combat delayed destroy: Abomination/Infernal Medusa/Cockatrice
  // ("destroy that creature at end of combat"), keyed off combat role rather
  // than a specific card -- populated by resolveCombat/DECLARE_BLOCKER when the
  // condition fires. Same idiom as venomTargets above (generalized to a
  // reusable field since three cards in this batch need the identical shape).
  // Adapted from Card-Forge/forge (a/abomination.txt, i/infernal_medusa.txt,
  // c/cockatrice.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const iid of (ns.turnState.endOfCombatDestroy ?? [])) {
    const who = ['p','o'].find(w => ns[w].bf.some(c => c.iid === iid));
    if (who) {
      const c = ns[who].bf.find(x => x.iid === iid);
      ns = zMove(ns, iid, who, who, 'gy');
      ns = dlog(ns, `${c?.name || 'Creature'} destroyed at end of combat.`, 'effect');
    }
  }
  ns = { ...ns, turnState: { ...ns.turnState, endOfCombatDestroy: [] } };
  // scope: 'combat' eotBuffs expire here rather than lingering to CLEANUP's
  // normal until-end-of-turn wipe -- Battering Ram's "gains banding until end
  // of combat" grant is narrower than the standard eotBuff lifetime. Default
  // (unscoped) eotBuffs are untouched and still expire at CLEANUP as before.
  // Adapted from Card-Forge/forge (b/battering_ram.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.eotBuffs?.some(b => b.scope === 'combat')
      ? { ...c, eotBuffs: c.eotBuffs.filter(b => b.scope !== 'combat') }
      : c) } };
  }
  // End-of-combat delayed self-sacrifice: Time Elemental ("at end of combat,
  // sacrifice it and it deals 5 damage to you").
  // Adapted from Card-Forge/forge (t/time_elemental.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const iid of (ns.turnState.endOfCombatSacrifice ?? [])) {
    const who = ['p','o'].find(w => ns[w].bf.some(c => c.iid === iid));
    if (who) {
      const c = ns[who].bf.find(x => x.iid === iid);
      ns = zMove(ns, iid, who, who, 'gy');
      ns = hurt(ns, who, 5, c?.name || 'Time Elemental', c ? { sourceIid: c.iid, sourceType: inferSourceType(c) } : null);
    }
  }
  ns = { ...ns, turnState: { ...ns.turnState, endOfCombatSacrifice: [] } };
  // Raging River: strip the pile assignments and side selections at end of combat.
  for (const w of ['p', 'o']) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
      (c.riverSide || c.riverPile) ? { ...c, riverSide: undefined, riverPile: undefined } : c
    ) } };
  }
  // Reset the latch for the next combat (if it exists).
  ns = { ...ns, turnState: { ...ns.turnState, riverAppliedThisCombat: false } };
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
  // Rukh Egg: "create a 4/4 red Bird creature token with flying at the
  // beginning of the next end step." Rukh Egg itself is already dead by the
  // time this runs, so the pending token is queued state-side (see
  // queueEndStepToken in resolveTriggeredEffect) rather than living on the card.
  // Adapted from Card-Forge/forge (r/rukh_egg.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  for (const pending of (ns.pendingEndStepTokens ?? [])) {
    const tokenDef = TOKEN_DB.find(t => t.tokenId === pending.tokenId);
    ns = createToken(ns, pending.tokenId, pending.count, pending.controller);
    ns = dlog(ns, `Creates ${pending.count}x ${tokenDef?.name ?? 'token'} (delayed trigger).`, 'effect');
  }
  ns = { ...ns, pendingEndStepTokens: [] };
  // ON_END_STEP: unscoped, like ON_UPKEEP_START -- fires once per turn cycle for
  // the turn's active player (this engine has a single END phase per turn, not a
  // separate end step per player). Khabál Ghoul.
  ns = emitEvent(ns, { type: 'ON_END_STEP', payload: { activePlayer: ns.active } });
  ns = processTriggerQueue(ns);
  // Voodoo Doll: "At the beginning of your end step, if this artifact is
  // untapped, destroy this artifact and it deals damage to you equal to the
  // number of pin counters on it."
  for (const c of [...ns[ns.active].bf].filter(x => x.name === "Voodoo Doll" && !x.tapped)) {
    const pin = c.counters?.PIN || 0;
    ns = zMove(ns, c.iid, ns.active, ns.active, "gy");
    ns = dlog(ns, "Voodoo Doll is destroyed (untapped at end step).", "death");
    if (pin > 0) ns = hurt(ns, ns.active, pin, "Voodoo Doll", { sourceIid: c.iid, sourceType: 'artifact' });
  }
}

if (next === PHASE.COMBAT_DAMAGE) {
ns = resolveCombat(ns);
// A CR 702.22j/k damage-division choice is pending (see getNextBandingChoice
// in resolveCombat) -- combat hasn't actually resolved yet. Stay here; once
// RESOLVE_CHOICE answers it, that handler re-invokes resolveCombat and runs
// finishCombatDamagePostSteps itself once combat truly finishes.
if (ns.pendingChoice) return ns;
return finishCombatDamagePostSteps(ns);
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
  turnState: { ...ns.turnState, sengirDamagedIids: [], powerSurgeUntappedCount: 0, attackedThisCombat: [], mustAttackEligible: [], venomTargets: [], combatDamageOrders: {} } };
// Island Sanctuary: protection lasts "until your next turn" -- cleared once
// that player's own turn comes back around.
if (ns[ns.active].islandSanctuaryProtected) {
  ns = { ...ns, [ns.active]: { ...ns[ns.active], islandSanctuaryProtected: false } };
}
// Time Vault: "If you would begin your turn while this artifact is tapped,
// you may skip that turn instead. If you do, untap this artifact."
// SIMPLIFICATION: always skips when tapped -- no "decline" UI exists (same
// convention as other such "may" replacement effects elsewhere in this file).
// Adapted from Card-Forge/forge (t/time_vault.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
{
  const tappedVault = ns[ns.active].bf.find(x => x.id === "time_vault" && x.tapped);
  if (tappedVault) {
    ns = { ...ns, [ns.active]: { ...ns[ns.active], bf: ns[ns.active].bf.map(x => x.iid === tappedVault.iid ? { ...x, tapped: false } : x) } };
    ns = dlog(ns, `${ns.active} skips their turn (Time Vault) -- Time Vault untaps.`, "effect");
    const nx2 = ns.active === "p" ? "o" : "p";
    ns = { ...ns, active: nx2, turn: ns.turn + 1 };
  }
}
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
// Damping Field: "Players can't untap more than one artifact during their untap
// steps." Same per-turn-counter idiom as winterOrbOut (lands) / smokeOut (creatures).
// Adapted from Card-Forge/forge (d/damping_field.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const dampingFieldOut = allBF_s.some(x => x.id === "damping_field");
// Magnetic Mountain: "Blue creatures don't untap during their controllers'
// untap steps." Adapted from Card-Forge/forge (m/magnetic_mountain.txt),
// GPL-3.0. See THIRD_PARTY_NOTICES.md.
const magneticMountainOut = allBF_s.some(x => x.id === "magnetic_mountain");
// Stasis: "Players skip their untap steps." Gates the entire per-active-player
// untap bf.map below -- untapping, summoning-sickness-clear, and damage-clear
// are conflated into a single step in this engine (existing untap-step
// simplification, not new here), so skipping the map skips all three at once.
const stasisOut = allBF_s.some(x => x.id === "stasis");
let artifactsUntapped = 0;
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
// Ashnod's Battle Gear / Tawnos's Weaponry: "You may choose not to untap this
// during your untap step." Only relevant while tapped with an active
// while-tapped bonus in play (whileTappedPump) -- no reason to skip untapping
// otherwise. Computed from the pre-untap bf snapshot so the .map() below stays
// a pure per-card transform.
// optionalUntapAlways (Phyrexian Gremlins): same "you may choose not to untap"
// idiom as whileTappedPump (Ashnod's Battle Gear/Tawnos's Weaponry) but with no
// P/T-pump precondition -- the creature just always may decline.
// Adapted from Card-Forge/forge (p/phyrexian_gremlins.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (stasisOut) {
  ns = dlog(ns, `Stasis: ${ns.active} skips their untap step.`, "effect");
} else {
const optionalUntapTargets = ns[ns.active].bf.filter(c => c.optionalUntap && c.tapped && (c.whileTappedPump || c.optionalUntapAlways));
// Tawnos's Coffin: snapshot pre-untap tapped state for cards this map is
// about to process, so a tapped -> untapped transition within this same
// automatic pass can be detected below (insertion point 1 of 2 -- see
// docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return). Scoped to
// id === 'tawnos_coffin' with exiledCreatureIid set; inert for every other
// permanent.
const preUntapCoffins = ns[ns.active].bf.filter(c => c.id === 'tawnos_coffin' && c.tapped && c.exiledCreatureIid);
ns = { ...ns, [ns.active]: { ...ns[ns.active], bf: ns[ns.active].bf.map(c => {
const base = { ...c, summoningSick:false, damage:0 };
// Island Fish Jasconius / Leviathan / Time Vault: "doesn't untap during your
// untap step" -- only untaps via an explicit pay-cost action (payToUntapSelf
// upkeep case, or Time Vault's extra-turn ability), never automatically here.
// Adapted from Card-Forge/forge (i/island_fish_jasconius.txt, l/leviathan.txt,
// t/time_vault.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
// Venarian Gold / Cocoon: same "doesn't untap normally" shape, but gated by a
// counter instead of a static flag -- Venarian Gold checks the creature's own
// SLEEP counter, Cocoon checks its attached Aura's own PUPA counter (counters
// on the Aura record itself, not the creature -- see the Cocoon ETB block in
// the "enchantCreature" case above).
if (c.doesNotUntapNormally || (c.counters?.SLEEP || 0) > 0 || c.enchantments?.some(e => e.name === "Cocoon" && (e.counters?.PUPA || 0) > 0)) return base;
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
if (magneticMountainOut && c.color === "U") return base;
// Paralyze: creature never untaps while the aura is attached
if (c.paralyzed || c.enchantments?.some(e => e.mod?.paralyzed)) return { ...base, tapped: true };
if (c.optionalUntap && c.optionalUntapAlways) return base; // stays tapped; choice queued below
cresUntapped++;
return { ...base, tapped:false };
}
if (c.optionalUntap && c.tapped && (c.whileTappedPump || c.optionalUntapAlways)) return base; // stays tapped; choice queued below
// Phyrexian Gremlins: locked artifact doesn't untap while the locking
// creature remains tapped.
if (c.lockedByIid) {
  const locker = [...ns.p.bf, ...ns.o.bf].find(x => x.iid === c.lockedByIid);
  if (locker && locker.tapped) return base;
}
if (isArt(c)) {
  if (dampingFieldOut && artifactsUntapped >= 1) return base;
  artifactsUntapped++;
}
return { ...base, tapped:false };
}) } };
// Tawnos's Coffin: insertion point 1 of 2 -- if the automatic pass above
// untapped a coffin that has an exiled creature on file, return it now. See
// docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return.
for (const coffin of preUntapCoffins) {
  const afterCoffin = ns[ns.active].bf.find(c => c.iid === coffin.iid);
  if (afterCoffin && !afterCoffin.tapped) {
    ns = tawnosCoffinReturn(ns, afterCoffin);
  }
}
if (ns.active === 'p') {
  for (const t of optionalUntapTargets) {
    ns = queueUpkeepChoice(ns, { cardName: t.name, handlerKey: 'optionalUntap', iid: t.iid });
  }
}
// Opponent auto-decide: keep the bonus (decline to untap), handled implicitly
// above by leaving it tapped -- no per-player yes/no UI exists for a
// non-player controller (same convention as Brainwash/Hasran Ogress elsewhere
// in this file). Since the ability was activated in the first place because
// the bonus is worth having, staying tapped is assumed the better line.
}
}
}

if (next === PHASE.UPKEEP) {
if (!ns.dungeonMod || ns.dungeonMod !== 'SILENCE') {
  ns = emitEvent(ns, { type: 'ON_UPKEEP_START', payload: { activePlayer: ns.active } });
  ns = processTriggerQueue(ns);
}
// Hazezon Tamar: "create X Sand Warrior tokens at the beginning of your next
// upkeep." Drained here (filtered to the entering player's own upkeep, not
// every upkeep) rather than PHASE.END like Rukh Egg's pendingEndStepTokens,
// since Hazezon's delayed trigger is upkeep-scoped, not end-step-scoped.
const hazezonPending = (ns.pendingUpkeepTokens || []).filter(p => p.controller === ns.active);
if (hazezonPending.length) {
  for (const pending of hazezonPending) {
    ns = createToken(ns, pending.tokenId, pending.count, pending.controller, pending.sourceIid);
    ns = dlog(ns, `Creates ${pending.count}x Sand Warrior token(s) (Hazezon Tamar, delayed trigger).`, 'effect');
  }
  ns = { ...ns, pendingUpkeepTokens: (ns.pendingUpkeepTokens || []).filter(p => p.controller !== ns.active) };
}
// Giant Slug: "choose a basic land type. This creature gains landwalk of the
// chosen type until the end of that turn." Drained here like Hazezon Tamar's
// pendingUpkeepTokens above -- filtered to the correct player's own upkeep.
// Presents a basicLandTypeChoice (same request shape as Phantasmal Terrain)
// rather than auto-picking, since the choice is the player's; RESOLVE_CHOICE's
// grantsLandwalkEOT branch applies the eotBuffs keyword grant once answered.
// Adapted from Card-Forge/forge (g/giant_slug.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const giantSlugPending = (ns.pendingUpkeepLandwalk || []).filter(p => p.controller === ns.active);
if (giantSlugPending.length) {
  for (const pending of giantSlugPending) {
    const slug = ns[pending.controller].bf.find(c => c.iid === pending.sourceIid);
    if (!slug) continue;
    ns = createPendingChoice(ns, {
      sourceCardId: pending.sourceIid,
      controller: pending.controller,
      kind: 'basicLandTypeChoice',
      targetIid: pending.sourceIid,
      grantsLandwalkEOT: true,
      options: [
        { id: 'Plains', label: 'Plains' },
        { id: 'Island', label: 'Island' },
        { id: 'Swamp', label: 'Swamp' },
        { id: 'Mountain', label: 'Mountain' },
        { id: 'Forest', label: 'Forest' },
      ],
    });
  }
  ns = { ...ns, pendingUpkeepLandwalk: (ns.pendingUpkeepLandwalk || []).filter(p => p.controller !== ns.active) };
}
for (const w of ["p","o"]) {
for (const c of [...ns[w].bf]) {
if (!c.controller || c.controller !== w) continue;
// Energy Flux: "All artifacts have 'At the beginning of your upkeep, sacrifice
// this artifact unless you pay {2}.'" Global grant to every artifact regardless
// of its own card.upkeep field -- checked here rather than via the switch below.
// Adapted from Card-Forge/forge (e/energy_flux.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active && isArt(c) && [...ns.p.bf, ...ns.o.bf].some(x => x.name === "Energy Flux")) {
  if (w === "o") {
    const totalMana = Object.values(ns.o.mana).reduce((a, b) => a + b, 0);
    if (totalMana >= 2) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, "2") } };
      ns = dlog(ns, `${c.name}: opponent pays {2} (Energy Flux).`, "mana");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, `${c.name} sacrificed (Energy Flux).`, "death");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "energyFluxUpkeep", iid: c.iid });
  }
}
// Farmstead: "Enchanted land has 'At the beginning of your upkeep, you may pay
// {W}{W}. If you do, you gain 1 life.'" Checked via the attached aura's name
// rather than the land's own card.upkeep field.
// Adapted from Card-Forge/forge (f/farmstead.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const farmsteadAura = c.enchantments?.find(e => e.name === "Farmstead");
if (w === ns.active && isLand(c) && farmsteadAura) {
  if (w === "o") {
    if ((ns.o.mana.W ?? 0) >= 2) {
      ns = { ...ns, o: { ...ns.o, mana: { ...ns.o.mana, W: ns.o.mana.W - 2 } } };
      ns = hurt(ns, "o", -1, "Farmstead", { sourceIid: farmsteadAura.iid, sourceType: 'enchantment' });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Farmstead", handlerKey: "farmsteadUpkeep", iid: c.iid });
  }
}
// Feedback/Wanderlust/Warp Artifact: "Enchant [enchantment/creature/artifact].
// At the beginning of the upkeep of enchanted permanent's controller, this
// Aura deals 1 damage to that player." Same "checked via attached aura name"
// idiom as Farmstead above -- these enchant enchantments/creatures/artifacts
// rather than lands, and deal a fixed (non-optional) 1 damage, so no upkeep
// choice is needed.
// Cursed Land joins this same array (Legends, A9 batch) -- identical "1 fixed
// damage to enchanted permanent's controller" shape, enchanting a land.
// Adapted from Card-Forge/forge (f/feedback.txt, w/wanderlust.txt,
// w/warp_artifact.txt, c/cursed_land.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active) {
  const curseAura = c.enchantments?.find(e => ["Feedback", "Wanderlust", "Warp Artifact", "Cursed Land"].includes(e.name));
  if (curseAura) ns = hurt(ns, w, 1, curseAura.name, { sourceIid: curseAura.iid, sourceType: 'enchantment' });
}
// Power Leak: "that player may pay any amount of mana. This Aura deals 2
// damage to that player. Prevent X of that damage, where X is the amount
// paid this way." SIMPLIFICATION: AI never pays (auto-decides 0, takes 2);
// human is queued via pendingUpkeepChoice first (mana burns at this very
// transition, so the actual numberChoice -- and its affordability-based
// option list -- can only be built once the player has had a chance to add
// mana in response; see powerLeakPrompt in UPKEEP_CHOICE_HANDLERS).
// Adapted from Card-Forge/forge (p/power_leak.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const powerLeakAura = c.enchantments?.find(e => e.name === "Power Leak");
if (w === ns.active && powerLeakAura) {
  if (w === "o") {
    ns = hurt(ns, "o", 2, "Power Leak", { sourceIid: powerLeakAura.iid, sourceType: 'enchantment' });
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Power Leak", handlerKey: "powerLeakPrompt", iid: c.iid });
  }
}
// Erosion: "Enchant land. At the beginning of the upkeep of enchanted land's
// controller, destroy that land unless that player pays {1} or 1 life."
// Adapted from Card-Forge/forge (e/erosion.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const erosionAura = c.enchantments?.find(e => e.name === "Erosion");
if (w === ns.active && isLand(c) && erosionAura) {
  if (w === "o") {
    if (canPay(ns.o.mana, "1")) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, "1") } };
    } else if (ns.o.life > 1) {
      ns = hurt(ns, "o", 1, "Erosion", { sourceIid: erosionAura.iid, sourceType: 'enchantment' });
    } else {
      ns = destroyLand(ns, c.iid, "", { message: "Erosion destroys the enchanted land." });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Erosion", handlerKey: "erosionUpkeep", iid: c.iid });
  }
}
// Curse Artifact: "Enchant artifact. At the beginning of the upkeep of
// enchanted artifact's controller, Curse Artifact deals 2 damage to that
// player unless they sacrifice that artifact." Same "checked via attached
// aura name" idiom as Farmstead/Power Leak/Erosion above.
// Adapted from Card-Forge/forge (c/curse_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const curseArtifactAura = c.enchantments?.find(e => e.name === "Curse Artifact");
if (w === ns.active && isArt(c) && curseArtifactAura) {
  if (w === "o") {
    // AI auto-sacrifices the enchanted artifact -- guaranteed-safe line over
    // a 2-damage cost, same "AI takes the safe line" convention as Erosion's
    // own AI branch above (which prefers paying {1}/1 life over losing the land).
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, `${c.name} sacrificed (Curse Artifact).`, "death");
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Curse Artifact", handlerKey: "curseArtifactUpkeep", iid: c.iid });
  }
}
// Takklemaggot: "At the beginning of the upkeep of enchanted creature's
// controller, put a -0/-1 counter on that creature." Same "checked via
// attached aura name" idiom as Farmstead/Power Leak/Erosion/Curse Artifact
// above. Directly mutates toughness (same "change base toughness directly"
// idiom as Wall of Tombstones) rather than routing through the P1P1/M1M1
// counter pair computeCharacteristics reads, since -0/-1 only touches
// toughness -- counters.M0M1 is tracked alongside purely for display/tests.
const takklemaggotAura = c.enchantments?.find(e => e.name === "Takklemaggot");
if (w === ns.active && isCre(c) && takklemaggotAura) {
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid
    ? { ...x, toughness: (x.toughness || 0) - 1, counters: { ...x.counters, M0M1: (x.counters?.M0M1 || 0) + 1 } }
    : x) } };
  ns = dlog(ns, `Takklemaggot puts a -0/-1 counter on ${c.name}.`, "effect");
  ns = checkDeath(ns);
}
// Venarian Gold: "At the beginning of the upkeep of enchanted creature's
// controller, remove a sleep counter from that creature." Counters live on
// the creature itself (see the Venarian Gold ETB block in the
// "enchantCreature" case), so this reads c.counters?.SLEEP directly rather
// than a counter on the aura record -- still gated on the aura's presence
// (same "checked via attached aura name" idiom) for correctness.
const venarianGoldAura = c.enchantments?.find(e => e.name === "Venarian Gold");
if (w === ns.active && venarianGoldAura && (c.counters?.SLEEP || 0) > 0) {
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid
    ? { ...x, counters: { ...x.counters, SLEEP: x.counters.SLEEP - 1 } }
    : x) } };
  ns = dlog(ns, `Venarian Gold removes a sleep counter from ${c.name}.`, "effect");
}
// Cocoon: "At the beginning of your upkeep, remove a pupa counter from this
// Aura. If you can't, sacrifice it, put a +1/+1 counter on enchanted
// creature, and that creature gains flying." "Your" is Cocoon's own
// controller (matches Kudzu/Living Artifact's "own controller's upkeep"
// shape, not Farmstead/Venarian Gold/Takklemaggot's "enchanted permanent's
// controller" shape) -- since Cocoon can only enchant a creature its own
// controller controls (mod.enchantOwnOnly), the two are always the same
// player in practice, so `w === ns.active` covers both readings identically.
// Counters live on the Aura record itself (see the Cocoon ETB block).
const cocoonAura = c.enchantments?.find(e => e.name === "Cocoon");
if (w === ns.active && cocoonAura) {
  if ((cocoonAura.counters?.PUPA || 0) > 0) {
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => {
      if (x.iid !== c.iid) return x;
      const encs = x.enchantments.map(e => e.iid === cocoonAura.iid ? { ...e, counters: { PUPA: e.counters.PUPA - 1 } } : e);
      return { ...x, enchantments: encs };
    }) } };
    ns = dlog(ns, `Cocoon removes a pupa counter from itself.`, "effect");
  } else {
    // Cocoon is an embedded enchantments[] record, not a top-level
    // battlefield card -- zMove can't find it by iid (it only searches
    // hand/bf/gy/exile/lib arrays), so it's removed from the host's
    // enchantments array and its cardData pushed to graveyard directly, same
    // as the generic aura-falls-off cascade in zMove itself.
    const cocoonOwner = cocoonAura.controller || w;
    ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid
      ? { ...x, counters: { ...x.counters, P1P1: (x.counters?.P1P1 || 0) + 1 }, keywords: x.keywords.includes(KEYWORDS.FLYING.id) ? x.keywords : [...x.keywords, KEYWORDS.FLYING.id], enchantments: x.enchantments.filter(e => e.iid !== cocoonAura.iid) }
      : x) } };
    ns = { ...ns, [cocoonOwner]: { ...ns[cocoonOwner], gy: [...ns[cocoonOwner].gy, { ...cocoonAura.cardData }] } };
    ns = dlog(ns, `Cocoon is sacrificed -- ${c.name} gets a +1/+1 counter and gains flying.`, "effect");
  }
}
// Copper Tablet: "At the beginning of each player's upkeep, Copper Tablet
// deals 1 damage to that player." Not gated by controller the way
// blackVise/rackUpkeep are (which fire only on a specific OTHER player's
// upkeep) -- this fires on whoever's upkeep is currently active regardless
// of who controls the permanent, so no `w === ns.active` guard on the
// permanent's controller is used; the target is always ns.active, not w.
// Adapted from Card-Forge/forge (c/copper_tablet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (c.name === "Copper Tablet") {
  ns = hurt(ns, ns.active, 1, "Copper Tablet", { sourceIid: c.iid, sourceType: inferSourceType(c) });
}
// Storm World: "At the beginning of each player's upkeep, Storm World deals
// X damage to that player, where X is 4 minus the number of cards in their
// hand." Same "each player's upkeep, target is always ns.active" shape as
// Copper Tablet above.
// Adapted from Card-Forge/forge (s/storm_world.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (c.name === "Storm World") {
  const handSize = ns[ns.active].hand.length;
  const dmg = Math.max(0, 4 - handSize);
  if (dmg > 0) ns = hurt(ns, ns.active, dmg, "Storm World", { sourceIid: c.iid, sourceType: inferSourceType(c) });
}
// Mana Vortex: "At the beginning of each player's upkeep, that player
// sacrifices a land." Same "each player's upkeep" shape as Copper Tablet/
// Storm World above. Distinct in scope from Serendib Djinn's "you control no
// lands" (single-player, sacrificeIfNoLands) check below -- this is a
// mandatory sacrifice that fires every upkeep regardless of land count.
// Adapted from Card-Forge/forge (m/mana_vortex.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (c.name === "Mana Vortex") {
  const mvLands = ns[ns.active].bf.filter(isLand);
  if (mvLands.length) {
    if (ns.active === "o") {
      const mvBasics = mvLands.filter(l => l.subtype?.includes("Basic"));
      const mvChosen = mvBasics[0] || mvLands[0];
      ns = zMove(ns, mvChosen.iid, ns.active, ns.active, "gy");
      ns = dlog(ns, `Mana Vortex: ${ns.active} sacrifices ${mvChosen.name}.`, "effect");
    } else {
      ns = queueUpkeepChoice(ns, { cardName: "Mana Vortex", handlerKey: "manaVortexUpkeep", iid: c.iid });
    }
  }
  // "When there are no lands on the battlefield, sacrifice Mana Vortex" --
  // a GLOBAL check across both players' battlefields combined, distinct from
  // the single-player checks above.
  if (![...ns.p.bf, ...ns.o.bf].some(isLand)) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, "Mana Vortex: no lands remain on the battlefield -- sacrificed.", "effect");
  }
}
// The Abyss: "At the beginning of each player's upkeep, destroy target
// nonartifact creature that player controls of their choice. It can't be
// regenerated." Same "each player's upkeep, target is always ns.active"
// shape as Copper Tablet/Storm World/Mana Vortex above -- no `w === ns.active`
// guard on the enchantment's own controller. SIMPLIFICATION: "of their
// choice" is auto-picked deterministically (least power, ties broken by
// battlefield order) -- same convention as Drop of Honey's own "you choose"
// clause elsewhere in this file. Direct zMove (not a regen-aware destroy
// path) matches Drop of Honey/Elder Spawn's existing "can't be regenerated"
// idiom of simply bypassing any regeneration shield.
if (c.name === "The Abyss") {
  const abyssTargets = ns[ns.active].bf.filter(x => isCre(x) && !isArt(x));
  if (abyssTargets.length) {
    const minPow = Math.min(...abyssTargets.map(x => getPow(x, ns)));
    const abyssChosen = abyssTargets.find(x => getPow(x, ns) === minPow);
    ns = zMove(ns, abyssChosen.iid, ns.active, ns.active, "gy");
    ns = dlog(ns, `The Abyss destroys ${abyssChosen.name} (can't be regenerated).`, "death");
  }
}
// Worms of the Earth: "At the beginning of each upkeep, any player may
// sacrifice two lands of their choice or have this enchantment deal 5
// damage to that player. If a player does either, destroy this
// enchantment." SIMPLIFICATION: "any player" narrows to "the player whose
// upkeep it is" -- same "each player's upkeep, target is always ns.active"
// shape as The Abyss/Copper Tablet/Storm World/Mana Vortex above. AI never
// opts in (same "AI never opts in" convention as Magnetic Mountain/Tetravus
// elsewhere in this file) -- declining costs the AI nothing since the land
// lock is symmetric for both players.
if (c.name === "Worms of the Earth" && ns.active === "p") {
  ns = queueUpkeepChoice(ns, { cardName: "Worms of the Earth", handlerKey: "wormsOfTheEarthUpkeep", iid: c.iid });
}
// Psychic Allergy: "At the beginning of each opponent's upkeep, this
// enchantment deals X damage to that player, where X is the number of
// nontoken permanents of the chosen color they control." Same "fires only on
// a specific OTHER player's upkeep" shape as blackVise/rackUpkeep (switch
// case below) -- checked here (not via c.upkeep) since Psychic Allergy also
// carries a *second*, independent upkeep effect on its own controller's
// upkeep (see psychicAllergyUpkeep in the switch below).
if (c.name === "Psychic Allergy" && c.chosenColor) {
  const paOpp = w === "p" ? "o" : "p";
  if (ns.active === paOpp) {
    const paCount = ns[paOpp].bf.filter(x => !x.isToken && x.color === c.chosenColor).length;
    if (paCount > 0) ns = hurt(ns, paOpp, paCount, "Psychic Allergy", { sourceIid: c.iid, sourceType: inferSourceType(c) });
  }
}
// Dance of Many: "When the token leaves the battlefield, sacrifice Dance of
// Many." Tokens cease to exist when they leave the battlefield (CR 111.7 --
// see zMove's tokenVanishes handling) so there is no zone the token can be
// found in afterward for a standard leaves-the-battlefield trigger to key
// off of -- checked here as a periodic orphan-check instead, same idiom as
// kudzuStyleLandOrphanCheck/kudzuStyleArtifactOrphanCheck below. `continue`
// skips the rest of this card's per-upkeep checks (including the
// sacrificeUnless_UU switch case below) once it's already been sacrificed
// this way, so that case can't also fire a stale double-sacrifice/mana-pay.
if (w === ns.active && c.id === "dance_of_many" && c.linkedTokenIid && !ns[w].bf.some(x => x.iid === c.linkedTokenIid)) {
  ns = zMove(ns, c.iid, w, w, "gy");
  ns = dlog(ns, "Dance of Many: linked token is gone -- sacrificed.", "effect");
  continue;
}
// Shapeshifter: "At the beginning of your upkeep, you may choose a number
// between 0 and 7." SIMPLIFICATION: only re-prompts the human player -- the
// AI keeps its current chosenNumber rather than being re-prompted every turn.
// Adapted from Card-Forge/forge (s/shapeshifter.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active && w === 'p' && c.id === "shapeshifter") {
  ns = createPendingChoice(ns, {
    sourceCardId: c.iid,
    controller: w,
    kind: 'numberChoice',
    handlerKey: 'shapeshifterChoose',
    iid: c.iid,
    options: [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ id: String(n), label: String(n) })),
  });
}
// Magnetic Mountain: "each player may choose any number of tapped blue
// creatures they control and pay {4} for each. If so, untap those creatures."
// SIMPLIFICATION: the AI never opts in (auto-chooses 0, no queued choice);
// the human is queued via pendingUpkeepChoice first -- mana burns at this
// very transition, so affordability (and thus the numberChoice option list)
// can only be computed once the player has had a chance to add mana in
// response; see magneticMountainPrompt in UPKEEP_CHOICE_HANDLERS. Auto-selects
// which eligible creatures untap (same auto-fill convention as the C1
// X-target spells).
// Adapted from Card-Forge/forge (m/magnetic_mountain.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active && w === 'p' && c.id === "magnetic_mountain") {
  const eligible = ns.p.bf.filter(x => isCre(x) && x.tapped && x.color === "U");
  if (eligible.length > 0) {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "magneticMountainPrompt", iid: c.iid });
  }
}
// Tetravus: "At the beginning of your upkeep, you may remove any number of
// +1/+1 counters from this creature. If you do, create that many 1/1
// colorless Tetravite artifact creature tokens." SIMPLIFICATION: only the
// human player is prompted, same "AI never opts in" convention as
// Shapeshifter/Magnetic Mountain above.
// Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active && w === 'p' && c.id === "tetravus" && (c.counters?.P1P1 || 0) > 0) {
  ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "tetravusRemoveCountersPrompt", iid: c.iid });
}
// Tetravus: "At the beginning of your upkeep, you may exile any number of
// tokens created with this creature. If you do, put that many +1/+1 counters
// on this creature."
// Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (w === ns.active && w === 'p' && c.id === "tetravus") {
  const tetraviteCount = ns.p.bf.filter(x => x.isToken && x.tokenId === "tetravite" && x.sourceIid === c.iid).length;
  if (tetraviteCount > 0) {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "tetravusExileTokensPrompt", iid: c.iid });
  }
}
switch (c.upkeep) {
case "selfDamage1": ns = hurt(ns, w, 1, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) }); break;
case "forceOfNatureUpkeep": {
if (w !== ns.active) break;
if (w === "o") {
  if ((ns.o.mana.G ?? 0) >= 4) {
    ns = { ...ns, o: { ...ns.o, mana: { ...ns.o.mana, G: ns.o.mana.G - 4 } } };
    ns = dlog(ns, "Force of Nature: opponent paid GGGG upkeep.", "mana");
  } else {
    ns = hurt(ns, "o", 8, "Force of Nature", { sourceIid: c.iid, sourceType: inferSourceType(c) });
    ns = dlog(ns, "Force of Nature: opponent takes 8 damage (could not pay GGGG).", "damage");
  }
} else {
  ns = queueUpkeepChoice(ns, {
    cardName: "Force of Nature",
    handlerKey: "forceOfNatureUpkeep",
    iid: c.iid,
    options: ["PAY_GGGG", "TAKE_DAMAGE"],
  });
}
break;
}
case "lordsUpkeep": {
const others = ns[w].bf.filter(x => isCre(x) && x.iid !== c.iid);
if (others.length) { ns = { ...ns, turnState: { ...ns.turnState, sacrificedIids: [...(ns.turnState.sacrificedIids || []), others[0].iid] } }; ns = zMove(ns, others[0].iid, w, w, "gy"); ns = dlog(ns, `Lord of the Pit devours ${others[0].name}.`, "death"); }
else ns = hurt(ns, w, 7, "Lord of the Pit", { sourceIid: c.iid, sourceType: inferSourceType(c) });
break;
}
case "sacrificeSelf": if (next === PHASE.CLEANUP) { ns = { ...ns, turnState: { ...ns.turnState, sacrificedIids: [...(ns.turnState.sacrificedIids || []), c.iid] } }; ns = zMove(ns, c.iid, w, w, "gy"); } break;
case "sacrificeUnless_U": {
const mp = { ...ns[w].mana };
if ((mp.U || 0) >= 1) { mp.U--; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
case "sacrificeUnless_WW": {
const mp = { ...ns[w].mana };
if ((mp.W || 0) >= 2) { mp.W -= 2; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// Junún Efreet: "sacrifice this creature unless you pay {B}{B}."
// Adapted from Card-Forge/forge (j/junun_efreet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "sacrificeUnless_BB": {
const mp = { ...ns[w].mana };
if ((mp.B || 0) >= 2) { mp.B -= 2; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// Dance of Many: "sacrifice this enchantment unless you pay {U}{U}."
case "sacrificeUnless_UU": {
const mp = { ...ns[w].mana };
if ((mp.U || 0) >= 2) { mp.U -= 2; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// Forethought Amulet: "sacrifice this artifact unless you pay {3}." Generic
// mana, no color check -- reuses canPay/payMana the same way "3BBB" already
// does for Cosmic Horror above (mixed generic+colored parsing).
case "sacrificeUnless_3": {
if (canPay(ns[w].mana, "3")) { ns = { ...ns, [w]: { ...ns[w], mana: payMana(ns[w].mana, "3") } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// The Fallen: "deals 1 damage to each opponent it has dealt damage to this
// game." hasDamagedPlayers is recorded by the theFallenRecordDamage
// triggered-ability effect (ON_PLAYER_DAMAGED). This engine has no
// planeswalker card type, so the oracle's "or planeswalker" clause is a
// permanent no-op here -- omitted from the implementation, kept in the
// printed text for accuracy.
case "theFallenUpkeep": {
if (w !== ns.active) break;
const tfOpp = w === "p" ? "o" : "p";
if (c.hasDamagedPlayers?.[tfOpp]) {
  ns = hurt(ns, tfOpp, 1, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
}
break;
}
// Serendib Djinn: "sacrifice a land. If you sacrifice an Island this way,
// Serendib Djinn deals 3 damage to you." Human picks via queueUpkeepChoice
// (a genuine land-picker, unlike Elder Spawn's auto-picked-first-Island
// shape above, since this card has no non-Island lands to fall back to
// unconditionally); AI auto-picks a non-Island land if one exists, to avoid
// the 3-damage clause.
case "serendibDjinnUpkeep": {
if (w !== ns.active) break;
if (w === "o") {
  const sdLands = ns.o.bf.filter(isLand);
  if (!sdLands.length) break; // sacrificeIfNoLands loop handles this creature separately
  const sdNonIsland = sdLands.find(l => !l.subtype?.includes("Island"));
  const sdChosen = sdNonIsland || sdLands[0];
  ns = zMove(ns, sdChosen.iid, w, w, "gy");
  ns = dlog(ns, `${c.name}: opponent sacrifices ${sdChosen.name}.`, "effect");
  if (sdChosen.subtype?.includes("Island")) {
    ns = hurt(ns, "o", 3, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
  }
} else {
  const humanLands = ns.p.bf.filter(isLand);
  if (!humanLands.length) break;
  ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "serendibDjinnUpkeep", iid: c.iid });
}
break;
}
// Rohgahh of Kher Keep: "you may pay {R}{R}{R}. If you don't, tap Rohgahh
// and all Kobolds of Kher Keep, then an opponent gains control of them."
// AI auto-pays if affordable (demonicHordesUpkeep-style "pay if you can"
// convention above), else calls rohgahhTapAndTransfer.
case "rohgahhUpkeep": {
if (w !== ns.active) break;
if (w === "o") {
  if (canPay(ns.o.mana, "RRR")) {
    ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, "RRR") } };
    ns = dlog(ns, `${c.name}: opponent pays RRR upkeep.`, "mana");
  } else {
    ns = rohgahhTapAndTransfer(ns, w, c.iid);
  }
} else {
  ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "rohgahhUpkeep", iid: c.iid });
}
break;
}
// Palladia-Mors: "sacrifice this creature unless you pay {R}{G}{W}."
case "sacrificeUnless_RGW": {
const mp = { ...ns[w].mana };
if ((mp.R || 0) >= 1 && (mp.G || 0) >= 1 && (mp.W || 0) >= 1) { mp.R--; mp.G--; mp.W--; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// Nicol Bolas: "sacrifice this creature unless you pay {U}{B}{R}."
case "sacrificeUnless_UBR": {
const mp = { ...ns[w].mana };
if ((mp.U || 0) >= 1 && (mp.B || 0) >= 1 && (mp.R || 0) >= 1) { mp.U--; mp.B--; mp.R--; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
// Vaevictis Asmadi: "sacrifice this creature unless you pay {B}{R}{G}."
case "sacrificeUnless_BRG": {
const mp = { ...ns[w].mana };
if ((mp.B || 0) >= 1 && (mp.R || 0) >= 1 && (mp.G || 0) >= 1) { mp.B--; mp.R--; mp.G--; ns = { ...ns, [w]: { ...ns[w], mana: mp } }; }
else { ns = zMove(ns, c.iid, w, w, "gy"); ns = dlog(ns, `${c.name} sacrificed.`, "death"); }
break;
}
case "blackVise": {
const opp2 = w === "p" ? "o" : "p";
if (ns.active !== opp2) break;
const over = Math.max(0, ns[opp2].hand.length - 4);
if (over > 0) ns = hurt(ns, opp2, over, "Black Vise", { sourceIid: c.iid, sourceType: inferSourceType(c) });
break;
}
case "rackUpkeep": {
// The Rack: SIMPLIFICATION -- "choose an opponent" as this artifact enters
// is hardcoded as "opponent of controller" (this engine's 2-player duel has
// only one possible choice). Both blackVise above and this case need an
// active-player guard for the same reason: the chosen player and the
// artifact's controller are never the same player. blackVise fires only
// on the chosen player's own upkeep; The Rack fires only on the chosen
// opponent's upkeep, never the controller's own.
const rackOpp = w === "p" ? "o" : "p";
if (ns.active !== rackOpp) break;
const rackDmg = Math.max(0, 3 - ns[rackOpp].hand.length);
if (rackDmg > 0) ns = hurt(ns, rackOpp, rackDmg, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
break;
}
case "howlingMine": for (const dw of ["p","o"]) ns = drawD(ns, dw, 1); ns = dlog(ns, "Howling Mine: each player draws a card.", "draw"); break;
case "ivoryTower": { const gain = Math.max(0, ns[w].hand.length - 4); if (gain > 0) ns = hurt(ns, w, -gain, "Ivory Tower", { sourceIid: c.iid, sourceType: inferSourceType(c) }); break; }
case "sylvanLibrary": {
ns = performDraws(ns, w, 2, w === "o" ? [{ id: "sylvanPutBackTwo" }] : [{ id: "dlogText", text: "Sylvan Library: drew 2 extra cards.", type: "draw" }]);
break;
}
case "karmaUpkeep": {
const kSwamps = ns[w].bf.filter(x => isLand(x) && x.subtype?.includes("Swamp")).length;
if (kSwamps > 0) ns = hurt(ns, w, kSwamps, "Karma", { sourceIid: c.iid, sourceType: inferSourceType(c) });
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
    ns = tapPermanent(ns, w, c.iid);
    ns = hurt(ns, w, 3, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
    ns = dlog(ns, `${c.name}: failed to pay BBB ? tapped and took 3 damage.`, "damage");
  }
  break;
}
case "powerSurgeUpkeep": {
  const dmg = ns.turnState.powerSurgeUntappedCount ?? 0;
  if (dmg > 0) {
    ns = hurt(ns, ns.active, dmg, "Power Surge", { sourceIid: c.iid, sourceType: inferSourceType(c) });
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
  ns = destroyLand(ns, enchLand.iid, "Kudzu");
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
// Living Artifact: "At the beginning of your upkeep, you may remove a
// vitality counter from this Aura. If you do, you gain 1 life." "Your" is the
// Aura's own controller (this Aura can legally be cast on an opponent's
// artifact), matching Kudzu's "own controller's upkeep" shape above rather
// than the Farmstead/Power Leak "enchanted permanent's controller" shape.
// Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "livingArtifactUpkeep": {
  if (w !== ns.active) break;
  const enchArt = [...ns.p.bf, ...ns.o.bf].find(a => isArt(a) && a.iid === c.enchantedArtifactIid);
  if (!enchArt) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, "Living Artifact: not attached to an artifact — goes to graveyard.", "effect");
    break;
  }
  if ((c.counters?.VITALITY || 0) <= 0) break;
  if (w === "o") {
    ns = { ...ns, o: { ...ns.o, bf: ns.o.bf.map(x => x.iid === c.iid ? { ...x, counters: { ...x.counters, VITALITY: x.counters.VITALITY - 1 } } : x) } };
    ns = hurt(ns, "o", -1, c.name, { sourceIid: c.iid, sourceType: 'enchantment' });
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "livingArtifactUpkeep", iid: c.iid });
  }
  break;
}
// Kudzu-style orphan cleanup for Blight/Psychic Venom/Relic Bind: these Auras
// have no ongoing upkeep effect of their own (unlike Kudzu/Living Artifact
// above), but need the SAME reactive "no legal host -> graveyard" self-check --
// there is no general SBA sweep for orphaned Kudzu-style Auras in this engine
// (confirmed by reading zMove's aura-cascade, which only handles the OTHER
// embedded-record Aura shape, e.g. Wild Growth). Mirrors kudzuUpkeep/
// livingArtifactUpkeep's own orphan-check exactly; not a new mechanism.
case "kudzuStyleLandOrphanCheck": {
  if (w !== ns.active) break;
  const enchLand = [...ns.p.bf, ...ns.o.bf].find(l => isLand(l) && l.iid === c.enchantedLandIid);
  if (!enchLand) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, `${c.name}: not attached to a land -- goes to graveyard.`, "effect");
  }
  break;
}
case "kudzuStyleArtifactOrphanCheck": {
  if (w !== ns.active) break;
  const enchArt = [...ns.p.bf, ...ns.o.bf].find(a => isArt(a) && a.iid === c.enchantedArtifactIid);
  if (!enchArt) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, `${c.name}: not attached to an artifact -- goes to graveyard.`, "effect");
  }
  break;
}
// Elder Spawn: "unless you sacrifice an Island, sacrifice this creature and
// it deals 6 damage to you."
// Adapted from Card-Forge/forge (e/elder_spawn.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "elderSpawnUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    const islands = ns.o.bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
    if (islands.length) {
      ns = zMove(ns, islands[0].iid, w, w, "gy");
      ns = dlog(ns, `${c.name}: opponent sacrifices an Island.`, "effect");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = hurt(ns, "o", 6, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "elderSpawnUpkeep", iid: c.iid });
  }
  break;
}
// Wall of Tombstones: "change this creature's base toughness to 1 plus the
// number of creature cards in your graveyard. (This effect lasts indefinitely.)"
// Directly mutates the base toughness field rather than a continuous buff --
// matches "change base toughness ... lasts indefinitely" exactly.
// Adapted from Card-Forge/forge (w/wall_of_tombstones.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "wallOfTombstonesUpkeep": {
  if (w !== ns.active) break;
  const gyCreatures = ns[w].gy.filter(isCre).length;
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, toughness: 1 + gyCreatures } : x) } };
  break;
}
// Cosmic Horror: "destroy this creature unless you pay {3}{B}{B}{B}. If it's
// destroyed this way, it deals 7 damage to you."
// Adapted from Card-Forge/forge (c/cosmic_horror.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
// SIMPLIFICATION: mana burns at every phase boundary (classic rule), so a
// player can never have floating mana at the exact instant this check would
// run inline mid-transition -- queued via UPKEEP_CHOICE_HANDLERS for the human
// player (who taps lands in response to the prompt), same as Farmstead/Energy
// Flux; the AI auto-decides immediately since it has no such UI step anyway.
case "cosmicHorrorUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    if (canPay(ns.o.mana, "3BBB")) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, "3BBB") } };
      ns = dlog(ns, `${c.name}: opponent pays {3}{B}{B}{B}.`, "mana");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = hurt(ns, w, 7, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
      ns = dlog(ns, `${c.name}: destroyed -- deals 7 damage to you.`, "death");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "cosmicHorrorUpkeep", iid: c.iid });
  }
  break;
}
// Sunken City: "sacrifice this enchantment unless you pay {U}{U}." (The
// "Blue creatures get +1/+1" static half is a separate lordEffect field.)
// Adapted from Card-Forge/forge (s/sunken_city.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "sunkenCityUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    if (canPay(ns.o.mana, "UU")) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, "UU") } };
      ns = dlog(ns, `${c.name}: opponent pays {U}{U}.`, "mana");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, `${c.name}: sacrificed (could not pay {U}{U}).`, "death");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "sunkenCityUpkeep", iid: c.iid });
  }
  break;
}
// Drop of Honey: "destroy the creature with the least power. It can't be
// regenerated. If two or more creatures are tied for least power, you choose
// one of them." SIMPLIFICATION: ties broken deterministically (first found in
// p-then-o battlefield order) rather than a real choice UI.
// Adapted from Card-Forge/forge (d/drop_of_honey.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "dropOfHoneyUpkeep": {
  if (w !== ns.active) break;
  const allCreatures = [...ns.p.bf, ...ns.o.bf].filter(isCre);
  if (allCreatures.length) {
    const minPow = Math.min(...allCreatures.map(x => getPow(x, ns)));
    const target = allCreatures.find(x => getPow(x, ns) === minPow);
    const tw = ns.p.bf.some(x => x.iid === target.iid) ? 'p' : 'o';
    ns = zMove(ns, target.iid, tw, tw, "gy");
    ns = dlog(ns, `Drop of Honey destroys ${target.name} (least power).`, "effect");
  }
  break;
}
// Island Fish Jasconius / Leviathan: "doesn't untap during your untap step.
// At the beginning of your upkeep, you may pay [cost]. If you do, untap this
// creature." SIMPLIFICATION: auto-pays when affordable (same convention as
// other such "may pay" upkeep effects elsewhere in this file).
// Adapted from Card-Forge/forge (i/island_fish_jasconius.txt, l/leviathan.txt),
// GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "payToUntapSelf": {
  if (w !== ns.active || !c.tapped) break;
  if (w === "o") {
    if (canPay(ns.o.mana, c.untapCost)) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, c.untapCost) } };
      ns = { ...ns, o: { ...ns.o, bf: ns.o.bf.map(x => x.iid === c.iid ? { ...x, tapped: false } : x) } };
      ns = dlog(ns, `${c.name}: opponent pays {${c.untapCost}} to untap.`, "mana");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "payToUntapSelf", iid: c.iid, untapCost: c.untapCost });
  }
  break;
}
// Leviathan: "you may sacrifice two Islands. If you do, untap this creature."
// Adapted from Card-Forge/forge (l/leviathan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "sacIslandsToUntapSelf": {
  if (w !== ns.active || !c.tapped) break;
  if (w === "o") {
    const islands = ns.o.bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
    if (islands.length >= 2) {
      for (const isl of islands.slice(0, 2)) ns = zMove(ns, isl.iid, w, w, "gy");
      ns = { ...ns, o: { ...ns.o, bf: ns.o.bf.map(x => x.iid === c.iid ? { ...x, tapped: false } : x) } };
      ns = dlog(ns, `${c.name}: opponent sacrifices two Islands to untap.`, "effect");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "sacIslandsToUntapSelf", iid: c.iid });
  }
  break;
}
// Yawgmoth Demon: "you may sacrifice an artifact. If you don't, tap this
// creature and it deals 2 damage to you."
// Adapted from Card-Forge/forge (y/yawgmoth_demon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "yawgmothDemonUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    const arts = ns.o.bf.filter(x => isArt(x) && x.iid !== c.iid);
    if (arts.length) {
      ns = zMove(ns, arts[0].iid, w, w, "gy");
      ns = dlog(ns, `${c.name}: opponent sacrifices an artifact.`, "effect");
    } else {
      ns = tapPermanent(ns, "o", c.iid);
      ns = hurt(ns, "o", 2, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "yawgmothDemonUpkeep", iid: c.iid });
  }
  break;
}
// Mishra's War Machine: "this creature deals 3 damage to you unless you
// discard a card. If it deals damage to you this way, tap it." Direct
// structural copy of yawgmothDemonUpkeep above, substituting discard-a-card
// for sacrifice-an-artifact -- including the "no cards means the damage is
// unavoidable" ruling (mirrors Yawgmoth Demon's "no artifacts means the
// damage is unavoidable" case).
// Adapted from Card-Forge/forge (m/mishras_war_machine.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
case "mishrasWarMachineUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    const h = ns.o.hand;
    if (h.length) {
      const disc = h[h.length - 1];
      ns = discardCard(ns, "o", disc.iid, { cause: 'effect', sourceName: c.name });
      ns = dlog(ns, `${c.name}: opponent discards ${disc.name}.`, "effect");
    } else {
      ns = tapPermanent(ns, "o", c.iid);
      ns = hurt(ns, "o", 3, c.name, { sourceIid: c.iid, sourceType: inferSourceType(c) });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: c.name, handlerKey: "mishrasWarMachineUpkeep", iid: c.iid });
  }
  break;
}
// Fasting: "put a hunger counter on this enchantment. Then destroy this
// enchantment if it has five or more hunger counters on it." The draw-step
// skip-and-gain-2-life replacement lives in the DRAW phase block (same
// "if ns[ns.active].bf.some(name)" shape as Island Sanctuary); the "when you
// draw a card, destroy this enchantment" trigger lives in performDraws
// (the single choke point for every draw).
case "fastingUpkeep": {
  if (w !== ns.active) break;
  const hunger = (c.counters?.HUNGER || 0) + 1;
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, counters: { ...x.counters, HUNGER: hunger } } : x) } };
  ns = dlog(ns, `Fasting puts a hunger counter on itself (${hunger}).`, "effect");
  if (hunger >= 5) {
    ns = zMove(ns, c.iid, w, w, "gy");
    ns = dlog(ns, "Fasting has five or more hunger counters -- destroyed.", "death");
  }
  break;
}
// Primordial Ooze: "put a +1/+1 counter on this creature. Then you may pay
// {X}, where X is the number of +1/+1 counters on it. If you don't, tap this
// creature and it deals X damage to you." X is fixed by the counter count at
// queue time (not freely chosen), so the human branch stores it on the
// queued choice (payCost) same as payToUntapSelf's untapCost field --
// no numberChoice sub-flow needed since there's nothing left to compute at
// resolve time.
case "primordialOozeUpkeep": {
  if (w !== ns.active) break;
  const newCount = (c.counters?.P1P1 || 0) + 1;
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, counters: { ...x.counters, P1P1: newCount } } : x) } };
  ns = dlog(ns, `Primordial Ooze puts a +1/+1 counter on itself (${newCount}).`, "effect");
  if (w === "o") {
    if (canPay(ns.o.mana, String(newCount))) {
      ns = { ...ns, o: { ...ns.o, mana: payMana(ns.o.mana, String(newCount)) } };
      ns = dlog(ns, `Primordial Ooze: opponent pays {${newCount}}.`, "mana");
    } else {
      ns = tapPermanent(ns, "o", c.iid);
      ns = hurt(ns, "o", newCount, "Primordial Ooze", { sourceIid: c.iid, sourceType: inferSourceType(c) });
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Primordial Ooze", handlerKey: "primordialOozeUpkeep", iid: c.iid, payCost: String(newCount) });
  }
  break;
}
// Psychic Allergy: "At the beginning of your upkeep, destroy this
// enchantment unless you sacrifice two Islands." Its OTHER upkeep effect
// ("each opponent's upkeep, deal damage") is checked earlier in this loop
// (name-based, each-player idiom) since it isn't scoped to this card's own
// controller. Same "auto-slice first N" shape as Leviathan's
// sacIslandsToUntapSelf, substituting "sacrifice Psychic Allergy" for
// "leave the creature tapped" as the failure consequence.
case "psychicAllergyUpkeep": {
  if (w !== ns.active) break;
  const paIslands = ns[w].bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
  if (w === "o") {
    if (paIslands.length >= 2) {
      for (const isl of paIslands.slice(0, 2)) ns = zMove(ns, isl.iid, w, w, "gy");
      ns = dlog(ns, "Psychic Allergy: opponent sacrifices two Islands.", "effect");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, "Psychic Allergy sacrificed -- could not sacrifice two Islands.", "death");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Psychic Allergy", handlerKey: "psychicAllergyUpkeep", iid: c.iid });
  }
  break;
}
// Safe Haven: "you may sacrifice this land. If you do, return each card
// exiled with this land to the battlefield under its owner's control."
// AI never opts in (same convention as Magnetic Mountain/Tetravus/Worms of
// the Earth above) -- sacrificing only returns creatures it chose to exile
// via its own {2},{T} ability, so there's no forced-upside case to automate.
case "safeHavenUpkeep": {
  if (w !== ns.active) break;
  if (w === "p") {
    ns = queueUpkeepChoice(ns, { cardName: "Safe Haven", handlerKey: "safeHavenUpkeep", iid: c.iid });
  }
  break;
}
// Voodoo Doll: "put a pin counter on this artifact." The end-step
// destroy-if-untapped check lives in the END phase block; the {X}{X},{T}
// activated ability lives in ACTIVATE_ABILITY's activatedAbilities dispatch.
case "voodooDollUpkeep": {
  if (w !== ns.active) break;
  const pin = (c.counters?.PIN || 0) + 1;
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(x => x.iid === c.iid ? { ...x, counters: { ...x.counters, PIN: pin } } : x) } };
  ns = dlog(ns, `Voodoo Doll puts a pin counter on itself (${pin}).`, "effect");
  break;
}
// Season of the Witch: "sacrifice this enchantment unless you pay 2 life."
// Same "unless you pay" shape as sacrificeUnless_X above, substituting life
// for mana (hurt() with a positive amount is this codebase's existing
// "pay life" idiom -- see Erosion's PAY_1_LIFE branch). The end-step
// creature sweep lives in the END phase block.
case "seasonOfTheWitchUpkeep": {
  if (w !== ns.active) break;
  if (w === "o") {
    if (ns.o.life > 2) {
      ns = hurt(ns, "o", 2, "Season of the Witch", { sourceIid: c.iid, sourceType: inferSourceType(c) });
      ns = dlog(ns, "Season of the Witch: opponent pays 2 life.", "effect");
    } else {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, "Season of the Witch sacrificed -- could not pay 2 life.", "death");
    }
  } else {
    ns = queueUpkeepChoice(ns, { cardName: "Season of the Witch", handlerKey: "seasonOfTheWitchUpkeep", iid: c.iid });
  }
  break;
}
// Takklemaggot (post-death pinger form): "At the beginning of that player's
// upkeep, this enchantment deals 1 damage to that player." "That player"
// (c.pingerVictim) is fixed at the moment Takklemaggot's controller declined
// to reattach it (see the takklemaggotReattachChoice RESOLVE_CHOICE branch)
// and need not match this permanent's current controller w -- same
// unconditional-on-w, target-is-fixed shape as Copper Tablet/blackVise above.
case "takklemaggotPingerUpkeep": {
  if (ns.active === c.pingerVictim) {
    ns = hurt(ns, c.pingerVictim, 1, "Takklemaggot", { sourceIid: c.iid, sourceType: 'enchantment' });
  }
  break;
}
default: break;
}
}
}
// Nether Shadow: "At the beginning of your upkeep, if this card is in your
// graveyard with three or more creature cards above it, you may put this card
// onto the battlefield." Checked separately from the switch above (that loop
// only scans the battlefield) since this card acts from the graveyard.
// "Above it" = added to the graveyard after it (higher array index, since new
// discards are pushed to the end). SIMPLIFICATION: auto-returns when eligible
// -- no "you may" UI decision, matching other such upkeep effects' convention.
// Adapted from Card-Forge/forge (n/nether_shadow.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
for (const w of ["p","o"]) {
  if (w !== ns.active) continue;
  const gy = ns[w].gy;
  const idx = gy.findIndex(x => x.id === "nether_shadow");
  if (idx >= 0 && gy.slice(idx + 1).filter(isCre).length >= 3) {
    const card = gy[idx];
    const ts = (ns.layerClock ?? 0) + 1;
    const onBf = { ...card, controller: w, tapped: false, summoningSick: !hasKw(card, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, counters: {}, enterTs: ts };
    ns = { ...ns, layerClock: ts, [w]: { ...ns[w], gy: ns[w].gy.filter((_, i) => i !== idx), bf: [...ns[w].bf, onBf] } };
    ns = dlog(ns, "Nether Shadow returns to the battlefield.", "effect");
    // CR 704.5j: this ETB doesn't route through zMove or RESOLVE_STACK (it
    // places the card straight from gy to bf inline, upkeep-only), so it's
    // not covered by either of those centralized checks -- thread explicitly.
    ns = checkLegendRule(ns);
  }
}
if (ns.fogActive) ns = { ...ns, fogActive: false };
}

if (next === PHASE.DRAW) {
// Nafs Asp: "...that player loses 1 life at the beginning of their next draw
// step unless they pay {1} before that draw step." SIMPLIFICATION: auto-pays
// when affordable (same convention as other such "unless you pay" effects).
// Adapted from Card-Forge/forge (n/nafs_asp.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
if (ns[ns.active].pendingDrainAtNextDraw > 0) {
  const n = ns[ns.active].pendingDrainAtNextDraw;
  for (let i = 0; i < n; i++) {
    if (canPay(ns[ns.active].mana, "1")) {
      ns = { ...ns, [ns.active]: { ...ns[ns.active], mana: payMana(ns[ns.active].mana, "1") } };
    } else {
      ns = hurt(ns, ns.active, 1, "Nafs Asp");
    }
  }
  ns = { ...ns, [ns.active]: { ...ns[ns.active], pendingDrainAtNextDraw: 0 } };
}
if (!(ns.turn === 1 && !ns.ruleset.drawOnFirstTurn && ns.active === "p")) {
  // Island Sanctuary: "If you would draw a card during your draw step, instead
  // you may skip that draw. If you do, until your next turn, you can't be
  // attacked except by creatures with flying and/or islandwalk."
  // SIMPLIFICATION: always skips when in play -- no "decline to skip" UI exists
  // (same convention as other "may" upkeep effects elsewhere in this file);
  // skipping is virtually always the correct line while Island Sanctuary is out.
  // Adapted from Card-Forge/forge (i/island_sanctuary.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (ns[ns.active].bf.some(c => c.name === "Island Sanctuary")) {
    ns = { ...ns, [ns.active]: { ...ns[ns.active], islandSanctuaryProtected: true } };
    ns = dlog(ns, `${ns.active} skips their draw (Island Sanctuary) -- protected until their next turn.`, "effect");
  } else if (ns[ns.active].bf.some(c => c.name === "Fasting")) {
    // Fasting: "If you would begin your draw step, you may skip that step
    // instead. If you do, you gain 2 life." Same "always skips when in play"
    // SIMPLIFICATION as Island Sanctuary above -- skipping a draw to gain 2
    // life is virtually always at least as good as drawing while Fasting is
    // out. Skipping the draw entirely means the "when you draw a card,
    // destroy this enchantment" trigger (see performDraws) never fires here.
    ns = hurt(ns, ns.active, -2, "Fasting");
    ns = dlog(ns, `${ns.active} skips their draw (Fasting) -- gains 2 life.`, "effect");
  } else {
    ns = drawD(ns, ns.active);
    // SBE: check deck-out
    const drawWin = checkWinConditions(ns);
    if (drawWin && !ns.over) ns = { ...ns, over: { winner: drawWin.winner, reason: drawWin.reason } };
  }
}
}

if (next === PHASE.CLEANUP) {
// Ghost-state tripwire: lamp pick or river division should never reach CLEANUP.
if (ns.pendingLampPicks?.length) {
  console.error('[DuelCore] CLEANUP: lamp pick still pending -- force clearing');
  ns = { ...ns, pendingLampPicks: [] };
}
if (ns.pendingMarufPicks?.length) {
  console.error('[DuelCore] CLEANUP: maruf pick still pending -- force clearing');
  ns = { ...ns, pendingMarufPicks: [] };
}
if (ns.pendingRiverDivide || ns.pendingRiverSides) {
  console.error('[DuelCore] CLEANUP: river division/siding still pending -- force clearing');
  ns = { ...ns, pendingRiverDivide: null, pendingRiverSides: null };
}
ns = { ...ns, manaTapSnapshot: null, additionalCostSnapshot: null, turnState: { ...ns.turnState, damageLog: [], damageTakenThisTurn: {}, damageBySourceType: {}, damageShields: { p: [], o: [] }, creatureDamageShields: {}, landDestructionShields: {}, creaturesDiedThisTurn: [], sacrificedIids: [], activatedOnceIids: [], activationCounts: {} } };
const ac = ns.active;
// Library of Leng: "You have no maximum hand size." See docs/MECHANICS_INDEX.md.
const effectiveMax = ns[ac].bf.some(c => c.id === 'library_of_leng') ? Infinity : ns.ruleset.maxHandSize;
// AI ('o') keeps the auto-discard (planEnd in AI.js treats this as fully
// delegated to DuelCore). The human ('p') instead gets a pendingCleanupDiscard
// prompt -- see docs/SYSTEMS.md Section 29 -- so ADVANCE_PHASE stalls at
// CLEANUP until RESOLVE_CLEANUP_DISCARD supplies which cards to lose.
if (ac === 'o') {
while (ns[ac].hand.length > effectiveMax) {
const disc = ns[ac].hand[ns[ac].hand.length - 1];
ns = discardCard(ns, ac, disc.iid, { cause: 'gameRule' });
}
} else {
const overBy = ns.p.hand.length - effectiveMax;
if (overBy > 0) ns = { ...ns, pendingCleanupDiscard: { controller: 'p', count: overBy } };
}
// Expire all EOT buffs on all permanents. SYSTEMS.md S3.1
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.eotBuffs?.length ? { ...c, eotBuffs: [] } : c) } };
}
// Emblems: endOfTurn-duration emblems expire at cleanup (Titania's Song's
// "until end of turn" tail). permanent-duration emblems (Cyclopean Tomb) are
// untouched here -- they persist for the rest of the game by design.
let emblemsExpired = false;
for (const w of ["p","o"]) {
const before = ns[w].emblems ?? [];
const after = before.filter(e => e.duration !== 'endOfTurn');
if (after.length !== before.length) emblemsExpired = true;
ns = { ...ns, [w]: { ...ns[w], emblems: after } };
}
// An expired emblem may have been the only thing keeping a permanent's baked
// typeEff/subtypeEff current (Titania's Song's emblem-sourced Creature type,
// via layers.js collectEffects 14b) -- unlike a battlefield permanent leaving
// play (which always routes through zMove's own recomputeTypeEffects call),
// removing an emblem from state.emblems is not a zone move, so it needs its
// own explicit rebake here.
if (emblemsExpired) ns = recomputeTypeEffects(ns);
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
// Clear Wall of Wonder's "can attack despite defender" flag at end of turn
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.canAttackDespiteDefender ? { ...c, canAttackDespiteDefender: false } : c) } };
}
// Clear Ydwen Efreet's "can't block this turn" flag at end of turn
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.cantBlockThisTurn ? { ...c, cantBlockThisTurn: false } : c) } };
}
// Clear Blaze of Glory's "can block any number of creatures" flag at end of turn
for (const w of ["p","o"]) {
ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.blocksAllAttackers ? { ...c, blocksAllAttackers: false } : c) } };
}
// Clear channelActive and damageShield at end of turn
for (const w of ["p","o"]) {
  if (ns[w].channelActive) ns = { ...ns, [w]: { ...ns[w], channelActive: false }};
  ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => (c.damageShield || c.preventCombatDamageDealt) ? { ...c, damageShield: 0, preventCombatDamageDealt: false } : c) } };
  // Player-level "prevent the next N damage this turn" shield (Alabaster Potion,
  // Conservator, etc.) and Forcefield's identity-scoped combat shield both expire
  // unconditionally at end of turn, whether or not they were consumed.
  if (ns[w].damageShield || ns[w].combatDamageShield) ns = { ...ns, [w]: { ...ns[w], damageShield: 0, combatDamageShield: null } };
  // Guardian Angel: clear temporary abilities granted this turn
  ns = { ...ns, [w]: { ...ns[w], tempAbilities: [] } };
  // Aladdin's Lamp / Ring of Ma'ruf: clear unused charges ("this turn" scoping)
  ns = { ...ns, [w]: { ...ns[w], lampCharges: [], marufCharges: 0 } };
}
// Siren's Call: destroy non-Wall creatures the active player didn't attack with
// this turn (creatures the effect targeted at cast time -- excludes anything
// that entered after, per oracle text's "controlled continuously" clause).
if (ns.pendingSirenSweep) {
  const { activePlayer, eligibleIids } = ns.pendingSirenSweep;
  const toDestroy = ns[activePlayer].bf.filter(c =>
    eligibleIids.includes(c.iid) && isCre(c) && !c.subtype?.includes("Wall") && !ns.turnState.attackedThisCombat.includes(c.iid)
  );
  for (const c of toDestroy) ns = zMove(ns, c.iid, activePlayer, activePlayer, "gy");
  if (toDestroy.length) ns = dlog(ns, `Siren's Call: destroys ${toDestroy.length} creature(s) that didn't attack.`, "effect");
  ns = { ...ns, pendingSirenSweep: null };
}
// Season of the Witch: "At the beginning of the end step, destroy all
// untapped creatures that didn't attack this turn, except for creatures that
// couldn't attack." Same placement/shape as Siren's Call's sweep above (this
// engine settles combat-derived state like turnState.attackedThisCombat by
// the time CLEANUP runs). SIMPLIFICATION: "couldn't attack" is limited to
// summoning sickness and Wall subtype (the two most common real causes), not
// every possible static "can't attack" effect (Moat, Brainwash, ...).
if ([...ns.p.bf, ...ns.o.bf].some(x => x.name === "Season of the Witch")) {
  for (const w2 of ['p', 'o']) {
    const toDestroySotw = ns[w2].bf.filter(c =>
      isCre(c) && !c.tapped && !c.summoningSick && !c.subtype?.includes("Wall") && !ns.turnState.attackedThisCombat.includes(c.iid)
    );
    for (const c of toDestroySotw) ns = zMove(ns, c.iid, w2, w2, "gy");
    if (toDestroySotw.length) ns = dlog(ns, `Season of the Witch destroys ${toDestroySotw.length} creature(s) that didn't attack.`, "effect");
  }
}
// Pestilence: at the beginning of the end step, if no creatures are on the
// battlefield (either side, any color), its controller sacrifices it.
const anyCreatures = [...ns.p.bf, ...ns.o.bf].some(c => isCre(c));
if (!anyCreatures) {
  for (const w of ["p","o"]) {
    for (const pest of [...ns[w].bf].filter(x => x.id === "pestilence")) {
      ns = zMove(ns, pest.iid, w, w, "gy");
      ns = dlog(ns, "Pestilence: no creatures on the battlefield -- sacrificed.", "effect");
    }
    // Drop of Honey: "When there are no creatures on the battlefield, sacrifice
    // this enchantment." Same condition as Pestilence above.
    // Adapted from Card-Forge/forge (d/drop_of_honey.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    for (const doh of [...ns[w].bf].filter(x => x.id === "drop_of_honey")) {
      ns = zMove(ns, doh.iid, w, w, "gy");
      ns = dlog(ns, "Drop of Honey: no creatures on the battlefield -- sacrificed.", "effect");
    }
  }
}
// Goblins of the Flarg: "When you control a Dwarf, sacrifice this creature."
// SIMPLIFICATION: no generic "whenever a condition becomes true" watcher exists;
// checked once per end step rather than the instant it becomes true.
// Adapted from Card-Forge/forge (g/goblins_of_the_flarg.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
for (const w of ["p","o"]) {
  for (const g of [...ns[w].bf].filter(x => x.id === "goblins_of_the_flarg")) {
    if (ns[w].bf.some(x => x.iid !== g.iid && x.subtype?.includes("Dwarf"))) {
      ns = zMove(ns, g.iid, w, w, "gy");
      ns = dlog(ns, "Goblins of the Flarg: sacrificed (controls a Dwarf).", "effect");
    }
  }
}
// Merchant Ship / Island Fish Jasconius / Leviathan: "When you control no
// Islands, sacrifice this creature." Same SIMPLIFICATION as above.
// Adapted from Card-Forge/forge (m/merchant_ship.txt, i/island_fish_jasconius.txt,
// l/leviathan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
for (const w of ["p","o"]) {
  for (const c of [...ns[w].bf].filter(x => x.sacrificeIfNoIslands)) {
    if (!ns[w].bf.some(x => isLand(x) && x.subtype?.includes("Island"))) {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, `${c.name}: sacrificed (controls no Islands).`, "effect");
    }
  }
}
// Serendib Djinn: "When you control no lands, sacrifice this creature."
// Parallel to the Merchant Ship/Island Fish Jasconius/Leviathan
// sacrificeIfNoIslands loop above (same SIMPLIFICATION -- checked once per
// end step), but keyed on lands generally instead of Islands specifically --
// a separate flag (sacrificeIfNoLands) rather than overloading
// sacrificeIfNoIslands for two different conditions.
// Adapted from Card-Forge/forge (s/serendib_djinn.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
for (const w of ["p","o"]) {
  for (const c of [...ns[w].bf].filter(x => x.sacrificeIfNoLands)) {
    if (!ns[w].bf.some(isLand)) {
      ns = zMove(ns, c.iid, w, w, "gy");
      ns = dlog(ns, `${c.name}: sacrificed (controls no lands).`, "effect");
    }
  }
}
// Jihad: "When the chosen player controls no nontoken permanents of the chosen
// color, sacrifice this enchantment." No token tracking exists in this engine
// (every permanent is treated as nontoken, matching the existing Beasts of
// Bogardan SIMPLIFICATION in layers.js).
// Adapted from Card-Forge/forge (j/jihad.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
for (const w of ["p","o"]) {
  for (const j of [...ns[w].bf].filter(x => x.id === "jihad" && x.chosenColor && x.chosenPlayer)) {
    if (!ns[j.chosenPlayer].bf.some(x => x.color === j.chosenColor)) {
      ns = zMove(ns, j.iid, w, w, "gy");
      ns = dlog(ns, "Jihad: sacrificed (chosen player controls no permanent of the chosen color).", "effect");
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
  // ON_ATTACKS_DECLARED: restricts a "whenever this creature attacks" ability to
  // firing only for the card that is itself among the declared attackers.
  // Cave People, Hasran Ogress.
  if (condition.type === 'selfIsAttacker') {
    return !!payload.attackerIids?.includes(card.iid);
  }
  // ON_DAMAGE_DEALT: restricts a "whenever this creature deals damage" ability
  // to firing only for the card that was itself the damage source. scope:'self'
  // can't be reused here -- it's derived from ON_CREATURE_DIES's dyingCardId
  // specifically, so any other event type needs an explicit condition instead.
  // El-Hajjâj.
  if (condition.type === 'selfIsDamageSource') {
    return payload.sourceId === card.iid;
  }
  // ON_DAMAGE_DEALT: restricts a "whenever this creature deals damage to a
  // player" ability to firing only when the damage target was a player, not a
  // creature. Marsh Viper, Pit Scorpion, Serpent Generator's Snake token.
  if (condition.type === 'selfIsDamageSourceToPlayer') {
    return payload.sourceId === card.iid && (payload.targetId === 'p' || payload.targetId === 'o');
  }
  // ON_PLAYER_DAMAGED: restricts a "whenever this deals damage to a player"
  // ability to firing only for the permanent that was itself the damage
  // source (meta.sourceIid on hurt()'s emitted payload). The Fallen.
  if (condition.type === 'selfIsPlayerDamageSource') {
    return payload.sourceIid === card.iid;
  }
  // ON_PERMANENT_LEAVES_BF: "put into a graveyard" -- Dingus Egg.
  if (condition.type === 'permanentWasLand') {
    return !!payload.wasLand && payload.destination === 'gy';
  }
  // ON_PERMANENT_LEAVES_BF: restricts to the "...from the battlefield" case
  // being a destroy/sacrifice (destination gy), not a bounce/exile. Lich.
  if (condition.type === 'destinationIsGY') {
    return payload.destination === 'gy';
  }
  // ON_PERMANENT_LEAVES_BF: "an artifact you control is put into a graveyard" -- Tablet of Epityr.
  if (condition.type === 'ownArtifactLeftBf') {
    return !!payload.wasArtifact && payload.previousController === card.controller && payload.destination === 'gy';
  }
  // ON_PERMANENT_LEAVES_BF: "an artifact you control ... if it wasn't sacrificed" -- Urza's Miter.
  if (condition.type === 'ownArtifactDiedNotSacrificed') {
    return !!payload.wasArtifact
      && payload.previousController === card.controller
      && payload.destination === 'gy'
      && !(state.turnState.sacrificedIids || []).includes(payload.cardIid);
  }
  // ON_SPELL_CAST: "a player casts a spell of color X" -- Throne of Bone (black).
  if (condition.type === 'spellColorIncludes') {
    return !!payload.colors?.includes(condition.color);
  }
  // ON_SPELL_CAST: "a player casts an artifact spell" -- Urza's Chalice.
  if (condition.type === 'spellIsArtifact') {
    return !!payload.isArtifact;
  }
  // ON_SPELL_CAST: "an opponent casts an artifact spell" -- Citanul Druid.
  if (condition.type === 'opponentCastArtifactSpell') {
    return !!payload.isArtifact && payload.casterId !== card.controller;
  }
  // ON_PLAYER_DAMAGED: "whenever you're dealt damage" -- Living Artifact.
  // Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (condition.type === 'auraControllerWasDamaged') {
    return payload.who === card.controller;
  }
  // ON_END_STEP: "if this ability has been activated four or more times this
  // turn" -- Nalathni Dragon. turnState.activationCounts is incremented by
  // nalathniDragonPump (see resolveEff) and reset to {} at CLEANUP.
  // Adapted from Card-Forge/forge (n/nalathni_dragon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (condition.type === 'activationCountAtLeast') {
    return (state.turnState.activationCounts?.[card.iid] || 0) >= (condition.amount ?? 0);
  }
  // ON_TAP: restricts an Aura's "whenever enchanted permanent becomes tapped"
  // ability to firing only when ITS OWN specific host (not any other permanent
  // of the same type) is the one that tapped. Works for both enchantedArtifactIid
  // and enchantedLandIid Kudzu-style host references. Relic Bind, Blight,
  // Psychic Venom.
  if (condition.type === 'enchantedHostTapped') {
    const hostIid = card.enchantedArtifactIid ?? card.enchantedLandIid;
    return !!hostIid && payload.cardId === hostIid;
  }
  // ON_TAP / ON_ABILITY_ACTIVATED_NO_TAP: restricts a "whenever an artifact..."
  // ability to firing only when the affected permanent is actually an artifact.
  // Haunting Wind.
  if (condition.type === 'affectedPermanentIsArtifact') {
    const target = state[payload.controller]?.bf.find(c => c.iid === payload.cardId);
    return !!target && isArt(target);
  }
  // Same as above, additionally restricted to an artifact controlled by an
  // opponent of THIS card's controller. Powerleech.
  if (condition.type === 'affectedPermanentIsOpponentArtifact') {
    const target = state[payload.controller]?.bf.find(c => c.iid === payload.cardId);
    return !!target && isArt(target) && payload.controller !== card.controller;
  }
  return true; // unknown conditions pass by default; add stricter handling as needed
}

// Leaves-the-battlefield events (ON_CREATURE_DIES): checkDeath moves the dying
// card to the graveyard/exile *before* calling emitEvent, so by the time this
// runs the source card is no longer on the battlefield. Find it there using
// last-known information (CR 603.6d) so self-scoped "when this dies" triggers
// (Abu Ja'far, Cyclopean Mummy, Onulet, etc.) can still fire.
function findLeftBattlefieldCard(state, iid) {
  for (const who of ['p', 'o']) {
    const found = state[who].gy.find(c => c.iid === iid) || state[who].exile.find(c => c.iid === iid);
    if (found) return found;
  }
  return null;
}

function emitEvent(state, event) {
  const newTriggers = [];
  const allPlayers = ['p', 'o'];
  let ts = Date.now(); // tie-breaking integer only, not for timing

  // dyingCardId: the card (if any) that just left the battlefield as part of
  // this event, so self-scoped triggers on IT can still fire even though it's
  // no longer in state[who].bf by the time this runs. Originally
  // ON_CREATURE_DIES-only (Abu Ja'far etc.); extended to ON_PERMANENT_LEAVES_BF
  // for Lich's "when this is put into a graveyard, you lose the game" --
  // same shape, different event/payload field name.
  const dyingCardId = event.type === 'ON_CREATURE_DIES' ? event.payload?.cardId
                     : event.type === 'ON_PERMANENT_LEAVES_BF' ? event.payload?.cardIid
                     : null;
  const dyingCard = dyingCardId ? findLeftBattlefieldCard(state, dyingCardId) : null;

  for (const who of allPlayers) {
    for (const card of state[who].bf) {
      if (!card.triggeredAbilities) continue;
      for (const ability of card.triggeredAbilities) {
        if (ability.trigger.event !== event.type) continue;
        if (ability.trigger.scope === 'self' && card.iid !== dyingCardId) continue;
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

  // Self-scoped death triggers on the dying card itself -- it's already off
  // the battlefield, so the loop above never sees it.
  if (dyingCard?.triggeredAbilities) {
    for (const ability of dyingCard.triggeredAbilities) {
      if (ability.trigger.event !== event.type) continue;
      if (ability.trigger.scope !== 'self') continue;
      if (ability.condition && !evaluateCondition(state, dyingCard, ability.condition, event.payload)) continue;
      newTriggers.push({
        triggerId: ability.id,
        sourceCardId: dyingCard.iid,
        controller: dyingCard.controller,
        eventPayload: event.payload,
        timestamp: ts++,
      });
    }
  }

  // Emblem-sourced triggered abilities (Titania's Song / Cyclopean Tomb after
  // their source leaves the battlefield -- see docs/MECHANICS_INDEX.md). No
  // scope:'self' handling needed here -- emblems are never the direct object
  // of an event the way a dying permanent is, so only 'controller'-scoped and
  // unscoped triggers are relevant.
  for (const who of allPlayers) {
    for (const emblem of state[who]?.emblems ?? []) {
      if (!emblem.triggeredAbilities) continue;
      for (const ability of emblem.triggeredAbilities) {
        if (ability.trigger.event !== event.type) continue;
        if (ability.trigger.scope === 'controller' && emblem.controller !== event.payload?.activePlayer) continue;
        if (ability.condition && !evaluateCondition(state, emblem, ability.condition, event.payload)) continue;
        newTriggers.push({
          triggerId: ability.id,
          sourceCardId: emblem.id,
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

// Shared snapshot-and-exile helper for the Tawnos's Coffin exile machinery
// (and Oubliette's one-shot phase-out, which reuses it with suppressed leave
// events). zMove unconditionally strips counters and cascades embedded Auras
// to their controller's graveyard whenever a permanent leaves the battlefield
// (S10) -- neither of which these cards want -- so the snapshot happens
// BEFORE zMove is called. Returns the post-exile state plus the tracking
// fields the caller writes onto its own source permanent. The
// suppressLeaveEvent option is threaded into EVERY zMove performed here (the
// creature's and each Kudzu-style aura's): Tawnos's Coffin calls with the
// default (false -- its exile leg keeps emitting ON_PERMANENT_LEAVES_BF,
// byte-identical to shipped behavior); Oubliette passes true (phasing fires
// no leave triggers). See docs/ENGINE_CONTRACT_SPEC.md.
function snapshotAndExileCreature(state, tgtC, { suppressLeaveEvent = false } = {}) {
  const tgtOwner = tgtC.controller;
  const counters = { ...tgtC.counters };
  const embeddedAuras = (tgtC.enchantments || []).map(aura => ({ kind: 'embedded', record: { ...aura } }));
  const kudzuAuras = [...state.p.bf, ...state.o.bf]
    .filter(c => c.enchantedCreatureIid === tgtC.iid)
    .map(c => ({ kind: 'kudzu', iid: c.iid, controller: c.controller }));
  const auraRecords = [...embeddedAuras, ...kudzuAuras];

  // Strip enchantments before zMove so its cascade-to-graveyard block has
  // nothing left to cascade -- the data is already captured above.
  let ns = { ...state, [tgtOwner]: { ...state[tgtOwner], bf: state[tgtOwner].bf.map(c =>
    c.iid === tgtC.iid ? { ...c, enchantments: [] } : c
  ) } };
  ns = zMove(ns, tgtC.iid, tgtOwner, tgtOwner, "exile", { suppressLeaveEvent });
  for (const rec of kudzuAuras) {
    ns = zMove(ns, rec.iid, rec.controller, rec.controller, "exile", { suppressLeaveEvent });
  }
  return { state: ns, tracking: {
    exiledCreatureIid: tgtC.iid,
    exiledCreatureOwner: tgtOwner,
    exiledCreatureCounters: counters,
    exiledAuraRecords: auraRecords,
  } };
}

// Takklemaggot: "When enchanted creature dies, that creature's controller
// chooses a creature that this card could enchant. If the player does,
// return this card to the battlefield under your control attached to that
// creature. If they don't, return this card to the battlefield under your
// control as a non-Aura enchantment..." Called from zMove's aura-cascade once
// the generic "falls off into its controller's graveyard" step has already
// run. Presents a pendingChoice (kind: 'takklemaggotReattachChoice') to the
// dying creature's controller, same "created directly, not a triggered
// ability" convention as Alchor's Tomb's colorChoice -- Takklemaggot itself
// has no triggeredAbilities entry to hang this off of, since as an embedded
// enchantments[] record it isn't a top-level battlefield permanent the
// emitEvent/triggeredAbilities scan would ever find.
// deadCreatureController: fw from the zMove call -- the player who controlled
// the creature that just died (makes the choice, and is the eventual pinger
// target if they decline). auraRecord: the embedded enchantments[] record
// (name/mod/controller/cardData) captured before it fell off.
function takklemaggotDeathTrigger(state, deadCreatureController, auraRecord) {
  const eligible = [...state.p.bf, ...state.o.bf].filter(isCre);
  const options = [
    { id: 'NONE', label: "Don't reattach (Takklemaggot becomes a pinger)" },
    ...eligible.map(c => ({ id: c.iid, label: c.name })),
  ];
  return createPendingChoice(state, {
    sourceCardId: auraRecord.iid,
    controller: deadCreatureController,
    kind: 'takklemaggotReattachChoice',
    options,
    originalController: auraRecord.controller,
    cardData: auraRecord.cardData,
    victimController: deadCreatureController,
  });
}

// Tawnos's Coffin: shared exile-return resolver. Called from three sites --
// the ON_PERMANENT_LEAVES_BF triggered ability ('tawnosCoffinReturn' case
// below), and the two untap-detection insertion points (untap-step map,
// optionalUntap choice handler) in the UNTAP phase block above. sourceCard is
// Tawnos's Coffin itself: either still live on the battlefield (untap path)
// or already departed (findLeftBattlefieldCard, leaves-bf path) -- either way
// it still carries the exiledCreatureIid/exiledCreatureOwner/
// exiledCreatureCounters/exiledAuraRecords fields set by tawnosCoffinExile.
// See docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return.
// opts.phasing (Oubliette's 'oubliettePhaseIn'): the creature phases in
// rather than returning -- it additionally gets summoningSick: false (a
// phased-in permanent was never gone for sickness purposes, CR 702.26) and
// the log verb becomes "phases in". The default wording and behavior are
// byte-identical to shipped Tawnos's Coffin.
function tawnosCoffinReturn(state, sourceCard, opts = {}) {
  if (!sourceCard.exiledCreatureIid) return state;
  const owner = sourceCard.exiledCreatureOwner;
  const exiled = state[owner].exile.find(c => c.iid === sourceCard.exiledCreatureIid);
  if (!exiled) {
    return dlog(state, `${sourceCard.name}: the exiled creature is no longer in exile.`, "effect");
  }
  const counters = sourceCard.exiledCreatureCounters || {};
  const auraRecords = sourceCard.exiledAuraRecords || [];
  const embeddedAuras = auraRecords.filter(r => r.kind === 'embedded').map(r => r.record);

  let ns = zMove(state, sourceCard.exiledCreatureIid, owner, owner, "bf");
  ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c =>
    c.iid === sourceCard.exiledCreatureIid
      ? { ...c, tapped: true, counters: { ...counters }, enchantments: embeddedAuras, ...(opts.phasing ? { summoningSick: false } : {}) }
      : c
  ) } };
  const returned = ns[owner].bf.find(c => c.iid === sourceCard.exiledCreatureIid);
  ns = dlog(ns, opts.phasing
    ? `${returned?.name ?? exiled.name} phases in tapped${embeddedAuras.length ? " with its Auras" : ""}.`
    : `${returned?.name ?? exiled.name} returns to the battlefield tapped${embeddedAuras.length ? " with its Auras" : ""}.`, "effect");

  for (const rec of auraRecords) {
    if (rec.kind === 'kudzu') {
      ns = zMove(ns, rec.iid, rec.controller, rec.controller, "bf");
      ns = { ...ns, [rec.controller]: { ...ns[rec.controller], bf: ns[rec.controller].bf.map(c =>
        c.iid === rec.iid ? { ...c, enchantedCreatureIid: sourceCard.exiledCreatureIid } : c
      ) } };
    }
  }

  // Clear Tawnos's Coffin's own tracking fields, if it's still on the
  // battlefield (the untap-detection path). If it already left the
  // battlefield (the ON_PERMANENT_LEAVES_BF path), there's nothing to clear
  // -- its tracking fields simply stop mattering once it's gone.
  for (const w of ['p', 'o']) {
    if (ns[w].bf.some(c => c.iid === sourceCard.iid)) {
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c =>
        c.iid === sourceCard.iid
          ? { ...c, exiledCreatureIid: undefined, exiledCreatureOwner: undefined, exiledCreatureCounters: undefined, exiledAuraRecords: undefined }
          : c
      ) } };
    }
  }
  // CR 704.5j: single insertion point covering all 3 call sites that share
  // this helper (UNTAP-phase untap detection, the 'tawnosCoffinReturn' and
  // 'oubliettePhaseIn' resolveTriggeredEffect cases below) -- the returned/
  // phased-in creature (and any returned Kudzu-style aura) could collide with
  // a same-named legendary permanent played while it was away.
  return checkLegendRule(ns);
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
    // Abu Ja'far: destroys creatures blocking or blocked by it (payload captured
    // pre-zMove in checkDeath, since the dying card's own fields are cleared by
    // the time this trigger resolves). No regeneration check -- direct zMove.
    // Adapted from Card-Forge/forge (a/abu_jafar.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'destroyCombatPartners': {
      const ids = [...(payload.blockedByIds || []), ...(payload.blockingId ? [payload.blockingId] : [])];
      let s = state;
      for (const id of ids) {
        const c = getBF(s, id);
        if (c) s = zMove(s, id, c.controller, c.controller, 'gy');
      }
      if (ids.length) s = dlog(s, `${sourceCard.name}: destroys creatures blocking or blocked by it.`, 'effect');
      return s;
    }
    // Cyclopean Mummy: moves itself from graveyard to exile after dying.
    // Adapted from Card-Forge/forge (c/cyclopean_mummy.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'exileSelfFromGY': {
      const who = sourceCard.controller;
      const inGY = state[who].gy.find(c => c.iid === sourceCard.iid);
      if (!inGY) return state;
      const s = { ...state, [who]: { ...state[who], gy: state[who].gy.filter(c => c.iid !== sourceCard.iid), exile: [...(state[who].exile || []), inGY] } };
      return dlog(s, `${sourceCard.name} is exiled.`, 'effect');
    }
    // Ghazbán Ogre: control changes to whichever player has strictly more life
    // than the other (2-player simplification of "more than each other player").
    // Adapted from Card-Forge/forge (g/ghazban_ogre.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'controlToHighestLife': {
      if (state.p.life === state.o.life) return state;
      const winner = state.p.life > state.o.life ? 'p' : 'o';
      if (sourceCard.controller === winner) return state;
      const origCtrl = sourceCard.controller;
      const current = getBF(state, sourceCard.iid);
      if (!current) return state;
      let s = { ...state, [origCtrl]: { ...state[origCtrl], bf: state[origCtrl].bf.filter(c => c.iid !== sourceCard.iid) } };
      const stolen = { ...current, controller: winner, summoningSick: true, tapped: false, attacking: false, blocking: null };
      s = { ...s, [winner]: { ...s[winner], bf: [...s[winner].bf, stolen] } };
      s = dlog(s, `${sourceCard.name}: control changes to ${winner} (most life).`, 'effect');
      // CR 704.5j: this control-change is triggered-ability-driven, not routed
      // through RESOLVE_STACK's post-resolveEff check -- thread explicitly.
      return checkLegendRule(s);
    }
    // Onulet: gains its controller a fixed amount of life on death.
    // Adapted from Card-Forge/forge (o/onulet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'gainLifeController': {
      const who = sourceCard.controller;
      return hurt(state, who, -effect.amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: inferSourceType(sourceCard) });
    }
    // Soul Net: optional-cost trigger, resolved via the RESOLVE_CHOICE/pendingChoice
    // pipeline (options presented through the existing ChoiceModal UI).
    // Adapted from Card-Forge/forge (s/soul_net.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'payGenericGainLife': {
      const who = sourceCard.controller;
      const totalMana = Object.values(state[who].mana).reduce((a, b) => a + b, 0);
      if (totalMana < effect.cost) return dlog(state, `${sourceCard.name}: not enough mana to pay.`, 'effect');
      const paid = payMana(state[who].mana, String(effect.cost));
      const s = { ...state, [who]: { ...state[who], mana: paid } };
      return hurt(s, who, -effect.amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: inferSourceType(sourceCard) });
    }
    case 'noop':
      return state;
    // Cave People: "Whenever this creature attacks, it gets +1/-2 until end of turn."
    // Adapted from Card-Forge/forge (c/cave_people.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'pumpSelfEOT': {
      const who = sourceCard.controller;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid
          ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: effect.power || 0, toughness: effect.toughness || 0 }] }
          : c
      ) } };
      return dlog(s, `${sourceCard.name} gets ${effect.power >= 0 ? '+' : ''}${effect.power}/${effect.toughness >= 0 ? '+' : ''}${effect.toughness} until end of turn.`, 'effect');
    }
    // Hasran Ogress: "unless you pay {2}" -- the pay branch (no further effect).
    // Adapted from Card-Forge/forge (h/hasran_ogress.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'payGenericNoEffect': {
      const who = sourceCard.controller;
      const totalMana = Object.values(state[who].mana).reduce((a, b) => a + b, 0);
      if (totalMana < effect.cost) return dlog(state, `${sourceCard.name}: not enough mana to pay.`, 'effect');
      const paid = payMana(state[who].mana, String(effect.cost));
      return dlog({ ...state, [who]: { ...state[who], mana: paid } }, `${sourceCard.name}: paid {${effect.cost}}.`, 'effect');
    }
    // Hasran Ogress: "unless you pay {2}" -- the decline branch (fixed damage,
    // routed through hurt() so it's tagged as creature-source combat-trigger damage).
    // Adapted from Card-Forge/forge (h/hasran_ogress.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'dealFixedDamageToController': {
      const who = sourceCard.controller;
      return hurt(state, who, effect.amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'creature', combat: false });
    }
    // Dingus Egg: deals damage to the controller of the land that just died.
    // Routed through hurt() with an artifact-source meta tag so it's counted by
    // Reverse Polarity and eligible for Martyrs of Korlis redirection.
    // Adapted from Card-Forge/forge (d/dingus_egg.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'damagePermanentControllerFromArtifact': {
      const who = payload.previousController;
      if (!who) return state;
      return hurt(state, who, effect.amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'artifact', combat: false });
    }
    // Khabál Ghoul: "put a +1/+1 counter for each creature that died this turn."
    // Adapted from Card-Forge/forge (k/khabal_ghoul.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'addCounterEqualToCreatureDeaths': {
      const who = sourceCard.controller;
      const amount = (state.turnState.creaturesDiedThisTurn || []).length;
      if (amount === 0) return state;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid ? { ...c, counters: { ...c.counters, P1P1: (c.counters?.P1P1 || 0) + amount } } : c
      ) } };
      return dlog(s, `${sourceCard.name} gets ${amount} +1/+1 counter${amount === 1 ? '' : 's'} (creatures died this turn).`, 'effect');
    }
    // Living Artifact: "put that many vitality counters on this Aura" -- amount
    // comes from the ON_PLAYER_DAMAGED payload, not a computed board count.
    // Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'addVitalityCounters': {
      const who = sourceCard.controller;
      const amount = payload.amount || 0;
      if (amount <= 0) return state;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid ? { ...c, counters: { ...c.counters, VITALITY: (c.counters?.VITALITY || 0) + amount } } : c
      ) } };
      return dlog(s, `${sourceCard.name} gets ${amount} vitality counter${amount === 1 ? '' : 's'}.`, 'effect');
    }
    // Blight: "When enchanted land becomes tapped, destroy it." A ONE-TIME trigger
    // (unlike Relic Bind/Psychic Venom's "whenever") -- destroying the host also
    // removes Blight itself as a state-based consequence (an Aura with no legal
    // host), so no explicit cleanup of Blight is needed here; the existing
    // SBA/enchantment-cleanup sweep handles it.
    // Adapted from Card-Forge/forge (b/blight.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'blightDestroyHost': {
      const hostIid = sourceCard.enchantedLandIid;
      const hostOwner = ['p','o'].find(w => state[w].bf.some(c => c.iid === hostIid));
      if (!hostOwner) return state;
      return destroyLand(state, hostIid, "", { message: "Blight destroys the enchanted land." });
    }
    // Psychic Venom: "Whenever enchanted land becomes tapped, this Aura deals
    // 2 damage to that land's controller."
    // Adapted from Card-Forge/forge (p/psychic_venom.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'psychicVenomDamage': {
      const hostIid = sourceCard.enchantedLandIid;
      const hostOwner = ['p','o'].find(w => state[w].bf.some(c => c.iid === hostIid));
      if (!hostOwner) return state;
      const s = hurt(state, hostOwner, 2, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Psychic Venom deals 2 damage to ${hostOwner === 'p' ? 'you' : 'opponent'}.`, 'damage');
    }
    // Relic Bind: "Whenever enchanted artifact becomes tapped, choose one --
    // deal 1 damage to target player, or target player gains 1 life." No
    // planeswalkers implemented in this engine (scope-appropriate simplification
    // of "target player or planeswalker" -- see docs/SYSTEMS.md).
    // SIMPLIFICATION: "target player" has no further target-selection step here
    // -- this engine's triggered-ability infrastructure (requiresChoice: a fixed
    // options list resolved immediately from the event payload; requiresTarget:
    // a battlefield-permanent picker only) does not compose a "pick a mode, then
    // pick a player" flow, and building a parallel targeting mechanism for this
    // one card was explicitly out of scope for this pass. Following the same
    // 2-player convention already used by Jihad/The Rack/Black Vise (hardcoded
    // "opponent of controller" rather than a live picker), the damage mode
    // targets the artifact's controller (always Relic Bind's controller's
    // opponent, since Relic Bind can only enchant an opponent's artifact) and
    // the lifegain mode targets Relic Bind's own controller.
    // Adapted from Card-Forge/forge (r/relic_bind.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'relicBindDamage': {
      const hostIid = sourceCard.enchantedArtifactIid;
      const hostOwner = ['p','o'].find(w => state[w].bf.some(c => c.iid === hostIid));
      if (!hostOwner) return state;
      const s = hurt(state, hostOwner, 1, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Relic Bind deals 1 damage to ${hostOwner === 'p' ? 'you' : 'opponent'}.`, 'damage');
    }
    case 'relicBindLifegain': {
      const who = sourceCard.controller;
      const s = hurt(state, who, -1, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Relic Bind: ${who} gains 1 life.`, 'effect');
    }
    // Artifact Possession: "Whenever enchanted artifact becomes tapped or a
    // player activates an ability of enchanted artifact without {T} in its
    // activation cost, this Aura deals 2 damage to that artifact's
    // controller." Shared by both the ON_TAP and ON_ABILITY_ACTIVATED_NO_TAP
    // triggers (tap centralization Phase 2).
    // Adapted from Card-Forge/forge (a/artifact_possession.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'artifactPossessionDamage': {
      const hostIid = sourceCard.enchantedArtifactIid;
      const hostOwner = ['p','o'].find(w => state[w].bf.some(c => c.iid === hostIid));
      if (!hostOwner) return state;
      const s = hurt(state, hostOwner, 2, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Artifact Possession deals 2 damage to ${hostOwner === 'p' ? 'you' : 'opponent'}.`, 'damage');
    }
    // Haunting Wind: "Whenever an artifact becomes tapped or a player
    // activates an artifact's ability without {T} in its activation cost,
    // this enchantment deals 1 damage to that artifact's controller." Not
    // host-scoped (plain Enchantment, not an Aura) -- fires for ANY artifact,
    // including one controlled by Haunting Wind's own controller.
    // Adapted from Card-Forge/forge (h/haunting_wind.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'hauntingWindDamage': {
      const targetOwner = payload.controller;
      const s = hurt(state, targetOwner, 1, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Haunting Wind deals 1 damage to ${targetOwner === sourceCard.controller ? 'its controller' : "its controller's opponent"}.`, 'damage');
    }
    // Powerleech: "Whenever an artifact an opponent controls becomes tapped
    // or an opponent activates an artifact's ability without {T} in its
    // activation cost, you gain 1 life." Opponent-only, enforced by the
    // affectedPermanentIsOpponentArtifact condition, not here.
    // Adapted from Card-Forge/forge (p/powerleech.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'powerleechLifeGain': {
      const who = sourceCard.controller;
      const s = hurt(state, who, -1, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: 'enchantment' });
      return dlog(s, `Powerleech: ${who === 'p' ? 'you gain' : 'opponent gains'} 1 life.`, 'life');
    }
    // Osai Vultures: "put a carrion counter on this creature" -- ONE counter
    // per end step regardless of how many creatures died (ruling: "Only gets
    // one counter per turn, not one per creature"), unlike Khabál Ghoul/
    // Scavenging Ghoul's per-death count below.
    // Adapted from Card-Forge/forge (o/osai_vultures.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'addCarrionCounterIfDeath': {
      if (!(state.turnState.creaturesDiedThisTurn || []).length) return state;
      const who = sourceCard.controller;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid ? { ...c, counters: { ...c.counters, CARRION: (c.counters?.CARRION || 0) + 1 } } : c
      ) } };
      return dlog(s, `${sourceCard.name} gets a carrion counter.`, 'effect');
    }
    // Scavenging Ghoul: "put a corpse counter on this creature for each
    // creature that died this turn" -- same per-death shape as Khabál Ghoul's
    // addCounterEqualToCreatureDeaths above, writing CORPSE instead of P1P1.
    // Adapted from Card-Forge/forge (s/scavenging_ghoul.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'addCorpseCounterEqualToCreatureDeaths': {
      const who = sourceCard.controller;
      const amount = (state.turnState.creaturesDiedThisTurn || []).length;
      if (amount === 0) return state;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid ? { ...c, counters: { ...c.counters, CORPSE: (c.counters?.CORPSE || 0) + amount } } : c
      ) } };
      return dlog(s, `${sourceCard.name} gets ${amount} corpse counter${amount === 1 ? '' : 's'} (creatures died this turn).`, 'effect');
    }
    // Urza's Miter: optional-cost trigger that draws a card instead of gaining life.
    // Adapted from Card-Forge/forge (u/urzas_miter.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'payGenericDrawCard': {
      const who = sourceCard.controller;
      const totalMana = Object.values(state[who].mana).reduce((a, b) => a + b, 0);
      if (totalMana < effect.cost) return dlog(state, `${sourceCard.name}: not enough mana to pay.`, 'effect');
      const paid = payMana(state[who].mana, String(effect.cost));
      const s = { ...state, [who]: { ...state[who], mana: paid } };
      return drawD(s, who);
    }
    // Spiritual Sanctuary: fires for each player's upkeep, using the upkeep
    // event's activePlayer (not sourceCard.controller) as the life-gain recipient.
    // Adapted from Card-Forge/forge (s/spiritual_sanctuary.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'gainLifeIfControlsPlains': {
      const who = payload.activePlayer;
      if (!who || !state[who].bf.some(c => isLand(c) && c.subtype?.includes('Plains'))) return state;
      return hurt(state, who, -1, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: inferSourceType(sourceCard) });
    }
    // El-Hajjâj: "Whenever this creature deals damage, you gain that much life."
    // Adapted from Card-Forge/forge (e/el_hajjaj.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'gainLifeEqualToDamageDealt': {
      const amount = payload.amount ?? 0;
      if (amount <= 0) return state;
      return hurt(state, sourceCard.controller, -amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: inferSourceType(sourceCard) });
    }
    // Personal Incarnation: "When this creature dies, its owner loses half
    // their life, rounded up."
    // Adapted from Card-Forge/forge (p/personal_incarnation.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'loseHalfLifeRoundedUp': {
      const who = sourceCard.controller;
      const amount = Math.ceil(state[who].life / 2);
      return hurt(state, who, amount, sourceCard.name, { sourceIid: sourceCard.iid, sourceType: inferSourceType(sourceCard) });
    }
    // Lich: "When this enchantment is put into a graveyard from the
    // battlefield, you lose the game."
    // Adapted from Card-Forge/forge (l/lich.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'losesGameController': {
      const who = sourceCard.controller;
      return { ...state, over: { winner: who === 'p' ? 'o' : 'p', reason: `${sourceCard.name} left the battlefield` } };
    }
    // Nafs Asp: "Whenever this creature deals damage to a player, that player
    // loses 1 life at the beginning of their next draw step unless they pay
    // {1} before that draw step." Queues a counter consumed at PHASE.DRAW.
    // Adapted from Card-Forge/forge (n/nafs_asp.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'queueDrainAtNextDraw': {
      const target = payload.targetId;
      if (target !== 'p' && target !== 'o') return state;
      return { ...state, [target]: { ...state[target], pendingDrainAtNextDraw: (state[target].pendingDrainAtNextDraw || 0) + 1 } };
    }
    // Rukh Egg: "When this creature dies, create a 4/4 red Bird creature token
    // with flying at the beginning of the next end step." Queued here since
    // sourceCard is already off the battlefield; drained by PHASE.END.
    // Adapted from Card-Forge/forge (r/rukh_egg.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'queueEndStepToken': {
      return { ...state, pendingEndStepTokens: [...(state.pendingEndStepTokens || []), { tokenId: effect.tokenId, count: effect.count, controller: sourceCard.controller }] };
    }
    // The Fallen: "deals 1 damage to each opponent it has dealt damage to
    // this game." Records the damaged player onto the card instance
    // (merged, never overwritten) so theFallenUpkeep can read it back later.
    // Adapted from Card-Forge/forge (t/the_fallen.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'theFallenRecordDamage': {
      const who = sourceCard.controller;
      const target = payload.who;
      if (target !== 'p' && target !== 'o') return state;
      return { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid ? { ...c, hasDamagedPlayers: { ...c.hasDamagedPlayers, [target]: true } } : c
      ) } };
    }
    // Dance of Many: "When the token leaves the battlefield, sacrifice Dance
    // of Many." sourceCard here is the just-departed token (a token that
    // vanishes rather than being placed in gy/exile per CR 111.7, so this
    // path is only reachable while the token is still findable -- see the
    // dance_of_many orphan-check in the PHASE.UPKEEP block for the actual
    // detection of a vanished token, since a scope:'self' trigger on a
    // vanished token can never fire via findLeftBattlefieldCard). Kept here
    // only for symmetry with danceOfManyExileToken below; not currently
    // reachable given the token-vanishing limitation.
    case 'danceOfManySacrificeSource': {
      const doManyIid = sourceCard.sourceIid;
      if (!doManyIid) return state;
      const doMany = getBF(state, doManyIid);
      if (!doMany) return state;
      const who = doMany.controller;
      return zMove(state, doManyIid, who, who, 'gy');
    }
    // Dance of Many: "When Dance of Many leaves the battlefield, exile the
    // token." sourceCard here is the just-departed Dance of Many, found via
    // findLeftBattlefieldCard (a normal, non-token permanent, so this path
    // works correctly), still carrying its linkedTokenIid.
    // Adapted from Card-Forge/forge (d/dance_of_many.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'danceOfManyExileToken': {
      const tokenIid = sourceCard.linkedTokenIid;
      if (!tokenIid) return state;
      const token = getBF(state, tokenIid);
      if (!token) return state;
      const who = token.controller;
      return zMove(state, tokenIid, who, who, 'exile');
    }
    // Hazezon Tamar: "When Hazezon Tamar leaves the battlefield, exile all
    // Sand Warriors." sourceCard here is the just-departed Hazezon Tamar,
    // found via findLeftBattlefieldCard (a normal, non-token permanent).
    // Adapted from Card-Forge/forge (h/hazezon_tamar.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'hazezonTamarExileSandWarriors': {
      const who = sourceCard.controller;
      const warriors = state[who].bf.filter(x => x.isToken && x.sourceIid === sourceCard.iid);
      let s = state;
      for (const t of warriors) s = zMove(s, t.iid, who, who, 'exile');
      if (warriors.length) s = dlog(s, `${sourceCard.name} leaves the battlefield -- exiles all its Sand Warrior tokens.`, 'effect');
      return s;
    }
    // Raging River: "Whenever one or more creatures you control attack, each
    // defending player divides all creatures without flying they control into
    // 'left' and 'right' piles. Then, for each attacking creature you control,
    // choose 'left' or 'right.'"
    // Adapted from Card-Forge/forge (r/raging_river.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    // DEVIATION: only the first River trigger per combat applies (turnState.riverAppliedThisCombat latch).
    case 'ragingRiverDivide': {
      // Guard: must be the River controller's attack.
      if (payload.attackingPlayer !== sourceCard.controller) return state;
      // Guard: already applied once this combat.
      if (state.turnState.riverAppliedThisCombat) return state;
      // Guard: no pending divisions or siding yet.
      if (state.pendingRiverDivide || state.pendingRiverSides) return state;

      const defender = payload.attackingPlayer === 'p' ? 'o' : 'p';
      const nonFlyers = state[defender].bf.filter(c => !hasKw(c, KEYWORDS.FLYING.id, state));

      if (!nonFlyers.length) {
        // No non-flying defenders: all attackers get 'left' side, latch is set.
        let s = state;
        for (const aiid of s.attackers) {
          s = { ...s, [s.active]: { ...s[s.active], bf: s[s.active].bf.map(c =>
            c.iid === aiid ? { ...c, riverSide: 'left' } : c
          ) } };
        }
        s = { ...s, turnState: { ...s.turnState, riverAppliedThisCombat: true } };
        return dlog(s, `Raging River: no non-flying defenders -- all attackers sided left.`, 'effect');
      }

      // Suspend with pending division for defender to choose piles.
      return { ...state, pendingRiverDivide: { defender, nonFlyerIids: nonFlyers.map(c => c.iid), attackingPlayer: payload.attackingPlayer } };
    }
    // Marsh Viper / Pit Scorpion / Serpent Generator's Snake token: "Whenever
    // this creature deals damage to a player, that player gets N poison
    // counter(s)." A player with poisonLimit (10) or more poison counters loses.
    // Adapted from Card-Forge/forge (m/marsh_viper.txt, p/pit_scorpion.txt,
    // s/serpent_generator.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'grantPoisonCounters': {
      const target = payload.targetId;
      if (target !== 'p' && target !== 'o') return state;
      const amount = effect.amount ?? 1;
      return dlog(
        { ...state, [target]: { ...state[target], poisonCounters: (state[target].poisonCounters || 0) + amount } },
        `${sourceCard.name} gives ${target} ${amount} poison counter(s).`,
        'effect'
      );
    }
    // Nicol Bolas: "Whenever this creature deals damage to an opponent, that
    // player discards their hand." Same ON_DAMAGE_DEALT + selfIsDamageSourceToPlayer
    // generic trigger pipeline as Marsh Viper/Pit Scorpion's grantPoisonCounters
    // above; the discard-per-card loop mirrors Wheel of Fortune's (see
    // case "wheelOfFortune" in resolveEff), just with no redraw.
    case 'discardHandOnDamage': {
      const target = payload.targetId;
      if (target !== 'p' && target !== 'o') return state;
      let s = state;
      for (const hc of s[target].hand) { s = discardCard(s, target, hc.iid, { cause: 'effect', sourceName: sourceCard.name }); }
      return dlog(s, `${sourceCard.name}: ${target} discards their hand.`, 'effect');
    }
    // Vesuvan Doppelganger's upkeep re-copy. payload.tgtC is attached by the
    // RESOLVE_TRIGGER_TARGET action (see below) once the controller picks a
    // fresh target creature -- this is the first triggered ability in the
    // codebase to prompt for a battlefield target at trigger-resolution time
    // rather than from a fixed option list (see ability.requiresTarget in
    // resolveTrigger). Uses the same applyPermanentCopy helper as the ETB
    // copy and Copy Artifact; since sourceCard is already on the battlefield,
    // applyPermanentCopy takes the merge-in-place path, preserving iid,
    // counters, and battlefield state (tapped/damage/etc.) -- and, because
    // triggeredAbilities is never one of the copied fields, this ability
    // survives onto the newly-copied form automatically.
    // Adapted from Card-Forge/forge (v/vesuvan_doppelganger.txt), GPL-3.0.
    // See THIRD_PARTY_NOTICES.md.
    case 'vesuvanRecopy': {
      const tgtC = payload?.tgtC;
      if (!tgtC || !isCre(tgtC)) return dlog(state, `${sourceCard.name} fizzles -- no legal creature target.`, 'effect');
      const { state: ns, copied } = applyPermanentCopy(state, sourceCard.iid, tgtC, { colorOverride: VESUVAN_DOPPELGANGER_COLOR });
      return dlog(ns, `${sourceCard.name} becomes a copy of ${copied.name}.`, 'effect');
    }
    // Battering Ram: "at the beginning of combat on your turn, this creature
    // gains banding until end of combat." Stored as a scope:'combat' eotBuff
    // so it's stripped at PHASE.COMBAT_END rather than lingering to CLEANUP
    // (see the scope:'combat' handling there).
    // Adapted from Card-Forge/forge (b/battering_ram.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'grantBandingUntilEndOfCombat': {
      const who = sourceCard.controller;
      const s = { ...state, [who]: { ...state[who], bf: state[who].bf.map(c =>
        c.iid === sourceCard.iid
          ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [KEYWORDS.BANDING.id], scope: 'combat' }] }
          : c
      ) } };
      return dlog(s, `${sourceCard.name} gains banding until end of combat.`, 'effect');
    }
    // Nalathni Dragon: "if this ability has been activated four or more times
    // this turn, sacrifice this creature at the beginning of the next end
    // step." turnState.activationCounts is incremented by nalathniDragonPump
    // (see resolveEff) and checked by the activationCountAtLeast condition
    // below. NOTE: Dragon Whelp has the identical printed ability
    // ("{R}: +1/+0... activated four or more times...") but its cards.js
    // entry still routes through the generic pumpPower/pumpPowerEOT effect
    // with no activation counting -- a pre-existing gap, out of scope here
    // (not one of this batch's 4 cards); a future batch could point it at
    // nalathniDragonPump/this trigger instead.
    // Adapted from Card-Forge/forge (n/nalathni_dragon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'nalathniDragonSacrifice': {
      const current = getBF(state, sourceCard.iid);
      if (!current) return state;
      const who = current.controller;
      const s = zMove(state, current.iid, who, who, 'gy');
      return dlog(s, `${sourceCard.name} is sacrificed (activated four or more times this turn).`, 'effect');
    }
    // Titania's Song: "If this enchantment leaves the battlefield, this effect
    // continues until end of turn." Creates an endOfTurn emblem carrying the
    // same globalTypeEffect the card itself had while on the battlefield --
    // consumed by layers.js collectEffects step 14b.
    // Adapted from Card-Forge/forge (t/titanias_song.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'titaniasSongPersist': {
      const who = sourceCard.controller;
      const emblem = {
        id: makeId(),
        source: 'titanias_song',
        name: "Titania's Song (emblem)",
        controller: who,
        duration: 'endOfTurn',
        enterTs: Date.now(),
        globalTypeEffect: sourceCard.globalTypeEffect,
      };
      return dlog(
        { ...state, [who]: { ...state[who], emblems: [...(state[who].emblems ?? []), emblem] } },
        "Titania's Song leaves the battlefield -- its effect continues until end of turn.",
        'effect'
      );
    }
    // Tawnos's Coffin: "When this artifact leaves the battlefield or becomes
    // untapped, return that exiled card..." This is the leaves-bf half of the
    // return trigger (scope:'self' on ON_PERMANENT_LEAVES_BF); sourceCard here
    // is the just-departed Coffin, found via findLeftBattlefieldCard, still
    // carrying its exiledCreatureIid/exiledCreatureOwner/exiledCreatureCounters/
    // exiledAuraRecords tracking fields. Shared with the two untap-detection
    // insertion points via the tawnosCoffinReturn() helper above. See
    // docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return.
    case 'tawnosCoffinReturn': {
      return tawnosCoffinReturn(state, sourceCard);
    }
    // Oubliette: "target creature phases out until this enchantment leaves
    // the battlefield. Tap that creature as it phases in this way." The
    // leaves-bf half of the one-shot phasing pair ('oubliettePhaseOut' in
    // resolveEff). Delegates to the shared return helper with phasing
    // semantics: tapped, NOT summoning sick, "phases in" log wording.
    // Adapted from Card-Forge/forge (o/oubliette.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'oubliettePhaseIn': {
      return tawnosCoffinReturn(state, sourceCard, { phasing: true });
    }
    // Cyclopean Tomb: "When this artifact is put into a graveyard from the
    // battlefield, at the beginning of each of your upkeeps for the rest of
    // the game, remove all mire counters..." sourceCard here is the
    // just-departed Tomb, found via findLeftBattlefieldCard, still carrying
    // its accumulated mireLandIids.
    // Adapted from Card-Forge/forge (c/cyclopean_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'createCyclopeanTombEmblem': {
      const who = sourceCard.controller;
      const emblem = {
        id: makeId(),
        source: 'cyclopean_tomb',
        name: 'Cyclopean Tomb (emblem)',
        controller: who,
        duration: 'permanent',
        mireLandIids: sourceCard.mireLandIids || [],
        mireRemovedIids: [],
        triggeredAbilities: [{ id: 'cyclopean_tomb_emblem_upkeep', trigger: { event: 'ON_UPKEEP_START', scope: 'controller' }, effect: { type: 'cyclopeanTombRemoveMire' } }],
      };
      return dlog(
        { ...state, [who]: { ...state[who], emblems: [...(state[who].emblems ?? []), emblem] } },
        'Cyclopean Tomb is put into a graveyard -- its mire effect persists for the rest of the game.',
        'effect'
      );
    }
    // Cyclopean Tomb's persistent upkeep effect, firing from its own emblem
    // (sourceCard here is an emblem object, not a card -- found via findEmblem
    // in resolveTrigger). Picks the next mire-landed land not yet cleared by
    // this specific instance, removes all its mire counters. Once
    // mireLandIids is exhausted, this is permanently a harmless no-op --
    // matching the real card's behavior of persisting forever. recomputeTypeEffects
    // is called explicitly since this pipeline (emitEvent -> processTriggerQueue,
    // invoked from ADVANCE_PHASE's UPKEEP block) has no automatic recompute
    // afterward the way RESOLVE_STACK does.
    // Adapted from Card-Forge/forge (c/cyclopean_tomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    case 'cyclopeanTombRemoveMire': {
      const emblem = sourceCard;
      const next = (emblem.mireLandIids || []).find(iid => !(emblem.mireRemovedIids || []).includes(iid));
      if (!next) return state;
      const who = emblem.controller;
      // The mired land can belong to either player (Cyclopean Tomb targets
      // "target non-Swamp land", not "target land you control") -- find
      // whichever side actually has it rather than assuming the emblem
      // controller's own battlefield.
      const landSide = state.p.bf.some(c => c.iid === next) ? 'p'
                      : state.o.bf.some(c => c.iid === next) ? 'o'
                      : null;
      let ns = state;
      if (landSide) {
        ns = { ...ns, [landSide]: { ...ns[landSide], bf: ns[landSide].bf.map(c =>
          c.iid === next ? { ...c, counters: { ...c.counters, MIRE: 0 } } : c
        ) } };
      }
      ns = {
        ...ns,
        [who]: {
          ...ns[who],
          emblems: ns[who].emblems.map(e => e.id === emblem.id ? { ...e, mireRemovedIids: [...(e.mireRemovedIids || []), next] } : e),
        },
      };
      ns = recomputeTypeEffects(ns);
      return dlog(ns, "Cyclopean Tomb's mire effect removes all mire counters from a land.", 'effect');
    }
    default:
      console.warn(`[DuelCore] Unknown triggered effect type: ${effect.type}`);
      return state;
  }
}

// applyRegrowthReturn/applyRegrowthCreatureReturn: the actual "move this
// graveyard card to hand" effect shared by Regrowth's (and Adun Oakenshield's)
// two arrival paths for the chosen card -- a directly-passed tgt (case
// "regrowth"/"regrowthCreature" above) or a resolved gyCardChoice pendingChoice
// (RESOLVE_CHOICE below). Extracted so neither path duplicates the zMove/dlog call.
function applyRegrowthReturn(ns, iid, caster) {
  const gyCard = ns[caster].gy.find(c => c.iid === iid);
  if (!gyCard) return ns;
  ns = zMove(ns, gyCard.iid, caster, caster, "hand");
  return dlog(ns, `Regrowth returns ${gyCard.name}.`, "effect");
}

function applyRegrowthCreatureReturn(ns, iid, caster, cardName) {
  const gyCard = ns[caster].gy.find(c => c.iid === iid && isCre(c));
  if (!gyCard) return ns;
  ns = zMove(ns, gyCard.iid, caster, caster, "hand");
  return dlog(ns, `${cardName} returns ${gyCard.name} to hand.`, "effect");
}

// createPendingChoice: the single place that sets state.pendingChoice. Callable
// from resolveTrigger() (triggered abilities) or directly from resolveEff()
// (e.g. Alchor's Tomb's color choice, which has no triggered ability at all).
// `kind` tags how RESOLVE_CHOICE should resolve the answer -- see that case.
function createPendingChoice(state, { sourceCardId, controller, options, kind = 'triggered_ability_choice', ...extra }) {
  return {
    ...state,
    pendingChoice: {
      id: `choice_${sourceCardId}_${makeId()}`,
      kind,
      sourceCardId,
      controller,
      options,
      required: true,
      ...extra,
    },
  };
}

// Finds an emblem by id on either player (Titania's Song / Cyclopean Tomb
// persistent effects -- see docs/MECHANICS_INDEX.md).
function findEmblem(state, id) {
  for (const who of ['p', 'o']) {
    const found = (state[who]?.emblems ?? []).find(e => e.id === id);
    if (found) return found;
  }
  return null;
}

function resolveTrigger(state, inst) {
  const allBf = [...state.p.bf, ...state.o.bf];
  const sourceCard = allBf.find(c => c.iid === inst.sourceCardId)
    ?? findLeftBattlefieldCard(state, inst.sourceCardId)
    ?? findEmblem(state, inst.sourceCardId);
  if (!sourceCard?.triggeredAbilities) return state;
  const ability = sourceCard.triggeredAbilities.find(a => a.id === inst.triggerId);
  if (!ability) return state;

  if (ability.requiresChoice) {
    // Suspend queue and present choice to the controlling player
    return {
      ...createPendingChoice(state, {
        sourceCardId: inst.sourceCardId,
        controller: inst.controller,
        options: ability.effect.options,
        kind: 'triggered_ability_choice',
      }),
      // Re-insert at front so it is re-resolved once the choice is made
      triggerQueue: [inst, ...state.triggerQueue],
    };
  }

  if (ability.requiresTarget) {
    // Suspend queue and prompt the controller to click a fresh battlefield
    // target, same suspend/re-insert shape as requiresChoice above but for a
    // permanent target instead of a fixed option list. RESOLVE_TRIGGER_TARGET
    // (below) resumes it. The UI side extends the existing cast/activate
    // targeting flow (castFlow kind:'trigger' in useDuelController.ts) rather
    // than a parallel targeting mechanism.
    return {
      ...state,
      pendingTriggerTarget: {
        sourceCardId: inst.sourceCardId,
        controller: inst.controller,
        triggerId: inst.triggerId,
        eventPayload: inst.eventPayload,
      },
      triggerQueue: [inst, ...state.triggerQueue],
    };
  }

  return resolveTriggeredEffect(state, sourceCard, ability.effect, inst.eventPayload);
}

function processTriggerQueue(state) {
  let s = state;
  while (s.triggerQueue.length > 0 && !s.pendingChoice && !s.pendingTriggerTarget) {
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

// Small handlerKey-keyed registry for pendingUpkeepChoice, mirroring the
// CARD_HANDLERS pattern in cardHandlers.js. pendingUpkeepChoice always holds
// the front slot of the queue; pendingUpkeepChoiceQueue holds any additional
// choices queued in the same untap step. Add an entry here for every new
// handlerKey queued via queueUpkeepChoice -- do not add another hardcoded
// UPKEEP_CHOICE_RESOLVE branch.
const UPKEEP_CHOICE_HANDLERS = {
  forceOfNatureUpkeep: {
    resolve(s, choice, action) {
      if (action.choice === "PAY_GGGG") {
        let ns = { ...s, p: { ...s.p, mana: { ...s.p.mana, G: (s.p.mana.G ?? 0) - 4 } } };
        return dlog(ns, "Force of Nature: paid GGGG upkeep.", "mana");
      }
      const ns = hurt(s, "p", 8, "Force of Nature", choice?.iid ? { sourceIid: choice.iid, sourceType: 'creature' } : null);
      return dlog(ns, "Force of Nature: player takes 8 damage.", "damage");
    },
  },
  // Ashnod's Battle Gear / Tawnos's Weaponry: "You may choose not to untap
  // this artifact during your untap step." choice.iid is the artifact.
  optionalUntap: {
    resolve(s, choice, action) {
      if (action.choice !== "UNTAP") {
        return dlog(s, `${choice.cardName} remains tapped.`, "info");
      }
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      let ns = { ...s, [owner]: { ...s[owner], bf: s[owner].bf.map(c => c.iid === choice.iid ? { ...c, tapped: false } : c) } };
      ns = dlog(ns, `${choice.cardName} untaps.`, "info");
      // Tawnos's Coffin: insertion point 2 of 2 -- see
      // docs/ENGINE_CONTRACT_SPEC.md -- Tawnos's Coffin Exile/Return.
      const untappedCoffin = ns[owner].bf.find(c => c.iid === choice.iid);
      if (untappedCoffin && untappedCoffin.id === 'tawnos_coffin' && untappedCoffin.exiledCreatureIid) {
        ns = tawnosCoffinReturn(ns, untappedCoffin);
      }
      return ns;
    },
  },
  // Energy Flux: "sacrifice this artifact unless you pay {2}." choice.iid is the artifact.
  // Adapted from Card-Forge/forge (e/energy_flux.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  energyFluxUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice !== "PAY") {
        return dlog(zMove(s, choice.iid, owner, owner, "gy"), `${choice.cardName} sacrificed (Energy Flux).`, "death");
      }
      const totalMana = Object.values(s[owner].mana).reduce((a, b) => a + b, 0);
      if (totalMana < 2) {
        return dlog(zMove(s, choice.iid, owner, owner, "gy"), `${choice.cardName} sacrificed -- could not pay {2}.`, "death");
      }
      const ns = { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, "2") } };
      return dlog(ns, `${choice.cardName}: paid {2} (Energy Flux).`, "mana");
    },
  },
  // Farmstead: "you may pay {W}{W}. If you do, you gain 1 life." choice.iid is the enchanted land.
  // Adapted from Card-Forge/forge (f/farmstead.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  farmsteadUpkeep: {
    resolve(s, choice, action) {
      if (action.choice !== "PAY") return dlog(s, "Farmstead: declines to pay.", "info");
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if ((s[owner].mana.W ?? 0) < 2) return dlog(s, "Farmstead: not enough mana to pay {W}{W}.", "info");
      const ns = { ...s, [owner]: { ...s[owner], mana: { ...s[owner].mana, W: s[owner].mana.W - 2 } } };
      const farmsteadAura = getBF(ns, choice.iid)?.enchantments?.find(e => e.name === "Farmstead");
      return hurt(ns, owner, -1, "Farmstead", farmsteadAura ? { sourceIid: farmsteadAura.iid, sourceType: 'enchantment' } : null);
    },
  },
  // Erosion: "destroy that land unless that player pays {1} or 1 life." choice.iid is the enchanted land.
  // Adapted from Card-Forge/forge (e/erosion.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  erosionUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY_1" && canPay(s[owner].mana, "1")) {
        return { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, "1") } };
      }
      if (action.choice === "PAY_1_LIFE") {
        const erosionAura = getBF(s, choice.iid)?.enchantments?.find(e => e.name === "Erosion");
        return hurt(s, owner, 1, "Erosion", erosionAura ? { sourceIid: erosionAura.iid, sourceType: 'enchantment' } : null);
      }
      return destroyLand(s, choice.iid, "", { message: "Erosion destroys the enchanted land." });
    },
  },
  // Cosmic Horror: "destroy unless pay {3}{B}{B}{B}." choice.iid is the creature.
  // Adapted from Card-Forge/forge (c/cosmic_horror.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  cosmicHorrorUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY" && canPay(s[owner].mana, "3BBB")) {
        return { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, "3BBB") } };
      }
      const chSrc = getBF(s, choice.iid);
      const ns = zMove(s, choice.iid, owner, owner, "gy");
      return hurt(ns, owner, 7, choice.cardName, chSrc ? { sourceIid: chSrc.iid, sourceType: inferSourceType(chSrc) } : null);
    },
  },
  // Sunken City: "sacrifice unless pay {U}{U}." choice.iid is the enchantment.
  // Adapted from Card-Forge/forge (s/sunken_city.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  sunkenCityUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY" && canPay(s[owner].mana, "UU")) {
        return { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, "UU") } };
      }
      return zMove(s, choice.iid, owner, owner, "gy");
    },
  },
  // Island Fish Jasconius / Leviathan: "may pay [cost] to untap." choice.iid is the creature.
  // Adapted from Card-Forge/forge (i/island_fish_jasconius.txt, l/leviathan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  payToUntapSelf: {
    resolve(s, choice, action) {
      if (action.choice !== "PAY") return s;
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (!canPay(s[owner].mana, choice.untapCost)) return s;
      const ns = { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, choice.untapCost) } };
      return { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === choice.iid ? { ...c, tapped: false } : c) } };
    },
  },
  // Leviathan: "you may sacrifice two Islands. If you do, untap this creature." choice.iid is the creature.
  // Adapted from Card-Forge/forge (l/leviathan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  sacIslandsToUntapSelf: {
    resolve(s, choice, action) {
      if (action.choice !== "PAY") return s;
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      const islands = s[owner].bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
      if (islands.length < 2) return s;
      let ns = s;
      for (const isl of islands.slice(0, 2)) ns = zMove(ns, isl.iid, owner, owner, "gy");
      return { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === choice.iid ? { ...c, tapped: false } : c) } };
    },
  },
  // Yawgmoth Demon: "you may sacrifice an artifact. If you don't, tap this
  // creature and it deals 2 damage to you." choice.iid is the creature.
  // Adapted from Card-Forge/forge (y/yawgmoth_demon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  yawgmothDemonUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "SACRIFICE") {
        const arts = s[owner].bf.filter(x => isArt(x) && x.iid !== choice.iid);
        if (!arts.length) return s;
        return zMove(s, arts[0].iid, owner, owner, "gy");
      }
      const ns = tapPermanent(s, owner, choice.iid);
      const ydSrc = getBF(ns, choice.iid);
      return hurt(ns, owner, 2, choice.cardName, ydSrc ? { sourceIid: ydSrc.iid, sourceType: inferSourceType(ydSrc) } : null);
    },
  },
  // Mishra's War Machine: "this creature deals 3 damage to you unless you
  // discard a card. If it deals damage to you this way, tap it." Direct
  // structural copy of yawgmothDemonUpkeep above (discard-a-card in place of
  // sacrifice-an-artifact). choice.iid is the creature.
  // Adapted from Card-Forge/forge (m/mishras_war_machine.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  mishrasWarMachineUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "DISCARD") {
        const h = s[owner].hand;
        if (!h.length) return s;
        const disc = h[h.length - 1];
        return discardCard(s, owner, disc.iid, { cause: 'effect', sourceName: choice.cardName });
      }
      const ns = tapPermanent(s, owner, choice.iid);
      const mwmSrc = getBF(ns, choice.iid);
      return hurt(ns, owner, 3, choice.cardName, mwmSrc ? { sourceIid: mwmSrc.iid, sourceType: inferSourceType(mwmSrc) } : null);
    },
  },
  // Living Artifact: "you may remove a vitality counter. If you do, you gain
  // 1 life." choice.iid is the Aura itself.
  // Adapted from Card-Forge/forge (l/living_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  livingArtifactUpkeep: {
    resolve(s, choice, action) {
      if (action.choice !== "PAY") return dlog(s, `${choice.cardName}: declines to remove a counter.`, "info");
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      const laSrc = getBF(s, choice.iid);
      if (!laSrc || (laSrc.counters?.VITALITY || 0) <= 0) return s;
      const ns = { ...s, [owner]: { ...s[owner], bf: s[owner].bf.map(c => c.iid === choice.iid ? { ...c, counters: { ...c.counters, VITALITY: c.counters.VITALITY - 1 } } : c) } };
      return hurt(ns, owner, -1, choice.cardName, { sourceIid: laSrc.iid, sourceType: 'enchantment' });
    },
  },
  // Elder Spawn: "unless you sacrifice an Island, sacrifice this creature and
  // it deals 6 damage to you." choice.iid is the creature.
  // Adapted from Card-Forge/forge (e/elder_spawn.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  elderSpawnUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "SACRIFICE_ISLAND") {
        const islands = s[owner].bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
        if (!islands.length) return s;
        return zMove(s, islands[0].iid, owner, owner, "gy");
      }
      const esSrc = getBF(s, choice.iid);
      const ns = zMove(s, choice.iid, owner, owner, "gy");
      return hurt(ns, owner, 6, choice.cardName, esSrc ? { sourceIid: esSrc.iid, sourceType: inferSourceType(esSrc) } : null);
    },
  },
  // Curse Artifact: "deals 2 damage to that player unless they sacrifice that
  // artifact." choice.iid is the enchanted artifact.
  // Adapted from Card-Forge/forge (c/curse_artifact.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  curseArtifactUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "SACRIFICE") {
        return dlog(zMove(s, choice.iid, owner, owner, "gy"), `${choice.cardName} sacrificed (Curse Artifact).`, "death");
      }
      const caSrc = getBF(s, choice.iid)?.enchantments?.find(e => e.name === "Curse Artifact");
      return hurt(s, owner, 2, "Curse Artifact", caSrc ? { sourceIid: caSrc.iid, sourceType: 'enchantment' } : null);
    },
  },
  // Serendib Djinn: "sacrifice a land. If you sacrifice an Island this way,
  // Serendib Djinn deals 3 damage to you." choice.iid is the creature;
  // action.choice carries the chosen land's iid directly (a genuine
  // land-picker, not a fixed enum -- see the SerendibDjinnUpkeepModal UI).
  // Adapted from Card-Forge/forge (s/serendib_djinn.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  serendibDjinnUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      const land = getBF(s, action.choice);
      if (!land || !isLand(land)) return s;
      const wasIsland = land.subtype?.includes("Island");
      let ns = zMove(s, land.iid, owner, owner, "gy");
      ns = dlog(ns, `${choice.cardName}: sacrifices ${land.name}.`, "effect");
      if (wasIsland) {
        const djSrc = getBF(ns, choice.iid);
        ns = hurt(ns, owner, 3, choice.cardName, djSrc ? { sourceIid: djSrc.iid, sourceType: inferSourceType(djSrc) } : null);
      }
      return ns;
    },
  },
  // Rohgahh of Kher Keep: "you may pay {R}{R}{R}. If you don't, tap Rohgahh
  // and all Kobolds of Kher Keep, then an opponent gains control of them."
  // choice.iid is Rohgahh itself.
  // Adapted from Card-Forge/forge (r/rohgahh_of_kher_keep.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  rohgahhUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY" && canPay(s[owner].mana, "RRR")) {
        return { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, "RRR") } };
      }
      return rohgahhTapAndTransfer(s, owner, choice.iid);
    },
  },
  // Mana Vortex: "that player sacrifices a land." choice.iid is Mana Vortex
  // itself; action.choice carries the chosen land's iid directly, same
  // land-picker shape as serendibDjinnUpkeep above.
  // Adapted from Card-Forge/forge (m/mana_vortex.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  manaVortexUpkeep: {
    resolve(s, choice, action) {
      const land = getBF(s, action.choice);
      if (!land || !isLand(land)) return s;
      const owner = land.controller;
      return dlog(zMove(s, land.iid, owner, owner, "gy"), `Mana Vortex: ${owner} sacrifices ${land.name}.`, "effect");
    },
  },
  // Magnetic Mountain: computes the eligible/affordable count at resolve time
  // (not when the pendingUpkeepChoice was queued) since mana burns at the
  // UPKEEP transition itself -- the player only has real mana to spend once
  // they respond to this prompt. Opens the numberChoice for how many to untap.
  // Adapted from Card-Forge/forge (m/magnetic_mountain.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  magneticMountainPrompt: {
    resolve(s, choice) {
      const eligible = s.p.bf.filter(x => isCre(x) && x.tapped && x.color === "U");
      const maxAffordable = Math.floor(Object.values(s.p.mana).reduce((a, b) => a + b, 0) / 4);
      const max = Math.min(eligible.length, maxAffordable);
      if (max <= 0) return s;
      return createPendingChoice(s, {
        sourceCardId: choice.iid,
        controller: 'p',
        kind: 'numberChoice',
        handlerKey: 'magneticMountainUntap',
        options: Array.from({ length: max + 1 }, (_, n) => ({ id: String(n), label: `Untap ${n}` })),
      });
    },
  },
  // Power Leak: same "compute at resolve time" reasoning as Magnetic Mountain
  // above -- only the human is queued this way (the AI auto-decides 0
  // synchronously). forPlayer is always 'p' here.
  // Adapted from Card-Forge/forge (p/power_leak.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  powerLeakPrompt: {
    resolve(s, choice) {
      const totalMana = Object.values(s.p.mana).reduce((a, b) => a + b, 0);
      return createPendingChoice(s, {
        sourceCardId: choice.iid,
        controller: 'p',
        kind: 'numberChoice',
        handlerKey: 'powerLeakPay',
        forPlayer: 'p',
        options: Array.from({ length: Math.min(totalMana, 2) + 1 }, (_, n) => ({ id: String(n), label: `Pay ${n}` })),
      });
    },
  },
  // Tetravus: "you may remove any number of +1/+1 counters from this
  // creature." Computed at resolve time so the option range reflects the
  // counter count as of upkeep, mirroring Magnetic Mountain/Power Leak above.
  // Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  tetravusRemoveCountersPrompt: {
    resolve(s, choice) {
      const card = getBF(s, choice.iid);
      const max = card?.counters?.P1P1 || 0;
      if (max <= 0) return s;
      return createPendingChoice(s, {
        sourceCardId: choice.iid,
        controller: 'p',
        kind: 'numberChoice',
        handlerKey: 'tetravusCreateTokens',
        options: Array.from({ length: max + 1 }, (_, n) => ({ id: String(n), label: `Remove ${n}` })),
      });
    },
  },
  // Tetravus: "you may exile any number of tokens created with this
  // creature." Only tokens tagged with this Tetravus's iid as sourceIid count.
  // Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  tetravusExileTokensPrompt: {
    resolve(s, choice) {
      const max = s.p.bf.filter(x => x.isToken && x.tokenId === "tetravite" && x.sourceIid === choice.iid).length;
      if (max <= 0) return s;
      return createPendingChoice(s, {
        sourceCardId: choice.iid,
        controller: 'p',
        kind: 'numberChoice',
        handlerKey: 'tetravusExileTokens',
        options: Array.from({ length: max + 1 }, (_, n) => ({ id: String(n), label: `Exile ${n}` })),
      });
    },
  },
  // Primordial Ooze: "may pay {X}" (X fixed to the current +1/+1 counter
  // count -- see choice.payCost, set when the choice was queued). choice.iid
  // is the creature.
  primordialOozeUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY" && canPay(s[owner].mana, choice.payCost)) {
        return { ...s, [owner]: { ...s[owner], mana: payMana(s[owner].mana, choice.payCost) } };
      }
      const ns = tapPermanent(s, owner, choice.iid);
      const pooSrc = getBF(ns, choice.iid);
      return hurt(ns, owner, Number(choice.payCost), choice.cardName, pooSrc ? { sourceIid: pooSrc.iid, sourceType: inferSourceType(pooSrc) } : null);
    },
  },
  // Safe Haven: "you may sacrifice this land. If you do, return each card
  // exiled with this land to the battlefield under its owner's control."
  // choice.iid is Safe Haven itself; exiledIids is populated by the
  // safeHavenExile ACTIVATE_ABILITY case.
  safeHavenUpkeep: {
    resolve(s, choice, action) {
      if (action.choice !== "SACRIFICE") return dlog(s, "Safe Haven remains on the battlefield.", "info");
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      const src = getBF(s, choice.iid);
      const exiledIids = src?.exiledIids || [];
      let ns = zMove(s, choice.iid, owner, owner, "gy");
      let returned = 0;
      for (const iid of exiledIids) {
        if (ns[owner].exile.some(c => c.iid === iid)) { ns = zMove(ns, iid, owner, owner, "bf"); returned++; }
      }
      return dlog(ns, `Safe Haven is sacrificed -- returns ${returned} exiled card(s) to the battlefield.`, "effect");
    },
  },
  // Psychic Allergy: "sacrifice this enchantment unless you sacrifice two
  // Islands." Same auto-slice shape as sacIslandsToUntapSelf above. choice.iid
  // is Psychic Allergy itself.
  psychicAllergyUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "SACRIFICE_ISLANDS") {
        const islands = s[owner].bf.filter(x => isLand(x) && x.subtype?.includes("Island"));
        if (islands.length < 2) return s;
        let ns = s;
        for (const isl of islands.slice(0, 2)) ns = zMove(ns, isl.iid, owner, owner, "gy");
        return dlog(ns, "Psychic Allergy: sacrifices two Islands.", "effect");
      }
      return dlog(zMove(s, choice.iid, owner, owner, "gy"), "Psychic Allergy sacrificed.", "death");
    },
  },
  // Season of the Witch: "sacrifice this enchantment unless you pay 2 life."
  // choice.iid is the enchantment itself.
  seasonOfTheWitchUpkeep: {
    resolve(s, choice, action) {
      const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : 'o';
      if (action.choice === "PAY_LIFE" && s[owner].life > 2) {
        const swSrc = getBF(s, choice.iid);
        return hurt(s, owner, 2, choice.cardName, swSrc ? { sourceIid: swSrc.iid, sourceType: 'enchantment' } : null);
      }
      return dlog(zMove(s, choice.iid, owner, owner, "gy"), "Season of the Witch sacrificed.", "death");
    },
  },
  // Worms of the Earth: "any player may sacrifice two lands of their choice
  // or have this enchantment deal 5 damage to that player. If a player does
  // either, destroy this enchantment." Only ever queued for 'p' (this
  // choice's controller is always the acting player, ns.active at queue
  // time -- NOT necessarily Worms of the Earth's own controller, since this
  // is an each-upkeep effect like The Abyss, not a self-controller-scoped
  // one), so `owner` is hardcoded rather than derived from the card's
  // controller.
  wormsOfTheEarthUpkeep: {
    resolve(s, choice, action) {
      const owner = 'p';
      if (action.choice === "SAC_LANDS") {
        const lands = s[owner].bf.filter(isLand);
        if (lands.length < 2) return s;
        let ns = s;
        for (const l of lands.slice(0, 2)) ns = zMove(ns, l.iid, owner, owner, "gy");
        ns = dlog(ns, "Worms of the Earth: sacrifices two lands.", "effect");
        return zMove(ns, choice.iid, getBF(ns, choice.iid)?.controller ?? owner, getBF(ns, choice.iid)?.controller ?? owner, "gy");
      }
      if (action.choice === "TAKE_DAMAGE") {
        const wSrc = getBF(s, choice.iid);
        let ns = hurt(s, owner, 5, choice.cardName, wSrc ? { sourceIid: wSrc.iid, sourceType: 'enchantment' } : null);
        return zMove(ns, choice.iid, wSrc?.controller ?? owner, wSrc?.controller ?? owner, "gy");
      }
      return dlog(s, "Worms of the Earth remains on the battlefield.", "info");
    },
  },
};

// Registry for kind:'numberChoice' pendingChoice resolution, mirroring
// UPKEEP_CHOICE_HANDLERS. handler(state, choice, n) -> state.
// Adapted from Card-Forge/forge (m/mind_bomb.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
const NUMBER_CHOICE_HANDLERS = {
  mindBombDiscard: (s, choice, n) => {
    const who = choice.forPlayer;
    const hand = s[who].hand;
    const discarded = hand.slice(Math.max(0, hand.length - n));
    let ns = s;
    for (const dc of discarded) { ns = discardCard(ns, who, dc.iid, { cause: 'effect', sourceName: choice.sourceCardName || 'Mind Bomb' }); }
    ns = dlog(ns, `${who} discards ${discarded.length} card(s) to Mind Bomb.`, "effect");
    const dmg = Math.max(0, 3 - discarded.length);
    if (dmg > 0) ns = hurt(ns, who, dmg, choice.sourceCardName || "Mind Bomb", choice.sourceCardId ? { sourceIid: choice.sourceCardId, sourceType: 'spell' } : null);
    return ns;
  },
  // Shapeshifter: "choose a number between 0 and 7" -- sets chosenNumber on the
  // specific card instance (choice.iid), read by the shapeshifterPower/
  // shapeshifterToughness CDA evaluators.
  // Adapted from Card-Forge/forge (s/shapeshifter.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  shapeshifterChoose: (s, choice, n) => {
    const owner = s.p.bf.some(c => c.iid === choice.iid) ? 'p' : (s.o.bf.some(c => c.iid === choice.iid) ? 'o' : null);
    if (!owner) return s;
    const ns = { ...s, [owner]: { ...s[owner], bf: s[owner].bf.map(c => c.iid === choice.iid ? { ...c, chosenNumber: n } : c) } };
    return dlog(ns, `Shapeshifter becomes ${n}/${7 - n}.`, "effect");
  },
  // Magnetic Mountain: untaps N tapped blue creatures the player controls
  // (auto-selected), paying {4} per creature.
  // Adapted from Card-Forge/forge (m/magnetic_mountain.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  magneticMountainUntap: (s, choice, n) => {
    if (n <= 0) return s;
    const who = choice.controller;
    const eligible = s[who].bf.filter(x => isCre(x) && x.tapped && x.color === "U").slice(0, n);
    if (!canPay(s[who].mana, String(n * 4))) return s;
    let ns = { ...s, [who]: { ...s[who], mana: payMana(s[who].mana, String(n * 4)) } };
    const ids = eligible.map(x => x.iid);
    ns = { ...ns, [who]: { ...ns[who], bf: ns[who].bf.map(c => ids.includes(c.iid) ? { ...c, tapped: false } : c) } };
    return dlog(ns, `Magnetic Mountain: untaps ${ids.length} blue creature(s).`, "effect");
  },
  // Power Leak: "that player may pay any amount of mana. This Aura deals 2
  // damage to that player. Prevent X of that damage, where X is the amount
  // paid this way." choice.iid is the enchanted enchantment.
  // Adapted from Card-Forge/forge (p/power_leak.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  powerLeakPay: (s, choice, n) => {
    const who = choice.forPlayer;
    const plAura = getBF(s, choice.sourceCardId)?.enchantments?.find(e => e.name === "Power Leak");
    const plMeta = plAura ? { sourceIid: plAura.iid, sourceType: 'enchantment' } : null;
    if (n <= 0) return hurt(s, who, 2, "Power Leak", plMeta);
    if (!canPay(s[who].mana, String(n))) return hurt(s, who, 2, "Power Leak", plMeta);
    const paid = Math.min(n, 2);
    const ns = { ...s, [who]: { ...s[who], mana: payMana(s[who].mana, String(n)) } };
    const remaining = Math.max(0, 2 - paid);
    return remaining > 0 ? hurt(ns, who, remaining, "Power Leak", plMeta) : ns;
  },
  // Tetravus: removes N +1/+1 counters, creates N Tetravite tokens tagged
  // with this Tetravus's iid (remembered-token tracking for the exile ability
  // below). choice.sourceCardId is Tetravus's iid.
  // Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  tetravusCreateTokens: (s, choice, n) => {
    if (n <= 0) return s;
    const owner = s.p.bf.some(c => c.iid === choice.sourceCardId) ? 'p' : (s.o.bf.some(c => c.iid === choice.sourceCardId) ? 'o' : null);
    if (!owner) return s;
    const card = getBF(s, choice.sourceCardId);
    const have = card?.counters?.P1P1 || 0;
    const removed = Math.min(n, have);
    if (removed <= 0) return s;
    let ns = { ...s, [owner]: { ...s[owner], bf: s[owner].bf.map(c => c.iid === choice.sourceCardId
      ? { ...c, counters: { ...c.counters, P1P1: have - removed } } : c) } };
    ns = createToken(ns, 'tetravite', removed, owner, choice.sourceCardId);
    return dlog(ns, `Tetravus removes ${removed} +1/+1 counter(s) to create ${removed} Tetravite token(s).`, "effect");
  },
  // Tetravus: exiles N of its own Tetravite tokens (tokens cease to exist per
  // CR 111.7 -- zMove handles this), puts that many +1/+1 counters back on
  // Tetravus. choice.sourceCardId is Tetravus's iid.
  // Adapted from Card-Forge/forge (t/tetravus.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  tetravusExileTokens: (s, choice, n) => {
    if (n <= 0) return s;
    const owner = s.p.bf.some(c => c.iid === choice.sourceCardId) ? 'p' : (s.o.bf.some(c => c.iid === choice.sourceCardId) ? 'o' : null);
    if (!owner) return s;
    const eligible = s[owner].bf.filter(x => x.isToken && x.tokenId === "tetravite" && x.sourceIid === choice.sourceCardId).slice(0, n);
    if (!eligible.length) return s;
    let ns = s;
    for (const t of eligible) ns = zMove(ns, t.iid, owner, owner, "exile");
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === choice.sourceCardId
      ? { ...c, counters: { ...c.counters, P1P1: (c.counters?.P1P1 || 0) + eligible.length } } : c) } };
    return dlog(ns, `Tetravus exiles ${eligible.length} Tetravite token(s), gaining that many +1/+1 counters.`, "effect");
  },
};

// Rohgahh of Kher Keep: taps Rohgahh and every creature the same controller
// controls named "Kobolds of Kher Keep", then transfers control of all of
// them to the opponent. No shared control-transfer helper function exists in
// this file to extend -- aladdinsSteal/oldManSteal (see resolveEff) both
// inline the same remove-from-controller/add-to-caster steps directly in
// their own case blocks rather than calling a shared helper -- so this
// mirrors that same inline pattern, just looped over multiple iids instead
// of one. Unlike those two, there is no controlGrant/reversion condition:
// this is a one-time, non-reverting transfer, matching the printed text.
// Adapted from Card-Forge/forge (r/rohgahh_of_kher_keep.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
function rohgahhTapAndTransfer(state, owner, rohgahhIid) {
  const opp = owner === 'p' ? 'o' : 'p';
  const targets = state[owner].bf.filter(c => c.iid === rohgahhIid || c.name === "Kobolds of Kher Keep");
  if (!targets.length) return state;
  let s = state;
  for (const t of targets) s = tapPermanent(s, owner, t.iid);
  for (const t of targets) {
    const current = getBF(s, t.iid);
    if (!current) continue;
    s = { ...s, [owner]: { ...s[owner], bf: s[owner].bf.filter(c => c.iid !== current.iid) } };
    const transferred = { ...current, controller: opp, summoningSick: true, attacking: false, blocking: null };
    s = { ...s, [opp]: { ...s[opp], bf: [...s[opp].bf, transferred] } };
  }
  return dlog(s, `Rohgahh of Kher Keep: taps and transfers control of ${targets.length} permanent(s) to ${opp}.`, "effect");
}

// Appends an upkeep choice to the queue: sets pendingUpkeepChoice directly if
// the front slot is empty, else appends to pendingUpkeepChoiceQueue. Existing
// `if (s.pendingUpkeepChoice) ...` null checks (ADVANCE_PHASE gate, UI render
// gate) stay correct unchanged -- they're non-null exactly when the queue is
// non-empty.
function queueUpkeepChoice(state, choice) {
  if (!state.pendingUpkeepChoice) return { ...state, pendingUpkeepChoice: choice };
  return { ...state, pendingUpkeepChoiceQueue: [...state.pendingUpkeepChoiceQueue, choice] };
}

// --- DUEL STATE BUILDER -------------------------------------------------------

export function buildDuelState(pDeckIds, oppArchKey, ruleset, overworldHP, castleMod, anteEnabled, oppLife, binderIds = []) {
const pd = shuffle(pDeckIds.map(id => makeCardInstance(id, "p")).filter(Boolean));
const od = shuffle((ARCHETYPES[oppArchKey]?.deck || ARCHETYPES.RED_BURN.deck).map(id => makeCardInstance(id, "o")).filter(Boolean));
const ph = pd.splice(0, ruleset.startingHandSize);
const oh = od.splice(0, ruleset.startingHandSize);
const startLife = overworldHP ?? ruleset.startingLife;
const anteP = anteEnabled && pd.length ? pd[0] : null;
const anteO = anteEnabled && od.length ? od[0] : null;
// The anted card is set aside for the duel: remove it from the library so it
// can never be drawn or played while it is at stake (Part 1 fix -- previously
// the card stayed in pd/od and remained fully drawable).
if (anteP) pd.splice(0, 1);
if (anteO) od.splice(0, 1);

return {
ruleset,
phase: PHASE.MAIN_1,
active: "p",
turn: 1,
landsPlayed: 0,
spellsThisTurn: 0,
totalCardsCast: 0,
peakDamage: 0,
// binderIds: Ring of Ma'ruf's "outside the game". The player's is a snapshot of
// the overworld binder (card IDs, crossing the World Map / Duel boundary the same
// way pDeckIds does); the opponent's is a pseudo-binder snapshotted from its
// archetype deck list. Read-only except for MARUF_PICK fetch-removal.
p: { life: startLife, lib: pd, hand: ph, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0, channelActive: false, mulliganDecided: false, emblems: [], binderIds: [...binderIds] },
o: { life: oppLife ?? ruleset.startingLife, lib: od, hand: oh, bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0, channelActive: false, mulliganDecided: false, emblems: [], binderIds: [...(ARCHETYPES[oppArchKey]?.deck || ARCHETYPES.RED_BURN.deck)] },
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
// Additional ante-zone cards contributed mid-game (Contract from Below,
// Demonic Attorney, Rebirth, Jeweled Bird, Darkpact). anteExtraP holds cards
// the player owns; anteExtraO cards the opponent owns. Reconciled together
// with anteP/anteO by handleDuelEnd (winner takes the whole ante zone).
anteExtraP: [],
anteExtraO: [],
// Permanent ownership exchanges (Bronze Tablet, Tempest Efreet, Darkpact
// cross-ownership). Entries: { cardId, card, newOwner: 'p'|'o' }. Swept
// unconditionally by handleDuelEnd regardless of duel outcome.
ownershipChanges: [],
anteEnabled,
// Pending ante-related player decision (Rebirth ante choice, Bronze Tablet /
// Tempest Efreet pay-10-life choice, Darkpact ante-card pick). Shape:
// { kind, decider: 'p'|'o', data, queue }. Resolved via ANTE_CHOICE_RESOLVE.
pendingAnteChoice: null,
fogActive: false,
exileNextDeath: false,
pendingLotus: false,
pendingLotusIid: null,
pendingBop: false,
turnState: { damageLog: [], sengirDamagedIids: [], powerSurgeUntappedCount: 0, attackedThisCombat: [], mustAttackEligible: [], venomTargets: [], damageTakenThisTurn: {}, damageBySourceType: {}, damageShields: { p: [], o: [] }, creatureDamageShields: {}, landDestructionShields: {}, creaturesDiedThisTurn: [], sacrificedIids: [], activatedOnceIids: [], activationCounts: {}, endOfCombatDestroy: [], endOfCombatSacrifice: [], combatDamageOrders: {} },
triggerQueue: [],
pendingChoice: null,
// Suspends processTriggerQueue for a triggered ability that needs a fresh
// battlefield target (Vesuvan Doppelganger's upkeep re-copy) rather than a
// fixed option list -- see ability.requiresTarget in resolveTrigger() and
// the RESOLVE_TRIGGER_TARGET action.
pendingTriggerTarget: null,
pendingUpkeepChoice: null,
// Extra queued upkeep choices for the same untap step (Part 3: upkeep-choice
// registry). pendingUpkeepChoice always holds the front slot; the null check
// on it (ADVANCE_PHASE gate, UI render gate) is unchanged -- when it resolves,
// UPKEEP_CHOICE_RESOLVE shifts the next entry (if any) off this queue.
pendingUpkeepChoiceQueue: [],
// Rukh Egg: "create a token at the beginning of the next end step." Drained
// in the PHASE.END block alongside returnToHandNextEnd/revertAnimateAtEnd.
pendingEndStepTokens: [],
// Hazezon Tamar: "create X Sand Warrior tokens at the beginning of your next
// upkeep." Same delayed-token shape as pendingEndStepTokens above, but keyed
// to upkeep and filtered by controller (see PHASE.UPKEEP) since -- unlike
// Rukh Egg's single-END-phase-per-turn-cycle assumption -- both players
// eventually get their own upkeep and this must only fire once, on the
// entering player's own next upkeep.
pendingUpkeepTokens: [],
// Giant Slug: "{5}: At the beginning of your next upkeep, choose a basic
// land type. This creature gains landwalk of the chosen type until the end
// of that turn." Sibling to pendingUpkeepTokens above -- same delayed
// one-shot-at-your-next-upkeep pattern, filtered by controller in
// PHASE.UPKEEP, but presents a basicLandTypeChoice instead of auto-creating
// tokens since the land type is the player's choice.
pendingUpkeepLandwalk: [],
// Darkpact: { caster, cards } where cards are the caster's own ante
// contributions (anteP/anteExtraP or anteO/anteExtraO). Resolved via
// RESOLVE_ANTE_EXCHANGE / DECLINE_ANTE_EXCHANGE. Distinct from the unused
// pendingAnteChoice scaffold above (never wired to a reducer case).
pendingAnteExchange: null,
// Circle of Protection / Eye for an Eye / Greater Realm of Preservation:
// { caster, mode, shieldSourceIid, shieldSourceName, pool } where pool is
// every legal "source of your choice" (matching permanents + stack spells).
// Resolved via RESOLVE_DAMAGE_SHIELD_CHOICE / DECLINE_DAMAGE_SHIELD_CHOICE.
pendingDamageShieldChoice: null,
pendingConditionalCounter: null,
// Cleanup-step hand-limit discard: { controller: 'p', count: number }. See
// docs/SYSTEMS.md Section 29. AI ('o') never sets this -- see the CLEANUP
// branch above.
pendingCleanupDiscard: null,
priorityWindow: false,
priorityPasser: null,
manaTapSnapshot: null,
additionalCostSnapshot: null,
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
  ns = tapPermanent(ns, w, action.iid);
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

case "UNDO_ADDITIONAL_COST": {
  const snap = s.additionalCostSnapshot;
  if (!snap) return s;
  if (snap.type === 'sacrificeCreature') {
    const w = snap.card.controller ?? 'p';
    const bf = [...s[w].bf];
    let idx = snap.bfIndex;
    if (idx < 0 || idx > bf.length) {
      console.warn(`[DuelCore] UNDO_ADDITIONAL_COST: bfIndex ${snap.bfIndex} out of range, clamping`);
      idx = Math.max(0, Math.min(idx, bf.length));
    }
    bf.splice(idx, 0, snap.card);
    const gy = s[w].gy.filter(x => x.iid !== snap.card.iid);
    const ns = { ...s, [w]: { ...s[w], bf, gy }, additionalCostSnapshot: null };
    return dlog(ns, "Sacrifice undone.", "effect");
  }
  if (snap.type === 'sacrificeLand') {
    const w = snap.card.controller ?? 'p';
    const bf = [...s[w].bf];
    let idx = snap.bfIndex;
    if (idx < 0 || idx > bf.length) {
      console.warn(`[DuelCore] UNDO_ADDITIONAL_COST: bfIndex ${snap.bfIndex} out of range, clamping`);
      idx = Math.max(0, Math.min(idx, bf.length));
    }
    bf.splice(idx, 0, snap.card);
    const gy = s[w].gy.filter(x => x.iid !== snap.card.iid);
    const ns = { ...s, [w]: { ...s[w], bf, gy }, additionalCostSnapshot: null };
    return dlog(ns, "Sacrifice undone.", "effect");
  }
  return s;
}

case "PLAY_LAND": {
  const w = action.who;
  const c = s[w].hand.find(x => x.iid === action.iid);
  const fastbondCard = s[w].bf.find(x => x.id === "fastbond");
  const fastbondActive = !!fastbondCard;
  if (s.stack?.length > 0) return dlog(s, 'Cannot play a land while spells are on the stack.', 'rule');
  // Worms of the Earth: "Players can't play lands." (The other half of its
  // text -- "Lands can't enter the battlefield" -- is covered by the
  // matching guard at the top of zMove.)
  if ([...s.p.bf, ...s.o.bf].some(x => x.name === "Worms of the Earth")) {
    return dlog(s, "Worms of the Earth: players can't play lands.", "rule");
  }
  if (!c || !isLand(c) || s.active !== w || (s.phase !== PHASE.MAIN_1 && s.phase !== PHASE.MAIN_2) || (s.landsPlayed >= 1 && !fastbondActive)) return s;
  const prevLandsPlayed = s.landsPlayed;
  // Kismet: "Artifacts, creatures, and lands your opponents control enter tapped."
  // Adapted from Card-Forge/forge (k/kismet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const kismetTapsLand = s[w === 'p' ? 'o' : 'p'].bf.some(x => x.name === 'Kismet');
  // summoningSick was previously hardcoded false here (lands had no {T}-ability
  // sickness restriction). Now that a land can be animated into a creature
  // (Living Lands, Kormus Bell) it must track sickness like any other permanent --
  // see docs/SYSTEMS.md S18.9.
  const lArr = { ...c, controller: w, tapped: kismetTapsLand, summoningSick: !hasKw(c, KEYWORDS.HASTE.id), attacking: false, blocking: null, damage: 0, counters: {} };
  s = { ...s, [w]: { ...s[w], hand: s[w].hand.filter(x => x.iid !== action.iid), bf: [...s[w].bf, lArr] }, landsPlayed: s.landsPlayed + 1 };
  if (fastbondActive && prevLandsPlayed >= 1) {
    s = hurt(s, w, 1, "Fastbond", { sourceIid: fastbondCard.iid, sourceType: inferSourceType(fastbondCard) });
    s = dlog(s, `Fastbond: ${w} takes 1 damage for playing an extra land.`, "damage");
  }
  s = recomputeTypeEffects(s);
  s = checkLegendRule(s);
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
  // Relic Bind: "Enchant artifact an opponent controls." No existing declarative
  // convention restricts an Aura's legal host by controller (Living Artifact's
  // "enchant artifact" and Kudzu's "enchant land" both accept any host), so this
  // is a small card-specific addition to the same per-card CAST_SPELL gate
  // pattern used by BEB/REB/Reset above, rather than a new general mechanism.
  if (c.id === 'relic_bind') {
    const rbTgt = [...s.p.bf, ...s.o.bf].find(x => x.iid === action.tgt);
    if (!rbTgt || rbTgt.controller === w) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Relic Bind must enchant an artifact an opponent controls`);
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
  // Blaze of Glory: "Cast this spell only during combat before blockers are
  // declared." The only priority window that falls before blockers are
  // declared AND after attackers are known is COMBAT_AFTER_ATTACKERS
  // (COMBAT_ATTACKERS itself has no priority window -- see PRIORITY_PHASES
  // in phases.js). Target must be a creature the DEFENDING player controls;
  // either player may be the caster (the attacker can force an overextended
  // chump block, the defender can consolidate blocks onto one creature --
  // both are legal per the oracle text, which doesn't restrict the caster).
  if (c.id === 'blaze_of_glory') {
    if (s.phase !== PHASE.COMBAT_AFTER_ATTACKERS || !s.attackers.length) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Blaze of Glory can only be cast during combat before blockers are declared`);
      return s;
    }
    const bogTgt = [...s.p.bf, ...s.o.bf].find(x => x.iid === action.tgt);
    const bogDefender = s.active === 'p' ? 'o' : 'p';
    if (!bogTgt || !isCre(bogTgt) || bogTgt.controller !== bogDefender) {
      console.warn(`[DuelCore] CAST_SPELL blocked: Blaze of Glory must target a creature the defending player controls`);
      return s;
    }
  }
  // Protection-from-targeting legality (S17.6.3/T extension): if the chosen
  // target resolves to a permanent with protection from this spell's source,
  // reject the cast outright -- no stack item, no mana spent.
  if (action.tgt) {
    const tgtPerm = getBF(s, action.tgt);
    if (tgtPerm && isProtectedFromSource(tgtPerm, c, s)) {
      const quality = isArt(c) ? 'artifact' : ({ W:'white', U:'blue', B:'black', R:'red', G:'green' }[computeCharacteristics(c, s).color] || 'colorless');
      return dlog(s, `${c.name} can't target ${tgtPerm.name} (protection from ${quality}).`, 'rule');
    }
  }
  const xSpend = (c.cost?.toUpperCase().includes('X') && c.id !== 'power_sink')
    ? (action.xVal || s.xVal || 1)
    : 0;
  const taxedCastCost = applyCostTax(c.cost, c, s);
  if (!canPay(s[w].mana, taxedCastCost, xSpend)) return s;
  if (w === "p" && s.castleMod?.name === "Tidal Lock" && (s.spellsThisTurn || 0) >= 1) return dlog(s, "Tidal Lock: only one spell per turn.", "effect");
  // Additional cost to cast (Sacrifice): paid atomically as part of this same
  // CAST_SPELL transaction, before mana payment. See ENGINE_CONTRACT_SPEC.md.
  let additionalCostPaid = null;
  if (c.additionalCost?.type === 'sacrificeCreature') {
    const sacIdx = s[w].bf.findIndex(x => x.iid === action.additionalCostIid);
    const sacCard = sacIdx >= 0 ? s[w].bf[sacIdx] : null;
    if (!sacCard || !isCre(sacCard)) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} additional cost requires a creature the caster controls`);
      return s;
    }
    s = { ...s, additionalCostSnapshot: { type: 'sacrificeCreature', card: { ...sacCard }, bfIndex: sacIdx } };
    s = zMove(s, sacCard.iid, w, w, "gy");
    s = dlog(s, `${w} sacrifices ${sacCard.name} as an additional cost.`, "effect");
    additionalCostPaid = { type: 'sacrificeCreature', card: { ...sacCard } };
  }
  // Mana Vortex: "When you cast this spell, counter it unless you sacrifice a
  // land." SIMPLIFICATION -- this is technically a cast trigger with its own
  // counter effect, not a hard additional cost, but folding it into the same
  // additionalCost gate as sacrificeCreature above (atomic, pre-mana-payment)
  // produces the same practical result ("you cannot finish casting this
  // spell without giving up a land") with no new mechanism. The zero-lands
  // legality gate (see beginCastFlow in useDuelController.ts) prevents even
  // starting the cast rather than casting-then-countering.
  if (c.additionalCost?.type === 'sacrificeLand') {
    const sacIdx = s[w].bf.findIndex(x => x.iid === action.additionalCostIid);
    const sacCard = sacIdx >= 0 ? s[w].bf[sacIdx] : null;
    if (!sacCard || !isLand(sacCard)) {
      console.warn(`[DuelCore] CAST_SPELL blocked: ${c.name} additional cost requires a land the caster controls`);
      return s;
    }
    s = { ...s, additionalCostSnapshot: { type: 'sacrificeLand', card: { ...sacCard }, bfIndex: sacIdx } };
    s = zMove(s, sacCard.iid, w, w, "gy");
    s = dlog(s, `${w} sacrifices ${sacCard.name} as an additional cost.`, "effect");
    additionalCostPaid = { type: 'sacrificeLand', card: { ...sacCard } };
  }
  s = { ...s, manaTapSnapshot: null };
  let manaAfterPay = payMana(s[w].mana, taxedCastCost);
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
    fromColor: action.fromColor, toColor: action.toColor, fromKw: action.fromKw, toKw: action.toKw, additionalCostPaid };
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
  let castState = dlog(
    { ...s, stack: [...s.stack, item], priorityWindow: true, priorityPasser: null, additionalCostSnapshot: null },
    `${w} casts ${c.name}${xSuffix}${tgtLabel}.`,
    "play"
  );
  // ON_SPELL_CAST: generic cast-triggered event, emitted after the spell is legally
  // placed on the stack (not at resolution). `colors` splits the single-string
  // `color` field (e.g. "UB" for multicolor) into an array for condition matching.
  castState = emitEvent(castState, { type: 'ON_SPELL_CAST', payload: {
    casterId: w,
    cardIid: c.iid,
    cardType: c.type,
    isArtifact: isArt(c),
    isCreature: isCre(c),
    colors: c.color ? c.color.split('') : [],
  } });
  castState = processTriggerQueue(castState);
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
    // Mold Demon: skipEtbPush additionally covers "placed then immediately
    // removed" (sacrificed itself as its own ETB condition) -- alreadyOnBf alone
    // can't distinguish that from "never placed yet" since both read false.
    // Adapted from Card-Forge/forge (m/mold_demon.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    const alreadyOnBf = s[top.caster].bf.some(c => c.iid === top.card.iid);
    const skipEtbPush = s.skipEtbPush;
    if (skipEtbPush) s = { ...s, skipEtbPush: false };
    if (!alreadyOnBf && !skipEtbPush) {
      // Kismet: "Artifacts, creatures, and lands your opponents control enter
      // tapped." Adapted from Card-Forge/forge (k/kismet.txt), GPL-3.0. See
      // THIRD_PARTY_NOTICES.md.
      const kismetTapsPerm = (isArt(top.card) || isCre(top.card)) &&
        s[top.caster === 'p' ? 'o' : 'p'].bf.some(x => x.name === 'Kismet');
      const pArr = {
        ...top.card,
        controller: top.caster,
        // Bronze Tablet: "This artifact enters tapped."
        tapped: kismetTapsPerm || !!top.card.entersTapped,
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
  // A resolving permanent may itself be a type-changing static effect (Living
  // Lands, Kormus Bell, Blood Moon) or an aura that just attached one (Evil
  // Presence, via resolveEff's enchantLand case above) -- recompute for the
  // whole battlefield now that it's live.
  s = recomputeTypeEffects(s);
  // CR 704.5j: single insertion point for every resolveEff() case that can
  // place or change control of a permanent (normal ETB above, plus
  // stealCreature/copyPermanentCharacteristics/vesuvanEtbCopy/aladdinsSteal/
  // oldManSteal/enchantLand/enchantArtifact/oubliettePhaseOut/moldDemonETB/
  // shapeshifterETB/jihadETB/lichETB/reanimate/reanimateOwn/controlCreature/
  // fetchBasicToBf inside resolveEff -- every one of those is only ever
  // reached via this case, so checking once here after recomputeTypeEffects
  // covers all of them without threading each individually).
  s = checkLegendRule(s);
  return s;
}

case "DECLARE_ATTACKER": {
  if (s.phase !== PHASE.COMBAT_ATTACKERS) return s;
  const side = s.active;
  const c = s[side].bf.find(x => x.iid === action.iid);
  if (!c || !isCre(c) || c.tapped || (c.summoningSick && !hasKw(c, KEYWORDS.HASTE.id, s))) return s;
  // Wall of Wonder: "...can attack this turn as though it didn't have defender."
  // Adapted from Card-Forge/forge (w/wall_of_wonder.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (hasKw(c, KEYWORDS.DEFENDER.id, s) && !c.canAttackDespiteDefender) return dlog(s, `${c.name} has defender and cannot attack.`, "rule");
  if (c.cantAttackTurn && c.cantAttackTurn >= s.turn) return dlog(s, `${c.name} can't attack this turn (Wall of Dust effect).`, 'rule');
  // Moat: "Creatures without flying can't attack."
  // Adapted from Card-Forge/forge (m/moat.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if ([...s.p.bf, ...s.o.bf].some(m => m.name === 'Moat') && !hasKw(c, KEYWORDS.FLYING.id, s)) {
    return dlog(s, `${c.name} can't attack -- Moat allows only creatures with flying to attack.`, 'rule');
  }
  // Island Sanctuary: "...you can't be attacked except by creatures with flying
  // and/or islandwalk." Checked against the DEFENDING player's protection flag.
  // Adapted from Card-Forge/forge (i/island_sanctuary.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  {
    const defSide2 = side === 'p' ? 'o' : 'p';
    if (s[defSide2].islandSanctuaryProtected && !hasKw(c, KEYWORDS.FLYING.id, s) && !hasKw(c, KEYWORDS.ISLANDWALK.id, s)) {
      return dlog(s, `${c.name} can't attack -- Island Sanctuary protects the defending player.`, 'rule');
    }
  }
  // Brainwash: "Enchanted creature can't attack unless its controller pays {3}."
  // SIMPLIFICATION: no "decline to pay" UI -- auto-pays if able (same convention
  // as Demonic Hordes' "unless you pay" upkeep cost), otherwise blocks the attack.
  // Adapted from Card-Forge/forge (b/brainwash.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const brainwashAura = c.enchantments?.find(e => e.mod?.cantAttackUnlessPay);
  let sPay = s;
  if (brainwashAura) {
    const cost = brainwashAura.mod.cantAttackUnlessPay;
    if (!canPay(sPay[side].mana, String(cost))) {
      return dlog(sPay, `${c.name} can't attack -- ${side} can't pay {${cost}} (Brainwash).`, 'rule');
    }
    sPay = { ...sPay, [side]: { ...sPay[side], mana: payMana(sPay[side].mana, String(cost)) } };
    sPay = dlog(sPay, `${side} pays {${cost}} so ${c.name} can attack (Brainwash).`, 'mana');
  }
  s = sPay;
  // Goblin Rock Sled: "can't attack unless defending player controls a Mountain."
  // Adapted from Card-Forge/forge (g/goblin_rock_sled.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (c.attackRequiresDefenderLand) {
    const defSide = side === 'p' ? 'o' : 'p';
    const subLower = c.attackRequiresDefenderLand.toLowerCase();
    if (!s[defSide].bf.some(l => isLand(l) && l.subtype?.toLowerCase().includes(subLower))) {
      return dlog(s, `${c.name} can't attack -- defending player doesn't control a ${c.attackRequiresDefenderLand}.`, 'rule');
    }
  }
  // Leviathan: "can't attack unless you sacrifice two Islands. (This cost is
  // paid as attackers are declared.)" Only charged on a NEW attack declaration.
  // Adapted from Card-Forge/forge (l/leviathan.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (c.attackCostSacLands && !s.attackers.includes(action.iid)) {
    const { count, subtype } = c.attackCostSacLands;
    const matching = s[side].bf.filter(l => isLand(l) && l.subtype?.includes(subtype));
    if (matching.length < count) {
      return dlog(s, `${c.name} can't attack -- you don't control ${count} ${subtype}s to sacrifice.`, 'rule');
    }
    for (const land of matching.slice(0, count)) {
      s = zMove(s, land.iid, side, side, 'gy');
    }
    s = dlog(s, `${side} sacrifices ${count} ${subtype}(s) so ${c.name} can attack.`, 'effect');
  }
  const att = s.attackers.includes(action.iid);
  const atts = att ? s.attackers.filter(id => id !== action.iid) : [...s.attackers, action.iid];
  const atc = att
    ? (s.turnState.attackedThisCombat || []).filter(id => id !== action.iid)
    : [...(s.turnState.attackedThisCombat || []), action.iid];
  // Goblin Rock Sled: mark it so it skips its controller's next untap step.
  const goblinRockSledFlag = !att && c.doesNotUntapIfAttacked ? { skipNextUntap: true } : {};
  // Time Elemental: "When this creature attacks or blocks, at end of combat,
  // sacrifice it and it deals 5 damage to you." Only queued on a NEW attack
  // declaration (not when un-declaring via the toggle above).
  // Adapted from Card-Forge/forge (t/time_elemental.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // CR 702.22f: un-declaring an attacker removes it from combat, so any band
  // it had joined this combat is left behind too.
  const bandIdReset = att ? { bandId: null } : {};
  let ns3 = { ...s, attackers: atts, turnState: { ...s.turnState, attackedThisCombat: atc }, [side]: { ...s[side], bf: s[side].bf.map(x => x.iid === action.iid ? { ...x, attacking: !att, tapped: !att && !hasKw(x, KEYWORDS.VIGILANCE.id), ...goblinRockSledFlag, ...bandIdReset } : x) } };
  if (!att && c.sacrificeAtEndOfCombat) {
    ns3 = { ...ns3, turnState: { ...ns3.turnState, endOfCombatSacrifice: [...(ns3.turnState.endOfCombatSacrifice || []), c.iid] } };
  }
  return ns3;
}

// CR 702.22c: declares one new band from a set of currently-declared attacker
// iids, all controlled by the active player. One call = one band; a player
// may call this repeatedly during the same declare-attackers step to form
// several bands. Membership itself is looked up live elsewhere (see the
// banding helpers above resolveCombat) -- this action only records the
// grouping via a shared bandId.
case "FORM_BAND": {
  if (s.phase !== PHASE.COMBAT_ATTACKERS) return s;
  const iids = Array.isArray(action.iids) ? [...new Set(action.iids)] : [];
  if (iids.length < 1) return s;
  const side = s.active;
  const members = iids.map(iid => s[side].bf.find(c => c.iid === iid));
  if (members.some(c => !c)) return dlog(s, "Can't form a band -- a selected creature isn't on the battlefield.", "rule");
  if (members.some(c => !s.attackers.includes(c.iid))) return dlog(s, "Can't form a band -- every member must be a declared attacker.", "rule");
  if (members.some(c => c.bandId)) return dlog(s, "Can't form a band -- a selected creature is already in a band this combat.", "rule");
  const withBanding = members.filter(c => hasKw(c, KEYWORDS.BANDING.id, s));
  const withoutBanding = members.filter(c => !hasKw(c, KEYWORDS.BANDING.id, s));
  if (withBanding.length < 1) return dlog(s, "Can't form a band -- at least one member must have banding.", "rule");
  if (withoutBanding.length > 1) return dlog(s, "Can't form a band -- at most one member may lack banding.", "rule");
  const bandId = `band_${makeId()}`;
  let ns = { ...s, [side]: { ...s[side], bf: s[side].bf.map(c => iids.includes(c.iid) ? { ...c, bandId } : c) } };
  ns = dlog(ns, `${side} forms a band: ${members.map(c => c.name).join(', ')}.`, "effect");
  return ns;
}

case "DECLARE_BLOCKER": {
  const blOnP = s.p.bf.find(x => x.iid === action.blId);
  const blOnO = s.o.bf.find(x => x.iid === action.blId);
  const bl = blOnP || blOnO;
  const blSide = blOnP ? 'p' : 'o';
  const att = getBF(s, action.attId);
  if (!bl || !att || !s.attackers.includes(action.attId)) return s;
  // S17.6.2B: explicit protection enforcement with log message. Reads through
  // computeCharacteristics (not the raw att.protection field) so Aura-granted
  // protection (Artifact Ward, the Ward cycle) is caught here too.
  {
    const prot = computeCharacteristics(att, s).protection;
    const PROT_COLOR_MAP = { black:'B', white:'W', blue:'U', red:'R', green:'G', colorless:'C' };
    for (const quality of prot) {
      const matches = quality === 'artifact' ? isArt(bl) : bl.color === (PROT_COLOR_MAP[quality] || quality);
      if (matches) {
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
  // Abomination/Infernal Medusa/Cockatrice: "whenever this creature blocks or
  // becomes blocked by [a filtered creature], destroy that creature at end of
  // combat." card.blocksDestroyFilter checks the OTHER creature when THIS one
  // is declared as a blocker; card.blockedByDestroyFilter checks the blocker
  // when THIS one is the attacker being blocked. Battering Ram reuses this
  // same mechanism with the 'wall' filter ("whenever this creature becomes
  // blocked by a Wall, destroy that Wall at end of combat").
  // Adapted from Card-Forge/forge (b/battering_ram.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  // Only fires on a new block
  // (not when un-declaring one via the toggle below).
  // Adapted from Card-Forge/forge (a/abomination.txt, i/infernal_medusa.txt,
  // c/cockatrice.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const matchesDestroyFilter = (card, filter) => {
    if (filter === 'any') return true;
    if (filter === 'nonWall') return !card.subtype?.includes('Wall');
    if (filter === 'wall') return !!card.subtype?.includes('Wall');
    if (filter === 'greenOrWhite') return card.color === 'G' || card.color === 'W';
    return false;
  };
  const notAlreadyBlocking = ns2.blockers[action.blId] !== action.attId;
  if (notAlreadyBlocking) {
    if (bl.blocksDestroyFilter && matchesDestroyFilter(att, bl.blocksDestroyFilter)) {
      ns2 = { ...ns2, turnState: { ...ns2.turnState, endOfCombatDestroy: [...(ns2.turnState.endOfCombatDestroy || []), att.iid] } };
    }
    if (att.blockedByDestroyFilter && matchesDestroyFilter(bl, att.blockedByDestroyFilter)) {
      ns2 = { ...ns2, turnState: { ...ns2.turnState, endOfCombatDestroy: [...(ns2.turnState.endOfCombatDestroy || []), bl.iid] } };
    }
    // Time Elemental: "When this creature attacks or blocks..." -- the blocks half.
    if (bl.sacrificeAtEndOfCombat) {
      ns2 = { ...ns2, turnState: { ...ns2.turnState, endOfCombatSacrifice: [...(ns2.turnState.endOfCombatSacrifice || []), bl.iid] } };
    }
  }
  const already = ns2.blockers[action.blId] === action.attId;
  const nb = { ...ns2.blockers };
  if (already) delete nb[action.blId]; else nb[action.blId] = action.attId;
  let finalBlocking = already ? null : action.attId;
  let ns4 = { ...ns2, blockers: nb, [blSide]: { ...ns2[blSide], bf: ns2[blSide].bf.map(x => x.iid === action.blId ? { ...x, blocking: finalBlocking } : x) } };
  // Ydwen Efreet: "Whenever this creature blocks, flip a coin. If you lose the
  // flip, remove this creature from combat and it can't block this turn."
  // Clearing `blocking` here means the attacker it was blocking is automatically
  // treated as unblocked by resolveCombat -- no extra bookkeeping needed.
  // Adapted from Card-Forge/forge (y/ydwen_efreet.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (!already && bl.coinFlipOnBlock) {
    // OBSERVED (out of scope for this prompt): Math.random() here follows the
    // same already-flagged coin-flip idiom used elsewhere (Mana Clash) pending
    // a seeded-RNG migration.
    const won = Math.random() < 0.5;
    if (!won) {
      delete nb[action.blId];
      ns4 = { ...ns4, blockers: nb, [blSide]: { ...ns4[blSide], bf: ns4[blSide].bf.map(x => x.iid === action.blId ? { ...x, blocking: null, cantBlockThisTurn: true } : x) } };
      ns4 = dlog(ns4, `${bl.name} loses the coin flip -- removed from combat.`, 'effect');
    }
  }
  return ns4;
}

case "OPEN_PRIORITY_WINDOW":
  if (s.castleMod?.name === 'SILENCE' || s.dungeonMod === 'SILENCE') {
    return dlog(s, 'Silence prevents a priority window from opening.', 'info');
  }
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
  if (s.pendingCleanupDiscard) return s;
  if (s.pendingLampPicks?.length) {
    console.warn('[DuelCore] ADVANCE_PHASE blocked: lamp pick pending');
    return s;
  }
  if (s.pendingMarufPicks?.length) {
    console.warn('[DuelCore] ADVANCE_PHASE blocked: maruf pick pending');
    return s;
  }
  if (s.pendingRiverDivide || s.pendingRiverSides) {
    console.warn('[DuelCore] ADVANCE_PHASE blocked: river division or siding pending');
    return s;
  }
  s = { ...s, manaTapSnapshot: null };
  return advPhase(s);
}

case "RESOLVE_CLEANUP_DISCARD": {
  const pcd = s.pendingCleanupDiscard;
  if (!pcd) return s;
  const iids = Array.isArray(action.iids) ? action.iids : [];
  if (iids.length !== pcd.count) return s;
  if (new Set(iids).size !== iids.length) return s;
  const handIids = new Set(s[pcd.controller].hand.map(c => c.iid));
  if (!iids.every(iid => handIids.has(iid))) return s;
  let ns = s;
  for (const iid of iids) ns = discardCard(ns, pcd.controller, iid, { cause: 'gameRule' });
  ns = { ...ns, pendingCleanupDiscard: null };
  return dlog(ns, `${pcd.controller} discards ${iids.length} card(s) to hand size.`, 'effect');
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
  // Blood Moon / Evil Presence: a land whose subtype was fully replaced (landTypeOverride)
  // loses its printed abilities -- it's just a copy of that basic land type now. The
  // land's own basic-land-type mana ability is granted separately (TAP_LAND /
  // applyOvergrowthTap), never routed through ACTIVATE_ABILITY, so this guard safely
  // blocks every case below (activatedAbilities array and the single card.activated
  // field) without needing a per-case check. See docs/SYSTEMS.md S18.9.
  if (card.landTypeOverride) {
    return dlog(s, `${card.name}'s abilities are lost -- it's just a ${card.landTypeOverride} now.`, 'rule');
  }
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
      let ns = tapPermanent(s, 'p', iid);
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
      let ns = tapPermanent(s, w, iid);
      ns = hurtCreature(ns, tgt, 1, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
      return dlog(ns, `${card.name} deals 1 damage to ${targetC.name}.`, "effect");
    }

    if (ab.effect === "grantWalkSelfDamage2") {
      // Adapted from Card-Forge/forge (w/wormwood_treefolk.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
      if (!canPay(s[w].mana, ab.mana)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      let ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, ab.mana) } };
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.iid === iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [ab.walkKeyword] }] } : c) } };
      ns = hurt(ns, w, 2, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
      return dlog(ns, `${card.name} gains ${ab.walkName} until end of turn.`, "effect");
    }

    // Pyramids: "{2}: Choose one -- Destroy target Aura attached to a land. /
    // The next time target land would be destroyed this turn, remove all damage
    // marked on it instead." Both modes resolve immediately (no stack), matching
    // this array branch's convention for its other members, and dispatch through
    // resolveEff's shared destroyLandAura/preventLandDestructionOnce cases so the
    // targeting/fizzle logic isn't duplicated here.
    if (ab.effect === "destroyLandAura" || ab.effect === "preventLandDestructionOnce") {
      const cost = String(ab.cost?.generic ?? 0);
      if (!canPay(s[w].mana, cost)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      if (!tgt) return dlog(s, `No target selected for ${card.name}.`, "info");
      const ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, cost) } };
      const abItem = { id: makeId(), card: { ...card, effect: ab.effect }, caster: w, targets: [tgt], xVal: 1 };
      return resolveEff(ns, abItem);
    }

    // Vaevictis Asmadi: three independently repeatable "{B}/{R}/{G}: gets
    // +1/+0 until end of turn" abilities on one card -- the first card in the
    // codebase needing more than one activated pump ability, so it's modeled
    // as three activatedAbilities[] entries (same array already used for
    // Wormwood Treefolk's two walk abilities) rather than extending the
    // single-object card.activated shape, which has no precedent for holding
    // more than one ability.
    if (ab.effect === "pumpPowerSelf") {
      if (!canPay(s[w].mana, ab.mana)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      let ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, ab.mana) } };
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.iid === iid ? { ...c, eotBuffs: [...(c.eotBuffs || []), { power: 1 }] } : c) } };
      return dlog(ns, `${card.name} gets +1/+0 until end of turn.`, "effect");
    }

    // Safe Haven: "{2}, {T}: Exile target creature you control." Tracks the
    // exiled iid in exiledIids (an array, unlike Tawnos's Coffin's single
    // exiledCreatureIid, since Safe Haven can exile several creatures across
    // multiple activations before it's finally sacrificed) so
    // safeHavenUpkeep can return them all.
    if (ab.effect === "safeHavenExile") {
      const cost = String(ab.cost?.generic ?? 0);
      if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
      if (!canPay(s[w].mana, cost)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      if (!tgt) return dlog(s, `No target selected for ${card.name}.`, "info");
      const tgtC = s[w].bf.find(c => c.iid === tgt && isCre(c));
      if (!tgtC || tgtC.controller !== w) return dlog(s, `${card.name} can only exile a creature you control.`, "info");
      let ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, cost) } };
      ns = tapPermanent(ns, w, iid);
      ns = zMove(ns, tgt, w, w, "exile");
      ns = { ...ns, [w]: { ...ns[w], bf: ns[w].bf.map(c => c.iid === iid ? { ...c, exiledIids: [...(c.exiledIids || []), tgt] } : c) } };
      return dlog(ns, `${card.name} exiles ${tgtC.name}.`, "effect");
    }

    // Voodoo Doll: "{X}{X}, {T}: deals damage equal to the number of pin
    // counters on it to any target. X is the number of pin counters on this
    // artifact." X isn't freely player-chosen -- it's derived from the
    // counter count, so the generic cost is computed inline from
    // card.counters.PIN rather than through the normal player-chosen-X cost
    // path (same "compute a bespoke generic cost inline" idiom as Pyramids'
    // destroyLandAura/preventLandDestructionOnce case above).
    if (ab.effect === "voodooDollPing") {
      const pin = card.counters?.PIN || 0;
      if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
      if (pin <= 0) return dlog(s, `${card.name} has no pin counters.`, "info");
      const cost = String(pin * 2);
      if (!canPay(s[w].mana, cost)) return dlog(s, `Not enough mana to activate ${card.name}.`, "info");
      if (!tgt) return dlog(s, `No target selected for ${card.name}.`, "info");
      let ns = { ...s, [w]: { ...s[w], mana: payMana(s[w].mana, cost) } };
      ns = tapPermanent(ns, w, iid);
      if (tgt === "p" || tgt === "o") {
        ns = hurt(ns, tgt, pin, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
      } else {
        ns = hurtCreature(ns, tgt, pin, card.name, { sourceIid: card.iid, sourceType: inferSourceType(card) });
      }
      return dlog(ns, `${card.name} deals ${pin} damage.`, "effect");
    }

    return s;
  }

  if (!card.activated) return s;
  const act = card.activated;
  // Birds of Paradise: tap the bird, set pendingBop flag, UI shows BopColorPicker.
  if (act.effect === "addManaAny" && !action.chosenColor) {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = tapPermanent(s, 'p', action.iid);
    s = { ...s, pendingBop: true };
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
    s = tapPermanent(s, 'p', action.iid);
    s = {
      ...s,
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
      s = tapPermanent(s, 'p', iid);
    } else {
      // Tap centralization Phase 2: this mana ability has no {T} in its cost.
      // Artifact Possession / Haunting Wind / Powerleech watch for this.
      s = emitEvent(s, { type: 'ON_ABILITY_ACTIVATED_NO_TAP', payload: { cardId: iid, controller: 'p' } });
      s = processTriggerQueue(s);
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
    s = tapPermanent(s, 'p', iid);
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
  if (act.cost.includes("discardRandom") && !s[w].hand.length) {
    return dlog(s, `${card.name}: no card to discard.`, "info");
  }
  // Osai Vultures: "Remove two carrion counters..." -- same pre-flight shape
  // as sacArt/sacCre above, gating on counter availability instead.
  // Adapted from Card-Forge/forge (o/osai_vultures.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (act.cost.includes("counter2") && (card.counters?.CARRION || 0) < 2) {
    return dlog(s, `${card.name}: not enough carrion counters to activate.`, "info");
  }
  // Gate to Phyrexia / Life Chisel: "Activate only during your upkeep".
  if (act.myUpkeepOnly && (s.phase !== PHASE.UPKEEP || s.active !== w)) {
    return dlog(s, `${card.name} can only be activated during your upkeep.`, "info");
  }
  // "Activate only during your turn."
  if (act.myTurnOnly && s.active !== w) {
    return dlog(s, `${card.name} can only be activated during your turn.`, "info");
  }
  // Angus Mackenzie: "Activate only before the combat damage step." Blocks once
  // the current turn has reached (or passed) COMBAT_DAMAGE in PHASE_SEQUENCE;
  // resets naturally next turn when the phase cycles back to UNTAP.
  if (act.beforeCombatDamageOnly && PHASE_SEQUENCE.indexOf(s.phase) >= PHASE_SEQUENCE.indexOf(PHASE.COMBAT_DAMAGE)) {
    return dlog(s, `${card.name} can only be activated before the combat damage step.`, "info");
  }
  // Gate to Phyrexia: "and only once each turn".
  if (act.onceEachTurn && (s.turnState.activatedOnceIids || []).includes(iid)) {
    return dlog(s, `${card.name} has already been activated this turn.`, "info");
  }
  // Protection-from-targeting legality (S17.6.3/T extension): reject before
  // paying any cost if the chosen target has protection from this permanent.
  if (tgt) {
    const tgtPerm = getBF(s, tgt);
    if (tgtPerm && isProtectedFromSource(tgtPerm, card, s)) {
      const quality = isArt(card) ? 'artifact' : ({ W:'white', U:'blue', B:'black', R:'red', G:'green' }[computeCharacteristics(card, s).color] || 'colorless');
      return dlog(s, `${card.name} can't target ${tgtPerm.name} (protection from ${quality}).`, 'rule');
    }
  }

  // Sacrificed-card capture (Priest of Yawgmoth, Life Chisel): the resolving
  // effect needs the sacrificed permanent's stats, so it's threaded through
  // the ability item rather than re-derived after zMove strips it.
  let sacrificedCard = null;

  // 1. Tap cost
  if (act.cost.includes("T")) {
    if (card.tapped) return dlog(s, `${card.name} is already tapped.`, "info");
    s = tapPermanent(s, w, iid);
  } else {
    // Tap centralization Phase 2: this activated ability has no {T} in its cost.
    s = emitEvent(s, { type: 'ON_ABILITY_ACTIVATED_NO_TAP', payload: { cardId: iid, controller: w } });
    s = processTriggerQueue(s);
  }

  // 2. Sacrifice cost (e.g. Strip Mine: "T,sac"). Sacrifices the activating
  // permanent itself. Must happen before pushing to the stack so the source
  // is already gone by the time the ability resolves.
  if (act.cost.includes("sac") && !act.cost.includes("sacArt") && !act.cost.includes("sacCre")) {
    s = { ...s, turnState: { ...s.turnState, sacrificedIids: [...(s.turnState.sacrificedIids || []), iid] } };
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
    s = { ...s, turnState: { ...s.turnState, sacrificedIids: [...(s.turnState.sacrificedIids || []), art.iid] } };
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
    s = { ...s, turnState: { ...s.turnState, sacrificedIids: [...(s.turnState.sacrificedIids || []), cre.iid] } };
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
    s = discardCard(s, w, last.iid, { cause: 'cost', sourceName: card.name });
    s = dlog(s, `${card.name}: ${w} discards ${last.name}.`, "info");
  }

  // 2d'. Discard a card at random as a cost (Coral Helm).
  // Math.random() here: same flagged violation as discardX/discardOne/coinFlip sites.
  // Pending seeded-RNG migration (Milestone B).
  if (act.cost.includes("discardRandom")) {
    const h = s[w].hand;
    const idx = Math.floor(Math.random() * h.length);
    const dc = h[idx];
    s = discardCard(s, w, dc.iid, { cause: 'cost', sourceName: card.name });
    s = dlog(s, `${card.name}: ${w} discards ${dc.name} at random.`, "info");
  }

  // 3. Mana cost -- strip 'T', 'sac'-family tokens, and commas, parse remainder.
  // Any literal "X" is replaced with the paid xVal (Candelabra of Tawnos).
  // Gloom tax is applied to the raw cost string before stripping -- the
  // appended digit run survives every replace() below and lands safely in
  // the final generic bucket. See applyCostTax and docs/ENGINE_CONTRACT_SPEC.md.
  const taxedActCost = applyCostTax(act.cost, card, s, true);
  const manaPart = taxedActCost
    .replace(/discardLastDrawn/g, "")
    .replace(/discardRandom/g, "")
    .replace(/sacArt/g, "")
    .replace(/sacCre/g, "")
    .replace(/payLife2/g, "")
    .replace(/exile/g, "")
    .replace(/T/g, "")
    .replace(/sac/g, "")
    .replace(/,/g, "")
    .replace(/X/g, String(xValPaid))
    .trim();
  // Counter-cost abilities (e.g. Triskelion, Osai Vultures): cost is paid by
  // removing counter(s), not by spending mana. The effect handler (and, for
  // Osai Vultures, the pre-flight gate above) validates and removes the counter(s).
  if (manaPart && manaPart !== 'counter' && manaPart !== 'counter2') {
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

case "ACTIVATE_TEMP_ABILITY": {
  if (DECLARE_ONLY_PHASES.has(s.phase)) return dlog(s, "Cannot activate abilities during declare phase.", "rule");
  const { who, tempId } = action;
  const entry = s[who].tempAbilities?.find(a => a.id === tempId);
  if (!entry) return s;

  // Guard: if stored creature target has left the battlefield, refuse activation.
  if (entry.targetIid) {
    const targetStillThere = [...s.p.bf, ...s.o.bf].some(c => c.iid === entry.targetIid);
    if (!targetStillThere) {
      return dlog(s, `Target creature has left the battlefield -- ${entry.label} not activated.`, "rule");
    }
  }

  // Check mana: entry.cost is always "1" for Guardian Angel temp abilities.
  if (!canPay(s[who].mana, entry.cost)) {
    return dlog(s, `Not enough mana to activate ${entry.label}.`, "info");
  }

  let ns = { ...s, [who]: { ...s[who], mana: payMana(s[who].mana, entry.cost) } };
  ns = { ...ns, manaTapSnapshot: null }; // stale snapshot after mana spend

  // Apply +1 damageShield to stored target.
  if (entry.targetPlayer) {
    ns = { ...ns, [entry.targetPlayer]: { ...ns[entry.targetPlayer], damageShield: (ns[entry.targetPlayer].damageShield || 0) + 1 } };
  } else if (entry.targetIid) {
    const tgtCreature = [...ns.p.bf, ...ns.o.bf].find(c => c.iid === entry.targetIid);
    if (tgtCreature) {
      const tgtController = ns.p.bf.some(c => c.iid === entry.targetIid) ? 'p' : 'o';
      ns = { ...ns, [tgtController]: { ...ns[tgtController], bf: ns[tgtController].bf.map(c =>
        c.iid === entry.targetIid ? { ...c, damageShield: (c.damageShield || 0) + 1 } : c
      ) } };
    }
  }

  ns = dlog(ns, `${entry.label}: prevented 1 damage.`, "effect");
  return ns;
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
  const cobCard = s.p.bf.find(c => c.id === 'city_of_brass');
  const ns = hurt(s, 'p', 1, 'City of Brass', cobCard ? { sourceIid: cobCard.iid, sourceType: inferSourceType(cobCard) } : null);
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

case "LAMP_PICK": {
  const head = s.pendingLampPicks?.[0];
  if (!head) return s;
  // Integrity check: library top must match the shown cards.
  const expectedIids = head.cardIids;
  const actualIids = s[head.who].lib.slice(0, head.x).map(c => c.iid);
  if (JSON.stringify(expectedIids) !== JSON.stringify(actualIids)) {
    throw new Error('[DuelCore] LAMP_PICK: library changed while pick pending');
  }
  if (!expectedIids.includes(action.iid)) return s;

  // Reorder: chosen card on top, others to bottom in shuffled order.
  const lib = s[head.who].lib;
  const chosenIdx = lib.findIndex(c => c.iid === action.iid);
  const chosen = lib[chosenIdx];
  const others = [...lib.slice(head.x).reverse(), ...lib.slice(0, head.x).filter((_, i) => i !== chosenIdx)].reverse();
  const newLib = [chosen, ...shuffle(others)];

  let ns = {
    ...s,
    [head.who]: { ...s[head.who], lib: newLib },
    pendingLampPicks: s.pendingLampPicks.slice(1),
  };
  ns = dlog(ns, `Aladdin's Lamp: ${head.who} drew ${chosen.name}.`, 'effect');

  // Continue drawing: 1 more card from the remaining draw count, then re-enter for nested charges.
  return performDraws(ns, head.who, 1 + head.remainingDraws, head.followUps);
}

case "MARUF_PICK": {
  // Ring of Ma'ruf: resolve a suspended draw-replacement pick from the binder.
  // Adapted from Card-Forge/forge (r/ring_of_maruf.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  const head = s.pendingMarufPicks?.[0];
  if (!head) return s;
  const binder = s[head.who].binderIds || [];
  const idx = binder.indexOf(action.id);
  if (idx === -1) return s;
  // Mint a fresh instance: the fetched card joins the duel ephemerally; the
  // overworld binder itself is never mutated (the duel only holds a snapshot).
  const fetched = makeCardInstance(action.id, head.who);
  if (!fetched) return s;
  let ns = {
    ...s,
    [head.who]: {
      ...s[head.who],
      hand: [...s[head.who].hand, fetched],
      // Remove ONE occurrence: duplicate ids stay individually fetchable.
      binderIds: binder.filter((_, i) => i !== idx),
    },
    pendingMarufPicks: s.pendingMarufPicks.slice(1),
  };
  ns = dlog(ns, `Ring of Ma'r\u00fbf: ${head.who} reveals ${fetched.name} and puts it into their hand.`, 'effect');

  // The fetched card satisfied the replaced draw itself, so resume with only
  // the remaining draws -- no `+ 1`, unlike LAMP_PICK above.
  return performDraws(ns, head.who, head.remainingDraws, head.followUps);
}

case "RIVER_DIVIDE": {
  const div = s.pendingRiverDivide;
  if (!div || div.defender !== action.who) return s;

  const { leftIids, rightIids } = action;
  const allNonFlyers = new Set(div.nonFlyerIids);
  const leftSet = new Set(leftIids);
  const rightSet = new Set(rightIids);

  // Validate: left + right must equal allNonFlyers, disjoint.
  if (leftSet.size + rightSet.size !== allNonFlyers.size ||
      [...leftSet].some(iid => rightSet.has(iid))) {
    console.error('[DuelCore] RIVER_DIVIDE: invalid partition');
    return s;
  }

  // Stamp riverPile onto each creature.
  let ns = s;
  for (const iid of leftIids) {
    ns = { ...ns, [action.who]: { ...ns[action.who], bf: ns[action.who].bf.map(c =>
      c.iid === iid ? { ...c, riverPile: 'left' } : c
    ) } };
  }
  for (const iid of rightIids) {
    ns = { ...ns, [action.who]: { ...ns[action.who], bf: ns[action.who].bf.map(c =>
      c.iid === iid ? { ...c, riverPile: 'right' } : c
    ) } };
  }

  ns = { ...ns, pendingRiverDivide: null, pendingRiverSides: { chooser: div.attackingPlayer, attackerIids: [...s.attackers], sides: {} } };

  // Log the piles.
  const leftCreatures = ns[action.who].bf.filter(c => c.riverPile === 'left').map(c => c.name).join(', ') || '(none)';
  const rightCreatures = ns[action.who].bf.filter(c => c.riverPile === 'right').map(c => c.name).join(', ') || '(none)';
  ns = dlog(ns, `Raging River: left pile (${leftCreatures}), right pile (${rightCreatures}).`, 'effect');

  return ns;
}

case "RIVER_SIDES": {
  const sides = s.pendingRiverSides;
  if (!sides || sides.chooser !== action.who) return s;

  const { sides: sideMap } = action;
  // Validate: all attackers must have a side assignment.
  for (const aiid of sides.attackerIids) {
    if (!sideMap[aiid] || !['left', 'right'].includes(sideMap[aiid])) {
      console.error('[DuelCore] RIVER_SIDES: invalid side assignment');
      return s;
    }
  }

  // Stamp riverSide onto each attacker.
  let ns = s;
  for (const aiid of sides.attackerIids) {
    ns = { ...ns, [action.who]: { ...ns[action.who], bf: ns[action.who].bf.map(c =>
      c.iid === aiid ? { ...c, riverSide: sideMap[aiid] } : c
    ) } };
  }

  ns = { ...ns, pendingRiverSides: null, turnState: { ...ns.turnState, riverAppliedThisCombat: true } };

  // Log each attacker's side choice.
  for (const aiid of sides.attackerIids) {
    const attacker = ns[action.who].bf.find(c => c.iid === aiid);
    if (attacker) {
      ns = dlog(ns, `${attacker.name} charges to the ${sideMap[aiid]} of the river.`, 'effect');
    }
  }

  return ns;
}

case "RESOLVE_ANTE_EXCHANGE": {
  // Darkpact: reuses TutorModal for the picker (see pendingAnteExchange.cards),
  // but resolves differently -- the chosen ante card is exchanged with the top
  // card of the caster's library, not moved to hand. The exchanged-out ante
  // card is appended to the caster's library (not shuffled in -- the exact
  // insertion point isn't meaningfully random since only the top card of a
  // library is ever observable/exchangeable by existing effects).
  const pae = s.pendingAnteExchange;
  if (!pae) return s;
  const { caster, cards } = pae;
  const chosen = cards.find(c => c.iid === action.iid);
  if (!chosen) return s;
  const lib = s[caster].lib;
  if (!lib.length) {
    return dlog({ ...s, pendingAnteExchange: null }, `${caster}'s library is empty -- Darkpact's exchange fizzles.`, 'effect');
  }
  const [topCard, ...restLib] = lib;
  const scalarKey = caster === 'p' ? 'anteP' : 'anteO';
  const extraKey  = caster === 'p' ? 'anteExtraP' : 'anteExtraO';
  const chosenInScalar = s[scalarKey]?.iid === chosen.iid;
  const ns = {
    ...s,
    pendingAnteExchange: null,
    [caster]: { ...s[caster], lib: [...restLib, chosen] },
    [scalarKey]: chosenInScalar ? topCard : s[scalarKey],
    [extraKey]: chosenInScalar ? s[extraKey] : s[extraKey].map(c => c.iid === chosen.iid ? topCard : c),
  };
  return dlog(ns, `${caster} exchanges ${chosen.name} (ante) with ${topCard.name} (top of library).`, 'effect');
}

case "DECLINE_ANTE_EXCHANGE": {
  if (!s.pendingAnteExchange) return s;
  const { caster } = s.pendingAnteExchange;
  return dlog({ ...s, pendingAnteExchange: null }, `${caster} declines Darkpact's exchange.`, 'effect');
}

case "RESOLVE_DAMAGE_SHIELD_CHOICE": {
  // Circle of Protection / Eye for an Eye / Greater Realm of Preservation:
  // reuses TutorModal for the picker (see pendingDamageShieldChoice.pool).
  // Records the exact chosen iid (and its controller, needed for Eye for an
  // Eye's redirect) in turnState.damageShields, checked by hurt(). Jade
  // Monolith's variant carries tgtIid, which redirects the write to
  // turnState.creatureDamageShields[tgtIid] with the creature-shield entry
  // shape instead (see resolveDamageShieldChoice / chooseDamageShieldSourceForTarget).
  const pdsc = s.pendingDamageShieldChoice;
  if (!pdsc) return s;
  const { caster, mode, shieldSourceIid, shieldSourceName, gainLifeOnPrevent, tgtIid, pool } = pdsc;
  const chosen = pool.find(c => c.iid === action.iid);
  if (!chosen) return s;
  if (tgtIid) {
    const entry = { mode: 'redirect', chosenSourceIid: chosen.iid, redirectToPlayer: caster, shieldSourceIid, shieldSourceName };
    const ns = {
      ...s,
      pendingDamageShieldChoice: null,
      turnState: { ...s.turnState, creatureDamageShields: { ...s.turnState.creatureDamageShields, [tgtIid]: [...(s.turnState.creatureDamageShields?.[tgtIid] || []), entry] } },
    };
    return dlog(ns, `${shieldSourceName}: shields against ${chosen.name}.`, 'effect');
  }
  const entry = {
    chosenSourceIid: chosen.iid,
    chosenSourceController: chosen.controller,
    mode,
    shieldSourceIid,
    shieldSourceName,
    ...(gainLifeOnPrevent ? { gainLifeOnPrevent: true } : {}),
  };
  const ns = {
    ...s,
    pendingDamageShieldChoice: null,
    turnState: { ...s.turnState, damageShields: { ...s.turnState.damageShields, [caster]: [...(s.turnState.damageShields?.[caster] || []), entry] } },
  };
  return dlog(ns, `${shieldSourceName}: shields against ${chosen.name}.`, 'effect');
}

case "DECLINE_DAMAGE_SHIELD_CHOICE": {
  if (!s.pendingDamageShieldChoice) return s;
  const { shieldSourceName } = s.pendingDamageShieldChoice;
  return dlog({ ...s, pendingDamageShieldChoice: null }, `${shieldSourceName}: no source chosen.`, 'effect');
}

case "CONFIRM_TRANSMUTE_SACRIFICE": {
  const pts = s.pendingTransmuteSacrifice;
  if (!pts) return s;
  const { caster } = pts;
  const art = s[caster].bf.find(c => c.iid === action.iid);
  if (!art) return s;

  let ns = { ...s, turnState: { ...s.turnState, sacrificedIids: [...(s.turnState.sacrificedIids || []), art.iid] } };
  ns = zMove(ns, art.iid, caster, caster, 'gy');
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
    // CR 704.5j: Transmute Artifact's direct tutor-to-bf push isn't routed
    // through zMove or RESOLVE_STACK -- thread explicitly.
    return checkLegendRule(ns);
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
  // CR 704.5j: same direct tutor-to-bf push as CHOOSE_TUTOR_TRANSMUTE's
  // diff<=0 branch above, just on the paid-the-difference path.
  return checkLegendRule(ns);
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

  // Regrowth/Adun Oakenshield graveyard-card picker (kind: 'gyCardChoice'),
  // created directly from resolveEff (case "regrowth"/"regrowthCreature")
  // when 2+ eligible cards exist. Relocates to the same
  // applyRegrowthReturn/applyRegrowthCreatureReturn call the directly-passed-tgt
  // path already uses -- see those functions above createPendingChoice.
  if (choice.kind === 'gyCardChoice') {
    let ns = { ...s, pendingChoice: null };
    if (choice.mode === 'regrowthCreature') {
      return applyRegrowthCreatureReturn(ns, action.optionId, choice.controller, choice.cardName);
    }
    return applyRegrowthReturn(ns, action.optionId, choice.controller);
  }

  // CR 702.22j/k: banding damage-division order choices, created directly by
  // resolveCombat (getNextBandingChoice) rather than from a triggered ability.
  // Stores the chosen order under its key in turnState.combatDamageOrders,
  // then re-invokes resolveCombat -- either another still-unanswered choice
  // comes back (kind/options differ, same pendingChoice shape) or combat
  // actually resolves, in which case the post-steps normally run from
  // advPhase's COMBAT_DAMAGE transition run here instead.
  if (choice.kind === 'bandAttackerDamageOrder' || choice.kind === 'bandBlockerDamageOrder' || choice.kind === 'blazeOfGloryDamageOrder') {
    const chosen = choice.options.find(o => o.id === action.optionId) || choice.options[0];
    let ns = {
      ...s,
      pendingChoice: null,
      turnState: { ...s.turnState, combatDamageOrders: { ...(s.turnState.combatDamageOrders || {}), [choice.key]: chosen.order } },
    };
    ns = resolveCombat(ns);
    if (!ns.pendingChoice) ns = finishCombatDamagePostSteps(ns);
    return ns;
  }

  // Alchor's Tomb: color choice created directly from resolveEff (colorChoiceTarget),
  // not a triggered ability. Resolves by setting the targeted permanent's color
  // permanently, same field colorLace mutates.
  if (choice.kind === 'colorChoice') {
    let ns = { ...s, pendingChoice: null };
    const targetIid = choice.targetIid;
    const owner = ns.p.bf.some(c => c.iid === targetIid) ? 'p'
                : ns.o.bf.some(c => c.iid === targetIid) ? 'o'
                : null;
    if (!owner) return dlog(ns, `${choice.sourceCardName ?? 'Effect'} fizzles -- target no longer exists.`, "effect");
    const targetCard = ns[owner].bf.find(c => c.iid === targetIid);
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === targetIid ? { ...c, color: action.optionId } : c) } };
    return dlog(ns, `${targetCard.name} becomes ${action.optionId}.`, "effect");
  }

  // Primal Clay: ETB choice created directly from resolveEff (primalClayChoice),
  // not a triggered ability. Sets the entering permanent's power/toughness/
  // keywords (and, for the Wall mode, appends a subtype) in place -- same
  // find-by-iid-and-map shape as colorChoice above, applied to different fields.
  if (choice.kind === 'primalClayChoice') {
    let ns = { ...s, pendingChoice: null };
    const targetIid = choice.sourceCardId;
    const owner = ns.p.bf.some(c => c.iid === targetIid) ? 'p'
                : ns.o.bf.some(c => c.iid === targetIid) ? 'o'
                : null;
    if (!owner) return dlog(ns, "Primal Clay fizzles -- it's no longer on the battlefield.", "effect");
    const mode = choice.options.find(m => m.id === action.optionId);
    if (!mode) return ns;
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === targetIid ? {
      ...c,
      power: mode.power,
      toughness: mode.toughness,
      keywords: [...(c.keywords || []), ...mode.keywords],
      subtype: mode.subtypeSuffix ? (c.subtype ? `${c.subtype} ${mode.subtypeSuffix}` : mode.subtypeSuffix) : c.subtype,
    } : c) } };
    return dlog(ns, `Primal Clay becomes a ${mode.label}.`, "effect");
  }

  // Modal spells ("choose one --"): created directly from resolveEff (modalChoice),
  // not a triggered ability. Unlike 'triggered_ability_choice' below (which resolves
  // through the narrower resolveTriggeredEffect vocabulary), this re-enters resolveEff
  // itself so modal spells can use any existing spell-effect case by id.
  // Adapted from Card-Forge/forge (a/alabaster_potion.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (choice.kind === 'modalChoice') {
    const ns = { ...s, pendingChoice: null };
    const mode = choice.options.find(m => m.id === action.optionId);
    if (!mode) return ns;
    const resolved = resolveEff(ns, {
      card: { ...choice.card, effect: mode.effect },
      caster: choice.controller,
      targets: choice.tgt ? [choice.tgt] : [],
      xVal: choice.xVal,
    });
    // CR 704.5j: this re-enters resolveEff() directly (not via RESOLVE_STACK,
    // so its blanket post-resolveEff check doesn't cover this path) -- the
    // chosen mode could in principle be one of resolveEff's bf-affecting
    // cases (reanimate, controlCreature, ...), so thread explicitly.
    return checkLegendRule(resolved);
  }

  // Phantasmal Terrain: "As this Aura enters, choose a basic land type.
  // Enchanted land is the chosen type." Same shape as colorChoice above, applied
  // to the already-attached aura's mod.layerDef instead of the card's own color.
  // Adapted from Card-Forge/forge (p/phantasmal_terrain.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (choice.kind === 'basicLandTypeChoice') {
    let ns = { ...s, pendingChoice: null };
    const targetIid = choice.targetIid;
    const owner = ns.p.bf.some(c => c.iid === targetIid) ? 'p'
                : ns.o.bf.some(c => c.iid === targetIid) ? 'o'
                : null;
    // Giant Slug: "gains landwalk of the chosen type until the end of that
    // turn." Same basicLandTypeChoice request shape as Phantasmal Terrain
    // below, distinguished by the grantsLandwalkEOT flag set when the choice
    // was created (PHASE.UPKEEP drain of pendingUpkeepLandwalk) -- grants
    // itself the *WALK keyword via eotBuffs (same shape as grantFlyingEOT)
    // instead of recoloring an enchanted land.
    // Adapted from Card-Forge/forge (g/giant_slug.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
    if (choice.grantsLandwalkEOT) {
      if (!owner) return dlog(ns, "Giant Slug fizzles -- it's no longer on the battlefield.", "effect");
      const WALK_KW = {
        Plains: KEYWORDS.PLAINSWALK.id, Island: KEYWORDS.ISLANDWALK.id,
        Swamp: KEYWORDS.SWAMPWALK.id, Mountain: KEYWORDS.MOUNTAINWALK.id,
        Forest: KEYWORDS.FORESTWALK.id,
      };
      const kwId = WALK_KW[action.optionId];
      const slugName = ns[owner].bf.find(c => c.iid === targetIid)?.name || 'Giant Slug';
      ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === targetIid
        ? { ...c, eotBuffs: [...(c.eotBuffs || []), { keywords: [kwId] }] }
        : c) } };
      return dlog(ns, `${slugName} gains ${action.optionId}walk until end of turn.`, "effect");
    }
    if (!owner) return dlog(ns, "Phantasmal Terrain fizzles -- target no longer exists.", "effect");
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === targetIid ? {
      ...c, enchantments: (c.enchantments || []).map(e => e.iid === choice.sourceCardId
        ? { ...e, mod: { ...e.mod, layerDef: { layer: 4, setSubtypes: [action.optionId] } } }
        : e),
    } : c) } };
    ns = recomputeTypeEffects(ns);
    return dlog(ns, `Phantasmal Terrain: the enchanted land is now a ${action.optionId}.`, "effect");
  }

  // Jihad: "As this enchantment enters, choose a color and an opponent." The
  // opponent half is trivial in a 2-player duel (SIMPLIFICATION, same
  // convention as The Rack/Black Vise's hardcoded "opponent of controller").
  // Sets chosenColor/chosenPlayer on the source card itself, unlike
  // colorChoice (which recolors a separate target).
  // Adapted from Card-Forge/forge (j/jihad.txt), GPL-3.0. See THIRD_PARTY_NOTICES.md.
  if (choice.kind === 'jihadColorChoice') {
    let ns = { ...s, pendingChoice: null };
    const owner = choice.controller;
    const opp = owner === 'p' ? 'o' : 'p';
    ns = { ...ns, [owner]: { ...ns[owner], bf: ns[owner].bf.map(c => c.iid === choice.sourceCardId
      ? { ...c, chosenColor: action.optionId, chosenPlayer: opp }
      : c) } };
    return dlog(ns, `Jihad: chooses ${action.optionId} and targets the opponent.`, "effect");
  }

  // Takklemaggot: resolves the death-triggered choice created by
  // takklemaggotDeathTrigger() from zMove's aura-cascade -- created directly,
  // same convention as jihadColorChoice above (not a triggered ability, since
  // an embedded enchantments[] record has nowhere to hang a triggeredAbilities
  // entry the emitEvent scan would find). action.optionId is either a chosen
  // creature's iid or 'NONE' (decline -- becomes a pinger).
  if (choice.kind === 'takklemaggotReattachChoice') {
    let ns = { ...s, pendingChoice: null };
    const originalController = choice.originalController;
    const removeFromGy = (state) => ({ ...state, [originalController]: { ...state[originalController], gy: state[originalController].gy.filter(c => c.iid !== choice.sourceCardId) } });

    if (action.optionId !== 'NONE') {
      const targetIid = action.optionId;
      const tgtOwner = ns.p.bf.some(c => c.iid === targetIid) ? 'p' : ns.o.bf.some(c => c.iid === targetIid) ? 'o' : null;
      if (tgtOwner) {
        ns = removeFromGy(ns);
        const auraRecord = {
          iid: choice.sourceCardId, name: "Takklemaggot", mod: {},
          controller: originalController, cardData: choice.cardData,
          enterTs: (ns.layerClock ?? 0) + 1,
        };
        ns = { ...ns, layerClock: auraRecord.enterTs, [tgtOwner]: { ...ns[tgtOwner], bf: ns[tgtOwner].bf.map(c =>
          c.iid === targetIid ? { ...c, enchantments: [...(c.enchantments || []), auraRecord] } : c
        ) } };
        return dlog(ns, `Takklemaggot reattaches to ${getBF(ns, targetIid)?.name ?? 'the chosen creature'}.`, "effect");
      }
      return dlog(ns, "Takklemaggot: the chosen creature is no longer on the battlefield -- stays in the graveyard.", "effect");
    }

    ns = removeFromGy(ns);
    const ts = (ns.layerClock ?? 0) + 1;
    const pinger = {
      ...choice.cardData,
      iid: choice.sourceCardId, controller: originalController, type: "Enchantment", subtype: undefined,
      tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {},
      eotBuffs: [], enchantments: [], enterTs: ts,
      upkeep: "takklemaggotPingerUpkeep", pingerVictim: choice.victimController,
    };
    ns = { ...ns, layerClock: ts, [originalController]: { ...ns[originalController], bf: [...ns[originalController].bf, pinger] } };
    return dlog(ns, "Takklemaggot returns to the battlefield as a non-Aura enchantment.", "effect");
  }

  // Numeric choices ("choose a number between 0 and N"): Mind Bomb chains this
  // choice per-player (forPlayer/nextPlayer), Shapeshifter uses it standalone.
  // Adapted from Card-Forge/forge (m/mind_bomb.txt, s/shapeshifter.txt), GPL-3.0.
  // See THIRD_PARTY_NOTICES.md.
  if (choice.kind === 'numberChoice') {
    let ns = { ...s, pendingChoice: null };
    const n = Number(action.optionId) || 0;
    const handler = NUMBER_CHOICE_HANDLERS[choice.handlerKey];
    if (handler) ns = handler(ns, choice, n);
    if (choice.nextPlayer) {
      ns = createPendingChoice(ns, { ...choice, controller: choice.nextPlayer, forPlayer: choice.nextPlayer, nextPlayer: null });
    }
    return ns;
  }

  // Library of Leng: created directly from DISCARD_REPLACEMENTS['library_of_leng']
  // (see discardCard above), not a triggered ability. `queuedIids` chains a
  // multi-card discard (Wheel of Fortune, Mind Bomb, ...) through one
  // pendingChoice, one card at a time -- see docs/ENGINE_CONTRACT_SPEC.md S7.7.
  if (choice.kind === 'discardToLibraryChoice') {
    const controller = choice.controller;
    const cardInGy = s[controller].gy.find(c => c.iid === choice.cardIid);
    let ns = s;
    if (!cardInGy) {
      ns = dlog(ns, `Library of Leng: the discarded card is no longer in the graveyard -- choice fizzles.`, 'effect');
    } else if (action.optionId === 'library') {
      ns = {
        ...ns,
        [controller]: {
          ...ns[controller],
          gy: ns[controller].gy.filter(c => c.iid !== choice.cardIid),
          lib: [cardInGy, ...ns[controller].lib],
        },
      };
      ns = dlog(ns, `${controller} puts ${cardInGy.name} on top of their library.`, 'effect');
    } else {
      ns = dlog(ns, `${controller} keeps ${cardInGy.name} in their graveyard.`, 'effect');
    }

    if (choice.queuedIids.length) {
      const [nextIid, ...restQueue] = choice.queuedIids;
      const nextCard = ns[controller].gy.find(c => c.iid === nextIid);
      const nextName = nextCard?.name ?? 'the card';
      ns = {
        ...ns,
        pendingChoice: {
          ...choice,
          cardIid: nextIid,
          queuedIids: restQueue,
          options: [
            { id: 'graveyard', label: `Put ${nextName} into your graveyard` },
            { id: 'library', label: `Put ${nextName} on top of your library` },
          ],
        },
      };
    } else {
      ns = { ...ns, pendingChoice: null };
    }
    return ns;
  }

  // CR 704.5j (legend rule): the chosen permanent (action.optionId) stays;
  // every other permanent this controller has sharing choice.legendName goes
  // to its owner's graveyard. A legend-rule loss is a graveyard move, not a
  // destroy (CR 704.5j says "put into their owners' graveyards"), so this
  // uses zMove directly rather than checkDeath's destroy-and-log path.
  if (choice.kind === 'legendRuleChoice') {
    const controller = choice.controller;
    const rivals = s[controller].bf.filter(c => c.name === choice.legendName && c.iid !== action.optionId);
    let ns = { ...s, pendingChoice: null };
    for (const c of rivals) {
      ns = zMove(ns, c.iid, controller, controller, 'gy');
    }
    const kept = getBF(ns, action.optionId);
    ns = dlog(ns, rivals.length
      ? `Legend rule: ${controller} keeps ${kept?.name ?? choice.legendName} -- ${rivals.length} other cop${rivals.length === 1 ? 'y' : 'ies'} of ${choice.legendName} put into the graveyard.`
      : `Legend rule: ${controller} keeps ${kept?.name ?? choice.legendName}.`, 'effect');
    // Re-check: pendingChoice is now free, so if the OTHER player independently
    // has their own same-name violation (simultaneous, e.g. both players cast
    // the same legendary in quick succession), it gets queued here instead of
    // waiting for some unrelated later SBA-triggering event to find it.
    return checkLegendRule(ns);
  }

  // Default / 'triggered_ability_choice': resolve back through the triggered
  // ability that suspended the trigger queue (Soul Net and similar).
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

// Resumes a triggered ability suspended by ability.requiresTarget (see
// resolveTrigger) once the controller has picked a battlefield target --
// or declined, if action.iid is null (the ability is always optional,
// mirroring the printed "you may" wording on every card that currently uses
// this mechanism). Same suspend/re-insert/resume shape as RESOLVE_CHOICE's
// 'triggered_ability_choice' path above, but for a permanent target instead
// of a fixed option list.
case "RESOLVE_TRIGGER_TARGET": {
  if (!s.pendingTriggerTarget) return s;
  const pend = s.pendingTriggerTarget;
  const [pendingTrigger, ...remainingQueue] = s.triggerQueue;
  let ns = { ...s, pendingTriggerTarget: null, triggerQueue: remainingQueue };
  const sourceCard = [...ns.p.bf, ...ns.o.bf].find(c => c.iid === pend.sourceCardId);
  const ability = sourceCard?.triggeredAbilities?.find(a => a.id === pend.triggerId);
  if (!sourceCard || !ability) return processTriggerQueue(ns);
  if (!action.iid) return processTriggerQueue(ns);
  const tgtC = getBF(ns, action.iid);
  ns = resolveTriggeredEffect(ns, sourceCard, ability.effect, { ...(pendingTrigger?.eventPayload ?? {}), tgtC });
  return processTriggerQueue(ns);
}

case "UPKEEP_CHOICE_RESOLVE": {
  if (!s.pendingUpkeepChoice) return s;
  const choice = s.pendingUpkeepChoice;
  const handler = UPKEEP_CHOICE_HANDLERS[choice.handlerKey];
  let ns = handler ? handler.resolve(s, choice, action) : s;
  const queue = ns.pendingUpkeepChoiceQueue || [];
  ns = { ...ns, pendingUpkeepChoice: queue[0] ?? null, pendingUpkeepChoiceQueue: queue.slice(1) };
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
      const sinkLands = ns[targetCaster].bf.filter(c => isLand(c));
      for (const l of sinkLands) ns = tapPermanent(ns, targetCaster, l.iid);
      ns = { ...ns, [targetCaster]: { ...ns[targetCaster], mana: { W:0, U:0, B:0, R:0, G:0, C:0 } } };
      ns = dlog(ns, `Power Sink taps all ${targetCaster}'s lands and drains their mana pool.`, "effect");
    }
  }
  return ns;
}

case "SPHERE_TRIGGER_RESOLVE": {
  if (!s.pendingSphereTrigger) return s;
  const { sphereCardId, sphereCardName, controller, queue } = s.pendingSphereTrigger;
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
    const sphereCard = [...ns.p.bf, ...ns.o.bf].find(c => c.id === sphereCardId);
    ns = hurt(ns, controller, -1, sphereCardName, sphereCard ? { sourceIid: sphereCard.iid, sourceType: inferSourceType(sphereCard) } : null);
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
