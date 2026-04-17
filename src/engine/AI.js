// src/engine/AI.js
// AI decision generator — produces GameAction objects for DuelCore to execute.
// Per SYSTEMS.md §6 and MECHANICS_INDEX.md §2.1
//
// STRICT CONSTRAINTS (ENGINE_CONTRACT_SPEC.md §5):
//   ✔ May read GameState snapshots
//   ✔ May generate valid GameAction objects
//   ✗ CANNOT mutate GameState
//   ✗ CANNOT simulate combat results directly
//   ✗ CANNOT bypass DuelCore validation
//   ✗ CANNOT directly trigger system effects

import { ARCHETYPES } from '../data/cards.js';
import {
isLand, isCre, isInst,
getBF, getPow, getTou, canBlockDuel,
canPay, parseMana,
} from './DuelCore.js';

// ─── AI DECISION ENTRY POINT ─────────────────────────────────────────────────

/**

- Evaluate the current GameState snapshot and return an ordered array of
- GameAction objects. DuelCore will validate and execute each.
- 
- @param {object} state - Current GameState (read-only snapshot)
- @returns {GameAction[]}
  */
  export function aiDecide(state) {
  const acts = [];
  const arch = state.oppArch || ARCHETYPES.RED_BURN;
  const strat = arch.strategy;
  const inMain = (state.phase === "MAIN1" || state.phase === "MAIN2") && state.active === "o";

// ── 1. Play land ──────────────────────────────────────────────────────────
if (inMain && state.landsPlayed < 1) {
const landInHand = state.o.hand.find(isLand);
if (landInHand) acts.push({ type: "PLAY_LAND", who: "o", iid: landInHand.iid });
}

// ── 2. Choose best castable spell ─────────────────────────────────────────
if (inMain) {
const landInHand = state.o.hand.find(isLand);
const availableLandCount =
state.o.bf.filter(c => isLand(c) && !c.tapped).length +
(state.landsPlayed < 1 && landInHand ? 1 : 0);
const currentMana = Object.values(state.o.mana).reduce((a, b) => a + b, 0);
const maxAffordable = currentMana + availableLandCount;

const nonLands = state.o.hand.filter(c => !isLand(c));
const sorted = [...nonLands].sort((a, b) => strat === "aggro" ? b.cmc - a.cmc : a.cmc - b.cmc);
const bestSpell = sorted.find(c => c.cmc <= maxAffordable) || null;

// No castable spell — do not tap any lands to avoid mana burn.
if (bestSpell) {
  // Resolve target BEFORE tapping. If no valid target exists, skip
  // the spell entirely so we never tap lands that would burn unused.
  let tgt = null;
  if (["damage3","damage5","damageX","psionicBlast"].includes(bestSpell.effect)) tgt = "p";
  else if (["destroy","exileCreature","bounce"].includes(bestSpell.effect)) {
    const threats = state.p.bf.filter(isCre);
    if (threats.length) tgt = threats.reduce((a, b) => getPow(a, state) > getPow(b, state) ? a : b).iid;
    // else tgt stays null — no valid creature target
  }
  else if (["draw3","tutor","drawX","gainLifeX","gainLife3"].includes(bestSpell.effect)) tgt = "o";

  const needsCreatureTarget = ["destroy","exileCreature","bounce"].includes(bestSpell.effect);
  const canCast = !needsCreatureTarget || tgt !== null;

  // Only tap if we know the spell will actually be cast.
  if (canCast) {
    // Simulate tapping — build virtual mana pool, tap minimum required.
    // tappedIids tracks lands virtually tapped so the generic loop below
    // never double-emits TAP_LAND for a land already handled above.
    const vPool = { ...state.o.mana };
    const req = parseMana(bestSpell.cost);
    const tappedIids = new Set();

    const vCanPay = () => {
      const a = { ...vPool };
      for (const c of ["W","U","B","R","G","C"]) { if (a[c] < (req[c]||0)) return false; a[c] -= req[c]||0; }
      return Object.values(a).reduce((s,v) => s+v, 0) >= (req.generic||0);
    };

    // Tap artifact mana sources first
    for (const c of state.o.bf.filter(c => !isLand(c) && !c.tapped && c.activated?.effect?.startsWith("addMana"))) {
      if (vCanPay()) break;
      acts.push({ type: "TAP_ART_MANA", who: "o", iid: c.iid });
      const ms = c.activated.mana || "C";
      for (const ch of ms) if ("WUBRGC".includes(ch)) vPool[ch] = (vPool[ch] || 0) + 1;
    }

    if (!vCanPay()) {
      // Tap colored lands matching spell requirements
      const neededColors = ["W","U","B","R","G"].filter(cl => (req[cl]||0) > 0);
      for (const cl of neededColors) {
        for (const l of state.o.bf.filter(c => isLand(c) && !c.tapped && !tappedIids.has(c.iid) && c.produces?.includes(cl))) {
          if ((vPool[cl]||0) >= (req[cl]||0)) break;
          tappedIids.add(l.iid);
          acts.push({ type: "TAP_LAND", who: "o", iid: l.iid, mana: cl });
          vPool[cl] = (vPool[cl] || 0) + 1;
        }
      }
      // Tap generic lands — stop as soon as we can afford the spell.
      // Exclude lands already virtually tapped above.
      for (const l of state.o.bf.filter(c => isLand(c) && !c.tapped && !tappedIids.has(c.iid))) {
        if (vCanPay()) break;
        const m = l.produces?.[0] || "C";
        tappedIids.add(l.iid);
        acts.push({ type: "TAP_LAND", who: "o", iid: l.iid, mana: m });
        vPool[m] = (vPool[m] || 0) + 1;
      }
    }

    acts.push({ type: "CAST_SPELL", who: "o", iid: bestSpell.iid, tgt, xVal: 3 });
  }
}

}

// ── 3. Declare attackers — always attack with all eligible creatures ───────
// Per GDD Bug B9 fix: simplified AI always attacks.
if (state.phase === "DECLARE_ATTACKERS" && state.active === "o") {
const eligible = state.o.bf.filter(c => isCre(c) && !c.tapped && !c.summoningSick);
for (const att of eligible) {
acts.push({ type: "DECLARE_ATTACKER", iid: att.iid });
}
}

// ── 4. Declare blockers ───────────────────────────────────────────────────
if (state.phase === "DECLARE_BLOCKERS" && state.active === "p") {
const canBlock = state.o.bf.filter(c => isCre(c) && !c.tapped && !c.attacking);
const alreadyBlocking = new Set();

for (const attId of state.attackers) {
  const att = getBF(state, attId);
  if (!att) continue;
  const ap = getPow(att, state);
  const at = getTou(att, state);
  const valid = canBlock.filter(b => !alreadyBlocking.has(b.iid) && canBlockDuel(b, att));

  // Priority: trade > survive > forced (prevent lethal)
  const trade   = valid.find(b => getPow(b, state) >= at && getTou(b, state) > 0);
  const survive = valid.find(b => getTou(b, state) > ap);
  const forced  = state.o.life <= ap ? valid[0] : null;
  const chosen  = trade || survive || forced;

  if (chosen) {
    alreadyBlocking.add(chosen.iid);
    acts.push({ type: "DECLARE_BLOCKER", blId: chosen.iid, attId });
  }
}

}

return acts;
}

export default { aiDecide };
