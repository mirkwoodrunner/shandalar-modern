// src/ui/overworld/OverworldCanvas.js
// Pure canvas rendering for the overworld character overlay layer.
// No React imports. No game state mutation. All drawing via canvas rect/arc calls.

const TIER_COLOR = { 1: '#a04030', 2: '#c05040', 3: '#e07060' };
const TIER_DOT   = { 1: '#808080', 2: '#c08040', 3: '#ff4040' };
// Size as fraction of tileSize (matches "30/35/40% tile" spec)
const TIER_SIZE  = { 1: 0.30, 2: 0.35, 3: 0.40 };

function darken(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8)  & 0xff) - amount);
  const b = Math.max(0, ((n)        & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawSilhouette(ctx, cx, cy, bodyW, bodyH, headR, legW, frame, dir, color, legColor) {
  ctx.fillStyle = color;

  // Body
  ctx.fillRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);

  // Head — offset horizontally when facing left/right
  const headOffX = dir === 'left' ? -2 : dir === 'right' ? 2 : 0;
  ctx.beginPath();
  ctx.arc(cx + headOffX, cy - bodyH / 2 - headR, headR, 0, Math.PI * 2);
  ctx.fill();

  // Legs — alternate up/down by 2px per frame
  ctx.fillStyle = legColor;
  const legH   = Math.max(3, bodyH * 0.40);
  const leftOff  = frame % 2 === 0 ? -2 : 0;
  const rightOff = frame % 2 === 0 ?  0 : -2;
  ctx.fillRect(cx - bodyW / 2,         cy + bodyH / 2 + leftOff,  legW, legH);
  ctx.fillRect(cx + bodyW / 2 - legW,  cy + bodyH / 2 + rightOff, legW, legH);
}

/**
 * Clear and redraw the entire character layer.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 *   opts.playerPos   {x, y}          — tile coords
 *   opts.playerAnim  {frame, dir, moving} — frame: 0–3, dir: 'up'|'down'|'left'|'right'
 *   opts.enemies     Array<{id, x, y, tier, animFrame, dir}>
 *   opts.viewport    {x, y}          — top-left tile of current view
 *   opts.tileSize    number          — pixels per tile (34)
 *   opts.tiles       Array<Array<{revealed}>> — full tile grid for visibility check
 */
export function drawCharacters(ctx, opts) {
  const { playerPos, playerAnim, enemies, viewport, tileSize, tiles } = opts;

  // Tile world-coords → pixel center on canvas (accounting for 8px grid padding)
  const toCx = tx => (tx - viewport.x) * tileSize + 8 + tileSize / 2;
  const toCy = ty => (ty - viewport.y) * tileSize + 8 + tileSize / 2;

  // Enemy and player sprites are now rendered as DOM elements via Sprite.jsx.
  // Canvas drawing suppressed to avoid double-rendering.
  void enemies; void playerPos; void playerAnim;
}
