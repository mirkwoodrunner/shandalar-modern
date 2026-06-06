# Mobile vs PC Layout Reference

## Overview

Shandalar Modern supports two layout modes detected at runtime.

**OverworldGame** uses `useIsMobile()` (breakpoint: **≤ 768px**) to adjust the map viewport, D-pad sizing, and toolbar.

**Duel screen** uses a separate breakpoint (**≤ 640px**) via `useMedia('(max-width: 640px)')`:
- At ≤ 640px: `DuelScreenMobile` — a fully separate component tree optimised for portrait phones (Variant B compact layout).
- Above 640px: `DuelScreen` — the existing desktop/tablet screen, unchanged.

Desktop (> 768px) remains the canonical experience. No game logic differs between platforms — both screens read from the same `useDuel` store.

---

## Detection

```js
// src/hooks/useIsMobile.js  — OverworldGame layout gate (≤ 768px)
// Uses ResizeObserver on document.body + window resize fallback.
const isMobile = useIsMobile();

// src/hooks/useIsMobile.ts  — presentation sizing hook (≤ 640px, matchMedia)
// Used by src/ui/Battlefield/Banner.tsx and LifeTotal.tsx to compact banner
// sizes when DuelScreen is active at 641–768px (isMobile=true but ≤640px=false).
// Not imported by engine or OverworldGame.
import { useIsMobile } from '../../hooks/useIsMobile'; // resolves to .ts

// src/hooks/useMedia.ts  — generic matchMedia hook
// Used by OverworldGame to gate the compact duel screen at ≤ 640px.
const isCompactMobile = useMedia('(max-width: 640px)');
```

---

## DuelScreen (`src/DuelScreen.tsx`) — Desktop/Tablet (> 640px)

|Element                             |Desktop (> 768px)         |Compact mobile (641–768px)                 |
|------------------------------------|--------------------------|-------------------------------------------|
|Left sidebar                        |Rendered (22vw, min 160px)|Hidden                                     |
|Right sidebar                       |Rendered (22vw, min 160px)|Hidden                                     |
|Sidebar content (log, ruleset, mana)|In sidebars               |`MobileActionDrawer` (fixed bottom, toggle)|
|Player hand container               |No bottom padding         |`paddingBottom: 44px` (clears drawer)      |
|Banner padding                      |`8px 14px`                |`4px 8px` (via `compact` prop)             |
|Banner gap                          |`16px`                    |`8px` (via `compact` prop)                 |
|Life number font size               |`52px`                    |`52px` (useIsMobile.ts 640px → false here) |
|Health bar height                   |`10px`                    |`10px` (same reason)                       |
|Card sizes                          |Unchanged                 |Unchanged                                  |
|All game logic                      |Identical                 |Identical                                  |

> **Note:** `LifeTotal.tsx` compact sizes (32px life font, 6px bar) only activate when `window.innerWidth ≤ 640px`. Since `DuelScreen` is only rendered for viewports > 640px, those values are reserved for devices that cross the threshold after duel launch (e.g., orientation changes when the duel was started just above 640px).

### MobileActionDrawer

- Fixed to bottom of viewport, `zIndex: 200`
- Toggle button always visible (▲ / ▼)
- Expanded panel: mana pools + ruleset flags, `maxHeight: 35vh`, scrollable
- Collapsed by default

---

## DuelScreenMobile (`src/ui/Mobile/DuelScreenMobile.tsx`) — Compact phones (≤ 640px)

A fully separate component tree. Rendered by `OverworldGame` when `useMedia('(max-width: 640px)')` is true.

### Layout (top → bottom)

| Zone | Component | Notes |
|------|-----------|-------|
| Top chrome | `Topbar` | Wordmark · T{n} pill · YOUR TURN/Opp · LOG + ⋯ |
| Phase ticker | `PhaseBar` | 12-pill horizontal scroll, auto-centers active pill |
| Phase plaque | `PhaseRibbon` | "PHASE · MAIN · 1" centred text |
| Opponent info | `Banner` (side="opp") | Life · LIB · GY · HAND chips · mana pool |
| Opp lands | `PipRow` | 26×26 land pips, wrap |
| Opp permanents | `Row` + `FieldCard` (perm) | 50×70, horizontal scroll |
| Opp creatures | `Row` + `FieldCard` (perm) | 50×70, horizontal scroll |
| Divider | — | "⟡ BATTLEFIELD ⟡" strip |
| Your creatures | `Row` + `FieldCard` (creature) | 64×90, horizontal scroll |
| Your permanents | `Row` + `FieldCard` (perm) | 50×70, horizontal scroll |
| Your lands | `PipRow` | 26×26 land pips, wrap |
| Player info | `Banner` (side="you") | Life · LIB · GY chips · mana pool |
| Action bar | `ActionBar` | 3-state: pass/end · CAST/PLAY · Activate |
| Stack display | `StackDisplay` | Fixed bottom sheet; starts **collapsed** (pill). Auto-expands on new stack item. Tap pill to expand, tap ▾ STACK to collapse. Never overlaps ActionBar. |
| Hand strip | — + `HandCard` | 88×126 cards, green-tinted strip, count badge |
| Log sheet | `LogSheet` | Portal to body; full bottom sheet (60vh); no peek strip |

### Component inventory (`src/ui/Mobile/`)

| File | Purpose |
|------|---------|
| `DuelScreenMobile.tsx` | Root — engine wiring, AI loop, game-over, selection state |
| `Topbar.tsx` | Top chrome bar |
| `PhaseBar.tsx` | 12-pill horizontal phase scroller |
| `PhaseRibbon.tsx` | Centred phase plaque |
| `Banner.tsx` | Life total + zone chips + mana pool |
| `ZoneChip.tsx` | Glyph + count + label chip |
| `Row.tsx` | Header strip + horizontal-scroll card track |
| `PipRow.tsx` | Header strip + wrapping pip grid |
| `FieldCard.tsx` | Compact permanent card (perm 50×70 / creature 64×90) |
| `HandCard.tsx` | Hand card 88×126 with lift/playable states |
| `LandPip.tsx` | 26×26 land pip, rotates when tapped |
| `ActionBar.tsx` | Context-aware 3-state action bar |
| `LogSheet.tsx` | Bottom-sheet log via `ReactDOM.createPortal` |
| `styles.module.css` | All mobile styles; references only CSS custom properties |

### Spell targeting and blocker declaration

| Feature | Status |
|---|---|
| Spell targeting (creature/player) | Implemented: targeting mode with highlight + Cast button (`needsExplicitTarget`, `targetingFor`/`pendingTarget` state, `Banner.onLifeClick`) |
| Blocker declaration | Implemented: two-step tap (select your creature → tap attacker), `DECLARE_BLOCKER` dispatch, Done = `requestPhaseAdvance` |

### Shared hooks used by DuelScreenMobile

- `useDuelController` — owns all AI loop, priority window, mulligan, game-over, and sandbox logic. Both screens delegate entirely to this hook.
- `useDuel` — called internally by `useDuelController`. Not imported directly by either screen.
- `usePhaseAdvance` — called internally by `useDuelController`.

### Battlefield card interaction (`handleBfCardClick`)

`DuelScreenMobile` routes player-battlefield clicks through `handleBfCardClick` (introduced after banner-compaction sprint). Priority order:

| Condition | Action |
|-----------|--------|
| Phase is `COMBAT_ATTACKERS` AND card is a Creature | `declareAttacker(iid)` — engine validates eligibility |
| `activated.effect === 'addMana3Any'` AND not tapped | `activateAbility` + show `LotusColorPicker` |
| `activated.effect === 'addMana'` AND not tapped | `tapArtifactMana(iid)` — direct tap, no Activate button |
| Card has non-mana `activated` ability OR `activatedAbilities` array | Toggle selection → Activate button in ActionBar |
| All other cases (plain creatures, `addManaAny`/BOP) | No action (BOP is a Known Gap) |

### Modals in DuelScreenMobile

| Modal | Trigger | Component |
|-------|---------|-----------|
| Mulligan | On mount (`showMulligan = true`) | `MulliganModal` from `src/ui/Mulligan/` |
| Black Lotus color pick | `handleBfCardClick` detects `addMana3Any` effect | `LotusColorPicker` from `TargetingOverlay.jsx` |
| Dual land color pick | `handleLandTap` detects `produces.length > 1` | `DualLandColorPicker` from `TargetingOverlay.jsx` |

All three modals use `position: fixed; z-index: 600` and are sourced from the same components as `DuelScreen`.

### Default targeting (`resolveDefaultTarget`)

Mobile `handleCast` uses `resolveDefaultTarget(card, state)` (module-level helper matching `DuelScreen.tsx`) to supply a default target when none is selected:

| Effect group | Default target |
|---|---|
| `damage3`, `damage5`, `damageX`, `psionicBlast`, `chainLightning` | `'o'` (opponent) |
| `draw3`, `gainLife3`, `gainLifeX`, `tutor`, `drawX` | `state.selTgt ?? 'p'` |
| All others | `state.selTgt ?? null` |

### Player-target effects (draw3 / Ancestral Recall)

| Mechanism | Desktop (`DuelScreen.tsx`) | Mobile (`DuelScreenMobile.tsx`) |
|---|---|---|
| How targeting activates | `playerTargetingActive` computed from `s.selCard` + `needsExplicitTarget()` | `targetingFor` / `pendingTarget` local state set on card tap |
| Life total affordance | `onLifeClick` passed to desktop `Banner`; renders a `<button aria-label="Target ...">` with `mdTargetPulse` animation wrapping `LifeTotal` | `onLifeClick` on mobile `Banner`; renders a pulsing `<button>` showing the life number |
| Target dispatch | `selectTarget('o')` or `selectTarget('p')` via `useDuelController` | `selectTarget('o')` or `selectTarget('p')` via `useDuelController` |
| `handleCast` guard | `if (needsExplicitTarget(card)) { const tgt = s.selTgt ?? null; if (!tgt) return; ... }` | Same guard |

---

## OverworldGame (`src/OverworldGame.jsx`)

|Element              |Desktop              |Mobile (≤ 768px)            |
|---------------------|---------------------|----------------------------|
|Duel screen rendered |`DuelScreen`         |`DuelScreenMobile` (≤ 640px), `DuelScreen` (641–768px)|
|Log/Chronicle sidebar|Rendered             |Hidden                      |
|D-pad buttons        |Small (existing size)|`48x48px` min, larger font  |
|Tile viewport width  |`VIEW_W = 22`        |`12` tiles                  |
|Tile viewport height |`VIEW_H = 14`        |`9` tiles                   |
|Toolbar overflow     |`wrap`               |`nowrap` + horizontal scroll|
|All game logic       |Identical            |Identical                   |

---

## Rules for Future Mobile Changes

1. **Duel screen changes at ≤ 640px** belong in `src/ui/Mobile/`. Do not add `isMobile` branches inside `DuelScreen.tsx` for compact-phone layout.
1. **OverworldGame and other non-duel screens** continue to use `isMobile` branching inside the existing component (breakpoint: 768px).
1. **Engine files** (`DuelCore.js`, `AI.js`, etc.) must never be conditioned on any mobile flag.
1. **Both duel screens read from the same `useDuel` store** — never fork the data layer.
1. **Screen-type choice is snapshotted at duel launch, not read live.** `OverworldGame` stores `duelScreenIsCompact` in state and sets it once alongside `setDuelCfg`. Never use the live `isCompactMobile` value in the render condition — doing so causes component-type swaps on orientation change which re-initialise the game engine and retrigger the mulligan.
1. Document every new divergence in this file under the appropriate component's table.
1. If a new screen/component is added (e.g., dungeon), add its own section here before implementing mobile layout for it.
1. The compact-phone breakpoint (640px) is defined only in the `useMedia` call in `OverworldGame.jsx`. The general mobile breakpoint (768px) is defined only in `useIsMobile.js`. Change each at its single source.

---

## Known Gaps (not yet addressed)

- DungeonMap has no mobile layout (touch D-pad works but tile size is unoptimised)
- TownModal / CastleModal / DeckManager modals are not tested at mobile widths
- No pinch-to-zoom on the overworld canvas
- DuelScreenMobile: no targeting arrows (TargetArrow overlay — Phase 8)
- DuelScreenMobile: no card-preview on long-press (Phase 8)
- DuelScreenMobile: BopColorPicker (Birds of Paradise) not yet wired; clicking BOP does nothing (mirrors `addMana3Any` Lotus pattern — needs `CHOOSE_BOP_COLOR` dispatch)
- DuelScreenMobile: `GameOverModal` not yet rendered (auto-return to overworld after 3 s works)
- DuelScreenMobile: no blocker declaration UI — **RESOLVED** (Sprint 8): two-step tap (select blocker → tap attacker), Done button calls `requestPhaseAdvance`
- DuelScreenMobile: no explicit card targeting for spells that require a creature target (enchantCreature, ping, etc.) — **RESOLVED** (Sprint 8): `needsExplicitTarget()` drives targeting mode; `pendingTarget` state; Banner `onLifeClick` for life-total targets
- DuelScreenMobile: `addManaAny` creatures (Birds of Paradise) effectively untappable for mana until BopColorPicker is wired

These gaps should be tracked as issues and addressed in a follow-up pass.
