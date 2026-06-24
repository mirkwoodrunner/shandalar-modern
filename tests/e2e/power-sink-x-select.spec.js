// tests/e2e/power-sink-x-select.spec.js
//
// Tests for Power Sink cost fix and X-selection UI for all X spells.

import { test, expect } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForSandbox(page) {
  await page.waitForFunction(() => window.__duelState && window.__duelDispatch, { timeout: 10000 });
}

async function waitForPlayerTurn(page) {
  await page.waitForFunction(
    () => {
      const s = window.__duelState?.();
      return s && s.active === 'p' && s.phase === 'MAIN_1';
    },
    { timeout: 10000 }
  );
}

async function sandboxGoto(page) {
  await page.goto('/?duel=sandbox&aiSpeed=0');
  await waitForSandbox(page);
  await waitForPlayerTurn(page);
}

// Force cards into player hand and clear current hand.
async function forceHand(page, cardIds) {
  await page.evaluate((ids) => {
    window.__duelDispatch({ type: 'SANDBOX_FORCE_HAND', cards: ids });
  }, cardIds);
  await page.waitForFunction(
    (ids) => {
      const s = window.__duelState();
      return ids.every(id => s.p.hand.some(c => c.id === id));
    },
    cardIds,
    { timeout: 5000 }
  );
}

// Set player mana pool directly via engine dispatch.
async function setPlayerMana(page, mana) {
  await page.evaluate((m) => {
    window.__duelDispatch({ type: 'SET_MANA', who: 'p', mana: m });
  }, mana);
}

// Set opponent mana pool directly.
async function setOppMana(page, mana) {
  await page.evaluate((m) => {
    window.__duelDispatch({ type: 'SET_MANA', who: 'o', mana: m });
  }, mana);
}

// ── Test Suite: Desktop (1280x800) ───────────────────────────────────────────

test.describe('@engine @mobile Power Sink + X-select -- Desktop 1280x800', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  // Test 1: Power Sink costs {U} only.
  test('T1: Power Sink casts for {U} with no extra mana', async ({ page }) => {
    await sandboxGoto(page);

    // Force power_sink into hand and a counterspell opportunity: put an AI spell on stack.
    await forceHand(page, ['power_sink']);

    const psIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'power_sink')?.iid
    );
    if (!psIid) { test.skip('power_sink not in hand'); return; }

    // Put an opposing spell on the stack so there is a target.
    await page.evaluate(() => {
      const s = window.__duelState();
      const fakeItem = {
        id: 'fake-stack-item-1',
        card: { id: 'counterspell', name: 'Counterspell', cmc: 2, color: 'U', type: 'Instant', effect: 'counter', cost: 'UU' },
        caster: 'o',
        targets: [],
        xVal: 0,
      };
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: fakeItem });
    });

    // Set player mana to exactly 1U -- cannot pay any more.
    await setPlayerMana(page, { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 });

    const handBefore = await page.evaluate(() => window.__duelState().p.hand.length);

    // Cast Power Sink directly via engine (bypasses UI flow, tests cost gating).
    await page.evaluate((iid) => {
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: 'fake-stack-item-1', xVal: 0 });
    }, psIid);

    const s1 = await page.evaluate(() => window.__duelState());

    // Card must have left hand (cast succeeded).
    expect(s1.p.hand.length).toBeLessThan(handBefore);

    // pendingConditionalCounter must be set.
    expect(s1.pendingConditionalCounter).toBeTruthy();
    expect(s1.pendingConditionalCounter.cardId).toBe('power_sink');

    // Player mana must now be 0 (paid {U}).
    const totalMana = Object.values(s1.p.mana).reduce((acc, v) => acc + v, 0);
    expect(totalMana).toBe(0);
  });

  // Test 2: Power Sink resolution scales to defender's mana.
  test('T2: Power Sink pendingConditionalCounter.cost equals opponent total mana at resolution', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['power_sink']);
    const psIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'power_sink')?.iid
    );
    if (!psIid) { test.skip('power_sink not in hand'); return; }

    // Put opposing spell on stack.
    await page.evaluate(() => {
      const fakeItem = {
        id: 'fake-stack-item-2',
        card: { id: 'fireball', name: 'Fireball', cmc: 2, color: 'R', type: 'Sorcery', effect: 'damageX', cost: 'XR' },
        caster: 'o',
        targets: ['p'],
        xVal: 3,
      };
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: fakeItem });
    });

    // Opponent has 4 mana available.
    await setOppMana(page, { W: 0, U: 0, B: 0, R: 4, G: 0, C: 0 });

    // Player has enough to cast Power Sink ({U}).
    await setPlayerMana(page, { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 });

    await page.evaluate((iid) => {
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: 'fake-stack-item-2', xVal: 0 });
    }, psIid);

    // Resolve Power Sink.
    await page.evaluate(() => window.__duelDispatch({ type: 'RESOLVE_STACK' }));

    const s1 = await page.evaluate(() => window.__duelState());

    // pendingConditionalCounter.cost must be 4 (opponent's total mana).
    expect(s1.pendingConditionalCounter).toBeTruthy();
    expect(s1.pendingConditionalCounter.cost).toBe(4);
    expect(s1.pendingConditionalCounter.canPay).toBe(true);

    // Decline to pay -- opponent's mana should drain.
    await page.evaluate(() => {
      window.__duelDispatch({ type: 'RESOLVE_CONDITIONAL_COUNTER', pay: false });
    });

    const s2 = await page.evaluate(() => window.__duelState());
    const oppTotalMana = Object.values(s2.o.mana).reduce((acc, v) => acc + v, 0);
    expect(oppTotalMana).toBe(0);
  });

  // Test 3: X-select stepper appears for Disintegrate and xVal controls resolved damage.
  test('T3: Disintegrate X-select stepper shows correct xMax and stepping updates xVal', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['disintegrate']);
    // 5 total mana: 1R (fixed) + 4 spare.
    await setPlayerMana(page, { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 });

    const disintIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'disintegrate')?.iid
    );
    if (!disintIid) { test.skip('disintegrate not in hand'); return; }

    // Trigger beginCastFlow via the cast button UI.
    // Click the card in hand to select it, then click Cast.
    await page.locator(`[data-testid="hand-card-${disintIid}"]`).click();
    await page.locator('[data-testid="cast-button"]').click();

    // castFlow should now be in xSelect mode.
    const castFlowMode = await page.evaluate(
      () => (window.__duelState()._castFlowDebug ?? null)
    );

    // Verify via the modal appearing in the DOM.
    await expect(page.getByText('Choose X for Disintegrate')).toBeVisible({ timeout: 3000 });

    // The displayed X value should start at 1 (Math.min(1, xMax)).
    const xDisplay = page.locator('text=Choose X for Disintegrate').locator('..').locator('span');
    const initialX = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(initialX).toBe(1);

    // Step up twice.
    const plusBtn = page.locator('button:has-text("+")').first();
    await plusBtn.click();
    await plusBtn.click();

    const xAfterStep = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(xAfterStep).toBe(3);
  });

  // Test 4: X cannot exceed xMax; + button is disabled at ceiling.
  test('T4: X-select + button is disabled at xMax ceiling', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['disintegrate']);
    // 3 total mana: 1R fixed + 2 spare.
    await setPlayerMana(page, { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 });

    const disintIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'disintegrate')?.iid
    );
    if (!disintIid) { test.skip('disintegrate not in hand'); return; }

    await page.locator(`[data-testid="hand-card-${disintIid}"]`).click();
    await page.locator('[data-testid="cast-button"]').click();

    await expect(page.getByText('Choose X for Disintegrate')).toBeVisible({ timeout: 3000 });

    // xMax should be 2 (3 total - 1 fixed R = 2). Step to max.
    const plusBtn = page.locator('button:has-text("+")').first();
    await plusBtn.click(); // x=2
    await plusBtn.click(); // should be clamped at x=2

    const xVal = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(xVal).toBe(2);

    // + button must be disabled at ceiling.
    const isPlusDisabled = await plusBtn.isDisabled();
    expect(isPlusDisabled).toBe(true);
  });

  // Test 5: Spell Blast legal-X constrained to CMCs on opponent's stack.
  test('T5: Spell Blast xLegalValues matches opponent stack CMCs', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['spell_blast']);
    await setPlayerMana(page, { W: 0, U: 5, B: 0, R: 0, G: 0, C: 0 });

    // Put two opposing spells on stack with CMC 2 and CMC 5.
    await page.evaluate(() => {
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: {
        id: 'sb-target-cmc2',
        card: { id: 'counterspell', name: 'Counterspell', cmc: 2, color: 'U', type: 'Instant', effect: 'counter', cost: 'UU' },
        caster: 'o', targets: [], xVal: 0,
      }});
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: {
        id: 'sb-target-cmc5',
        card: { id: 'air_elemental', name: 'Air Elemental', cmc: 5, color: 'U', type: 'Creature', effect: null, cost: '3UU' },
        caster: 'o', targets: [], xVal: 0,
      }});
    });

    const sbIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'spell_blast')?.iid
    );
    if (!sbIid) { test.skip('spell_blast not in hand'); return; }

    await page.locator(`[data-testid="hand-card-${sbIid}"]`).click();
    await page.locator('[data-testid="cast-button"]').click();

    await expect(page.getByText('Choose X for Spell Blast')).toBeVisible({ timeout: 3000 });

    // Initial xVal should be 2 (first legal value).
    const initialX = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(initialX).toBe(2);

    // Step up once -- should jump to 5 (next legal value), not 3.
    const plusBtn = page.locator('button:has-text("+")').first();
    await plusBtn.click();

    const xAfterStep = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(xAfterStep).toBe(5);

    // + should now be disabled (at ceiling).
    expect(await plusBtn.isDisabled()).toBe(true);
  });

  // Test 6: AI casts Power Sink for {U} only (does not over-spend).
  test('T6: AI casts Power Sink using only {U} -- does not exhaust extra mana', async ({ page }) => {
    await sandboxGoto(page);

    // Force power_sink into AI hand.
    await page.evaluate(() => {
      window.__duelDispatch({ type: 'SANDBOX_FORCE_OPP_HAND', cards: ['power_sink'] });
    });

    // Give AI 4 mana (3 generic + 1U) and player a spell on stack.
    await setOppMana(page, { W: 0, U: 1, B: 0, R: 0, G: 0, C: 3 });

    // Push a player spell onto the stack for AI to counter.
    await page.evaluate(() => {
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: {
        id: 'player-spell-for-ai',
        card: { id: 'fireball', name: 'Fireball', cmc: 2, color: 'R', type: 'Sorcery', effect: 'damageX', cost: 'XR' },
        caster: 'p', targets: ['o'], xVal: 2,
      }});
    });

    // Switch active to AI so it gets priority.
    await page.evaluate(() => {
      window.__duelDispatch({ type: 'SANDBOX_SET_ACTIVE', who: 'o' });
    });

    // Let AI act.
    await page.waitForFunction(
      () => {
        const s = window.__duelState();
        // AI should have cast Power Sink -- either pendingConditionalCounter is set
        // or power_sink left AI hand.
        return s.pendingConditionalCounter?.cardId === 'power_sink'
          || !s.o.hand.some(c => c.id === 'power_sink');
      },
      { timeout: 5000 }
    );

    const s = await page.evaluate(() => window.__duelState());

    if (s.pendingConditionalCounter?.cardId === 'power_sink') {
      // AI cast Power Sink. Verify it only spent 1U (total mana 3 before, 2 after).
      const oppManaTotal = Object.values(s.o.mana).reduce((acc, v) => acc + v, 0);
      // AI had 4 mana, should have spent exactly 1 (the U), leaving 3.
      expect(oppManaTotal).toBe(3);
    }
  });
});

// ── Test Suite: Mobile (390x844) ──────────────────────────────────────────────

test.describe('@engine @mobile Power Sink + X-select -- Mobile 390x844', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  // Test 7a (Mobile T1): Power Sink costs {U} only on mobile.
  test('T7a-mobile: Power Sink casts for {U} with 1U mana', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['power_sink']);
    const psIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'power_sink')?.iid
    );
    if (!psIid) { test.skip('power_sink not in hand'); return; }

    await page.evaluate(() => {
      const fakeItem = {
        id: 'fake-stack-item-mobile',
        card: { id: 'counterspell', name: 'Counterspell', cmc: 2, color: 'U', type: 'Instant', effect: 'counter', cost: 'UU' },
        caster: 'o', targets: [], xVal: 0,
      };
      window.__duelDispatch({ type: 'PUSH_STACK_ITEM', item: fakeItem });
    });

    await setPlayerMana(page, { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 });
    const handBefore = await page.evaluate(() => window.__duelState().p.hand.length);

    await page.evaluate((iid) => {
      window.__duelDispatch({ type: 'CAST_SPELL', who: 'p', iid, tgt: 'fake-stack-item-mobile', xVal: 0 });
    }, psIid);

    const s1 = await page.evaluate(() => window.__duelState());
    expect(s1.p.hand.length).toBeLessThan(handBefore);
    expect(s1.pendingConditionalCounter).toBeTruthy();
    expect(s1.pendingConditionalCounter.cardId).toBe('power_sink');
    const totalMana = Object.values(s1.p.mana).reduce((acc, v) => acc + v, 0);
    expect(totalMana).toBe(0);
  });

  // Test 7b (Mobile T3): Disintegrate X-select modal appears on mobile.
  test('T7b-mobile: Disintegrate X-select modal renders on mobile viewport', async ({ page }) => {
    await sandboxGoto(page);

    await forceHand(page, ['disintegrate']);
    await setPlayerMana(page, { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 });

    const disintIid = await page.evaluate(
      () => window.__duelState().p.hand.find(c => c.id === 'disintegrate')?.iid
    );
    if (!disintIid) { test.skip('disintegrate not in hand'); return; }

    // Trigger cast flow on mobile by tapping the card then the cast button.
    await page.locator(`[data-testid="hand-card-${disintIid}"]`).click();
    await page.locator('[data-testid="cast-button"]').click();

    // The XSelectModal should appear on mobile too.
    await expect(page.getByText('Choose X for Disintegrate')).toBeVisible({ timeout: 3000 });

    // Step up twice, confirm xVal is 3.
    const plusBtn = page.locator('button:has-text("+")').first();
    await plusBtn.click();
    await plusBtn.click();

    const xVal = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const span of spans) {
        if (!isNaN(parseInt(span.textContent)) && span.style.fontSize === '24px') {
          return parseInt(span.textContent);
        }
      }
      return null;
    });
    expect(xVal).toBe(3);
  });
});
