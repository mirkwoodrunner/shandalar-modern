// tests/e2e/pestilence-sacrifice.spec.ts
//
// End-to-end regression test for the Pestilence end-step sacrifice bug fix.
// Old (wrong) condition: sacrifice if Pestilence's controller has no black
// creatures. Correct (oracle) condition: sacrifice if no creatures are on
// the battlefield at all (either side, any color).
//
// Uses the same dynamic-import + direct-duelReducer pattern as
// first-strike-combat.spec.ts -- exercising the real production DuelCore.js
// code running in the browser's JS engine, with a deterministic battlefield
// composition that would be impractical to set up via UI clicks.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per
// the project convention.
//
// E2E-PEST-01: Player-controlled Pestilence with zero creatures on both
// battlefields is sacrificed at the end step (CLEANUP), and the duel log
// records the sacrifice.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePestilence(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'pestilence',
    name: 'Pestilence',
    type: 'Enchantment',
    color: 'B',
    cmc: 4,
    cost: '2BB',
    keywords: [] as string[],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    controller: 'p',
    ...overrides,
  };
}

function makeBaseState(overrides: Record<string, any> = {}) {
  return {
    phase: 'END',
    active: 'p',
    turn: 1,
    landsPlayed: 0,
    spellsThisTurn: 0,
    attackers: [] as string[],
    blockers: {} as Record<string, any>,
    stack: [] as any[],
    over: null,
    selCard: null,
    selTgt: null,
    xVal: 1,
    log: [] as any[],
    ruleset: {
      startingLife: 20,
      startingHandSize: 7,
      drawOnFirstTurn: false,
      londonMulligan: false,
      deathtouch: true,
    },
    oppArch: { id: 'KARAG', profileId: 'KARAG' },
    castleMod: null,
    pendingLotus: false,
    pendingLotusIid: null,
    pendingBop: false,
    turnState: { damageLog: [] as any[] },
    triggerQueue: [] as any[],
    pendingChoice: null,
    fogActive: false,
    anteEnabled: false,
    anteP: null,
    anteO: null,
    p: {
      life: 20, lib: [], hand: [], bf: [] as any[], gy: [], exile: [],
      mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
      extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
      ...overrides.p,
    },
    o: {
      life: 20, lib: [], hand: [], bf: [] as any[], gy: [], exile: [],
      mana: { W:0, U:0, B:0, R:0, G:0, C:0 },
      extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0,
      ...overrides.o,
    },
  };
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine @mobile Pestilence sacrifice condition -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('E2E-PEST-01: Pestilence is sacrificed at the end step when no creatures are on the battlefield', async ({ page }) => {
    const pest = makePestilence('pest-1', { controller: 'p' });
    const initialState = makeBaseState({ p: { bf: [pest] }, o: { bf: [] } });

    const result = await page.evaluate(async ({ state }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
      return {
        phase: s.phase,
        pestOnBf: s.p.bf.some((c: any) => c.iid === 'pest-1'),
        pestInGy: s.p.gy.some((c: any) => c.iid === 'pest-1'),
        hasSacrificeLog: s.log.some((e: any) => typeof e.text === 'string' && e.text.includes('sacrificed')),
      };
    }, { state: initialState });

    expect(result.phase, 'phase should advance to CLEANUP').toBe('CLEANUP');
    expect(result.pestOnBf, 'Pestilence should no longer be on the battlefield').toBe(false);
    expect(result.pestInGy, 'Pestilence should be in the graveyard').toBe(true);
    expect(result.hasSacrificeLog, 'duel log should record the sacrifice').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- same test at mobile viewport
// ---------------------------------------------------------------------------

test.describe('@engine @mobile Pestilence sacrifice condition -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('E2E-PEST-01: Pestilence is sacrificed at the end step when no creatures are on the battlefield', async ({ page }) => {
    const pest = makePestilence('pest-1', { controller: 'p' });
    const initialState = makeBaseState({ p: { bf: [pest] }, o: { bf: [] } });

    const result = await page.evaluate(async ({ state }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');
      const s = duelReducer(state, { type: 'ADVANCE_PHASE' }); // END -> CLEANUP
      return {
        phase: s.phase,
        pestOnBf: s.p.bf.some((c: any) => c.iid === 'pest-1'),
        pestInGy: s.p.gy.some((c: any) => c.iid === 'pest-1'),
        hasSacrificeLog: s.log.some((e: any) => typeof e.text === 'string' && e.text.includes('sacrificed')),
      };
    }, { state: initialState });

    expect(result.phase).toBe('CLEANUP');
    expect(result.pestOnBf).toBe(false);
    expect(result.pestInGy).toBe(true);
    expect(result.hasSacrificeLog).toBe(true);
  });
});
