import { useState, useCallback, useRef } from 'react';
import { Topbar } from './ui/Topbar/Topbar';
import { Banner } from './ui/Battlefield/Banner';
import { Battlefield } from './ui/Battlefield/Battlefield';
import { Hand } from './ui/Hand/Hand';
import { ActionBar } from './ui/ActionBar/ActionBar';
import { DuelLog } from './ui/Log/DuelLog';
import { TargetArrow } from './ui/TargetArrow/TargetArrow';
import { TweaksPanel } from './ui/TweaksPanel/TweaksPanel';
import { GameOverModal } from './ui/GameOver/GameOverModal';
import { MulliganModal } from './ui/Mulligan/MulliganModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFlash } from './hooks/useFlash';
import { useAITurn } from './hooks/useAITurn';
import { useTweaks } from './hooks/useTweaks';
import { usePersistence } from './hooks/usePersistence';
import type { InteractionMode } from './ui/interaction';
import { needsTarget } from './ui/interaction';
import type { DuelState } from './types/duel';
import type { CardData } from './ui/Card/types';

const PHASE_SEQ = [
  'UNTAP','UPKEEP','DRAW','MAIN_1',
  'COMBAT_BEGIN','COMBAT_ATTACKERS','COMBAT_BLOCKERS','COMBAT_DAMAGE','COMBAT_END',
  'MAIN_2','END','CLEANUP',
];

const INITIAL_HAND: CardData[] = [
  { iid:'h1', name:'Wandering Eremite', cost:'2W', type:'Creature', color:'W', power:2, toughness:3, text:'When this enters, gain 2 life.' },
  { iid:'h2', name:'Counterspell', cost:'UU', type:'Instant', color:'U', text:'Counter target spell.' },
  { iid:'h3', name:'Forest', cost:'', type:'Land', color:'G', produces:['G'] },
  { iid:'h4', name:'Wraith of Cinders', cost:'3BB', type:'Creature', color:'B', power:5, toughness:4, text:'Flying.' },
  { iid:'h5', name:'Lightning Strike', cost:'1R', type:'Instant', color:'R', text:'Deal 3 damage to any target.' },
  { iid:'h6', name:'Verdant Growth', cost:'1G', type:'Sorcery', color:'G', text:'Search for a basic land.' },
  { iid:'h7', name:'Forest', cost:'', type:'Land', color:'G', produces:['G'] },
];

const FRESH_STATE: DuelState = {
  turn: 1, active: 'p', phase: 'MAIN_1',
  selCard: null, selTgt: null, attackers: [],
  ruleset: { name: 'Classic', startingLife: 20, manaBurn: false },
  p: {
    life: 20, lifeAnim: null, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
    lib: 33, gy: 0, exile: 0,
    hand: INITIAL_HAND,
    bf: [],
  },
  o: {
    life: 20, lifeAnim: null, max: 20,
    mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
    lib: 33, gy: 0, exile: 0,
    hand: [
      { iid:'oh1', name:'Dark Ritual', cost:'B', type:'Instant', color:'B', text:'Add BBB to your mana pool.' },
      { iid:'oh2', name:'Zombie Brute', cost:'3B', type:'Creature', color:'B', power:4, toughness:3, text:'Menace.' },
      { iid:'oh3', name:'Swamp', cost:'', type:'Land', color:'B', produces:['B'] },
      { iid:'oh4', name:'Terror', cost:'1B', type:'Instant', color:'B', text:'Destroy target non-artifact creature.' },
      { iid:'oh5', name:'Dusk Stalker', cost:'2B', type:'Creature', color:'B', power:2, toughness:3, text:'Deathtouch.' },
      { iid:'oh6', name:'Swamp', cost:'', type:'Land', color:'B', produces:['B'] },
      { iid:'oh7', name:'Carrion Bat', cost:'1B', type:'Creature', color:'B', power:2, toughness:1, text:'Flying.' },
    ],
    bf: [],
  },
  log: [{ kind: 'turn', text: 'Turn 1 — Your turn.' }],
};

export function DuelScreen() {
  const [state, setState] = useState<DuelState>(FRESH_STATE);
  const [mode, setMode] = useState<InteractionMode>({ kind: 'idle' });
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const [landPlayed, setLandPlayed] = useState(false);

  // Mulligan state
  const [mulliganOpen, setMulliganOpen] = useState(true);
  const [mulliganCount, setMulliganCount] = useState(0);

  // Game-over detection
  const gameOver = state.p.life <= 0 ? 'defeat' : state.o.life <= 0 ? 'victory' : null;

  // Stats tracking for game-over modal
  const cardsCastRef = useRef(0);
  const maxDamageRef = useRef(0);

  const { flashIids, flash } = useFlash(200);
  const [tweaks, setTweak] = useTweaks();

  usePersistence(state);

  const s = state;
  const inMain = s.phase === 'MAIN_1' || s.phase === 'MAIN_2';
  const isPlayerTurn = s.active === 'p';

  // ── Actions ──────────────────────────────────────────────────────────────

  const addLog = useCallback((entry: typeof state.log[0]) => {
    setState(prev => ({ ...prev, log: [...prev.log, entry].slice(-200) }));
  }, []);

  const cancel = useCallback(() => {
    setMode({ kind: 'idle' });
    setHoverTarget(null);
    setState(prev => ({ ...prev, selCard: null, selTgt: null }));
  }, []);

  const passPriority = useCallback(() => {
    if (!isPlayerTurn) return;
    setState(prev => {
      const idx = PHASE_SEQ.indexOf(prev.phase);
      const next = PHASE_SEQ[(idx + 1) % PHASE_SEQ.length];
      if (next === 'UNTAP' || idx === PHASE_SEQ.length - 1) {
        return { ...prev, phase: 'CLEANUP' };
      }
      return { ...prev, phase: next };
    });
  }, [isPlayerTurn]);

  const endTurn = useCallback(() => {
    if (!isPlayerTurn) return;
    cancel();
    setState(prev => ({ ...prev, phase: 'CLEANUP', active: 'o' }));
  }, [isPlayerTurn, cancel]);

  const tapLand = useCallback((card: CardData) => {
    setState(prev => ({
      ...prev,
      p: {
        ...prev.p,
        bf: prev.p.bf.map(c => c.iid === card.iid ? { ...c, tapped: true } : c),
        mana: {
          ...prev.p.mana,
          [(card.produces?.[0] ?? 'C') as string]: (prev.p.mana[(card.produces?.[0] ?? 'C') as keyof typeof prev.p.mana] ?? 0) + 1,
        },
      },
    }));
    flash([card.iid]);
    addLog({ kind: 'info', text: `You tap ${card.name} for mana.` });
  }, [flash, addLog]);

  const playLand = useCallback((card: CardData) => {
    if (landPlayed) return;
    setLandPlayed(true);
    setState(prev => ({
      ...prev,
      p: {
        ...prev.p,
        hand: prev.p.hand.filter(c => c.iid !== card.iid),
        bf: [...prev.p.bf, { ...card, tapped: false }],
      },
    }));
    addLog({ kind: 'play', text: `You play ${card.name}.` });
  }, [landPlayed, addLog]);

  const castSpell = useCallback((card: CardData, targetIid: string | null) => {
    cardsCastRef.current += 1;

    const manaLands = state.p.bf
      .filter(c => c.type === 'Land' && !c.tapped)
      .slice(0, 2)
      .map(c => c.iid);
    flash(manaLands);

    const targetNote = targetIid ? ` → ${targetIid}` : '';
    addLog({ kind: 'play', text: `You cast ${card.name}${targetNote}.` });

    setState(prev => ({
      ...prev,
      selCard: null, selTgt: null,
      p: {
        ...prev.p,
        hand: prev.p.hand.filter(c => c.iid !== card.iid),
        bf: card.type === 'Creature' || card.type === 'Artifact' || card.type === 'Enchantment'
          ? [...prev.p.bf, { ...card, summoningSick: true }]
          : prev.p.bf,
        gy: card.type === 'Instant' || card.type === 'Sorcery' ? prev.p.gy + 1 : prev.p.gy,
      },
    }));

    setMode({ kind: 'idle' });
    setHoverTarget(null);
  }, [state.p.bf, flash, addLog]);

  // ── Click handlers ────────────────────────────────────────────────────────

  const onHandCardClick = useCallback((card: CardData) => {
    if (!isPlayerTurn) return;

    if (card.type === 'Land') {
      if (inMain && !landPlayed) playLand(card);
      return;
    }

    const canCast = inMain || card.type === 'Instant';
    if (!canCast) return;

    if (needsTarget(card)) {
      setMode({ kind: 'selecting-target', sourceIid: card.iid, sourceCard: card });
      setState(prev => ({ ...prev, selCard: card.iid, selTgt: null }));
    } else {
      castSpell(card, null);
    }
  }, [isPlayerTurn, inMain, landPlayed, playLand, castSpell]);

  const onBattlefieldCardClick = useCallback((card: CardData) => {
    if (mode.kind === 'selecting-target') {
      castSpell(mode.sourceCard, card.iid);
      return;
    }
    if (!isPlayerTurn) return;

    const isPlayerCard = s.p.bf.some(c => c.iid === card.iid);
    if (isPlayerCard && card.type === 'Land' && !card.tapped && inMain) {
      tapLand(card);
    } else if (isPlayerCard && card.type === 'Creature' && s.phase === 'COMBAT_ATTACKERS' && !card.tapped && !card.summoningSick) {
      setState(prev => ({
        ...prev,
        attackers: prev.attackers.includes(card.iid)
          ? prev.attackers.filter(id => id !== card.iid)
          : [...prev.attackers, card.iid],
      }));
    }
  }, [mode, isPlayerTurn, s.p.bf, s.phase, inMain, castSpell, tapLand]);

  const onLifeTotalClick = useCallback((iid: 'player-p' | 'player-o') => {
    if (mode.kind === 'selecting-target') {
      castSpell(mode.sourceCard, iid);
    }
  }, [mode, castSpell]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const onQuickCast = useCallback((index: number) => {
    if (!isPlayerTurn || !inMain) return;
    const card = s.p.hand[index];
    if (!card || card.type === 'Land') return;
    if (!needsTarget(card)) castSpell(card, null);
  }, [isPlayerTurn, inMain, s.p.hand, castSpell]);

  useKeyboardShortcuts({
    onPassPriority: passPriority,
    onEndTurn: endTurn,
    onCancel: cancel,
    onQuickCast,
    isIdle: mode.kind === 'idle',
  });

  // ── AI turn ───────────────────────────────────────────────────────────────

  useAITurn({ state, setState, flashCard: flash, setLandPlayed });

  // ── Mulligan handlers ─────────────────────────────────────────────────────

  const handleKeep = useCallback(() => {
    setMulliganOpen(false);
    addLog({ kind: 'system', text: `You kept ${state.p.hand.length} cards.` });
  }, [state.p.hand.length, addLog]);

  const handleMulligan = useCallback(() => {
    const count = mulliganCount + 1;
    const nextSize = INITIAL_HAND.length - count;
    setMulliganCount(count);
    // Draw nextSize cards from the initial pool, refreshed with new iids
    const newHand = INITIAL_HAND.slice(0, nextSize).map((c, i) => ({
      ...c,
      iid: `m${count}_${i}`,
    }));
    setState(prev => ({ ...prev, p: { ...prev.p, hand: newHand } }));
  }, [mulliganCount]);

  // ── Game over: new duel ───────────────────────────────────────────────────

  const handleNewDuel = useCallback(() => {
    cardsCastRef.current = 0;
    maxDamageRef.current = 0;
    setMode({ kind: 'idle' });
    setHoverTarget(null);
    setLandPlayed(false);
    setMulliganCount(0);
    setMulliganOpen(true);
    setState(FRESH_STATE);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const playableIids = new Set(
    s.p.hand
      .filter(c => {
        if (c.type === 'Land') return inMain && !landPlayed;
        if (c.type === 'Instant') return isPlayerTurn;
        return isPlayerTurn && inMain;
      })
      .map(c => c.iid)
  );

  const arrowSource = mode.kind === 'selecting-target' ? mode.sourceIid : null;
  const arrowTarget = mode.kind === 'selecting-target' ? (hoverTarget ?? s.selTgt) : null;

  const latestLog = s.log[s.log.length - 1];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      role="application"
      aria-label="Duel"
      style={{
        width: '100vw', height: '100vh',
        background: 'radial-gradient(ellipse at 50% 50%, var(--bg-radial-center) 0%, var(--bg-deep) 70%, var(--bg-void) 100%)',
        color: 'var(--ink-parchment)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* aria-live region for screen-reader log announcements */}
      <div aria-live="polite" aria-atomic="true" style={{
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
      }}>
        {latestLog?.text ?? ''}
      </div>

      <Topbar
        rulesetName={s.ruleset.name}
        turn={s.turn}
        active={s.active}
        phase={s.phase}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          <Hand side="opp" cards={s.o.hand} />

          <div
            data-iid="player-o"
            onClick={() => onLifeTotalClick('player-o')}
            style={{ cursor: mode.kind === 'selecting-target' ? 'crosshair' : undefined }}
            tabIndex={mode.kind === 'selecting-target' ? 0 : undefined}
            aria-label="Opponent life total — click to target"
            onKeyDown={e => e.key === 'Enter' && onLifeTotalClick('player-o')}
          >
            <Banner side="opp" player={s.o} flavorText="Black/Blue · Necrotic Discard" />
          </div>

          <Battlefield
            phase={s.phase}
            oppCards={s.o.bf}
            yourCards={s.p.bf}
            selCard={s.selCard}
            selTgt={s.selTgt}
            attackers={s.attackers}
            flashIids={flashIids}
            onCardClick={onBattlefieldCardClick}
            onCardHover={iid => {
              setHoverTarget(iid);
              if (mode.kind === 'selecting-target' && iid) {
                setState(prev => ({ ...prev, selTgt: iid }));
              }
            }}
          />

          <div
            data-iid="player-p"
            onClick={() => onLifeTotalClick('player-p')}
            style={{ cursor: mode.kind === 'selecting-target' ? 'crosshair' : undefined }}
            tabIndex={mode.kind === 'selecting-target' ? 0 : undefined}
            aria-label="Your life total — click to target"
            onKeyDown={e => e.key === 'Enter' && onLifeTotalClick('player-p')}
          >
            <Banner side="you" player={s.p} flavorText="Red/Green · Stomp" />
          </div>

          <ActionBar
            phase={s.phase}
            hasSelection={mode.kind === 'selecting-target'}
            onCast={() => {}}
            onPassPriority={passPriority}
            onCancel={cancel}
            onEndTurn={endTurn}
          />

          <Hand
            side="you"
            cards={s.p.hand}
            selCard={mode.kind === 'selecting-target' ? mode.sourceIid : null}
            playableIids={playableIids}
            onCardClick={onHandCardClick}
          />
        </div>

        {/* Sidebar */}
        <div style={{
          width: 280, flexShrink: 0,
          borderLeft: '1px solid rgba(180,140,70,.3)',
          background: 'linear-gradient(180deg, var(--bg-panel), #0c0806)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid rgba(180,140,70,.2)',
            background: 'linear-gradient(90deg, rgba(196,160,64,.08), transparent)',
          }}>
            <div style={{
              fontSize: 11, color: 'var(--brass)',
              fontFamily: 'var(--font-display)', letterSpacing: 2,
              fontWeight: 700, textTransform: 'uppercase',
              textShadow: '0 0 6px rgba(196,160,64,.4)',
            }}>Chronicle</div>
            <div style={{ fontSize: 10, color: 'var(--ink-faint)', fontStyle: 'italic', marginTop: 1 }}>
              The duel unfolds…
            </div>
          </div>

          <DuelLog log={s.log} />

          {/* Debug strip */}
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid rgba(180,140,70,.15)',
            background: 'rgba(0,0,0,.4)',
            fontSize: 9.5, fontFamily: 'var(--font-mono)',
            color: 'var(--ink-faint)',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {[
              ['MODE', mode.kind],
              ['ARROW', arrowSource && arrowTarget ? `${arrowSource}→${arrowTarget}` : '—'],
              ['LAND', landPlayed ? 'played' : 'available'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{k}</span>
                <span style={{ color: 'var(--brass)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overlays */}
      <TargetArrow
        sourceIid={arrowSource}
        targetIid={arrowTarget}
        color={tweaks.arrowColor}
        thickness={tweaks.arrowThickness}
        style={tweaks.arrowStyle}
        glow={tweaks.arrowGlow}
        animate={tweaks.arrowAnimate}
      />

      <TweaksPanel values={tweaks} setTweak={setTweak} />

      {mulliganOpen && !gameOver && (
        <MulliganModal
          hand={s.p.hand}
          mulliganCount={mulliganCount}
          onKeep={handleKeep}
          onMulligan={handleMulligan}
        />
      )}

      {gameOver && (
        <GameOverModal
          outcome={gameOver}
          stats={{
            turns: s.turn,
            maxDamage: maxDamageRef.current,
            cardsCast: cardsCastRef.current,
          }}
          onNewDuel={handleNewDuel}
        />
      )}
    </div>
  );
}
