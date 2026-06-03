# Failing E2E Tests: duel-controller.spec.ts — Tests 5 and 6

Both tests were already failing before the B32 sprint (pre-existing since commit 0449401).
They fail on both `chromium` and `mobile-chrome` Playwright configurations.

---

## Test 5: "AI cast opens priority window before stack resolves (desktop)"
## Test 6: "AI cast opens priority window before stack resolves (mobile)"

**File:** `e2e/duel-controller.spec.ts`
- Test 5: lines 105–152
- Test 6: lines 201–252

---

## What They Test

When the AI casts a spell on its turn, the player should receive a priority window
with the spell still on the stack before it resolves. This verifies that
`applyAiActionsWithPriority` in `src/hooks/useDuelController.ts` correctly pauses
after the AI's CAST_SPELL and opens the window before resolution.

---

## Setup Sequence

1. Navigate to `/?duel=sandbox&aiSpeed=0&cards=grizzly_bears`
2. Player casts Grizzly Bears, both players pass priority, `RESOLVE_STACK` fires — Bear lands on battlefield
3. AI is given Terror + mana via `SANDBOX_FORCE_HAND`: `{ who: 'o', cards: [terror], mana: { B: 1, C: 1 } }`
4. Two raw `PASS_PRIORITY` dispatches are fired (`who: 'p'` then `who: 'o'`) to try to advance the phase
5. Test waits up to 8s for `s.priorityWindow === true && s.stack.length > 0`

---

## Failure Point

The `waitForFunction` on step 5 times out after 8 seconds.
The AI never casts Terror onto the stack — `priorityWindow` stays false and `stack` stays empty.

---

## Likely Root Causes

### 1. Raw PASS_PRIORITY dispatches do not advance the phase
`PASS_PRIORITY` in DuelCore only operates within an already-open priority window
(`if (!s.priorityWindow) return s`). If no priority window is open at the moment
the dispatches fire, both are no-ops. The test then sits at the player's MAIN_1
with `active='p'` and the AI loop never fires.

### 2. Phase may not reach the AI's MAIN_1
Even if the passes land correctly, two priority passes only close one window.
Getting from the player's MAIN_1 all the way to the AI's MAIN_1 requires passing
through multiple phases. The test has no mechanism to drive that progression.

### 3. AI may not cast Terror even if its MAIN_1 is reached
- Terror requires a non-black, non-artifact creature target. Grizzly Bears qualifies,
  but the AI's targeting logic in `src/engine/AI.js` (`planMain`) must recognise
  the Bear as a valid target and decide Terror is worth casting.
- The AI's mana pool (`{ B: 1, C: 1 }`) may burn off at a phase boundary before
  the AI loop fires (mana burn is applied at every phase boundary per the Classic ruleset).

---

## Recommended Fix Approach

1. Replace the two raw `PASS_PRIORITY` dispatches with a `SET_PHASE_FOR_TEST`
   dispatch (added in B32 commit `ddb9324`) to jump directly to `phase='MAIN_1', active='o'`.
   This cleanly triggers the AI loop without relying on priority window state.

2. Give the AI its mana at the same time as the phase jump (or just after), so it
   hasn't burned before the AI loop fires.

3. In the `waitForFunction`, auto-pass priority for `'p'` if a window opens before
   the Terror cast (same pattern used to fix tests 1 and 2 in commit `95229e8`).

4. If the AI still does not cast Terror, add a `console.log` or debug dispatch to
   inspect what `aiDecide(s)` returns when Terror + valid target + mana are all present.

---

## Relevant Files

| File | Relevance |
|------|-----------|
| `e2e/duel-controller.spec.ts` | Test source (lines 105–152, 201–252) |
| `src/hooks/useDuelController.ts` | `applyAiActionsWithPriority` — pauses at CAST_SPELL and opens priority window |
| `src/engine/AI.js` | `aiDecide` / `planMain` — where Terror targeting and casting decisions live |
| `src/engine/DuelCore.js` | `PASS_PRIORITY`, `SET_PHASE_FOR_TEST`, mana burn at phase boundaries |
| `src/hooks/usePhaseAdvance.ts` | `requestPhaseAdvance` — opens priority window when instants are in hand |
