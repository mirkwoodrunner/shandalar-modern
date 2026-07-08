import { useState } from 'react';

export interface BandFormationAttacker {
  iid: string;
  name: string;
  hasBanding: boolean;
}

interface BandFormationPanelProps {
  attackers: BandFormationAttacker[];
  onFormBand: (iids: string[]) => void;
}

// CR 702.22c: mobile counterpart to src/ui/Card/BandFormationPanel.tsx --
// lets the active player group already-declared, not-yet-banded attackers
// into a band during the declare-attackers step. The caller only mounts this
// when at least one declared attacker has banding, so with zero banding
// creatures declared the mobile attack-declaration screen is unchanged.
export function BandFormationPanel({ attackers, onFormBand }: BandFormationPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (iid: string) => {
    setSelected(prev => prev.includes(iid) ? prev.filter(id => id !== iid) : [...prev, iid]);
  };

  const selectedCards = attackers.filter(c => selected.includes(c.iid));
  const bandingCount = selectedCards.filter(c => c.hasBanding).length;
  const withoutCount = selectedCards.length - bandingCount;
  const isValid = selectedCards.length >= 1 && bandingCount >= 1 && withoutCount <= 1;

  return (
    <div
      data-testid="band-formation-panel"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4,
        padding: '6px 8px',
        background: 'rgba(20,14,8,.9)',
        borderTop: '1px solid rgba(200,120,80,.35)',
      }}
    >
      <span style={{
        fontSize: 9, color: 'rgba(255,180,140,.85)', textTransform: 'uppercase',
        letterSpacing: 0.8, fontFamily: 'var(--font-display)',
      }}>
        Band:
      </span>
      {attackers.map(c => {
        const isSel = selected.includes(c.iid);
        return (
          <button
            key={c.iid}
            data-testid={`band-toggle-${c.iid}`}
            onClick={() => toggle(c.iid)}
            style={{
              background: isSel ? 'linear-gradient(180deg, #3a1818, #1a0808)' : 'transparent',
              border: `1px solid ${isSel ? 'rgba(200,80,80,.7)' : 'rgba(120,90,40,.4)'}`,
              color: isSel ? 'rgba(255,160,140,.9)' : 'var(--ink-muted)',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
            }}
          >
            {c.name}{c.hasBanding ? <>{' '}{'\u{2726}'}</> : ''}
          </button>
        );
      })}
      <button
        data-testid="form-band-button"
        disabled={!isValid}
        onClick={() => { onFormBand(selected); setSelected([]); }}
        style={{
          background: isValid ? 'linear-gradient(180deg, #3a1818, #1a0808)' : 'rgba(30,30,30,.6)',
          border: `1px solid ${isValid ? 'rgba(200,80,80,.7)' : 'rgba(80,80,80,.35)'}`,
          color: isValid ? 'rgba(255,160,140,.9)' : '#555555',
          padding: '3px 8px',
          borderRadius: 3,
          cursor: isValid ? 'pointer' : 'not-allowed',
          opacity: isValid ? 1 : 0.55,
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        Form Band
      </button>
    </div>
  );
}
