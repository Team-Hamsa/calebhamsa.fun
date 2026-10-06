/**
 * type-wall.test.js — checks the typing game's rules: walls are built
 * fairly, and key presses hit, miss or get ignored correctly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, newKeys, keysUpTo } from '../js/type/levels.js';
import {
  WALL_SIZE, MIN_NEW, STARS_PER_LEVEL, makeWall, newGame, pressKey, isLetterKey, hasTripleRun,
} from '../js/type/wall.js';

/**
 * A pretend random-number maker that gives the same numbers every time
 * for the same seed (the "mulberry32" recipe), so failures can be repeated.
 * @param {number} seed - any whole number
 * @returns {() => number} gives numbers from 0 up to 1
 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random makers to try: lots of seeds, plus two broken ones that always say the same number. */
const RANDOMS = [...Array(200).keys()].map(seeded).concat([() => 0, () => 0.999999]);

/**
 * Check one wall against every wall rule.
 * @param {string[]} wall - the letters
 * @param {number} level - its level
 * @returns {void}
 */
function assertGoodWall(wall, level) {
  assert.equal(wall.length, WALL_SIZE);
  const fresh = newKeys(level);
  const known = keysUpTo(level);
  assert.ok(wall.filter((letter) => fresh.includes(letter)).length >= MIN_NEW, `level ${level}: too few new keys in ${wall}`);
  for (const letter of wall) assert.ok(known.includes(letter), `level ${level}: ${letter} isn't taught yet`);
  assert.equal(hasTripleRun(wall), false, `level ${level}: three in a row in ${wall}`);
}

test('every wall at every level follows the rules', () => {
  for (let level = 1; level <= LEVELS.length; level++) {
    for (const random of RANDOMS) assertGoodWall(makeWall(level, random), level);
  }
});

test('level 1 is only F and J', () => {
  for (const random of RANDOMS) {
    for (const letter of makeWall(1, random)) assert.ok(letter === 'F' || letter === 'J');
  }
});

test('one-key levels (A, C) still mix in other keys so the new key never comes three in a row', () => {
  for (const level of [4, 12]) {
    for (const random of RANDOMS) assertGoodWall(makeWall(level, random), level);
  }
});

test('hasTripleRun spots three in a row, and only that', () => {
  assert.equal(hasTripleRun(['F', 'F', 'F']), true);
  assert.equal(hasTripleRun(['F', 'F', 'J', 'F', 'F']), false);
});

test('a right key, big or small, moves to the next block', () => {
  const state = { level: 1, letters: ['F', 'J', 'F', 'J', 'F', 'J', 'F', 'J'], index: 0, stars: 0 };
  const lower = pressKey(state, 'f');
  assert.equal(lower.result, 'hit');
  assert.equal(lower.state.index, 1);
  assert.equal(pressKey(state, 'F').result, 'hit');
  assert.equal(state.index, 0, 'the old state is not changed');
});

test('a wrong key is a miss and changes nothing', () => {
  const state = { level: 1, letters: ['F', 'J', 'F', 'J', 'F', 'J', 'F', 'J'], index: 2, stars: 1 };
  const { state: after, result } = pressKey(state, 'j');
  assert.equal(result, 'miss');
  assert.deepEqual(after, state);
});

test('non-letters are ignored', () => {
  const state = newGame(1, 0, seeded(1));
  for (const key of ['Shift', 'ArrowLeft', ' ', 'Enter', '1', ';', 'CapsLock']) {
    const { state: after, result } = pressKey(state, key);
    assert.equal(result, 'ignored', key);
    assert.deepEqual(after, state);
  }
});

/**
 * Press every letter of the wall, in order.
 * @param {object} state - the game state
 * @param {() => number} random - for the next wall
 * @returns {{state: object, result: string}} what the last press did
 */
function clearWall(state, random) {
  let out = { state, result: '' };
  for (const letter of state.letters) out = pressKey(out.state, letter, random);
  return out;
}

test('clearing a wall gives a star and a fresh wall; the 3rd star finishes the level', () => {
  const random = seeded(7);
  let game = newGame(2, 0, random);
  let out = clearWall(game, random);
  assert.equal(out.result, 'wallDone');
  assert.equal(out.state.stars, 1);
  assert.equal(out.state.index, 0);
  assertGoodWall(out.state.letters, 2);

  out = clearWall(out.state, random);
  assert.equal(out.result, 'wallDone');
  assert.equal(out.state.stars, 2);

  out = clearWall(out.state, random);
  assert.equal(out.result, 'levelDone');
  assert.equal(out.state.stars, STARS_PER_LEVEL);

  // Playing on: more walls, stars stay at 3, and it doesn't "finish" again.
  out = clearWall(out.state, random);
  assert.equal(out.result, 'wallDone');
  assert.equal(out.state.stars, STARS_PER_LEVEL);
  game = out.state;
  assert.equal(game.level, 2);
});

test('isLetterKey: plain letters yes; held keys, shortcuts and other keys no', () => {
  assert.equal(isLetterKey({ key: 'f' }), true);
  assert.equal(isLetterKey({ key: 'F' }), true); // Shift or Caps Lock is fine
  assert.equal(isLetterKey({ key: 'f', repeat: true }), false);
  assert.equal(isLetterKey({ key: 'r', metaKey: true }), false);
  assert.equal(isLetterKey({ key: 'r', ctrlKey: true }), false);
  assert.equal(isLetterKey({ key: 'f', altKey: true }), false);
  assert.equal(isLetterKey({ key: 'Shift' }), false);
  assert.equal(isLetterKey({ key: 'ArrowLeft' }), false);
  assert.equal(isLetterKey({ key: ';' }), false);
});
