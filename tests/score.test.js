/**
 * score.test.js — checks the GUESS IT! stars and the 🏆 best score.
 *
 * A right answer adds a star, a wrong one sends the stars back to 0, and
 * the best score for each game is saved so it's still there next time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAfter, loadBest, saveBest } from '../js/music.js';

/**
 * A pretend localStorage that keeps things in a Map.
 * @returns {{getItem: Function, setItem: Function, items: Map}} the fake storage
 */
function fakeStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

/** A storage that refuses everything, like Safari with site data blocked. */
const brokenStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

test('a right answer adds a star', () => {
  assert.deepEqual(scoreAfter({ score: 2, best: 5 }, true), { score: 3, best: 5, isNewBest: false });
});

test('a wrong answer sends the stars back to 0 but keeps the best', () => {
  assert.deepEqual(scoreAfter({ score: 4, best: 5 }, false), { score: 0, best: 5, isNewBest: false });
});

test('beating the best makes a new best', () => {
  assert.deepEqual(scoreAfter({ score: 5, best: 5 }, true), { score: 6, best: 6, isNewBest: true });
});

test('the very first star is a new best', () => {
  assert.deepEqual(scoreAfter({ score: 0, best: 0 }, true), { score: 1, best: 1, isNewBest: true });
});

test('a saved best comes back, and each game has its own', () => {
  const storage = fakeStorage();
  saveBest('note', 7, storage);
  saveBest('chord', 3, storage);
  assert.equal(loadBest('note', storage), 7);
  assert.equal(loadBest('chord', storage), 3);
});

test('no saved best yet means 0', () => {
  assert.equal(loadBest('note', fakeStorage()), 0);
});

test('a junk saved value means 0', () => {
  const storage = fakeStorage();
  storage.setItem('calebhamsa.best.note', 'banana');
  assert.equal(loadBest('note', storage), 0);
});

test('blocked storage does not crash the game', () => {
  assert.equal(loadBest('note', brokenStorage), 0);
  assert.doesNotThrow(() => saveBest('note', 4, brokenStorage));
});
