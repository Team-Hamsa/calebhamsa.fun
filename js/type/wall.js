/**
 * wall.js — the rules of the typing game: building a wall of letter
 * blocks, and what happens when a key is pressed.
 *
 * Pure, like levels.js: no web page here, so `npm test` can check it.
 * game.js does the drawing and the sounds.
 *
 * The game "state" is a small object:
 *   { level: 1, letters: ['F', 'J', …], index: 0, stars: 0 }
 * letters is the wall, index is the block Caleb is on, and stars counts
 * the walls cleared on this level (up to 3). pressKey never changes the
 * state it's given; it hands back a new one.
 */
import { newKeys, keysUpTo } from './levels.js';

/**
 * How many blocks in one wall.
 * 🧪 Try this! Make it 4 for quick walls, or 12 for long ones.
 */
export const WALL_SIZE = 8;

/** At least this many blocks in a wall are the level's NEW keys. */
export const MIN_NEW = 4;

/** Walls to clear (stars to earn) to finish a level. */
export const STARS_PER_LEVEL = 3;

/** How many random walls makeWall tries before using its tidy back-up wall. */
const TRIES = 100;

/**
 * Pick one thing from a list, using a random number from 0 up to 1.
 * @template T
 * @param {T[]} list - what to pick from
 * @param {() => number} random - gives a number from 0 up to (not including) 1
 * @returns {T} one item from the list
 */
function pick(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * Does a wall have the same letter three times in a row?
 * @param {string[]} letters - the wall
 * @returns {boolean} true if it does (that's not allowed)
 */
export function hasTripleRun(letters) {
  return letters.some((letter, i) => i >= 2 && letter === letters[i - 1] && letter === letters[i - 2]);
}

/**
 * Shuffle a list into a random order (the "Fisher–Yates" shuffle:
 * walk from the end, swapping each item with a random earlier one).
 * @template T
 * @param {T[]} list - the list (not changed)
 * @param {() => number} random - gives a number from 0 up to 1
 * @returns {T[]} a new, shuffled list
 */
function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one random wall for a level: WALL_SIZE letters, at least MIN_NEW
 * of them the level's new keys, never the same letter three in a row.
 *
 * It rolls a random wall and checks it. If it's no good it rolls again.
 * If a hundred rolls all fail (only a broken `random` would do that), it
 * uses a tidy back-up wall that takes turns: new key, old key, new key…
 *
 * @param {number} level - the level number, starting at 1
 * @param {() => number} [random] - gives a number from 0 up to 1 (tests pass a fixed one)
 * @returns {string[]} the wall's letters, like ['F', 'J', 'J', 'F', …]
 */
export function makeWall(level, random = Math.random) {
  const fresh = newKeys(level);
  const all = keysUpTo(level);
  for (let attempt = 0; attempt < TRIES; attempt++) {
    // MIN_NEW blocks must be new keys; the others can be any key so far.
    const kinds = shuffle([...Array(WALL_SIZE).keys()].map((i) => (i < MIN_NEW ? fresh : all)), random);
    const letters = kinds.map((keys) => pick(keys, random));
    if (!hasTripleRun(letters)) return letters;
  }
  const old = keysUpTo(level - 1);
  const others = old.length > 0 ? old : fresh;
  return [...Array(WALL_SIZE).keys()].map((i) => (i % 2 === 0
    ? fresh[(i / 2) % fresh.length]
    : others[((i - 1) / 2) % others.length]));
}

/**
 * Start a level with a fresh wall.
 * @param {number} level - the level number, starting at 1
 * @param {number} [stars] - stars this level already has (0 to 3)
 * @param {() => number} [random] - gives a number from 0 up to 1
 * @returns {{level: number, letters: string[], index: number, stars: number}} the game state
 */
export function newGame(level, stars = 0, random = Math.random) {
  return { level, letters: makeWall(level, random), index: 0, stars };
}

/**
 * Is this key press one the game should look at? Letters only: not a
 * key held down (it repeats by itself), and not a shortcut like ⌘R.
 * @param {{key: string, repeat?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean}} event - the browser's keydown event
 * @returns {boolean} true for a plain letter press
 */
export function isLetterKey(event) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false;
  return /^[a-z]$/i.test(event.key);
}

/**
 * Caleb pressed a key. What happens?
 *
 *   'ignored'   not a letter: nothing happens
 *   'miss'      the wrong letter: the state stays the same
 *   'hit'       the right letter: move on to the next block
 *   'wallDone'  the right letter, and the wall is clear: +1 star, new wall
 *   'levelDone' like wallDone, and that was the 3rd star: next level unlocks
 *
 * @param {{level: number, letters: string[], index: number, stars: number}} state - the game now
 * @param {string} key - the key pressed, like 'f' or 'F'
 * @param {() => number} [random] - gives a number from 0 up to 1 (for the next wall)
 * @returns {{state: object, result: string}} the new state, and what happened
 */
export function pressKey(state, key, random = Math.random) {
  if (!/^[a-z]$/i.test(key)) return { state, result: 'ignored' };
  if (key.toUpperCase() !== state.letters[state.index]) return { state, result: 'miss' };

  const index = state.index + 1;
  if (index < state.letters.length) return { state: { ...state, index }, result: 'hit' };

  // The wall is clear!
  const result = state.stars === STARS_PER_LEVEL - 1 ? 'levelDone' : 'wallDone';
  const stars = Math.min(STARS_PER_LEVEL, state.stars + 1);
  return { state: { ...state, letters: makeWall(state.level, random), index: 0, stars }, result };
}
