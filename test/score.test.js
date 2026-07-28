import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, guess, solve } from '../src/engine.js';
import { scoreOf, encodeResult, decodeResult, rank, tally, NAME_PATTERN } from '../src/score.js';

const sample = { number: 209, name: 'AJ', score: { won: true, body: 1, rope: 2, guesses: 11 } };

test('a code round-trips', () => {
  const decoded = decodeResult(encodeResult(sample));
  assert.deepEqual(decoded, { number: 209, name: 'AJ', won: true, body: 1, rope: 2, guesses: 11 });
});

test('a code is found inside a whole pasted share message', () => {
  const message = [
    'Hangdle #209 · 5 letters · survived',
    'body 1/6 · rope 2/5',
    '',
    '🟩🟨⬛⭐',
    '',
    encodeResult(sample),
    '',
    'https://example.com/hangman/',
  ].join('\n');
  assert.equal(decodeResult(message).name, 'AJ');
});

test('a mangled code is rejected rather than half-read', () => {
  const code = encodeResult(sample);
  assert.equal(decodeResult(code.replace('.1.', '.0.')), null, 'edited score must fail the checksum');
  assert.equal(decodeResult(code.slice(0, -1)), null, 'truncated code must fail');
  assert.equal(decodeResult('no code here at all'), null);
  assert.equal(decodeResult(''), null);
  assert.equal(decodeResult(null), null);
});

test('a losing result encodes as a loss', () => {
  const g = createGame('spoon');
  solve(g, 'stone'); solve(g, 'store'); solve(g, 'stole');
  const score = scoreOf(g);
  assert.equal(score.won, false);
  assert.equal(decodeResult(encodeResult({ number: 3, name: 'sam', score })).won, false);
});

test('score reflects the real game', () => {
  const g = createGame('spoon');   // s p o o n
  guess(g, 's', 0);   // hit
  guess(g, 'n', 1);   // near — slot 1 is still empty, so this actually counts
  guess(g, 'z', 2);   // miss
  assert.deepEqual(scoreOf(g), { won: false, body: 1, rope: 1, guesses: 3 });
});

test('names are constrained so codes survive a chat client', () => {
  assert.ok(NAME_PATTERN.test('AJ'));
  assert.ok(NAME_PATTERN.test('rose-99'));
  assert.ok(!NAME_PATTERN.test('has space'));
  assert.ok(!NAME_PATTERN.test('way-too-long-name'));
  assert.ok(!NAME_PATTERN.test(''));
  assert.equal(decodeResult('HDL1.W.0.0.5.bad name.zz'), null);
});

test('ranking puts survivors first, then least damage, then fewest guesses', () => {
  const order = rank([
    { name: 'd', won: false, body: 6, rope: 1, guesses: 8 },
    { name: 'c', won: true, body: 2, rope: 2, guesses: 9 },
    { name: 'a', won: true, body: 1, rope: 1, guesses: 12 },
    { name: 'b', won: true, body: 1, rope: 1, guesses: 7 },
  ]).map((e) => e.name);
  assert.deepEqual(order, ['b', 'a', 'c', 'd']);
});

test('all-time tally ranks by wins, then average damage', () => {
  const board = {
    209: { a: { number: 209, name: 'a', won: true, body: 1, rope: 0, guesses: 6 },
           b: { number: 209, name: 'b', won: true, body: 4, rope: 2, guesses: 9 } },
    210: { a: { number: 210, name: 'a', won: true, body: 0, rope: 1, guesses: 7 },
           b: { number: 210, name: 'b', won: false, body: 6, rope: 0, guesses: 8 } },
  };
  const totals = tally(board);
  assert.deepEqual(totals.map((p) => p.name), ['a', 'b']);
  assert.equal(totals[0].wins, 2);
  assert.equal(totals[1].played, 2);
});
