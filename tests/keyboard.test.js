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

test('with nothing saved: two octaves on a big screen (iPad), one on a phone', () => {
  assert.equal(loadWide(fakeStorage(), { width: 820, height: 1180 }), true);  // iPad Air
  assert.equal(loadWide(fakeStorage(), { width: 744, height: 1133 }), true);  // iPad mini
  assert.equal(loadWide(fakeStorage(), { width: 390, height: 844 }), false);  // phone
  assert.equal(loadWide(fakeStorage(), { width: 844, height: 390 }), false);  // phone, sideways
});

test('the two-octave choice is remembered, and beats the screen-size guess', () => {
  const storage = fakeStorage();
  saveWide(false, storage);
  assert.equal(loadWide(storage, { width: 820, height: 1180 }), false);
  saveWide(true, storage);
  assert.equal(loadWide(storage, { width: 390, height: 844 }), true);
});

test('if saving is blocked, the screen size still picks', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadWide(broken, { width: 820, height: 1180 }), true);
  assert.equal(loadWide(broken, { width: 390, height: 844 }), false);
  assert.doesNotThrow(() => saveWide(true, broken));
});
