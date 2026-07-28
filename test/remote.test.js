import test from 'node:test';
import assert from 'node:assert/strict';
import { isConfigured, submitScore, fetchScores } from '../src/remote.js';

/**
 * config.js ships empty, so the module under test reports itself unconfigured.
 * These tests cover that path plus the wire behaviour, by standing in a fake
 * fetch and a fake config through the module's own request shape.
 */
const entry = { number: 209, name: 'AJ', won: true, body: 1, rope: 2, guesses: 11 };

test('an unconfigured project is inert, not broken', async () => {
  assert.equal(isConfigured(), false);
  assert.equal(await submitScore(entry), 'offline');
  assert.equal(await fetchScores(), null);
});

test('an unconfigured project never touches the network', async () => {
  const real = globalThis.fetch;
  let called = false;
  globalThis.fetch = () => { called = true; throw new Error('should not be called'); };
  try {
    await submitScore(entry);
    await fetchScores();
    assert.equal(called, false);
  } finally {
    globalThis.fetch = real;
  }
});

// The remaining behaviour is exercised against a stand-in module so the real
// config can stay empty in the repo.
const CONFIG = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

async function withFakeProject(fetchImpl, run) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const source = (await import('node:fs')).readFileSync(new URL('../src/remote.js', import.meta.url), 'utf8')
      .replace("import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';",
               `const SUPABASE_URL = ${JSON.stringify(CONFIG.SUPABASE_URL)};\nconst SUPABASE_ANON_KEY = ${JSON.stringify(CONFIG.SUPABASE_ANON_KEY)};`);
    const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    await run(module);
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('a score posts to the scores table with the anon key', async () => {
  let seen = null;
  await withFakeProject(
    async (url, options) => { seen = { url, options }; return { ok: true, status: 201 }; },
    async (remote) => {
      assert.equal(remote.isConfigured(), true);
      assert.equal(await remote.submitScore(entry), 'saved');
    },
  );
  assert.equal(seen.url, 'https://example.supabase.co/rest/v1/scores');
  assert.equal(seen.options.method, 'POST');
  assert.equal(seen.options.headers.apikey, 'anon-key');
  assert.deepEqual(JSON.parse(seen.options.body), {
    puzzle: 209, name: 'AJ', won: true, body: 1, rope: 2, guesses: 11,
  });
});

test('a repeat submission is reported as a duplicate, not a failure', async () => {
  await withFakeProject(
    async () => ({ ok: false, status: 409 }),
    async (remote) => assert.equal(await remote.submitScore(entry), 'duplicate'),
  );
});

test('a dead network is offline, never an exception', async () => {
  await withFakeProject(
    async () => { throw new TypeError('Failed to fetch'); },
    async (remote) => {
      assert.equal(await remote.submitScore(entry), 'offline');
      assert.equal(await remote.fetchScores(), null);
    },
  );
});

test('rows come back shaped like leaderboard entries', async () => {
  await withFakeProject(
    async () => ({ ok: true, status: 200, json: async () => ([
      { puzzle: '209', name: 'Sam', won: true, body: '0', rope: '1', guesses: '8' },
    ]) }),
    async (remote) => {
      assert.deepEqual(await remote.fetchScores(), [
        { number: 209, name: 'Sam', won: true, body: 0, rope: 1, guesses: 8 },
      ]);
    },
  );
});

test('a garbled response is null rather than a crash', async () => {
  await withFakeProject(
    async () => ({ ok: true, status: 200, json: async () => ({ message: 'nope' }) }),
    async (remote) => assert.equal(await remote.fetchScores(), null),
  );
  await withFakeProject(
    async () => ({ ok: false, status: 500 }),
    async (remote) => assert.equal(await remote.fetchScores(), null),
  );
});
