// src/ui/duel/TargetArrow.jsx
// Renders an SVG arrow from a selected card to its selected target.
// Presentation only. Uses data-iid attributes on card DOM elements to find endpoints.
// Per MECHANICS_INDEX.md §7.1

import React, { useEffect, useState, useCallback } from 'react';

/**
 * Props:
 *   sourceIid    {string|null}  — iid of the source card (selCard)
 *   targetIid    {string|null}  — iid of the target card (selTgt)
 *   containerRef {React.Ref}   — ref to the duel screen root div (for coordinate offset)
 */
export function TargetArrow({ sourceIid, targetIid, containerRef }) {
  const [arrow, setArrow] = useState(null); // { x1, y1, x2, y2 } in container coords

  const computeArrow = useCallback(() => {
    if (!sourceIid || !targetIid) {
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
  }, [sourceIid, targetIid, containerRef]);

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

      {/* Shadow line for depth */}
      <line
        x1={x1} y1={y1} x2={endX} y2={endY}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Main gold arrow line */}
      <line
        x1={x1} y1={y1} x2={endX} y2={endY}
        stroke="#f0c040"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 3"
        markerEnd="url(#arrowhead)"
        filter="url(#arrowGlow)"
        opacity="0.85"
      >
        <animate
          attributeName="strokeDashoffset"
          from="18"
          to="0"
          dur="0.5s"
          repeatCount="indefinite"
        />
      </line>

      {/* Pulse dot at source */}
      <circle cx={x1} cy={y1} r="5" fill="#f0c040" opacity="0.7">
        <animate
          attributeName="r"
          values="4;7;4"
          dur="1s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.8;0.3;0.8"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

export default TargetArrow;
