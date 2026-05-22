# Component Registry

## Hooks

### `useIsMobile(breakpoint?: number)`
- **File**: `src/hooks/useIsMobile.ts`
- **Purpose**: Returns `true` when `window.innerWidth ≤ breakpoint` (default 640 px). Updates reactively via `matchMedia`. Used by presentation components only — never imported into engine files.
- **Consumers**: `LifeTotal.tsx`, `Banner.tsx`

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
