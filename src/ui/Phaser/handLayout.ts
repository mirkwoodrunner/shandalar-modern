// src/ui/Phaser/handLayout.ts
// Pure layout math for the Phaser hand renderer.
// No Phaser import, no DOM access — this file must stay testable in isolation.

export interface HandCardLayout {
  iid: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  depth: number;
}

export interface HandLayoutConfig {
  viewportWidth: number;
  viewportHeight: number;
  cardWidth: number;
  cardHeight: number;
  maxFanAngle: number;
}

// Single source of truth for viewport-driven sizing.
// Desktop and mobile differ ONLY in these returned numbers — never in behavior.
export function getHandLayoutConfig(
  viewportWidth: number,
  viewportHeight: number,
): HandLayoutConfig {
  const isNarrow = viewportWidth <= 640;
  return {
    viewportWidth,
    viewportHeight,
    cardWidth:   isNarrow ? 64  : 100,
    cardHeight:  isNarrow ? 90  : 140,
    maxFanAngle: isNarrow ? 0.18 : 0.28,
  };
}

export function layoutHand(
  iids: string[],
  cfg: HandLayoutConfig,
): HandCardLayout[] {
  if (!Array.isArray(iids)) {
    throw new Error(`layoutHand: expected array of iids, got ${typeof iids}`);
  }
  const n = iids.length;
  if (n === 0) return [];

  const baseY   = cfg.viewportHeight - cfg.cardHeight * 0.55;
  const centerX = cfg.viewportWidth / 2;

  // Overlap cards when the fan would exceed 90% of viewport width.
  const naturalSpan = n * cfg.cardWidth;
  const maxSpan     = cfg.viewportWidth * 0.9;
  const step        = naturalSpan > maxSpan ? maxSpan / n : cfg.cardWidth;

  return iids.map((iid, i) => {
    if (typeof iid !== 'string' || !iid) {
      throw new Error(`layoutHand: bad iid at index ${i}: ${String(iid)}`);
    }
    const offset = i - (n - 1) / 2;
    const t      = n === 1 ? 0 : offset / ((n - 1) / 2);
    return {
      iid,
      x:        centerX + offset * step,
      y:        baseY + Math.abs(t) * cfg.cardHeight * 0.08,
      rotation: t * cfg.maxFanAngle,
      scale:    1,
      depth:    i,
    };
  });
}
