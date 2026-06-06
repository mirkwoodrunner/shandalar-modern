// src/ui/duel/TutorModal.tsx
// Tutor search modal. Matches DeckManager visual language.
// Used for Demonic Tutor and the artifact-search step of Transmute Artifact.
// Shows filtered library cards: valid (selectable) above, invalid (grayed) below.
// Always includes a "Decline to Find" footer button.

import React, { useState, useMemo } from 'react';

export type TutorFilter = 'any' | 'artifact' | 'creature' | 'instant' | 'sorcery' | 'enchantment' | 'land';

const FILTER_LABELS: Record<TutorFilter, string> = {
  any:         'Any',
  artifact:    'Artifact',
  creature:    'Creature',
  instant:     'Instant',
  sorcery:     'Sorcery',
  enchantment: 'Enchantment',
  land:        'Land',
};

const CCOLOR: Record<string, string> = {
  W: '#f8f4d0', U: '#7ab8d8', B: '#9060a0', R: '#e04830', G: '#30a050', C: '#aaaaaa',
};

function matchesFilter(card: any, filter: TutorFilter): boolean {
  if (filter === 'any')         return true;
  if (filter === 'artifact')    return !!card.type?.includes('Artifact');
  if (filter === 'creature')    return !!card.type?.includes('Creature');
  if (filter === 'instant')     return card.type === 'Instant';
  if (filter === 'sorcery')     return card.type === 'Sorcery';
  if (filter === 'enchantment') return !!card.type?.startsWith('Enchantment');
  if (filter === 'land')        return card.type === 'Land';
  return true;
}

function TutorCardRow({ card, onClick, disabled, isSelected }: {
  card: any; onClick?: () => void; disabled: boolean; isSelected?: boolean;
}) {
  const colorAccent = CCOLOR[card.color ?? ''] ?? '#888';
  const rarityColor = card.rarity === 'R' ? '#f0c040' : card.rarity === 'U' ? '#88b8d0' : '#707070';
  return (
    <div
      data-testid={disabled ? undefined : `tutor-card-${card.id}`}
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 12px',
        gap: 8,
        borderBottom: '1px solid rgba(180,160,60,.08)',
        borderLeft: isSelected ? '3px solid #c0a030' : '3px solid transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.32 : 1,
        background: isSelected ? 'rgba(200,160,40,.12)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'rgba(200,160,40,.10)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSelected ? 'rgba(200,160,40,.12)' : 'transparent'; }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: rarityColor, flexShrink: 0 }} />
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorAccent, flexShrink: 0 }} />
      <span style={{
        flex: 1,
        fontSize: 12,
        fontFamily: "'Cinzel',serif",
        color: disabled ? '#6a5020' : '#e0d080',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {card.name}
      </span>
      <span style={{
        fontSize: 10,
        color: disabled ? '#3a2810' : '#806040',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {card.subtype ? `${card.type} — ${card.subtype}` : card.type}
      </span>
      <span style={{
        fontSize: 10,
        fontFamily: "'Fira Code',monospace",
        color: disabled ? '#3a2810' : colorAccent,
        fontWeight: 700,
        flexShrink: 0,
        minWidth: 28,
        textAlign: 'right',
      }}>
        {card.cost ?? ''}
      </span>
    </div>
  );
}

interface TutorModalProps {
  library: any[];
  filter: TutorFilter;
  onChoose: (iid: string) => void;
  onDecline: () => void;
  titleOverride?: string;
}

export function TutorModal({ library, filter, onChoose, onDecline, titleOverride }: TutorModalProps) {
  const [search, setSearch]       = useState('');
  const [colorFilt, setColorFilt] = useState('ALL');
  const [sortBy, setSortBy]       = useState<'cmc' | 'name' | 'type'>('cmc');
  const [pendingIid, setPendingIid] = useState<string | null>(null);

  const { valid, invalid } = useMemo(() => {
    const applySearch = (cards: any[]) => {
      let r = [...cards];
      if (colorFilt !== 'ALL') r = r.filter(c => c.color === colorFilt);
      if (search.trim()) r = r.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()));
      if (sortBy === 'cmc')  r.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name));
      if (sortBy === 'name') r.sort((a, b) => a.name.localeCompare(b.name));
      if (sortBy === 'type') r.sort((a, b) => (a.type ?? '').localeCompare(b.type ?? '') || a.name.localeCompare(b.name));
      return r;
    };
    const v: any[] = [], inv: any[] = [];
    for (const card of library) {
      if (matchesFilter(card, filter)) v.push(card);
      else inv.push(card);
    }
    return { valid: applySearch(v), invalid: applySearch(inv) };
  }, [library, filter, search, colorFilt, sortBy]);

  const restrictionLabel = filter !== 'any' ? `Only ${FILTER_LABELS[filter]} cards are valid` : null;
  const title = titleOverride ?? (filter !== 'any' ? `Search Library — ${FILTER_LABELS[filter]}` : 'Search Library');

  return (
    <>
      <style>{`@keyframes tutorFadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div
        data-testid="tutor-modal"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(0,0,0,.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '90vh',
            background: 'linear-gradient(160deg,#0e0c04,#080a04)',
            border: '2px solid rgba(180,160,60,.4)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 60px rgba(0,0,0,.9)',
            overflow: 'hidden',
            animation: 'tutorFadeIn 180ms ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(180,160,60,.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 15, fontFamily: "'Cinzel',serif", color: '#e0c060', fontWeight: 700 }}>
                {'◆'} {title}
              </div>
              {restrictionLabel && (
                <div style={{ fontSize: 9, color: '#6a5020', marginTop: 2 }}>{restrictionLabel}</div>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#4a3820' }}>
              {valid.length} valid {'·'} {library.length} total
            </div>
          </div>

          {/* Controls */}
          <div style={{
            padding: '6px 12px',
            borderBottom: '1px solid rgba(180,160,60,.12)',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
            flexShrink: 0,
            background: 'rgba(0,0,0,.2)',
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cards..."
              style={{
                background: 'rgba(0,0,0,.5)',
                border: '1px solid #5a4020',
                color: '#f0d080',
                padding: '4px 10px',
                borderRadius: 5,
                fontSize: 11,
                fontFamily: "'Cinzel',serif",
                width: 130,
                outline: 'none',
              }}
            />
            {filter === 'any' && (
              <div style={{ display: 'flex', gap: 3 }}>
                {['ALL', 'W', 'U', 'B', 'R', 'G', ''].map(f => (
                  <button
                    key={f || 'C'}
                    onClick={() => setColorFilt(f)}
                    style={{
                      background: colorFilt === f ? 'rgba(200,160,40,.25)' : 'transparent',
                      border: `1px solid ${colorFilt === f ? '#c0a030' : '#3a3010'}`,
                      color: colorFilt === f ? '#f0c040' : '#6a5020',
                      padding: '3px 7px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 9,
                      fontFamily: "'Cinzel',serif",
                    }}
                  >
                    {f || '◇'}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
              <span style={{ fontSize: 9, color: '#6a5020', lineHeight: '22px' }}>Sort:</span>
              {([['cmc', 'CMC'], ['name', 'Name'], ['type', 'Type']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  style={{
                    background: sortBy === k ? 'rgba(200,160,40,.2)' : 'transparent',
                    border: `1px solid ${sortBy === k ? '#a08030' : '#3a3010'}`,
                    color: sortBy === k ? '#f0c040' : '#6a5020',
                    padding: '3px 7px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 9,
                    fontFamily: "'Cinzel',serif",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Card list */}
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {valid.length === 0 && invalid.length === 0 && (
              <div style={{ padding: 16, fontSize: 11, color: '#3a2810', fontStyle: 'italic', textAlign: 'center' }}>
                Library is empty.
              </div>
            )}
            {valid.length === 0 && (search || colorFilt !== 'ALL') && (
              <div style={{ padding: '10px 12px', fontSize: 10, color: '#4a3820', fontStyle: 'italic' }}>
                No valid cards match your filter.
              </div>
            )}
            {valid.map(card => (
              <TutorCardRow
                key={card.iid}
                card={card}
                onClick={() => setPendingIid(prev => prev === card.iid ? null : card.iid)}
                disabled={false}
                isSelected={pendingIid === card.iid}
              />
            ))}

            {invalid.length > 0 && (
              <>
                <div style={{
                  padding: '5px 12px',
                  fontSize: 9,
                  color: '#3a2810',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: '#070603',
                  borderBottom: '1px solid rgba(180,160,60,.06)',
                  borderTop: valid.length ? '1px solid rgba(180,160,60,.12)' : undefined,
                }}>
                  Not valid for this tutor
                </div>
                {invalid.map(card => (
                  <TutorCardRow key={card.iid} card={card} disabled={true} />
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 16px',
            borderTop: '1px solid rgba(180,160,60,.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 9, color: '#3a2810', fontStyle: 'italic' }}>
              {pendingIid
                ? `Selected: ${library.find(c => c.iid === pendingIid)?.name ?? '—'}`
                : 'Select a card, then click Take'}
            </span>
            {pendingIid && (
              <button
                data-testid="tutor-confirm"
                onClick={() => onChoose(pendingIid)}
                style={{
                  background: 'rgba(160,120,20,.7)',
                  border: '1px solid rgba(200,160,40,.7)',
                  color: '#f0d060',
                  borderRadius: 5,
                  padding: '5px 18px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: "'Cinzel',serif",
                  fontWeight: 700,
                }}
              >
                Take
              </button>
            )}
            <button
              data-testid="tutor-decline"
              onClick={onDecline}
              style={{
                background: 'rgba(80,20,10,.6)',
                border: '1px solid rgba(180,80,40,.5)',
                color: '#e08060',
                borderRadius: 5,
                padding: '5px 14px',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: "'Cinzel',serif",
              }}
            >
              Decline to Find
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
