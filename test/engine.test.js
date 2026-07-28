import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, guess, solve, forfeit, letterState, excludedAt, lifeRemaining,
  HIT, NEAR, MISS, REJECTED, PLAYING, WON, LOST, MAX_MISSES, MAX_NEARS, SOLVE_PENALTY,
} from '../src/engine.js';

test('a letter at the named slot is a hit and costs nothing', () => {
  const g = createGame('spoon');
  assert.equal(guess(g, 's', 0).result, HIT);
  assert.equal(g.slots[0], 's');
  assert.equal(g.misses, 0);
  assert.equal(g.nears, 0);
});

test('a letter elsewhere in the word is a near and tightens the rope', () => {
  const g = createGame('spoon');
  assert.equal(guess(g, 'n', 0).result, NEAR);
  assert.equal(g.nears, 1);
  assert.equal(g.misses, 0);
  assert.deepEqual(g.slots, [null, null, null, null, null]);
});

test('a letter not in the word is a miss and draws a body part', () => {
  const g = createGame('spoon');
  assert.equal(guess(g, 'z', 0).result, MISS);
  assert.equal(g.misses, 1);
  assert.equal(g.nears, 0);
  assert.ok(g.dead.has('z'));
});

test('the two tracks are independent', () => {
  const g = createGame('spoon');
  guess(g, 'z', 0);
  guess(g, 'n', 0);
  assert.deepEqual(lifeRemaining(g), { misses: MAX_MISSES - 1, nears: MAX_NEARS - 1 });
});

// The no-counting rule is the heart of the game, so it gets the most tests.

test('hitting a letter says nothing about its other occurrences', () => {
  const g = createGame('spoon'); // o at slots 2 and 3
  assert.equal(guess(g, 'o', 2).result, HIT);
  assert.equal(letterState(g, 'o'), 'placed');
  // The second o is still findable, and is still worth a near from a wrong slot.
  assert.equal(guess(g, 'o', 4).result, NEAR);
  assert.equal(guess(g, 'o', 3).result, HIT);
});

test('once every occurrence is placed, the letter is a miss elsewhere', () => {
  const g = createGame('puppy'); // p at 0, 2, 3
  guess(g, 'p', 0);
  guess(g, 'p', 2);
  guess(g, 'p', 3);
  assert.equal(g.misses, 0);
  assert.equal(g.nears, 0);
  // No unrevealed p remains, so this is an honest dead end, not a near.
  assert.equal(guess(g, 'p', 1).result, MISS);
  assert.equal(g.misses, 1);
  assert.equal(letterState(g, 'p'), 'dead');
});

test('a near on one slot does not reveal which slot holds the letter', () => {
  const g = createGame('speed');
  guess(g, 'e', 0);
  assert.deepEqual(excludedAt(g, 0), ['e']);
  assert.deepEqual(excludedAt(g, 2), []);
  assert.deepEqual(excludedAt(g, 3), []);
});

test('a letter with one placed and one loose occurrence still nears', () => {
  const g = createGame('speed'); // e at 2 and 3
  assert.equal(guess(g, 'e', 2).result, HIT);
  assert.equal(guess(g, 'e', 4).result, NEAR);
  assert.equal(g.nears, 1);
});

test('rejections are free and change nothing', () => {
  const g = createGame('spoon');
  guess(g, 'z', 0);           // z now globally dead
  guess(g, 's', 0);           // slot 0 now filled
  const before = { misses: g.misses, nears: g.nears, history: g.history.length };

  assert.equal(guess(g, 'z', 1).reason, 'known-dead');
  assert.equal(guess(g, 'a', 0).reason, 'filled');
  assert.equal(guess(g, '1', 1).reason, 'bad-letter');
  assert.equal(guess(g, 'a', 99).reason, 'bad-slot');

  assert.equal(g.misses, before.misses);
  assert.equal(g.nears, before.nears);
  assert.equal(g.history.length, before.history);
});

test('a slot refuses a letter already ruled out for it', () => {
  const g = createGame('spoon');
  assert.equal(guess(g, 'n', 0).result, NEAR);
  const r = guess(g, 'n', 0);
  assert.equal(r.result, REJECTED);
  assert.equal(r.reason, 'known-excluded');
  assert.equal(g.nears, 1);
});

test('filling every slot wins', () => {
  const g = createGame('spoon');
  [...'spoon'].forEach((ch, i) => guess(g, ch, i));
  assert.equal(g.status, WON);
});

test('six misses hangs you', () => {
  const g = createGame('spoon');
  [...'zqxjkv'].forEach((ch, i) => guess(g, ch, i % 5));
  assert.equal(g.misses, MAX_MISSES);
  assert.equal(g.status, LOST);
});

test('six nears hangs you just as dead', () => {
  const g = createGame('speed'); // s p e e d
  // Six nears without ever landing a letter.
  const nears = [['e', 0], ['e', 1], ['d', 0], ['s', 1], ['p', 0], ['e', 4]];
  for (const [ch, i] of nears) assert.equal(guess(g, ch, i).result, NEAR);
  assert.equal(g.nears, MAX_NEARS);
  assert.equal(g.status, LOST);
  assert.equal(g.misses, 0);
});

test('a correct call wins outright and fills the board', () => {
  const g = createGame('spoon');
  assert.equal(solve(g, 'SPOON').result, 'solved');
  assert.equal(g.status, WON);
  assert.deepEqual(g.slots, [...'spoon']);
});

test('a wrong call costs two body parts and reveals nothing', () => {
  const g = createGame('spoon');
  assert.equal(solve(g, 'stone').result, 'wrong-solve');
  assert.equal(g.misses, SOLVE_PENALTY);
  assert.equal(g.dead.size, 0);
  assert.deepEqual(g.slots, [null, null, null, null, null]);
  assert.equal(g.status, PLAYING);
});

test('a wrong call of the wrong length is rejected for free', () => {
  const g = createGame('spoon');
  assert.equal(solve(g, 'stones').reason, 'bad-word');
  assert.equal(g.misses, 0);
});

test('wrong calls can finish you off', () => {
  const g = createGame('spoon');
  solve(g, 'stone');
  solve(g, 'store');
  solve(g, 'stole');
  assert.equal(g.status, LOST);
});

test('a finished game accepts nothing further', () => {
  const g = createGame('spoon');
  forfeit(g);
  assert.equal(g.status, LOST);
  assert.equal(guess(g, 's', 0).reason, 'over');
  assert.equal(solve(g, 'spoon').reason, 'over');
});

test('letter states rank dead above a stale near', () => {
  const g = createGame('puppy');
  guess(g, 'p', 1);              // near — p is in the word somewhere
  assert.equal(letterState(g, 'p'), 'live');
  guess(g, 'p', 0);
  guess(g, 'p', 2);
  guess(g, 'p', 3);              // all three p's placed
  guess(g, 'p', 4);              // proves no p remains
  assert.equal(letterState(g, 'p'), 'dead');
});

test('case and whitespace are forgiven', () => {
  const g = createGame('SPOON');
  assert.equal(g.word, 'spoon');
  assert.equal(guess(g, 'S', 0).result, HIT);
  assert.equal(solve(g, '  SpOoN  ').result, 'solved');
});
