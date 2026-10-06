# ⌨️ Typing Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `type.html`, a calm block-mining game that teaches Caleb (5) where the letter keys are on a real keyboard.

**Architecture:** Three pure modules in `js/type/` (`levels.js` holds what each level teaches and the fingers, `wall.js` holds the wall building and key rules, `progress.js` holds saved stars) are tested by `npm test`. One page-code file, `js/type/game.js`, draws plain `<div>` blocks styled by `css/type.css` and plays sounds through the shared `js/sound.js`. The page is precached by `sw.js` like every other page.

**Tech Stack:** Vanilla HTML/CSS/ES modules with no dependencies. Tests use `node --test` (Node 20+). The hands-on check uses Playwright, borrowed from `~/LFG/scripts/share_card/node_modules`.

**Spec:** `docs/superpowers/specs/2026-10-06-typing-trainer-design.md`

All code in this plan was prototyped in a scratch copy of the site before the plan was written: 23 new unit tests pass, `docs.test.js` passes on the new files, and the Playwright smoke check passes at desktop, iPad and phone sizes. Copy it exactly.

## Global Constraints

- Vanilla JS, **no dependencies**, ES modules (`package.json` has `"type": "module"`).
- Every file starts with a header comment saying what it does. **Every function** (`function name(` or `const name = (...) =>`) has a `/** … */` JSDoc directly above it. `tests/docs.test.js` enforces this for `js/`.
- Include 🧪 "Try this!" comments where a number is fun to change.
- Pure modules never touch `document` or `window` when they are imported (`tests/modules.test.js` imports every file).
- Only letters A–Z. No punctuation, no timer, no lives.
- Save key: `localStorage['calebhamsa.type']` = `{"version":1,"stars":[…]}`.
- Service worker: `CACHE_NAME` goes from `'caleb-v8'` to `'caleb-v9'`.
- Deploy: commit straight to `main` and push (personal site, GitHub Pages, no PR/review bots). Commit messages are plain English sentences, like the repo history, and end with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.

## Review Focus

1. **The key that closes the start sign must not count.** If it did, pressing "f" to start would break a block or wobble one before Caleb has seen the wall. Covered by the smoke check in Task 4: no `.broken` after the first key.
2. **Keys pressed while a cleared wall is still showing (700 ms)** must be ignored, not scored against the next wall that isn't visible yet. `page.waiting` handles this in Task 4.
3. **Enter or Space while a level button has focus** would restart the level halfway through a wall. Each level button calls `button.blur()` on click (Task 4).
4. **One-key levels (4: A, 12: C)** must not get stuck building a wall, even with a broken `random`. A back-up wall plus `() => 0` and `() => 0.999999` are in the Task 2 tests.
5. **Blocked or broken storage** (private window, junk JSON, an old version) must start fresh, never crash. Covered by the Task 3 tests.

---

### Task 1: `levels.js`: the keys each level teaches, and the fingers

**Files:**
- Create: `js/type/levels.js`
- Create: `tests/type-levels.test.js`
- Modify: `tests/modules.test.js` (the `MODULES` list)

**Interfaces:**
- Produces: `LEVELS: string[][]` (13 levels; level n is `LEVELS[n-1]`), `KEYBOARD_ROWS: string[]`, `FINGER_COLORS: {pointer, middle, ring, pinky}` (hex strings), `FINGERS: Record<letter, {hand: 'left'|'right', finger: 'pointer'|'middle'|'ring'|'pinky'}>`, `newKeys(level): string[]`, `keysUpTo(level): string[]`. Level numbers start at 1 everywhere.

- [ ] **Step 1: Write the failing test** `tests/type-levels.test.js`:

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/type-levels.test.js`
Expected: FAIL with `Cannot find module …/js/type/levels.js`.

- [ ] **Step 3: Write** `js/type/levels.js`:

```js
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
```

- [ ] **Step 4: Add it to the import check.** In `tests/modules.test.js`, append `'type/levels.js'` to the end of the `MODULES` array (after `'chem/room.js'`).

- [ ] **Step 5: Run it to see it pass**

Run: `node --test tests/type-levels.test.js tests/modules.test.js tests/docs.test.js`
Expected: PASS. All 6 type-levels tests pass, and docs and modules are green.

- [ ] **Step 6: Commit**

```bash
git add js/type/levels.js tests/type-levels.test.js tests/modules.test.js
git commit -m "Typing game: what each level teaches (home row first, every letter once) and which finger presses each key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `wall.js`: building walls, and what a key press does

**Files:**
- Create: `js/type/wall.js`
- Create: `tests/type-wall.test.js`
- Modify: `tests/modules.test.js`

**Interfaces:**
- Consumes: `newKeys`, `keysUpTo` from `./levels.js`.
- Produces: `WALL_SIZE = 8`, `MIN_NEW = 4`, `STARS_PER_LEVEL = 3`, `hasTripleRun(letters): boolean`, `makeWall(level, random?): string[]`, `newGame(level, stars = 0, random?): State`, `isLetterKey(event): boolean`, `pressKey(state, key, random?): {state: State, result: 'ignored'|'miss'|'hit'|'wallDone'|'levelDone'}`, where `State = {level, letters, index, stars}`. `pressKey` never changes its input. `levelDone` is returned only on the clear that takes stars from 2 to 3.

- [ ] **Step 1: Write the failing test** `tests/type-wall.test.js`:

```js
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/type-wall.test.js`
Expected: FAIL with `Cannot find module …/js/type/wall.js`.

- [ ] **Step 3: Write** `js/type/wall.js`:

```js
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
```

- [ ] **Step 4:** In `tests/modules.test.js`, append `'type/wall.js'` to `MODULES`.

- [ ] **Step 5: Run it to see it pass**

Run: `node --test tests/type-wall.test.js tests/modules.test.js tests/docs.test.js`
Expected: PASS (all 10 type-wall tests).

- [ ] **Step 6: Commit**

```bash
git add js/type/wall.js tests/type-wall.test.js tests/modules.test.js
git commit -m "Typing game rules: a wall is 8 letters, at least half of them new and never three in a row. A right key breaks a block, a wrong one changes nothing, and three walls finish a level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `progress.js`: saved stars and unlocking

**Files:**
- Create: `js/type/progress.js`
- Create: `tests/type-progress.test.js`
- Modify: `tests/modules.test.js`

**Interfaces:**
- Consumes: `LEVELS` from `./levels.js`, and `STARS_PER_LEVEL` from `./wall.js`. The spec's table said progress.js has no dependencies. It imports these two pure constants so the level count and star cap are written down only once.
- Produces: `PROGRESS_KEY = 'calebhamsa.type'`, `PROGRESS_VERSION = 1`, `freshProgress(): {stars: number[]}`, `loadProgress(storage|null)`, `saveProgress(storage|null, progress): boolean`, `addStar(progress, level)` (returns a new object and caps at 3), `isUnlocked(progress, level): boolean`, `highestUnlocked(progress): number`.

- [ ] **Step 1: Write the failing test** `tests/type-progress.test.js`:

```js
/**
 * type-progress.test.js — checks that the typing game's stars are saved,
 * loaded, and survive broken or blocked storage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/type/levels.js';
import {
  PROGRESS_KEY, freshProgress, loadProgress, saveProgress, addStar, isUnlocked, highestUnlocked,
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/type-progress.test.js`
Expected: FAIL with `Cannot find module …/js/type/progress.js`.

- [ ] **Step 3: Write** `js/type/progress.js`:

```js
/**
 * progress.js — remembers the typing game's stars, so they're still
 * there after the iPad is closed.
 *
 * The stars are saved in the browser's localStorage as a little bit of
 * text (JSON):
 *   calebhamsa.type = {"version":1,"stars":[3,3,1,0,0,…]}
 * One number per level: how many walls (0 to 3) have been cleared.
 *
 * Pure: the storage is handed in, so tests can pass a pretend one.
 */
import { LEVELS } from './levels.js';
import { STARS_PER_LEVEL } from './wall.js';

/** The localStorage name the stars are saved under. */
export const PROGRESS_KEY = 'calebhamsa.type';

/** Change this if the saved shape ever changes, so old saves are ignored. */
export const PROGRESS_VERSION = 1;

/**
 * A brand-new game: no stars anywhere.
 * @returns {{stars: number[]}} the progress
 */
export function freshProgress() {
  return { stars: LEVELS.map(() => 0) };
}

/**
 * Load the saved stars. Anything missing, broken, or from an old version
 * gives a brand-new game instead of an error.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @returns {{stars: number[]}} the progress
 */
export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? 'null');
    if (data?.version !== PROGRESS_VERSION || !Array.isArray(data.stars)) return freshProgress();
    // Each level gets a whole number from 0 to 3, whatever was saved.
    const stars = LEVELS.map((_, i) => Math.min(STARS_PER_LEVEL, Math.max(0, Math.floor(Number(data.stars[i])) || 0)));
    return { stars };
  } catch {
    // Unreadable text, or storage that says "no": start fresh.
    return freshProgress();
  }
}

/**
 * Save the stars.
 * @param {Storage|null} storage - localStorage, or null when it's blocked
 * @param {{stars: number[]}} progress - the stars to save
 * @returns {boolean} true if they were saved
 */
export function saveProgress(storage, progress) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, stars: progress.stars }));
    return true;
  } catch {
    // Storage blocked or full: the game keeps playing, it just won't remember.
    return false;
  }
}

/**
 * One more star for a level (never more than 3).
 * @param {{stars: number[]}} progress - the stars now (not changed)
 * @param {number} level - the level number, starting at 1
 * @returns {{stars: number[]}} new progress with the extra star
 */
export function addStar(progress, level) {
  const stars = [...progress.stars];
  stars[level - 1] = Math.min(STARS_PER_LEVEL, stars[level - 1] + 1);
  return { stars };
}

/**
 * Can this level be played yet? Level 1 always can; every other level
 * opens when the level before it has all 3 stars.
 * @param {{stars: number[]}} progress - the stars
 * @param {number} level - the level number, starting at 1
 * @returns {boolean} true if it's open
 */
export function isUnlocked(progress, level) {
  if (level < 1 || level > LEVELS.length) return false;
  return level === 1 || progress.stars[level - 2] >= STARS_PER_LEVEL;
}

/**
 * The furthest level that's open: where the game starts.
 * @param {{stars: number[]}} progress - the stars
 * @returns {number} the level number, starting at 1
 */
export function highestUnlocked(progress) {
  let level = 1;
  while (isUnlocked(progress, level + 1)) level++;
  return level;
}
```

- [ ] **Step 4:** In `tests/modules.test.js`, append `'type/progress.js'` to `MODULES`.

- [ ] **Step 5: Run it to see it pass**

Run: `node --test tests/type-progress.test.js tests/modules.test.js tests/docs.test.js`
Expected: PASS (all 8 type-progress tests).

- [ ] **Step 6: Commit**

```bash
git add js/type/progress.js tests/type-progress.test.js tests/modules.test.js
git commit -m "Typing game remembers its stars. Broken, old or blocked saves start fresh, and a level opens when the one before it has three stars

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The page (`type.html`, `css/type.css`, `js/type/game.js`), wired into the site

**Files:**
- Create: `type.html`, `css/type.css`, `js/type/game.js`
- Modify: `tests/pages.test.js:13` (`PAGES`)
- Modify: `tests/modules.test.js` (`MODULES`)
- Modify: `tests/sw.test.js:116` (the page list in "every page and every js file is saved for offline use")
- Modify: `sw.js` (`CACHE_NAME`, `PRECACHE`)
- Modify: `index.html` (big block + favorite)
- Modify: `README.md` ("What's where" table)

**Interfaces:**
- Consumes: everything from Tasks 1–3; `listenForUnlock`, `playTones`, `VOICES` (`soft`, `beep`, `bell`) from `js/sound.js`; `flash(element, className, ms)` from `js/ui.js`; the `.block`, `.grass`, `.top-bar`, `.page-title`, `.toolbar` classes and the `shake`/`cheer`/`pulse` keyframes from `css/blocks.css`.
- Produces: `initType()` (exported from `js/type/game.js`, called once by `type.html`).

- [ ] **Step 1: Make the site tests expect the new page (they fail first).**

`tests/pages.test.js` line 13:
```js
const PAGES = ['index.html', 'music.html', 'draw.html', 'build.html', 'chem.html', 'type.html'];
```
`tests/sw.test.js` line 116: add `'./type.html'` to the list:
```js
  for (const path of [...scripts, './index.html', './music.html', './draw.html', './build.html', './chem.html', './type.html']) {
```
`tests/modules.test.js`: append `'type/game.js'` to `MODULES`.
Also add this test to the end of `tests/pages.test.js`:
```js
test('the homepage links to the Typing page (big block and favorite thing)', () => {
  const links = [...read('index.html').matchAll(/href="type\.html"/g)];
  assert.equal(links.length, 2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/pages.test.js tests/sw.test.js tests/modules.test.js`
Expected: FAIL. `type.html` is missing, `PRECACHE is missing ./type.html`, `js/type/game.js` fails to load, and the homepage has 0 links to type.html.

- [ ] **Step 3: Write** `js/type/game.js`:

```js
/**
 * game.js — makes the typing page (type.html) work.
 *
 * The rules live in wall.js, the letters and fingers in levels.js, and
 * the saved stars in progress.js. This file is the part that touches the
 * web page: it draws the level strip, the wall, the keyboard and the
 * hands, listens for key presses, and plays the sounds.
 */
import { LEVELS, KEYBOARD_ROWS, FINGERS, FINGER_COLORS } from './levels.js';
import { newGame, pressKey, isLetterKey, STARS_PER_LEVEL } from './wall.js';
import { loadProgress, saveProgress, addStar, isUnlocked, highestUnlocked } from './progress.js';
import { listenForUnlock, playTones, VOICES } from '../sound.js';
import { flash } from '../ui.js';

/**
 * The sounds, as MIDI note numbers (60 is middle C).
 * 🧪 Try this! Make POP_NOTES [96] for a tiny "tink", or CHEER_NOTES [60, 63, 67] for a sad-sounding chord.
 */
const POP_NOTES = [84];
const BONK_NOTES = [43];
const CHEER_NOTES = [60, 64, 67, 72];
const LEVEL_CHEER_NOTES = [60, 64, 67, 72, 76, 79];

/** How long the cleared wall stays on screen before the new one, in milliseconds. */
const NEW_WALL_DELAY_MS = 700;

/** The order fingers are drawn on each hand, left to right, as you look at your hands. */
const HAND_FINGERS = {
  left: ['pinky', 'ring', 'middle', 'pointer', 'thumb'],
  right: ['thumb', 'pointer', 'middle', 'ring', 'pinky'],
};

/** Everything the page is doing right now. */
const page = {
  progress: { stars: [] },
  game: null,
  started: false, // has the "press a key to start" sign been closed?
  waiting: false, // is a cleared wall still showing (keys wait for the new one)?
};

/**
 * Find an element by its id="…".
 * @param {string} id - the id
 * @returns {HTMLElement} the element
 */
function byId(id) {
  return document.getElementById(id);
}

/**
 * localStorage, or null if the browser doesn't allow it.
 * @returns {Storage|null} the storage
 */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Say something out loud (if this browser can).
 * @param {string} text - what to say, like 'F'
 * @returns {void}
 */
function speak(text) {
  try {
    speechSynthesis.cancel();
    const words = new SpeechSynthesisUtterance(text);
    words.rate = 0.9;
    speechSynthesis.speak(words);
  } catch {
    // No voice here: the glowing key still shows the way.
  }
}

/**
 * Set up the whole page. type.html calls this once.
 * @returns {void}
 */
export function initType() {
  page.progress = loadProgress(storage());
  buildKeyboard();
  buildHands();
  startLevel(highestUnlocked(page.progress));
  listenForUnlock();
  document.addEventListener('keydown', onKeyDown);
  byId('start').addEventListener('click', start);
}

/**
 * Close the "press a key to start" sign and say the first letter.
 * This happens inside a tap or key press, which is when iPads allow sound.
 * @returns {void}
 */
function start() {
  page.started = true;
  byId('start').hidden = true;
  speak(currentLetter());
}

/**
 * The letter on the glowing block.
 * @returns {string} like 'F'
 */
function currentLetter() {
  return page.game.letters[page.game.index];
}

/**
 * Play a level from its first wall.
 * @param {number} level - the level number, starting at 1
 * @returns {void}
 */
function startLevel(level) {
  page.game = newGame(level, page.progress.stars[level - 1]);
  page.waiting = false;
  drawLevels();
  drawWall();
  if (page.started) speak(currentLetter());
}

// ---- Key presses ----

/**
 * A key went down somewhere on the page.
 * @param {KeyboardEvent} event - the key press
 * @returns {void}
 */
function onKeyDown(event) {
  if (!page.started) {
    // Any ordinary key closes the start sign (but doesn't count as a guess).
    if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) start();
    return;
  }
  if (!isLetterKey(event) || page.waiting) return;
  event.preventDefault();

  const target = currentLetter();
  const { state, result } = pressKey(page.game, event.key);
  const block = byId('wall').children[page.game.index];

  if (result === 'miss') {
    flash(block, 'shake', 400);
    flash(keyFor(event.key.toUpperCase()), 'wrong', 500);
    playTones(BONK_NOTES, VOICES.soft);
    speak(target);
    return;
  }

  block.classList.add('broken');
  playTones(POP_NOTES, VOICES.bell);
  page.game = state;

  if (result === 'hit') {
    showTarget();
    speak(currentLetter());
    return;
  }

  // The wall is clear: a star, a cheer, then a new wall.
  page.progress = addStar(page.progress, state.level);
  saveProgress(storage(), page.progress);
  playTones(result === 'levelDone' ? LEVEL_CHEER_NOTES : CHEER_NOTES, VOICES.bell);
  drawLevels();
  flash(byId('levels').children[state.level - 1], 'cheer', 600);
  page.waiting = true;
  setTimeout(() => {
    page.waiting = false;
    drawWall();
    speak(currentLetter());
  }, NEW_WALL_DELAY_MS);
}

// ---- Drawing ----

/**
 * Draw the strip of level blocks: stone 🪨 if locked, grass if open,
 * with the stars each level has earned.
 * @returns {void}
 */
function drawLevels() {
  const strip = byId('levels');
  strip.replaceChildren(...LEVELS.map((keys, i) => {
    const level = i + 1;
    const button = document.createElement('button');
    const open = isUnlocked(page.progress, level);
    button.className = open ? 'block grass level' : 'block level';
    button.disabled = !open;
    button.setAttribute('aria-pressed', String(level === page.game.level));
    button.setAttribute('aria-label', `Level ${level}`);
    const stars = page.progress.stars[i];
    button.innerHTML = open
      ? `<span>${keys.join('')}</span><span class="stars">${'⭐'.repeat(stars)}${'·'.repeat(STARS_PER_LEVEL - stars)}</span>`
      : '🪨';
    button.addEventListener('click', () => {
      button.blur(); // so Enter or Space can't press it again by accident
      startLevel(level);
    });
    return button;
  }));
}

/**
 * Draw the wall of letter blocks for the current game.
 * @returns {void}
 */
function drawWall() {
  byId('wall').replaceChildren(...page.game.letters.map((letter) => {
    const block = document.createElement('div');
    block.className = 'wall-block';
    block.textContent = letter;
    return block;
  }));
  showTarget();
}

/**
 * Light up the block Caleb is on, its key, and the finger that presses it.
 * @returns {void}
 */
function showTarget() {
  const letter = currentLetter();
  [...byId('wall').children].forEach((block, i) => block.classList.toggle('target', i === page.game.index));
  for (const key of document.querySelectorAll('.key')) key.classList.toggle('target', key.dataset.key === letter);
  const { hand, finger } = FINGERS[letter];
  for (const element of document.querySelectorAll('.finger')) {
    element.classList.toggle('target', element.dataset.hand === hand && element.dataset.finger === finger);
  }
}

/**
 * The drawn key for a letter.
 * @param {string} letter - like 'F'
 * @returns {HTMLElement} the key
 */
function keyFor(letter) {
  return document.querySelector(`.key[data-key="${letter}"]`);
}

/**
 * Draw the keyboard: three rows of letter keys, each tinted with its finger's color.
 * @returns {void}
 */
function buildKeyboard() {
  byId('keyboard').replaceChildren(...KEYBOARD_ROWS.map((row) => {
    const line = document.createElement('div');
    line.className = 'key-row';
    for (const letter of row) {
      const key = document.createElement('div');
      key.className = letter === 'F' || letter === 'J' ? 'key bump' : 'key';
      key.dataset.key = letter;
      key.textContent = letter;
      key.style.setProperty('--finger', FINGER_COLORS[FINGERS[letter].finger]);
      line.append(key);
    }
    return line;
  }));
}

/**
 * Draw two hands: four colored fingers and a gray thumb each.
 * @returns {void}
 */
function buildHands() {
  byId('hands').replaceChildren(...Object.entries(HAND_FINGERS).map(([hand, fingers]) => {
    const palm = document.createElement('div');
    palm.className = `hand ${hand}`;
    for (const finger of fingers) {
      const element = document.createElement('div');
      element.className = `finger ${finger}`;
      element.dataset.hand = hand;
      element.dataset.finger = finger;
      element.style.setProperty('--finger', FINGER_COLORS[finger] ?? 'var(--stone)');
      palm.append(element);
    }
    return palm;
  }));
}
```

- [ ] **Step 4: Write** `css/type.css`:

```css
/* =================================================================
   type.css: how the typing page (type.html) LOOKS.

   The block buttons, colors and the shake/cheer animations come from
   blocks.css. This file adds the wall, the drawn keyboard, the hands,
   and the "pop" when a block breaks.
   ================================================================= */

.type-page { --page-bg: #6fb3e0; } /* a slightly deeper sky */

.type-main {
  align-items: center;
  gap: 24px;
}

/* ---- The level strip ---- */
.level {
  flex-direction: column;
  gap: 4px;
  min-width: 56px;
  padding: 6px 4px;
  font-size: 11px;
}
.level .stars { font-size: 9px; letter-spacing: -1px; }

/* ---- The wall ----
   min() keeps blocks big on an iPad but small enough that 8 fit on a phone. */
.wall {
  --size: min(88px, calc((100vw - 64px) / 8 - 6px));
  display: flex;
  gap: 6px;
  min-height: calc(var(--size) + 8px);
}

.wall-block {
  width: var(--size);
  height: var(--size);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--size) * 0.45);
  color: #fff;
  text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.5);
  background: var(--stone);
  border-bottom: 8px solid var(--stone-dark);
  box-shadow:
    inset 4px 4px 0 rgba(255, 255, 255, 0.25),
    inset -4px -4px 0 rgba(0, 0, 0, 0.15);
}

/* The block Caleb is on: gold, and gently glowing. */
.wall-block.target {
  background: var(--gold);
  border-bottom-color: var(--gold-dark);
  animation: pulse 1s infinite;
}

/* A broken block pops, then leaves an empty gap.
   🧪 Try this! Change 250ms to 2s for a slow-motion pop. */
.wall-block.broken {
  animation: pop 250ms forwards;
}

@keyframes pop {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.3); opacity: 0.7; }
  100% { transform: scale(0);   opacity: 0; }
}

/* ---- The drawn keyboard ---- */
.keyboard {
  --key: min(52px, calc((100vw - 64px) / 10 - 6px));
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--obsidian);
  border-bottom: 8px solid var(--obsidian-dark);
}

/* Each row starts a little further right, like a real keyboard. */
.key-row { display: flex; gap: 6px; }
.key-row:nth-child(2) { padding-left: calc(var(--key) * 0.3); }
.key-row:nth-child(3) { padding-left: calc(var(--key) * 0.8); }

/* Each key is tinted with its finger's color (game.js sets --finger). */
.key {
  position: relative;
  width: var(--key);
  height: var(--key);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--key) * 0.32);
  color: #fff;
  background: color-mix(in srgb, var(--finger) 45%, #333);
  border-bottom: 4px solid rgba(0, 0, 0, 0.5);
}

/* F and J have a little bump, like on a real keyboard. */
.key.bump::after {
  content: '';
  position: absolute;
  bottom: 18%;
  width: 30%;
  height: 3px;
  background: rgba(255, 255, 255, 0.8);
}

/* The key to press: full finger color, big and bright. */
.key.target {
  background: var(--finger);
  outline: 4px solid #fff;
  transform: scale(1.12);
  z-index: 1;
}

/* A wrong key flashes gray, so Caleb can see where he was. */
.key.wrong { background: #bbb; }

/* ---- The hands ---- */
.hands {
  display: flex;
  gap: 48px;
}

.hand {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.finger {
  width: 22px;
  height: 64px;
  background: var(--finger);
  border-bottom: 6px solid rgba(0, 0, 0, 0.35);
  opacity: 0.5;
}
.finger.middle  { height: 76px; }
.finger.ring    { height: 68px; }
.finger.pinky   { height: 52px; }
.finger.thumb   { height: 36px; }

/* The finger to use: full color, lifted up. */
.finger.target {
  opacity: 1;
  outline: 4px solid #fff;
  transform: translateY(-10px);
}

/* ---- The start sign ---- */
.start {
  position: fixed;
  inset: 0;
  font-family: var(--pixel-font);
  font-size: clamp(16px, 4vw, 28px);
  line-height: 1.6;
  color: #fff;
  text-shadow: 3px 3px 0 rgba(0, 0, 0, 0.5);
  background: rgba(18, 11, 28, 0.85);
  border: none;
  cursor: pointer;
}
.start[hidden] { display: none; }

/* ---- Wobble and cheer ----
   The glowing block already has an animation (pulse), so a wrong key's
   shake must be named here too, or the pulse would win. */
.wall-block.target.shake { animation: shake 400ms; }
.level.cheer { animation: cheer 600ms ease-out; }

/* Some people's devices ask for less movement. Broken blocks just vanish. */
@media (prefers-reduced-motion: reduce) {
  .wall-block.target,
  .wall-block.target.shake,
  .level.cheer { animation: none; }
  .wall-block.broken { animation: none; opacity: 0; }
}
```

- [ ] **Step 5: Write** `type.html`:

```html
<!DOCTYPE html>
<!--
  type.html: the typing game. Break letter blocks by finding their keys
  on a real keyboard.

  At the top: 🏠 and a strip of level blocks (js/type/game.js fills it).
  In the middle: the wall of letter blocks. At the bottom: a drawing of
  the keyboard and two hands that light up the key and finger to use.
  The "press a key to start" sign covers everything until Caleb presses
  a key or taps it, because iPads only allow sound after that.
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Typing · Caleb's Blocky World</title>
  <!-- Icons: the browser tab, the iPad home screen, and old browsers.
       All drawn from img/icon-pixels.txt by tools/make-icons.js. -->
  <link rel="icon" href="favicon.ico" sizes="32x32">
  <link rel="icon" href="img/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="img/apple-touch-icon.png">
  <!-- The app manifest lets the site be added to the home screen and open
       full-screen like an app (see manifest.webmanifest). -->
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#7ec8ff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Caleb">
  <meta name="description" content="Caleb's blocky corner of the internet: music blocks with chords and scales, drawing, and print and cursive handwriting practice.">
  <!-- Sharing previews: the card that shows up when the link is texted or
       posted. These must be full https:// addresses, not "img/...". -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Caleb's Blocky World">
  <meta property="og:title" content="Typing · Caleb's Blocky World">
  <meta property="og:description" content="Caleb's blocky corner of the internet: music blocks with chords and scales, drawing, and print and cursive handwriting practice.">
  <meta property="og:url" content="https://calebhamsa.fun/type.html">
  <meta property="og:image" content="https://calebhamsa.fun/img/share-card.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="HI, I'M CALEB! with music, draw and write blocks on grass">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- crossorigin lets the offline helper (sw.js) save this, so the font works offline too. -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" crossorigin>
  <link rel="stylesheet" href="css/blocks.css">
  <link rel="stylesheet" href="css/type.css">
</head>
<body class="type-page">
  <header class="top-bar">
    <a class="block home" href="index.html" aria-label="Home">🏠</a>
    <h1 class="page-title">⌨️ TYPING</h1>
  </header>

  <main class="type-main">
    <!-- game.js fills this: one block per level. -->
    <nav class="toolbar levels" id="levels" aria-label="Levels"></nav>

    <!-- The wall of letter blocks to break. -->
    <div class="wall" id="wall" aria-live="polite"></div>

    <!-- A picture of the keyboard and two hands (not buttons: use the real keyboard!). -->
    <div class="keyboard" id="keyboard" aria-hidden="true"></div>
    <div class="hands" id="hands" aria-hidden="true"></div>
  </main>

  <!-- The start sign. Pressing a key or tapping it closes it. -->
  <button class="start" id="start">⌨️ Press a key to start!</button>

  <script type="module">
    import { initType } from './js/type/game.js';
    initType();
    import { registerServiceWorker } from './js/pwa.js';
    registerServiceWorker(); // the offline helper (see js/pwa.js)
  </script>
</body>
</html>
```

- [ ] **Step 6: Add the page to the offline helper.** In `sw.js`, change `const CACHE_NAME = 'caleb-v8';` to `const CACHE_NAME = 'caleb-v9';`. Then add these lines to `PRECACHE`, directly after the line `'./js/chem/save.js',`:
```js
  './type.html',
  './css/type.css',
  './js/type/levels.js',
  './js/type/wall.js',
  './js/type/progress.js',
  './js/type/game.js',
```

- [ ] **Step 7: Add the homepage block and favorite.** In `index.html`, after the CHEMISTRY block line (`<a class="block big chem" href="chem.html">…`), add:
```html
      <a class="block big obsidian" href="type.html"><span class="icon">⌨️</span>TYPING</a>
```
In the favorites list, after `<li><a href="chem.html">🧪 making molecules</a></li>`, add:
```html
        <li><a href="type.html">⌨️ finding the keys</a></li>
```
In the header comment at the top of `index.html`, change `a big title, four blocks that link` to `a big title, six blocks that link` (it was already out of date). In `README.md`, change the `index.html` row's `five big blocks` to `six big blocks`.

- [ ] **Step 8: README rows.** In `README.md`'s "What's where" table, add after the `chem.html` row:
```markdown
| `type.html` | The Typing game layout |
| `css/type.css` | How the Typing game looks: the wall, keyboard and hands |
```
and after the `js/chem/save.js` row:
```markdown
| `js/type/game.js` | Makes the Typing game work: keys, sounds, the wall, the keyboard picture |
| `js/type/levels.js` | Which keys each level teaches, and which finger presses each key (pure) |
| `js/type/wall.js` | The Typing game's rules: building walls, hits and misses (pure) |
| `js/type/progress.js` | Keeps the Typing game's stars saved |
```

- [ ] **Step 9: Run the whole test suite**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 0`.

- [ ] **Step 10: Hands-on check in a real browser.** Start a server with `python3 -m http.server 8765` and `run_in_background: true`. Don't start and kill it in the same command, and stop it later with a bracket pattern such as `pkill -f "http.serve[r] 8765"`. Then save this script to the scratchpad as `smoke.cjs` and run `NODE_PATH=~/LFG/scripts/share_card/node_modules node smoke.cjs http://localhost:8765/type.html <scratchpad>`:

```js
// Smoke test for type.html: start, wrong key, clear a wall, reload keeps stars.
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:8765/type.html';
  const out = process.argv[3] || '.';
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['ipad', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.wall-block');
    // The start sign is up; the first key only closes it.
    await page.keyboard.press('f');
    if (!(await page.locator('#start').isHidden())) throw new Error('start sign still showing');
    if (await page.locator('.wall-block.broken').count() !== 0) throw new Error('start key counted as a hit');
    // A wrong key wobbles the target block.
    const target = await page.locator('.wall-block.target').textContent();
    const wrong = target === 'F' ? 'j' : 'f';
    await page.keyboard.press(wrong);
    if (!(await page.locator('.wall-block.target.shake').count())) throw new Error('no shake on a miss');
    if (!(await page.locator(`.key.wrong[data-key="${wrong.toUpperCase()}"]`).count())) throw new Error('wrong key not flashed');
    // Shortcuts and held keys don't count.
    await page.keyboard.press('Meta+f');
    if (await page.locator('.wall-block.broken').count() !== 0) throw new Error('shortcut counted');
    // The key and the finger for the target are lit.
    if (!(await page.locator(`.key.target[data-key="${target}"]`).count())) throw new Error('target key not lit');
    if (await page.locator('.finger.target').count() !== 1) throw new Error('not exactly one finger lit');
    // Clear the wall.
    const letters = await page.locator('.wall-block').allTextContents();
    for (const letter of letters) await page.keyboard.press(letter.toLowerCase());
    await page.waitForTimeout(900);
    const stars = await page.locator('#levels .level').first().locator('.stars').textContent();
    if (!stars.startsWith('⭐')) throw new Error(`no star after a wall: ${stars}`);
    if (await page.locator('.wall-block.broken').count() !== 0) throw new Error('new wall not drawn');
    await page.screenshot({ path: `${out}/type-${name}.png`, fullPage: true });
    // Reload: the star is still there.
    await page.reload();
    await page.waitForSelector('.wall-block');
    const after = await page.locator('#levels .level').first().locator('.stars').textContent();
    if (!after.startsWith('⭐')) throw new Error('star lost on reload');
    // No sideways scrolling.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (wide) throw new Error(`${name}: page scrolls sideways`);
    await page.close();
    console.log(`${name}: ok`);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS', errors); process.exit(1); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
```
Expected: `desktop: ok`, `ipad: ok`, `phone: ok`. Look at `type-ipad.png`: one row of 13 level blocks, then 8 letter blocks with the first one gold, a colored keyboard with the target key outlined, and two hands with one finger lifted. Also load `http://localhost:8765/index.html` and check the ⌨️ TYPING block is there.

- [ ] **Step 11: Commit**

```bash
git add type.html css/type.css js/type/game.js sw.js index.html README.md tests/pages.test.js tests/sw.test.js tests/modules.test.js
git commit -m "⌨️ Typing game: break letter blocks by finding their keys. The key glows on a drawn keyboard and the finger to use lifts on a pair of hands. A wrong key wobbles, and a clear wall earns a star. Works offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wiki page

**Files:**
- Create: `wiki/Typing.md`
- Modify: `wiki/Home.md`, `wiki/_Sidebar.md`, `tests/wiki.test.js` (`PAGES`)

- [ ] **Step 1: Make the wiki test expect the page.** In `tests/wiki.test.js`, add `'Typing'` to `PAGES` after `'Chemistry-room'`:
```js
const PAGES = ['Home', 'Blocks', 'Water', 'Power', 'Gears', 'Lifting', 'Machines-to-build', 'Chemistry-room', 'Typing', 'Experiments'];
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/wiki.test.js`
Expected: FAIL with `missing wiki/Typing.md` and `_Sidebar doesn't link to Typing`.

- [ ] **Step 3: Write** `wiki/Typing.md`:

```markdown
The ⌨️ Typing game teaches **where the keys are** on a real keyboard (a
keyboard on the iPad, or a computer). Letter blocks make a wall. Press the
key for the glowing block and it breaks!

- **The glowing block** is the one to break. Its letter is said out loud.
- **The keyboard picture** lights up the same key, in the color of the
  finger to press it with. F and J have little bumps, just like on a real
  keyboard: rest your pointer fingers there.
- **The hands** show which finger to use: it lifts up and glows.
- **A wrong key** makes the block wobble, and the key you pressed flashes
  gray so you can see where your finger was. Try again: there's no timer
  and no losing.
- **Clear the wall** to earn a ⭐. Three ⭐ finish a level and open the next one.
  You can tap any open level at the top to play it again.

## The levels

Each level adds a few new keys, and keeps the ones you already know.

| Level | New keys |
|---|---|
| 1 | F J |
| 2 | D K |
| 3 | S L |
| 4 | A |
| 5 | G H |
| 6 | R U |
| 7 | E I |
| 8 | T Y |
| 9 | W O |
| 10 | Q P |
| 11 | V M |
| 12 | C |
| 13 | X Z B N |

## Which finger?

| Finger | Left hand | Right hand | Color |
|---|---|---|---|
| Pointer | F G R T V B | J H U Y N M | 🟩 green |
| Middle | D E C | K I | 🟦 blue |
| Ring | S W X | L O | 🟪 purple |
| Pinky | A Q Z | P | 🟧 orange |

## 🧪 Try this

- Make the walls shorter or longer: change `WALL_SIZE` in `js/type/wall.js`.
- Change the order keys are taught: swap lines in `LEVELS` in `js/type/levels.js`.
- Change the sounds: the note numbers at the top of `js/type/game.js`.
```

- [ ] **Step 4: Link it.** In `wiki/_Sidebar.md`, after `- [🧪 Chemistry room](Chemistry-room)`, add:
```markdown
- [⌨️ Typing](Typing)
```
In `wiki/Home.md`, after the line `- **[🧪 The Chemistry room](Chemistry-room)**: build molecules out of atoms.`, add:
```markdown
- **[⌨️ Typing](Typing)**: find the keys on a real keyboard by breaking letter blocks.
```
and in line 4 change `🧪 Chemistry room works, and experiments` to `🧪 Chemistry room and ⌨️ Typing game work, and experiments`.

- [ ] **Step 5: Run it to see it pass**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add wiki/Typing.md wiki/Home.md wiki/_Sidebar.md tests/wiki.test.js
git commit -m "Wiki: how to play the Typing game, the level order, and which finger presses which key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ship it

- [ ] **Step 1: Run everything one last time.** `npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"` should show `# fail 0`.
- [ ] **Step 2: Push.** `git push origin main`. GitHub Pages publishes it, and the wiki workflow copies `wiki/`.
- [ ] **Step 3: Check the live site.** After about 1–2 minutes, `curl -s https://calebhamsa.fun/type.html | grep -c "initType"` should print `1`, and `curl -s https://calebhamsa.fun/sw.js | grep caleb-v9` should match. Then run the smoke script against `https://calebhamsa.fun/type.html`.
- [ ] **Step 4: Hand off.** Tell the user it's live at https://calebhamsa.fun/type.html and that the final check is Caleb on the iPad with its keyboard.
