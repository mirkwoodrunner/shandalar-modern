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
 */
export function drawCharacters(ctx, opts) {
  const { playerPos, playerAnim, enemies, viewport, tileSize } = opts;

  // Tile world-coords → pixel center on canvas (accounting for 8px grid padding)
  const toCx = tx => (tx - viewport.x) * tileSize + 8 + tileSize / 2;
  const toCy = ty => (ty - viewport.y) * tileSize + 8 + tileSize / 2;

  // --- Enemies ---
  for (const enemy of enemies) {
    const cx = toCx(enemy.x);
    const cy = toCy(enemy.y);

    const s     = TIER_SIZE[enemy.tier] ?? 0.30;
    const scale = s / 0.40; // normalised to player proportions

    const bodyW = tileSize * 0.40 * scale;
    const bodyH = tileSize * 0.45 * scale;
    const headR = tileSize * 0.18 * scale;
    const legW  = tileSize * 0.12 * scale;
    const color = TIER_COLOR[enemy.tier] ?? '#a04030';

    drawSilhouette(ctx, cx, cy, bodyW, bodyH, headR, legW,
      enemy.animFrame, enemy.dir, color, darken(color, 30));

    // Tier indicator dot above head
    ctx.fillStyle = TIER_DOT[enemy.tier] ?? '#808080';
    ctx.beginPath();
    ctx.arc(cx, cy - bodyH / 2 - headR * 2 - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Player ---
  const cx = toCx(playerPos.x);
  const cy = toCy(playerPos.y);

  const bodyW = tileSize * 0.40;
  const bodyH = tileSize * 0.45;
  const headR = tileSize * 0.18;
  const legW  = tileSize * 0.12;

  ctx.save();
  ctx.shadowBlur  = 10;
  ctx.shadowColor = 'rgba(245,217,122,0.8)';

  drawSilhouette(ctx, cx, cy, bodyW, bodyH, headR, legW,
    playerAnim.frame, playerAnim.dir, '#f5d97a', '#c4a040');

  ctx.restore();
}
