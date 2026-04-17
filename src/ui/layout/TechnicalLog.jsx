// src/ui/layout/TechnicalLog.jsx
// Scrolling game log for both overworld and duel contexts.
// Per MECHANICS_INDEX.md §7.4

import React, { useRef, useEffect } from 'react';

const LOG_COLORS = {
info:    "#a8c0a0",
warn:    "#f0c060",
danger:  "#e06050",
success: "#60c080",
event:   "#c0a0e0",
draw:    "#9090ee",
play:    "#f0d040",
mana:    "#60ee80",
damage:  "#ff6050",
heal:    "#60dd80",
death:   "#ee5050",
combat:  "#ffaa40",
effect:  "#cc90ff",
phase:   "#80aadd",
discard: "#cc8840",
};

/**

- Overworld chronicle log — simple type-colored entries.
  */
  export function OverworldLog({ log }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);

return (
<div ref={ref} style={{
flex: 1, overflowY: "auto",
padding: "6px 8px",
background: "rgba(0,0,0,.35)",
borderRadius: 5,
border: "1px solid rgba(200,170,100,.12)",
}}>
{log.map((e, i) => (
<div key={i} style={{
fontSize: 10,
color: LOG_COLORS[e.type] || "#a0b090",
marginBottom: 3, lineHeight: 1.4,
fontFamily: "'Crimson Text',serif",
}}>
— {e.text}
</div>
))}
</div>
);
}

/**

- Duel game log — includes turn number prefix.
  */
  export function DuelLog({ log }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);

return (
<div ref={ref} style={{
flex: 1, overflowY: "auto",
padding: "6px 10px",
background: "rgba(0,0,0,.4)",
fontSize: 11,
fontFamily: "'Crimson Text',serif",
scrollbarWidth: "thin",
}}>
{log.slice(-60).map((e, i) => (
<div key={i} style={{ marginBottom: 3, lineHeight: 1.4, color: LOG_COLORS[e.type] || "#c0b070" }}>
<span style={{ color: "rgba(160,130,60,.5)", marginRight: 4, fontSize: 9 }}>T{e.turn}</span>
{e.text}
</div>
))}
</div>
);
}

export default { OverworldLog, DuelLog };
