/**
 * @module-tag engine
 */
// src/utils/__tests__/scryfallArt.test.js
// Printing preference + persistent name-to-URL cache for the shared art utility.
//
// ART-01: one-argument call issues the same classic-set query as before.
// ART-02: { sets: [] } skips the set search and goes straight to cards/named.
// ART-03: result carries artist alongside url.
// ART-04: persisted cache hit skips the network call entirely.
// ART-05: malformed persisted value degrades to a clean re-fetch and is cleared.
// ART-06: legacy entry with no artist key reads as artist undefined.
// ART-07: storage that throws falls back to in-memory only, no crash.
// ART-08: definitive "no art" (404) is persisted as a null-url entry.
// ART-09: a network failure is not persisted.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'art-cache:v1';

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: vi.fn(k => (k in data ? data[k] : null)),
    setItem: vi.fn((k, v) => { data[k] = String(v); }),
    removeItem: vi.fn(k => { delete data[k]; }),
  };
}

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ANGEL = {
  artist: 'Douglas Shuler',
  image_uris: { art_crop: 'https://cards.scryfall.io/art_crop/serra.jpg' },
};

async function load() {
  vi.resetModules();
  return import('../scryfallArt.js');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('@engine scryfallArt printing preference and persistent cache', () => {
  it('ART-01: one-argument call searches the classic sets with the pre-L4b-1 query', async () => {
    vi.stubGlobal('localStorage', makeStorage());
    const fetchMock = vi.fn(async () => jsonRes({ data: [ANGEL] }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOldestArt, CLASSIC_PRINTING_SETS } = await load();

    await fetchOldestArt('Serra Angel');

    expect(CLASSIC_PRINTING_SETS).toEqual(['set:lea', 'set:leb', 'set:2ed', 'set:3ed', 'set:4ed']);
    const legacyQuery = encodeURIComponent(
      '!"Serra Angel" (set:lea OR set:leb OR set:2ed OR set:3ed OR set:4ed)'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.scryfall.com/cards/search?order=released&dir=asc&q=${legacyQuery}&unique=prints`
    );
  });

  it('ART-02: empty sets skips the set search', async () => {
    vi.stubGlobal('localStorage', makeStorage());
    const fetchMock = vi.fn(async () => jsonRes(ANGEL));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOldestArt } = await load();

    const res = await fetchOldestArt('Serra Angel', { sets: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.scryfall.com/cards/named?exact=Serra%20Angel'
    );
    expect(res.url).toBe(ANGEL.image_uris.art_crop);
  });

  it('ART-03: resolves to { url, artist }', async () => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ data: [ANGEL] })));
    const { fetchOldestArt } = await load();

    expect(await fetchOldestArt('Serra Angel')).toEqual({
      url: ANGEL.image_uris.art_crop,
      artist: 'Douglas Shuler',
    });
  });

  it('ART-04: persisted cache hit skips the network entirely', async () => {
    const store = makeStorage({
      [KEY]: JSON.stringify({
        'Serra Angel': { url: 'https://x/serra.jpg', artist: 'Douglas Shuler', resolvedAt: '2026-09-23T00:00:00Z' },
      }),
    });
    vi.stubGlobal('localStorage', store);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOldestArt, subscribeCachedArt } = await load();

    expect(subscribeCachedArt('Serra Angel')).toBe('https://x/serra.jpg');
    expect(await fetchOldestArt('Serra Angel')).toEqual({ url: 'https://x/serra.jpg', artist: 'Douglas Shuler' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ART-05: malformed persisted value degrades to a clean re-fetch', async () => {
    for (const bad of ['{not json', '[1,2]', JSON.stringify({ 'Serra Angel': { url: 5, resolvedAt: 'x' } }),
      JSON.stringify({ 'Serra Angel': { url: 'https://x' }, Other: 'nope' })]) {
      const store = makeStorage({ [KEY]: bad });
      vi.stubGlobal('localStorage', store);
      const fetchMock = vi.fn(async () => jsonRes({ data: [ANGEL] }));
      vi.stubGlobal('fetch', fetchMock);
      const { fetchOldestArt } = await load();

      const res = await fetchOldestArt('Serra Angel');
      expect(res.url).toBe(ANGEL.image_uris.art_crop);
      expect(fetchMock).toHaveBeenCalled();
      const saved = JSON.parse(store.data[KEY]);
      expect(Object.keys(saved)).toEqual(['Serra Angel']);
    }
  });

  it('ART-06: legacy entry without artist reads as artist undefined', async () => {
    vi.stubGlobal('localStorage', makeStorage({
      [KEY]: JSON.stringify({ 'Serra Angel': { url: 'https://x/serra.jpg', resolvedAt: '2026-01-01T00:00:00Z' } }),
    }));
    vi.stubGlobal('fetch', vi.fn());
    const { fetchOldestArt } = await load();

    const res = await fetchOldestArt('Serra Angel');
    expect(res.url).toBe('https://x/serra.jpg');
    expect(res.artist).toBeUndefined();
  });

  it('ART-07: throwing storage falls back to in-memory only', async () => {
    const boom = () => { throw new Error('SecurityError'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    const fetchMock = vi.fn(async () => jsonRes({ data: [ANGEL] }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchOldestArt } = await load();

    expect((await fetchOldestArt('Serra Angel')).url).toBe(ANGEL.image_uris.art_crop);
    expect((await fetchOldestArt('Serra Angel')).url).toBe(ANGEL.image_uris.art_crop);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ART-08: a definitive 404 is persisted as a null-url entry', async () => {
    const store = makeStorage();
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({}, 404)));
    const { fetchOldestArt } = await load();

    expect(await fetchOldestArt('No Such Card')).toEqual({ url: null, artist: null });
    const saved = JSON.parse(store.data[KEY]);
    expect(saved['No Such Card'].url).toBeNull();
    expect(typeof saved['No Such Card'].resolvedAt).toBe('string');
  });

  it('ART-09: a network failure is not persisted', async () => {
    const store = makeStorage();
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { fetchOldestArt } = await load();

    expect(await fetchOldestArt('Serra Angel')).toEqual({ url: null, artist: null });
    expect(store.data[KEY]).toBeUndefined();
  });
});
