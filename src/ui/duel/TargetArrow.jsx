// src/ui/duel/TargetArrow.jsx
// Renders an SVG arrow from a selected card to its selected target.
// Presentation only. Uses data-iid attributes on card DOM elements to find endpoints.
// Per MECHANICS_INDEX.md §7.1

import React, { useEffect, useState, useCallback } from 'react';

/**
 * Returns the target category a card accepts, or 'none' if untargeted.
 * Categories: 'creature' | 'player' | 'any' | 'artifact' | 'land' |
 *             'permanent' | 'stack' | 'none'
 */
function getTargetCategory(card) {
  if (!card) return 'none';

  if (card.type === 'Enchantment' && card.subtype === 'Aura') return 'creature';

  switch (card.effect) {
    case 'damage3':
    case 'damageX':
    case 'psionicBlast':
    case 'chainLightning':
      return 'any';

    case 'draw3':
    case 'drawX':
    case 'discardX':
    case 'returnArtifacts':
    case 'manaShort':
    case 'drainPower':
    case 'damage5':
      return 'player';

    case 'destroy':
    case 'exileCreature':
    case 'bounce':
    case 'pumpCreature':
    case 'drainLife':
    case 'tapTarget':
    case 'controlCreature':
    case 'grantFlying':
    case 'berserk':
    case 'enchantCreature':
    case 'paralyze':
    case 'regrowthCreature':
      return 'creature';

    case 'destroyArtifact':
      return 'artifact';

    case 'destroyArtifactEnchantment':
      return 'artifactOrEnchantment';

    case 'destroyTargetLand':
      return 'land';

    case 'counter':
    case 'counterCreature':
    case 'powerSink':
    case 'forkSpell':
    case 'destroyRedOrCounter':
      return 'stack';

    case 'boomerang':
      return 'permanent';

    default:
      return 'none';
  }
}

/**
 * Returns true if targetIid is a legal target for the given category.
 * Player targets use sentinel strings 'player-p' and 'player-o'.
 */
function isLegalTarget(targetIid, category, state) {
  if (!targetIid || !state) return false;
  if (category === 'none') return false;

  const isPlayerTarget = targetIid === 'player-p' || targetIid === 'player-o';

  if (category === 'player') return isPlayerTarget;
  if (category === 'stack')  return false;

  if (isPlayerTarget) {
    return category === 'any';
  }

  const allBf = [...(state.p?.bf || []), ...(state.o?.bf || [])];
  const card = allBf.find(c => c.iid === targetIid);
  if (!card) return false;

  switch (category) {
    case 'any':       return true;
    case 'creature':  return card.type?.startsWith('Creature') ?? false;
    case 'artifact':  return card.type?.startsWith('Artifact') ?? false;
    case 'land':      return card.type?.startsWith('Land') ?? false;
    case 'permanent': return true;
    case 'artifactOrEnchantment':
      return (card.type?.startsWith('Artifact') || card.type?.startsWith('Enchantment')) ?? false;
    default:          return false;
  }
}

/**
 * Props:
 *   sourceIid    {string|null}  — iid of the source card (selCard)
 *   targetIid    {string|null}  — iid of the target card (selTgt)
 *   sourceCard   {object|null}  — card object from player's hand matching sourceIid
 *   state        {object|null}  — full duel state from useDuel
 *   containerRef {React.Ref}   — ref to the duel screen root div (for coordinate offset)
 */
export function TargetArrow({ sourceIid, targetIid, sourceCard, state, containerRef }) {
  const targetCategory = getTargetCategory(sourceCard);
  const isLegal = isLegalTarget(targetIid, targetCategory, state);

  const [arrow, setArrow] = useState(null); // { x1, y1, x2, y2 } in container coords

  const computeArrow = useCallback(() => {
    if (!sourceIid || !targetIid || !isLegal) {
      setArrow(null);
      return;
    }

    const srcEl = document.querySelector(`[data-iid="${sourceIid}"]`);
    const tgtEl = document.querySelector(`[data-iid="${targetIid}"]`);
    const container = containerRef?.current;

    if (!srcEl || !tgtEl || !container) {
      setArrow(null);
      return;
    }

    const cRect = container.getBoundingClientRect();
    const sRect = srcEl.getBoundingClientRect();
    const tRect = tgtEl.getBoundingClientRect();

    const x1 = sRect.left + sRect.width / 2 - cRect.left;
    const y1 = sRect.top + sRect.height / 2 - cRect.top;

    const x2 = tRect.left + tRect.width / 2 - cRect.left;
    const y2 = tRect.top + tRect.height / 2 - cRect.top;

    setArrow({ x1, y1, x2, y2 });
  }, [sourceIid, targetIid, isLegal, containerRef]);

  useEffect(() => {
    computeArrow();
  }, [computeArrow]);

  useEffect(() => {
    if (!sourceIid || !targetIid) return;
    window.addEventListener('resize', computeArrow);
    return () => window.removeEventListener('resize', computeArrow);
  }, [sourceIid, targetIid, computeArrow]);

  useEffect(() => {
    if (!sourceIid || !targetIid || !containerRef?.current) return;
    const ro = new ResizeObserver(computeArrow);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [sourceIid, targetIid, containerRef, computeArrow]);

  if (!arrow) return null;

  const { x1, y1, x2, y2 } = arrow;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 10) return null;

  const ux = dx / len;
  const uy = dy / len;
  const endX = x2 - ux * 16;
  const endY = y2 - uy * 16;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      <defs>
        <style>{`
          @keyframes arrowMarch {
            from { stroke-dashoffset: 18; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes arrowPulse {
            0%, 100% { opacity: 0.8; transform: scale(1); }
            50%       { opacity: 0.3; transform: scale(1.8); }
          }
          .arrow-line {
            animation: arrowMarch 0.5s linear infinite;
          }
          .arrow-pulse {
            animation: arrowPulse 1s ease-in-out infinite;
            transform-origin: center;
            transform-box: fill-box;
          }
        `}</style>

        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="#f0c040" opacity="0.9" />
        </marker>

        <filter id="arrowGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Shadow */}
      <line
        x1={x1} y1={y1} x2={endX} y2={endY}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Animated gold line */}
      <line
        className="arrow-line"
        x1={x1} y1={y1} x2={endX} y2={endY}
        stroke="#f0c040"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 3"
        markerEnd="url(#arrowhead)"
        filter="url(#arrowGlow)"
        opacity="0.85"
      />

      {/* Pulsing source dot */}
      <circle
        className="arrow-pulse"
        cx={x1} cy={y1}
        r="4"
        fill="#f0c040"
      />
    </svg>
  );
}

export default TargetArrow;
