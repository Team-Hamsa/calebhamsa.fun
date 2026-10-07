/**
 * type-progress.test.js — checks that the typing game's stars are saved,
 * loaded, and survive broken or blocked storage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/type/levels.js';
import {
  PROGRESS_KEY, freshProgress, loadProgress, saveProgress, addStar, isUnlocked, highestUnlocked, loadMuted, saveMuted,
} from '../js/type/progress.js';

/**
 * A pretend localStorage that keeps things in a Map.
 * @returns {{getItem: Function, setItem: Function, data: Map}} the pretend storage
 */
function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

/** A pretend storage that refuses everything, like a blocked private window. */
const blocked = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
};

test('a new game has no stars and only level 1 open', () => {
  const progress = freshProgress();
  assert.equal(progress.stars.length, LEVELS.length);
  assert.ok(progress.stars.every((n) => n === 0));
  assert.equal(highestUnlocked(progress), 1);
});

test('stars saved are stars loaded', () => {
  const storage = fakeStorage();
  const progress = addStar(addStar(freshProgress(), 1), 1);
  assert.equal(saveProgress(storage, progress), true);
  assert.deepEqual(loadProgress(storage), progress);
  assert.match(storage.data.get(PROGRESS_KEY), /"version":1/);
});

test('missing, broken, old or blocked saves start fresh', () => {
  assert.deepEqual(loadProgress(null), freshProgress());
  assert.deepEqual(loadProgress(fakeStorage()), freshProgress());
  assert.deepEqual(loadProgress(blocked), freshProgress());
  for (const text of ['{oops', '"hi"', '[]', '{"version":2,"stars":[3]}', '{"version":1}', '{"version":1,"stars":"333"}']) {
    const storage = fakeStorage();
    storage.setItem(PROGRESS_KEY, text);
    assert.deepEqual(loadProgress(storage), freshProgress(), text);
  }
});

test('odd star numbers are tidied to whole numbers from 0 to 3', () => {
  const storage = fakeStorage();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, stars: [9, -2, 1.7, 'x', null] }));
  const { stars } = loadProgress(storage);
  assert.deepEqual(stars.slice(0, 5), [3, 0, 1, 0, 0]);
  assert.equal(stars.length, LEVELS.length);
});

test('saving to blocked storage says false instead of crashing', () => {
  assert.equal(saveProgress(blocked, freshProgress()), false);
  assert.equal(saveProgress(null, freshProgress()), false);
});

test('addStar stops at 3 and leaves the old progress alone', () => {
  let progress = freshProgress();
  for (let i = 0; i < 5; i++) progress = addStar(progress, 2);
  assert.equal(progress.stars[1], 3);
  const before = freshProgress();
  addStar(before, 1);
  assert.equal(before.stars[0], 0);
});

test('a level opens when the one before it has 3 stars', () => {
  let progress = freshProgress();
  assert.equal(isUnlocked(progress, 1), true);
  assert.equal(isUnlocked(progress, 2), false);
  progress = addStar(addStar(progress, 1), 1);
  assert.equal(isUnlocked(progress, 2), false);
  progress = addStar(progress, 1);
  assert.equal(isUnlocked(progress, 2), true);
  assert.equal(highestUnlocked(progress), 2);
  assert.equal(isUnlocked(progress, 0), false);
  assert.equal(isUnlocked(progress, LEVELS.length + 1), false);
});

test('with every level finished, the last level is the highest open', () => {
  const progress = { stars: LEVELS.map(() => 3) };
  assert.equal(highestUnlocked(progress), LEVELS.length);
});

test('the mute switch is remembered, and starts with sound on', () => {
  const storage = fakeStorage();
  assert.equal(loadMuted(storage), false);
  assert.equal(saveMuted(storage, true), true);
  assert.equal(loadMuted(storage), true);
  saveMuted(storage, false);
  assert.equal(loadMuted(storage), false);
  assert.equal(loadMuted(null), false);
  assert.equal(loadMuted(blocked), false);
  assert.equal(saveMuted(blocked, true), false);
});
