# calebhamsa.fun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Caleb's blocky homepage — a music toy (notes, chords, scales, ear-training) and a drawing/handwriting pad (print + cursive tracing) — in heavily commented vanilla HTML/CSS/JS, and publish it on GitHub Pages at `calebhamsa.fun`.

**Architecture:** Static multi-page site, no build step. Each page loads one ES-module script that exports an `init…()` function; the HTML calls it. Pure logic (music math, trace layout, brush math) is exported from modules that never touch the DOM at import time, so Node's built-in test runner can import and test them.

**Tech Stack:** HTML5, CSS (custom properties, grid, flexbox), JavaScript ES modules, Web Audio API, Canvas 2D, Pointer Events, Google Fonts (Press Start 2P, Andika, Playwrite US Trad), Node 20 `node --test`, GitHub Pages, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-02-calebhamsa-fun-design.md`

## Global Constraints

- Vanilla HTML, CSS, JavaScript only — no frameworks, no bundler, no build step, no npm dependencies (`package.json` has no `dependencies`/`devDependencies`).
- Blocky Minecraft-*inspired* look in our own CSS — no Mojang art, textures, fonts, logos, or the word "Minecraft" anywhere in the site.
- Public site, light personal info: first name and favorites only.
- Every file: plain-language header comment; JSDoc docstring on every function (purpose, `@param`, `@returns`); 🧪 "Try this!" comments next to tweakable values.
- Page scripts touch the DOM only inside exported `init…()` functions (or functions they call) — every module must import cleanly in Node.
- All asset paths relative (no leading `/`) so the site works at both `team-hamsa.github.io/calebhamsa.fun/` and `calebhamsa.fun`.
- Touch targets: homepage blocks ≥120px; toy controls ≥56px (music note blocks excepted on phones, see Task 3).
- Layout works from 360px wide with no horizontal scroll.
- Repo `Team-Hamsa/calebhamsa.fun`, direct pushes to `main`. **No `Co-Authored-By` trailers or AI attribution in commits** (user's global rule).

## Review Focus

1. **Holding down a computer key** auto-repeats `keydown`; expected: one note per press, not a machine-gun. → Task 3 guards `event.repeat`; manual check in Task 3 Step 6.
2. **Changing octave in the middle of a "Which note?" round**; expected: tapping the right note *name* still counts. → Task 1 tests `isSameNote` across octaves; Task 4 uses it.
3. **Odd text in "your word"** (emoji, digits, leading spaces, 20 letters); expected: only letters and single spaces, max 12, long words shrink to fit the row. → Task 6 tests `sanitizeWord` and `planRow`.
4. **Two fingers or a palm on the tablet canvas**; expected: each finger draws its own line, never a zig-zag between them. → Task 5 tracks strokes per `pointerId`; manual check in Task 5 Step 7.
5. **Rotating a tablet / resizing the window mid-drawing**; expected: the drawing survives and guide letters redraw at the new size. → Task 5 copies ink across resize; Task 6 redraws guides; manual checks in Task 5 Step 7 and Task 6 Step 7.

(Also covered: a fast swipe with the block brush leaves no gaps → Task 5 test.)

---

### Task 1: Music theory module + tests

**Files:**
- Create: `package.json`
- Create: `js/music-theory.js`
- Test: `tests/music-theory.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `js/music-theory.js`):
  - `A4_HZ: number` (440), `A4_MIDI: number` (69), `MIN_OCTAVE = 2`, `MAX_OCTAVE = 6`
  - `SHARP_NAMES: string[12]`, `FLAT_NAMES: string[12]`
  - `CHORDS: { major, minor, dim, aug, dom7 }` → `number[]` intervals
  - `SCALES: { major, minor, pentatonic }` → `number[]` steps
  - `midiToFrequency(midi: number): number`
  - `pitchClass(midi: number): number` (0–11)
  - `octaveOf(midi: number): number`
  - `octaveStart(octave: number): number` (MIDI of that octave's C)
  - `pitchName(midi: number, { useFlats?: boolean }?): string` (e.g. `"C♯"`)
  - `noteName(midi: number, { useFlats?: boolean }?): string` (e.g. `"C♯4"`)
  - `isBlackKey(midi: number): boolean`
  - `isSameNote(a: number, b: number): boolean` (same pitch class)
  - `clampOctave(octave: number): number`
  - `buildChord(rootMidi: number, type: string): number[]` (throws on unknown type)
  - `buildScale(rootMidi: number, type: string): number[]` (root to root; throws on unknown type)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "calebhamsa-fun",
  "private": true,
  "description": "Caleb's blocky homepage. No dependencies! This file only tells Node that our .js files are ES modules, and makes `npm test` run the tests.",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing tests — `tests/music-theory.test.js`**

```js
/**
 * music-theory.test.js — automatic checks for the music brain.
 *
 * Each test() below is one music fact. `npm test` runs them all and
 * shouts if any fact comes out wrong. You can read this file like a
 * list of music lessons!
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  A4_HZ, MIN_OCTAVE, MAX_OCTAVE, SCALES,
  midiToFrequency, pitchClass, octaveOf, octaveStart, pitchName, noteName,
  isBlackKey, isSameNote, clampOctave, buildChord, buildScale,
} from '../js/music-theory.js';

/**
 * Check two frequencies match to within 0.01 Hz (nobody can hear smaller differences).
 * @param {number} actual - what the code gave us
 * @param {number} expected - what it should be
 */
function assertHz(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.01, `expected ${expected} Hz, got ${actual} Hz`);
}

test('A4 is the tuning note: 440 Hz', () => {
  assert.equal(A4_HZ, 440);
  assertHz(midiToFrequency(69), 440);
});

test('going up an octave doubles the frequency; down halves it', () => {
  assertHz(midiToFrequency(81), 880); // A5
  assertHz(midiToFrequency(57), 220); // A3
});

test('middle C (C4) is about 261.63 Hz', () => {
  assertHz(midiToFrequency(60), 261.63);
});

test('a MIDI number splits into "which note" (pitch class) and "how high" (octave)', () => {
  assert.equal(pitchClass(60), 0);
  assert.equal(pitchClass(61), 1);
  assert.equal(pitchClass(71), 11);
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(59), 3); // B3 is just below middle C
  assert.equal(octaveStart(4), 60);
  assert.equal(octaveStart(2), 36);
});

test('black keys have two names: sharp and flat', () => {
  assert.equal(noteName(61), 'C♯4');
  assert.equal(noteName(61, { useFlats: true }), 'D♭4');
  assert.equal(pitchName(70), 'A♯');
  assert.equal(pitchName(70, { useFlats: true }), 'B♭');
});

test('white keys have the same name either way', () => {
  assert.equal(noteName(60), 'C4');
  assert.equal(noteName(60, { useFlats: true }), 'C4');
  assert.equal(noteName(59), 'B3');
});

test('the black keys are C♯ D♯ F♯ G♯ A♯ in every octave', () => {
  const black = [];
  for (let midi = 60; midi < 72; midi++) {
    if (isBlackKey(midi)) black.push(pitchName(midi));
  }
  assert.deepEqual(black, ['C♯', 'D♯', 'F♯', 'G♯', 'A♯']);
  assert.equal(isBlackKey(73), true); // C♯5
});

test('same note, different octave, still counts as the same note', () => {
  assert.equal(isSameNote(60, 72), true);  // C4 and C5
  assert.equal(isSameNote(61, 49), true);  // C♯4 and C♯3
  assert.equal(isSameNote(60, 61), false); // C and C♯
});

test('octaves stay between MIN_OCTAVE and MAX_OCTAVE', () => {
  assert.equal(clampOctave(1), MIN_OCTAVE);
  assert.equal(clampOctave(9), MAX_OCTAVE);
  assert.equal(clampOctave(4), 4);
});

test('chords on C', () => {
  assert.deepEqual(buildChord(60, 'major'), [60, 64, 67]);     // C E G
  assert.deepEqual(buildChord(60, 'minor'), [60, 63, 67]);     // C E♭ G
  assert.deepEqual(buildChord(60, 'dim'), [60, 63, 66]);       // C E♭ G♭
  assert.deepEqual(buildChord(60, 'aug'), [60, 64, 68]);       // C E G♯
  assert.deepEqual(buildChord(60, 'dom7'), [60, 64, 67, 70]);  // C E G B♭
});

test('chords on a black key: F♯ minor is F♯ A C♯', () => {
  const names = buildChord(66, 'minor').map((midi) => pitchName(midi));
  assert.deepEqual(names, ['F♯', 'A', 'C♯']);
});

test('unknown chord or scale types are an error, not silence', () => {
  assert.throws(() => buildChord(60, 'banana'), /Unknown chord type: banana/);
  assert.throws(() => buildScale(60, 'banana'), /Unknown scale type: banana/);
});

test('every scale recipe adds up to exactly one octave (12 half steps)', () => {
  for (const [type, steps] of Object.entries(SCALES)) {
    const total = steps.reduce((sum, step) => sum + step, 0);
    assert.equal(total, 12, `${type} adds up to ${total}`);
  }
});

test('C major is all white keys, root to root', () => {
  assert.deepEqual(buildScale(60, 'major'), [60, 62, 64, 65, 67, 69, 71, 72]);
});

test('C natural minor and C major pentatonic', () => {
  assert.deepEqual(buildScale(60, 'minor'), [60, 62, 63, 65, 67, 68, 70, 72]);
  assert.deepEqual(buildScale(60, 'pentatonic'), [60, 62, 64, 67, 69, 72]);
});

test('scales on other roots: E major (sharps), B♭ major (flats), F♯ minor', () => {
  const eMajor = buildScale(64, 'major').map((midi) => pitchName(midi));
  assert.deepEqual(eMajor, ['E', 'F♯', 'G♯', 'A', 'B', 'C♯', 'D♯', 'E']);

  const bFlatMajor = buildScale(70, 'major').map((midi) => pitchName(midi, { useFlats: true }));
  assert.deepEqual(bFlatMajor, ['B♭', 'C', 'D', 'E♭', 'F', 'G', 'A', 'B♭']);

  const fSharpMinor = buildScale(66, 'minor').map((midi) => pitchName(midi));
  assert.deepEqual(fSharpMinor, ['F♯', 'G♯', 'A', 'B', 'C♯', 'D', 'E', 'F♯']);
});

test('a scale can climb past the top octave: B major from octave 6', () => {
  const notes = buildScale(octaveStart(6) + 11, 'major'); // B6 = 95
  assert.equal(notes.length, 8);
  assert.equal(notes[7], 107);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd ~/caleb-website && npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/music-theory.js`.

- [ ] **Step 4: Implement `js/music-theory.js`**

```js
/**
 * music-theory.js — the "music brain" of the site.
 *
 * This file knows music facts and does music math. It never touches the
 * screen and never makes a sound. It only answers questions like:
 *   "How fast does the note A4 wiggle?"   midiToFrequency(69)      → 440
 *   "What notes are in a C major chord?"  buildChord(60, 'major')  → [60, 64, 67]
 *
 * Because it only does math, tests/music-theory.test.js can check it
 * automatically, with no browser needed.
 *
 * ---------------------------------------------------------------
 * BIG IDEA: every note is a number (a "MIDI number")
 * ---------------------------------------------------------------
 * Instead of juggling names like "C♯4", we give every piano key a number.
 * Middle C is 60. The very next key up (C♯) is 61. Each +1 is one
 * "half step": the smallest step on a piano, to the very next key,
 * black or white.
 *
 *   C4=60  C♯4=61  D4=62  D♯4=63  E4=64  F4=65  ...  B4=71  C5=72
 *
 * 12 half steps make an octave, so C5 is 60 + 12 = 72.
 * This numbering is called MIDI. Electronic keyboards use it too.
 */

/**
 * The tuning note: A4 wiggles 440 times every second (440 Hz).
 * Every other note is worked out from this one.
 * 🧪 Try this! Change 440 to 415. Every note gets a little lower. That's
 *    roughly how music sounded 300 years ago ("Baroque pitch").
 */
export const A4_HZ = 440;

/** A4's MIDI number. */
export const A4_MIDI = 69;

/**
 * Lowest and highest octave the ◀ ▶ buttons can reach.
 * 🧪 Try this! 1 and 7 for very low rumbles and very high squeaks.
 */
export const MIN_OCTAVE = 2;
export const MAX_OCTAVE = 6;

/** Names of the 12 notes using sharps (♯ means "one half step higher"). Position = pitch class. */
export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** The same 12 notes using flats (♭ means "one half step lower"). C♯ and D♭ are the same key! */
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** Pitch classes of the black keys: C♯/D♭, D♯/E♭, F♯/G♭, G♯/A♭, A♯/B♭. */
const BLACK_KEYS = [1, 3, 6, 8, 10];

/**
 * Chord recipes. Each number says how many half steps above the root (the
 * bottom note) to add another note. Compare major and minor: only the
 * middle number moves, and that one half step is the difference between
 * "happy" and "sad"!
 * 🧪 Try this! Add  sus4: [0, 5, 7],  and a button for it in music.html.
 */
export const CHORDS = {
  major: [0, 4, 7],     // happy
  minor: [0, 3, 7],     // sad: the middle note is one half step lower
  dim: [0, 3, 6],       // spooky: the top note slides down too
  aug: [0, 4, 8],       // dreamy and strange: the top note slides up
  dom7: [0, 4, 7, 10],  // a major chord plus one more note; it wants to "go home"
};

/**
 * Scale recipes: how big each step is as you climb, in half steps.
 *   1 = half step (the very next key)
 *   2 = whole step (skip one key)
 *   3 = a jump of three keys
 * Every recipe adds up to 12, so you land on the root one octave higher.
 * 🧪 Try this! Add  blues: [3, 2, 1, 1, 3, 2],  and a button for it in music.html.
 */
export const SCALES = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],  // the "natural" minor scale
  pentatonic: [2, 2, 3, 2, 3],   // major pentatonic: five notes that all sound good together
};

/**
 * How many times per second a note wiggles (its frequency, in Hz).
 *
 * Going up one half step multiplies the frequency by the same amount
 * every time: the twelfth root of 2 (about 1.0595). Do that 12 times
 * and you've multiplied by exactly 2, which is why an octave up sounds
 * like "the same note, but higher". This evenly-spaced tuning is called
 * "equal temperament", and it's why a song works in every key.
 *
 *   frequency = 440 × 2^((midi − 69) / 12)
 *
 * @param {number} midi - the note's MIDI number (60 = middle C)
 * @returns {number} the frequency in Hz
 */
export function midiToFrequency(midi) {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/**
 * Which of the 12 notes this is, ignoring how high it is.
 * C is 0, C♯ is 1, ... B is 11. Every C on the piano has pitch class 0.
 *
 * @param {number} midi - a MIDI number
 * @returns {number} 0 to 11
 */
export function pitchClass(midi) {
  // The % ("remainder") throws away whole octaves. The extra +12 and % keep
  // negative numbers working too.
  return ((midi % 12) + 12) % 12;
}

/**
 * Which octave a note is in. Middle C (60) starts octave 4.
 *
 * @param {number} midi - a MIDI number
 * @returns {number} the octave number
 */
export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

/**
 * The MIDI number of the C at the bottom of an octave.
 *
 * @param {number} octave - an octave number (4 = the middle of the piano)
 * @returns {number} MIDI number of that octave's C (octave 4 → 60)
 */
export function octaveStart(octave) {
  return (octave + 1) * 12;
}

/**
 * A note's name without the octave number, like "C♯" or "D♭".
 *
 * @param {number} midi - a MIDI number (or a pitch class 0–11)
 * @param {{ useFlats?: boolean }} [options] - useFlats: name black keys with ♭ instead of ♯
 * @returns {string} the note name
 */
export function pitchName(midi, { useFlats = false } = {}) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClass(midi)];
}

/**
 * A note's full name with its octave number, like "C♯4".
 *
 * @param {number} midi - a MIDI number
 * @param {{ useFlats?: boolean }} [options] - useFlats: name black keys with ♭ instead of ♯
 * @returns {string} the note name plus octave
 */
export function noteName(midi, options = {}) {
  return pitchName(midi, options) + octaveOf(midi);
}

/**
 * Is this note a black key on the piano?
 *
 * @param {number} midi - a MIDI number (or a pitch class 0–11)
 * @returns {boolean} true for C♯, D♯, F♯, G♯, A♯ (in any octave)
 */
export function isBlackKey(midi) {
  return BLACK_KEYS.includes(pitchClass(midi));
}

/**
 * Are these two notes the same note name, even in different octaves?
 * (C4 and C5 → true. "Guess it!" uses this, so the right answer counts
 * even if the octave buttons were pressed mid-round.)
 *
 * @param {number} a - a MIDI number
 * @param {number} b - another MIDI number
 * @returns {boolean} true if they have the same pitch class
 */
export function isSameNote(a, b) {
  return pitchClass(a) === pitchClass(b);
}

/**
 * Keep an octave number inside the allowed range.
 *
 * @param {number} octave - the octave someone asked for
 * @returns {number} the same octave, or the nearest allowed one
 */
export function clampOctave(octave) {
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave));
}

/**
 * Build a chord: start on the root and add each interval from the recipe.
 *
 * @param {number} rootMidi - the bottom note of the chord
 * @param {string} type - a recipe name from CHORDS, like 'major'
 * @returns {number[]} the chord's MIDI numbers, lowest first
 */
export function buildChord(rootMidi, type) {
  const intervals = CHORDS[type];
  if (!intervals) throw new Error(`Unknown chord type: ${type}`);
  return intervals.map((interval) => rootMidi + interval);
}

/**
 * Build a scale: start on the root and climb one recipe step at a time,
 * ending on the root one octave up.
 *
 * @param {number} rootMidi - the note the scale starts on
 * @param {string} type - a recipe name from SCALES, like 'major'
 * @returns {number[]} the scale's MIDI numbers, lowest first
 */
export function buildScale(rootMidi, type) {
  const steps = SCALES[type];
  if (!steps) throw new Error(`Unknown scale type: ${type}`);
  const notes = [rootMidi];
  for (const step of steps) {
    const lastNote = notes[notes.length - 1];
    notes.push(lastNote + step);
  }
  return notes;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS — 17 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add package.json js/music-theory.js tests/music-theory.test.js
git commit -m "Add music theory module with tests"
```

---

### Task 2: Shared look, UI helpers, homepage

**Files:**
- Create: `css/blocks.css`
- Create: `js/ui.js`
- Create: `index.html`
- Create: `.nojekyll` (empty)
- Test: `tests/modules.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `js/ui.js`: `choose(buttons: HTMLElement[], chosen: HTMLElement|null): void` (sets `aria-pressed`), `flash(element: HTMLElement, className: string, ms: number): void`
  - CSS classes used by later tasks: `.block` (+ color variants `.grass .dirt .gold .obsidian`), `.block.big`, `.top-bar`, `.page-title`, `.toolbar`, `.panel`, `.label`, `.picker`, `.message`, `.keyboard`, `.note` (`.natural` `.sharp` `.lit` `.dim` `.glow`), `.octave-bar`, `.recording`, `.shake`, `.cheer`, `.draw-main`, `.canvas-stack` (`.wiped`), `.swatch`, `.rainbow`, `.hold-clear` (`.holding`), `.word-input` (`.active`), `.cursive-sample`; body classes `.home-page .music-page .draw-page`.
  - The pressed/selected convention: `aria-pressed="true"` on a `.block` draws it sunken with a white outline.

- [ ] **Step 1: Write the failing module-load test — `tests/modules.test.js`**

```js
/**
 * modules.test.js — does every JavaScript file load without crashing?
 *
 * One typo (like a missing bracket) stops a whole file from loading, and
 * the web page just quietly does nothing. Importing every file here
 * catches that straight away.
 *
 * This works because our page files only touch the web page inside
 * their init...() functions, and these tests never call those.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Every file in js/. Add new ones here! */
const MODULES = ['ui.js', 'music-theory.js'];

for (const name of MODULES) {
  test(`js/${name} loads`, async () => {
    const module = await import(`../js/${name}`);
    assert.ok(module);
  });
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL — `js/ui.js loads` fails with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create `js/ui.js`**

```js
/**
 * ui.js — two tiny helpers that every page borrows.
 *
 * music.js, draw.js and trace.js all need these small jobs done.
 * Keeping them here means the code is written once instead of
 * copied three times.
 */

/**
 * Remembers the "turn the class off" timers that flash() starts, so a
 * quick second flash can cancel the first one's timer. A WeakMap forgets
 * an element automatically when the element is thrown away.
 */
const flashTimers = new WeakMap();

/**
 * Mark one button in a group as chosen, and all the others as not chosen.
 *
 * We use the `aria-pressed` attribute for this. Screen readers say
 * "pressed" out loud, and blocks.css draws pressed blocks sunken in,
 * so one attribute does both jobs.
 *
 * @param {HTMLElement[]} buttons - every button in the group
 * @param {HTMLElement|null} chosen - the one to mark as pressed (null = none of them)
 * @returns {void}
 */
export function choose(buttons, chosen) {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button === chosen));
  }
}

/**
 * Add a CSS class to an element for a moment, then take it away again.
 * Used to make blocks light up, bounce, or shake.
 *
 * @param {HTMLElement} element - what to flash
 * @param {string} className - the CSS class to add (e.g. 'lit')
 * @param {number} ms - how long to keep it, in milliseconds
 * @returns {void}
 */
export function flash(element, className, ms) {
  const timers = flashTimers.get(element) ?? {};
  clearTimeout(timers[className]);

  element.classList.remove(className);
  // Reading the element's size forces the browser to notice the class came
  // off. Without this, tapping the same block twice quickly would not
  // restart its animation.
  void element.offsetWidth;
  element.classList.add(className);

  timers[className] = setTimeout(() => element.classList.remove(className), ms);
  flashTimers.set(element, timers);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS — all tests, including `js/ui.js loads`.

- [ ] **Step 5: Create `css/blocks.css`**

```css
/* =================================================================
   blocks.css: how the whole site LOOKS.

   HTML says WHAT is on the page   (a button, a heading)
   CSS says how it LOOKS           (green, big, chunky)
   JavaScript says what it DOES    (play a sound when tapped)

   Every page uses this one file, so changing a color here changes it
   everywhere. The sections are:
     1. Colors and sizes        5. Homepage
     2. The whole page          6. Music page
     3. Block buttons           7. Draw & Trace page
     4. Bars and panels         8. Animations
   ================================================================= */


/* -----------------------------------------------------------------
   1. Colors and sizes
   These are "custom properties" (CSS variables). We name a color
   once, like --grass, then use it anywhere with var(--grass).
   ----------------------------------------------------------------- */
:root {
  /* 🧪 Try this! Change --sky to #1a1a40 for a night-time world. */
  --sky: #7ec8ff;
  --cloud: #ffffff;
  --grass: #5dbb3f;
  --grass-dark: #3f8a2a;
  --dirt: #8b5a2b;
  --dirt-dark: #5e3b1a;
  --stone: #8f8f8f;
  --stone-dark: #5f5f5f;
  --obsidian: #2b1f3d;
  --obsidian-dark: #120b1c;
  --gold: #f2b705;
  --gold-dark: #a87f00;
  --cave: #34344a;   /* the music page's background */
  --paper: #ffffff;
  --text: #1d1d1d;

  /* clamp(smallest, preferred, biggest): grows with the screen, within limits.
     🧪 Try this! Change 180px to 260px for giant homepage blocks on big screens. */
  --big-block: clamp(120px, 28vw, 180px);

  --pixel-font: 'Press Start 2P', monospace;
}

/* The `hidden` attribute must always win, even over "display: flex" below.
   JavaScript hides things by setting element.hidden = true. */
[hidden] {
  display: none !important;
}

/* Make width and height include padding and borders. Much easier to reason about. */
*, *::before, *::after {
  box-sizing: border-box;
}


/* -----------------------------------------------------------------
   2. The whole page
   ----------------------------------------------------------------- */
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100dvh; /* "dynamic" height: the real visible height on phones */
  display: flex;
  flex-direction: column;
  background: var(--page-bg, var(--sky)); /* each page can set --page-bg */
  color: var(--text);
  font-family: var(--pixel-font);
  overflow-x: hidden;
}

main {
  flex: 1;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}


/* -----------------------------------------------------------------
   3. Block buttons
   Every button on the site is a "block": a chunky square with a dark
   bottom edge that makes it look 3D. Pressing it squishes the edge,
   so the block looks pushed in.
   ----------------------------------------------------------------- */
.block {
  --face: var(--stone);       /* the front of the block */
  --edge: var(--stone-dark);  /* the darker bottom edge */

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 56px;            /* big enough for small fingers */
  min-height: 56px;
  margin-top: 0;
  padding: 10px 14px;

  font-family: var(--pixel-font);
  font-size: 12px;
  line-height: 1.4;
  color: #fff;
  text-decoration: none;      /* links that look like blocks: no underline */
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45);

  background: var(--face);
  border: none;
  border-bottom: 8px solid var(--edge);
  /* A light inner edge on the top-left and a dark one on the bottom-right
     give every block a little pixel bevel. */
  box-shadow:
    inset 4px 4px 0 rgba(255, 255, 255, 0.25),
    inset -4px -4px 0 rgba(0, 0, 0, 0.15);

  cursor: pointer;
  touch-action: manipulation;          /* no double-tap-to-zoom delay */
  user-select: none;                   /* don't select the text when tapped */
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Pressed (finger down) or chosen (aria-pressed="true"):
   the edge shrinks by 6px and the block moves down 6px, so it looks pushed in
   without changing the size of anything around it. */
.block:active,
.block[aria-pressed="true"] {
  border-bottom-width: 2px;
  margin-top: 6px;
}

/* Chosen blocks also get a white outline, so you can see which one is on. */
.block[aria-pressed="true"] {
  outline: 4px solid #fff;
  outline-offset: 2px;
}

/* A dashed gold outline when you move around with the Tab key. */
.block:focus-visible {
  outline: 4px dashed var(--gold);
  outline-offset: 2px;
}

.block:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Color variants: each one just swaps the face and edge colors. */
.block.grass    { --face: var(--grass);    --edge: var(--grass-dark); }
.block.dirt     { --face: var(--dirt);     --edge: var(--dirt-dark); }
.block.gold     { --face: var(--gold);     --edge: var(--gold-dark); }
.block.obsidian { --face: var(--obsidian); --edge: var(--obsidian-dark); }


/* -----------------------------------------------------------------
   4. Bars and panels (shared by the toy pages)
   ----------------------------------------------------------------- */
.top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 0;
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  color: #fff;
  font-size: clamp(14px, 4vw, 24px);
  text-shadow: 3px 3px 0 var(--stone-dark);
}

/* A row of buttons that wraps onto more lines when the screen is narrow. */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* A dark box that holds one mode's extra buttons. */
.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 4px solid var(--stone-dark);
}

.label {
  color: #fff;
  font-size: 12px;
}

/* Drop-down lists (<select>). */
.picker {
  min-height: 56px;
  padding: 8px;
  font-family: var(--pixel-font);
  font-size: 14px;
  background: var(--paper);
  border: 4px solid var(--stone-dark);
}

.message {
  margin: 0;
  min-height: 2.5em;
  text-align: center;
  color: #fff;
  font-size: clamp(12px, 3.5vw, 18px);
  line-height: 1.6;
}


/* -----------------------------------------------------------------
   5. Homepage
   ----------------------------------------------------------------- */
.home-page main {
  align-items: center;
  justify-content: center;
  gap: 32px;
}

.title {
  margin: 24px 0 0;
  text-align: center;
  color: #fff;
  font-size: clamp(22px, 7vw, 48px);
  line-height: 1.4;
  text-shadow: 4px 4px 0 var(--stone-dark);
}

.big-blocks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.block.big {
  flex-direction: column;
  width: var(--big-block);
  height: var(--big-block);
  font-size: clamp(12px, 3vw, 16px);
}

.block.big .icon {
  font-size: clamp(36px, 9vw, 56px);
  text-shadow: none;
}

.favorites {
  max-width: 100%;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.85);
  border: 6px solid var(--dirt);
  font-size: 12px;
  line-height: 2.2;
}

.favorites h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

.favorites ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The sky layer sits behind everything (z-index: -1) and holds the clouds. */
.sky {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

/* A blocky cloud: one wide rectangle plus a smaller one on top (::before). */
.cloud {
  position: absolute;
  left: -200px;
  width: 128px;
  height: 32px;
  background: var(--cloud);
  animation: drift 70s linear infinite; /* 🧪 Try this! 10s for a windy day. */
}

.cloud::before {
  content: '';
  position: absolute;
  left: 24px;
  top: -24px;
  width: 64px;
  height: 24px;
  background: var(--cloud);
}

.cloud.c1 { top: 12%; }
.cloud.c2 { top: 30%; width: 180px; animation-duration: 95s; animation-delay: -40s; }

/* The ground: a stripy grass strip on top of pixel-checkered dirt. */
.ground {
  flex-shrink: 0;
}

.grass-strip {
  height: 20px;
  background: repeating-linear-gradient(90deg, var(--grass) 0 24px, var(--grass-dark) 24px 32px);
}

.dirt-strip {
  height: 56px;
  /* conic-gradient(... 25%, transparent 0) paints one corner square in each
     24×24 tile, which makes a pixel pattern. */
  background:
    conic-gradient(var(--dirt-dark) 25%, transparent 0) 0 0 / 24px 24px,
    var(--dirt);
}


/* -----------------------------------------------------------------
   6. Music page
   ----------------------------------------------------------------- */
.music-page {
  --page-bg: var(--cave);
}

/* The keyboard is a grid of 14 thin columns and 2 rows.
   White keys sit on row 2, black keys on row 1. Every key is 2 columns
   wide, and music.js tells each one which column to start in. */
.keyboard {
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  grid-template-rows: 80px 110px;
  gap: 4px;
}

/* min-width: 0 lets note blocks shrink below 56px on narrow phones,
   so all 12 notes still fit across the screen. */
.block.note {
  min-width: 0;
  padding: 4px 2px 10px;
  align-items: flex-end;
  font-size: clamp(8px, 2.2vw, 14px);
}

.block.note.natural { grid-row: 2; }
.block.note.sharp   { grid-row: 1; --face: var(--obsidian); --edge: var(--obsidian-dark); }

/* A rainbow for the white keys, one color per note name.
   🧪 Try this! Swap two colors and see which notes change. */
.block.note[data-pc="0"]  { --face: #e53935; --edge: #9e2420; } /* C red */
.block.note[data-pc="2"]  { --face: #fb8c00; --edge: #a85d00; } /* D orange */
.block.note[data-pc="4"]  { --face: #fdd835; --edge: #b39a1f; } /* E yellow */
.block.note[data-pc="5"]  { --face: #43a047; --edge: #2c6b2f; } /* F green */
.block.note[data-pc="7"]  { --face: #1e88e5; --edge: #145c9b; } /* G blue */
.block.note[data-pc="9"]  { --face: #5e35b1; --edge: #3d2275; } /* A purple */
.block.note[data-pc="11"] { --face: #d81b60; --edge: #8f1240; } /* B pink */

.block.note.lit  { filter: brightness(1.5); animation: bounce 300ms ease-out; }
.block.note.dim  { opacity: 0.3; }
.block.note.glow { outline: 4px solid var(--gold); outline-offset: -4px; }

.octave-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.block.recording {
  --face: #e53935;
  --edge: #9e2420;
  animation: pulse 1s ease-in-out infinite;
}

/* On bigger screens the keys get taller. */
@media (min-width: 700px) {
  .keyboard {
    grid-template-rows: 110px 150px;
    gap: 6px;
  }
}


/* -----------------------------------------------------------------
   7. Draw & Trace page
   ----------------------------------------------------------------- */
.draw-page {
  height: 100vh;
  height: 100dvh;
}

.draw-main {
  max-width: none;
  min-height: 0;
  gap: 8px;
  padding: 8px 16px 16px;
}

/* Two canvases stacked exactly on top of each other (see draw.js). */
.canvas-stack {
  position: relative;
  flex: 1;
  min-height: 280px;
  background: var(--paper);
  border: 6px solid var(--dirt);
}

.canvas-stack canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

/* touch-action: none means "a finger on this canvas draws, it does NOT
   scroll or zoom the page". Without it, drawing on a tablet moves the page. */
#ink {
  touch-action: none;
  cursor: crosshair;
}

.block.swatch {
  --edge: rgba(0, 0, 0, 0.35); /* a see-through dark edge works for any color */
  width: 56px;
  padding: 0;
}

.block.rainbow {
  --face: linear-gradient(135deg, #e53935, #fdd835, #43a047, #1e88e5, #8e24aa);
  font-size: 24px;
}

/* Hold-to-clear: a light bar fills the button while you hold it.
   When it reaches the end (1 second), the drawing is cleared. */
.block.hold-clear {
  --face: #c62828;
  --edge: #7f1a1a;
  position: relative;
  overflow: hidden;
  touch-action: none;
}

.block.hold-clear::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  background: rgba(255, 255, 255, 0.45);
}

.block.hold-clear.holding::after {
  width: 100%;
  transition: width 1s linear;
}

.word-input {
  min-height: 56px;
  width: 11em;
  max-width: 100%;
  padding: 8px 12px;
  font-family: Andika, sans-serif;
  font-size: 20px;
  border: 4px solid var(--dirt);
}

.word-input.active {
  outline: 4px solid #fff;
  outline-offset: 2px;
}

.cursive-sample {
  font-family: 'Playwrite US Trad', cursive;
  font-size: 16px;
  text-shadow: none;
}


/* -----------------------------------------------------------------
   8. Animations
   @keyframes describes a little movie: where things are at 0%, 50%, 100%...
   ----------------------------------------------------------------- */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  40%      { transform: translateY(-10px); }
}

@keyframes pulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.4); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-8px); }
  75%      { transform: translateX(8px); }
}

@keyframes cheer {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.3) rotate(-3deg); }
}

@keyframes drift {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(100vw + 400px)); }
}

.shake,
.canvas-stack.wiped { animation: shake 400ms; }
.message.cheer      { animation: cheer 700ms ease-out; }

/* Some people's devices ask for less movement. We respect that. */
@media (prefers-reduced-motion: reduce) {
  .cloud,
  .block.note.lit,
  .message.cheer,
  .shake,
  .canvas-stack.wiped,
  .block.recording {
    animation: none;
  }
}
```

- [ ] **Step 6: Create `index.html`**

```html
<!DOCTYPE html>
<!--
  index.html: Caleb's homepage.

  This file says WHAT is on the page: a big title, three blocks that link
  to the toys, and a list of favorite things. How it LOOKS comes from
  css/blocks.css. This page has no JavaScript at all!
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <!-- Makes phones show the page at its real size instead of zoomed out. -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Caleb's Blocky World</title>
  <!-- The little icon in the browser tab: a pickaxe emoji drawn as an image. -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⛏️</text></svg>">
  <!-- The pixel font, from Google Fonts (free to use). -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap">
  <link rel="stylesheet" href="css/blocks.css">
</head>
<body class="home-page">
  <!-- Drifting clouds. aria-hidden: screen readers skip decoration. -->
  <div class="sky" aria-hidden="true">
    <div class="cloud c1"></div>
    <div class="cloud c2"></div>
  </div>

  <main>
    <!-- 🧪 Try this! Change the words in the title. -->
    <h1 class="title">HI, I'M CALEB!</h1>

    <nav class="big-blocks" aria-label="Toys">
      <a class="block big grass" href="music.html"><span class="icon">🎵</span>MUSIC</a>
      <a class="block big gold" href="draw.html"><span class="icon">🎨</span>DRAW</a>
      <!-- "?mode=trace" tells the drawing page to open in tracing mode. -->
      <a class="block big dirt" href="draw.html?mode=trace"><span class="icon">✍️</span>WRITE</a>
    </nav>

    <section class="favorites">
      <h2>My favorite things</h2>
      <!-- 🧪 Try this! Ask Caleb for a new favorite and add a line: <li>🦖 dinosaurs</li> -->
      <ul>
        <li>🎵 music</li>
        <li>🎨 drawing</li>
        <li>✍️ writing</li>
        <li>⛏️ building with blocks</li>
      </ul>
    </section>
  </main>

  <footer class="ground" aria-hidden="true">
    <div class="grass-strip"></div>
    <div class="dirt-strip"></div>
  </footer>
</body>
</html>
```

- [ ] **Step 7: Create `.nojekyll` and smoke-test the homepage over HTTP**

```bash
touch .nojekyll
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!; sleep 1
for p in index.html css/blocks.css js/ui.js; do curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:8765/$p"; done
kill $SERVER
```
Expected: `200` for all three paths.

- [ ] **Step 8: Commit**

```bash
git add css/blocks.css js/ui.js index.html .nojekyll tests/modules.test.js
git commit -m "Add blocky theme, shared UI helpers and homepage"
```

---

### Task 3: Music page — keyboard, sound, NOTES mode, record/playback

**Files:**
- Create: `music.html`
- Create: `js/music.js`
- Modify: `tests/modules.test.js` (add `'music.js'` to `MODULES`)

**Interfaces:**
- Consumes: `clampOctave, isBlackKey, midiToFrequency, octaveStart, pitchName` from `js/music-theory.js`; `choose, flash` from `js/ui.js`.
- Produces: `initMusic(): void` (exported). Internal names that Task 4 relies on: `state` object, `noteBlocks: HTMLButtonElement[]` (index = half steps above C), `modeButtons`, `byId(id)`, `playNotes(midis: number[])`, `soundNotes(midis: number[])`, `showNotes(midis: number[])`, `cancelTimers(timers: number[])`, `handleBlockTap(offset: number)`, `setMode(mode: string)`, `updateLabels()`, `LIGHT_MS`.
- HTML ids/attributes Task 4 relies on (created here): `#keyboard`, `[data-mode]` buttons, `[data-panel="chords|scales|guess"]` panels, `[data-chord]`, `[data-scale]`, `#scale-root`, `#play-scale`, `[data-guess-kind]`, `#new-mystery`, `#hear-again`, `#score`, `#chord-answers`, `[data-answer]`, `#guess-message`.

Note: the CHORDS/SCALES/GUESS buttons exist after this task but their panels' buttons do nothing until Task 4. Note blocks may be narrower than 56px on phones (12 must fit across); they are 110px tall, which keeps them easy to hit.

- [ ] **Step 1: Add `music.js` to the module-load test and watch it fail**

In `tests/modules.test.js`, change:
```js
const MODULES = ['ui.js', 'music-theory.js'];
```
to:
```js
const MODULES = ['ui.js', 'music-theory.js', 'music.js'];
```
Run: `npm test`
Expected: FAIL — `js/music.js loads` with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Create `music.html`**

```html
<!DOCTYPE html>
<!--
  music.html: the Note Blocks page.

  This file lays out the buttons. js/music.js makes them work: it builds
  the 12 note blocks inside <div id="keyboard"> and connects every button.
  Buttons that belong together share a "data-" attribute (like data-mode),
  so music.js can find the whole group at once.
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Note Blocks · Caleb's Blocky World</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎵</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap">
  <link rel="stylesheet" href="css/blocks.css">
</head>
<body class="music-page">
  <header class="top-bar">
    <a class="block home" href="index.html" aria-label="Home">🏠</a>
    <h1 class="page-title">NOTE BLOCKS</h1>
    <!-- Switches black-key names between sharps (C♯) and flats (D♭). -->
    <button class="block" id="flats-toggle">♯ names</button>
  </header>

  <main>
    <!-- music.js fills this with 12 note blocks. -->
    <div id="keyboard" class="keyboard"></div>

    <div class="octave-bar">
      <button class="block" id="octave-down">◀ lower</button>
      <span class="label" id="octave-display">octave 4</span>
      <button class="block" id="octave-up">higher ▶</button>
    </div>

    <div class="toolbar">
      <button class="block grass" data-mode="notes" aria-pressed="true">🎵 NOTES</button>
      <button class="block grass" data-mode="chords" aria-pressed="false">🎶 CHORDS</button>
      <button class="block grass" data-mode="scales" aria-pressed="false">🪜 SCALES</button>
      <button class="block grass" data-mode="guess" aria-pressed="false">👂 GUESS IT!</button>
    </div>

    <!-- Each panel only shows in its own mode (music.js hides the others). -->
    <div class="panel" data-panel="chords" hidden>
      <span class="label">Tap a block to play a chord built on it</span>
      <div class="toolbar">
        <button class="block" data-chord="major" aria-pressed="true">major</button>
        <button class="block" data-chord="minor" aria-pressed="false">minor</button>
        <button class="block" data-chord="dim" aria-pressed="false">dim</button>
        <button class="block" data-chord="aug" aria-pressed="false">aug</button>
        <button class="block" data-chord="dom7" aria-pressed="false">7th</button>
      </div>
    </div>

    <div class="panel" data-panel="scales" hidden>
      <div class="toolbar">
        <label class="label" for="scale-root">Key</label>
        <select class="picker" id="scale-root"></select>
        <button class="block" data-scale="major" aria-pressed="true">major</button>
        <button class="block" data-scale="minor" aria-pressed="false">minor</button>
        <button class="block" data-scale="pentatonic" aria-pressed="false">pentatonic</button>
      </div>
      <button class="block gold" id="play-scale">▶ play the scale</button>
    </div>

    <div class="panel" data-panel="guess" hidden>
      <div class="toolbar">
        <button class="block" data-guess-kind="note" aria-pressed="true">🎵 which note?</button>
        <button class="block" data-guess-kind="chord" aria-pressed="false">🎶 major or minor?</button>
      </div>
      <div class="toolbar">
        <button class="block gold" id="new-mystery">▶ NEW MYSTERY</button>
        <button class="block" id="hear-again">🔁 hear it again</button>
        <span class="label" id="score">⭐ 0</span>
      </div>
      <div class="toolbar" id="chord-answers" hidden>
        <button class="block grass" data-answer="major">😊 major</button>
        <button class="block obsidian" data-answer="minor">😢 minor</button>
      </div>
      <p class="message" id="guess-message">Tap ▶ NEW MYSTERY!</p>
    </div>

    <div class="toolbar">
      <span class="label">Sound:</span>
      <button class="block" data-voice="soft" aria-pressed="true">🎹 soft</button>
      <button class="block" data-voice="beep" aria-pressed="false">🤖 beep</button>
      <button class="block" data-voice="bell" aria-pressed="false">🔔 bell</button>
    </div>

    <div class="toolbar">
      <button class="block" id="record">⏺ RECORD</button>
      <button class="block" id="play-back">▶ PLAY BACK</button>
    </div>
  </main>

  <!-- type="module" lets music.js use "import". We call initMusic() to start. -->
  <script type="module">
    import { initMusic } from './js/music.js';
    initMusic();
  </script>
</body>
</html>
```

- [ ] **Step 3: Create `js/music.js`**

```js
/**
 * music.js — makes the Note Blocks page work.
 *
 * This file is the "hands and mouth" of the music page. It:
 *   1. builds the 12 note blocks on the screen,
 *   2. listens for taps and computer-key presses,
 *   3. makes sounds with the browser's Web Audio API (no sound files!),
 *   4. records tunes and plays them back,
 *   5. runs the modes: NOTES, CHORDS, SCALES and GUESS IT!
 *
 * All the music *math* lives in music-theory.js; this file just asks it
 * questions. music.html calls initMusic() once, when the page loads.
 */
import { clampOctave, isBlackKey, midiToFrequency, octaveStart, pitchName } from './music-theory.js';
import { choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

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

/** How long a block stays lit after it plays, in milliseconds. */
const LIGHT_MS = 300;

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
const VOICES = {
  soft: { wave: 'sine', volume: 0.3 },
  beep: { wave: 'square', volume: 0.1 },
  bell: { wave: 'triangle', volume: 0.3 },
};

/**
 * Which computer key plays which block, counted in half steps above C.
 * The middle row (a s d f g h j) plays the white keys. The row above it
 * (w e t y u) plays the black keys: the same shape as a real piano.
 */
const KEY_TO_OFFSET = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };

/**
 * Which grid column each block starts in. The keyboard grid has 14 thin
 * columns and every block is 2 columns wide. White keys sit side by side
 * (columns 1, 3, 5, ...). Each black key starts halfway across the white
 * key to its left, so it sits over the gap, like on a piano.
 * Position in this list = half steps above C.
 */
const KEY_COLUMNS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember while Caleb plays. */
const state = {
  octave: 4,           // which octave the blocks play (4 = around middle C)
  useFlats: false,     // label black keys with ♭ (true) or ♯ (false)
  mode: 'notes',       // 'notes' | 'chords' | 'scales' | 'guess'
  voice: 'soft',       // one of the VOICES
  isRecording: false,
  recordStartedAt: 0,  // the clock time when recording began (milliseconds)
  recordedEvents: [],  // [{ time: ms after the start, notes: [midi, ...] }, ...]
};

/** The 12 block buttons. Position = half steps above C. Filled by buildKeyboard(). */
let noteBlocks = [];

/** The NOTES / CHORDS / SCALES / GUESS IT! buttons. Filled by initMusic(). */
let modeButtons = [];

/** Timers for notes waiting to be played back, so we can cancel them. */
let playbackTimers = [];

/** The browser's sound machine. Made on the first tap (see getAudio). */
let audioContext = null;

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page: build the blocks and connect every button.
 * music.html calls this once.
 * @returns {void}
 */
export function initMusic() {
  buildKeyboard();
  updateLabels();
  updateOctaveDisplay();

  modeButtons = [...document.querySelectorAll('[data-mode]')];
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }

  const voiceButtons = [...document.querySelectorAll('[data-voice]')];
  for (const button of voiceButtons) {
    button.addEventListener('click', () => {
      state.voice = button.dataset.voice;
      choose(voiceButtons, button);
      soundNotes([octaveStart(state.octave)]); // play a C so you hear the new voice
    });
  }

  byId('flats-toggle').addEventListener('click', () => {
    state.useFlats = !state.useFlats;
    updateLabels();
  });
  byId('octave-down').addEventListener('click', () => changeOctave(-1));
  byId('octave-up').addEventListener('click', () => changeOctave(+1));
  byId('record').addEventListener('click', toggleRecording);
  byId('play-back').addEventListener('click', playBack);

  document.addEventListener('keydown', handleKeyDown);
}

/**
 * Make the 12 note-block buttons and put them in the keyboard grid.
 * @returns {void}
 */
function buildKeyboard() {
  const keyboard = byId('keyboard');
  noteBlocks = [];

  for (let offset = 0; offset < 12; offset++) {
    const block = document.createElement('button');
    block.className = `block note ${isBlackKey(offset) ? 'sharp' : 'natural'}`;
    block.dataset.pc = String(offset); // blocks.css uses this to pick the color
    block.style.gridColumn = `${KEY_COLUMNS[offset]} / span 2`;

    // "pointerdown" fires the instant a finger touches, which feels snappier
    // for music than "click" (which waits for the finger to lift).
    block.addEventListener('pointerdown', () => handleBlockTap(offset));
    // Keyboard users press Enter or Space on a focused button. That makes a
    // "click" with detail 0 (zero mouse clicks), so we play the note then too.
    block.addEventListener('click', (event) => {
      if (event.detail === 0) handleBlockTap(offset);
    });

    keyboard.append(block);
    noteBlocks.push(block);
  }
}

// =============================================================
// Labels and octaves
// =============================================================

/**
 * Write the note names on the blocks, using sharps or flats.
 * @returns {void}
 */
function updateLabels() {
  noteBlocks.forEach((block, offset) => {
    block.textContent = pitchName(offset, { useFlats: state.useFlats });
  });
  byId('flats-toggle').textContent = state.useFlats ? '♭ names' : '♯ names';
}

/**
 * Move the blocks up or down an octave, but not past the ends.
 * @param {number} change - -1 for lower, +1 for higher
 * @returns {void}
 */
function changeOctave(change) {
  state.octave = clampOctave(state.octave + change);
  updateOctaveDisplay();
}

/**
 * Show the current octave and grey out a button at the end of the range.
 * @returns {void}
 */
function updateOctaveDisplay() {
  byId('octave-display').textContent = `octave ${state.octave}`;
  byId('octave-down').disabled = clampOctave(state.octave - 1) === state.octave;
  byId('octave-up').disabled = clampOctave(state.octave + 1) === state.octave;
}

// =============================================================
// Modes and taps
// =============================================================

/**
 * Switch to another mode and show only that mode's panel.
 * @param {string} mode - 'notes', 'chords', 'scales' or 'guess'
 * @returns {void}
 */
function setMode(mode) {
  state.mode = mode;
  choose(modeButtons, modeButtons.find((button) => button.dataset.mode === mode));
  // NOTES mode has no panel, so in NOTES mode every panel hides.
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== mode;
  }
}

/**
 * Someone tapped a block (or pressed its computer key).
 * @param {number} offset - which block: half steps above C (0–11)
 * @returns {void}
 */
function handleBlockTap(offset) {
  const midi = octaveStart(state.octave) + offset;
  playNotes([midi]);
}

/**
 * Play a block when its computer key is pressed.
 * @param {KeyboardEvent} event - the key press
 * @returns {void}
 */
function handleKeyDown(event) {
  // Holding a key down makes the computer repeat it many times a second.
  // event.repeat is true for those copies, and we ignore them: one press,
  // one note.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  // Don't play notes while someone is choosing from a drop-down list.
  if (event.target.closest('select, input, textarea')) return;

  const offset = KEY_TO_OFFSET[event.key.toLowerCase()];
  if (offset === undefined) return; // not one of our music keys
  handleBlockTap(offset);
}

// =============================================================
// Making sound
// =============================================================

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
function getAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

/**
 * Make the sound of one or more notes at the same time (no lights).
 *
 * For each note we build a tiny chain, like plugging in guitar pedals:
 *
 *   oscillator (makes the wave) → gain (volume knob) → speakers
 *
 * The volume knob turns up quickly (ATTACK_SECONDS), then fades away
 * over NOTE_SECONDS, which sounds like a plucked or struck note.
 *
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function soundNotes(midis) {
  const audio = getAudio();
  const voice = VOICES[state.voice];
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

/**
 * Light up the blocks for these notes (only the ones on screen right now).
 * @param {number[]} midis - the notes to show, as MIDI numbers
 * @returns {void}
 */
function showNotes(midis) {
  const firstOnScreen = octaveStart(state.octave);
  for (const midi of midis) {
    const offset = midi - firstOnScreen;
    if (offset >= 0 && offset < 12) flash(noteBlocks[offset], 'lit', LIGHT_MS);
  }
}

/**
 * Play notes the normal way: sound, lights, and (if recording) remember them.
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @returns {void}
 */
function playNotes(midis) {
  soundNotes(midis);
  showNotes(midis);
  if (state.isRecording) {
    state.recordedEvents.push({
      time: performance.now() - state.recordStartedAt,
      notes: [...midis],
    });
  }
}

// =============================================================
// Record and play back
// =============================================================

/**
 * Start recording (forgetting the old tune), or stop if already recording.
 * @returns {void}
 */
function toggleRecording() {
  const button = byId('record');
  state.isRecording = !state.isRecording;
  if (state.isRecording) {
    cancelTimers(playbackTimers); // stop any playback first
    state.recordedEvents = [];
    state.recordStartedAt = performance.now(); // the clock, in milliseconds
  }
  button.textContent = state.isRecording ? '⏹ STOP' : '⏺ RECORD';
  button.classList.toggle('recording', state.isRecording);
}

/**
 * Play the recorded tune with the same timing it was played in.
 *
 * setTimeout(job, ms) means "do this job after ms milliseconds". We set one
 * timer per recorded moment, all at once, and the browser fires each one
 * on time.
 * @returns {void}
 */
function playBack() {
  if (state.isRecording) toggleRecording(); // pressing play stops recording
  cancelTimers(playbackTimers);             // pressing play twice restarts

  if (state.recordedEvents.length === 0) {
    flash(byId('play-back'), 'shake', 400); // nothing recorded yet: wiggle "no"
    return;
  }
  playbackTimers = state.recordedEvents.map((event) =>
    setTimeout(() => playNotes(event.notes), event.time));
}

/**
 * Cancel every timer in a list and empty the list.
 * @param {number[]} timers - timer ids from setTimeout
 * @returns {void}
 */
function cancelTimers(timers) {
  for (const timer of timers) clearTimeout(timer);
  timers.length = 0;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — including `js/music.js loads`.

- [ ] **Step 5: Smoke-test over HTTP**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!; sleep 1
for p in music.html js/music.js js/music-theory.js js/ui.js; do curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:8765/$p"; done
kill $SERVER
```
Expected: `200` for every path.

- [ ] **Step 6: Manual check (Review Focus #1), on a real device**

Open `music.html` (via the local server or the published site) and confirm:
- 12 blocks in piano layout; the first tap makes sound.
- Hold down `a`: **one** C plays, not a stream.
- ◀/▶ change the octave and grey out at 2 and 6; the ♯/♭ toggle relabels the black keys.
- Record → tap a tune → Play Back replays it with the same timing; Play Back with nothing recorded shakes.

Record the result in the commit message body if anything is deferred.

- [ ] **Step 7: Commit**

```bash
git add music.html js/music.js tests/modules.test.js
git commit -m "Add Note Blocks page: keyboard, Web Audio voices, record/playback"
```

---

### Task 4: Music page — CHORDS, SCALES and GUESS IT! modes

**Files:**
- Modify: `js/music.js`

**Interfaces:**
- Consumes: `buildChord, buildScale, isSameNote, pitchClass` (new imports) plus everything from Task 3.
- Produces: no new exports. New internal functions: `setupChordsAndScales()`, `fillScaleRootOptions()`, `updateScaleGlow()`, `playScale()`, `arpeggio(midis)`, `setupGuessIt()`, `setGuessKind(kind)`, `newMystery()`, `hearAgain()`, `handleGuessTap(midi)`, `handleChordAnswer(answer)`, `celebrate(name)`, `tryAgain()`, `say(text)`, `randomInt(n)`.

The chord/scale math is already covered by Task 1's tests; this task is UI wiring, verified by module-load + manual checks.

- [ ] **Step 1: Replace the import line at the top of `js/music.js`**

Old:
```js
import { clampOctave, isBlackKey, midiToFrequency, octaveStart, pitchName } from './music-theory.js';
```
New:
```js
import {
  buildChord, buildScale, clampOctave, isBlackKey, isSameNote,
  midiToFrequency, octaveStart, pitchClass, pitchName,
} from './music-theory.js';
```

- [ ] **Step 2: Add the new settings right after the `LIGHT_MS` constant**

```js
/**
 * Time between notes when playing a scale, in milliseconds.
 * 🧪 Try this! 150 to zoom up the stairs, 800 to climb slowly.
 */
const SCALE_STEP_MS = 350;

/** Time between notes in the "you got it!" celebration, in milliseconds. */
const ARPEGGIO_MS = 120;

/** After a wrong guess, wait this long, then play the mystery again. */
const REPLAY_DELAY_MS = 700;
```

- [ ] **Step 3: Add the new state fields and module variables**

In the `state` object, after `recordedEvents: [],` add:
```js
  chordType: 'major',  // one of the CHORDS recipes in music-theory.js
  scaleRoot: 0,        // the scale's key, as half steps above C (0 = C, 7 = G)
  scaleType: 'major',  // one of the SCALES recipes in music-theory.js
  guessKind: 'note',   // 'note' = "Which note?", 'chord' = "Major or minor?"
  mystery: null,       // the puzzle being guessed: { kind, notes, answer }, or null
  score: 0,
```
After `let playbackTimers = [];` add:
```js
/** Timers for the notes of a scale being played, so we can cancel them. */
let scaleTimers = [];

/** The "which note?" / "major or minor?" buttons. Filled by setupGuessIt(). */
let guessKindButtons = [];
```

- [ ] **Step 4: Wire the new modes in `initMusic()`**

Old:
```js
  byId('play-back').addEventListener('click', playBack);

  document.addEventListener('keydown', handleKeyDown);
```
New:
```js
  byId('play-back').addEventListener('click', playBack);

  setupChordsAndScales();
  setupGuessIt();

  document.addEventListener('keydown', handleKeyDown);
```

- [ ] **Step 5: Update `updateLabels`, `setMode` and `handleBlockTap`**

In `updateLabels()`, old:
```js
  byId('flats-toggle').textContent = state.useFlats ? '♭ names' : '♯ names';
}
```
New:
```js
  byId('flats-toggle').textContent = state.useFlats ? '♭ names' : '♯ names';
  fillScaleRootOptions(); // the Key list uses the same names
}
```

In `setMode()`, old:
```js
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== mode;
  }
}
```
New:
```js
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== mode;
  }
  updateScaleGlow(); // glow in SCALES mode, normal blocks everywhere else
}
```

Replace the whole `handleBlockTap` function with:
```js
/**
 * Someone tapped a block (or pressed its computer key).
 * What happens depends on the mode.
 * @param {number} offset - which block: half steps above C (0–11)
 * @returns {void}
 */
function handleBlockTap(offset) {
  const midi = octaveStart(state.octave) + offset;
  if (state.mode === 'chords') {
    playNotes(buildChord(midi, state.chordType)); // a whole chord built on this note
  } else if (state.mode === 'guess') {
    handleGuessTap(midi);
  } else {
    playNotes([midi]); // NOTES and SCALES: just this one note
  }
}
```

- [ ] **Step 6: Append the CHORDS/SCALES and GUESS IT! sections to the end of `js/music.js`**

```js
// =============================================================
// CHORDS and SCALES modes
// =============================================================

/**
 * Connect the chord-type buttons, scale buttons and the Key list.
 * @returns {void}
 */
function setupChordsAndScales() {
  const chordButtons = [...document.querySelectorAll('[data-chord]')];
  for (const button of chordButtons) {
    button.addEventListener('click', () => {
      state.chordType = button.dataset.chord;
      choose(chordButtons, button);
    });
  }

  const scaleButtons = [...document.querySelectorAll('[data-scale]')];
  for (const button of scaleButtons) {
    button.addEventListener('click', () => {
      state.scaleType = button.dataset.scale;
      choose(scaleButtons, button);
      updateScaleGlow();
    });
  }

  fillScaleRootOptions();
  byId('scale-root').addEventListener('change', (event) => {
    state.scaleRoot = Number(event.target.value);
    updateScaleGlow();
  });
  byId('play-scale').addEventListener('click', playScale);
}

/**
 * Fill the Key drop-down with the 12 note names (sharps or flats).
 * @returns {void}
 */
function fillScaleRootOptions() {
  const select = byId('scale-root');
  select.replaceChildren(); // empty it first
  for (let pc = 0; pc < 12; pc++) {
    const option = document.createElement('option');
    option.value = String(pc);
    option.textContent = pitchName(pc, { useFlats: state.useFlats });
    select.append(option);
  }
  select.value = String(state.scaleRoot);
}

/**
 * In SCALES mode, make the blocks in the scale glow and dim the rest.
 * In any other mode, put every block back to normal.
 *
 * We compare pitch classes (note names), so the glow is right in every octave.
 * @returns {void}
 */
function updateScaleGlow() {
  const inScale = state.mode === 'scales'
    ? new Set(buildScale(state.scaleRoot, state.scaleType).map(pitchClass))
    : null;
  noteBlocks.forEach((block, pc) => {
    block.classList.toggle('glow', inScale !== null && inScale.has(pc));
    block.classList.toggle('dim', inScale !== null && !inScale.has(pc));
  });
}

/**
 * Walk up the chosen scale one note at a time, root to root.
 * @returns {void}
 */
function playScale() {
  cancelTimers(scaleTimers); // pressing it again starts over
  const notes = buildScale(octaveStart(state.octave) + state.scaleRoot, state.scaleType);
  scaleTimers = notes.map((midi, step) =>
    setTimeout(() => playNotes([midi]), step * SCALE_STEP_MS));
}

/**
 * Play notes one after another, quickly (an "arpeggio": a chord played
 * one note at a time).
 * @param {number[]} midis - the notes, lowest first
 * @returns {void}
 */
function arpeggio(midis) {
  midis.forEach((midi, step) => {
    setTimeout(() => playNotes([midi]), step * ARPEGGIO_MS);
  });
}

// =============================================================
// GUESS IT! mode (ear training)
// =============================================================

/**
 * Connect the GUESS IT! buttons.
 * @returns {void}
 */
function setupGuessIt() {
  guessKindButtons = [...document.querySelectorAll('[data-guess-kind]')];
  for (const button of guessKindButtons) {
    button.addEventListener('click', () => setGuessKind(button.dataset.guessKind));
  }
  byId('new-mystery').addEventListener('click', newMystery);
  byId('hear-again').addEventListener('click', hearAgain);
  for (const button of document.querySelectorAll('[data-answer]')) {
    button.addEventListener('click', () => handleChordAnswer(button.dataset.answer));
  }
}

/**
 * Choose which game to play: "Which note?" or "Major or minor?".
 * @param {string} kind - 'note' or 'chord'
 * @returns {void}
 */
function setGuessKind(kind) {
  state.guessKind = kind;
  state.mystery = null;
  choose(guessKindButtons, guessKindButtons.find((button) => button.dataset.guessKind === kind));
  byId('chord-answers').hidden = kind !== 'chord'; // answer buttons only for chords
  say('Tap ▶ NEW MYSTERY!');
}

/**
 * Pick a random mystery and play it, without lighting any blocks
 * (that would give the answer away!).
 * @returns {void}
 */
function newMystery() {
  const root = octaveStart(state.octave) + randomInt(12);
  if (state.guessKind === 'note') {
    state.mystery = { kind: 'note', notes: [root], answer: root };
    say('Which note is it? 👂');
  } else {
    const quality = randomInt(2) === 0 ? 'major' : 'minor';
    state.mystery = { kind: 'chord', notes: buildChord(root, quality), answer: quality };
    say('Major 😊 or minor 😢?');
  }
  soundNotes(state.mystery.notes);
}

/**
 * Play the mystery again, or start one if there isn't one yet.
 * @returns {void}
 */
function hearAgain() {
  if (state.mystery) soundNotes(state.mystery.notes);
  else newMystery();
}

/**
 * A block was tapped during GUESS IT!. It always plays its note, so Caleb
 * can explore. In a "Which note?" round, it's also his answer.
 * @param {number} midi - the tapped note
 * @returns {void}
 */
function handleGuessTap(midi) {
  playNotes([midi]);
  if (state.mystery?.kind !== 'note') return; // no note puzzle right now
  // isSameNote ignores the octave, so C counts as C even after ◀ or ▶.
  if (isSameNote(midi, state.mystery.answer)) {
    celebrate(pitchName(state.mystery.answer, { useFlats: state.useFlats }));
  } else {
    tryAgain();
  }
}

/**
 * The 😊 major or 😢 minor button was tapped.
 * @param {string} answer - 'major' or 'minor'
 * @returns {void}
 */
function handleChordAnswer(answer) {
  if (state.mystery?.kind !== 'chord') return;
  if (answer === state.mystery.answer) {
    const rootName = pitchName(state.mystery.notes[0], { useFlats: state.useFlats });
    celebrate(`${rootName} ${answer}`);
  } else {
    tryAgain();
  }
}

/**
 * Right answer! Add a star, cheer, and play a happy run of notes.
 * @param {string} name - what the mystery was, e.g. "F♯" or "C minor"
 * @returns {void}
 */
function celebrate(name) {
  state.score += 1;
  byId('score').textContent = `⭐ ${state.score}`;
  say(`🎉 YES! It was ${name}!`);
  flash(byId('guess-message'), 'cheer', 700);

  // A happy major arpeggio on the mystery's root, plus the root an octave up.
  const root = state.mystery.notes[0];
  arpeggio([...buildChord(root, 'major'), root + 12]);
  state.mystery = null; // solved, so the next tap won't count again
}

/**
 * Wrong answer: encourage, then play the mystery again so he can listen.
 * @returns {void}
 */
function tryAgain() {
  say('Hmm, try again! 👂');
  const mystery = state.mystery;
  setTimeout(() => {
    // Only replay if it's still the same puzzle (he might have started a new one).
    if (state.mystery === mystery) soundNotes(mystery.notes);
  }, REPLAY_DELAY_MS);
}

/**
 * Show a message under the GUESS IT! buttons.
 * @param {string} text - what to say
 * @returns {void}
 */
function say(text) {
  byId('guess-message').textContent = text;
}

/**
 * A random whole number from 0 up to (but not including) n.
 * @param {number} n - how many possibilities
 * @returns {number} 0, 1, ... n−1
 */
function randomInt(n) {
  return Math.floor(Math.random() * n);
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS (module-load catches any syntax slip in the edits).

- [ ] **Step 8: Manual check on a real device**

- CHORDS: choose minor and tap D; you hear D F A and three blocks light (D, F, A).
- CHORDS: dom7 on B in octave 4; you hear 4 notes, and only the on-screen ones light.
- SCALES: choose Key G, major; F♯ glows and F dims. "▶ play the scale" climbs 8 notes. Switch to pentatonic: 6 notes.
- Toggle ♭ names; the Key list shows D♭, E♭… and keeps the chosen key.
- GUESS IT! "which note?": NEW MYSTERY plays a note with no light. Press ▶ (octave up), then tap the right note name; it counts (**Review Focus #2**).
- GUESS IT! "major or minor?": the answer buttons appear; a wrong answer replays the chord; a right one cheers and the ⭐ count goes up.

- [ ] **Step 9: Commit**

```bash
git add js/music.js
git commit -m "Add chords, scales and Guess it! ear-training modes"
```

---

### Task 5: Draw page — canvas, brushes, colors, hold-to-clear, save

**Files:**
- Create: `draw.html`
- Create: `js/draw.js`
- Test: `tests/draw.test.js`
- Modify: `tests/modules.test.js` (add `'draw.js'`)

**Interfaces:**
- Consumes: `choose, flash` from `js/ui.js`.
- Produces:
  - Exported: `initDraw(): void` (becomes `async` in Task 6), `cellsAlongLine(x0, y0, x1, y1, cell): [number, number][]`, `filenameForDate(date: Date): string`.
  - Internal names Task 6 relies on: `state.mode`, `guideCanvas`, `inkCanvas`, `guideCtx`, `inkCtx`, `cssWidth`, `cssHeight`, `modeButtons`, `byId(id)`, `clearCanvas(context)`, `clearInk()`, `resizeCanvases()`, `setMode(mode)`, `setupPointer()`.
  - HTML ids Task 6 relies on (created here): `#trace-tools`, `[data-style]`, `#trace-name`, `#letter-prev`, `#trace-letter`, `#letter-next`, `#trace-case`, `#trace-word`, `#guide`, `#ink`.

- [ ] **Step 1: Write the failing tests — `tests/draw.test.js`, and add `'draw.js'` to `MODULES`**

```js
/**
 * draw.test.js — checks for the drawing pad's math.
 *
 * Drawing itself needs a screen, but two pieces are pure math we can
 * check here: which grid squares the block brush fills, and the
 * filename a saved picture gets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellsAlongLine, filenameForDate } from '../js/draw.js';

test('a tap with the block brush fills exactly one square', () => {
  assert.deepEqual(cellsAlongLine(5, 5, 5, 5, 24), [[0, 0]]);
});

test('squares are counted from the top-left corner, 24px each', () => {
  assert.deepEqual(cellsAlongLine(50, 30, 50, 30, 24), [[2, 1]]);
});

test('a fast swipe leaves no gaps', () => {
  // The finger jumped 100px between two moments, but every square in between is filled.
  assert.deepEqual(cellsAlongLine(0, 0, 100, 0, 24), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test('diagonal swipes have no gaps and no repeats', () => {
  const cells = cellsAlongLine(0, 0, 200, 130, 24);
  assert.deepEqual(cells[0], [0, 0]);
  assert.deepEqual(cells[cells.length - 1], [8, 5]);
  for (let i = 1; i < cells.length; i++) {
    const [col, row] = cells[i];
    const [prevCol, prevRow] = cells[i - 1];
    assert.ok(Math.abs(col - prevCol) <= 1 && Math.abs(row - prevRow) <= 1, `gap before ${cells[i]}`);
  }
  const keys = cells.map(([col, row]) => `${col},${row}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('saved pictures are named with the date, with leading zeros', () => {
  assert.equal(filenameForDate(new Date(2026, 0, 5)), 'caleb-drawing-2026-01-05.png');
});
```

In `tests/modules.test.js`:
```js
const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js'];
```

Run: `npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/draw.js`.

- [ ] **Step 2: Create `draw.html`**

```html
<!DOCTYPE html>
<!--
  draw.html: the Draw & Trace page.

  Two <canvas> elements are stacked in the white box: "guide" (bottom)
  for practice letters, and "ink" (top) for Caleb's drawing. js/draw.js
  makes the drawing work, and js/trace.js draws the practice letters.

  Opening "draw.html?mode=trace" starts in tracing mode (that's what the
  homepage's WRITE block does).
-->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Draw &amp; Trace · Caleb's Blocky World</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎨</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Three fonts: the pixel font, Andika (made for kids learning to read)
       for print letters, and Playwrite US Trad (made for teaching
       handwriting) for cursive. -->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Andika&family=Playwrite+US+Trad&family=Press+Start+2P&display=swap">
  <link rel="stylesheet" href="css/blocks.css">
</head>
<body class="draw-page">
  <header class="top-bar">
    <a class="block home" href="index.html" aria-label="Home">🏠</a>
    <div class="toolbar">
      <button class="block" data-mode="draw" aria-pressed="true">✏️ DRAW</button>
      <button class="block" data-mode="trace" aria-pressed="false">ABC TRACE</button>
    </div>
    <button class="block gold" id="save" aria-label="Save picture">💾</button>
  </header>

  <main class="draw-main">
    <!-- Tracing controls: only shown in TRACE mode. -->
    <div class="toolbar" id="trace-tools" hidden>
      <button class="block" data-style="print" aria-pressed="true">Aa PRINT</button>
      <button class="block" data-style="cursive" aria-pressed="false"><span class="cursive-sample">Cursive</span></button>
      <button class="block grass" id="trace-name" aria-pressed="true">CALEB</button>
      <button class="block" id="letter-prev" aria-label="Previous letter">◀</button>
      <button class="block" id="trace-letter" aria-pressed="false">A</button>
      <button class="block" id="letter-next" aria-label="Next letter">▶</button>
      <button class="block" id="trace-case">ABC</button>
      <input class="word-input" id="trace-word" type="text" maxlength="12"
             placeholder="your word" autocomplete="off" autocapitalize="off"
             spellcheck="false" aria-label="Your word">
    </div>

    <!-- The two sheets of tracing paper. -->
    <div class="canvas-stack">
      <canvas id="guide"></canvas>
      <canvas id="ink"></canvas>
    </div>

    <!-- draw.js fills this with color swatches. -->
    <div class="toolbar" id="swatches"></div>

    <div class="toolbar">
      <button class="block" data-brush="small" aria-pressed="false">● small</button>
      <button class="block" data-brush="big" aria-pressed="true">⬤ big</button>
      <button class="block" data-brush="block" aria-pressed="false">▦ block</button>
      <button class="block" data-brush="eraser" aria-pressed="false">🧽 eraser</button>
      <button class="block hold-clear" id="clear">🗑 hold to clear</button>
    </div>
  </main>

  <script type="module">
    import { initDraw } from './js/draw.js';
    initDraw();
  </script>
</body>
</html>
```

- [ ] **Step 3: Create `js/draw.js`**

```js
/**
 * draw.js — the drawing pad, and the boss of the Draw & Trace page.
 *
 * The page has TWO canvases stacked like two sheets of tracing paper:
 *
 *     ┌──────────────┐   ink (top): Caleb draws here. It's see-through
 *     │ ┌──────────────┐  wherever he hasn't drawn yet.
 *     └─│──────────────│
 *       └──────────────┘ guide (bottom): practice letters (drawn by trace.js)
 *
 * Erasing and clearing only touch the ink sheet, so the guide letters
 * never get rubbed out.
 *
 * This file handles brushes, colors, drawing with finger, mouse or pen,
 * hold-to-clear, saving a picture, and switching between DRAW and TRACE.
 * draw.html calls initDraw() once, when the page loads.
 */
import { choose, flash } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * The brushes. `size` is the line thickness in screen pixels. For the
 * block brush, it's the size of each square.
 * 🧪 Try this! Make `big` 60 for a giant marker, or `block` 48 for chunkier pixels.
 */
const BRUSHES = {
  small: { kind: 'round', size: 8 },
  big: { kind: 'round', size: 28 },
  block: { kind: 'block', size: 24 },
  eraser: { kind: 'eraser', size: 40 },
};

/**
 * The color swatches, as "hex" colors: #RRGGBB says how much Red, Green
 * and Blue to mix, from 00 (none) to ff (all of it).
 * 🧪 Try this! Add '#ff69b4' (hot pink). A new swatch appears by itself.
 */
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#212121', '#ffffff'];

/**
 * The rainbow brush uses HSL color: Hue, Saturation, Lightness. Hue is
 * an angle around a color wheel:
 *     0 red → 60 yellow → 120 green → 240 blue → 360 back to red
 * Every bit of line turns the wheel by RAINBOW_STEP degrees.
 * 🧪 Try this! 1 for a slow, gentle rainbow; 30 for wild stripes.
 */
const RAINBOW_STEP = 4;

/** How long the clear button must be held down, in milliseconds. */
const CLEAR_HOLD_MS = 1000;

// =============================================================
// What's happening right now ("state")
// =============================================================

/** Everything the page needs to remember. */
const state = {
  mode: 'draw',      // 'draw' | 'trace'
  brush: 'big',      // one of the BRUSHES
  color: '#1e88e5',  // the chosen swatch (blue to start)
  rainbow: false,    // true when the 🌈 swatch is chosen
  hue: 0,            // where the rainbow brush is on the color wheel
};

/**
 * The fingers (or mice, or pens) drawing right now, and where each one
 * was a moment ago. Key = the pointer's id number; value = { x, y }.
 * Every finger gets its own entry, so two fingers draw two separate
 * lines instead of one line zig-zagging between them.
 */
const activeStrokes = new Map();

let guideCanvas;
let inkCanvas;
let guideCtx;   // "context": the paintbrush for a canvas
let inkCtx;

/** The canvases' size in screen ("CSS") pixels. */
let cssWidth = 0;
let cssHeight = 0;

let modeButtons = [];
let brushButtons = [];

/**
 * Shortcut for finding an element by its id="...".
 * @param {string} id - the element's id
 * @returns {HTMLElement} the element
 */
const byId = (id) => document.getElementById(id);

// =============================================================
// Pure math (no screen needed, so tests/draw.test.js checks it)
// =============================================================

/**
 * Which grid squares a line passes through, for the block brush.
 *
 * Fingers move fast. Between two moments a finger might jump 100 pixels,
 * which would leave gaps. So we take little steps along the line (half a
 * square at a time) and collect every square we land in, without repeats.
 *
 * @param {number} x0 - where the line starts (pixels from the left)
 * @param {number} y0 - where the line starts (pixels from the top)
 * @param {number} x1 - where the line ends
 * @param {number} y1 - where the line ends
 * @param {number} cell - the size of one square, in pixels
 * @returns {Array<[number, number]>} [column, row] of each square, in order
 */
export function cellsAlongLine(x0, y0, x1, y1, cell) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(distance / (cell / 2)));
  const seen = new Set();
  const cells = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at the start, 1 at the end
    const col = Math.floor((x0 + (x1 - x0) * t) / cell);
    const row = Math.floor((y0 + (y1 - y0) * t) / cell);
    const key = `${col},${row}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push([col, row]);
    }
  }
  return cells;
}

/**
 * The filename for a saved picture, like "caleb-drawing-2026-10-02.png".
 * @param {Date} date - when it was saved
 * @returns {string} the filename
 */
export function filenameForDate(date) {
  const twoDigits = (n) => String(n).padStart(2, '0'); // 5 → "05"
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1); // getMonth() counts from 0!
  const day = twoDigits(date.getDate());
  return `caleb-drawing-${year}-${month}-${day}.png`;
}

// =============================================================
// Starting up
// =============================================================

/**
 * Set up the whole page. draw.html calls this once.
 * @returns {void}
 */
export function initDraw() {
  guideCanvas = byId('guide');
  inkCanvas = byId('ink');
  guideCtx = guideCanvas.getContext('2d');
  inkCtx = inkCanvas.getContext('2d');

  buildSwatches();
  setupBrushes();
  setupModes();
  setupClear();
  byId('save').addEventListener('click', saveDrawing);
  setupPointer();

  // Keep the canvases the same size as their box, even when the window
  // changes size or a tablet turns sideways. A ResizeObserver calls
  // resizeCanvases() once right away, then after every size change.
  new ResizeObserver(resizeCanvases).observe(inkCanvas.parentElement);

  const startMode = new URLSearchParams(window.location.search).get('mode') === 'trace' ? 'trace' : 'draw';
  setMode(startMode);
}

/**
 * Make the color swatches, plus the 🌈 rainbow one.
 * @returns {void}
 */
function buildSwatches() {
  const holder = byId('swatches');
  const swatches = [];

  /**
   * Make one swatch button.
   * @param {string} label - what a screen reader says
   * @param {() => void} onPick - what happens when it's tapped
   * @returns {HTMLButtonElement} the button
   */
  function makeSwatch(label, onPick) {
    const swatch = document.createElement('button');
    swatch.className = 'block swatch';
    swatch.setAttribute('aria-label', label);
    swatch.addEventListener('click', () => {
      onPick();
      choose(swatches, swatch);
      // Picking a color while the eraser is on probably means "draw now!"
      if (state.brush === 'eraser') selectBrush('big');
    });
    swatches.push(swatch);
    return swatch;
  }

  for (const color of COLORS) {
    const swatch = makeSwatch(`color ${color}`, () => {
      state.color = color;
      state.rainbow = false;
    });
    swatch.style.setProperty('--face', color); // blocks.css paints the block with --face
  }
  const rainbow = makeSwatch('rainbow', () => { state.rainbow = true; });
  rainbow.classList.add('rainbow');
  rainbow.textContent = '🌈';

  holder.append(...swatches);
  choose(swatches, swatches[COLORS.indexOf(state.color)]);
}

/**
 * Connect the brush buttons.
 * @returns {void}
 */
function setupBrushes() {
  brushButtons = [...document.querySelectorAll('[data-brush]')];
  for (const button of brushButtons) {
    button.addEventListener('click', () => selectBrush(button.dataset.brush));
  }
}

/**
 * Switch to a brush and show it as chosen.
 * @param {string} name - one of the BRUSHES
 * @returns {void}
 */
function selectBrush(name) {
  state.brush = name;
  choose(brushButtons, brushButtons.find((button) => button.dataset.brush === name));
}

/**
 * Connect the DRAW / TRACE buttons.
 * @returns {void}
 */
function setupModes() {
  modeButtons = [...document.querySelectorAll('[data-mode]')];
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
}

/**
 * Switch between DRAW and TRACE.
 * @param {string} mode - 'draw' or 'trace'
 * @returns {void}
 */
function setMode(mode) {
  state.mode = mode;
  choose(modeButtons, modeButtons.find((button) => button.dataset.mode === mode));
  byId('trace-tools').hidden = mode !== 'trace';
}

// =============================================================
// Canvas size
// =============================================================

/**
 * Make both canvases match their box on the screen, keeping the drawing.
 *
 * Phone and tablet screens pack 2 or 3 real dots into every "CSS pixel"
 * (that number is window.devicePixelRatio). A canvas with only one dot
 * per CSS pixel would look blurry, so we make the canvas that many times
 * bigger inside, then tell its paintbrush to scale up by the same amount.
 * That way the rest of the code can keep using normal CSS pixels.
 * @returns {void}
 */
function resizeCanvases() {
  const box = inkCanvas.parentElement.getBoundingClientRect();
  const newWidth = Math.round(box.width);
  const newHeight = Math.round(box.height);
  if (newWidth === cssWidth && newHeight === cssHeight) return; // nothing changed
  const dpr = window.devicePixelRatio || 1;

  // Changing a canvas's size wipes it, so copy the drawing first...
  const copy = document.createElement('canvas');
  copy.width = inkCanvas.width;
  copy.height = inkCanvas.height;
  if (copy.width > 0 && copy.height > 0) copy.getContext('2d').drawImage(inkCanvas, 0, 0);
  const oldWidth = cssWidth;
  const oldHeight = cssHeight;

  for (const canvas of [guideCanvas, inkCanvas]) {
    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  cssWidth = newWidth;
  cssHeight = newHeight;

  // ...then paste it back in, the same size as before.
  if (oldWidth > 0 && oldHeight > 0) inkCtx.drawImage(copy, 0, 0, oldWidth, oldHeight);
}

// =============================================================
// Drawing
// =============================================================

/**
 * Listen to fingers, mice and pens on the ink canvas.
 *
 * "Pointer events" treat all three the same way, so one set of code works
 * everywhere:
 *   pointerdown: touched the screen    pointermove: moving
 *   pointerup:   lifted off            pointercancel: the browser took over
 * @returns {void}
 */
function setupPointer() {
  inkCanvas.addEventListener('pointerdown', (event) => {
    // "Capture" means: keep sending this finger's moves to the canvas even
    // if it slides off the edge.
    inkCanvas.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    activeStrokes.set(event.pointerId, point);
    paint(point, point); // a single tap makes a dot
  });

  inkCanvas.addEventListener('pointermove', (event) => {
    const last = activeStrokes.get(event.pointerId);
    if (!last) return; // this pointer isn't touching (a mouse just hovering)
    const point = pointFrom(event);
    paint(last, point);
    activeStrokes.set(event.pointerId, point);
  });

  for (const type of ['pointerup', 'pointercancel']) {
    inkCanvas.addEventListener(type, (event) => activeStrokes.delete(event.pointerId));
  }
}

/**
 * Where a pointer is, measured from the canvas's top-left corner.
 * @param {PointerEvent} event - the pointer event
 * @returns {{x: number, y: number}} the position in CSS pixels
 */
function pointFrom(event) {
  const box = inkCanvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/**
 * Paint from one point to another with the current brush.
 * @param {{x: number, y: number}} from - where the finger was
 * @param {{x: number, y: number}} to - where the finger is now
 * @returns {void}
 */
function paint(from, to) {
  const brush = BRUSHES[state.brush];
  const color = currentColor();

  // 'destination-out' means "rub out whatever is here", which makes an
  // eraser. 'source-over' is normal painting, on top of what's there.
  inkCtx.globalCompositeOperation = brush.kind === 'eraser' ? 'destination-out' : 'source-over';
  inkCtx.fillStyle = color;
  inkCtx.strokeStyle = color;

  if (brush.kind === 'block') {
    for (const [col, row] of cellsAlongLine(from.x, from.y, to.x, to.y, brush.size)) {
      inkCtx.fillRect(col * brush.size, row * brush.size, brush.size, brush.size);
    }
    return;
  }

  if (from.x === to.x && from.y === to.y) {
    // A line with no length draws nothing, so a tap gets a round dot instead.
    inkCtx.beginPath();
    inkCtx.arc(to.x, to.y, brush.size / 2, 0, Math.PI * 2);
    inkCtx.fill();
    return;
  }

  inkCtx.lineWidth = brush.size;
  inkCtx.lineCap = 'round';   // round ends...
  inkCtx.lineJoin = 'round';  // ...and round corners, like a marker
  inkCtx.beginPath();
  inkCtx.moveTo(from.x, from.y);
  inkCtx.lineTo(to.x, to.y);
  inkCtx.stroke();
}

/**
 * The color to paint with right now. The rainbow brush turns the color
 * wheel a little every time it's asked.
 * @returns {string} a CSS color
 */
function currentColor() {
  if (!state.rainbow) return state.color;
  state.hue = (state.hue + RAINBOW_STEP) % 360; // % 360 wraps back around to red
  return `hsl(${state.hue}, 90%, 55%)`;
}

// =============================================================
// Clearing and saving
// =============================================================

/**
 * Wipe one whole canvas clean.
 * @param {CanvasRenderingContext2D} context - the canvas's paintbrush
 * @returns {void}
 */
function clearCanvas(context) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0); // forget the scaling, to wipe every real dot
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.restore();
}

/**
 * Wipe Caleb's drawing (the guide letters stay).
 * @returns {void}
 */
function clearInk() {
  clearCanvas(inkCtx);
}

/**
 * Hold-to-clear: the drawing is only wiped if the button is held for
 * CLEAR_HOLD_MS. Lifting early cancels, so a bump can't erase a masterpiece.
 * @returns {void}
 */
function setupClear() {
  const button = byId('clear');
  let timer = null;

  const startHolding = (event) => {
    event.preventDefault();
    button.classList.add('holding'); // blocks.css fills the button while holding
    timer = setTimeout(() => {
      clearInk();
      button.classList.remove('holding');
      flash(inkCanvas.parentElement, 'wiped', 400);
      timer = null;
    }, CLEAR_HOLD_MS);
  };
  const stopHolding = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove('holding');
  };

  button.addEventListener('pointerdown', startHolding);
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) {
    button.addEventListener(type, stopHolding);
  }
  // On phones, a long press opens a menu. Stop that.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

/**
 * Save the picture as a PNG file: white paper, then the guide, then the ink.
 * @returns {void}
 */
function saveDrawing() {
  const picture = document.createElement('canvas');
  picture.width = inkCanvas.width;
  picture.height = inkCanvas.height;
  const context = picture.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, picture.width, picture.height);
  context.drawImage(guideCanvas, 0, 0);
  context.drawImage(inkCanvas, 0, 0);

  // A pretend link with a "download" name. Clicking it saves the file.
  const link = document.createElement('a');
  link.download = filenameForDate(new Date());
  link.href = picture.toDataURL('image/png');
  link.click();
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — the draw.test.js cases plus `js/draw.js loads`.

- [ ] **Step 5: Smoke-test over HTTP**

```bash
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!; sleep 1
for p in draw.html "draw.html?mode=trace" js/draw.js; do curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:8765/$p"; done
kill $SERVER
```
Expected: `200` for every path.

- [ ] **Step 6: Commit**

```bash
git add draw.html js/draw.js tests/draw.test.js tests/modules.test.js
git commit -m "Add drawing pad: brushes, swatches, rainbow, hold-to-clear, save"
```

- [ ] **Step 7: Manual check (Review Focus #4 and #5), on a real tablet or phone**

- Drawing doesn't scroll the page. Each brush works. The block brush makes grid squares, with no gaps on fast swipes. 🌈 cycles colors.
- **Two fingers at once draw two separate lines** (no zig-zag between them).
- **Rotate the tablet mid-drawing: the drawing is still there.**
- A tap on 🗑 does nothing; holding it for 1s clears (the button fills up, then the box shakes).
- 💾 downloads `caleb-drawing-<today>.png` with a white background.
- Picking a color while the eraser is on switches to the big brush.

---

### Task 6: Tracing — print and cursive worksheets

**Files:**
- Create: `js/trace.js`
- Test: `tests/trace.test.js`
- Modify: `js/draw.js` (wire tracing in)
- Modify: `tests/modules.test.js` (add `'trace.js'`)

**Interfaces:**
- Consumes: `choose` from `js/ui.js`. From `js/draw.js` (internal): `state.mode`, `guideCtx`, `cssWidth`, `cssHeight`, `clearCanvas`, `clearInk`, `setMode`, `resizeCanvases`, `modeButtons`, `byId`.
- Produces (exported from `js/trace.js`):
  - `FONTS: { print: string, cursive: string }`, `FADE_OPACITIES: number[]` (`[0.45, 0.25, 0.12]`), `MAX_WORD_LENGTH = 12`, `NAME = 'Caleb'`
  - `createTraceSettings(): { style: 'print'|'cursive', content: 'name'|'letter'|'word', letterIndex: number, upper: boolean, word: string }`
  - `sanitizeWord(text: string): string`
  - `traceText(settings): string`
  - `stepLetter(settings, change: number): void`
  - `planRow({ textWidth, fontSize, rowWidth, gap }): { fontSize: number, slotWidth: number, copies: number }`
  - `drawGuides(ctx: CanvasRenderingContext2D, width: number, height: number, settings): void`
  - `waitForFonts(): Promise<void>`
  - `setupTraceControls(settings, onChange: () => void): void`

- [ ] **Step 1: Write the failing tests — `tests/trace.test.js`, and add `'trace.js'` to `MODULES`**

```js
/**
 * trace.test.js — checks for the handwriting worksheet maker.
 *
 * These test the parts that are pure logic: what text to show, how a
 * typed word gets cleaned up, and how many fading copies fit in a row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTraceSettings, sanitizeWord, traceText, stepLetter, planRow,
  FADE_OPACITIES, MAX_WORD_LENGTH,
} from '../js/trace.js';

test('print name follows the ABC/abc toggle', () => {
  const settings = createTraceSettings();
  assert.equal(traceText(settings), 'CALEB');
  settings.upper = false;
  assert.equal(traceText(settings), 'Caleb');
});

test('cursive name is always "Caleb" (all-capital cursive is not taught)', () => {
  const settings = createTraceSettings();
  settings.style = 'cursive';
  assert.equal(traceText(settings), 'Caleb');
});

test('single letters follow the ABC/abc toggle', () => {
  const settings = createTraceSettings();
  settings.content = 'letter';
  settings.letterIndex = 1;
  assert.equal(traceText(settings), 'B');
  settings.upper = false;
  assert.equal(traceText(settings), 'b');
});

test('stepping through letters wraps around between A and Z', () => {
  const settings = createTraceSettings();
  stepLetter(settings, -1);
  assert.equal(settings.letterIndex, 25);
  assert.equal(settings.content, 'letter');
  stepLetter(settings, +1);
  assert.equal(settings.letterIndex, 0);
});

test('custom words are shown without extra spaces at the ends', () => {
  const settings = createTraceSettings();
  settings.content = 'word';
  settings.word = ' dog ';
  assert.equal(traceText(settings), 'dog');
});

test('word cleanup keeps letters and single spaces only', () => {
  assert.equal(sanitizeWord('  dog!! 123 cat'), 'dog cat');
  assert.equal(sanitizeWord('🐶dog7'), 'dog');
});

test('a space at the end survives, so you can keep typing the next word', () => {
  assert.equal(sanitizeWord('my '), 'my ');
});

test('words stop at 12 letters', () => {
  assert.equal(sanitizeWord('abcdefghijklmnopqrst'), 'abcdefghijkl');
  assert.equal(sanitizeWord('abcdefghijklmnopqrst').length, MAX_WORD_LENGTH);
});

test('short words get every fading copy', () => {
  const plan = planRow({ textWidth: 100, fontSize: 80, rowWidth: 1000, gap: 40 });
  assert.equal(plan.copies, FADE_OPACITIES.length);
  assert.equal(plan.fontSize, 80);
  assert.equal(plan.slotWidth, 140);
});

test('longer words get fewer copies but always keep an empty slot to write in', () => {
  assert.equal(planRow({ textWidth: 300, fontSize: 80, rowWidth: 1000, gap: 40 }).copies, 1);
  assert.equal(planRow({ textWidth: 300, fontSize: 80, rowWidth: 1100, gap: 40 }).copies, 2);
});

test('words too wide for the row shrink to fit one copy plus an empty slot', () => {
  const plan = planRow({ textWidth: 600, fontSize: 80, rowWidth: 800, gap: 40 });
  assert.equal(plan.copies, 1);
  assert.equal(plan.fontSize, 50);
  assert.equal(plan.slotWidth, 400);
});
```

In `tests/modules.test.js`:
```js
const MODULES = ['ui.js', 'music-theory.js', 'music.js', 'draw.js', 'trace.js'];
```

Run: `npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/trace.js`.

- [ ] **Step 2: Create `js/trace.js`**

```js
/**
 * trace.js — makes handwriting practice sheets on the guide canvas.
 *
 * A practice sheet looks like school handwriting paper:
 *
 *   ──────────────────────────────────────────  top line (capital letters reach here)
 *   ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  dashed middle line (small letters reach here)
 *   Caleb     Caleb      Caleb      (empty)
 *   ──────────────────────────────────────────  baseline (letters sit on it)
 *   dark      lighter    lightest   your turn!
 *
 * Each row repeats the letters, fainter each time ("fade-out"), then
 * leaves an empty space for Caleb to write it by himself.
 *
 * draw.js decides WHEN to draw guides. This file decides WHAT they look
 * like. The DOM is only touched inside setupTraceControls() and
 * waitForFonts(), so tests can import the rest.
 */
import { choose } from './ui.js';

// =============================================================
// Settings to play with
// =============================================================

/**
 * The two handwriting fonts (both free from Google Fonts):
 *   Andika: print letters shaped the way kids learn to read them
 *   Playwrite US Trad: traditional American school cursive, with joined letters
 */
export const FONTS = {
  print: 'Andika, sans-serif',
  cursive: '"Playwrite US Trad", cursive',
};

/**
 * How dark each fading copy is: 1 would be solid, 0 invisible.
 * 🧪 Try this! [0.6, 0.4, 0.2, 0.1] gives four copies before the empty space.
 */
export const FADE_OPACITIES = [0.45, 0.25, 0.12];

/** The longest word the "your word" box accepts. */
export const MAX_WORD_LENGTH = 12;

/** Whose name the CALEB button traces. */
export const NAME = 'Caleb';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LINE_COLOR = '#9a9a9a';
const LETTER_COLOR = '#2b2b2b';

/** Empty space at the left and right ends of each row, in pixels. */
const ROW_PADDING = 24;

/**
 * Where the lines sit inside each row, as a fraction of the row's height.
 * The space below the baseline is room for letters that hang down (g, y, p).
 * 🧪 Try this! Make CAP_FRACTION 0.6 for bigger letters.
 */
const BASELINE_FRACTION = 0.72;
const CAP_FRACTION = 0.5;

// =============================================================
// Pure logic (tests/trace.test.js checks these)
// =============================================================

/**
 * Fresh worksheet settings: print, Caleb's name, capital letters.
 * @returns {{style: string, content: string, letterIndex: number, upper: boolean, word: string}}
 */
export function createTraceSettings() {
  return {
    style: 'print',    // 'print' | 'cursive'
    content: 'name',   // 'name' | 'letter' | 'word'
    letterIndex: 0,    // 0 = A ... 25 = Z
    upper: true,       // capitals (ABC) or lowercase (abc)
    word: '',          // what was typed in the "your word" box
  };
}

/**
 * Clean up what was typed in the "your word" box: only letters and
 * single spaces, at most MAX_WORD_LENGTH characters.
 *
 * Spaces at the start are removed, but one space at the end is kept so
 * you can type "MY DOG" one letter at a time.
 *
 * @param {string} text - what was typed
 * @returns {string} the cleaned-up text
 */
export function sanitizeWord(text) {
  return text
    .replace(/[^A-Za-z ]/g, '')  // drop anything that isn't a letter or space
    .replace(/ +/g, ' ')         // squash runs of spaces into one
    .trimStart()                 // no spaces at the start
    .slice(0, MAX_WORD_LENGTH);
}

/**
 * The text to trace, based on the settings.
 * @param {object} settings - from createTraceSettings()
 * @returns {string} the letters to draw (may be '' for an empty word)
 */
export function traceText(settings) {
  if (settings.content === 'letter') {
    const letter = ALPHABET[settings.letterIndex];
    return settings.upper ? letter : letter.toLowerCase();
  }
  if (settings.content === 'word') {
    return settings.word.trim();
  }
  // The name. Cursive is always written "Caleb": schools don't teach all-capital cursive.
  if (settings.style === 'cursive') return NAME;
  return settings.upper ? NAME.toUpperCase() : NAME;
}

/**
 * Move to the next or previous letter, wrapping from Z back to A.
 * @param {object} settings - from createTraceSettings() (changed in place)
 * @param {number} change - +1 for next, -1 for previous
 * @returns {void}
 */
export function stepLetter(settings, change) {
  settings.letterIndex = (settings.letterIndex + change + ALPHABET.length) % ALPHABET.length;
  settings.content = 'letter';
}

/**
 * Work out how one row fits: how many fading copies, how far apart, and
 * whether the letters must shrink.
 *
 * A row is split into equal "slots" (one copy of the text plus a gap).
 * There must always be room for at least one copy AND one empty slot to
 * write in. If the text is too wide for that, everything shrinks.
 *
 * @param {{textWidth: number, fontSize: number, rowWidth: number, gap: number}} sizes
 *   textWidth: how wide the text is at fontSize; rowWidth: space available; gap: space after each copy
 * @returns {{fontSize: number, slotWidth: number, copies: number}} the plan
 */
export function planRow({ textWidth, fontSize, rowWidth, gap }) {
  let slotWidth = textWidth + gap;
  let scale = 1;
  if (2 * slotWidth > rowWidth) {
    scale = rowWidth / (2 * slotWidth); // shrink so exactly 2 slots fit
    slotWidth *= scale;
  }
  const slots = Math.floor(rowWidth / slotWidth);
  // One slot is kept empty for writing; the rest get copies (up to the number of fade levels).
  const copies = Math.max(1, Math.min(FADE_OPACITIES.length, slots - 1));
  return { fontSize: fontSize * scale, slotWidth, copies };
}

// =============================================================
// Drawing the sheet
// =============================================================

/**
 * Draw the handwriting lines and fading letters onto the guide canvas.
 *
 * Font sizes are worked out by measuring real letters: "H" tells us how
 * tall capitals are and "x" how tall small letters are. The top line goes
 * at capital height and the dashed line at small-letter height, so the
 * lines fit the font exactly.
 *
 * @param {CanvasRenderingContext2D} ctx - the guide canvas's paintbrush
 * @param {number} width - canvas width in CSS pixels
 * @param {number} height - canvas height in CSS pixels
 * @param {object} settings - from createTraceSettings()
 * @returns {void}
 */
export function drawGuides(ctx, width, height, settings) {
  const text = traceText(settings);
  const family = FONTS[settings.style];
  const rows = height >= 600 ? 3 : 2; // 🧪 Try this! Always use 4 rows.
  const rowHeight = height / rows;
  const rowWidth = width - 2 * ROW_PADDING;

  // 1. Choose a font size where capital letters are CAP_FRACTION of the row tall.
  ctx.font = `100px ${family}`;
  const capHeightAt100 = ctx.measureText('H').actualBoundingBoxAscent || 70;
  let fontSize = (100 * rowHeight * CAP_FRACTION) / capHeightAt100;

  // 2. Shrink it if needed so the text fits the row (see planRow).
  ctx.font = `${fontSize}px ${family}`;
  const gap = fontSize * 0.5;
  const plan = planRow({ textWidth: ctx.measureText(text).width, fontSize, rowWidth, gap });
  fontSize = plan.fontSize;
  ctx.font = `${fontSize}px ${family}`;

  // 3. Measure the real letter heights at the final size.
  const capHeight = ctx.measureText('H').actualBoundingBoxAscent || fontSize * 0.7;
  const xHeight = ctx.measureText('x').actualBoundingBoxAscent || fontSize * 0.5;

  // 4. Draw each row: lines first, then the fading copies on top.
  for (let row = 0; row < rows; row++) {
    const baseline = row * rowHeight + rowHeight * BASELINE_FRACTION;
    drawLines(ctx, ROW_PADDING, width - ROW_PADDING, baseline - capHeight, baseline - xHeight, baseline);

    if (!text) continue; // an empty word: just the lines
    ctx.fillStyle = LETTER_COLOR;
    for (let copy = 0; copy < plan.copies; copy++) {
      ctx.globalAlpha = FADE_OPACITIES[copy];
      ctx.fillText(text, ROW_PADDING + copy * plan.slotWidth + 8, baseline);
    }
    ctx.globalAlpha = 1; // back to solid for whatever draws next
  }
}

/**
 * Draw one set of handwriting lines: solid top, dashed middle, solid base.
 * @param {CanvasRenderingContext2D} ctx - the paintbrush
 * @param {number} left - where the lines start
 * @param {number} right - where the lines end
 * @param {number} top - y of the top line
 * @param {number} middle - y of the dashed middle line
 * @param {number} base - y of the baseline
 * @returns {void}
 */
function drawLines(ctx, left, right, top, middle, base) {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 2;

  /**
   * Draw one straight line across the row.
   * @param {number} y - how far down the line goes
   * @returns {void}
   */
  const line = (y) => {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  };

  line(top);
  line(base);
  ctx.setLineDash([12, 10]); // 12px of line, 10px of gap, repeating
  line(middle);
  ctx.setLineDash([]);       // back to solid lines
}

/**
 * Wait until both handwriting fonts have downloaded.
 *
 * Web fonts load in the background. If we draw on the canvas before a font
 * arrives, the browser quietly uses a plain font instead, and the canvas
 * never fixes itself (a canvas is just paint, not text). So we wait, then
 * draw again. If the fonts can't load (no internet), the plain fallback
 * fonts still work.
 * @returns {Promise<void>} finishes when the fonts are ready (or failed)
 */
export async function waitForFonts() {
  try {
    await Promise.all([
      document.fonts.load(`64px ${FONTS.print}`),
      document.fonts.load(`64px ${FONTS.cursive}`),
    ]);
  } catch {
    // Fallback fonts are fine.
  }
}

// =============================================================
// Buttons
// =============================================================

/**
 * Connect the tracing buttons. Whenever a setting changes, the buttons
 * update to show it and onChange() is called (draw.js redraws the sheet).
 *
 * @param {object} settings - from createTraceSettings() (changed in place)
 * @param {() => void} onChange - called after every change
 * @returns {void}
 */
export function setupTraceControls(settings, onChange) {
  const byId = (id) => document.getElementById(id);
  const styleButtons = [...document.querySelectorAll('[data-style]')];
  const nameButton = byId('trace-name');
  const letterButton = byId('trace-letter');
  const caseButton = byId('trace-case');
  const wordInput = byId('trace-word');

  /**
   * Make every button show the current settings, then tell draw.js.
   * @returns {void}
   */
  function changed() {
    choose(styleButtons, styleButtons.find((button) => button.dataset.style === settings.style));
    const contentButton = { name: nameButton, letter: letterButton }[settings.content] ?? null;
    choose([nameButton, letterButton], contentButton);
    wordInput.classList.toggle('active', settings.content === 'word');
    letterButton.textContent = traceText({ ...settings, content: 'letter' });
    caseButton.textContent = settings.upper ? 'ABC' : 'abc';
    onChange();
  }

  for (const button of styleButtons) {
    button.addEventListener('click', () => { settings.style = button.dataset.style; changed(); });
  }
  nameButton.addEventListener('click', () => { settings.content = 'name'; changed(); });
  letterButton.addEventListener('click', () => { settings.content = 'letter'; changed(); });
  byId('letter-prev').addEventListener('click', () => { stepLetter(settings, -1); changed(); });
  byId('letter-next').addEventListener('click', () => { stepLetter(settings, +1); changed(); });
  caseButton.addEventListener('click', () => { settings.upper = !settings.upper; changed(); });

  wordInput.addEventListener('input', () => {
    const clean = sanitizeWord(wordInput.value);
    if (clean !== wordInput.value) wordInput.value = clean; // remove what isn't allowed
    settings.word = clean;
    // An empty box goes back to tracing the name.
    settings.content = clean.trim() ? 'word' : 'name';
    changed();
  });

  changed(); // show the starting settings on the buttons
}
```

- [ ] **Step 3: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS — all of the trace.test.js cases plus `js/trace.js loads`.

- [ ] **Step 4: Wire tracing into `js/draw.js`**

(a) Old:
```js
import { choose, flash } from './ui.js';
```
New:
```js
import { choose, flash } from './ui.js';
import { createTraceSettings, drawGuides, setupTraceControls, waitForFonts } from './trace.js';
```

(b) After `let brushButtons = [];` add:
```js
/** The tracing worksheet settings, shared with trace.js. */
let traceSettings = null;
```

(c) Replace the whole `initDraw` function (docstring included) with:
```js
/**
 * Set up the whole page. draw.html calls this once.
 * @returns {Promise<void>} finishes once the handwriting fonts are ready
 */
export async function initDraw() {
  guideCanvas = byId('guide');
  inkCanvas = byId('ink');
  guideCtx = guideCanvas.getContext('2d');
  inkCtx = inkCanvas.getContext('2d');

  buildSwatches();
  setupBrushes();
  setupModes();
  setupClear();
  byId('save').addEventListener('click', saveDrawing);
  setupPointer();

  // Any change to the worksheet gives a fresh sheet: clear the ink, redraw the guide.
  traceSettings = createTraceSettings();
  setupTraceControls(traceSettings, () => {
    clearInk();
    redrawGuides();
  });

  // Keep the canvases the same size as their box, even when the window
  // changes size or a tablet turns sideways. A ResizeObserver calls
  // resizeCanvases() once right away, then after every size change.
  new ResizeObserver(resizeCanvases).observe(inkCanvas.parentElement);

  const startMode = new URLSearchParams(window.location.search).get('mode') === 'trace' ? 'trace' : 'draw';
  setMode(startMode);

  // The handwriting fonts may still be downloading. Draw the guides again
  // once they arrive (see waitForFonts in trace.js).
  await waitForFonts();
  redrawGuides();
}
```

(d) Replace the whole `setMode` function with:
```js
/**
 * Switch between DRAW and TRACE. Going into TRACE starts a fresh sheet.
 * @param {string} mode - 'draw' or 'trace'
 * @returns {void}
 */
function setMode(mode) {
  state.mode = mode;
  choose(modeButtons, modeButtons.find((button) => button.dataset.mode === mode));
  byId('trace-tools').hidden = mode !== 'trace';
  if (mode === 'trace') clearInk();
  redrawGuides();
}
```

(e) At the end of `resizeCanvases()`, old:
```js
  // ...then paste it back in, the same size as before.
  if (oldWidth > 0 && oldHeight > 0) inkCtx.drawImage(copy, 0, 0, oldWidth, oldHeight);
}
```
New:
```js
  // ...then paste it back in, the same size as before.
  if (oldWidth > 0 && oldHeight > 0) inkCtx.drawImage(copy, 0, 0, oldWidth, oldHeight);

  // The guide is simply drawn again to fit the new size.
  redrawGuides();
}
```

(f) Right after the `clearInk` function, add:
```js
/**
 * Draw the guide sheet again: practice letters in TRACE mode, blank in DRAW mode.
 * @returns {void}
 */
function redrawGuides() {
  clearCanvas(guideCtx);
  if (state.mode !== 'trace' || cssWidth === 0) return; // not tracing, or not sized yet
  drawGuides(guideCtx, cssWidth, cssHeight, traceSettings);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS (all suites; module-load confirms the draw.js edits parse).

- [ ] **Step 6: Commit**

```bash
git add js/trace.js js/draw.js tests/trace.test.js tests/modules.test.js
git commit -m "Add print and cursive tracing worksheets with fade-out rows"
```

- [ ] **Step 7: Manual check (Review Focus #3 and #5), on a real device**

- `draw.html?mode=trace` opens in TRACE with CALEB: top line, dashed midline, baseline; 3 fading copies plus an empty space. The guide renders in Andika, not a fallback font.
- Cursive: "Caleb" renders in joined Playwrite cursive, and the lines match the letter heights.
- ◀ ▶ step letters with wrap; ABC/abc switches case; any change clears the ink.
- **Type "🐶 hello123 world!!" in your word: the box shows "hello world" and the row shrinks to fit.**
- Erasing over the guide letters doesn't remove them; 💾 includes the guide in the PNG.
- **Rotate the tablet: the guides redraw to fit.**

---

### Task 7: README — the "play with this code" guide

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the file names, ids and 🧪 constants from Tasks 1–6.
- Produces: documentation only.

- [ ] **Step 1: Write `README.md`**

````markdown
# calebhamsa.fun

Caleb's blocky corner of the internet: 🎵 **Note Blocks** (notes, chords,
scales and an ear-training game), 🎨 **Draw**, and ✍️ **Write** (print and
cursive tracing).

It's built with plain HTML, CSS and JavaScript (no frameworks, no build
step), so every file can be opened, read, changed and tried.

## Run it on your computer

The pages use JavaScript "modules", which browsers only load from a web
server (not by double-clicking the file). Python has a tiny one built in:

```bash
cd caleb-website
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Change a file, save, and reload the page.

## What's where

| File | What it does |
|---|---|
| `index.html` | The homepage: title, three big blocks, favorite things |
| `music.html` | The Note Blocks page layout |
| `draw.html` | The Draw & Trace page layout |
| `css/blocks.css` | How everything **looks**: colors, block buttons, animations |
| `js/music-theory.js` | The music brain: notes as numbers, chords, scales (pure math) |
| `js/music.js` | Makes Note Blocks work: sound, modes, record, Guess it! |
| `js/draw.js` | The drawing pad: brushes, colors, clear, save |
| `js/trace.js` | Handwriting sheets: lines, print/cursive letters, fade-out rows |
| `js/ui.js` | Two little helpers every page shares |
| `tests/` | Automatic checks: run `npm test` (needs Node 20+, nothing to install) |

Every file starts with a comment explaining what it does, and every
function has a comment saying what goes in and what comes out.

## 🧪 Experiments to try

Search the code for `🧪 Try this!` to find them all. Some favorites:

1. **Night sky:** in `css/blocks.css`, change `--sky` to `#1a1a40`.
2. **Old-time tuning:** in `js/music-theory.js`, change `A4_HZ` from 440 to 415.
3. **Long notes:** in `js/music.js`, set `NOTE_SECONDS` to 3.
4. **Hear the click:** set `ATTACK_SECONDS` to 0, then tap a block.
5. **A new chord:** add `sus4: [0, 5, 7],` to `CHORDS`, then copy a chord button in `music.html` and change it to `data-chord="sus4"`.
6. **A new scale:** add `blues: [3, 2, 1, 1, 3, 2],` to `SCALES`, plus a button.
7. **Wild rainbow:** in `js/draw.js`, set `RAINBOW_STEP` to 30.
8. **Hot pink:** add `'#ff69b4'` to `COLORS`.
9. **Four fading copies:** in `js/trace.js`, set `FADE_OPACITIES` to `[0.6, 0.4, 0.2, 0.1]`.
10. **New favorite thing:** add an `<li>` to the list in `index.html`.

## Checklist for a real tablet or phone

Run through this after big changes (Caleb is the best tester):

- [ ] Every homepage block opens its page, and 🏠 comes back.
- [ ] Music: the first tap makes sound. On iPhone/iPad, also check the silent switch is off: it mutes web audio.
- [ ] Music: holding a computer key plays one note, not a stream.
- [ ] Music: chords light all their blocks; scales glow and dim; Guess it! counts a right note even after changing octave.
- [ ] Draw: drawing doesn't scroll the page; two fingers draw two separate lines.
- [ ] Draw: a quick tap on 🗑 does nothing; holding it for 1 second clears.
- [ ] Draw: 💾 downloads a PNG.
- [ ] Trace: the cursive guide is joined-up cursive (not a plain font).
- [ ] Trace: weird text in "your word" (emoji, numbers) is cleaned up.
- [ ] Rotating the tablet keeps the drawing and redraws the guides.
- [ ] Nothing scrolls sideways on a phone.

## Publishing

The site is hosted by GitHub Pages from the `main` branch of
`Team-Hamsa/calebhamsa.fun`. Pushing to `main` updates the live site in
about a minute. There's no build step: GitHub serves these exact files.
````

- [ ] **Step 2: Full local verification**

```bash
npm test
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!; sleep 1
for p in index.html music.html draw.html "draw.html?mode=trace" css/blocks.css js/ui.js js/music-theory.js js/music.js js/draw.js js/trace.js; do curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:8765/$p"; done
kill $SERVER
grep -rn "Minecraft" --include=*.html --include=*.css --include=*.js . || echo "no Minecraft branding: OK"
grep -rnE "(href|src)=\"/" --include=*.html . || echo "no root-absolute paths: OK"
```
Expected: all tests pass; every path `200`; both greps print `OK`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README with experiments and device checklist"
```

---

### Task 8: Publish to GitHub Pages (github.io URL)

**Files:** none (repo + Pages settings).

**Interfaces:**
- Consumes: the committed site on `main`.
- Produces: public repo `Team-Hamsa/calebhamsa.fun`, live at `https://team-hamsa.github.io/calebhamsa.fun/`.

- [ ] **Step 1: Create the repo and push**

```bash
gh repo create Team-Hamsa/calebhamsa.fun --public \
  --description "Caleb's blocky homepage: music, drawing and handwriting toys" \
  --source . --remote origin --push
```
Expected: the repo URL is printed, and `main` is pushed.

- [ ] **Step 2: Turn on Pages from `main` /**

```bash
gh api -X POST repos/Team-Hamsa/calebhamsa.fun/pages -f "source[branch]=main" -f "source[path]=/"
```
Expected: JSON with `"html_url": "https://team-hamsa.github.io/calebhamsa.fun/"`.

- [ ] **Step 3: Wait for the first build**

Poll until it reports `built` (usually under 2 minutes):
```bash
gh api repos/Team-Hamsa/calebhamsa.fun/pages/builds/latest --jq '.status'
```
Expected: `built` (`errored` → read `.error.message` and fix).

- [ ] **Step 4: Verify the live pages**

```bash
for p in "" music.html draw.html css/blocks.css js/music.js js/draw.js js/trace.js; do curl -s -o /dev/null -w "%{http_code} /$p\n" "https://team-hamsa.github.io/calebhamsa.fun/$p"; done
```
Expected: `200` for every path. Then run the README device checklist against this URL on a tablet.

---

### Task 9: Custom domain `calebhamsa.fun` + HTTPS

**Files:**
- Create: `CNAME`

**Interfaces:**
- Consumes: the live Pages site from Task 8.
- Produces: `https://calebhamsa.fun` serving the site with HTTPS enforced; `www` redirecting to the apex.

Steps 1–2 are done **by the user** at GitHub and at the domain registrar.

- [ ] **Step 1 (user): Verify the domain for the Team-Hamsa org**

GitHub → Team-Hamsa org → Settings → Pages → "Add a domain" → `calebhamsa.fun`. GitHub shows a TXT record (`_github-pages-challenge-Team-Hamsa…`). Add it at the registrar, then click Verify. This stops other GitHub accounts from claiming the domain.

- [ ] **Step 2 (user): Add the DNS records at the registrar**

Remove any parking/forwarding records for `@` and `www` first, then add:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | team-hamsa.github.io |

- [ ] **Step 3: Confirm DNS has propagated**

```bash
dig +short calebhamsa.fun A
dig +short www.calebhamsa.fun CNAME
```
Expected: the four `185.199.10x.153` addresses, and `team-hamsa.github.io.`. (Use `getent hosts calebhamsa.fun` if `dig` isn't installed.) Don't continue until this matches, because the github.io URL starts redirecting as soon as the domain is set.

- [ ] **Step 4: Add `CNAME`, push, and set the domain**

```bash
printf 'calebhamsa.fun\n' > CNAME
git add CNAME
git commit -m "Serve the site at calebhamsa.fun"
git push
gh api -X PUT repos/Team-Hamsa/calebhamsa.fun/pages -f cname=calebhamsa.fun
```
Expected: the push succeeds, and the PUT returns `204`/empty.

- [ ] **Step 5: Wait for the HTTPS certificate, then enforce HTTPS**

Poll (it can take up to an hour):
```bash
gh api repos/Team-Hamsa/calebhamsa.fun/pages --jq '{cname, cert: .https_certificate.state, https_enforced}'
```
When `cert` is `approved`:
```bash
gh api -X PUT repos/Team-Hamsa/calebhamsa.fun/pages -F https_enforced=true
```

- [ ] **Step 6: Verify the live domain**

```bash
curl -s -o /dev/null -w "%{http_code} https apex\n" https://calebhamsa.fun/
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}  http apex\n" http://calebhamsa.fun/
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}  www\n" https://www.calebhamsa.fun/
```
Expected: `200`; `301 -> https://calebhamsa.fun/`; `301 -> https://calebhamsa.fun/`.
