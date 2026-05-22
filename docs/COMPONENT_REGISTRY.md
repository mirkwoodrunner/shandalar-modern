# Component Registry

## Hooks

### `useIsMobile(breakpoint?: number)`
- **File**: `src/hooks/useIsMobile.ts`
- **Purpose**: Returns `true` when `window.innerWidth ≤ breakpoint` (default 640 px). Updates reactively via `matchMedia`. Used by presentation components only — never imported into engine files.
- **Consumers**: `LifeTotal.tsx`, `Banner.tsx`

## Components

### `OverworldGame`
- **File**: `src/OverworldGame.jsx`
- **Key state**:
  - `mapScale` (`number`, default `1`) — computed scale applied to the `WorldMap` transform. Replaces the old fixed `zoom` toggle.
  - `mapContainerRef` (`React.RefObject`) — ref attached to the map wrapper `<div>`. Used by the resize `useEffect` to read container dimensions for dynamic scale calculation.
- **Resize listener**: `useEffect` on mount adds a `resize` listener that calls `getBoundingClientRect()` on `mapContainerRef` and sets `mapScale = min(containerW / (VIEW_W*34+16), containerH / (VIEW_H*34+16), 2.0)`. Fires immediately and via `setTimeout(0)` to handle the initial paint.
- **Sidebar collapse**: On desktop (`!isMobile`), the right sidebar `display` is `'flex'` only when `log.length > 0`; collapses to `'none'` when the log is empty so the map fills full available width.
