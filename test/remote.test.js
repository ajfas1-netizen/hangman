import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';

const entry = { number: 209, name: 'AJ', won: true, body: 1, rope: 2, guesses: 11 };

/**
 * Load remote.js with substituted config, so behaviour can be tested at both
 * settings regardless of what the repo currently ships. Testing against the
 * real config would make these tests pass or fail depending on whether a
 * project happens to be connected.
 */
async function loadRemote({ url, key }, fetchImpl) {
  const realFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;

  const source = readFileSync(new URL('../src/remote.js', import.meta.url), 'utf8')
    .replace(
      "import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';",
      `const SUPABASE_URL = ${JSON.stringify(url)};\nconst SUPABASE_ANON_KEY = ${JSON.stringify(key)};`,
    );

  const module = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return { module, restore: () => { globalThis.fetch = realFetch; } };
}

const EMPTY = { url: '', key: '' };
const FAKE = { url: 'https://example.supabase.co', key: 'anon-key' };

test('an unconfigured project is inert, not broken', async () => {
  const { module, restore } = await loadRemote(EMPTY);
  try {
    assert.equal(module.isConfigured(), false);
    assert.equal(await module.submitScore(entry), 'offline');
    assert.equal(await module.fetchScores(), null);
  } finally {
    restore();
  }
});

test('an unconfigured project never touches the network', async () => {
  let called = false;
  const { module, restore } = await loadRemote(EMPTY, () => {
    called = true;
    throw new Error('should not be called');
  });
  try {
    await module.submitScore(entry);
    await module.fetchScores();
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test('a score posts to the hangdle table with the key', async () => {
  let seen = null;
  const { module, restore } = await loadRemote(FAKE, async (url, options) => {
    seen = { url, options };
    return { ok: true, status: 201 };
  });
  try {
    assert.equal(module.isConfigured(), true);
    assert.equal(await module.submitScore(entry), 'saved');
  } finally {
    restore();
  }
  assert.equal(seen.url, 'https://example.supabase.co/rest/v1/hangdle_scores');
  assert.equal(seen.options.method, 'POST');
  assert.equal(seen.options.headers.apikey, 'anon-key');
  assert.deepEqual(JSON.parse(seen.options.body), {
    puzzle: 209, name: 'AJ', won: true, body: 1, rope: 2, guesses: 11,
  });
});

test('a repeat submission is reported as a duplicate, not a failure', async () => {
  const { module, restore } = await loadRemote(FAKE, async () => ({ ok: false, status: 409 }));
  try {
    assert.equal(await module.submitScore(entry), 'duplicate');
    assert.equal(module.lastError(), null, 'a duplicate is not an error worth showing');
  } finally {
    restore();
  }
});

test('a dead network is offline, never an exception', async () => {
  const { module, restore } = await loadRemote(FAKE, async () => { throw new TypeError('Failed to fetch'); });
  try {
    assert.equal(await module.submitScore(entry), 'offline');
    assert.equal(await module.fetchScores(), null);
    assert.equal(module.lastError(), 'no connection');
  } finally {
    restore();
  }
});

test('rows come back shaped like leaderboard entries', async () => {
  const { module, restore } = await loadRemote(FAKE, async () => ({
    ok: true,
    status: 200,
    json: async () => ([{ puzzle: '209', name: 'Sam', won: true, body: '0', rope: '1', guesses: '8' }]),
  }));
  try {
    assert.deepEqual(await module.fetchScores(), [
      { number: 209, name: 'Sam', won: true, body: 0, rope: 1, guesses: 8 },
    ]);
    assert.equal(module.lastError(), null);
  } finally {
    restore();
  }
});

test('failures name themselves so the page can say what broke', async () => {
  const cases = [
    [401, 'key rejected'],
    [403, 'key rejected'],
    [404, 'table not found'],
    [400, 'request rejected'],
    [500, 'HTTP 500'],
  ];
  for (const [status, expected] of cases) {
    const { module, restore } = await loadRemote(FAKE, async () => ({ ok: false, status }));
    try {
      assert.equal(await module.fetchScores(), null);
      assert.equal(module.lastError(), expected, `status ${status}`);
    } finally {
      restore();
    }
  }
});

test('a garbled response is null rather than a crash', async () => {
  const { module, restore } = await loadRemote(FAKE, async () => ({
    ok: true, status: 200, json: async () => ({ message: 'nope' }),
  }));
  try {
    assert.equal(await module.fetchScores(), null);
    assert.equal(module.lastError(), 'unexpected response');
  } finally {
    restore();
  }
});

/**
 * The committed key is public by design, but only the anon role is safe to
 * publish: service_role ignores every row-level security policy, so shipping
 * one would hand the whole database to anyone who views source.
 */
test('any committed key is an anon key for the configured project', () => {
  if (!SUPABASE_ANON_KEY) return;   // unconfigured checkout, nothing to check

  assert.ok(SUPABASE_URL, 'a key without a URL is a half-configured project');

  const parts = SUPABASE_ANON_KEY.split('.');
  if (parts.length !== 3) return;   // new-style sb_publishable_ key, not a JWT

  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(claims.role, 'anon', 'never commit a service_role key');
  assert.ok(SUPABASE_URL.includes(claims.ref), 'key belongs to a different project than the URL');
});
