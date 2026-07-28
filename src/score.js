/**
 * Result codes — a leaderboard for a game with no server.
 *
 * There is nowhere for scores to meet: the site is static files. So a result
 * travels the way the result already travels — inside the share text a player
 * sends their friends. Paste that text into the leaderboard and it lands.
 *
 * The checksum catches a mangled paste (a truncated message, a stray character
 * from a chat client). It is emphatically not anti-cheat: anyone who can read
 * this file can mint a code claiming a perfect game. For a group of friends
 * that is the right trade — no accounts, no backend, nothing to sign up for.
 *
 * Format:  HDL209.W.1.2.11.AJ.7
 *          |      | | | |  |  └ checksum
 *          |      | | | |  └ name
 *          |      | | | └ guesses
 *          |      | | └ rope notches
 *          |      | └ body parts
 *          |      └ W or L
 *          └ puzzle number
 */
import { WON } from './engine.js';

const PREFIX = 'HDL';
export const NAME_PATTERN = /^[A-Za-z0-9_-]{1,12}$/;

/** Codes must survive being pasted out of a chat app, so keep the charset tight. */
const CODE_PATTERN = /HDL\d+(?:\.[A-Za-z0-9_-]+){6}/;

function checksum(text) {
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum = (sum * 31 + text.charCodeAt(i)) % 1296;
  return sum.toString(36).padStart(2, '0');
}

export function scoreOf(state) {
  return {
    won: state.status === WON,
    body: state.misses,
    rope: state.nears,
    guesses: state.history.length,
  };
}

export function encodeResult({ number, name, score }) {
  const body = [`${PREFIX}${number}`, score.won ? 'W' : 'L', score.body, score.rope, score.guesses, name].join('.');
  return `${body}.${checksum(body)}`;
}

/**
 * Pull a result out of anything — a bare code, or a whole pasted share message.
 * Returns null for junk rather than throwing, since the input is a text box.
 */
export function decodeResult(text) {
  const found = String(text ?? '').match(CODE_PATTERN);
  if (!found) return null;

  const parts = found[0].split('.');
  const sum = parts.pop();
  if (checksum(parts.join('.')) !== sum) return null;

  const [head, outcome, body, rope, guesses, name] = parts;
  const number = Number(head.slice(PREFIX.length));
  const counts = [body, rope, guesses].map(Number);

  if (!Number.isInteger(number) || number < 1) return null;
  if (outcome !== 'W' && outcome !== 'L') return null;
  if (counts.some((n) => !Number.isInteger(n) || n < 0 || n > 999)) return null;
  if (!NAME_PATTERN.test(name)) return null;

  return { number, name, won: outcome === 'W', body: counts[0], rope: counts[1], guesses: counts[2] };
}

/**
 * Survivors first, then the lightest damage, then the fewest guesses. Damage
 * is body plus rope: the two tracks cost differently to fill, but a notch of
 * either is one mistake, and ranking on the sum keeps that honest.
 */
export function rank(entries) {
  return [...entries].sort((a, b) =>
    Number(b.won) - Number(a.won) ||
    (a.body + a.rope) - (b.body + b.rope) ||
    a.guesses - b.guesses ||
    a.name.localeCompare(b.name));
}

/** Per-player totals across every puzzle on the board. */
export function tally(board) {
  const players = new Map();
  for (const day of Object.values(board)) {
    for (const entry of Object.values(day)) {
      const player = players.get(entry.name) ?? { name: entry.name, played: 0, wins: 0, damage: 0 };
      player.played += 1;
      player.wins += entry.won ? 1 : 0;
      player.damage += entry.body + entry.rope;
      players.set(entry.name, player);
    }
  }
  return [...players.values()].sort((a, b) =>
    b.wins - a.wins ||
    a.damage / Math.max(1, a.played) - b.damage / Math.max(1, b.played) ||
    a.name.localeCompare(b.name));
}
