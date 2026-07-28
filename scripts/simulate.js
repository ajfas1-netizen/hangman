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

/**
 * Replay the real game's guesses against a candidate; keep it only if every
 * result matches.
 *
 * The probe gets unlimited tracks. With real limits it can hit a track partway
 * through the replay, after which every further guess is rejected as 'over' and
 * the candidate is discarded for the wrong reason — which silently skews the
 * measurements this whole script exists to produce.
 */
const NO_LIMITS = { maxMisses: Infinity, maxNears: Infinity };

function consistent(candidate, history) {
  const probe = createGame(candidate, NO_LIMITS);
  for (const h of history) {
    if (h.solve) continue;
    if (guess(probe, h.letter, h.index).result !== h.result) return false;
  }
  return true;
}

/**
 * A human-shaped player, for difficulty estimates the candidate bot can't give.
 *
 * Real people do not hold eight hundred still-possible words in their head.
 * They remember which letters are dead, which are known to be in there, and
 * roughly which letters like which positions — and they recognise the word once
 * enough of it is showing. That is what this models: positional letter
 * frequency, a bias toward letters already known to be present, and a call the
 * moment the visible pattern admits only one word.
 *
 * It is a model, not a measurement of real players. Treat its win rate as a
 * floor the way the candidate bot's is a ceiling; the truth sits between them.
 */
const freqCache = new Map();

function positionalFrequency(length) {
  if (!freqCache.has(length)) {
    const table = Array.from({ length }, () => new Map());
    for (const word of WORDS[length]) {
      for (let i = 0; i < length; i++) table[i].set(word[i], (table[i].get(word[i]) ?? 0) + 1);
    }
    freqCache.set(length, table);
  }
  return freqCache.get(length);
}

/** The one word still matching what is visible on the board, if there is exactly one. */
function readableWord(game) {
  let found = null;
  for (const word of WORDS[game.length]) {
    let ok = true;
    for (let i = 0; i < game.length && ok; i++) {
      if (game.slots[i] !== null) ok = word[i] === game.slots[i];
      else if (game.dead.has(word[i]) || game.excluded[i].has(word[i])) ok = false;
    }
    if (!ok) continue;
    if (found) return null;
    found = word;
  }
  return found;
}

function humanMove(game) {
  const table = positionalFrequency(game.length);
  let best = null;
  let bestScore = -1;

  for (let slot = 0; slot < game.length; slot++) {
    if (game.slots[slot] !== null) continue;
    for (const [letter, count] of table[slot]) {
      if (game.dead.has(letter) || game.excluded[slot].has(letter)) continue;
      // Chase a letter you already know is in there before trying a fresh one.
      const score = count * (game.live.has(letter) ? 2.5 : 1);
      if (score > bestScore) {
        bestScore = score;
        best = { letter, slot };
      }
    }
  }
  return best;
}

function playHuman(answer, limits) {
  const game = createGame(answer, limits);

  for (let turn = 0; turn < 60 && game.status === PLAYING; turn++) {
    const seen = readableWord(game);
    if (seen) {
      solve(game, seen);
      break;
    }
    const move = humanMove(game);
    if (!move) break;
    guess(game, move.letter, move.slot);
  }
  return game;
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

function playOne(answer, limits, human) {
  if (human) {
    const g = playHuman(answer, limits);
    return {
      won: g.status === WON,
      misses: g.misses,
      nears: g.nears,
      killedBy: g.status === WON ? null : g.nears >= limits.maxNears ? 'rope' : 'body',
      guesses: g.history.length,
    };
  }

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

function run({ body, rope, games, human }) {
  const limits = { maxMisses: body, maxNears: rope };
  const results = [];

  for (const length of LENGTHS) {
    const pool = WORDS[length];
    const step = Math.max(1, Math.floor(pool.length / Math.ceil(games / LENGTHS.length)));
    for (let i = 0; i < pool.length; i += step) results.push({ length, ...playOne(pool[i], limits, human) });
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
const human = process.argv.includes('--human');

if (process.argv.includes('--compare')) {
  console.log(`Candidate bot (ceiling) vs human model (floor), ~${games} games each.\n`);
  for (const [body, rope] of [[6, 6], [6, 5], [6, 4], [5, 4]]) {
    const bot = run({ body, rope, games });
    const man = run({ body, rope, games, human: true });
    console.log(
      `body ${body} rope ${rope}  |  bot ${pct(bot.winRate).padStart(4)} (rope ${pct(bot.ropeShareOfDeaths).padStart(4)} of deaths)` +
      `  |  human ${pct(man.winRate).padStart(4)} (rope ${pct(man.ropeShareOfDeaths).padStart(4)} of deaths)`,
    );
  }
} else if (process.argv.includes('--sweep')) {
  console.log(`Sweeping rope length, body fixed at 6, ~${games} games each.\n`);
  for (const rope of [2, 3, 4, 5, 6, 8]) report(run({ body: 6, rope, games, human }));
} else if (process.argv.includes('--grid')) {
  // Balance means neither track dominates the deaths. Because near misses
  // accrue more slowly than outright misses, that balance point is not at
  // equal lengths — it has to be found by measuring both together.
  console.log(`Grid over both tracks, ~${games} games each.`);
  console.log('Looking for rope-share-of-deaths near 50% at a difficulty that leaves humans room.\n');
  const rows = [];
  for (const body of [4, 5, 6, 7]) {
    for (const rope of [3, 4, 5, 6]) {
      const r = run({ body, rope, games, human });
      rows.push(r);
      report(r);
    }
    console.log('');
  }
  const balanced = rows
    .map((r) => ({ ...r, skew: Math.abs(r.ropeShareOfDeaths - 0.5) }))
    .sort((a, b) => a.skew - b.skew)
    .slice(0, 6);
  console.log('Closest to an even split between the two tracks:');
  for (const r of balanced) {
    console.log(`  body ${r.body} rope ${r.rope}  rope share ${pct(r.ropeShareOfDeaths)}  win ${pct(r.winRate)}`);
  }
} else {
  report(run({ body: arg("body", 6), rope: arg("rope", 6), games, human }));
}
