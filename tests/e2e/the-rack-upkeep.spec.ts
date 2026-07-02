// tests/e2e/the-rack-upkeep.spec.ts
//
// End-to-end regression test for The Rack's upkeep-targeting bug: the
// artifact previously had no implementation at all (cards.js effect:"STUB"),
// so the reported symptom -- damage on the controller's own upkeep -- was
// impossible to reproduce until the real upkeep:"rackUpkeep" trigger was
// added to DuelCore.js. This spec locks in the corrected behavior: The Rack
// fires only on the opponent-of-controller's upkeep.
//
// Uses the same dynamic-import + direct-duelReducer pattern as
// first-strike-combat.spec.ts and pestilence-sacrifice.spec.ts.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per
// the project convention.
//
// E2E-RACK-01: player controls The Rack. Player's own upkeep deals no
// damage and logs nothing. Opponent's upkeep (hand size < 3) deals the
// correct damage and logs the trigger.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRack(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'the_rack',
    name: 'The Rack',
    type: 'Artifact',
    color: '',
    cmc: 1,
    cost: '1',
    keywords: [] as string[],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    upkeep: 'rackUpkeep',
    controller: 'p',
    ...overrides,
  };
}

async function runRackScenario(page: any) {
  const rack = makeRack('rack-1', { controller: 'p' });

  return page.evaluate(async ({ rackCard }: any) => {
    const { duelReducer } = await import('/src/engine/DuelCore.js');

    // Player's own upkeep: The Rack must deal no damage.
    const ownUpkeepStart = {
      phase: 'UNTAP', active: 'p', turn: 1, landsPlayed: 0, spellsThisTurn: 0,
      attackers: [], blockers: {}, stack: [], over: null, selCard: null, selTgt: null, xVal: 1, log: [],
      ruleset: { startingLife: 20, startingHandSize: 7, drawOnFirstTurn: false, londonMulligan: false, deathtouch: true },
      oppArch: { id: 'KARAG', profileId: 'KARAG' }, castleMod: null, pendingLotus: false, pendingLotusIid: null,
      pendingBop: false, turnState: { damageLog: [] }, triggerQueue: [], pendingChoice: null, fogActive: false,
      anteEnabled: false, anteP: null, anteO: null,
      p: { life: 20, lib: [], hand: [{ iid: 'h1', id: 'forest', name: 'Forest', type: 'Land' }], bf: [rackCard], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0 },
      o: { life: 20, lib: [], hand: [], bf: [], gy: [], exile: [], mana: { W:0,U:0,B:0,R:0,G:0,C:0 }, extraTurns: 0, mulls: 0, lifeAnim: null, poisonCounters: 0 },
    };
    const afterOwnUpkeep = duelReducer(ownUpkeepStart, { type: 'ADVANCE_PHASE' });

    // Opponent's upkeep (hand size 1 -> 2 damage expected): The Rack must deal damage.
    const oppUpkeepStart = {
      ...ownUpkeepStart,
      active: 'o',
      o: { ...ownUpkeepStart.o, hand: [{ iid: 'h2', id: 'forest', name: 'Forest', type: 'Land' }] },
    };
    const afterOppUpkeep = duelReducer(oppUpkeepStart, { type: 'ADVANCE_PHASE' });

    return {
      ownUpkeepPhase: afterOwnUpkeep.phase,
      pLifeAfterOwnUpkeep: afterOwnUpkeep.p.life,
      hasDamageLogOwnUpkeep: afterOwnUpkeep.log.some((e: any) => typeof e.text === 'string' && e.text.includes('The Rack')),
      oppUpkeepPhase: afterOppUpkeep.phase,
      oLifeAfterOppUpkeep: afterOppUpkeep.o.life,
      hasDamageLogOppUpkeep: afterOppUpkeep.log.some((e: any) => typeof e.text === 'string' && e.text.includes('The Rack')),
    };
  }, { rackCard: rack });
}

// ---------------------------------------------------------------------------
// Desktop suite (1280x800)
// ---------------------------------------------------------------------------

test.describe('@engine @mobile The Rack upkeep targeting -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('E2E-RACK-01: no damage on controller\'s own upkeep; correct damage on opponent\'s upkeep', async ({ page }) => {
    const result = await runRackScenario(page);

    expect(result.ownUpkeepPhase, 'phase should advance to UPKEEP').toBe('UPKEEP');
    expect(result.pLifeAfterOwnUpkeep, 'controller should take no damage from their own Rack').toBe(20);
    expect(result.hasDamageLogOwnUpkeep, 'no Rack log entry on the controller\'s own upkeep').toBe(false);

    expect(result.oppUpkeepPhase).toBe('UPKEEP');
    expect(result.oLifeAfterOppUpkeep, 'opponent with 1 card in hand should take 2 damage').toBe(18);
    expect(result.hasDamageLogOppUpkeep, 'Rack trigger should be logged on the opponent\'s upkeep').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- same test at mobile viewport
// ---------------------------------------------------------------------------

test.describe('@engine @mobile The Rack upkeep targeting -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('E2E-RACK-01: no damage on controller\'s own upkeep; correct damage on opponent\'s upkeep', async ({ page }) => {
    const result = await runRackScenario(page);

    expect(result.ownUpkeepPhase).toBe('UPKEEP');
    expect(result.pLifeAfterOwnUpkeep).toBe(20);
    expect(result.hasDamageLogOwnUpkeep).toBe(false);

    expect(result.oppUpkeepPhase).toBe('UPKEEP');
    expect(result.oLifeAfterOppUpkeep).toBe(18);
    expect(result.hasDamageLogOppUpkeep).toBe(true);
  });
});
