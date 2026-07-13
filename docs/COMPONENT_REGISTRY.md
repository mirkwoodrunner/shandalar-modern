# Component Registry

## Hooks

### `useIsMobile(breakpoint?: number)`
- **File**: `src/hooks/useIsMobile.ts`
- **Purpose**: Returns `true` when `window.innerWidth ≤ breakpoint` (default 640 px). Updates reactively via `matchMedia`. Used by presentation components only — never imported into engine files.
- **Consumers**: `LifeTotal.tsx`, `Banner.tsx`
- **Note**: `src/hooks/useIsMobile.js` (768 px, ResizeObserver-based) was deleted as a stale duplicate; `.ts` (640 px, `matchMedia`-based) is canonical per `CLAUDE.md`.

## Components

### `useOverworldController`
- **File**: `src/hooks/useOverworldController.js`
- **Purpose**: Shared hook for all overworld game logic. Accepts `{ startConfig, onQuit, onScore, isCompactMobile }`. Returns flat `ctrl` object with all state, setters, derived flags, refs, and handlers. Both layout components call this via `OverworldGame.jsx` which passes `ctrl` as a prop.
- **Consumers**: `OverworldGameDesktop.jsx`, `OverworldGameMobile.jsx` (via `OverworldGame.jsx`)
- **Constraint**: Never import from engine files in layout components. All engine interaction flows through this hook.

### `OverworldGame`
- **File**: `src/OverworldGame.jsx`
- **Purpose**: Thin routing shell. Detects breakpoint at mount, calls `useOverworldController` once, routes duel/dungeon screens, and delegates to `OverworldGameDesktop` or `OverworldGameMobile`.

### `OverworldGameDesktop`
- **File**: `src/ui/overworld/OverworldGameDesktop.jsx`
- **Purpose**: Desktop overworld layout (> 640px). Receives `ctrl` prop from `OverworldGame.jsx`. No game state. No handlers declared here.
- **Key state**: No map-scale state. The map container uses `flex: 1, height: '100%'` and a full-size centering wrapper; scaling is delegated to `WorldMap`.
- **Sidebar collapse**: The right sidebar `display` is `'flex'` only when `log.length > 0`; collapses to `'none'` when the log is empty so the map fills full available width.

### `OverworldGameMobile`
- **File**: `src/ui/Mobile/OverworldGameMobile.jsx`
- **Purpose**: Compact mobile overworld layout (<= 640px). Receives `ctrl` prop. Local state: `drawerOpen` (bool), `drawerTab` ('info'|'mages'|'deck'|'magics'). Four inline drawer sub-components: `DrawerInfo`, `DrawerMages`, `DrawerDeck`, `DrawerMagics`.
- **Layout**: 44px topbar -> 24px tile strip -> flex-fill map -> 28px quick-stat bar -> fixed bottom sheet drawer.
- **Viewport**: 14x16 tiles. tileSize computed in controller.

### `WorldMap`
- **File**: `src/ui/overworld/WorldMap.jsx`
- **Key state**:
  - `containerRef` (`React.RefObject`) — attached to the outer fill div inside `WorldMap`. Used by `useEffect` to measure available space.
  - `scale` (`number`, default `1`) — CSS transform scale applied to the grid wrapper. Computed as `Math.max(0.4, Math.min(containerW / gridW, containerH / gridH))` where `gridW = viewW * tileSize + 16`.
- **Resize listener**: `useEffect` (deps: `viewW`, `viewH`, `tileSize`) adds a `resize` listener on mount. Also fires via `setTimeout(50)` to handle initial paint. Measurement is taken at the grid container level inside `WorldMap`, not at the page-level wrapper.
- **Anim props**: `playerAnim` (`{frame,dir,moving}|null`) and `enemyAnim` (`number`, shared enemy idle-bob frame) are threaded down to each `MapTile` and on to `Sprite` as `dir`/`frame`. `WorldMap` stays presentation-only; the anim state is owned by `useOverworldController` (`animState`).

### `Sprite`
- **File**: `src/ui/overworld/Sprite.jsx`
- **Purpose**: Image-sheet pixel-art renderer for overworld characters. Draws a `(dir, frame)` cell from a per-kind 128x128 sheet (4 dirs x 4 frames) onto a `<canvas>`. Per-color tinting recolors only the grayscale mass pixels (saturated accents kept), computed once per `kind:color` on a cached offscreen canvas. Exports `Sprite`, `SpriteStyles`, `spriteForMonster`, `spriteForHenchman`.
- **Props**: `kind`, `color`, `isPlayer` (default `false`), `name` (unchanged) plus **new** `dir` (`'up'|'down'|'left'|'right'`, default `'down'`) and `frame` (`0-3`, default `0`). Callers that omit `dir`/`frame` get the idle down-facing cell, so existing call sites stay valid.
- **Fallback**: missing/failed kind sheet -> recolored `mage` sheet; all sheets failed -> flat color-tinted square (no crash, no retry loop).

### `ActionBar`
- **File**: `src/ui/ActionBar/ActionBar.tsx`
- **Props**:
  - `isPlayerPriority` (`boolean`, default `true`) — when `true`, the Pass Priority button uses the `'default'` `ActionButton` variant and shows "Pass Priority"; when `false`, uses the `'muted'` variant and shows "Waiting...". Button remains clickable in both states.
- **Source**: `isPlayerPriority` is computed in `DuelScreen.tsx` as `s.active === 'p' || (Boolean(s.priorityWindow) && s.priorityPasser !== 'p')`.

### `ActionButton`
- **File**: `src/ui/ActionBar/ActionButton.tsx`
- **Variants**: `'default'` | `'primary'` | `'end'` | `'ghost'` | `'muted'`
- **`muted` variant**: dark background (`#1a1a1a → #111`), grey border (`rgba(80,80,80,.35)`), grey text (`#555555`), no shadow. Used for the Pass Priority button when the player does not hold priority.

### `DuelScreen`
- **File**: `src/DuelScreen.tsx`
- **Purpose**: Desktop duel layout. Assembles engine state (via `useDuelController`) into the full duel UI.
- Battlefield combat clicks (COMBAT_BLOCKERS, COMBAT_ATTACKERS) delegated to `handleBfClick` from `useDuelController`. Screen handles non-combat interactions only.

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
- Battlefield combat clicks (COMBAT_BLOCKERS, COMBAT_ATTACKERS) delegated to `handleBfClick` from `useDuelController`. Screen handles non-combat interactions only.

### `EnchantedCardSlot`
| EnchantedCardSlot | src/ui/Card/EnchantedCardSlot.tsx | Wraps FieldCard with attached aura splay. 30px peek per aura, right of host. Desktop: hover tooltip. Mobile: tap-to-expand bottom sheet. Pure presentation -- reads card.enchantments[], no state mutation. |

### `StackDisplay`
- **File**: `src/ui/Stack/StackDisplay.tsx`
- **Props**: `stack: StackEntry[]`, `isMobile: boolean`, `bottomOffset?: number` (default 48)
- **Mobile behavior**: Starts collapsed. Auto-expands when a new item is pushed
  onto the stack (`stack.length` increases). Collapsed state renders a centered
  pill (`data-testid="stack-pill"`) showing `▸ STACK (n)`. Expanded state
  renders the full card splay with a collapse button (`data-testid="stack-collapse-btn"`).
  Both states render `data-testid="stack-display"` on the outermost element.
- **Desktop behavior**: No collapsed state. Renders as a centered absolute overlay
  over the battlefield. Unchanged by this feature.
- **bottomOffset**: px distance from viewport bottom for fixed positioning.
  `DuelScreenMobile` passes 56 (ActionBar height). `DuelScreen` passes 48.
  Update these if ActionBar heights change.
- **data-testid inventory**: `stack-display` (root, both states), `stack-top-card` (full top card), `stack-title-bar` (title bars), `stack-pill` (collapsed pill span), `stack-collapse-btn` (expanded collapse button)

---

## TutorModal (`src/ui/duel/TutorModal.tsx`)

Shared library-search modal used by Demonic Tutor and the search step of Transmute Artifact. Renders when `s.pendingTutor.caster === 'p'`. Filtered by `pendingTutor.filter` (any/artifact/creature/etc). Search input, color filter (hidden for non-'any' filters), sort (CMC/Name/Type). Valid cards selectable above divider; invalid grayed below. "Decline to Find" always present in footer. Used by both DuelScreen.tsx and DuelScreenMobile.tsx.

Key props: `library` (shuffledLib array), `filter`, `onChoose(iid)`, `onDecline()`, `titleOverride?`.
data-testid: `tutor-modal` (root), `tutor-card-<id>` (valid card rows), `tutor-decline` (decline button).

## CleanupDiscardModal (`src/ui/duel/CleanupDiscardModal.tsx`)

Shared cleanup-step hand-limit discard modal. Renders when `s.pendingCleanupDiscard.controller === 'p'`. Multi-select: clicking a hand card toggles it into a local selection capped at `pendingCleanupDiscard.count`; the confirm button stays disabled until exactly `count` cards are selected. No decline button -- the discard is mandatory (CR 514.1). Used by both DuelScreen.tsx and DuelScreenMobile.tsx.

Key props: `hand` (player's hand array), `count` (number of cards to discard), `onConfirm(iids)`.
data-testid: `cleanup-discard-modal` (root), `cleanup-discard-card-<iid>` (hand card rows), `cleanup-discard-confirm` (confirm button).

## TransmuteSacrificeModal (`src/ui/duel/TransmuteSacrificeModal.tsx`)

Modal for the first step of Transmute Artifact: player selects which artifact on their battlefield to sacrifice, or declines. Renders when `s.pendingTransmuteSacrifice.caster === 'p'`.

Key props: `artifacts` (filtered bf), `onConfirm(iid)`, `onDecline()`.
data-testid: `transmute-sacrifice-modal` (root), `transmute-sacrifice-<id>` (artifact rows), `transmute-sacrifice-decline` (decline button).

## TransmutePayModal (`src/ui/duel/TransmutePayModal.tsx`)

Modal for the third step of Transmute Artifact: player taps mana to pay the CMC difference between chosen and sacrificed artifact. Shows running tapped/required counter. Confirm enabled when `tapped >= required`. Renders when `s.pendingTransmutePay.caster === 'p'`.

Key props: `required`, `tutoredCard`, `currentMana`, `snapshotMana`, `onConfirm()`, `onUndo()`, `onDecline()`.
data-testid: `transmute-pay-modal` (root), `transmute-pay-confirm`, `transmute-pay-undo`, `transmute-pay-decline`.
