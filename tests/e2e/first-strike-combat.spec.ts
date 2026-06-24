// tests/e2e/first-strike-combat.spec.ts
//
// End-to-end tests for the first-strike two-step combat damage implementation.
//
// These tests use dynamic module imports (the same pattern as layer-engine.spec.js)
// rather than the live sandbox UI, because setting up specific battlefield
// compositions with first-strike creatures via UI clicks or the sandbox decklist
// is not practical -- we need deterministic creature compositions. The dynamic
// import approach exercises the real production duelReducer/resolveCombat code
// running in the browser's JS engine, which is the meaningful e2e guarantee here.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per the
// project convention, even though viewport does not affect pure engine logic,
// to confirm nothing in the bundle or module resolution differs by viewport.
//
// FS-E2E-01: First-strike creature survives; opponent does not.
// FS-E2E-02: Normal (no first strike) mutual-lethal combat still kills both.

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeCreature(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'grizzly_bears',
    name: 'Grizzly Bears',
    type: 'Creature',
    subtype: 'Bear',
    color: 'G',
    cmc: 2,
    cost: '1G',
    power: 2,
    toughness: 2,
    keywords: [] as string[],
    tapped: false,
    summoningSick: false,
    attacking: false,
    blocking: null as string | null,
    damage: 0,
    counters: {},
    eotBuffs: [] as any[],
    enchantments: [] as any[],
    controller: 'o',
    ...overrides,
  };
}

function makeBaseState(overrides: Record<string, any> = {}) {
  return {
    phase: 'COMBAT_ATTACKERS',
    active: 'o',
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

test.describe('first-strike combat damage -- desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  // FS-E2E-01: First-strike attacker survives; non-first-strike blocker does not.
  test('FS-E2E-01: first-strike attacker kills blocker and survives with 0 damage', async ({ page }) => {
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: [] });
    const initialState = makeBaseState({
      o: { bf: [attacker] },
      p: { bf: [blocker] },
    });

    const result = await page.evaluate(async ({ state, att, bl }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');

      let s = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: att.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
      s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
      s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: att.iid, blId: bl.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
      s = duelReducer(s, { type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE (resolves)

      const attSurvived  = s.o.bf.some((c: any) => c.iid === att.iid);
      const attDamage    = s.o.bf.find((c: any) => c.iid === att.iid)?.damage ?? -1;
      const blKilled     = !s.p.bf.some((c: any) => c.iid === bl.iid);
      const blInGy       = s.p.gy.some((c: any) => c.iid === bl.iid);
      const hasFirstStrikeLog = s.log.some((e: any) => e.text === 'First strike damage.');
      return { attSurvived, attDamage, blKilled, blInGy, hasFirstStrikeLog };
    }, { state: initialState, att: attacker, bl: blocker });

    expect(result.attSurvived, 'first-strike attacker should survive').toBe(true);
    expect(result.attDamage, 'first-strike attacker should have 0 damage marked').toBe(0);
    expect(result.blKilled, 'non-first-strike blocker should be destroyed').toBe(true);
    expect(result.blInGy, 'blocker should be in graveyard').toBe(true);
    expect(result.hasFirstStrikeLog, 'log should contain first-strike damage entry').toBe(true);
  });

  // FS-E2E-02: Normal mutual-lethal combat (no first strike) still kills both.
  test('FS-E2E-02: mutual-lethal combat without first strike kills both combatants', async ({ page }) => {
    const attacker = makeCreature('att-1', { controller: 'o', keywords: [] });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: [] });
    const initialState = makeBaseState({
      o: { bf: [attacker] },
      p: { bf: [blocker] },
    });

    const result = await page.evaluate(async ({ state, att, bl }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');

      let s = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: att.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: att.iid, blId: bl.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });

      return {
        attKilled: !s.o.bf.some((c: any) => c.iid === att.iid),
        attInGy:   s.o.gy.some((c: any) => c.iid === att.iid),
        blKilled:  !s.p.bf.some((c: any) => c.iid === bl.iid),
        blInGy:    s.p.gy.some((c: any) => c.iid === bl.iid),
      };
    }, { state: initialState, att: attacker, bl: blocker });

    expect(result.attKilled, 'attacker should die in mutual-lethal combat').toBe(true);
    expect(result.attInGy,   'attacker should be in graveyard').toBe(true);
    expect(result.blKilled,  'blocker should die in mutual-lethal combat').toBe(true);
    expect(result.blInGy,    'blocker should be in graveyard').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mobile suite (390x844) -- same tests at mobile viewport
// ---------------------------------------------------------------------------

test.describe('first-strike combat damage -- mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  });

  test('FS-E2E-01: first-strike attacker kills blocker and survives with 0 damage', async ({ page }) => {
    const attacker = makeCreature('att-1', { controller: 'o', keywords: ['FIRST_STRIKE'] });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: [] });
    const initialState = makeBaseState({
      o: { bf: [attacker] },
      p: { bf: [blocker] },
    });

    const result = await page.evaluate(async ({ state, att, bl }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');

      let s = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: att.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: att.iid, blId: bl.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });

      const attSurvived  = s.o.bf.some((c: any) => c.iid === att.iid);
      const attDamage    = s.o.bf.find((c: any) => c.iid === att.iid)?.damage ?? -1;
      const blKilled     = !s.p.bf.some((c: any) => c.iid === bl.iid);
      const blInGy       = s.p.gy.some((c: any) => c.iid === bl.iid);
      const hasFirstStrikeLog = s.log.some((e: any) => e.text === 'First strike damage.');
      return { attSurvived, attDamage, blKilled, blInGy, hasFirstStrikeLog };
    }, { state: initialState, att: attacker, bl: blocker });

    expect(result.attSurvived).toBe(true);
    expect(result.attDamage).toBe(0);
    expect(result.blKilled).toBe(true);
    expect(result.blInGy).toBe(true);
    expect(result.hasFirstStrikeLog).toBe(true);
  });

  test('FS-E2E-02: mutual-lethal combat without first strike kills both combatants', async ({ page }) => {
    const attacker = makeCreature('att-1', { controller: 'o', keywords: [] });
    const blocker  = makeCreature('bl-1',  { controller: 'p', keywords: [] });
    const initialState = makeBaseState({
      o: { bf: [attacker] },
      p: { bf: [blocker] },
    });

    const result = await page.evaluate(async ({ state, att, bl }: any) => {
      const { duelReducer } = await import('/src/engine/DuelCore.js');

      let s = duelReducer(state, { type: 'DECLARE_ATTACKER', iid: att.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'DECLARE_BLOCKER', attId: att.iid, blId: bl.iid });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });
      s = duelReducer(s, { type: 'ADVANCE_PHASE' });

      return {
        attKilled: !s.o.bf.some((c: any) => c.iid === att.iid),
        attInGy:   s.o.gy.some((c: any) => c.iid === att.iid),
        blKilled:  !s.p.bf.some((c: any) => c.iid === bl.iid),
        blInGy:    s.p.gy.some((c: any) => c.iid === bl.iid),
      };
    }, { state: initialState, att: attacker, bl: blocker });

    expect(result.attKilled).toBe(true);
    expect(result.attInGy).toBe(true);
    expect(result.blKilled).toBe(true);
    expect(result.blInGy).toBe(true);
  });
});
