# Component Registry

## Hooks

### `useIsMobile(breakpoint?: number)`
- **File**: `src/hooks/useIsMobile.ts`
- **Purpose**: Returns `true` when `window.innerWidth ≤ breakpoint` (default 640 px). Updates reactively via `matchMedia`. Used by presentation components only — never imported into engine files.
- **Consumers**: `LifeTotal.tsx`, `Banner.tsx`
- **Note**: `src/hooks/useIsMobile.js` (768 px, ResizeObserver-based) was deleted as a stale duplicate; `.ts` (640 px, `matchMedia`-based) is canonical per `CLAUDE.md`.

## Components

### `OverworldGame`
- **File**: `src/OverworldGame.jsx`
- **Key state**: No map-scale state. The map container uses `flex: 1, height: '100%'` and a full-size centering wrapper; scaling is delegated to `WorldMap`.
- **Sidebar collapse**: On desktop (`!isMobile`), the right sidebar `display` is `'flex'` only when `log.length > 0`; collapses to `'none'` when the log is empty so the map fills full available width.

### `WorldMap`
- **File**: `src/ui/overworld/WorldMap.jsx`
- **Key state**:
  - `containerRef` (`React.RefObject`) — attached to the outer fill div inside `WorldMap`. Used by `useEffect` to measure available space.
  - `scale` (`number`, default `1`) — CSS transform scale applied to the grid wrapper. Computed as `Math.max(0.4, Math.min(containerW / gridW, containerH / gridH))` where `gridW = viewW * tileSize + 16`.
- **Resize listener**: `useEffect` (deps: `viewW`, `viewH`, `tileSize`) adds a `resize` listener on mount. Also fires via `setTimeout(50)` to handle initial paint. Measurement is taken at the grid container level inside `WorldMap`, not at the page-level wrapper.

### `ActionBar`
- **File**: `src/ui/ActionBar/ActionBar.tsx`
- **Props**:
  - `isPlayerPriority` (`boolean`, default `true`) — when `true`, the Pass Priority button uses the `'default'` `ActionButton` variant and shows "Pass Priority"; when `false`, uses the `'muted'` variant and shows "Waiting...". Button remains clickable in both states.
- **Source**: `isPlayerPriority` is computed in `DuelScreen.tsx` as `s.active === 'p' || (Boolean(s.priorityWindow) && s.priorityPasser !== 'p')`.

### `ActionButton`
- **File**: `src/ui/ActionBar/ActionButton.tsx`
- **Variants**: `'default'` | `'primary'` | `'end'` | `'ghost'` | `'muted'`
- **`muted` variant**: dark background (`#1a1a1a → #111`), grey border (`rgba(80,80,80,.35)`), grey text (`#555555`), no shadow. Used for the Pass Priority button when the player does not hold priority.

### `SandboxDebugPanel`
- **File**: inline JSX in `src/DuelScreen.tsx`, right sidebar
- **Render condition**: `config.sandbox === true && !isMobile` (desktop only; silent on mobile viewports ≤ 640px)
- **Shows**: opponent hand — each card by name and mana cost (face-up); full ordered opponent library top-to-bottom with 1-based position numbers; top card (#1) highlighted gold (`#f0c060`) and bold
- **Data sources**: `s.o.hand` and `s.o.lib` from `useDuel` state
- **No engine dependency**: reads state only; no dispatch or engine import

### `Mobile/ActionBar` — undo button
- **File**: `src/ui/Mobile/ActionBar.tsx`
- **testid**: `data-testid="undo-taps-button"` on the undo button (added alongside the fix that made the button phase-agnostic; previously absent)
- **Render condition**: `canUndo === true && sel === null` — button is the first child of the no-selection action bar

### `SandboxMobileApp` — sandbox-mobile entry point
- **File**: `src/App.jsx` (`SandboxMobileApp` function)
- **URL**: `/?duel=sandbox-mobile`
- **Purpose**: Renders `DuelScreenMobile` directly (bypassing `OverworldGame`) so Playwright tests can exercise the mobile component without driving the full overworld flow. Passes the same sandbox deck + injected cards as `SandboxApp`. Sets `config.sandbox = true` so the escape hatches (`window.__duelDispatch`, `window.__duelState`) are activated inside `DuelScreenMobile`.

### `DuelScreenMobile` — sandbox escape hatches
- **File**: `src/ui/Mobile/DuelScreenMobile.tsx`
- **Escape hatches**: `window.__duelDispatch` and `window.__duelState` are exposed (and cleaned up) via a `useEffect` gated on `config.sandbox`. Pattern mirrors `DuelScreen.tsx`. Active only when the component is mounted with `config.sandbox === true`.

## StackDisplay
Path: src/ui/Stack/StackDisplay.tsx
Props: stack (StackEntry[]), isMobile (boolean), bottomOffset (number, default 48)
Purpose: Renders the spell stack as a card splay. Top item fully visible with art and text.
Lower items show title bars only (desktop: hover for text; mobile: tap to expand).
Mobile: fixed bottom sheet above MobileActionDrawer (bottom: 48px from DuelScreen.tsx, 56px from DuelScreenMobile.tsx).
Desktop: overlay over battlefield center column.
data-testid: stack-display (root), stack-top-card (full top card), stack-title-bar (title bars)
