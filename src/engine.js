/**
 * Cinch — game engine.
 *
 * A guess is a (letter, slot) pair. Three outcomes:
 *
 *   HIT  — the letter is at that slot. It locks in. Free.
 *   NEAR — the letter is in the word, but not at that slot. Tightens the rope.
 *   MISS — the letter is not (or is no longer) in the word. Draws a body part.
 *
 * Two independent tracks kill you: MAX_MISSES body parts, or MAX_NEARS rope
 * notches. Either one filling ends the game.
 *
 * The "no counting" rule: revealing a letter at one slot tells you nothing
 * about how many more of it exist. That has one important consequence for how
 * NEAR is defined. A NEAR means "this letter sits at some slot you have not
 * revealed yet" — not merely "this letter appears somewhere in the word." If
 * every P in PUPPY is already placed and you guess P again elsewhere, that is
 * a MISS, not a NEAR.
 *
 * Defining it the other way would be worse in both directions: calling it NEAR
 * would send the player hunting for a P that isn't findable, and rejecting the
 * guess for free would announce the P count outright — exactly the information
 * the no-counting rule exists to withhold. A MISS is honest and it costs the
 * same as any other dead end.
 */

export const MAX_MISSES = 6;

/**
 * Five, not six. Near misses accrue more slowly than outright misses, so equal
 * track lengths are not equal pressure.
 *
 * Simulating every word in the pools (scripts/simulate.js --compare) against
 * both a perfect-recall bot and a human-shaped model:
 *
 *              bot win / rope's share    human win / rope's share
 *   6 / 6         93%  /  14%               39%  /  22%
 *   6 / 5         90%  /  43%               33%  /  32%
 *   6 / 4         81%  /  70%               27%  /  46%
 *
 * Real players sit between those columns, so five is the length that keeps the
 * rope responsible for roughly a third to a half of deaths under either model.
 * Six makes it decoration for a strong player; four makes it dominant for one,
 * balanced for a weak one, and pushes the win rate toward a coin flip.
 */
export const MAX_NEARS = 5;
export const SOLVE_PENALTY = 2;

export const HIT = 'hit';
export const NEAR = 'near';
export const MISS = 'miss';
export const REJECTED = 'rejected';

export const PLAYING = 'playing';
export const WON = 'won';
export const LOST = 'lost';

/** Body parts drawn, in order, as misses accumulate. */
export const BODY_PARTS = ['head', 'torso', 'armLeft', 'armRight', 'legLeft', 'legRight'];

const LETTER = /^[a-z]$/;

/**
 * @param word    the answer
 * @param limits  optional overrides — the two track lengths and the cost of a
 *                wrong call. Carried on the game rather than read from the
 *                module constants so balance can be tuned and simulated
 *                without touching the rules.
 */
export function createGame(word, limits = {}) {
  const answer = String(word).toLowerCase();
  if (!/^[a-z]+$/.test(answer)) throw new Error(`invalid word: ${word}`);

  return {
    word: answer,
    length: answer.length,
    limits: {
      maxMisses: limits.maxMisses ?? MAX_MISSES,
      maxNears: limits.maxNears ?? MAX_NEARS,
      solvePenalty: limits.solvePenalty ?? SOLVE_PENALTY,
    },
    slots: Array(answer.length).fill(null),
    misses: 0,
    nears: 0,
    /** Letters proven to have no unrevealed occurrences left. Permanent. */
    dead: new Set(),
    /** Letters a NEAR has confirmed as present-and-unplaced at some point. */
    live: new Set(),
    /** Letters the player has landed at least once. */
    placed: new Set(),
    /** Per-slot eliminations: excluded[i] holds letters ruled out for slot i. */
    excluded: Array.from({ length: answer.length }, () => new Set()),
    history: [],
    solveAttempts: 0,
    status: PLAYING,
  };
}

/** True when the letter still sits at a slot the player has not revealed. */
function hasUnrevealedOccurrence(state, letter) {
  for (let i = 0; i < state.length; i++) {
    if (state.word[i] === letter && state.slots[i] === null) return true;
  }
  return false;
}

function reject(reason) {
  return { result: REJECTED, reason };
}

/**
 * Play a (letter, slot) pair.
 *
 * Rejections are free and cost nothing — they only fire on moves the player
 * already had enough information to know were pointless, so refusing them
 * leaks nothing and saves them from misclicks.
 *
 * @returns {{result: string, reason?: string, letter?: string, index?: number}}
 */
export function guess(state, letter, index) {
  if (state.status !== PLAYING) return reject('over');

  const ch = String(letter).toLowerCase();
  if (!LETTER.test(ch)) return reject('bad-letter');
  if (!Number.isInteger(index) || index < 0 || index >= state.length) return reject('bad-slot');
  if (state.slots[index] !== null) return reject('filled');
  if (state.dead.has(ch)) return reject('known-dead');
  if (state.excluded[index].has(ch)) return reject('known-excluded');

  let result;
  if (state.word[index] === ch) {
    result = HIT;
    state.slots[index] = ch;
    state.placed.add(ch);
  } else if (hasUnrevealedOccurrence(state, ch)) {
    result = NEAR;
    state.nears += 1;
    state.live.add(ch);
    state.excluded[index].add(ch);
  } else {
    result = MISS;
    state.misses += 1;
    state.dead.add(ch);
    state.excluded[index].add(ch);
  }

  state.history.push({ letter: ch, index, result });
  settle(state);
  return { result, letter: ch, index };
}

/**
 * Call the whole word. Right wins outright; wrong costs SOLVE_PENALTY body
 * parts and reveals nothing.
 *
 * @returns {{result: string, reason?: string}}
 */
export function solve(state, attempt) {
  if (state.status !== PLAYING) return reject('over');

  const word = String(attempt).toLowerCase().trim();
  if (word.length !== state.length || !/^[a-z]+$/.test(word)) return reject('bad-word');

  state.solveAttempts += 1;

  if (word === state.word) {
    for (let i = 0; i < state.length; i++) {
      state.slots[i] = state.word[i];
      state.placed.add(state.word[i]);
    }
    state.history.push({ solve: true, correct: true });
    state.status = WON;
    return { result: 'solved' };
  }

  state.misses += state.limits.solvePenalty;
  state.history.push({ solve: true, correct: false });
  settle(state);
  return { result: 'wrong-solve' };
}

function settle(state) {
  if (state.status !== PLAYING) return;
  if (state.misses >= state.limits.maxMisses || state.nears >= state.limits.maxNears) {
    state.status = LOST;
  } else if (state.slots.every((s) => s !== null)) {
    state.status = WON;
  }
}

/** Give up — reveals the word and ends the game as a loss. */
export function forfeit(state) {
  if (state.status !== PLAYING) return;
  state.status = LOST;
}

/**
 * How a letter should read on the keyboard. Precedence matters: `dead` is the
 * most actionable state, so it wins over a stale `live` flag from an earlier
 * NEAR. A letter can legitimately be both placed and dead — every one of them
 * is on the board.
 */
export function letterState(state, letter) {
  const ch = letter.toLowerCase();
  if (state.dead.has(ch)) return 'dead';
  if (state.live.has(ch)) return 'live';
  if (state.placed.has(ch)) return 'placed';
  return 'unknown';
}

/** Letters ruled out for a given slot, sorted, for the deduction strip. */
export function excludedAt(state, index) {
  return [...state.excluded[index]].sort();
}

export function lifeRemaining(state) {
  return {
    misses: Math.max(0, state.limits.maxMisses - state.misses),
    nears: Math.max(0, state.limits.maxNears - state.nears),
  };
}
