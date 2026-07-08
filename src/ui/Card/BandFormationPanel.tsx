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

// CR 702.22c: lets the active player group already-declared, not-yet-banded
// attackers into a band during the declare-attackers step. The caller only
// mounts this when at least one declared attacker has banding (see
// DuelScreen's gating) -- with zero banding creatures declared, this
// component never renders, so the attack-declaration screen is unchanged
// from before this feature existed.
export function BandFormationPanel({ attackers, onFormBand }: BandFormationPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (iid: string) => {
    setSelected(prev => prev.includes(iid) ? prev.filter(id => id !== iid) : [...prev, iid]);
  };

  const selectedCards = attackers.filter(c => selected.includes(c.iid));
  const bandingCount = selectedCards.filter(c => c.hasBanding).length;
  const withoutCount = selectedCards.length - bandingCount;
  // CR 702.22c: one or more banding members, plus up to one without.
  const isValid = selectedCards.length >= 1 && bandingCount >= 1 && withoutCount <= 1;

  return (
    <div
      data-testid="band-formation-panel"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        background: 'rgba(20,14,8,.85)',
        borderTop: '1px solid rgba(180,140,70,.2)',
      }}
    >
      <span style={{
        fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase',
        letterSpacing: 1, fontFamily: 'var(--font-display)',
      }}>
        Form band:
      </span>
      {attackers.map(c => {
        const isSel = selected.includes(c.iid);
        return (
          <button
            key={c.iid}
            data-testid={`band-toggle-${c.iid}`}
            onClick={() => toggle(c.iid)}
            style={{
              background: isSel ? 'linear-gradient(180deg, #4a3a18, #2a1e0a)' : 'transparent',
              border: `1.5px solid ${isSel ? 'var(--brass)' : 'rgba(120,90,40,.4)'}`,
              color: isSel ? 'var(--brass-hi)' : 'var(--ink-muted)',
              padding: '4px 10px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 11,
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
          background: isValid ? 'linear-gradient(180deg, #4a3a18, #2a1e0a)' : 'rgba(30,30,30,.6)',
          border: `1.5px solid ${isValid ? 'var(--brass)' : 'rgba(80,80,80,.35)'}`,
          color: isValid ? 'var(--brass-hi)' : '#555555',
          padding: '4px 10px',
          borderRadius: 3,
          cursor: isValid ? 'pointer' : 'not-allowed',
          opacity: isValid ? 1 : 0.5,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        Form Band
      </button>
    </div>
  );
}
