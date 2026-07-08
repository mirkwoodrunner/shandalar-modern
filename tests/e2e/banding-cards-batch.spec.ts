// tests/e2e/banding-cards-batch.spec.ts
//
// End-to-end coverage for banding phase 3 of 3: Battering Ram's live
// begin-of-combat banding grant actually surfaces the pre-existing
// BandFormationPanel (phase 1 UI reacting to a real card for the first time,
// not a synthetic test creature), its blocked-by-Wall destruction resolves at
// end of combat, and Mishra's War Machine / Nalathni Dragon play through a
// full AI-driven duel with no console errors.
//
// Tests run at both desktop (1280x800) and mobile (390x844) viewports per
// the project convention.
//
// BAND-CARDS-E2E-01: Battering Ram, once declared as an attacker, gains
//                    banding (BandFormationPanel appears) and destroys a
//                    blocking Wall at end of combat.
// BAND-CARDS-E2E-02: Mishra's War Machine (AI-controlled, auto-resolves its
//                    upkeep with no UI) and Nalathni Dragon play out a full
//                    AI-driven duel with no console errors.

import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';

async function waitForEngineReady(page: Page) {
  await page.waitForFunction(
    () => typeof (window as any).__duelDispatch === 'function' &&
          typeof (window as any).__duelState === 'function',
    { timeout: 15000 },
  );
  const keepBtn = page.locator('[data-testid="mulligan-keep"]');
  if (await keepBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await keepBtn.click();
    await page.waitForTimeout(300);
  }
}

async function dismissMulligan(page: Page) {
  const keepBtn = page.getByTestId('mulligan-keep');
  if (await keepBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await keepBtn.click().catch(() => {});
    await keepBtn.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

async function playToCompletion(page: Page, maxIterations = 400): Promise<boolean> {
  for (let i = 0; i < maxIterations; i++) {
    const over = await page.evaluate(() => !!(window as any).__duelState?.()?.over).catch(() => false);
    if (over) return true;

    await dismissMulligan(page);

    const doneBlocking = page.getByTestId('done-blocking-button');
    if (await doneBlocking.isVisible().catch(() => false)) {
      await doneBlocking.click().catch(() => {});
      continue;
    }

    const endTurn = page.getByTestId('end-turn-button');
    if (await endTurn.isVisible().catch(() => false) && await endTurn.isEnabled().catch(() => false)) {
      await endTurn.click().catch(() => {});
      await page.waitForTimeout(50);
      continue;
    }

    const passPriority = page.getByTestId('pass-priority-button');
    if (await passPriority.isVisible().catch(() => false) && await passPriority.isEnabled().catch(() => false)) {
      await passPriority.click().catch(() => {});
      continue;
    }

    await page.waitForTimeout(100);
  }
  return !!(await page.evaluate(() => (window as any).__duelState?.()?.over).catch(() => false));
}

// Real Battering Ram fields (mirrors src/data/cards.js), not a synthetic test
// creature -- so its triggeredAbilities/blockedByDestroyFilter fire for real.
function makeBatteringRam(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'battering_ram',
    name: 'Battering Ram',
    type: 'Artifact Creature',
    subtype: 'Construct',
    color: '',
    cmc: 2,
    cost: '2',
    power: 1,
    toughness: 1,
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
    blockedByDestroyFilter: 'wall',
    triggeredAbilities: [{
      id: 'battering_ram_combat_begin',
      trigger: { event: 'ON_COMBAT_BEGIN', scope: 'controller' },
      effect: { type: 'grantBandingUntilEndOfCombat' },
    }],
    ...overrides,
  };
}

function makeWall(iid: string, overrides: Record<string, any> = {}) {
  return {
    iid,
    id: 'wall_of_stone',
    name: 'Test Wall',
    type: 'Creature',
    subtype: 'Wall',
    color: 'C',
    cmc: 3,
    cost: '3',
    power: 0,
    toughness: 5,
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

function runSuite(viewport: { width: number; height: number }, label: string) {
  test.describe(`@engine Banding cards batch UI [${label}]`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);
    });

    test('BAND-CARDS-E2E-01: Battering Ram gains banding (panel appears) and destroys a blocking Wall at end of combat', async ({ page }) => {
      const ram = makeBatteringRam('ram-1');
      const wall = makeWall('wall-1');

      await page.evaluate(({ ram }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            phase: 'MAIN_1',
            active: 'p',
            attackers: [],
            blockers: {},
            priorityWindow: false,
            stack: [],
            turnState: { ...s.turnState, activationCounts: {} },
            p: { ...s.p, bf: [ram] },
          },
        });
      }, { ram });

      // -> COMBAT_BEGIN: Battering Ram gains banding via ON_COMBAT_BEGIN.
      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }));
      await page.waitForTimeout(100);
      const afterBegin = await page.evaluate(() => (window as any).__duelState());
      const ramAfterBegin = afterBegin.p.bf.find((c: any) => c.iid === 'ram-1');
      expect(ramAfterBegin.eotBuffs.some((b: any) => b.scope === 'combat' && b.keywords?.includes('BANDING'))).toBe(true);

      // -> COMBAT_ATTACKERS: declare Battering Ram, add the Wall, and confirm
      // the pre-existing BandFormationPanel reacts to this real card.
      await page.evaluate(({ wall }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' });
        (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid: 'ram-1' });
        (window as any).__duelDispatch({ type: 'DEBUG_SET_ACTIVE', patch: { o: { ...s.o, bf: [wall] } } });
      }, { wall });
      await page.waitForTimeout(100);

      const panel = page.locator('[data-testid="band-formation-panel"]');
      await expect(panel).toBeVisible({ timeout: 5000 });

      // Declare the Wall as a blocker, then run combat through to COMBAT_END.
      await page.evaluate(() => {
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_ATTACKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_BLOCKERS
        (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: 'ram-1', blId: 'wall-1' });
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_AFTER_BLOCKERS
        (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' }); // -> COMBAT_DAMAGE
      });
      await page.waitForTimeout(150);

      const midCombat = await page.evaluate(() => (window as any).__duelState());
      expect(midCombat.o.bf.some((c: any) => c.iid === 'wall-1')).toBe(true); // survives combat damage

      await page.evaluate(() => (window as any).__duelDispatch({ type: 'ADVANCE_PHASE' })); // -> COMBAT_END
      await page.waitForTimeout(150);

      const final = await page.evaluate(() => (window as any).__duelState());
      expect(final.o.bf.some((c: any) => c.iid === 'wall-1')).toBe(false);
      expect(final.o.gy.some((c: any) => c.iid === 'wall-1')).toBe(true);
      const ramFinal = final.p.bf.find((c: any) => c.iid === 'ram-1');
      expect(ramFinal.eotBuffs.some((b: any) => b.scope === 'combat')).toBe(false); // banding already expired
    });

    test('BAND-CARDS-E2E-02: Mishra\'s War Machine and Nalathni Dragon play through a full AI-driven duel with no console errors', async ({ page }) => {
      test.setTimeout(90_000);
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

      const mwm = {
        iid: 'mwm-1', id: 'mishrass_war_machine', name: "Mishra's War Machine",
        type: 'Artifact Creature', subtype: 'Juggernaut', color: '', cmc: 7, cost: '7',
        power: 5, toughness: 5, keywords: ['BANDING'], tapped: false, summoningSick: false,
        attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
        controller: 'o', upkeep: 'mishrasWarMachineUpkeep',
      };
      const dragon = {
        iid: 'dragon-1', id: 'nalathni_dragon', name: 'Nalathni Dragon',
        type: 'Creature', subtype: 'Dragon', color: 'R', cmc: 4, cost: '2RR',
        power: 1, toughness: 1, keywords: ['FLYING', 'BANDING'], tapped: false, summoningSick: false,
        attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [],
        controller: 'o',
        activated: { cost: 'R', effect: 'nalathniDragonPump' },
        triggeredAbilities: [{
          id: 'nalathni_dragon_endstep',
          trigger: { event: 'ON_END_STEP' },
          condition: { type: 'activationCountAtLeast', amount: 4 },
          effect: { type: 'nalathniDragonSacrifice' },
        }],
      };

      await page.goto(SANDBOX_URL);
      await waitForEngineReady(page);

      await page.evaluate(({ mwm, dragon }: any) => {
        const s = (window as any).__duelState();
        (window as any).__duelDispatch({
          type: 'DEBUG_SET_ACTIVE',
          patch: {
            o: { ...s.o, bf: [mwm, dragon] },
          },
        });
      }, { mwm, dragon });
      await page.waitForTimeout(100);

      const terminated = await playToCompletion(page);

      expect(pageErrors, `uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
      expect(terminated).toBe(true);
    });
  });
}

runSuite({ width: 1280, height: 800 }, 'desktop');
runSuite({ width: 390, height: 844 }, 'mobile');
