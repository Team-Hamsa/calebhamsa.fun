# Block Playground Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `build.html`: a side-view 24 × 14 block world where Caleb builds, digs, drops falling sand, and plays singing note blocks. It has three autosaving worlds, a 📷 picture button, and a pack/system engine that phases 2–5 will plug into.

**Architecture:**
- **Pure modules, testable by `npm test` with no DOM:**
  - `world.js` — the grid
  - `blocks/registry.js` + `blocks/basic.js` — block packs and their whole-world systems
  - `saves.js` — save format and storage
  - `block-art.js` — canvas drawing that only calls `fillRect` / `strokeRect` / `fillText`
- **One page module:** `build.js` wires them to a `<canvas>`, the toolbars, a tick timer and localStorage.
- **Shared helpers move out of the files they live in now:**
  - sound: `music.js` → `sound.js`
  - grid line + filename: `draw.js` → `ui.js`

**Tech Stack:** Vanilla ES modules, Canvas 2D, Pointer Events, Web Audio, localStorage, Node 20 `node --test`, Playwright (borrowed from `~/LFG`) for the browser check.

**Spec:** `docs/superpowers/specs/2026-10-02-block-playground-design.md`

## Global Constraints

- **No dependencies:** vanilla HTML/CSS/JS, ES modules, no build step. `package.json` gains no `dependencies` / `devDependencies`.
- **Our own art:** blocky look, no Mojang textures, names, or logos. The word "Minecraft" never appears in site content.
- **Comments:** every file starts with a plain-language header comment. Every named function has a JSDoc docstring directly above it (`tests/docs.test.js` enforces this). Tweakable values get a 🧪 "Try this!" comment.
- **Importable in Node:** page code touches the DOM only inside `init…()` and the functions it calls. Every module must import cleanly in Node (`tests/modules.test.js`).
- **Relative paths** only (no leading `/`).
- **World size:** 24 × 14 (`WORLD_WIDTH`, `WORLD_HEIGHT`), with y = 0 at the **top**.
- **Storage keys:**
  - `calebhamsa.build.world.N` (N = 1–3)
  - `calebhamsa.build.world.N.thumb`
  - `calebhamsa.build.current`
- **Note blocks:** C D E F G A B = MIDI 60 62 64 65 67 69 71. Colors match `css/blocks.css`:
  - C `#e53935`, D `#fb8c00`, E `#fdd835`, F `#43a047`
  - G `#1e88e5`, A `#5e35b1`, B `#d81b60`
- **Git:**
  - Repo `Team-Hamsa/calebhamsa.fun`.
  - Commit to `main` locally, task by task; push once at the end (Task 10). Pushing deploys the live site.
  - **No `Co-Authored-By` trailers or AI attribution in commit messages** (user's global rule).

## Review Focus

1. **A second finger or resting palm while building:** only the first finger builds. Pinned by the two-finger touch check in Task 10 (Chromium CDP).
2. **Storage blocked or full (private browsing, Safari "block all cookies"):** playing continues, the "can't save here" badge shows, nothing throws. Pinned by throwing-storage tests in Task 5. `build.js` wraps even the `localStorage` lookup itself (Task 8).
3. **Strange saved data** (hand-edited, from a future version, cell indexes pointing past the `blocks` list, wrong cell count): no crash; unreadable → fresh world, bad cells → air. Pinned by Task 5 tests.
4. **Rotating the iPad / resizing mid-build:** the canvas re-fits, the world is unchanged, and taps still land on the cell under the finger. Pinned by the `fitCellSize` tests (Task 7) and the resize-then-tap check (Task 10).
5. **A fast swipe in BUILD or DIG:** no skipped cells. Pinned by the existing `cellsAlongLine` tests (moved in Task 1) and the drag check in Task 10.

---

### Task 1: Move shared grid/filename helpers into ui.js; docs test covers subfolders

**Files:**
- Modify: `js/ui.js` (add `cellsAlongLine`, `filenameForDate`; update header)
- Modify: `js/draw.js` (delete those two functions and import them from `ui.js`)
- Modify: `tests/draw.test.js:10` (import from `ui.js`; one new test)
- Modify: `tests/docs.test.js` (scan `js/` recursively, so `js/blocks/*.js` is checked)
- Modify: `README.md:34` (ui.js description)

**Interfaces:**
- Produces:
  - `cellsAlongLine(x0, y0, x1, y1, cell) → Array<[col, row]>` (unchanged behavior)
  - `filenameForDate(date, kind = 'drawing') → string`, e.g. `'caleb-build-2026-10-02.png'`

- [ ] **Step 1: Write the failing test**

In `tests/draw.test.js` change line 10 to:

```js
import { cellsAlongLine, filenameForDate } from '../js/ui.js';
```

and add at the end:

```js
test('other pages can name their pictures too', () => {
  assert.equal(filenameForDate(new Date(2026, 9, 2), 'build'), 'caleb-build-2026-10-02.png');
});
```

Also update its header comment: "…two pieces are pure math we can check here (they live in ui.js, shared with the Build page)…".

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/draw.test.js`
Expected: FAIL — `SyntaxError: The requested module '../js/ui.js' does not provide an export named 'cellsAlongLine'`

- [ ] **Step 3: Move the helpers**

1. Cut `cellsAlongLine` (with its docstring) and `filenameForDate` (with its docstring and inner `twoDigits`) out of `js/draw.js`. Delete the now-empty "Pure math" section header there.
2. Paste them at the end of `js/ui.js` under a new section comment `// ---- Grid and file helpers (draw.js and build.js use these) ----`.
3. Change `filenameForDate`:

```js
/**
 * The filename for a saved picture, like "caleb-drawing-2026-10-02.png".
 * @param {Date} date - when it was saved
 * @param {string} [kind] - what the picture is of: 'drawing' or 'build'
 * @returns {string} the filename
 */
export function filenameForDate(date, kind = 'drawing') {
  /**
   * Write a number with at least two digits.
   * @param {number} n - a month or day
   * @returns {string} e.g. 5 → "05", 12 → "12"
   */
  const twoDigits = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1); // getMonth() counts from 0!
  const day = twoDigits(date.getDate());
  return `caleb-${kind}-${year}-${month}-${day}.png`;
}
```

4. In `js/draw.js` change the import line to:

```js
import { cellsAlongLine, choose, filenameForDate, flash } from './ui.js';
```

5. Update the `js/ui.js` header comment to: "ui.js — small helpers that every page borrows: choosing and flashing buttons, the squares a finger-swipe passes through, and picture filenames."
6. In `README.md` change the `js/ui.js` row to `| \`js/ui.js\` | Little helpers every page shares (buttons, grid swipes, picture names) |`.

- [ ] **Step 4: Make the docs test look inside subfolders**

In `tests/docs.test.js` replace the `js/` line in `FILES` with:

```js
  // recursive: also js/blocks/ (the Build page's block packs)
  ...readdirSync(new URL('js/', ROOT), { recursive: true }).map((name) => `js/${name}`),
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail (one more test than before).

- [ ] **Step 6: Commit**

```bash
git add js/ui.js js/draw.js tests/draw.test.js tests/docs.test.js README.md
git commit -m "Move cellsAlongLine and filenameForDate into ui.js for sharing"
```

---

### Task 2: Extract the sound machine into js/sound.js

**Files:**
- Create: `js/sound.js`
- Modify: `js/music.js` (delete the audio constants and functions; import from `sound.js`)
- Modify: `tests/modules.test.js` (add `sound.js`)
- Modify: `README.md` (file table row; "Long notes" tip now points at `js/sound.js`)

**Interfaces:**
- Consumes: `midiToFrequency(midi)` from `js/music-theory.js`
- Produces (all exported from `js/sound.js`):
  - `VOICES` — `{ soft: { wave: 'sine', volume: 0.3 }, beep: { wave: 'square', volume: 0.1 }, bell: { wave: 'triangle', volume: 0.3 } }`
  - `getAudio() → AudioContext`
  - `listenForUnlock() → void` — adds the first-tap unlock listeners to `document`
  - `playTones(midis: number[], voice = VOICES.soft) → void`

- [ ] **Step 1: Write the failing test**

In `tests/modules.test.js` change `MODULES` to:

```js
const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js', 'trace.js', 'pwa.js', 'sound.js'];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/modules.test.js`
Expected: FAIL — `js/sound.js loads` with `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Create js/sound.js**

Copy the bodies **exactly** from the current `music.js` (lines ~25–39, 72–76, 162–163 and 410–482). The only real change is that `playTones` takes the voice as a parameter instead of reading `state.voice`.

```js
/**
 * sound.js — the sound machine every page shares.
 *
 * It makes notes with the browser's Web Audio API (no sound files!).
 * The Note Blocks page and the Build page's singing note blocks both
 * play through here, so they sound the same.
 */
import { midiToFrequency } from './music-theory.js';

/**
 * How long each note rings, in seconds.
 * 🧪 Try this! 0.2 for short "plinks", 3 for long dreamy notes.
 */
const NOTE_SECONDS = 0.9;

/**
 * How long a note takes to fade in, in seconds.
 * If a sound starts at full loudness instantly, the speaker has to jump
 * all at once and you hear a "click". A tiny fade-in smooths it out.
 * 🧪 Try this! Set it to 0 and listen for the click. Try 0.5 for a slow "swell".
 */
const ATTACK_SECONDS = 0.01;

/** The kinds of taps that browsers accept as "yes, you may make sound" (see unlockAudio). */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/**
 * The three voices. `wave` is the shape of the sound wave:
 *
 *   sine      ∿∿∿∿   smooth and round: a pure, soft tone
 *   square    ⊓⊔⊓⊔   jumps straight up and down: buzzy, like old video games
 *   triangle  /\/\   pointy: in between, a bit like a bell or a flute
 *
 * Square waves sound much louder, so that voice gets a smaller volume.
 * 🧪 Try this! Add  saw: { wave: 'sawtooth', volume: 0.15 },  and a button in music.html.
 */
export const VOICES = {
  soft: { wave: 'sine', volume: 0.3 },
  beep: { wave: 'square', volume: 0.1 },
  bell: { wave: 'triangle', volume: 0.3 },
};

/** The browser's sound machine. Made on the first tap (see getAudio). */
let audioContext = null;

/**
 * Get the browser's sound machine, making it the first time.
 *
 * Browsers don't let a page make sound until the person has tapped or
 * clicked something, so websites can't suddenly blare at you. That's why
 * we only make the AudioContext inside a tap, and "resume" it in case
 * the browser paused it.
 *
 * @returns {AudioContext} the sound machine
 */
export function getAudio() {
  if (!audioContext) audioContext = new AudioContext();
  // Not just 'suspended': iPads also say 'interrupted' after the screen
  // locks or a phone call, and we want sound back after either.
  if (audioContext.state !== 'running') audioContext.resume();
  return audioContext;
}

/**
 * Wake up the sound machine on Caleb's first real tap.
 *
 * Browsers only allow sound after certain kinds of taps: a finger lifting
 * off (pointerup or touchend), a click, or a key press. Blocks play on
 * pointerdown, the instant a finger lands, and some tablets don't count
 * that. So these events also wake the sound machine, and once it's
 * running they stop listening.
 * @returns {void}
 */
function unlockAudio() {
  if (getAudio().state === 'running') {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio);
  }
}

/**
 * Start listening for the first tap that unlocks sound (see unlockAudio).
 * Each page calls this once when it starts.
 * @returns {void}
 */
export function listenForUnlock() {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio);
}

/**
 * Make the sound of one or more notes at the same time.
 *
 * For each note we build a tiny chain, like plugging in guitar pedals:
 *
 *   oscillator (makes the wave) → gain (volume knob) → speakers
 *
 * The volume knob turns up quickly (ATTACK_SECONDS), then fades away
 * over NOTE_SECONDS, which sounds like a plucked or struck note.
 *
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @param {{wave: string, volume: number}} [voice] - one of the VOICES
 * @returns {void}
 */
export function playTones(midis, voice = VOICES.soft) {
  const audio = getAudio();
  // Three notes at full volume would be three times as loud, so chords
  // share the loudness between their notes.
  const volume = voice.volume / Math.sqrt(midis.length);
  const start = audio.currentTime;

  for (const midi of midis) {
    const oscillator = audio.createOscillator();
    oscillator.type = voice.wave;
    oscillator.frequency.value = midiToFrequency(midi);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + ATTACK_SECONDS);
    // "exponential" fades sound natural to our ears. It can't reach exactly
    // 0, so we fade to a tiny 0.0001 instead.
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS);

    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + NOTE_SECONDS);
  }
}
```

- [ ] **Step 4: Slim down music.js**

1. Delete from `js/music.js`:
   - the `NOTE_SECONDS`, `ATTACK_SECONDS`, `UNLOCK_EVENTS` and `VOICES` constants (with their comments)
   - `let audioContext = null;` and its comment
   - the `getAudio` and `unlockAudio` functions
   - the old body of `soundNotes`
2. Remove `midiToFrequency` from its `music-theory.js` import list, and add:

```js
import { VOICES, listenForUnlock, playTones } from './sound.js';
```

3. Replace `soundNotes` with:

```js
/**
 * Make the sound of one or more notes at the same time (no lights),
 * in the voice Caleb picked (see VOICES in sound.js).
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function soundNotes(midis) {
  playTones(midis, VOICES[state.voice]);
}
```

4. In `initMusic()` replace `for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio);` with `listenForUnlock();`.
5. Update the header's point 3 to: `3. makes sounds through sound.js (the Web Audio API, no sound files!),`.
6. Check nothing is left behind:

Run: `grep -n "NOTE_SECONDS\|ATTACK_SECONDS\|UNLOCK_EVENTS\|audioContext\|getAudio\|unlockAudio\|midiToFrequency" js/music.js`
Expected: no output.

7. `README.md`:
   - Add the row `| \`js/sound.js\` | The shared sound machine: voices and playing notes |` after the `js/music.js` row.
   - Change tip 3 to: ``**Long notes:** in `js/sound.js`, set `NOTE_SECONDS` to 3.``

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. This includes `js/sound.js loads`, the docstring check for `sound.js`, and the unchanged keyboard tests.

- [ ] **Step 6: Commit**

```bash
git add js/sound.js js/music.js tests/modules.test.js README.md
git commit -m "Move the sound machine into js/sound.js so other pages can play notes"
```

---

### Task 3: The world grid (js/world.js)

**Files:**
- Create: `js/world.js`
- Create: `tests/world.test.js`
- Modify: `tests/modules.test.js` (add `'world.js'`)

**Interfaces:**
- Produces:
  - Constants: `AIR = 'air'`, `EDGE = 'stone'`, `WORLD_WIDTH = 24`, `WORLD_HEIGHT = 14`, `GROUND_DEPTH = 4`
  - Type: `World = { width: number, height: number, cells: string[] }` (`cells[y * width + x]`)
  - `createWorld(width, height) → World` (all air)
  - `defaultWorld(width = 24, height = 14) → World` — sky, then grass (row `height-4`), dirt (`height-3`), stone (`height-2`, `height-1`)
  - `inBounds(world, x, y) → boolean`
  - `getBlock(world, x, y) → string` — returns `EDGE` when out of bounds
  - `setBlock(world, x, y, name) → boolean` — true only if the cell actually changed; out of bounds → false
  - `neighbors(world, x, y) → Array<{x, y}>` — in-bounds cells, in the order up, right, down, left
  - `tick(world, systems, blockInfo) → boolean` — runs **every** system in order; true if any changed something
  - `System = (world: World, blockInfo: (name) => object|undefined) => boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/world.test.js`:

```js
/**
 * world.test.js — checks the block world: the grid every Build-page
 * block lives in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, EDGE, WORLD_HEIGHT, WORLD_WIDTH, createWorld, defaultWorld, getBlock,
  inBounds, neighbors, setBlock, tick,
} from '../js/world.js';

test('a new world is all air', () => {
  const world = createWorld(3, 2);
  assert.equal(world.width, 3);
  assert.equal(world.height, 2);
  assert.deepEqual(world.cells, [AIR, AIR, AIR, AIR, AIR, AIR]);
});

test('setBlock puts a block where getBlock finds it, counting y from the top', () => {
  const world = createWorld(3, 2);
  assert.equal(setBlock(world, 2, 1, 'gold'), true);
  assert.equal(getBlock(world, 2, 1), 'gold');
  assert.equal(world.cells[1 * 3 + 2], 'gold');
});

test('setBlock says false when nothing changed', () => {
  const world = createWorld(3, 2);
  setBlock(world, 0, 0, 'dirt');
  assert.equal(setBlock(world, 0, 0, 'dirt'), false);
});

test('outside the world reads as solid stone, and writing there does nothing', () => {
  const world = createWorld(3, 2);
  assert.equal(getBlock(world, -1, 0), EDGE);
  assert.equal(getBlock(world, 0, 2), EDGE);
  assert.equal(setBlock(world, 3, 0, 'gold'), false);
  assert.equal(setBlock(world, 1.5, 0, 'gold'), false);
  assert.ok(world.cells.every((name) => name === AIR));
});

test('inBounds only accepts whole numbers inside the grid', () => {
  const world = createWorld(3, 2);
  assert.equal(inBounds(world, 0, 0), true);
  assert.equal(inBounds(world, 2, 1), true);
  assert.equal(inBounds(world, 3, 1), false);
  assert.equal(inBounds(world, 0, -1), false);
  assert.equal(inBounds(world, 0.5, 0), false);
});

test('neighbors: up, right, down, left, skipping the outside', () => {
  const world = createWorld(3, 3);
  assert.deepEqual(neighbors(world, 1, 1), [{ x: 1, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 1 }]);
  assert.deepEqual(neighbors(world, 0, 0), [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
});

test('the default world: sky, then one grass row, one dirt row, and stone to the bottom', () => {
  const world = defaultWorld();
  assert.equal(world.width, WORLD_WIDTH);
  assert.equal(world.height, WORLD_HEIGHT);
  for (let x = 0; x < WORLD_WIDTH; x++) {
    assert.equal(getBlock(world, x, 9), AIR);
    assert.equal(getBlock(world, x, 10), 'grass');
    assert.equal(getBlock(world, x, 11), 'dirt');
    assert.equal(getBlock(world, x, 12), 'stone');
    assert.equal(getBlock(world, x, 13), 'stone');
  }
});

test('tick runs every system in order and says whether anything changed', () => {
  const world = createWorld(2, 2);
  const order = [];
  const quiet = () => { order.push('quiet'); return false; };
  const busy = () => { order.push('busy'); return true; };
  assert.equal(tick(world, [busy, quiet], () => undefined), true);
  assert.deepEqual(order, ['busy', 'quiet']); // quiet still ran after busy changed things
  assert.equal(tick(world, [quiet], () => undefined), false);
});

test('tick hands each system the world and the block lookup', () => {
  const world = createWorld(2, 2);
  const lookup = () => ({ falls: true });
  let seen = null;
  tick(world, [(w, info) => { seen = [w, info]; return false; }], lookup);
  assert.equal(seen[0], world);
  assert.equal(seen[1], lookup);
});
```

Add `'world.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/world.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/world.js`

- [ ] **Step 3: Write js/world.js**

```js
/**
 * world.js — the block world: a grid of block names.
 *
 * The world is a big list of names like 'grass', 'sand' or 'air'
 * (empty). Row 0 is the TOP (the sky); the last row is the bottom.
 *
 *        x →  0     1     2   ...
 *   y  0   [air] [air] [air]
 *   ↓  1   [air] [sand][air]
 *      2   [grass][grass][grass]
 *
 * This file doesn't know what any block DOES. That lives in the block
 * packs (js/blocks/). So adding new kinds of blocks never changes this file.
 */

/** The name of an empty cell. */
export const AIR = 'air';

/** What the outside of the world counts as: solid, so sand lands on the floor. */
export const EDGE = 'stone';

/**
 * How many blocks wide and tall the world is.
 * 🧪 Try this! 32 × 18 for smaller blocks and more room (old saves still load).
 */
export const WORLD_WIDTH = 24;
export const WORLD_HEIGHT = 14;

/**
 * How many rows of ground a new world starts with: grass, dirt, then stone.
 * 🧪 Try this! 8 for a deep underground to dig into.
 */
export const GROUND_DEPTH = 4;

/**
 * Make an empty world: every cell is air.
 * @param {number} width - how many blocks across
 * @param {number} height - how many blocks down
 * @returns {{width: number, height: number, cells: string[]}} the world
 */
export function createWorld(width, height) {
  return { width, height, cells: new Array(width * height).fill(AIR) };
}

/**
 * Make the world Caleb starts with: sky on top, then a row of grass,
 * a row of dirt, and stone down to the bottom.
 * @param {number} [width] - how many blocks across
 * @param {number} [height] - how many blocks down
 * @returns {{width: number, height: number, cells: string[]}} the world
 */
export function defaultWorld(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  const world = createWorld(width, height);
  const grassRow = height - GROUND_DEPTH;
  for (let x = 0; x < width; x++) {
    setBlock(world, x, grassRow, 'grass');
    setBlock(world, x, grassRow + 1, 'dirt');
    for (let y = grassRow + 2; y < height; y++) setBlock(world, x, y, 'stone');
  }
  return world;
}

/**
 * Is this spot inside the world? (Whole numbers only: no half-blocks.)
 * @param {{width: number, height: number}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @returns {boolean} true if it's a real cell
 */
export function inBounds(world, x, y) {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < world.width && y < world.height;
}

/**
 * What block is at this spot? Outside the world counts as EDGE (stone),
 * so the walls and floor act solid.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @returns {string} the block's name
 */
export function getBlock(world, x, y) {
  return inBounds(world, x, y) ? world.cells[y * world.width + x] : EDGE;
}

/**
 * Put a block at this spot. Outside the world, nothing happens.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} x - column, 0 = left
 * @param {number} y - row, 0 = top
 * @param {string} name - the block to put there ('air' to empty it)
 * @returns {boolean} true if the cell really changed
 */
export function setBlock(world, x, y, name) {
  if (!inBounds(world, x, y)) return false;
  const index = y * world.width + x;
  if (world.cells[index] === name) return false;
  world.cells[index] = name;
  return true;
}

/**
 * The cells touching this one (up, right, down, left), skipping any
 * that are outside the world.
 * @param {{width: number, height: number}} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {Array<{x: number, y: number}>} the touching cells
 */
export function neighbors(world, x, y) {
  return [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter((spot) => inBounds(world, spot.x, spot.y));
}

/**
 * One tick of the world's clock: let every "system" (a rule like "sand
 * falls") have a turn, in order. Each system changes the world and says
 * true if it changed anything.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {Function[]} systems - (world, blockInfo) => boolean, run in this order
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any system changed the world
 */
export function tick(world, systems, blockInfo) {
  let changed = false;
  for (const system of systems) {
    // Run the system FIRST, so a change from an earlier one never skips it.
    changed = system(world, blockInfo) || changed;
  }
  return changed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/world.js tests/world.test.js tests/modules.test.js
git commit -m "Add the block world grid (world.js)"
```

---

### Task 4: Basic block pack + registry (falling sand, note blocks)

**Files:**
- Create: `js/blocks/basic.js`
- Create: `js/blocks/registry.js`
- Create: `tests/basic.test.js`
- Create: `tests/registry.test.js`
- Modify: `tests/modules.test.js` (add `'blocks/basic.js'`, `'blocks/registry.js'`)

**Interfaces:**
- Consumes: `AIR`, `getBlock`, `setBlock`, `createWorld`, `tick` from `js/world.js`
- Produces:
  - **`js/blocks/basic.js`:**
    - `NOTE_BLOCKS: Array<{name, label, midi, color}>`
    - `fallingBlocks: System`
    - `default: Pack`
  - **Pack shape:** `{ tab: { id, icon, label }, blocks: { [name]: BlockDef }, systems: System[] }`
  - **BlockDef fields (phase 1):**
    - `title` (string, used for the aria-label)
    - `color` (`#rrggbb`)
    - `topColor?` (`#rrggbb`)
    - `label?`, `midi?`, `falls?`, `seeThrough?`
    - `use?(ctx)`, where `ctx = { world, x, y, playNote(midi), flash() }`
  - **`js/blocks/registry.js`:**
    - `PACKS`, `SIGNALS = { POWER: 'power', SPIN: 'spin' }`
    - `AIR_INFO = { name: 'air', title: 'Air', color: '#7ec8ff' }`
    - `blockInfo(name) → BlockDef & { name, pack } | undefined`
    - `isKnownBlock(name) → boolean`
    - `allSystems() → System[]`
    - `blocksInPack(id) → string[]` (in palette order)

- [ ] **Step 1: Write the failing tests**

Create `tests/basic.test.js`:

```js
/**
 * basic.test.js — checks the ⛏️ basic blocks: sand falls, everything
 * else floats, and note blocks know their notes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, getBlock, setBlock, tick } from '../js/world.js';
import basic, { NOTE_BLOCKS, fallingBlocks } from '../js/blocks/basic.js';
import { blockInfo } from '../js/blocks/registry.js';

/**
 * Run the falling rule once.
 * @param {object} world - the world
 * @returns {boolean} whether anything moved
 */
const fall = (world) => tick(world, [fallingBlocks], blockInfo);

test('sand falls one block per tick until it hits the floor', () => {
  const world = createWorld(3, 4);
  setBlock(world, 1, 0, 'sand');
  assert.equal(fall(world), true);
  assert.equal(getBlock(world, 1, 0), AIR);
  assert.equal(getBlock(world, 1, 1), 'sand');
  fall(world);
  fall(world);
  assert.equal(getBlock(world, 1, 3), 'sand'); // the bottom row
  assert.equal(fall(world), false);           // the floor holds it
  assert.equal(getBlock(world, 1, 3), 'sand');
});

test('sand lands on top of other blocks', () => {
  const world = createWorld(3, 4);
  setBlock(world, 1, 2, 'stone');
  setBlock(world, 1, 0, 'sand');
  fall(world);
  assert.equal(fall(world), false);
  assert.equal(getBlock(world, 1, 1), 'sand');
  assert.equal(getBlock(world, 1, 2), 'stone');
});

test('a tower of sand falls together, never through itself', () => {
  const world = createWorld(1, 4);
  setBlock(world, 0, 0, 'sand');
  setBlock(world, 0, 1, 'sand');
  fall(world);
  assert.deepEqual(world.cells, [AIR, 'sand', 'sand', AIR]);
  fall(world);
  assert.deepEqual(world.cells, [AIR, AIR, 'sand', 'sand']);
});

test('sand can land on sand', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 2, 'sand');
  setBlock(world, 0, 0, 'sand');
  fall(world);
  assert.deepEqual(world.cells, [AIR, 'sand', 'sand']);
  assert.equal(fall(world), false);
});

test('other blocks float in the air, like in the game', () => {
  const world = createWorld(2, 3);
  for (const name of ['grass', 'stone', 'gold', 'glass', 'noteC']) {
    setBlock(world, 0, 0, name);
    assert.equal(fall(world), false, name);
    assert.equal(getBlock(world, 0, 0), name);
  }
});

test('note blocks play C D E F G A B, starting at middle C', () => {
  assert.deepEqual(NOTE_BLOCKS.map((note) => note.label), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.deepEqual(NOTE_BLOCKS.map((note) => note.midi), [60, 62, 64, 65, 67, 69, 71]);
});

test('using a note block plays its note and lights it up', () => {
  const played = [];
  let flashed = 0;
  const ctx = { world: createWorld(1, 1), x: 0, y: 0, playNote: (midi) => played.push(midi), flash: () => { flashed += 1; } };
  basic.blocks.noteG.use(ctx);
  assert.deepEqual(played, [67]);
  assert.equal(flashed, 1);
});

test('the basic pack has its tab, its blocks in palette order, and the falling rule', () => {
  assert.deepEqual(basic.tab, { id: 'basic', icon: '⛏️', label: 'Blocks' });
  assert.deepEqual(Object.keys(basic.blocks), [
    'grass', 'dirt', 'stone', 'wood', 'glass', 'obsidian', 'gold', 'sand',
    'noteC', 'noteD', 'noteE', 'noteF', 'noteG', 'noteA', 'noteB',
  ]);
  assert.deepEqual(basic.systems, [fallingBlocks]);
});
```

Create `tests/registry.test.js`:

```js
/**
 * registry.test.js — checks the list of block packs: every block has
 * what the Build page needs, and no two packs use the same block name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR } from '../js/world.js';
import { fallingBlocks } from '../js/blocks/basic.js';
import {
  AIR_INFO, PACKS, SIGNALS, allSystems, blockInfo, blocksInPack, isKnownBlock,
} from '../js/blocks/registry.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('no two packs use the same block name (and none is called "air")', () => {
  const names = PACKS.flatMap((pack) => Object.keys(pack.blocks));
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes(AIR));
});

test('every pack has a tab with an id, an icon and a label', () => {
  for (const pack of PACKS) {
    assert.ok(pack.tab.id && pack.tab.icon && pack.tab.label, JSON.stringify(pack.tab));
    assert.ok(Array.isArray(pack.systems), pack.tab.id);
  }
});

test('every block has a title and #rrggbb colors', () => {
  for (const pack of PACKS) {
    for (const [name, block] of Object.entries(pack.blocks)) {
      assert.ok(block.title, name);
      assert.match(block.color, HEX, name);
      if (block.topColor) assert.match(block.topColor, HEX, name);
    }
  }
});

test('blockInfo finds a block, tells you its name and pack, and knows air', () => {
  const sand = blockInfo('sand');
  assert.equal(sand.name, 'sand');
  assert.equal(sand.pack, 'basic');
  assert.equal(sand.falls, true);
  assert.equal(blockInfo(AIR), AIR_INFO);
  assert.equal(blockInfo('banana'), undefined);
});

test('isKnownBlock says yes to real blocks and air, no to anything else', () => {
  assert.equal(isKnownBlock('gold'), true);
  assert.equal(isKnownBlock(AIR), true);
  assert.equal(isKnownBlock('banana'), false);
  assert.equal(isKnownBlock(undefined), false);
});

test('allSystems lists every pack\'s systems in pack order', () => {
  assert.deepEqual(allSystems(), PACKS.flatMap((pack) => pack.systems));
  assert.ok(allSystems().includes(fallingBlocks));
});

test('blocksInPack gives the palette for one tab', () => {
  assert.equal(blocksInPack('basic')[0], 'grass');
  assert.deepEqual(blocksInPack('nope'), []);
});

test('the shared signals later packs will use are named', () => {
  assert.deepEqual(SIGNALS, { POWER: 'power', SPIN: 'spin' });
});
```

Add `'blocks/basic.js', 'blocks/registry.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/basic.test.js tests/registry.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write js/blocks/basic.js**

```js
/**
 * basic.js — the ⛏️ Blocks pack: plain building blocks, sand that
 * falls, and note blocks that sing.
 *
 * A "pack" is one palette tab's worth of blocks, plus the rules
 * ("systems") that make them do things. Later packs (⚡ wires, 💧 water,
 * ⚙️ gears) are new files shaped just like this one.
 */
import { AIR, getBlock, setBlock } from '../world.js';

/**
 * The singing note blocks. Same rainbow colors as the Note Blocks page:
 * C red, D orange, E yellow, F green, G blue, A purple, B pink.
 * `midi` is the note's number (60 = middle C, see music-theory.js).
 * 🧪 Try this! Add 12 to every midi number to make them sing an octave higher.
 */
export const NOTE_BLOCKS = [
  { name: 'noteC', label: 'C', midi: 60, color: '#e53935' },
  { name: 'noteD', label: 'D', midi: 62, color: '#fb8c00' },
  { name: 'noteE', label: 'E', midi: 64, color: '#fdd835' },
  { name: 'noteF', label: 'F', midi: 65, color: '#43a047' },
  { name: 'noteG', label: 'G', midi: 67, color: '#1e88e5' },
  { name: 'noteA', label: 'A', midi: 69, color: '#5e35b1' },
  { name: 'noteB', label: 'B', midi: 71, color: '#d81b60' },
];

/**
 * The falling rule: any block marked `falls` with air right under it
 * drops down one cell.
 *
 * We look at the rows from the BOTTOM up. That way, in a tower of sand,
 * the lowest grain moves first and leaves a gap for the one above it,
 * so the whole tower falls together, one row per tick.
 *
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if anything fell
 */
export function fallingBlocks(world, blockInfo) {
  let changed = false;
  // The bottom row can't fall (the floor is under it), so start one up.
  for (let y = world.height - 2; y >= 0; y--) {
    for (let x = 0; x < world.width; x++) {
      const name = getBlock(world, x, y);
      if (blockInfo(name)?.falls && getBlock(world, x, y + 1) === AIR) {
        setBlock(world, x, y + 1, name);
        setBlock(world, x, y, AIR);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Make one note block: it shows its letter, and ✋ USE plays its note.
 * @param {{label: string, midi: number, color: string}} note - one of NOTE_BLOCKS
 * @returns {object} the block's definition
 */
function noteBlock({ label, midi, color }) {
  return {
    title: `Note ${label}`,
    color,
    label,
    midi,
    use: (ctx) => {
      ctx.playNote(midi);
      ctx.flash();
    },
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 * `color` is the block's main color; the grass block is dirt with a green
 * `topColor`, like the real thing. `seeThrough` blocks let the sky show.
 * 🧪 Try this! Add  diamond: { title: 'Diamond', color: '#4ee6e0' },
 */
const blocks = {
  grass: { title: 'Grass', color: '#8b5a2b', topColor: '#5dbb3f' },
  dirt: { title: 'Dirt', color: '#8b5a2b' },
  stone: { title: 'Stone', color: '#8f8f8f' },
  wood: { title: 'Wood', color: '#a0703c' },
  glass: { title: 'Glass', color: '#cdefff', seeThrough: true },
  obsidian: { title: 'Obsidian', color: '#2b1f3d' },
  gold: { title: 'Gold', color: '#f2b705' },
  sand: { title: 'Sand', color: '#e3d38f', falls: true },
};
for (const note of NOTE_BLOCKS) blocks[note.name] = noteBlock(note);

export default {
  tab: { id: 'basic', icon: '⛏️', label: 'Blocks' },
  blocks,
  systems: [fallingBlocks],
};
```

- [ ] **Step 4: Write js/blocks/registry.js**

```js
/**
 * registry.js — the list of every block pack, and one place to look up
 * what any block name means.
 *
 * To add a pack: write js/blocks/<name>.js shaped like basic.js, import
 * it here, and put it in PACKS. Its tab appears on the Build page by itself.
 */
import { AIR } from '../world.js';
import basic from './basic.js';

/**
 * Every pack, in the order their systems run each tick. Order matters
 * once packs talk to each other: water must turn to steam BEFORE the
 * turbine checks for steam. The plan for later phases is:
 *   basic → water → mechanical → electric
 */
export const PACKS = [basic];

/**
 * The names of the signals packs will pass to each other in later
 * phases: ⚡ power (wires, lamps) and 🔄 spin (gears, wheels).
 * Nothing uses them yet.
 */
export const SIGNALS = Object.freeze({ POWER: 'power', SPIN: 'spin' });

/** What empty air looks like: the sky. */
export const AIR_INFO = Object.freeze({ name: AIR, title: 'Air', color: '#7ec8ff' });

/** Every block from every pack, by name, with its name and pack id added. */
const BLOCKS = new Map();
for (const pack of PACKS) {
  for (const [name, block] of Object.entries(pack.blocks)) {
    BLOCKS.set(name, { ...block, name, pack: pack.tab.id });
  }
}

/**
 * Look up what a block name means.
 * @param {string} name - a block name, like 'sand'
 * @returns {object|undefined} the block's definition, AIR_INFO for air, or undefined if unknown
 */
export function blockInfo(name) {
  return name === AIR ? AIR_INFO : BLOCKS.get(name);
}

/**
 * Is this a block we know (or air)? Saved worlds use this to throw away
 * blocks that don't exist any more.
 * @param {*} name - anything, hopefully a block name
 * @returns {boolean} true for air and every block in every pack
 */
export function isKnownBlock(name) {
  return name === AIR || BLOCKS.has(name);
}

/**
 * Every pack's systems, in pack order: what runs on each tick.
 * @returns {Function[]} the systems
 */
export function allSystems() {
  return PACKS.flatMap((pack) => pack.systems ?? []);
}

/**
 * The block names on one palette tab, in palette order.
 * @param {string} id - a pack's tab id, like 'basic'
 * @returns {string[]} the block names (empty if there's no such tab)
 */
export function blocksInPack(id) {
  const pack = PACKS.find((p) => p.tab.id === id);
  return pack ? Object.keys(pack.blocks) : [];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail. This includes the docstring check now reaching `js/blocks/*.js`.

- [ ] **Step 6: Commit**

```bash
git add js/blocks tests/basic.test.js tests/registry.test.js tests/modules.test.js
git commit -m "Add the basic block pack (falling sand, note blocks) and the pack registry"
```

---

### Task 5: Saving worlds (js/saves.js)

**Files:**
- Create: `js/saves.js`
- Create: `tests/saves.test.js`
- Modify: `tests/modules.test.js` (add `'saves.js'`)

**Interfaces:**
- Consumes: `AIR`, `createWorld`, `setBlock` from `js/world.js`
- Produces:
  - Constants: `SAVE_VERSION = 1`, `WORLD_COUNT = 3`, `CURRENT_KEY = 'calebhamsa.build.current'`
  - `worldKey(n) → 'calebhamsa.build.world.' + n`
  - `thumbKey(n) → worldKey(n) + '.thumb'`
  - `serializeWorld(world) → string` (JSON)
  - `deserializeWorld(text, { width, height, isKnown }) → World | null`
  - `loadWorld(n, storage, options) → World | null` (never throws)
  - `saveWorld(n, world, thumbnail, storage) → boolean` (never throws)
  - `loadThumbnail(n, storage) → string | null`
  - `loadCurrent(storage) → 1..3` (default 1)
  - `saveCurrent(n, storage) → boolean`
  - `storage` is anything with `getItem` / `setItem`, and may be `null` (treated like blocked storage).

- [ ] **Step 1: Write the failing tests**

Create `tests/saves.test.js`:

```js
/**
 * saves.test.js — checks saving and loading Build-page worlds, including
 * the ways it can go wrong (broken saves, blocked storage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, defaultWorld, getBlock, setBlock } from '../js/world.js';
import {
  CURRENT_KEY, SAVE_VERSION, WORLD_COUNT, deserializeWorld, loadCurrent, loadThumbnail,
  loadWorld, saveCurrent, saveWorld, serializeWorld, thumbKey, worldKey,
} from '../js/saves.js';

/** Load options for a 4 × 3 world where only a few block names exist. */
const SMALL = { width: 4, height: 3, isKnown: (name) => ['air', 'grass', 'sand', 'gold'].includes(name) };

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

/** Storage that throws on everything, like Safari with saving switched off. */
const BLOCKED = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

/**
 * Build a save's JSON text by hand.
 * @param {object} fields - the save's fields (version defaults to SAVE_VERSION)
 * @returns {string} the JSON text
 */
const saveText = (fields) => JSON.stringify({ version: SAVE_VERSION, ...fields });

test('a world comes back exactly the same after saving and loading', () => {
  const world = createWorld(4, 3);
  setBlock(world, 0, 2, 'grass');
  setBlock(world, 3, 0, 'gold');
  const back = deserializeWorld(serializeWorld(world), SMALL);
  assert.deepEqual(back, world);
});

test('a save stores each block name once, and short numbers for the cells', () => {
  const world = createWorld(4, 3);
  setBlock(world, 1, 1, 'sand');
  const data = JSON.parse(serializeWorld(world));
  assert.equal(data.version, SAVE_VERSION);
  assert.deepEqual(data.blocks, ['air', 'sand']);
  assert.equal(data.cells.length, 12);
  assert.equal(data.cells[1 * 4 + 1], 1);
});

test('broken saves load as nothing (null), never a crash', () => {
  for (const text of ['', 'not json', 'null', '42', '[]', '{}',
    saveText({ width: 4, height: 3, blocks: ['air'], cells: [0] }),             // too few cells
    saveText({ width: 0, height: 3, blocks: ['air'], cells: [] }),              // no width
    saveText({ width: 4, height: 3, blocks: 'air', cells: new Array(12).fill(0) }),
  ]) {
    assert.equal(deserializeWorld(text, SMALL), null, text);
  }
});

test('a save from a newer version of the page loads as nothing', () => {
  const text = JSON.stringify({ version: SAVE_VERSION + 1, width: 4, height: 3, blocks: ['air'], cells: new Array(12).fill(0) });
  assert.equal(deserializeWorld(text, SMALL), null);
});

test('blocks that no longer exist, or bad cell numbers, turn into air', () => {
  const cells = new Array(12).fill(0);
  cells[0] = 1; // 'banana': not a real block
  cells[1] = 2; // 'gold'
  cells[2] = 7; // points past the end of the blocks list
  const world = deserializeWorld(saveText({ width: 4, height: 3, blocks: ['air', 'banana', 'gold'], cells }), SMALL);
  assert.equal(getBlock(world, 0, 0), AIR);
  assert.equal(getBlock(world, 1, 0), 'gold');
  assert.equal(getBlock(world, 2, 0), AIR);
});

test('a smaller old save lines up at the bottom-left, so the ground stays on the ground', () => {
  // 2 wide × 2 tall: grass along its bottom row
  const text = saveText({ width: 2, height: 2, blocks: ['air', 'grass'], cells: [0, 0, 1, 1] });
  const world = deserializeWorld(text, SMALL); // into 4 × 3
  assert.deepEqual(world.cells, [
    AIR, AIR, AIR, AIR,
    AIR, AIR, AIR, AIR,
    'grass', 'grass', AIR, AIR,
  ]);
});

test('a bigger old save is cropped, keeping its bottom-left', () => {
  // 5 wide × 4 tall, gold in its bottom-left corner and its top-right corner
  const cells = new Array(20).fill(0);
  cells[3 * 5 + 0] = 1;
  cells[0 * 5 + 4] = 1;
  const world = deserializeWorld(saveText({ width: 5, height: 4, blocks: ['air', 'gold'], cells }), SMALL);
  assert.equal(getBlock(world, 0, 2), 'gold');            // bottom-left kept
  assert.ok(world.cells.filter((n) => n === 'gold').length === 1); // top-right cropped off
});

test('worlds 1 to 3 save and load, each with a thumbnail', () => {
  const storage = fakeStorage();
  const world = defaultWorld(4, 3);
  setBlock(world, 0, 0, 'sand');
  assert.equal(saveWorld(2, world, 'data:image/png;base64,AAA', storage), true);
  assert.ok(storage.items.has(worldKey(2)));
  assert.equal(loadThumbnail(2, storage), 'data:image/png;base64,AAA');
  const options = { ...SMALL, isKnown: () => true };
  assert.deepEqual(loadWorld(2, storage, options), world);
  assert.equal(loadWorld(1, storage, options), null);   // never saved
  assert.equal(loadThumbnail(1, storage), null);
});

test('the storage keys share the site\'s "calebhamsa." prefix', () => {
  assert.equal(worldKey(1), 'calebhamsa.build.world.1');
  assert.equal(thumbKey(3), 'calebhamsa.build.world.3.thumb');
  assert.equal(CURRENT_KEY, 'calebhamsa.build.current');
  assert.equal(WORLD_COUNT, 3);
});

test('a broken saved world loads as nothing instead of crashing', () => {
  const storage = fakeStorage();
  storage.setItem(worldKey(1), '{oops');
  const warn = console.warn;
  console.warn = () => {}; // keep the test output tidy
  try {
    assert.equal(loadWorld(1, storage, SMALL), null);
  } finally {
    console.warn = warn;
  }
});

test('which world is open is remembered; anything odd means world 1', () => {
  const storage = fakeStorage();
  assert.equal(loadCurrent(storage), 1);
  assert.equal(saveCurrent(3, storage), true);
  assert.equal(loadCurrent(storage), 3);
  for (const odd of ['0', '4', '2.5', 'two', '']) {
    storage.setItem(CURRENT_KEY, odd);
    assert.equal(loadCurrent(storage), 1, odd);
  }
});

test('blocked or missing storage never crashes: saving says false, loading says nothing', () => {
  for (const storage of [BLOCKED, null]) {
    assert.equal(saveWorld(1, defaultWorld(4, 3), 'thumb', storage), false);
    assert.equal(loadWorld(1, storage, SMALL), null);
    assert.equal(loadThumbnail(1, storage), null);
    assert.equal(saveCurrent(2, storage), false);
    assert.equal(loadCurrent(storage), 1);
  }
});

test('full storage (setItem throws) makes saveWorld say false', () => {
  const full = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(saveWorld(1, defaultWorld(4, 3), 'thumb', full), false);
});
```

Add `'saves.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/saves.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write js/saves.js**

```js
/**
 * saves.js — keeps Caleb's three worlds safe in the browser's storage
 * (localStorage), so closing the iPad never loses a build.
 *
 * A saved world is a bit of JSON text, like:
 *
 *   { "version": 1, "width": 24, "height": 14,
 *     "blocks": ["air", "grass", "sand"],
 *     "cells":  [0, 0, 0, ..., 1, 1, 1] }
 *
 * Each cell stores a small number (0 = the first name in "blocks"),
 * which is much shorter than writing "grass" 24 times.
 *
 * Every function here takes the storage as an argument, so the tests
 * can hand in a pretend one. Storage can fail (private browsing, a full
 * iPad), so every function here catches that and never crashes the page.
 */
import { AIR, createWorld, setBlock } from './world.js';

/** Bump this if the save format ever changes, so old pages ignore new saves. */
export const SAVE_VERSION = 1;

/** How many worlds Caleb can switch between. */
export const WORLD_COUNT = 3;

/** The name the number of the open world (1–3) is saved under. */
export const CURRENT_KEY = 'calebhamsa.build.current';

/**
 * The name world n is saved under.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @returns {string} e.g. "calebhamsa.build.world.1"
 */
export function worldKey(n) {
  return `calebhamsa.build.world.${n}`;
}

/**
 * The name world n's little picture is saved under.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @returns {string} e.g. "calebhamsa.build.world.1.thumb"
 */
export function thumbKey(n) {
  return `${worldKey(n)}.thumb`;
}

/**
 * Turn a world into save text.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @returns {string} JSON text
 */
export function serializeWorld(world) {
  const blocks = [];
  const numberOf = new Map(); // block name → its position in `blocks`
  const cells = world.cells.map((name) => {
    if (!numberOf.has(name)) {
      numberOf.set(name, blocks.length);
      blocks.push(name);
    }
    return numberOf.get(name);
  });
  return JSON.stringify({ version: SAVE_VERSION, width: world.width, height: world.height, blocks, cells });
}

/**
 * Does this look like a save we know how to read?
 * @param {*} data - whatever JSON.parse gave back
 * @returns {boolean} true if it has every part, the right sizes, and our version
 */
function isReadableSave(data) {
  return data !== null && typeof data === 'object'
    && data.version === SAVE_VERSION
    && Number.isInteger(data.width) && data.width > 0
    && Number.isInteger(data.height) && data.height > 0
    && Array.isArray(data.blocks)
    && Array.isArray(data.cells) && data.cells.length === data.width * data.height;
}

/**
 * Turn save text back into a world of the size the page uses now.
 *
 * - Blocks we don't know any more become air.
 * - If the save is a different size, it's lined up at the BOTTOM-LEFT
 *   (cropped or padded with air), so the ground stays on the ground.
 *
 * @param {string} text - JSON text from serializeWorld
 * @param {{width: number, height: number, isKnown: Function}} options - the world size now, and which block names exist
 * @returns {{width: number, height: number, cells: string[]}|null} the world, or null if the text can't be read
 */
export function deserializeWorld(text, { width, height, isKnown }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isReadableSave(data)) return null;

  const world = createWorld(width, height);
  const shiftDown = height - data.height; // how far to move rows so the bottoms line up
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const name = data.blocks[data.cells[y * data.width + x]];
      // setBlock ignores spots outside the new world, which does the cropping.
      setBlock(world, x, y + shiftDown, isKnown(name) ? name : AIR);
    }
  }
  return world;
}

/**
 * Load world n from storage.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @param {{width: number, height: number, isKnown: Function}} options - see deserializeWorld
 * @returns {{width: number, height: number, cells: string[]}|null} the world, or null if there isn't a readable one
 */
export function loadWorld(n, storage, options) {
  let text;
  try {
    text = storage.getItem(worldKey(n));
  } catch {
    return null; // storage is blocked (or missing)
  }
  if (text === null) return null; // never saved
  const world = deserializeWorld(text, options);
  if (!world) console.warn(`World ${n}'s save couldn't be read, so it starts fresh.`);
  return world;
}

/**
 * Save world n, and its little picture, to storage.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {string|null} thumbnail - a data: URL picture of it, or null for none
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {boolean} true if it saved, false if storage is blocked or full
 */
export function saveWorld(n, world, thumbnail, storage) {
  try {
    storage.setItem(worldKey(n), serializeWorld(world));
    if (thumbnail) storage.setItem(thumbKey(n), thumbnail);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load world n's little picture.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {string|null} a data: URL, or null if there isn't one
 */
export function loadThumbnail(n, storage) {
  try {
    return storage.getItem(thumbKey(n));
  } catch {
    return null;
  }
}

/**
 * Which world was open last time?
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {number} 1 to WORLD_COUNT (1 if nothing sensible was saved)
 */
export function loadCurrent(storage) {
  try {
    const n = Number(storage.getItem(CURRENT_KEY));
    return Number.isInteger(n) && n >= 1 && n <= WORLD_COUNT ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * Remember which world is open.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @param {Storage|null} storage - localStorage (or a pretend one)
 * @returns {boolean} true if it saved
 */
export function saveCurrent(n, storage) {
  try {
    storage.setItem(CURRENT_KEY, String(n));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/saves.js tests/saves.test.js tests/modules.test.js
git commit -m "Add saving and loading for three Build worlds (saves.js)"
```

---

### Task 6: Drawing blocks (js/block-art.js)

**Files:**
- Create: `js/block-art.js`
- Create: `tests/block-art.test.js`
- Modify: `tests/modules.test.js` (add `'block-art.js'`)

**Interfaces:**
- Consumes: `AIR`, `getBlock` from `js/world.js`; BlockDef fields from Task 4 (`name`, `color`, `topColor`, `seeThrough`, `label`)
- Produces:
  - `SPECKLE_GRID = 8`
  - `hashName(name) → number` (stable)
  - `speckles(seed, count = 10) → Array<[sx, sy]>`, each value in 0–7
  - `shade(hex, factor) → '#rrggbb'`
  - `drawBlock(ctx, info, left, top, size) → void`
  - `drawWorld(ctx, world, size, blockInfo, sky) → void`
- Drawing uses only `fillRect`, `strokeRect`, `fillText` and plain properties (`fillStyle`, `strokeStyle`, `lineWidth`, `globalAlpha`, `font`, `textAlign`, `textBaseline`), so tests can pass a fake context.

- [ ] **Step 1: Write the failing tests**

Create `tests/block-art.test.js`:

```js
/**
 * block-art.test.js — checks how blocks are drawn, using a pretend
 * canvas that just writes down what it was asked to draw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { blockInfo } from '../js/blocks/registry.js';
import { SPECKLE_GRID, drawBlock, drawWorld, hashName, shade, speckles } from '../js/block-art.js';

/**
 * A pretend canvas "context" that records every drawing call.
 * @returns {object} the fake context, with a `calls` list
 */
function fakeContext() {
  const ctx = {
    calls: [],
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect(...args) { ctx.calls.push({ op: 'fillRect', style: ctx.fillStyle, args }); },
    strokeRect(...args) { ctx.calls.push({ op: 'strokeRect', style: ctx.strokeStyle, args }); },
    fillText(...args) { ctx.calls.push({ op: 'fillText', style: ctx.fillStyle, args }); },
  };
  return ctx;
}

test('shade makes a color darker (or lighter) and stays a #rrggbb color', () => {
  assert.equal(shade('#808080', 0.5), '#404040');
  assert.equal(shade('#ff0000', 0.5), '#800000');
  assert.equal(shade('#808080', 3), '#ffffff'); // can't go past white
});

test('hashName gives the same number for the same name, and different ones for different names', () => {
  assert.equal(hashName('sand'), hashName('sand'));
  assert.notEqual(hashName('sand'), hashName('dirt'));
});

test('speckles are the same every time (no flicker) and land inside the block', () => {
  const spots = speckles(hashName('stone'));
  assert.deepEqual(spots, speckles(hashName('stone')));
  assert.equal(spots.length, 10);
  for (const [x, y] of spots) {
    assert.ok(x >= 0 && x < SPECKLE_GRID && y >= 0 && y < SPECKLE_GRID, `${x},${y}`);
  }
  assert.notDeepEqual(spots, speckles(hashName('sand')));
});

test('drawing the same block twice draws exactly the same thing', () => {
  const a = fakeContext();
  const b = fakeContext();
  drawBlock(a, blockInfo('stone'), 40, 0, 40);
  drawBlock(b, blockInfo('stone'), 40, 0, 40);
  assert.deepEqual(a.calls, b.calls);
  assert.deepEqual(a.calls[0], { op: 'fillRect', style: '#8f8f8f', args: [40, 0, 40, 40] });
});

test('note blocks show their letter', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('noteE'), 0, 0, 40);
  const texts = ctx.calls.filter((call) => call.op === 'fillText').map((call) => call.args[0]);
  assert.ok(texts.includes('E'));
});

test('grass has a green top', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('grass'), 0, 0, 40);
  assert.ok(ctx.calls.some((call) => call.op === 'fillRect' && call.style === '#5dbb3f'));
});

test('glass gets a frame and puts the see-through setting back afterwards', () => {
  const ctx = fakeContext();
  drawBlock(ctx, blockInfo('glass'), 0, 0, 40);
  assert.ok(ctx.calls.some((call) => call.op === 'strokeRect'));
  assert.equal(ctx.globalAlpha, 1);
});

test('drawWorld paints the sky first, then only the cells that are not air', () => {
  const world = createWorld(3, 2);
  const empty = fakeContext();
  drawWorld(empty, world, 10, blockInfo, '#7ec8ff');
  assert.deepEqual(empty.calls, [{ op: 'fillRect', style: '#7ec8ff', args: [0, 0, 30, 20] }]);

  setBlock(world, 2, 1, 'gold');
  const one = fakeContext();
  drawWorld(one, world, 10, blockInfo, '#7ec8ff');
  assert.deepEqual(one.calls[1], { op: 'fillRect', style: '#f2b705', args: [20, 10, 10, 10] });
});

test('drawWorld skips block names it does not know', () => {
  const world = createWorld(1, 1);
  world.cells[0] = 'banana';
  const ctx = fakeContext();
  assert.doesNotThrow(() => drawWorld(ctx, world, 10, blockInfo, '#7ec8ff'));
  assert.equal(ctx.calls.length, 1);
});
```

Add `'block-art.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/block-art.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write js/block-art.js**

```js
/**
 * block-art.js — draws blocks on a canvas, pixel-art style.
 *
 * Each block is drawn on an 8 × 8 grid of little squares ("pixels"):
 *
 *   ┌────────┐   1. fill with the block's color
 *   │ ▪   ▪  │   2. sprinkle darker "speckles" (the same pattern every time)
 *   │   ▪  ▪ │   3. a light edge on the top-left, a dark one on the
 *   │ ▪    ▪ │      bottom-right, so it looks a little 3D
 *   └────────┘   4. a letter on top, for note blocks
 *
 * The Build page uses this for the world, the palette, the thumbnails
 * and the 📷 picture, so they all look the same.
 */
import { AIR, getBlock } from './world.js';

/** Blocks are drawn as SPECKLE_GRID × SPECKLE_GRID little pixels. */
export const SPECKLE_GRID = 8;

/**
 * How many darker speckles each block gets.
 * 🧪 Try this! 0 for smooth blocks, 30 for very bumpy ones.
 */
const SPECKLES_PER_BLOCK = 10;

/**
 * How dark the speckles are: 1 = same color, 0 = black.
 * 🧪 Try this! 0.5 for strong speckles, 0.95 for barely-there ones.
 */
const SPECKLE_SHADE = 0.82;

/**
 * Turn a name into a number, the same number every time. We use it to
 * pick each block's speckle pattern, so sand always looks like sand.
 * @param {string} name - a block name
 * @returns {number} a whole number from 0 to about 4 billion
 */
export function hashName(name) {
  let hash = 0;
  for (const letter of name) hash = (Math.imul(hash, 31) + letter.codePointAt(0)) >>> 0;
  return hash;
}

/**
 * Where a block's speckles go. It's "random", but the same seed always
 * gives the same spots, so blocks don't flicker when they're redrawn.
 * @param {number} seed - from hashName
 * @param {number} [count] - how many speckles
 * @returns {Array<[number, number]>} [x, y] of each speckle, 0 to SPECKLE_GRID - 1
 */
export function speckles(seed, count = SPECKLES_PER_BLOCK) {
  let n = seed || 1;
  /**
   * The next "random" number: a classic recipe that scrambles n.
   * @returns {number} a whole number from 0 to 65535
   */
  const next = () => {
    n = (Math.imul(n, 1103515245) + 12345) >>> 0;
    return n >>> 16;
  };
  const spots = [];
  for (let i = 0; i < count; i++) spots.push([next() % SPECKLE_GRID, next() % SPECKLE_GRID]);
  return spots;
}

/**
 * Make a #rrggbb color darker (factor below 1) or lighter (above 1).
 * @param {string} hex - a color like '#8f8f8f'
 * @param {number} factor - 0.5 = half as bright, 2 = twice as bright
 * @returns {string} the new #rrggbb color
 */
export function shade(hex, factor) {
  return `#${[1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16))
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel * factor))))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Draw one block.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (from blockInfo)
 * @param {number} left - where its left edge goes, in pixels
 * @param {number} top - where its top edge goes, in pixels
 * @param {number} size - how wide and tall it is, in pixels
 * @returns {void}
 */
export function drawBlock(ctx, info, left, top, size) {
  const px = size / SPECKLE_GRID; // one little "pixel"

  if (info.seeThrough) {
    drawGlass(ctx, info, left, top, size, px);
  } else {
    ctx.fillStyle = info.color;
    ctx.fillRect(left, top, size, size);
    ctx.fillStyle = shade(info.color, SPECKLE_SHADE);
    for (const [x, y] of speckles(hashName(info.name ?? info.color))) {
      ctx.fillRect(left + x * px, top + y * px, px, px);
    }
    if (info.topColor) {
      // Like a grass block: a green top three pixels deep.
      ctx.fillStyle = info.topColor;
      ctx.fillRect(left, top, size, px * 3);
    }
  }

  // The 3D edges: light on the top and left, dark on the bottom and right.
  const edge = px / 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(left, top, size, edge);
  ctx.fillRect(left, top, edge, size);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(left, top + size - edge, size, edge);
  ctx.fillRect(left + size - edge, top, edge, size);

  if (info.label) {
    ctx.font = `${Math.round(size * 0.4)}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = left + size / 2;
    const y = top + size / 2 + edge;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; // a shadow, like the site's button text
    ctx.fillText(info.label, x + edge, y + edge);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(info.label, x, y);
  }
}

/**
 * Draw a see-through block (glass): a pale tint the sky shows through,
 * a frame, and a little white shine.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - left edge, in pixels
 * @param {number} top - top edge, in pixels
 * @param {number} size - width and height, in pixels
 * @param {number} px - the size of one little pixel
 * @returns {void}
 */
function drawGlass(ctx, info, left, top, size, px) {
  ctx.globalAlpha = 0.35; // 35% see-through tint
  ctx.fillStyle = info.color;
  ctx.fillRect(left, top, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = shade(info.color, 0.6);
  ctx.lineWidth = px;
  ctx.strokeRect(left + px / 2, top + px / 2, size - px, size - px);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left + px * 2, top + px * 2, px, px);
  ctx.fillRect(left + px * 3, top + px * 3, px, px);
}

/**
 * Draw the whole world: sky everywhere, then every block that isn't air.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} size - how big each block is, in pixels
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string} sky - the sky color
 * @returns {void}
 */
export function drawWorld(ctx, world, size, blockInfo, sky) {
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, world.width * size, world.height * size);
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const name = getBlock(world, x, y);
      if (name === AIR) continue;
      const info = blockInfo(name);
      if (info) drawBlock(ctx, info, x * size, y * size, size);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/block-art.js tests/block-art.test.js tests/modules.test.js
git commit -m "Add pixel-art block drawing (block-art.js)"
```

---

### Task 7: The Build page: canvas, tools, palette, ticking

**Files:**
- Create: `build.html`
- Create: `js/build.js`
- Create: `tests/build.test.js`
- Modify: `css/blocks.css` (append a "Build page" section before the animations section)
- Modify: `tests/modules.test.js` (add `'build.js'`)
- Modify: `tests/pages.test.js:13` (add `'build.html'` to `PAGES`)

**Interfaces:**
- Consumes:
  - from `world.js`: `AIR`, `defaultWorld`, `getBlock`, `setBlock`, `tick`
  - from `blocks/registry.js`: `PACKS`, `AIR_INFO`, `allSystems`, `blockInfo`, `blocksInPack`
  - from `block-art.js`: `drawBlock`, `drawWorld`
  - from `sound.js`: `listenForUnlock`, `playTones`
  - from `ui.js`: `cellsAlongLine`, `choose`, `flash`
- Produces:
  - `initBuild() → void`
  - `fitCellSize(boxWidth, boxHeight, columns, rows) → number` (whole pixels, at least 1)
  - `applyTool(world, tool, x, y, selected) → boolean`
  - Module-level `state` and functions `draw()` and `worldChanged()`, which Task 8 extends

- [ ] **Step 1: Write the failing tests**

Create `tests/build.test.js`:

```js
/**
 * build.test.js — checks the Build page's pure helpers: how big the
 * blocks are drawn, and what BUILD and DIG do to the world.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, getBlock, setBlock } from '../js/world.js';
import { applyTool, fitCellSize } from '../js/build.js';

test('blocks are as big as fits, and always square', () => {
  assert.equal(fitCellSize(960, 560, 24, 14), 40);  // fits exactly
  assert.equal(fitCellSize(2000, 560, 24, 14), 40); // a very wide box: the height decides
  assert.equal(fitCellSize(480, 2000, 24, 14), 20); // a tall box (iPad portrait): the width decides
  assert.equal(fitCellSize(500, 300, 24, 14), 20);  // rounds down to whole pixels: 20.8 → 20
});

test('even a tiny box gets 1-pixel blocks instead of 0 or a crash', () => {
  assert.equal(fitCellSize(0, 0, 24, 14), 1);
  assert.equal(fitCellSize(-12, 5, 24, 14), 1);
});

test('BUILD puts the chosen block down, even on top of another block', () => {
  const world = createWorld(3, 3);
  assert.equal(applyTool(world, 'build', 1, 1, 'gold'), true);
  assert.equal(getBlock(world, 1, 1), 'gold');
  assert.equal(applyTool(world, 'build', 1, 1, 'stone'), true); // swaps it
  assert.equal(getBlock(world, 1, 1), 'stone');
  assert.equal(applyTool(world, 'build', 1, 1, 'stone'), false); // already stone
});

test('DIG empties a cell', () => {
  const world = createWorld(3, 3);
  setBlock(world, 0, 2, 'dirt');
  assert.equal(applyTool(world, 'dig', 0, 2, 'gold'), true);
  assert.equal(getBlock(world, 0, 2), AIR);
  assert.equal(applyTool(world, 'dig', 0, 2, 'gold'), false);
});

test('USE never changes the world by itself, and nothing happens off the edge', () => {
  const world = createWorld(3, 3);
  assert.equal(applyTool(world, 'use', 1, 1, 'gold'), false);
  assert.equal(applyTool(world, 'build', 5, 1, 'gold'), false);
  assert.equal(applyTool(world, 'build', -1, 0, 'gold'), false);
  assert.ok(world.cells.every((name) => name === AIR));
});
```

Add `'build.js'` to `MODULES` in `tests/modules.test.js`, and `'build.html'` to `PAGES` in `tests/pages.test.js`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `tests/build.test.js` and `js/build.js loads` fail with `ERR_MODULE_NOT_FOUND`, and the pages tests for `build.html` fail with `ENOENT`.

- [ ] **Step 3: Write build.html**

Copy the `<head>` of `draw.html` **exactly**, then change only these lines:

```html
  <title>Build · Caleb's Blocky World</title>
  ...
  <meta property="og:title" content="Build · Caleb's Blocky World">
  ...
  <meta property="og:url" content="https://calebhamsa.fun/build.html">
```

Use the **index.html** font line (only the pixel font is needed here):

```html
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" crossorigin>
```

Keep the `description` / `og:description` text the same as the other pages.

The file opens with a comment, then the `<body>`:

```html
<!DOCTYPE html>
<!--
  build.html: the Build page. A side-view world of blocks.

  The world is drawn on one <canvas> by js/build.js. Below it: the three
  tools (BUILD, DIG, USE), the 📷 and 🗑️ buttons, the palette tabs (one per
  block pack), and the blocks in the chosen tab. The 🌍 world buttons
  in the top bar switch between Caleb's three saved worlds.
-->
```

```html
<body class="build-page">
  <header class="top-bar">
    <a class="block home" href="index.html" aria-label="Home">🏠</a>
    <!-- build.js fills this with the 🌍 1 / 2 / 3 world buttons. -->
    <div class="toolbar" id="worlds" aria-label="Worlds"></div>
    <p class="save-problem" id="save-problem" hidden>can't save here</p>
  </header>

  <main class="build-main">
    <div class="world-frame" id="world-frame">
      <canvas id="world" aria-label="Block world"></canvas>
    </div>

    <div class="toolbar">
      <button class="block grass" data-tool="build" aria-pressed="true">🧱 BUILD</button>
      <button class="block dirt" data-tool="dig" aria-pressed="false">⛏️ DIG</button>
      <button class="block gold" data-tool="use" aria-pressed="false">✋ USE</button>
      <button class="block" id="photo" aria-label="Save picture">📷</button>
      <button class="block obsidian" id="new-world" aria-label="New world">🗑️</button>
    </div>

    <!-- build.js fills these: one tab per block pack, then that pack's blocks. -->
    <div class="toolbar" id="tabs"></div>
    <div class="toolbar palette" id="palette"></div>
  </main>

  <script type="module">
    import { initBuild } from './js/build.js';
    initBuild();
    import { registerServiceWorker } from './js/pwa.js';
    registerServiceWorker(); // the offline helper (see js/pwa.js)
  </script>
</body>
</html>
```

- [ ] **Step 4: Add the Build page CSS**

Append to `css/blocks.css`, as a new numbered section just **before** the animations (`@keyframes`) section. Renumber that section's heading if the file numbers them.

```css
/* -----------------------------------------------------------------
   Build page
   ----------------------------------------------------------------- */
.build-page {
  height: 100vh;
  height: 100dvh;
}

.build-main {
  max-width: none;
  min-height: 0;
  gap: 8px;
  padding: 8px 16px 16px;
}

/* The box the world sits in. build.js makes the canvas as big as fits. */
.world-frame {
  flex: 1;
  min-height: 160px;
  display: grid;
  place-items: center;
  overflow: hidden;
  /* Same as the drawing pad: no "select text" magnifier on a long press. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* touch-action: none means a finger on the world builds, it doesn't
   scroll or zoom the page. */
#world {
  display: block;
  border: 6px solid var(--dirt); /* build.js knows this is 6px (WORLD_BORDER_PX) */
  touch-action: none;
}

/* ✋ USE on a block that doesn't do anything: a little "nope" shake. */
.world-frame.nope { animation: shake 400ms; }

/* Palette blocks: the picture is drawn by block-art.js on a tiny canvas. */
.palette .block { padding: 4px; }
.palette canvas { display: block; width: 40px; height: 40px; }

/* World buttons show a tiny picture of each world. */
.world-button { padding: 4px; }
.world-button img {
  display: block;
  width: 72px;
  height: 42px;
  image-rendering: pixelated; /* keep the little picture blocky, not blurry */
}

.save-problem {
  margin: 0;
  padding: 6px 10px;
  background: #9e2420;
  color: #fff;
  font-size: 10px;
}
```

- [ ] **Step 5: Write js/build.js**

```js
/**
 * build.js — makes the Build page work.
 *
 * It draws the world on the canvas, listens for fingers, and runs the
 * three tools:
 *   🧱 BUILD  tap or drag to put the chosen block down
 *   ⛏️ DIG    tap or drag to take blocks away
 *   ✋ USE    tap a block to make it do its thing (note blocks sing!)
 *
 * A clock "ticks" several times a second. Each tick, every block pack's
 * rules (like "sand falls") get a turn, and the world is redrawn if
 * anything moved. build.html calls initBuild() once.
 */
import { AIR, defaultWorld, getBlock, setBlock, tick } from './world.js';
import { AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack } from './blocks/registry.js';
import { drawBlock, drawWorld } from './block-art.js';
import { listenForUnlock, playTones } from './sound.js';
import { cellsAlongLine, choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * How many times a second the world's clock ticks.
 * 🧪 Try this! 2 for slow-motion sand, 20 for super-fast sand.
 */
const TICKS_PER_SECOND = 8;

/** How long a note block stays lit after it sings, in milliseconds. */
const LIGHT_MS = 300;

/** How big the blocks in the palette are, in CSS pixels. */
const SWATCH_PX = 40;

/** The world canvas's border width (blocks.css #world), in CSS pixels. */
const WORLD_BORDER_PX = 6;

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember. */
const state = {
  world: defaultWorld(),
  tool: 'build',             // 'build' | 'dig' | 'use'
  tab: PACKS[0].tab.id,      // which palette tab is showing
  selected: 'grass',         // the block BUILD puts down
  cell: 0,                   // how big one block is on screen, in CSS pixels
};

/** The rules that run every tick, from every pack, in order. */
const SYSTEMS = allSystems();

/**
 * The one finger building right now: { id, x, y }, or null.
 * Only ONE finger builds at a time, so a palm resting on the iPad
 * doesn't scribble blocks everywhere.
 */
let pointer = null;

let canvas;
let ctx;          // "context": the paintbrush for the canvas
let frame;        // the box around the canvas
let toolButtons = [];
let tabButtons = [];
let paletteButtons = [];
let tickTimer = null;

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Pure helpers (no screen needed, so tests/build.test.js checks them)
// =============================================================

/**
 * How big each block can be so the whole world fits in the box.
 * Blocks stay square, and whole pixels keep their edges crisp.
 * @param {number} boxWidth - the space we have, in CSS pixels
 * @param {number} boxHeight - the space we have, in CSS pixels
 * @param {number} columns - how many blocks across
 * @param {number} rows - how many blocks down
 * @returns {number} the block size in whole pixels (at least 1)
 */
export function fitCellSize(boxWidth, boxHeight, columns, rows) {
  return Math.max(1, Math.floor(Math.min(boxWidth / columns, boxHeight / rows)));
}

/**
 * Do what BUILD or DIG does to one cell. (USE is handled by useBlockAt,
 * because it makes sounds instead of changing the world.)
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {string} tool - 'build', 'dig' or 'use'
 * @param {number} x - column
 * @param {number} y - row
 * @param {string} selected - the block BUILD puts down
 * @returns {boolean} true if the world changed
 */
export function applyTool(world, tool, x, y, selected) {
  if (tool === 'build') return setBlock(world, x, y, selected);
  if (tool === 'dig') return setBlock(world, x, y, AIR);
  return false;
}

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page. build.html calls this once.
 * @returns {void}
 */
export function initBuild() {
  canvas = byId('world');
  ctx = canvas.getContext('2d');
  frame = byId('world-frame');

  setupTools();
  buildTabs();
  showTab(state.tab);
  setupPointer();
  listenForUnlock();

  // Keep the world as big as fits, even when the iPad turns sideways.
  // ResizeObserver calls resizeCanvas() once right away, then after every change.
  new ResizeObserver(resizeCanvas).observe(frame);

  // The pixel font may still be downloading. Once it's here, redraw so
  // note-block letters use it.
  document.fonts?.ready.then(() => {
    draw();
    showTab(state.tab);
  });

  startTicking();
  // Don't tick while the page is hidden (the iPad is asleep): saves battery.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTicking();
    else startTicking();
  });
}

// =============================================================
// Tools, tabs and the palette
// =============================================================

/**
 * Connect the BUILD / DIG / USE buttons.
 * @returns {void}
 */
function setupTools() {
  toolButtons = [...document.querySelectorAll('[data-tool]')];
  for (const button of toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
}

/**
 * Pick a tool.
 * @param {string} tool - 'build', 'dig' or 'use'
 * @returns {void}
 */
function setTool(tool) {
  state.tool = tool;
  choose(toolButtons, toolButtons.find((button) => button.dataset.tool === tool) ?? null);
}

/**
 * Make one tab button per block pack.
 * @returns {void}
 */
function buildTabs() {
  const holder = byId('tabs');
  tabButtons = PACKS.map((pack) => {
    const button = document.createElement('button');
    button.className = 'block';
    button.dataset.tab = pack.tab.id;
    button.textContent = `${pack.tab.icon} ${pack.tab.label.toUpperCase()}`;
    button.addEventListener('click', () => showTab(pack.tab.id));
    holder.append(button);
    return button;
  });
}

/**
 * Show one tab's blocks in the palette.
 * @param {string} id - the pack's tab id
 * @returns {void}
 */
function showTab(id) {
  state.tab = id;
  choose(tabButtons, tabButtons.find((button) => button.dataset.tab === id) ?? null);
  byId('palette').replaceChildren();
  paletteButtons = blocksInPack(id).map(makeSwatch);
  choose(paletteButtons, paletteButtons.find((button) => button.dataset.block === state.selected) ?? null);
}

/**
 * Make one palette button, with the block drawn on a tiny canvas.
 * @param {string} name - the block's name
 * @returns {HTMLButtonElement} the button (already in the palette)
 */
function makeSwatch(name) {
  const info = blockInfo(name);
  const button = document.createElement('button');
  button.className = 'block';
  button.dataset.block = name;
  button.setAttribute('aria-label', info.title);
  button.setAttribute('aria-pressed', 'false');

  const swatch = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  swatch.width = SWATCH_PX * ratio;
  swatch.height = SWATCH_PX * ratio;
  const swatchCtx = swatch.getContext('2d');
  swatchCtx.scale(ratio, ratio);
  swatchCtx.fillStyle = AIR_INFO.color; // sky behind see-through blocks
  swatchCtx.fillRect(0, 0, SWATCH_PX, SWATCH_PX);
  drawBlock(swatchCtx, info, 0, 0, SWATCH_PX);

  button.append(swatch);
  button.addEventListener('click', () => selectBlock(name));
  byId('palette').append(button);
  return button;
}

/**
 * Choose the block BUILD puts down. Choosing a block also switches to BUILD.
 * @param {string} name - the block's name
 * @returns {void}
 */
function selectBlock(name) {
  state.selected = name;
  choose(paletteButtons, paletteButtons.find((button) => button.dataset.block === name) ?? null);
  setTool('build');
}

// =============================================================
// Drawing
// =============================================================

/**
 * Make the canvas as big as fits in its box, with square blocks, sharp
 * on Retina screens.
 * @returns {void}
 */
function resizeCanvas() {
  const border = WORLD_BORDER_PX * 2;
  const cell = fitCellSize(frame.clientWidth - border, frame.clientHeight - border, state.world.width, state.world.height);
  if (cell === state.cell) return;
  state.cell = cell;

  // A Retina screen has 2 (or 3) real pixels per CSS pixel. Give the canvas
  // that many real pixels so blocks aren't blurry, and scale the paintbrush to match.
  const ratio = window.devicePixelRatio || 1;
  const width = cell * state.world.width;
  const height = cell * state.world.height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

/**
 * Redraw the whole world.
 * @returns {void}
 */
function draw() {
  if (!state.cell) return; // not sized yet
  drawWorld(ctx, state.world, state.cell, blockInfo, AIR_INFO.color);
}

/**
 * Light up one cell for a moment (a note block singing).
 * @param {number} x - column
 * @param {number} y - row
 * @returns {void}
 */
function flashCell(x, y) {
  draw();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(x * state.cell, y * state.cell, state.cell, state.cell);
  setTimeout(draw, LIGHT_MS);
}

/**
 * Something changed the world: redraw it.
 * @returns {void}
 */
function worldChanged() {
  draw();
}

// =============================================================
// Fingers
// =============================================================

/**
 * Listen for fingers (or a mouse, or a pen) on the world.
 *   pointerdown: touched     pointermove: slid
 *   pointerup:   lifted off  pointercancel: the browser took over
 * @returns {void}
 */
function setupPointer() {
  canvas.addEventListener('pointerdown', (event) => {
    if (pointer) return; // another finger is already building
    try {
      canvas.setPointerCapture(event.pointerId); // keep getting moves if it slides off the edge
    } catch {
      // Building still works without capture.
    }
    const point = pointFrom(event);
    pointer = { id: event.pointerId, ...point };
    if (state.tool === 'use') useBlockAt(point);
    else paintLine(point, point); // a single tap does one cell
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id || state.tool === 'use') return;
    const point = pointFrom(event);
    paintLine(pointer, point);
    pointer = { id: pointer.id, ...point };
  });

  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }
}

/**
 * Where a pointer is, measured from the top-left corner of the world
 * (inside the canvas's border).
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left - canvas.clientLeft, y: event.clientY - box.top - canvas.clientTop };
}

/**
 * BUILD or DIG every cell along a finger's path, so fast swipes leave no gaps.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where the finger is now
 * @returns {void}
 */
function paintLine(from, to) {
  let changed = false;
  for (const [x, y] of cellsAlongLine(from.x, from.y, to.x, to.y, state.cell)) {
    changed = applyTool(state.world, state.tool, x, y, state.selected) || changed;
  }
  if (changed) worldChanged();
}

/**
 * ✋ USE: make the block under the finger do its thing. Blocks that
 * don't do anything give a little "nope" shake.
 * @param {{x: number, y: number}} point - where the finger is, in CSS pixels
 * @returns {void}
 */
function useBlockAt(point) {
  const x = Math.floor(point.x / state.cell);
  const y = Math.floor(point.y / state.cell);
  const info = blockInfo(getBlock(state.world, x, y));
  if (!info?.use) {
    flash(frame, 'nope', 400);
    return;
  }
  info.use({
    world: state.world,
    x,
    y,
    playNote: (midi) => playTones([midi]),
    flash: () => flashCell(x, y),
  });
}

// =============================================================
// The clock
// =============================================================

/**
 * Start the world's clock (if it isn't already running).
 * @returns {void}
 */
function startTicking() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (tick(state.world, SYSTEMS, blockInfo)) worldChanged();
  }, 1000 / TICKS_PER_SECOND);
}

/**
 * Stop the world's clock.
 * @returns {void}
 */
function stopTicking() {
  clearInterval(tickTimer);
  tickTimer = null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail. This includes the `build.html` page checks: manifest, icons, previews, crossorigin font, offline helper, local files exist.

- [ ] **Step 7: Quick look in a real browser**

Run, from the repo:

```bash
python3 -m http.server 8123 >/dev/null 2>&1 &
```

Then save as `$SCRATCH/peek.cjs`, where `$SCRATCH` is the session scratchpad directory:

```js
const { chromium } = require('/home/hamsa/LFG/scripts/share_card/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('http://localhost:8123/build.html');
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.argv[2] });
  console.log('errors:', errors);
  await browser.close();
})();
```

Run: `node $SCRATCH/peek.cjs $SCRATCH/task7.png`, then Read the screenshot.
Expected:
- `errors: []`
- The screenshot shows sky, a grass/dirt/stone ground, and a dirt border.
- The tool row, one "⛏️ BLOCKS" tab, and 15 palette blocks are visible, with note blocks showing letters.

Stop the server afterwards (`kill %1` or `pkill -f "http.server 8123"`).

- [ ] **Step 8: Commit**

```bash
git add build.html js/build.js css/blocks.css tests/build.test.js tests/modules.test.js tests/pages.test.js
git commit -m "Add the Build page: world canvas, BUILD/DIG/USE tools, palette, falling-sand clock"
```

---

### Task 8: Three autosaving worlds, 📷 picture, 🗑️ new world

**Files:**
- Modify: `js/build.js`

**Interfaces:**
- Consumes:
  - from `saves.js`: `WORLD_COUNT`, `loadCurrent`, `loadThumbnail`, `loadWorld`, `saveCurrent`, `saveWorld`
  - from `blocks/registry.js`: `isKnownBlock`
  - from `world.js`: `WORLD_WIDTH`, `WORLD_HEIGHT`
  - from `ui.js`: `filenameForDate(date, 'build')`
  - from `block-art.js`: `drawWorld`
- Produces: no new exports. `state.current` (1–3) is added.

This task is DOM wiring. Its pure parts were tested in Task 5, so here the check is `npm test` (docs/modules) plus Task 10's browser run.

- [ ] **Step 1: Add the imports, settings and state**

Change the imports at the top of `js/build.js` to:

```js
import { AIR, WORLD_HEIGHT, WORLD_WIDTH, defaultWorld, getBlock, setBlock, tick } from './world.js';
import { AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack, isKnownBlock } from './blocks/registry.js';
import { drawBlock, drawWorld } from './block-art.js';
import { WORLD_COUNT, loadCurrent, loadThumbnail, loadWorld, saveCurrent, saveWorld } from './saves.js';
import { listenForUnlock, playTones } from './sound.js';
import { cellsAlongLine, choose, filenameForDate, flash } from './ui.js';
```

Add to the settings section:

```js
/**
 * How long to wait after the last change before saving, in milliseconds.
 * Waiting means a long drag saves once at the end, not 50 times.
 * 🧪 Try this! 5000 to save less often.
 */
const SAVE_DELAY_MS = 1000;

/** Block size for the little world pictures on the 🌍 buttons (24 × 4 = 96 pixels wide). */
const THUMB_CELL_PX = 4;

/**
 * Block size for the 📷 picture (24 × 32 = 768 pixels wide).
 * 🧪 Try this! 64 for a giant poster-sized picture.
 */
const PHOTO_CELL_PX = 32;
```

Add `current: 1,` with the comment `// which world (1 to WORLD_COUNT) is open` to `state`, and declare:

```js
let worldButtons = [];
let saveTimer = null;
```

- [ ] **Step 2: Add the saving functions**

Add a new section after "Drawing":

```js
// =============================================================
// Saving: three worlds, each saving itself as Caleb builds
// =============================================================

/**
 * The browser's storage. Even just LOOKING at localStorage can throw
 * when saving is switched off (Safari, private browsing), so we ask
 * carefully. saves.js copes with getting null back.
 * @returns {Storage|null} localStorage, or null if we're not allowed
 */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * What saves.js needs to know to load a world: the world size now,
 * and which block names still exist.
 * @returns {{width: number, height: number, isKnown: Function}} the options
 */
function loadOptions() {
  return { width: WORLD_WIDTH, height: WORLD_HEIGHT, isKnown: isKnownBlock };
}

/**
 * Draw a world on a new (off-screen) canvas.
 * @param {{width: number, height: number, cells: string[]}} world - the world
 * @param {number} cell - block size in pixels
 * @returns {HTMLCanvasElement} the picture
 */
function pictureOf(world, cell) {
  const picture = document.createElement('canvas');
  picture.width = world.width * cell;
  picture.height = world.height * cell;
  drawWorld(picture.getContext('2d'), world, cell, blockInfo, AIR_INFO.color);
  return picture;
}

/**
 * Save the open world (and its little picture) right now.
 * If saving fails, show the "can't save here" badge, but keep playing.
 * @returns {void}
 */
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const thumbnail = pictureOf(state.world, THUMB_CELL_PX).toDataURL('image/png');
  const saved = saveWorld(state.current, state.world, thumbnail, storage())
    && saveCurrent(state.current, storage());
  byId('save-problem').hidden = saved;
  updateWorldButtons();
}

/**
 * Save soon: SAVE_DELAY_MS after the last change.
 * @returns {void}
 */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

/**
 * Make the 🌍 1 / 2 / 3 buttons in the top bar.
 * @returns {void}
 */
function buildWorldButtons() {
  const holder = byId('worlds');
  worldButtons = [];
  for (let n = 1; n <= WORLD_COUNT; n++) {
    const button = document.createElement('button');
    button.className = 'block world-button';
    button.setAttribute('aria-label', `World ${n}`);
    button.addEventListener('click', () => switchWorld(n));
    holder.append(button);
    worldButtons.push(button);
  }
  updateWorldButtons();
}

/**
 * Show each world's little picture (or 🌍 and its number if it's never
 * been saved), and press in the button of the open world.
 * @returns {void}
 */
function updateWorldButtons() {
  worldButtons.forEach((button, index) => {
    const n = index + 1;
    const thumbnail = loadThumbnail(n, storage());
    if (thumbnail) {
      const image = document.createElement('img');
      image.src = thumbnail;
      image.alt = '';
      button.replaceChildren(image);
    } else {
      button.replaceChildren(`🌍${n}`);
    }
  });
  choose(worldButtons, worldButtons[state.current - 1]);
}

/**
 * Switch to another world. The open one is saved first, so nothing is lost.
 * A world that's never been saved starts as a fresh grassy world.
 * @param {number} n - which world, 1 to WORLD_COUNT
 * @returns {void}
 */
function switchWorld(n) {
  if (n === state.current) return;
  saveNow();
  state.current = n;
  state.world = loadWorld(n, storage(), loadOptions()) ?? defaultWorld();
  saveCurrent(n, storage());
  draw();
  updateWorldButtons();
}

/**
 * 🗑️ Start the open world again from fresh grass, after asking first.
 * @returns {void}
 */
function newWorld() {
  if (!window.confirm('🗑️ Start this world again? Everything built here will be gone.')) return;
  state.world = defaultWorld();
  draw();
  saveNow();
}

/**
 * 📷 Save a big picture of the world as a PNG file.
 * @returns {void}
 */
function savePhoto() {
  // A pretend link with a "download" name. Clicking it saves the file.
  const link = document.createElement('a');
  link.download = filenameForDate(new Date(), 'build');
  link.href = pictureOf(state.world, PHOTO_CELL_PX).toDataURL('image/png');
  link.click();
}
```

- [ ] **Step 3: Wire them in**

1. Change `worldChanged` to save as well:

```js
/**
 * Something changed the world: redraw it, and save it soon.
 * @returns {void}
 */
function worldChanged() {
  draw();
  scheduleSave();
}
```

2. In `initBuild()`, right after `frame = byId('world-frame');`, load the last open world, and add the buttons:

```js
  // Open the world Caleb had last time (or a fresh one).
  state.current = loadCurrent(storage());
  state.world = loadWorld(state.current, storage(), loadOptions()) ?? defaultWorld();
  buildWorldButtons();
  byId('photo').addEventListener('click', savePhoto);
  byId('new-world').addEventListener('click', newWorld);
```

3. Change the `visibilitychange` listener body to save when hidden, and add a `pagehide` save after it:

```js
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTicking();
      saveNow(); // the iPad might close the page while it's hidden
    } else {
      startTicking();
    }
  });
  window.addEventListener('pagehide', saveNow);
```

4. Update the file header: add a line "It also keeps three worlds saved (see saves.js), and makes the 📷 picture."

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, 0 fail (docstrings and module load).

- [ ] **Step 5: Quick look**

Start the server as in Task 7 Step 7, run `node $SCRATCH/peek.cjs $SCRATCH/task8.png`, and Read the screenshot.
Expected:
- `errors: []`
- Three world buttons in the top bar. World 1 is pressed and shows `🌍1`, or a thumbnail if a save happened.

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add js/build.js
git commit -m "Build page: three autosaving worlds, picture saving, new world button"
```

---

### Task 9: Hook up the homepage and offline mode

**Files:**
- Modify: `index.html` (4th big block; link the favorite; header comment says four blocks)
- Modify: `css/blocks.css` (favorites link style)
- Modify: `sw.js` (`PRECACHE` + `CACHE_NAME`)
- Modify: `tests/sw.test.js` (new test; `build.html` in the fonts page list)
- Modify: `tests/pages.test.js` (homepage links the Build page)
- Modify: `README.md` (file table rows for the new files)

**Interfaces:**
- Consumes: every file created in Tasks 2–8

- [ ] **Step 1: Write the failing tests**

In `tests/sw.test.js`:

1. Add `readdirSync` to the `node:fs` import.
2. In the "the helper saves exactly the font stylesheets" test, change the page list to `['index.html', 'music.html', 'draw.html', 'build.html']`.
3. Add:

```js
test('every page and every js file is saved for offline use', () => {
  const { PRECACHE } = loadServiceWorker();
  const scripts = readdirSync(new URL('../js/', import.meta.url), { recursive: true })
    .filter((name) => name.endsWith('.js'))
    .map((name) => `./js/${name}`);
  for (const path of [...scripts, './index.html', './music.html', './draw.html', './build.html']) {
    assert.ok(PRECACHE.includes(path), `PRECACHE is missing ${path}`);
  }
});
```

In `tests/pages.test.js` add:

```js
test('the homepage links to the Build page (big block and favorite thing)', () => {
  const links = [...read('index.html').matchAll(/href="build\.html"/g)];
  assert.equal(links.length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL. The PRECACHE test fails with `PRECACHE is missing ./js/sound.js` (or another new file), and the homepage test fails with `0 !== 2`.

- [ ] **Step 3: Update sw.js**

Add these to `PRECACHE`, keeping the existing order style (pages with pages, scripts with scripts):

```js
  './build.html',
  ...
  './js/sound.js',
  './js/world.js',
  './js/saves.js',
  './js/block-art.js',
  './js/build.js',
  './js/blocks/registry.js',
  './js/blocks/basic.js',
```

Bump `CACHE_NAME` by one: it is `'caleb-v1'` now, so it becomes `'caleb-v2'`. If it's already higher, add one to whatever it is.

- [ ] **Step 4: Update the homepage**

In `index.html`:
1. Add a 4th block after WRITE inside `<nav class="big-blocks">`:

```html
      <a class="block big" href="build.html"><span class="icon">⛏️</span>BUILD</a>
```

2. Change the favorite to a link:

```html
        <li><a href="build.html">⛏️ building with blocks</a></li>
```

3. In the top comment, change "three blocks that link to the toys" to "four blocks that link to the toys".

In `css/blocks.css`, after the `.favorites ul` rule, add:

```css
/* Favorite things that are also toys are links: same text, dotted underline. */
.favorites a {
  color: inherit;
  text-decoration: underline dotted;
}
```

(`.block` with no color class is stone gray, so BUILD is a stone block next to grass, gold and dirt.)

- [ ] **Step 5: Update README.md**

In the file table:
- Add `| \`build.html\` | The Build page layout |` after the `draw.html` row.
- Add after the `js/sound.js` row:

```markdown
| `js/build.js` | Makes the Build page work: tools, palette, clock, saving |
| `js/world.js` | The block world: a grid of block names (pure) |
| `js/blocks/basic.js` | ⛏️ Basic blocks: falling sand, singing note blocks |
| `js/blocks/registry.js` | The list of block packs (add new packs here) |
| `js/block-art.js` | Draws blocks pixel-art style |
| `js/saves.js` | Keeps the three Build worlds saved |
```

Add one "Try this!" tip to the numbered list, continuing its numbering:

```markdown
N. **Slow-motion sand:** in `js/build.js`, set `TICKS_PER_SECOND` to 2.
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add index.html css/blocks.css sw.js tests/sw.test.js tests/pages.test.js README.md
git commit -m "Link the Build page from the homepage and save it for offline use"
```

---

### Task 10: Real-browser check, then ship

**Files:**
- Create (scratchpad only, not committed): `$SCRATCH/check-build.cjs`

- [ ] **Step 1: Write the browser check**

Save as `$SCRATCH/check-build.cjs`:

```js
// Drives build.html in a real browser and checks the Review Focus items.
// Usage: node check-build.cjs <chromium|webkit> <screenshot.png>
const pw = require('/home/hamsa/LFG/scripts/share_card/node_modules/playwright');
const assert = require('node:assert/strict');

const [engine, shot] = process.argv.slice(2);
const URL = 'http://localhost:8123/build.html';

(async () => {
  const browser = await pw[engine].launch();
  const context = await browser.newContext(engine === 'webkit'
    ? { ...pw.devices['iPad Pro 11 landscape'] }
    : { viewport: { width: 1180, height: 820 }, hasTouch: true }); // hasTouch: for the two-finger check
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto(URL);
  await page.waitForTimeout(600);

  /** Cell size and the canvas's inner top-left, from the page. */
  const geometry = () => page.evaluate(() => {
    const c = document.getElementById('world');
    const box = c.getBoundingClientRect();
    return { cell: c.clientWidth / 24, left: box.left + c.clientLeft, top: box.top + c.clientTop };
  });
  /** Screen point at the middle of cell (x, y). */
  const at = async (x, y) => { const g = await geometry(); return [g.left + (x + 0.5) * g.cell, g.top + (y + 0.5) * g.cell]; };
  /** The saved world 1 (or n), decoded to a function (x, y) → name. */
  const saved = async (n = 1) => {
    await page.waitForTimeout(1400); // SAVE_DELAY_MS + a bit
    const data = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `calebhamsa.build.world.${n}`);
    return (x, y) => data.blocks[data.cells[y * data.width + x]];
  };
  const tap = async (x, y) => { const [px, py] = await at(x, y); await page.mouse.click(px, py); };

  // 1. Drag-paint a stone wall fast along row 5 (Review Focus 5: no gaps)
  await page.click('[aria-label="Stone"]');
  let [x0, y0] = await at(2, 5); const [x1] = await at(12, 5);
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y0, { steps: 2 }); await page.mouse.up();
  let get = await saved();
  for (let x = 2; x <= 12; x++) assert.equal(get(x, 5), 'stone', `wall gap at ${x}`);

  // 2. DIG one out
  await page.click('[data-tool="dig"]');
  await tap(5, 5);
  get = await saved();
  assert.equal(get(5, 5), 'air');

  // 3. Sand falls and lands on the grass (row 10), so it rests on row 9
  await page.click('[aria-label="Sand"]'); // also switches back to BUILD
  await tap(18, 0);
  await page.waitForTimeout(1600); // 9 rows at 8 ticks/s
  get = await saved();
  assert.equal(get(18, 9), 'sand');
  assert.equal(get(18, 0), 'air');

  // 4. A note block with USE: no errors (can't hear it headless)
  await page.click('[aria-label="Note C"]');
  await tap(20, 9);
  await page.click('[data-tool="use"]');
  await tap(20, 9);

  // 5. Reload: world 1 comes back
  await page.reload(); await page.waitForTimeout(600);
  get = await saved();
  assert.equal(get(3, 5), 'stone');
  assert.equal(get(20, 9), 'noteC');

  // 6. Switch to world 2 (fresh), build, and back to world 1 (unchanged)
  await page.click('[aria-label="World 2"]');
  await page.click('[aria-label="Gold"]');
  await tap(1, 1);
  const get2 = await saved(2);
  assert.equal(get2(1, 1), 'gold');
  assert.equal(get2(3, 5), 'air');
  await page.click('[aria-label="World 1"]');
  get = await saved(1);
  assert.equal(get(3, 5), 'stone');
  assert.equal(await page.evaluate(() => localStorage.getItem('calebhamsa.build.current')), '1');

  // 7. Resize (rotate) then tap: the tap lands on the right cell (Review Focus 4)
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(300);
  await page.click('[aria-label="Wood"]');
  await tap(7, 3);
  get = await saved();
  assert.equal(get(7, 3), 'wood');
  assert.equal(get(3, 5), 'stone');

  // 8. Two fingers at once: only the first builds (Review Focus 1) — Chromium only (CDP)
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const [ax, ay] = await at(14, 2); const [bx, by] = await at(16, 2);
    await page.click('[aria-label="Obsidian"]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay, id: 1 }, { x: bx, y: by, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    get = await saved();
    assert.equal(get(14, 2), 'obsidian');
    assert.equal(get(16, 2), 'air', 'second finger built a block');
  }

  await page.screenshot({ path: shot });
  assert.deepEqual(errors, []);
  console.log(`${engine}: all checks passed`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it in both engines**

```bash
python3 -m http.server 8123 >/dev/null 2>&1 &
node $SCRATCH/check-build.cjs chromium $SCRATCH/build-chromium.png
node $SCRATCH/check-build.cjs webkit $SCRATCH/build-webkit.png
pkill -f "http.server 8123"
```

Expected: `chromium: all checks passed` and `webkit: all checks passed`.
If a check fails, debug the page code with superpowers:systematic-debugging; don't weaken the check.

- [ ] **Step 3: Look at both screenshots**

Read `$SCRATCH/build-chromium.png` and `$SCRATCH/build-webkit.png`. Check:
- the world fills the space with square blocks and is sharp, not blurry
- the stone wall, the gap, the landed sand, the C note block with its letter, and the wood block are visible
- the grass blocks have green tops
- the world buttons show thumbnails
- nothing overflows sideways

- [ ] **Step 4: Full test run, then push**

```bash
npm test
git status   # should be clean: the check script lives in the scratchpad, outside the repo
git push origin main
```

Expected: tests PASS, 0 fail; the push succeeds (GitHub Pages redeploys in about a minute).

- [ ] **Step 5: Check the live site and close #1**

Run `curl -sI https://calebhamsa.fun/build.html | head -1` until it answers (Pages takes about a minute; re-run it rather than using a long `sleep`).
Expected: `HTTP/2 200`. Then:

```bash
gh issue close 1 --repo Team-Hamsa/calebhamsa.fun --comment "Build page is live at https://calebhamsa.fun/build.html — BUILD/DIG/USE tools, falling sand, singing note blocks, three autosaving worlds and 📷 pictures. The homepage's ⛏️ building with blocks and a new BUILD block both link to it. Next phases: #3 ⚡, #4 💧, #5 ⚙️, #6 🧪."
```

- [ ] **Step 6: Hand-check on the iPad (Caleb's real device)**

Ask the user to try, on the iPad:
- a resting palm while building
- rotating mid-build
- the note blocks being audible after the first tap
- reopening from the home-screen app while offline
