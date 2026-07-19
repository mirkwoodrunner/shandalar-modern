// src/ui/duel/CurseArtifactUpkeepModal.tsx
// Upkeep choice modal for Curse Artifact: sacrifice the enchanted artifact or
// take 2 damage. Shared between DuelScreen (desktop) and DuelScreenMobile.
// Same structural/styling pattern as ForceOfNatureUpkeepModal/OptionalUntapModal.

export function CurseArtifactUpkeepModal({ artifactName, onResolve }: {
  artifactName: string; onResolve: (choice: string) => void;
}) {
  return (
    <div className="popover-overlay" data-testid="curse-artifact-upkeep-modal">
      <div className="popover-content" onClick={e => e.stopPropagation()} style={{
        border: '2px solid #c4a040', background: 'rgba(10,20,10,0.97)',
        fontFamily: 'var(--font-display)',
      }}>
        <h3 style={{ color: '#c4a040', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
          Curse Artifact
        </h3>
        <p style={{ color: '#ccc', marginBottom: 16 }}>
          Curse Artifact deals 2 damage to you unless you sacrifice {artifactName}.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            data-testid="curse-artifact-sacrifice-button"
            onClick={() => onResolve('SACRIFICE')}
            style={{
              border: '1px solid #6a9a5a', background: 'rgba(40,80,20,0.6)',
              color: '#80c040', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Sacrifice {artifactName}</button>
          <button
            data-testid="curse-artifact-damage-button"
            onClick={() => onResolve('TAKE_DAMAGE')}
            style={{
              border: '1px solid #a04040', background: 'rgba(80,20,20,0.5)',
              color: '#e06060', padding: '8px 16px', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13,
            }}
          >Take 2 Damage</button>
        </div>
      </div>
    </div>
  );
}
