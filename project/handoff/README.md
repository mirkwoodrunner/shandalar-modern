# Shandalar-modern · Claude Code Handoff (Design Port)

This folder breaks the duel-screen **design** port into **5 self-contained chunks**, each sized for a single Claude Code session. Run them in order.

## Scope

**Design only.** The card data layer and rules engine already exist in the target codebase — Claude Code is **not** rebuilding them. These chunks port the prototype's *look*, *layout*, and *interaction patterns* into the real React + TS app and wire them up to whatever engine + store API the codebase already exposes.

## Source of truth

The reference prototype lives at `duel-screen/Duel Battlefield.html` (root of this project). When a chunk says "match the prototype", it means visual + behavioral parity with that file. Read every component file under `duel-screen/components/` before starting Chunk 2.

## Target stack

- Vite 5 + React 18 + TypeScript 5 (strict)
- CSS modules + CSS custom properties for design tokens
- Whatever store the existing codebase uses — these chunks are written generically; replace `useDuel` / selectors with the real ones in your repo.

## Repository layout (target)

```
src/ui/
  tokens.css                # Chunk 1
  Card/
    FieldCard.tsx
    HandCard.tsx
    CardBack.tsx
    LandPip.tsx
    Cost.tsx
    FilCorner.tsx
    ArtPlaceholder.tsx
    frame.ts
  Battlefield/
    Battlefield.tsx
    Half.tsx
    Banner.tsx
  Phase/
    PhaseBar.tsx
    PhaseRibbon.tsx
  Hand/
    Hand.tsx
  Log/
    DuelLog.tsx
  ActionBar/
    ActionBar.tsx
    ActionButton.tsx
  Topbar/
    Topbar.tsx
  TargetArrow/
    TargetArrow.tsx
  TweaksPanel/
    TweaksPanel.tsx
```

## Chunk order

| # | File | Goal |
|---|---|---|
| 1 | `01-tokens-and-primitives.md` | Tokens, fonts, keyframes, primitive components (Pip, Cost, FilCorner, ArtPlaceholder) |
| 2 | `02-cards.md` | FieldCard, HandCard, CardBack, LandPip — pixel match the prototype |
| 3 | `03-layout.md` | Topbar, PhaseBar/Ribbon, Banner, Battlefield, Hand, Log, ActionBar laid out against engine state |
| 4 | `04-interaction.md` | Selection FSM, target arrow, keyboard shortcuts, AI animation cadence |
| 5 | `05-polish.md` | Card motion, stack viz, game-over, reduced-motion, focus rings, tweaks panel |

## How to use these files with Claude Code

For each chunk:

1. Open a fresh Claude Code session in the repo.
2. Paste the chunk file's contents as the opening prompt.
3. Let Claude Code read the prototype source (`duel-screen/`) for visual reference.
4. Stop and review at the **Definition of Done** checklist before moving on.

## Design token cheat sheet

Extracted from `cards.jsx` (`CFRAME`, `CCOLOR`, `MANA_BG`) and `Duel Battlefield.html`. Lands in `src/ui/tokens.css` during Chunk 1; every chunk references them by name.

```css
:root {
  /* Surfaces */
  --bg-void:        #050302;
  --bg-deep:        #0a0604;
  --bg-panel:       #14100a;
  --bg-panel-hi:    #1a1410;

  /* Ink */
  --ink-parchment:  #e8dcb0;
  --ink-muted:      #a89878;
  --ink-faint:      #7a6a48;
  --ink-dim:        #5a4a30;

  /* Brass / accent */
  --brass:          #c4a040;
  --brass-hi:       #ffe080;
  --brass-glow:     rgba(196,160,64,.4);

  /* Sides */
  --you:            #7ab84a;
  --opp:            #c45040;

  /* Mana pip backgrounds (W U B R G C) */
  --w:#e8d089; --u:#3d6fa8; --b:#5a3478; --r:#a83a22; --g:#3d7a32; --c:#7a6650;

  /* Card frame triplets — bg / border / glow */
  --frame-w-bg:#3a3424; --frame-w-bd:#8a7438; --frame-w-glow:#d4b870;
  --frame-u-bg:#1a2638; --frame-u-bd:#3d6fa8; --frame-u-glow:#6a9ad0;
  --frame-b-bg:#241a2c; --frame-b-bd:#5a3478; --frame-b-glow:#8c5cb0;
  --frame-r-bg:#2c1a16; --frame-r-bd:#8a3422; --frame-r-glow:#c4634a;
  --frame-g-bg:#1c2818; --frame-g-bd:#3d6a32; --frame-g-glow:#6a9a5a;
  --frame-a-bg:#1f2024; --frame-a-bd:#6a6e76; --frame-a-glow:#9aa0aa;

  /* Type pairing */
  --font-display:  'Cinzel', serif;
  --font-body:     'Crimson Text', serif;
  --font-mono:     'Fira Code', monospace;

  /* Motion */
  --t-fast: .15s;
  --t-med:  .25s;
  --t-slow: .45s;
}
```

## Conventions every chunk should follow

- **No hex literals in JSX/CSS.** Everything goes through tokens. If you need a new color, add a token first.
- **`data-iid` everywhere.** Every clickable card/land/life-total element renders `data-iid={instance.iid}` so `TargetArrow` can find it. Use `player-p` and `player-o` for the two life totals (matching the prototype).
- **Inline styles for one-off layout** (flex, gap), CSS modules for anything reused or stateful.
- **No new fonts** beyond Cinzel / Crimson Text / Fira Code.
- Components read engine state via the store/selectors that already exist in the repo. Don't import the engine directly.
