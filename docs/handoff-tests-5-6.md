# Handoff: Fix E2E Tests 5 & 6

**Branch:** `claude/fix-duel-e2e-tests-5-6-IIW9s`  
**File:** `e2e/duel-controller.spec.ts`

---

## Goal

Tests 5 and 6 verify that when the AI casts Terror on its turn, the player receives
a priority window with Terror still on the stack before it resolves. Both tests
currently time out at the `waitForFunction` that checks:

```
priorityWindow === true  &&  stack contains terror
```

Both the `chromium` and `mobile-chrome` Playwright projects must pass.

---

## Confirmed Diagnostic State

A `[DIAG-5]` console.log block was added at line 182 of the test (temporary — remove
when fixed). It reads state 50 ms after the setup dispatches commit, before the AI
loop fires. Last run output:

```json
{
  "phase": "MAIN_1",
  "active": "o",
  "landsPlayed": 1,
  "oMulls": 2,
  "oMana": { "W":0, "U":0, "B":1, "R":0, "G":0, "C":1 },
  "pBf": ["forest", "grizzly_bears"],
  "oBf": [],
  "oHand": ["chain_lightning","disintegrate","mountain","mountain",
            "fireball","lightning_bolt","mountain","terror"],
  "stack": [],
  "priorityWindow": true
}
```

**Setup is correct.** `landsPlayed=1` (prevents AI playing Mountain), `oMana={B:1,C:1}`
(no R so red spells uncastable), bear is on `pBf`, terror is in `oHand`.

**The AI opened the priority window with an empty stack.** This means
`applyAiActionsWithPriority` ran but dispatched no `CAST_SPELL`. The AI tried to end
its main phase, and `usePhaseAdvance` opened the priority window because Instants exist
in the AI's hand (`chain_lightning`, `lightning_bolt`).

---

## Root Cause (Unconfirmed — Investigate Here)

`planMain` / `selectBestCurve` in `src/engine/AI.js` is **skipping Terror** despite:

- Terror being affordable (`{B:1,C:1}` covers `1B`)
- A valid target existing (`grizzly_bears` on `p.bf`)
- `scoreThreat(bear)` = `pow*2 + tou - 1(summoningSick)` = `2*2 + 2 - 1` = **5**,
  which is above `minThreatForRemoval = 2`

The session was interrupted while reading `AI.js` at `selectTarget` (line 332) and
`planMain` / `selectBestCurve`. **Start reading there** to find why Terror is not
being included in the planned actions.

Likely candidates:
- `selectBestCurve` discards spells whose target lookup fails for a different reason
- `planMain` calls `selectTarget` against `primaryVirtual` (a copy of state), not
  `state` directly — the virtual state's `p.bf` might not include the bear
- Some other guard in `planMain` eliminates Terror before `selectBestCurve` runs

---

## What Has Already Been Tried

| Attempt | Outcome |
|---|---|
| `workers: 1` in playwright.config.js | Already in place — not the issue |
| `page.route` Forest×20 to override player deck | Irrelevant — `sandbox-decklist.txt` feeds **player** deck, not AI's |
| MULLIGAN×2 for AI before inject | Working — `oMulls=2`, shouldMulligan returns false |
| Inject `{B:1,C:1}` mana only (no R) | Correct — diagnostic confirms pool |
| `PLAY_LAND` for player Forest so `landsPlayed=1` | Working — diagnostic confirms `landsPlayed=1`, AI doesn't play Mountain |

---

## Protected Files — Do Not Modify

```
src/engine/DuelCore.js
src/engine/AI.js
src/data/cards.js
src/hooks/useDuel.js
src/hooks/useDuelController.ts
src/engine/cardHandlers.js
src/engine/phases.js
```

The fix must live in **`e2e/duel-controller.spec.ts`** (adjust the test setup so the
AI actually casts Terror), and/or **`src/App.jsx`** if the sandbox config needs
changing. Do not touch the engine.

---

## After Tests Pass

Remove the `[DIAG-5]` block (lines 182–195 of the spec) and update docs:

| Doc | What to update |
|---|---|
| `docs/gdd.md` | Add changelog entry |
| `docs/SYSTEMS.md` | Update priority-window / AI-cast section |
| `docs/CURRENT_SPRINT.md` | Mark deliverables complete |
| `docs/MECHANICS_INDEX.md` | Add traceability entry |
| `docs/COMPONENT_REGISTRY.md` | Update if components changed |

Then commit and push to `claude/fix-duel-e2e-tests-5-6-IIW9s`.
