/**
 * Balance simulator.
 *
 * Plays the game with a competent bot so track lengths can be chosen from
 * evidence instead of intuition. The question it exists to answer: how often
 * does each track actually do the killing? A track that never kills is
 * decoration; a track that always kills makes the other one decoration.
 *
 *   node scripts/simulate.js
 *   node scripts/simulate.js --rope 3 --body 6 --games 300
 *   node scripts/simulate.js --sweep
 *
 * The bot keeps every word still consistent with the feedback so far, then
 * guesses the (letter, slot) pair that the most candidates agree on — i.e. it
 * maximises its chance of a free hit. It calls the word once only one
 * candidate remains. That is a strong-but-not-perfect player: it never wastes
 * a guess on a letter it has ruled out, but it doesn't reason about which
 * guess would eliminate the most candidates either.
 */
import { createGame, guess, solve, PLAYING, WON } from '../src/engine.js';
import { WORDS, LENGTHS } from '../src/words.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

/** Replay the real game's guesses against a candidate; keep it only if every result matches. */
function consistent(candidate, history) {
  const probe = createGame(candidate);
  for (const h of history) {
    if (h.solve) continue;
    if (guess(probe, h.letter, h.index).result !== h.result) return false;
  }
  return true;
}

/** The (letter, slot) pair the most candidates agree on, skipping moves the game would reject. */
function bestMove(game, candidates) {
  let best = null;
  let bestCount = 0;

  for (let slot = 0; slot < game.length; slot++) {
    if (game.slots[slot] !== null) continue;
    const tally = new Map();
    for (const w of candidates) {
      const ch = w[slot];
      if (game.dead.has(ch) || game.excluded[slot].has(ch)) continue;
      const n = (tally.get(ch) ?? 0) + 1;
      tally.set(ch, n);
      if (n > bestCount) {
        bestCount = n;
        best = { letter: ch, slot };
      }
    }
  }
  return best;
}

function playOne(answer, limits) {
  const game = createGame(answer, limits);
  let candidates = WORDS[answer.length];

  for (let turn = 0; turn < 60 && game.status === PLAYING; turn++) {
    candidates = candidates.filter((w) => consistent(w, game.history));
    if (candidates.length === 0) candidates = [answer];   // shouldn't happen; fail safe

    if (candidates.length === 1) {
      solve(game, candidates[0]);
      break;
    }

    const move = bestMove(game, candidates);
    if (!move) break;
    guess(game, move.letter, move.slot);
  }

  return {
    won: game.status === WON,
    misses: game.misses,
    nears: game.nears,
    killedBy: game.status === WON ? null : game.nears >= limits.maxNears ? 'rope' : 'body',
    guesses: game.history.length,
  };
}

function run({ body, rope, games }) {
  const limits = { maxMisses: body, maxNears: rope };
  const results = [];

  for (const length of LENGTHS) {
    const pool = WORDS[length];
    const step = Math.max(1, Math.floor(pool.length / Math.ceil(games / LENGTHS.length)));
    for (let i = 0; i < pool.length; i += step) results.push({ length, ...playOne(pool[i], limits) });
  }

  const wins = results.filter((r) => r.won);
  const losses = results.filter((r) => !r.won);
  const byRope = losses.filter((r) => r.killedBy === 'rope').length;

  return {
    body,
    rope,
    n: results.length,
    winRate: wins.length / results.length,
    ropeShareOfDeaths: losses.length ? byRope / losses.length : 0,
    avgNears: results.reduce((a, r) => a + r.nears, 0) / results.length,
    avgMisses: results.reduce((a, r) => a + r.misses, 0) / results.length,
    perLength: LENGTHS.map((l) => {
      const set = results.filter((r) => r.length === l);
      return { l, winRate: set.filter((r) => r.won).length / set.length };
    }),
  };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;

function report(r) {
  const lens = r.perLength.map((p) => `${p.l}:${pct(p.winRate)}`).join('  ');
  console.log(
    `body ${r.body}  rope ${r.rope}  |  win ${pct(r.winRate).padStart(4)}  ` +
    `| rope caused ${pct(r.ropeShareOfDeaths).padStart(4)} of deaths  ` +
    `| avg nears ${r.avgNears.toFixed(1)}  misses ${r.avgMisses.toFixed(1)}  | by length  ${lens}`,
  );
}

const games = arg('games', 240);

if (process.argv.includes('--sweep')) {
  console.log(`Sweeping rope length, body fixed at 6, ~${games} games each.\n`);
  for (const rope of [2, 3, 4, 5, 6, 8]) report(run({ body: 6, rope, games }));
} else {
  report(run({ body: arg('body', 6), rope: arg('rope', 6), games }));
}
