# Mobile vs PC Layout Reference

## Overview

Shandalar Modern supports two layout modes detected at runtime via `useIsMobile()` (`src/hooks/useIsMobile.js`). The breakpoint is **768px viewport width**.

Desktop (> 768px) is the canonical experience. Mobile (≤ 768px) is an additive layout layer — no game logic differs between the two.

---

## Detection

```js
// src/hooks/useIsMobile.js
// Uses ResizeObserver on document.body + window resize fallback.
// Returns boolean. Re-renders consuming component on change.
const isMobile = useIsMobile();
```

---

## DuelScreen (`src/DuelScreen.tsx`)

|Element                             |Desktop                   |Mobile                                     |
|------------------------------------|--------------------------|-------------------------------------------|
|Left sidebar                        |Rendered (22vw, min 160px)|Hidden                                     |
|Right sidebar                       |Rendered (22vw, min 160px)|Hidden                                     |
|Sidebar content (log, ruleset, mana)|In sidebars               |`MobileActionDrawer` (fixed bottom, toggle)|
|Player hand container               |No bottom padding         |`paddingBottom: 44px` (clears drawer)      |
|Card sizes                          |Unchanged                 |Unchanged                                  |
|All game logic                      |Identical                 |Identical                                  |

### MobileActionDrawer

- Fixed to bottom of viewport, `zIndex: 200`
- Toggle button always visible (▲ / ▼)
- Expanded panel: mana pools + ruleset flags, `maxHeight: 35vh`, scrollable
- Collapsed by default

---

## OverworldGame (`src/OverworldGame.jsx`)

|Element              |Desktop              |Mobile                      |
|---------------------|---------------------|----------------------------|
|Log/Chronicle sidebar|Rendered             |Hidden                      |
|D-pad buttons        |Small (existing size)|`48x48px` min, larger font  |
|Tile viewport width  |`VIEW_W = 22`        |`12` tiles                  |
|Tile viewport height |`VIEW_H = 14`        |`9` tiles                   |
|Toolbar overflow     |`wrap`               |`nowrap` + horizontal scroll|
|All game logic       |Identical            |Identical                   |

---

## Rules for Future Mobile Changes

1. **Never modify desktop-path code** to accommodate mobile. Always branch with `isMobile`.
1. All mobile layout changes belong in `DuelScreen.tsx`, `OverworldGame.jsx`, or a new dedicated mobile component — not in engine files.
1. Document every new divergence in this file under the appropriate component's table.
1. If a new screen/component is added (e.g., dungeon), add its own section here before implementing mobile layout for it.
1. The breakpoint (768px) is defined only in `useIsMobile.js`. Change it there only.

---

## Known Gaps (not yet addressed)

- DungeonMap has no mobile layout (touch D-pad works but tile size is unoptimized)
- TownModal / CastleModal / DeckManager modals are not tested at mobile widths
- No pinch-to-zoom on the overworld canvas

These gaps should be tracked as issues and addressed in a follow-up pass.
