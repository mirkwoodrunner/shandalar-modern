# Chunk 5 — Polish, Tweaks, A11y

**Goal:** Final pass — animations, stack viz, mulligan, game-over modal, focus rings, reduced-motion, and the tweaks panel from the prototype.

## Prerequisites
- Chunk 4 complete; full duel playable.

## Read first
- `duel-screen/tweaks-panel.jsx` — the panel + `useTweaks` + control library.
- `duel-screen/components/duelScreen.jsx` — bottom of file: `<TweaksPanel>` + scenario list + arrow tweaks.

## Polish list

### Card motion
- **Hand → battlefield:** measure hand position with FLIP, animate to battlefield slot over 350ms.
- **Tap:** 350ms ease-out rotate to 90°. Mana pip fly-out: spawn a transient pip element at the land, animate to the pool readout, fade and remove.
- **Damage:** reuse `damageFlash` keyframe on the LifeTotal (already in tokens).
- **Death:** 400ms fade + scale-to-graveyard, then increment graveyard count.
- **Draw:** card slides from library to hand; the fan reflows.

### Stack visualization
When the engine's stack is non-empty:
- Render a centered "stack zone" with stacked card portraits, slight rotation per layer.
- Resolution: top card slides out 200ms toward its target, then is removed.

### Mulligan
At game start (or when the engine signals mulligan window):
- Show opening hand zoomed up, dialog with **Keep** / **Mulligan to N** buttons.
- London mulligan: down to N–1, then choose which to put on bottom.
- Block all duel input until resolved.

### Game-over modal
On engine-signaled game-over:
- Brass-bordered, parchment-backed modal.
- "Victory" / "Defeat" headline in Cinzel.
- Stat rundown: turns played, max single-turn damage, total cards cast.
- "New Duel" button → re-seeds and starts.

### Tweaks panel
Port from `duel-screen/tweaks-panel.jsx` and `duelScreen.jsx`'s tweak section. Required tweaks:

| Key | Control | Default |
|---|---|---|
| `arrowColor` | color | `#ffd060` |
| `arrowThickness` | slider 1–8, step 0.5 | 3 |
| `arrowStyle` | radio: solid / dashed / dotted | solid |
| `arrowGlow` | toggle | true |
| `arrowAnimate` | toggle | true |
| `scenario` | select (preset arrow scenarios) | spell-creature |
| `oppArchetype` | radio: aggro / control / midrange | midrange |
| `aiSpeed` | slider 100–1000ms | 400 |
| `seed` | number + Reroll button | random |

Use the prototype's `EDITMODE-BEGIN` / `EDITMODE-END` JSON marker convention so the host can persist tweaks.

### Accessibility
- `role="application"` on duel root with `aria-label="Duel"`.
- `aria-live="polite"` region echoing the latest log entry.
- Tab order: topbar → phase bar → opp battlefield → your battlefield → action bar → hand → sidebar.
- Arrow keys cycle hand cards; Enter selects.
- Visible focus ring: 2px `--brass` outline, offset 2px.
- Color-only state always has a redundant cue:
  - tapped: 90° rotation
  - summoning sick: overlay text
  - selected: brass border + brass glow
  - playable: green border + bottom strip

### Reduced motion
- `@media (prefers-reduced-motion: reduce)` disables `pulse`, `damageFlash`, `healFlash`, `phaseGlow`, FLIP card travel, and `TargetArrow`'s pulse animations.
- Tap rotation stays (semantically meaningful).

### Performance
- `React.memo` on `FieldCard`, `HandCard`, `LandPip` with shallow `card` equality.
- Replace the 200ms `setInterval` polling in `TargetArrow` with `requestAnimationFrame`, only running while a source is active.
- Cap UI log to last 200 entries.

### Persistence
- Save engine state + UI mode to `localStorage.shandalar:duel` on every dispatch.
- Restore on mount; show "Resume" if found.
- Clear on game end.

## Definition of Done

- [ ] Reduced-motion mode disables all decorative animation.
- [ ] Tab + arrow keys can drive a full duel without a mouse.
- [ ] Mulligan flows in & out cleanly.
- [ ] Game-over modal appears reliably.
- [ ] Tweaks panel persists settings via the host protocol.
- [ ] LocalStorage resume works across reload.
- [ ] No `console.error` / React warnings during a 5-minute play session.
- [ ] Lighthouse Accessibility ≥ 95.

## Out of scope (note in repo README as roadmap)
- Overworld map, deck builder, multiplayer, audio, real card art.
