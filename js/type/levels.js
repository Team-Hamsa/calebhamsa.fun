/**
 * levels.js — what the typing game teaches, and which finger presses what.
 *
 * This file is "pure": it only holds lists and answers questions about
 * them. It never touches the web page, so `npm test` can check it.
 *
 * Typing teachers start on the "home row" (A S D F … J K L), where your
 * fingers rest. F and J have little bumps so you can find them without
 * looking. Then they add the keys above and below, a few at a time.
 */

/**
 * The new keys each level teaches. Level 1 is LEVELS[0], and so on.
 * Each letter A–Z is taught exactly once. A level's walls also use every
 * key from the levels before it.
 * 🧪 Try this! Swap ['G', 'H'] and ['R', 'U'] and see which feels easier.
 */
export const LEVELS = [
  ['F', 'J'],
  ['D', 'K'],
  ['S', 'L'],
  ['A'],
  ['G', 'H'],
  ['R', 'U'],
  ['E', 'I'],
  ['T', 'Y'],
  ['W', 'O'],
  ['Q', 'P'],
  ['V', 'M'],
  ['C'],
  ['X', 'Z', 'B', 'N'],
];

/** The letter keys on a real keyboard, top row first (QWERTY). */
export const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Each finger's color, the same on both hands, like a school typing chart.
 * 🧪 Try this! Make every finger the same color. Is it harder to know which finger to use?
 */
export const FINGER_COLORS = {
  pointer: '#5dbb3f', // green
  middle: '#3d7bd9',  // blue
  ring: '#9b59d0',    // purple
  pinky: '#f28c28',   // orange
};

/** Which keys each finger presses, hand by hand. */
const FINGER_KEYS = {
  left: { pinky: 'AQZ', ring: 'SWX', middle: 'DEC', pointer: 'FGRTVB' },
  right: { pointer: 'JHUYNM', middle: 'KI', ring: 'LO', pinky: 'P' },
};

/**
 * Turn FINGER_KEYS around: for each key, which hand and finger press it.
 * @returns {Record<string, {hand: string, finger: string}>} like FINGERS.F = { hand: 'left', finger: 'pointer' }
 */
function fingersByKey() {
  const fingers = {};
  for (const [hand, keysByFinger] of Object.entries(FINGER_KEYS)) {
    for (const [finger, keys] of Object.entries(keysByFinger)) {
      for (const key of keys) fingers[key] = { hand, finger };
    }
  }
  return fingers;
}

/** For each key, the hand and finger that press it, like FINGERS.F = { hand: 'left', finger: 'pointer' }. */
export const FINGERS = fingersByKey();

/**
 * The keys a level teaches for the first time.
 * @param {number} level - the level number, starting at 1
 * @returns {string[]} the new keys, like ['F', 'J']
 */
export function newKeys(level) {
  return LEVELS[level - 1] ?? [];
}

/**
 * Every key taught up to and including a level.
 * @param {number} level - the level number, starting at 1 (0 gives no keys)
 * @returns {string[]} the keys, like ['F', 'J', 'D', 'K'] for level 2
 */
export function keysUpTo(level) {
  return LEVELS.slice(0, Math.max(0, level)).flat();
}
