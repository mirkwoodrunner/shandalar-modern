// duel-screen/components/targetArrow.jsx
// SVG overlay that draws curved arrows from a source card to a target card or player.
// Uses data-iid attributes on cards/players to find positions.

function TargetArrow({ sourceIid, targetIid, color = "#ffd060", thickness = 3, style = "solid", glow = true, animate = true }) {
  const [coords, setCoords] = React.useState(null);

  React.useEffect(() => {
    if (!sourceIid || !targetIid) { setCoords(null); return; }

    const update = () => {
      const src = document.querySelector(`[data-iid="${sourceIid}"]`);
      const tgt = document.querySelector(`[data-iid="${targetIid}"]`);
      if (!src || !tgt) { setCoords(null); return; }
      const sr = src.getBoundingClientRect();
      const tr = tgt.getBoundingClientRect();
      setCoords({
        x1: sr.left + sr.width / 2,
        y1: sr.top + sr.height / 2,
        x2: tr.left + tr.width / 2,
        y2: tr.top + tr.height / 2,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    document.querySelectorAll(`[data-iid="${sourceIid}"], [data-iid="${targetIid}"]`).forEach(el => ro.observe(el));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const interval = setInterval(update, 200); // catch hand-fan transitions
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      clearInterval(interval);
    };
  }, [sourceIid, targetIid]);

  if (!coords) return null;
  const { x1, y1, x2, y2 } = coords;

  // Curve control point — bow upward (or downward depending on direction)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const midx = (x1 + x2) / 2;
  const midy = (y1 + y2) / 2;
  // Perpendicular offset for the curve
  const perpOffset = Math.min(80, dist * 0.25);
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = midx + nx * perpOffset;
  const cy = midy + ny * perpOffset;

  // Arrowhead angle — tangent at endpoint
  const t = 0.95;
  const tx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const ty = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
  const angle = Math.atan2(y2 - ty, x2 - tx) * 180 / Math.PI;

  const dashArray = style === "dashed" ? "8 5" : style === "dotted" ? "2 4" : "none";
  const arrowId = `arrow-${sourceIid}-${targetIid}`.replace(/[^a-z0-9-]/gi, "_");

  return (
    <svg style={{
      position: "fixed", inset: 0,
      width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 90,
    }}>
      <defs>
        <marker id={arrowId} viewBox="0 0 12 12" refX="6" refY="6"
          markerWidth={thickness * 2.2} markerHeight={thickness * 2.2}
          orient="auto-start-reverse">
          <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill={color}
            stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
        </marker>
        <filter id={`${arrowId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.7" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Origin pulse */}
      <circle cx={x1} cy={y1} r="6" fill={color} opacity="0.85"
        filter={glow ? `url(#${arrowId}-glow)` : undefined}>
        {animate && <animate attributeName="r" values="4;8;4" dur="1.4s" repeatCount="indefinite" />}
        {animate && <animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite" />}
      </circle>

      {/* Curve */}
      <path
        d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
        stroke={color}
        strokeWidth={thickness}
        fill="none"
        strokeDasharray={dashArray}
        strokeLinecap="round"
        markerEnd={`url(#${arrowId})`}
        filter={glow ? `url(#${arrowId}-glow)` : undefined}
        opacity="0.95"
      >
        {animate && style === "dashed" && (
          <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="0.7s" repeatCount="indefinite" />
        )}
      </path>

      {/* Target reticle */}
      <g transform={`translate(${x2}, ${y2})`} filter={glow ? `url(#${arrowId}-glow)` : undefined}>
        <circle r="14" fill="none" stroke={color} strokeWidth="1.5" opacity="0.8">
          {animate && <animate attributeName="r" values="12;18;12" dur="1.4s" repeatCount="indefinite" />}
          {animate && <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.4s" repeatCount="indefinite" />}
        </circle>
        <circle r="3" fill={color} />
        <line x1="-20" y1="0" x2="-10" y2="0" stroke={color} strokeWidth="1.5" />
        <line x1="10" y1="0" x2="20" y2="0" stroke={color} strokeWidth="1.5" />
        <line x1="0" y1="-20" x2="0" y2="-10" stroke={color} strokeWidth="1.5" />
        <line x1="0" y1="10" x2="0" y2="20" stroke={color} strokeWidth="1.5" />
      </g>
    </svg>
  );
}

Object.assign(window, { TargetArrow });
