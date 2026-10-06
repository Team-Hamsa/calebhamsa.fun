/**
 * type-levels.test.js — checks what the typing game teaches: every
 * letter once, in a sensible order, each with a finger and a color.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, KEYBOARD_ROWS, FINGERS, FINGER_COLORS, newKeys, keysUpTo } from '../js/type/levels.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

test('every letter A–Z is taught exactly once', () => {
  const taught = LEVELS.flat();
  assert.deepEqual([...taught].sort(), ALPHABET);
});

test('the game starts on the home-row bumps, F and J', () => {
  assert.deepEqual(newKeys(1), ['F', 'J']);
  assert.deepEqual(LEVELS.slice(0, 4).flat().sort(), ['A', 'D', 'F', 'J', 'K', 'L', 'S']);
});

test('the drawn keyboard has all 26 letters, QWERTY order', () => {
  assert.deepEqual(KEYBOARD_ROWS, ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
  assert.deepEqual(KEYBOARD_ROWS.join('').split('').sort(), ALPHABET);
});

test('every key has a hand, a finger, and that finger has a color', () => {
  for (const key of ALPHABET) {
    const finger = FINGERS[key];
    assert.ok(finger, `no finger for ${key}`);
    assert.ok(['left', 'right'].includes(finger.hand), key);
    assert.match(FINGER_COLORS[finger.finger] ?? '', /^#[0-9a-f]{6}$/, key);
  }
});

test('the home row matches a typing chart', () => {
  assert.deepEqual(FINGERS.F, { hand: 'left', finger: 'pointer' });
  assert.deepEqual(FINGERS.J, { hand: 'right', finger: 'pointer' });
  assert.deepEqual(FINGERS.A, { hand: 'left', finger: 'pinky' });
  assert.deepEqual(FINGERS.L, { hand: 'right', finger: 'ring' });
  assert.deepEqual(FINGERS.D, { hand: 'left', finger: 'middle' });
  assert.deepEqual(FINGERS.K, { hand: 'right', finger: 'middle' });
});

test('keysUpTo grows level by level and ends with everything', () => {
  assert.deepEqual(keysUpTo(0), []);
  assert.deepEqual(keysUpTo(2), ['F', 'J', 'D', 'K']);
  for (let level = 1; level <= LEVELS.length; level++) {
    assert.deepEqual(keysUpTo(level), [...keysUpTo(level - 1), ...newKeys(level)]);
  }
  assert.equal(keysUpTo(LEVELS.length).length, 26);
});
