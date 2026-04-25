# Chunk 3 — Layout & Static Composition

**Goal:** Compose the cards into the full duel screen layout, driven by real engine state. No interaction logic yet — `onClick` props can be inert.

## Prerequisites
- Chunk 2 complete.

## Read first
- `duel-screen/Duel Battlefield.html`
- `duel-screen/components/duelScreen.jsx` — full layout: top bar, opp hand, opp banner, opp battlefield, phase divider, your battlefield, your banner, action bar, your hand, sidebar.
- `duel-screen/components/panels.jsx` — `PhaseBar`, `LifeTotal`, `ZoneCount`, `DuelLog`, `ActionBar`, `ActionButton`.

## Components to build

### `Topbar/Topbar.tsx`
- Brass `SHANDALAR` wordmark (Cinzel, letter-spacing 2, brass glow).
- Dot separators between SHANDALAR · ruleset name · `TURN N` pill · turn-owner indicator.
- Right-aligned **Forfeit** ghost button (red-tinted).
- Below: `<PhaseBar>` (next component).

### `Phase/PhaseBar.tsx`
- 12 phase pills, exact sequence from prototype.
- Active pill: brass gradient + brass glow. Combat phases when active: red gradient + red glow.
- Inactive: muted brown background, faint border.
- `aria-current="step"` on the active pill.

### `Phase/PhaseRibbon.tsx`
- The centered "PHASE · MAIN · 1" plaque between the two battlefields.
- Brass-bordered, dark-gradient interior, brass-glow text.
- Wraps in a 40px-tall divider strip with red→brass→green gradient bands top-to-bottom.

### `Battlefield/Banner.tsx`
- One banner per side. Receives `side: 'you' | 'opp'`.
- Layout: `<LifeTotal>` · `<ZoneCount Library>` · `<ZoneCount Graveyard>` · optional pool display · spacer · flavor text.
- Background gradient tinted red (opp) or green (you).

### `Battlefield/LifeTotal.tsx`
- Big 52px Cinzel life number, color-coded by life total (red ≤5, orange ≤10, otherwise side-tinted).
- Mini progress bar below.
- `data-iid="player-p"` or `data-iid="player-o"` (target arrows hook these).
- Pulses (`pulse` keyframe) when life ≤ 5.
- `damage` / `heal` animation hooks via `anim` prop.

### `Battlefield/ZoneCount.tsx`
- Glyph + count + label stacked. Used for Library and Graveyard.

### `Battlefield/Battlefield.tsx`
- Composes opponent half (top), `<PhaseRibbon>`, your half (bottom).
- Each half has a lands strip (small, dashed-bottom-border header "LANDS · N") and a creature/permanent row beneath.

### `Hand/Hand.tsx`
- Computes fan offsets: `angle = (i - center) * 4`, `y = abs(i - center) * 6`.
- Player hand uses `<HandCard>`, opponent uses `<CardBack size="sm">` inside a `scaleY(-1) translateY(20px)` container.

### `Log/DuelLog.tsx`
- Auto-scroll to bottom on new entry.
- Tone-colored entries: turn (brass, all-caps, `═══` flanks), phase (italic muted), play (green), opp_play (orange), damage (red), heal (mint), info (faint).
- Header above: brass "Chronicle" with italic subtitle.

### `ActionBar/ActionBar.tsx` + `ActionButton.tsx`
- 4 button variants: default, primary (brass), end (red-tinted), ghost.
- Cinzel uppercase, letter-spacing 1.2, brightness boost on hover.
- Top filigree gradient line (transparent → brass → transparent).

### Layout root — `App.tsx` (or wherever the existing duel screen mounts)

```
<div class="duel">
  <Topbar />            // contains <PhaseBar />
  <main>
    <left-column>
      <Hand side="opp" />
      <Banner side="opp" />
      <Battlefield />     // includes <PhaseRibbon /> in the middle
      <Banner side="you" />
      <ActionBar />
      <Hand side="you" />
    </left-column>
    <Sidebar>
      <DuelLog />
      <DebugStrip />     // SEL.CARD / SEL.TARGET / ARROW readout
    </Sidebar>
  </main>
</div>
```

Sidebar is 280px wide, brass-tinted left border, panel-deep gradient background.

Root background: `radial-gradient(ellipse at 50% 50%, #1a1208 0%, #0a0604 70%, #050302 100%)`. Add this color as `--bg-radial-center` in tokens if you want it tokenized.

## Wiring

Read from whatever store/selectors the codebase already exposes. Components receive plain props — keep them dumb. Store-bound containers (e.g. `<HandContainer>`) live alongside but are thin wrappers.

`onClick` props can be inert / no-ops at this stage.

## Definition of Done

- [ ] Side-by-side screenshots: prototype vs build are visually equivalent (≤5px layout drift).
- [ ] Every interactive element renders `data-iid` (or `player-p`/`player-o` for life totals).
- [ ] PhaseBar marks the active phase with `aria-current="step"`.
- [ ] DuelLog auto-scrolls.
- [ ] No raw hex codes outside `tokens.css`.
- [ ] No `console.error` / React warnings.

## Out of scope
- Click handlers (Chunk 4).
- Target arrow rendering (Chunk 4).
- Animations beyond what already lives in tokens (Chunk 5).
