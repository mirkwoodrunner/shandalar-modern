# Investigation: Vitest Picking Up Playwright Specs

## Symptom

`npm test` (Vitest) reports 6 failing test files with the error:

```
Error: Playwright Test did not expect test.describe() to be called here.
```

All 101 actual Vitest unit tests pass. Only the file-level errors are failing.

## Failing Files

All six are Playwright specs located in `tests/e2e/`:

- `tests/e2e/ai-mana-tracking.spec.js`
- `tests/e2e/difficulty.spec.js`
- `tests/e2e/instant-cast-priority-window.spec.js`
- `tests/e2e/layer-engine.spec.js`
- `tests/e2e/lotus-cancel-undo.spec.js`
- `tests/e2e/undo-mana-taps-all-phases.spec.js`

## Root Cause

The Vitest `include` glob in `vite.config.js` line 8 is:

```js
include: [
  'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
  'tests/**/*.mjs',
  'tests/**/*.{test,spec}.?(c|m)[jt]s?(x)',  // matches tests/e2e/*.spec.js
]
```

The third pattern matches `tests/e2e/*.spec.js`. Those files are Playwright tests that import from `@playwright/test` and use its `test.describe()` API. Vitest does not understand that API and crashes at the first `test.describe()` call.

Note: the `e2e/` directory at the project root (e.g. `e2e/sandbox.spec.ts`) is **not** affected — it falls outside the `tests/**` glob and is only run by Playwright.

## Pre-existing

This is not caused by any recent branch work. The baseline on `main` showed 7 failing / 12 passing. The counter-targeting branch moved it to 6 failing / 13 passing only because a new passing Vitest file was added (`src/engine/__tests__/counter-targeting.test.js`).

## Suggested Fix

Add an explicit `exclude` entry in `vite.config.js` to keep Vitest out of the Playwright directory:

```js
// vite.config.js — inside the test: {} block
exclude: [
  '**/node_modules/**',
  'tests/e2e/**',        // Playwright specs; run via playwright.config.js
],
```

Alternatively, narrow the third `include` pattern to only match files under `tests/` that are not in `tests/e2e/`:

```js
include: [
  'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
  'tests/**/*.mjs',
  'tests/scenarios/**/*.{test,spec}.?(c|m)[jt]s?(x)',
],
```

Playwright already discovers `tests/e2e/` via `playwright.config.js` — Vitest should never touch those files.

## Verification

After the fix, `npm test` should report:

```
Test Files  0 failed | 13 passed (13)
     Tests  101 passed (101)
```

And `npm run test:e2e` should continue to run the Playwright suite unchanged.
