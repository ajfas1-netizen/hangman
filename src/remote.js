/**
 * Supabase-backed leaderboard, over the PostgREST endpoint. No SDK — it's four
 * fields and two requests, and a dependency would be more code than this file.
 *
 * Every function degrades to a null/'offline' result rather than throwing. The
 * leaderboard is a side dish: a flaky network, a paused project or an empty
 * config must never stop anyone playing the game.
 *
 * What the anon key can do is decided by the policies in supabase/setup.sql,
 * not here. It can insert one score per name per puzzle and read scores back.
 * That still isn't anti-cheat — anyone can post a perfect score under any name.
 * It removes the paste step, which is the point; it doesn't make the numbers
 * trustworthy against someone determined to fake them.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Prefixed so it cannot collide with a `scores` table already in the project.
const TABLE = 'hangdle_scores';
const COLUMNS = 'puzzle,name,won,body,rope,guesses';

/**
 * Why the last call failed, in a form worth showing a human. Kept here because
 * the leaderboard is configured by editing a file and deploying — there is no
 * console to read when it goes wrong, so the page has to say what happened.
 */
let failure = null;

export function lastError() {
  return failure;
}

function describe(status) {
  if (status === 401 || status === 403) return 'key rejected';
  if (status === 404) return 'table not found';
  if (status === 400) return 'request rejected';
  return `HTTP ${status}`;
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function endpoint(path) {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Post one result.
 *
 * @returns 'saved' | 'duplicate' | 'offline'
 *   'duplicate' is the unique constraint doing its job: your first result for a
 *   puzzle is the one that stands, so replaying can't improve your score.
 */
export async function submitScore(entry) {
  if (!isConfigured()) return 'offline';

  try {
    const response = await fetch(endpoint(TABLE), {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        puzzle: entry.number,
        name: entry.name,
        won: entry.won,
        body: entry.body,
        rope: entry.rope,
        guesses: entry.guesses,
      }),
    });

    if (response.status === 409) { failure = null; return 'duplicate'; }
    if (!response.ok) { failure = describe(response.status); return 'offline'; }
    failure = null;
    return 'saved';
  } catch {
    failure = 'no connection';
    return 'offline';
  }
}

/**
 * Read the shared board.
 *
 * @returns an array of entries, or null when unavailable — null means "no
 *          answer", which the caller shows differently from an empty board.
 */
export async function fetchScores({ limit = 500 } = {}) {
  if (!isConfigured()) return null;

  try {
    const query = `${TABLE}?select=${COLUMNS}&order=puzzle.desc&limit=${limit}`;
    const response = await fetch(endpoint(query), { headers: headers() });
    if (!response.ok) { failure = describe(response.status); return null; }

    const rows = await response.json();
    if (!Array.isArray(rows)) { failure = 'unexpected response'; return null; }

    failure = null;
    return rows.map((row) => ({
      number: Number(row.puzzle),
      name: String(row.name),
      won: Boolean(row.won),
      body: Number(row.body),
      rope: Number(row.rope),
      guesses: Number(row.guesses),
    }));
  } catch {
    failure = 'no connection';
    return null;
  }
}
