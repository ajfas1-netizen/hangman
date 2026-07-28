import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, guess } from '../src/engine.js';
import { readRaw, writeRaw, loadDaily, saveDaily, loadStats, recordResult } from '../src/storage.js';

/**
 * In a sandboxed iframe or with third-party storage blocked, reading the
 * `localStorage` property itself throws — not just the method call on it. An
 * unguarded access anywhere kills the whole module, and the page renders
 * nothing at all. This shipped once; it must not ship again.
 */
function withHostileStorage(run) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: access denied'); },
  });
  try {
    run();
  } finally {
    delete globalThis.localStorage;
  }
}

test('storage helpers survive localStorage throwing on access', () => {
  withHostileStorage(() => {
    assert.equal(readRaw('hangdle:seen'), null);
    assert.equal(writeRaw('hangdle:seen', '1'), false);
  });
});

test('the whole persistence layer degrades quietly', () => {
  withHostileStorage(() => {
    const game = createGame('spoon');
    guess(game, 's', 0);

    assert.doesNotThrow(() => saveDaily(7, game));
    assert.equal(loadDaily(7), null);
    assert.doesNotThrow(() => recordResult(7, game));
    assert.deepEqual(loadStats().played, 0);
  });
});

test('storage works normally when localStorage behaves', () => {
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  });
  try {
    assert.equal(writeRaw('k', 'v'), true);
    assert.equal(readRaw('k'), 'v');

    const game = createGame('spoon');
    guess(game, 's', 0);
    saveDaily(12, game);

    const back = loadDaily(12);
    assert.equal(back.word, 'spoon');
    assert.deepEqual(back.slots, ['s', null, null, null, null]);
    assert.equal(loadDaily(13), null, 'a different puzzle number must not restore');
  } finally {
    delete globalThis.localStorage;
  }
});
