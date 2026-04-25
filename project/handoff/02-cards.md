# Chunk 2 — Card Components

**Goal:** Port the four card variants from the prototype to React + TS components, pixel-matching the prototype.

## Prerequisites
- Chunk 1 complete.

## Read first
- `duel-screen/components/cards.jsx` — `FieldCard`, `HandCard`, `CardBack`, `LandPip`. Treat this file as the spec.

## Components

### `Card/FieldCard.tsx`
- Sizes: lg (96×134), sm (78×109).
- Layered structure (top to bottom): name bar → art window → type bar → text box → P/T plaque.
- Filigree in all four corners using `<FilCorner>`.
- States:
  - `tapped` → `transform: rotate(90deg)` with 350ms cubic-bezier ease.
  - `selected` → brass border + brass outer glow.
  - `attacking` → red border + red glow.
  - `summoningSick` → semi-opaque "SUMMONING" overlay.
  - `damage > 0` → P/T number turns red.
- Always renders `data-iid={card.iid}`.

### `Card/HandCard.tsx`
- 96×134 always.
- Receives `fanAngle` and `fanY` props (parent computes them).
- `transform-origin: 50% 130%` so the fan rotates around an off-card pivot.
- States:
  - `selected` → lift `-28px`, scale `1.08`, brass border + brass glow, `z-index: 100`.
  - `playable` → green border + green outer glow + 2px green strip along the bottom edge.
- `margin-left: -28px` to overlap neighbors.
- Always renders `data-iid={card.iid}`.

### `Card/CardBack.tsx`
- Two sizes: lg (96×134) and sm (42×60) — opponent hand uses sm.
- Radial-gradient maroon background with diagonal stripe overlay.
- Centered SVG sigil: two concentric circles + two crossed diamonds + central dot. Use the exact paths from the prototype.
- Same `transform: rotate()` + `translateY()` API as `HandCard` for fan effect.
- Opponent hand gets `transform: scaleY(-1) translateY(20px)` on its container so backs face inward.

### `Card/LandPip.tsx`
- 32×32 rounded square.
- Background = mana pip color from `--w`/`--u`/`--b`/`--r`/`--g`/`--c` (matches `produces[0]`).
- Big glyph centered: `☀ 💧 💀 🔥 🌿 ◆` for W/U/B/R/G/C.
- States: tapped (90° rotate, 0.55 opacity), selected (green or red border based on side).
- Always renders `data-iid={card.iid}`.

## Implementation tips

- The prototype uses inline styles heavily; that's fine for layout containers, but **move card-frame styles to `*.module.css`** because they have hover/transition rules that get noisy inline.
- Border colors use frame tokens; hover/selected states swap to `--brass`, `--you`, or `--opp`.
- Transitions: `transform .35s cubic-bezier(.4,1.4,.6,1)` on tap rotation, `.25s cubic-bezier(.3,1.3,.5,1)` on hand-card lift.

## Tests / verification

- `FieldCard.test.tsx` — renders P/T for `type: 'Creature'`, hides for non-creatures; applies tapped rotation when `tapped`.
- Visual check: side-by-side screenshot of prototype's cards vs. ported cards. Layout drift ≤ 2px.

## Definition of Done

- [ ] All four card components render and accept the props above.
- [ ] All four expose `data-iid` for the target arrow.
- [ ] Filigree corners visible at every size.
- [ ] Tapped → 90° rotation animation matches prototype timing.
- [ ] Hand fan with 6 cards looks identical to prototype.

## Out of scope
Battlefield layout, banners, log, action bar — all in Chunk 3.
