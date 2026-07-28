import test from 'node:test';
import assert from 'node:assert/strict';
import { wordForDate, puzzleNumber, lengthForDay, localDateKey, EPOCH, WEEK_SHAPE } from '../src/daily.js';
import { WORDS } from '../src/words.js';

test('the same date always gives the same word', () => {
  assert.equal(wordForDate('2026-03-14').word, wordForDate('2026-03-14').word);
});

test('puzzle numbering starts at 1 on the epoch', () => {
  assert.equal(puzzleNumber(EPOCH), 1);
  assert.equal(puzzleNumber('2026-01-02'), 2);
});

test('length ramps across the week and matches the word', () => {
  for (let day = 0; day < 28; day++) {
    const date = new Date(2026, 0, 1 + day);
    const picked = wordForDate(localDateKey(date));
    assert.equal(picked.word.length, picked.length);
    assert.equal(picked.length, lengthForDay(day));
    assert.ok(WEEK_SHAPE.includes(picked.length));
  }
});

test('every daily word comes from the pool for its length', () => {
  for (let day = 0; day < 400; day++) {
    const picked = wordForDate(localDateKey(new Date(2026, 0, 1 + day)));
    assert.ok(WORDS[picked.length].includes(picked.word), `${picked.word} missing from pool`);
  }
});

test('a length cycles its whole pool before repeating a word', () => {
  // 5-letter days are the most frequent, so they cycle first. Walk far enough
  // to cover the pool and check nothing comes around twice.
  const seen = new Set();
  const target = WORDS[5].length;
  let day = 0;
  while (seen.size < target && day < target * 4) {
    const picked = wordForDate(localDateKey(new Date(2026, 0, 1 + day)));
    if (picked.length === 5) {
      assert.ok(!seen.has(picked.word), `${picked.word} repeated before the pool ran out`);
      seen.add(picked.word);
    }
    day++;
  }
  assert.equal(seen.size, target);
});

test('local date keys do not drift across timezones', () => {
  // A late-evening local time must still report today, not tomorrow in UTC.
  assert.equal(localDateKey(new Date(2026, 5, 30, 23, 30)), '2026-06-30');
  assert.equal(localDateKey(new Date(2026, 5, 30, 0, 15)), '2026-06-30');
});
