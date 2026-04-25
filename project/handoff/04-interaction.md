# Chunk 4 — Interaction & Targeting

**Goal:** Make the duel playable. Clicks dispatch real actions through the existing engine API. Target arrows track real selections. AI moves animate at a readable cadence.

## Prerequisites
- Chunk 3 complete.

## Read first
- `duel-screen/components/targetArrow.jsx` — port verbatim, just retype.
- `duel-screen/components/duelScreen.jsx` — `handleCardClick`, `handleEndTurn`, `handlePassPriority`, `handleCancel`, `arrowSource`/`arrowTarget` derivation.

## Interaction state machine

Live in the UI slice of whatever store the codebase uses:

```ts
type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'selecting-target'; sourceIid: string; needsTarget: 'creature' | 'player' | 'any' }
  | { kind: 'selecting-attackers'; chosen: Set<string> }
  | { kind: 'defending'; blocks: Map<string, string> };

interface UISlice {
  mode: InteractionMode;
  selCard: string | null;
  selTgt: string | null;
  hoverTarget: string | null;
}
```

Transitions:
- `IDLE` + click playable hand card → `SELECTING_TARGET` (or dispatch CAST immediately if no target needed).
- `IDLE` + click own creature in `COMBAT_ATTACKERS` → `SELECTING_ATTACKERS`.
- `SELECTING_TARGET` + click valid target → dispatch CAST → `IDLE`.
- `SELECTING_TARGET` + click selected card / Esc / Cancel → `IDLE`.
- AI declares attackers → auto-flip to `DEFENDING`.

## Required interactions

| Action | Trigger |
|---|---|
| Play land | Click hand land in main phase → engine action |
| Cast (no target) | Click hand spell, no target needed → cast |
| Cast (with target) | Click hand spell → enter `SELECTING_TARGET` → click target → cast |
| Tap land for mana | Click untapped land → engine action |
| Auto-pay | When casting, store auto-taps lands of right colors; flash them brass for 200ms |
| Declare attackers | Click own untapped non-sick creatures in `COMBAT_ATTACKERS`, then "Confirm" |
| Declare blockers | Click own creature, then attacker. "Confirm Blockers" finalizes |
| Pass priority | Existing button or Space |
| End turn | Existing button or Enter |
| Cancel | Esc or Cancel button |

## Target arrow

Port `duel-screen/components/targetArrow.jsx` to `TargetArrow/TargetArrow.tsx` unchanged in logic. It looks up source and target by `data-iid` so as long as Chunk 3 wired those, it works.

Wiring:
```ts
const sourceIid = mode.kind === 'selecting-target' ? mode.sourceIid : scenarioSource;
const targetIid = mode.kind === 'selecting-target'
  ? (ui.hoverTarget ?? ui.selTgt)
  : scenarioTarget;
```

(Scenario source/target come from the tweaks panel — see Chunk 5.)

## AI animation cadence

```ts
async function takeAITurn() {
  while (engineState.active === 'o' && !engineState.gameOver) {
    const action = chooseAction(engineState, 'o');
    dispatch(action);
    await delay(
      action.type === 'PLAY_LAND'         ? 350 :
      action.type === 'CAST'              ? 600 :
      action.type === 'PASS_PRIORITY'     ? 120 :
      action.type === 'DECLARE_ATTACKERS' ? 800 : 250
    );
  }
}
```

For `CAST`: briefly flash the source card with brass glow before applying.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Pass Priority |
| Enter | End Turn (only when nothing selected) |
| Esc | Cancel selection / blockers / attackers |
| 1–9 | Quick-cast hand card N (only if playable + no target needed) |

Bind on `window` with a single `useEffect` in the duel root. Skip if `document.activeElement` is an input.

## Hover affordances

- Hand card hovered + playable → existing green-glow state from Chunk 2.
- Battlefield card hovered while in `SELECTING_TARGET` and is a valid target → brass outline.
- Battlefield card hovered while in `SELECTING_TARGET` and is NOT a valid target → no change (don't show "no" cursor — the arrow simply won't snap there).

## Definition of Done

- [ ] A human can complete a full duel against the AI.
- [ ] Target arrow follows mouse during target selection without flicker.
- [ ] No illegal actions reachable from the UI (cast button disabled if can't pay).
- [ ] Keyboard shortcuts all work.
- [ ] AI moves visually paced — no instant snap to end-of-turn.
- [ ] Esc reliably exits any sub-mode.

## Out of scope
- Animation polish beyond arrow + AI pacing (Chunk 5).
- Tweaks panel UI (Chunk 5).
- Mulligan, game-over modal (Chunk 5).
