import { useState, useEffect, useRef } from 'react';

interface ArrowCoords {
  x1: number; y1: number;
  x2: number; y2: number;
}

interface TargetArrowProps {
  sourceIid: string | null;
  targetIid: string | null;
  color?: string;
  thickness?: number;
  style?: 'solid' | 'dashed' | 'dotted';
  glow?: boolean;
  animate?: boolean;
}

export function TargetArrow({
  sourceIid,
  targetIid,
  color = '#ffd060',
  thickness = 3,
  style = 'solid',
  glow = true,
  animate = true,
}: TargetArrowProps) {
  const [coords, setCoords] = useState<ArrowCoords | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!sourceIid || !targetIid) { setCoords(null); return; }

    const measure = () => {
      const src = document.querySelector(`[data-iid="${sourceIid}"]`);
      const tgt = document.querySelector(`[data-iid="${targetIid}"]`);
      if (!src || !tgt) { setCoords(null); return; }
      const sr = src.getBoundingClientRect();
      const tr = tgt.getBoundingClientRect();
      setCoords({
        x1: sr.left + sr.width / 2,  y1: sr.top + sr.height / 2,
        x2: tr.left + tr.width / 2,  y2: tr.top + tr.height / 2,
      });
    };

    // rAF loop — only runs while source+target exist
    const loop = () => {
      measure();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [sourceIid, targetIid]);

  if (!coords) return null;
  const { x1, y1, x2, y2 } = coords;

  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const midx = (x1 + x2) / 2, midy = (y1 + y2) / 2;
  const perpOffset = Math.min(80, dist * 0.25);
  const nx = -dy / (dist || 1), ny = dx / (dist || 1);
  const cx = midx + nx * perpOffset, cy = midy + ny * perpOffset;

  const dashArray = style === 'dashed' ? '8 5' : style === 'dotted' ? '2 4' : 'none';
  const arrowId = `arrow-${sourceIid}-${targetIid}`.replace(/[^a-z0-9-]/gi, '_');
  const glowFilter = glow ? `url(#${arrowId}-glow)` : undefined;

  return (
    <svg style={{
      position: 'fixed', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 90,
    }}>
      <defs>
        <marker id={arrowId} viewBox="0 0 12 12" refX="6" refY="6"
          markerWidth={thickness * 2.2} markerHeight={thickness * 2.2}
          orient="auto-start-reverse">
          <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z"
            fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
        </marker>
        <filter id={`${arrowId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.7" />
          <feComposite in2="blur" operator="in" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={x1} cy={y1} r="6" fill={color} opacity="0.85" filter={glowFilter}>
        {animate && <animate attributeName="r" values="4;8;4" dur="1.4s" repeatCount="indefinite" />}
        {animate && <animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite" />}
      </circle>

      <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
        stroke={color} strokeWidth={thickness} fill="none"
        strokeDasharray={dashArray} strokeLinecap="round"
        markerEnd={`url(#${arrowId})`} filter={glowFilter} opacity="0.95">
        {animate && style === 'dashed' && (
          <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="0.7s" repeatCount="indefinite" />
        )}
      </path>

      <g transform={`translate(${x2}, ${y2})`} filter={glowFilter}>
        <circle r="14" fill="none" stroke={color} strokeWidth="1.5" opacity="0.8">
          {animate && <animate attributeName="r" values="12;18;12" dur="1.4s" repeatCount="indefinite" />}
          {animate && <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.4s" repeatCount="indefinite" />}
        </circle>
        <circle r="3" fill={color} />
        <line x1="-20" y1="0" x2="-10" y2="0" stroke={color} strokeWidth="1.5" />
        <line x1="10"  y1="0" x2="20"  y2="0" stroke={color} strokeWidth="1.5" />
        <line x1="0" y1="-20" x2="0" y2="-10" stroke={color} strokeWidth="1.5" />
        <line x1="0" y1="10"  x2="0" y2="20"  stroke={color} strokeWidth="1.5" />
      </g>
    </svg>
  );
}
