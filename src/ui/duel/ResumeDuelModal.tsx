// src/ui/duel/ResumeDuelModal.tsx
// Resume-duel confirmation modal. Shown on mount when a saved in-progress duel is
// found in localStorage. Shared between DuelScreen (desktop) and DuelScreenMobile.

export function ResumeDuelModal({ onResume, onDiscard }: {
  onResume: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="popover-overlay" data-testid="resume-duel-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,10,8,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Resume Duel
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          Resume your in-progress duel?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="resume-duel-button"
            onClick={onResume}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Resume</button>
          <button
            data-testid="resume-duel-discard-button"
            onClick={onDiscard}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Start Fresh</button>
        </div>
      </div>
    </div>
  );
}
