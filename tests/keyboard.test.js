/**
 * keyboard.test.js — checks the note-block keyboard's layout, in both
 * sizes: one octave (12 blocks) and two octaves (24 blocks).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockColumn, highestOctave, loadWide, saveWide } from '../js/music.js';
import { MAX_OCTAVE, buildChord, buildScale, CHORDS, SCALES } from '../js/music-theory.js';

test('the first octave: white keys side by side, black keys over the gaps', () => {
  assert.equal(blockColumn(0), 1);  // C
  assert.equal(blockColumn(1), 2);  // C♯ sits halfway over C and D
  assert.equal(blockColumn(4), 5);  // E
  assert.equal(blockColumn(5), 7);  // F: no black key between E and F
  assert.equal(blockColumn(11), 13); // B
});

test('the second octave is the first one again, 14 columns to the right', () => {
  for (let offset = 0; offset < 12; offset++) {
    assert.equal(blockColumn(offset + 12), blockColumn(offset) + 14);
  }
});

test('two octaves of blocks stop one octave sooner, so the top block stays in range', () => {
  assert.equal(highestOctave(false), MAX_OCTAVE);
  assert.equal(highestOctave(true), MAX_OCTAVE - 1);
});

test('every chord and every scale fits on two octaves of blocks', () => {
  for (let root = 0; root < 12; root++) {
    for (const type of Object.keys(CHORDS)) {
      assert.ok(Math.max(...buildChord(root, type)) < 24, `${type} chord on ${root}`);
    }
    for (const type of Object.keys(SCALES)) {
      assert.ok(Math.max(...buildScale(root, type)) < 24, `${type} scale on ${root}`);
    }
  }
});

/**
 * A pretend localStorage that keeps things in a Map.
 * @returns {{getItem: Function, setItem: Function}} the fake storage
 */
function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

test('the two-octave choice is remembered, and starts off', () => {
  const storage = fakeStorage();
  assert.equal(loadWide(storage), false);
  saveWide(true, storage);
  assert.equal(loadWide(storage), true);
  saveWide(false, storage);
  assert.equal(loadWide(storage), false);
});

test('if saving is blocked, the keyboard starts with one octave', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadWide(broken), false);
  assert.doesNotThrow(() => saveWide(true, broken));
});
