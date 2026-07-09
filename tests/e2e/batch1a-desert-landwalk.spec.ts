import { test, expect, Page } from '@playwright/test';

const SANDBOX_URL = '/?duel=sandbox&aiSpeed=0';
const sandboxWith = (cards: string) => `${SANDBOX_URL}&cards=${cards}`;

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT  = { width: 390,  height: 844 };

async function waitForDuel(page: Page) {
  await page.waitForSelector('[data-testid="duel-screen"]', { timeout: 10_000 });
}

async function waitForMain1(page: Page) {
  await page.waitForFunction(() => {
    const s = (window as any).__duelState?.();
    return s && s.phase === 'MAIN_1' && s.active === 'p';
  }, { timeout: 20_000 });
}

// Cast a card from hand (by id) and resolve the stack, returns iid.
async function castAndResolve(page: Page, cardId: string): Promise<string> {
  const iid = await page.evaluate((id) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const card = (s.p.hand as any[]).find((c: any) => c.id === id);
    if (!card) throw new Error(`${id} not in hand`);
    dispatch({ type: 'CAST_SPELL', who: 'p', iid: card.iid, tgt: null, xVal: 0 });
    dispatch({ type: 'PASS_PRIORITY', who: 'p' });
    dispatch({ type: 'PASS_PRIORITY', who: 'o' });
    dispatch({ type: 'RESOLVE_STACK' });
    return card.iid;
  }, cardId);
  await page.waitForFunction((id) => {
    const s = (window as any).__duelState?.();
    return (s?.p?.bf as any[])?.some((c: any) => c.id === id);
  }, cardId, { timeout: 10_000 });
  return iid;
}

// Place a land from hand onto the battlefield.
async function playLand(page: Page, cardId: string): Promise<string> {
  const iid = await page.evaluate((id) => {
    const s = (window as any).__duelState();
    const dispatch = (window as any).__duelDispatch;
    const land = (s.p.hand as any[]).find((c: any) => c.id === id);
    if (!land) throw new Error(`${id} not in hand`);
    dispatch({ type: 'PLAY_LAND', who: 'p', iid: land.iid });
    return land.iid;
  }, cardId);
  await page.waitForFunction((id) => {
    const s = (window as any).__duelState?.();
    return (s?.p?.bf as any[])?.some((c: any) => c.id === id);
  }, cardId, { timeout: 5_000 });
  return iid;
}

// Set up Desert ping scenario: Desert + attacker on BF, attacker declared, phase at COMBAT_END.
// Returns { desertIid, attackerIid }.
async function setupDesertPingScenario(
  page: Page,
  attackerCardId: string,
  mana: Record<string, number> = { R: 3, C: 3 }
): Promise<{ desertIid: string; attackerIid: string }> {
  // Force both cards into hand and set mana for casting.
  await page.evaluate(({ atkId, manaArg }) => {
    const dispatch = (window as any).__duelDispatch;
    dispatch({ type: 'SANDBOX_FORCE_HAND', who: 'p', cardIds: ['desert', atkId], mana: manaArg });
  }, { atkId: attackerCardId, manaArg: mana });

  const desertIid = await playLand(page, 'desert');
  const attackerIid = await castAndResolve(page, attackerCardId);

  // Clear summoning sickness on the attacker so it can attack.
  await page.evaluate((iid) => {
    (window as any).__duelDispatch({ type: 'DEBUG_PATCH_CARD', iid, patch: { summoningSick: false } });
  }, attackerIid);

  // Navigate to COMBAT_ATTACKERS and declare the attacker.
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_ATTACKERS', active: 'p' });
  });
  await page.evaluate((iid) => {
    (window as any).__duelDispatch({ type: 'DECLARE_ATTACKER', iid });
  }, attackerIid);

  // Verify the attacker was accepted.
  const inAttackers = await page.evaluate((iid) => {
    const s = (window as any).__duelState();
    return (s.attackers || []).includes(iid);
  }, attackerIid);
  expect(inAttackers).toBe(true);

  // Advance to COMBAT_END while preserving s.attackers (SET_PHASE_FOR_TEST clears the stack
  // but leaves attackers intact).
  await page.evaluate(() => {
    (window as any).__duelDispatch({ type: 'SET_PHASE_FOR_TEST', phase: 'COMBAT_END', active: 'p' });
  });

  return { desertIid, attackerIid };
}

// ---------------------------------------------------------------------------
// Test cases for both viewports
// ---------------------------------------------------------------------------

function desertLandwalkTests() {
  // ── 1. Desert vs Desert Nomads: damage prevented ────────────────────────────
  test('1A: Desert ping is prevented on Desert Nomads (preventsDesertDamage)', async ({ page }) => {
    await page.goto(sandboxWith('desert,desert_nomads'));
    await waitForDuel(page);
    await waitForMain1(page);

    const { desertIid, attackerIid } = await setupDesertPingScenario(page, 'desert_nomads');

    // Record damage before activation.
    const damageBefore = await page.evaluate((iid) => {
      const s = (window as any).__duelState();
      const c = [...s.p.bf, ...s.o.bf].find((x: any) => x.iid === iid);
      return c?.damage ?? 0;
    }, attackerIid);

    // Activate Desert's ping ability targeting Desert Nomads.
    await page.evaluate(({ dIid, aIid }) => {
      (window as any).__duelDispatch({
        type: 'ACTIVATE_ABILITY',
        who: 'p',
        iid: dIid,
        abilityId: 'desert_damage',
        tgt: aIid,
      });
    }, { dIid: desertIid, aIid: attackerIid });

    const s = await page.evaluate(() => (window as any).__duelState());
    const nomads = [...s.p.bf, ...s.o.bf].find((c: any) => c.iid === attackerIid);

    // Desert Nomads has preventsDesertDamage: damage must not increase.
    expect(nomads?.damage ?? 0).toBe(damageBefore);

    // The log should mention prevention, not damage.
    const lastLog = s.log[s.log.length - 1]?.text ?? '';
    expect(lastLog).toMatch(/prevented|prevention/i);
  });

  // ── 2. Desert vs generic attacker: 1 damage applied ────────────────────────
  test('1B: Desert ping deals 1 damage to non-Desertwalk attacker', async ({ page }) => {
    await page.goto(sandboxWith('desert,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    const { desertIid, attackerIid } = await setupDesertPingScenario(page, 'grizzly_bears', { G: 3, C: 3 });

    const damageBefore = await page.evaluate((iid) => {
      const s = (window as any).__duelState();
      const c = [...s.p.bf, ...s.o.bf].find((x: any) => x.iid === iid);
      return c?.damage ?? 0;
    }, attackerIid);

    await page.evaluate(({ dIid, aIid }) => {
      (window as any).__duelDispatch({
        type: 'ACTIVATE_ABILITY',
        who: 'p',
        iid: dIid,
        abilityId: 'desert_damage',
        tgt: aIid,
      });
    }, { dIid: desertIid, aIid: attackerIid });

    const s = await page.evaluate(() => (window as any).__duelState());
    const bears = [...s.p.bf, ...s.o.bf].find((c: any) => c.iid === attackerIid);
    expect((bears?.damage ?? 0)).toBe(damageBefore + 1);
  });

  // ── 3. Sandals of Abdallah: eotBuffs contains islandwalk ────────────────────
  test('1C: Sandals of Abdallah grants islandwalk via eotBuffs', async ({ page }) => {
    await page.goto(sandboxWith('sandals_of_abdallah,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    // Force cards into hand with mana to cast both.
    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cardIds: ['sandals_of_abdallah', 'grizzly_bears'],
        mana: { G: 2, C: 6 },
      });
    });

    const sandalsIid = await castAndResolve(page, 'sandals_of_abdallah');
    const bearsIid = await castAndResolve(page, 'grizzly_bears');

    // Activate Sandals: cost is 2,T (2 generic + tap). Mana pool is already funded.
    await page.evaluate(({ sIid, bIid }) => {
      (window as any).__duelDispatch({
        type: 'ACTIVATE_ABILITY',
        who: 'p',
        iid: sIid,
        tgt: bIid,
      });
      // Resolve the stack item (ability pushed to stack).
      (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'p' });
      (window as any).__duelDispatch({ type: 'PASS_PRIORITY', who: 'o' });
      (window as any).__duelDispatch({ type: 'RESOLVE_STACK' });
    }, { sIid: sandalsIid, bIid: bearsIid });

    const s = await page.evaluate(() => (window as any).__duelState());
    const bears = [...s.p.bf, ...s.o.bf].find((c: any) => c.iid === bearsIid);

    // eotBuffs must contain an entry with ISLANDWALK keyword.
    const hasIslandwalk = (bears?.eotBuffs ?? []).some(
      (b: any) => (b.keywords ?? []).includes('ISLANDWALK')
    );
    expect(hasIslandwalk).toBe(true);

    // Sandals should be tapped after activation.
    const sandals = [...s.p.bf, ...s.o.bf].find((c: any) => c.iid === sandalsIid);
    expect(sandals?.tapped).toBe(true);
  });

  // ── 4. Goblin King anthem: Goblin Hero's battlefield tile shows 3/2, not 2/1 ──
  test('1D: Goblin King anthem reflects on Goblin Hero battlefield tile P/T', async ({ page }) => {
    await page.goto(sandboxWith('goblin_king,goblin_hero'));
    await waitForDuel(page);
    await waitForMain1(page);

    await page.evaluate(() => {
      (window as any).__duelDispatch({
        type: 'SANDBOX_FORCE_HAND',
        who: 'p',
        cardIds: ['goblin_king', 'goblin_hero'],
        mana: { R: 5, C: 5 },
      });
    });

    await castAndResolve(page, 'goblin_king');
    const heroIid = await castAndResolve(page, 'goblin_hero');

    const cardText = await page.locator(`[data-iid="${heroIid}"]`).innerText();
    expect(cardText).toContain('3/2');
    expect(cardText).not.toContain('2/1');
  });

  // ── 5. Goblin King mountainwalk: Goblin Hero unblockable when defender controls Badlands ──
  test('1E: Goblin Hero (Goblin King mountainwalk) cannot be blocked when defender controls Badlands', async ({ page }) => {
    await page.goto(sandboxWith('goblin_king,goblin_hero,badlands,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    const attIid = 'e2e-hero-1';
    const kingIid = 'e2e-king-1';
    const blIid = 'e2e-bl-1';
    const landIid = 'e2e-badlands-1';

    await page.evaluate(({ attIid, kingIid, blIid, landIid }) => {
      const s = (window as any).__duelState();
      const hero = { iid: attIid, id: 'goblin_hero', name: 'Goblin Hero', type: 'Creature', subtype: 'Goblin Warrior', color: 'R', cmc: 2, cost: '1R', power: 2, toughness: 1, keywords: [], tapped: false, summoningSick: false, attacking: true, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o' };
      const king = { iid: kingIid, id: 'goblin_king', name: 'Goblin King', type: 'Creature', subtype: 'Goblin Legend', color: 'R', cmc: 3, cost: '1RR', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o', effect: 'lordEffect', targets: 'goblin', mod: { power: 1, toughness: 1 }, lordKeywords: ['MOUNTAINWALK'] };
      const blocker = { iid: blIid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' };
      const badlandsCard = { iid: landIid, id: 'badlands', name: 'Badlands', type: 'Land', subtype: 'Swamp Mountain', color: '', cmc: 0, cost: '', tapped: false, produces: ['B', 'R'], controller: 'p' };

      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          phase: 'COMBAT_BLOCKERS',
          active: 'o',
          attackers: [attIid],
          blockers: {},
          priorityWindow: false,
          stack: [],
          o: { ...s.o, bf: [king, hero] },
          p: { ...s.p, bf: [blocker, badlandsCard] },
        },
      });
    }, { attIid, kingIid, blIid, landIid });

    await page.evaluate(({ attIid, blIid }) => {
      (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: attIid, blId: blIid });
    }, { attIid, blIid });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.blockers[blIid], 'block should have been rejected -- defender controls Badlands, attacker has mountainwalk').toBeUndefined();
  });

  // ── 6. Positive control: same setup without a Mountain-type land -- block succeeds ──
  test('1F: Goblin Hero (Goblin King mountainwalk) is blockable when defender has no Mountain-type land', async ({ page }) => {
    await page.goto(sandboxWith('goblin_king,goblin_hero,grizzly_bears'));
    await waitForDuel(page);
    await waitForMain1(page);

    const attIid = 'e2e-hero-2';
    const kingIid = 'e2e-king-2';
    const blIid = 'e2e-bl-2';

    await page.evaluate(({ attIid, kingIid, blIid }) => {
      const s = (window as any).__duelState();
      const hero = { iid: attIid, id: 'goblin_hero', name: 'Goblin Hero', type: 'Creature', subtype: 'Goblin Warrior', color: 'R', cmc: 2, cost: '1R', power: 2, toughness: 1, keywords: [], tapped: false, summoningSick: false, attacking: true, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o' };
      const king = { iid: kingIid, id: 'goblin_king', name: 'Goblin King', type: 'Creature', subtype: 'Goblin Legend', color: 'R', cmc: 3, cost: '1RR', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'o', effect: 'lordEffect', targets: 'goblin', mod: { power: 1, toughness: 1 }, lordKeywords: ['MOUNTAINWALK'] };
      const blocker = { iid: blIid, id: 'grizzly_bears', name: 'Grizzly Bears', type: 'Creature', subtype: 'Bear', color: 'G', cmc: 2, cost: '1G', power: 2, toughness: 2, keywords: [], tapped: false, summoningSick: false, attacking: false, blocking: null, damage: 0, counters: {}, eotBuffs: [], enchantments: [], controller: 'p' };

      (window as any).__duelDispatch({
        type: 'DEBUG_SET_ACTIVE',
        patch: {
          phase: 'COMBAT_BLOCKERS',
          active: 'o',
          attackers: [attIid],
          blockers: {},
          priorityWindow: false,
          stack: [],
          o: { ...s.o, bf: [king, hero] },
          p: { ...s.p, bf: [blocker] },
        },
      });
    }, { attIid, kingIid, blIid });

    await page.evaluate(({ attIid, blIid }) => {
      (window as any).__duelDispatch({ type: 'DECLARE_BLOCKER', attId: attIid, blId: blIid });
    }, { attIid, blIid });

    const s = await page.evaluate(() => (window as any).__duelState());
    expect(s.blockers[blIid]).toBe(attIid);
  });
}

// ---------------------------------------------------------------------------
// Desktop suite
// ---------------------------------------------------------------------------
test.describe('@engine @mobile Batch 1A Desert/Landwalk -- desktop (1280x800)', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });
  desertLandwalkTests();
});

// ---------------------------------------------------------------------------
// Mobile suite (same logic, same assertions -- verifies mobile/desktop parity)
// ---------------------------------------------------------------------------
test.describe('@engine @mobile Batch 1A Desert/Landwalk -- mobile (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });
  desertLandwalkTests();
});
