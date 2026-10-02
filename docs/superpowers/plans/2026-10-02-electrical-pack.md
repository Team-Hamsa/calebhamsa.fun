# Block Playground Phase 2 (⚡ Electrical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⚡ POWER palette tab to the Build page. It has batteries, wires, switches, lamps, buzzers and clickers that make **real closed-loop circuits**:
- brightness comes from the current
- series lamps are dim and parallel lamps are bright
- short circuits spark
- dots flow along the wires from + to −
- note blocks play when current starts flowing through them

**Architecture:**
- **`js/circuit.js` (pure):** turns the world into a resistor network and solves it with nodal analysis (Gaussian elimination). It knows nothing about block names; it only reads the block fields `conducts`, `part`, `partWhen` and `electric`.
- **`js/blocks/electric.js`:** the ⚡ pack. It defines the blocks, the per-tick `electricSystem`, a `refresh` hook (re-solve only when the circuit changes), and how each block draws its signals.
- **Engine additions:**
  - the world carries `ticks`, `signals`, `events` and `animating`
  - `block-art.js` gains `drawCell` and bare blocks
  - the registry gains hidden blocks and `refreshSignals`
  - `build.js` plays events, redraws on animation without saving, saves when ✋ changes a block, and drives the buzzer hum

**Tech Stack:** Vanilla ES modules, Canvas 2D, Web Audio, Node 20 `node --test`, Playwright (borrowed from `~/LFG`, Chromium with iPad emulation; WebKit can't launch on this server).

**Spec:** `docs/superpowers/specs/2026-10-02-electrical-pack-design.md` (phase 1: `docs/superpowers/specs/2026-10-02-block-playground-design.md`)

**Prototype:** every code block in this plan ran green in a throwaway copy of the repo while the plan was being written: 236/236 tests plus the browser check in Task 6. Copy it exactly.

## Global Constraints

- **No dependencies:** vanilla HTML/CSS/JS, ES modules, no build step.
- **Comments:** every file starts with a plain-language header comment. Every named function has a JSDoc docstring directly above it (`tests/docs.test.js` enforces this). Tweakable values get 🧪 "Try this!" comments.
- **Importable in Node:** modules touch the DOM only inside `init…()` and the functions it calls (`tests/modules.test.js`).
- **Offline:** every `js/` file must be in `sw.js` `PRECACHE` (`tests/sw.test.js` checks this generically). `CACHE_NAME` goes `caleb-v2` → `caleb-v3` once in this plan.
- **Electric numbers:**
  - wire half-resistance 0.0005
  - battery: push 1, resistance 0.05
  - lamp, buzzer and note blocks: resistance 1
  - closed switch and on-beat clicker: resistance 0.001
  - `REFERENCE_CURRENT = 1/(1+0.05)` (one lamp on one battery = level 1)
  - `MAX_LEVEL = 2`
  - `CLICKER_TICKS = 8`
  - `NOTE_ON_LEVEL = 0.25`
- **Battery + end:** top when facing up-down, right when facing sideways.
- **Git:**
  - Repo `Team-Hamsa/calebhamsa.fun`.
  - Commit to `main` locally, task by task; push once at the end (Task 6).
  - **No `Co-Authored-By` trailers or AI attribution in commit messages** (user's global rule).

## Spec refinements made while prototyping (the spec is updated to match)

1. **Short circuit:**
   - The spec said: "+ and − linked only by conductors/closed switches".
   - Now it's that path (where other batteries also count as plain wire), **and** more than 2× `REFERENCE_CURRENT` through the battery.
   - Why: two batteries wired straight to each other are a real short, but two batteries pushing *against* each other carry no current and must not spark.
2. **`drawWorld` keeps its old signature.** It reads `world.signals` and `world.ticks` itself. The new `drawCell(ctx, info, left, top, size, cell, ticks)` draws a block plus its `drawSignals`, and is also used by the palette.
3. **Packs may export `refresh(world, blockInfo)`.** `registry.refreshSignals(world)` runs them, and `build.js`'s `draw()` calls it first. Without this, a just-placed wire would show stale signals until the next tick.
4. **Two batteries in series** give level ≈1.9, not exactly 2, because of internal resistance. The test checks > 1.8.
5. **The tab label is "Power" (⚡ POWER).**

## Review Focus

1. **Placing, digging or flipping mid-circuit:** the picture must update immediately (no stale lamp for a tick) and never crash. → Task 4 `refreshSignals` test; Task 6 browser check flips a switch and reads lamp pixels.
2. **A lit lamp or flowing dots while Caleb is idle:** the screen keeps animating but must **not** keep resetting the save timer (it would never save). → Task 5 tick loop (`animating` → `draw()` only); Task 6 checks the save after reload.
3. **Weird wiring** (a lone wire, a part with one side connected, opposing batteries, a battery touching only another battery, gold walls touching a battery): no crash, physically sensible levels. → Task 3 tests.
4. **The hum when hidden or before the first tap:** silent, and no AudioContext is created early. → Task 5 `setHum` guards plus `stopTicking`. The iPad hand check is in Task 6.
5. **Old saves and the hidden `switchClosed`:** saves and loads round-trip, and the palette never shows the closed switch. → Task 4 tests; Task 6 checks the switch stays open after reload.

---

### Task 1: World clock, signals and events (js/world.js)

**Files:**
- Modify: `js/world.js` (`createWorld`, `tick` + its docstring)
- Modify: `tests/world.test.js` (two new tests)

**Interfaces:**
- Produces: the World type gains these fields, which are not saved:
  - `ticks: number`
  - `signals: object` (per-pack records, each with `cells: Map<index, record>`)
  - `events: object[]`
  - `animating: boolean`
- `tick(world, systems, blockInfo)` adds 1 to `world.ticks` before running the systems. It still returns "did any BLOCK change".

- [ ] **Step 1: Write the failing tests.** Append to `tests/world.test.js` (it already imports `createWorld`, `defaultWorld`, `tick`):

```js
test('a new world starts its clock at 0, with no signals or events yet', () => {
  const world = createWorld(2, 2);
  assert.equal(world.ticks, 0);
  assert.deepEqual(world.signals, {});
  assert.deepEqual(world.events, []);
  assert.equal(world.animating, false);
  assert.equal(defaultWorld().ticks, 0);
});

test('every tick counts up the clock, before the systems run', () => {
  const world = createWorld(2, 2);
  let seenTicks = null;
  tick(world, [(w) => { seenTicks = w.ticks; return false; }], () => undefined);
  assert.equal(seenTicks, 1);
  tick(world, [], () => undefined);
  assert.equal(world.ticks, 2);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/world.test.js`
Expected: FAIL — `undefined !== 0` (no `ticks` yet) in both new tests.

- [ ] **Step 3: Change js/world.js**

Replace `createWorld` and its docstring with:

```js
/**
 * Make an empty world: every cell is air.
 *
 * Besides the blocks, a world carries a few things that are NOT saved:
 *   ticks      how many times the clock has ticked (clickers keep time with it)
 *   signals    what the systems worked out, for drawing (like current in wires)
 *   events     things for the page to do, like { type: 'note', midi: 64, x, y }
 *   animating  set by systems when the picture moves even though no block did
 *
 * @param {number} width - how many blocks across
 * @param {number} height - how many blocks down
 * @returns {{width: number, height: number, cells: string[], ticks: number, signals: object, events: object[], animating: boolean}} the world
 */
export function createWorld(width, height) {
  return {
    width,
    height,
    cells: new Array(width * height).fill(AIR),
    ticks: 0,
    signals: {},
    events: [],
    animating: false,
  };
}
```

In `tick`, add `world.ticks += 1;` as the first line of the body, and change the first three lines of its docstring to:

```js
 * One tick of the world's clock: count it in world.ticks, then let
 * every "system" (a rule like "sand falls") have a turn, in order. Each
 * system changes the world and says true if it changed any BLOCKS.
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. The existing saves round-trip tests still pass, because a loaded world is made by `createWorld` too.

- [ ] **Step 5: Commit**

```bash
git add js/world.js tests/world.test.js
git commit -m "World: a tick clock, signals and events for packs to use"
```

---

### Task 2: Drawing cells with signals (js/block-art.js)

**Files:**
- Modify: `js/block-art.js` (`drawBlock` skips bare blocks; new `drawCell`, `signalsAt`; `drawWorld` uses `drawCell`)
- Modify: `tests/block-art.test.js` (import `drawCell`; three new tests)

**Interfaces:**
- Produces:
  - `drawCell(ctx, info, left, top, size, cell, ticks) → void` (draws the block, then calls `info.drawSignals?.(ctx, info, left, top, size, cell, ticks)`)
  - `drawBlock` draws nothing for `info.bare`
  - `drawWorld(ctx, world, size, blockInfo, sky)` has an unchanged signature. It passes each cell's record (the first `world.signals[*].cells.get(index)`) and `world.ticks`.

- [ ] **Step 1: Write the failing tests.** In `tests/block-art.test.js` change the import line to:

```js
import { SPECKLE_GRID, drawBlock, drawCell, drawWorld, hashName, shade, speckles } from '../js/block-art.js';
```

and append:

```js
test('bare blocks (wire) draw no square of their own', () => {
  const ctx = fakeContext();
  drawBlock(ctx, { name: 'x', color: '#7a4a1e', bare: true }, 0, 0, 40);
  assert.deepEqual(ctx.calls, []);
});

test('drawCell draws the block, then hands its signals to drawSignals', () => {
  const ctx = fakeContext();
  let handed = null;
  const info = { name: 'x', color: '#808080', drawSignals: (...args) => { handed = args; } };
  drawCell(ctx, info, 10, 20, 40, { level: 1 }, 7);
  assert.ok(ctx.calls.length > 0);
  assert.deepEqual(handed.slice(1), [info, 10, 20, 40, { level: 1 }, 7]);
});

test('drawWorld finds each cell\'s signals and the clock in the world', () => {
  const world = createWorld(2, 1);
  world.cells[1] = 'probe';
  world.ticks = 5;
  world.signals = { electric: { cells: new Map([[1, { level: 2 }]]) } };
  let handed = null;
  const info = { name: 'probe', color: '#808080', drawSignals: (...args) => { handed = args; } };
  drawWorld(fakeContext(), world, 10, (name) => (name === 'probe' ? info : undefined), '#7ec8ff');
  assert.deepEqual(handed.slice(2), [10, 0, 10, { level: 2 }, 5]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/block-art.test.js`
Expected: FAIL — `does not provide an export named 'drawCell'`

- [ ] **Step 3: Change js/block-art.js**

1. First line of `drawBlock`'s body:

```js
  if (info.bare) return; // e.g. wire: just the sky behind it (drawSignals draws the rest)
```

2. Insert before the `drawWorld` docstring:

```js
/**
 * Draw one cell: the block, then anything its pack worked out about it
 * (a lamp's glow, current flowing in a wire...), if the block knows how.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - where its left edge goes, in pixels
 * @param {number} top - where its top edge goes, in pixels
 * @param {number} size - how wide and tall it is, in pixels
 * @param {object|undefined} cell - this cell's signals (undefined in the palette)
 * @param {number} ticks - the world's clock, for things that move
 * @returns {void}
 */
export function drawCell(ctx, info, left, top, size, cell, ticks) {
  drawBlock(ctx, info, left, top, size);
  info.drawSignals?.(ctx, info, left, top, size, cell, ticks);
}

/**
 * Find what the packs worked out about one cell (world.signals holds one
 * record per pack, each with a `cells` Map from cell index to details).
 * @param {object} world - the world
 * @param {number} index - the cell's index (y * width + x)
 * @returns {object|undefined} the cell's signals, or undefined if none
 */
function signalsAt(world, index) {
  for (const pack of Object.values(world.signals ?? {})) {
    const cell = pack.cells?.get(index);
    if (cell) return cell;
  }
  return undefined;
}
```

3. In `drawWorld`, replace `if (info) drawBlock(ctx, info, x * size, y * size, size);` with:

```js
      if (info) drawCell(ctx, info, x * size, y * size, size, signalsAt(world, y * world.width + x), world.ticks ?? 0);
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/block-art.js tests/block-art.test.js
git commit -m "Block art: drawCell draws a block plus its signals; bare blocks"
```

---

### Task 3: The circuit solver (js/circuit.js)

**Files:**
- Create: `js/circuit.js`
- Create: `tests/circuit.test.js`
- Modify: `tests/modules.test.js` (add `'circuit.js'` to `MODULES`)
- Modify: `sw.js` (`PRECACHE` gets `'./js/circuit.js'` after `'./js/blocks/basic.js'`)

**Interfaces:**
- Consumes: `getBlock`, `inBounds` from `js/world.js`
- Produces:
  - Constants: `SIDES`, `OPPOSITE`, `WIRE_HALF_RESISTANCE`, `REFERENCE_CURRENT`, `MAX_LEVEL`, `FLOW_MIN`
  - `isElectric(info) → boolean`
  - `activePart(info, world) → part|null`
  - `partAxis(world, x, y, blockInfo) → 'h'|'v'`
  - `plusSide(axis) → 'up'|'right'`
  - `solveLinear(matrix, rhs) → number[]|null`
  - `solveCircuit(world, blockInfo) → { cells: Map<index, { axis, faces, arms, level, spark }>, flowing }`

- [ ] **Step 1: Write the failing tests.** Create `tests/circuit.test.js`:

```js
/**
 * circuit.test.js — checks the electricity math: loops, brightness,
 * series and parallel, switches, short circuits, and which way current
 * flows. Each test draws a little world as a picture made of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { partAxis, plusSide, solveCircuit, solveLinear } from '../js/circuit.js';

/**
 * Stand-in blocks, with the same electric settings as the real ones in
 * js/blocks/ (circuit.js only reads these fields, never block names).
 */
const TEST_BLOCKS = {
  wire: { conducts: true },
  gold: { conducts: true },
  battery: { part: { resistance: 0.05, push: 1 } },
  lamp: { part: { resistance: 1 } },
  noteC: { part: { resistance: 1 } },
  switchOpen: { electric: true },
  switchClosed: { part: { resistance: 0.001 } },
  clicker: { part: { resistance: 0.001 }, partWhen: (world) => Math.floor(world.ticks / 8) % 2 === 0 },
  wood: {},
  stone: {},
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', W: 'wire', B: 'battery', L: 'lamp', S: 'switchOpen', C: 'switchClosed',
  K: 'clicker', Z: 'buzzer', G: 'gold', o: 'wood', s: 'stone', n: 'noteC',
};

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - e.g. ['WWW', 'B.W', 'WLW']
 * @param {number} [ticks] - the world's clock
 * @returns {object} the world
 */
function worldFrom(rows, ticks = 0) {
  const world = createWorld(rows[0].length, rows.length);
  world.ticks = ticks;
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * Solve a picture and return the record for the cell at x, y.
 * @param {string[]} rows - the picture
 * @param {number} x - column
 * @param {number} y - row
 * @param {number} [ticks] - the world's clock
 * @returns {object} the cell's record
 */
function cellAt(rows, x, y, ticks = 0) {
  const world = worldFrom(rows, ticks);
  return solveCircuit(world, blockInfo).cells.get(y * world.width + x);
}

/** One battery and one lamp in a loop. The lamp is at (1, 2). */
const ONE_LAMP = [
  'WWW',
  'B.W',
  'WLW',
];

test('parts face sideways when they have wires on both sides', () => {
  assert.equal(partAxis(worldFrom(['WLW']), 1, 0, blockInfo), 'h');
});

test('parts face up-down when they have wires above and below', () => {
  assert.equal(partAxis(worldFrom(['W', 'L', 'W']), 0, 1, blockInfo), 'v');
});

test('both ways? sideways wins; only one wire? face it; nothing? sideways', () => {
  assert.equal(partAxis(worldFrom(['.W.', 'WLW', '.W.']), 1, 1, blockInfo), 'h');
  assert.equal(partAxis(worldFrom(['.W.', 'WL.', '.W.']), 1, 1, blockInfo), 'v'); // up AND down beats one side
  assert.equal(partAxis(worldFrom(['.L', '.W']), 1, 0, blockInfo), 'v');
  assert.equal(partAxis(worldFrom(['LW']), 0, 0, blockInfo), 'h');
  assert.equal(partAxis(worldFrom(['.L.']), 1, 0, blockInfo), 'h');
});

test('an open switch still counts, so flipping it never turns its neighbors', () => {
  assert.equal(partAxis(worldFrom(['WLS']), 1, 0, blockInfo), 'h');
});

test('a battery\'s + end is on top, or on the right', () => {
  assert.equal(plusSide('v'), 'up');
  assert.equal(plusSide('h'), 'right');
});

test('no loop, no light', () => {
  assert.equal(cellAt(['B.', 'WL'], 1, 1).level, 0);
  assert.equal(cellAt(['WWW', 'B.W', 'WL.'], 1, 2).level, 0); // a gap in the loop
});

test('one battery and one lamp: brightness 1', () => {
  assert.ok(Math.abs(cellAt(ONE_LAMP, 1, 2).level - 1) < 0.02);
});

test('two lamps in a row (series) share the push: both about half as bright', () => {
  const rows = ['WWWW', 'B..W', 'WLLW'];
  assert.ok(Math.abs(cellAt(rows, 1, 2).level - 0.5) < 0.03);
  assert.ok(Math.abs(cellAt(rows, 2, 2).level - 0.5) < 0.03);
});

test('two lamps side by side (parallel) each get their own path: both nearly full', () => {
  const rows = ['WWWW', 'B.LL', 'WWWW'];
  assert.ok(cellAt(rows, 2, 1).level > 0.9);
  assert.ok(cellAt(rows, 3, 1).level > 0.9);
});

test('two batteries in a row push twice as hard: about twice as bright', () => {
  assert.ok(cellAt(['WWW', 'B.W', 'B.W', 'WLW'], 1, 3).level > 1.8);
});

test('two batteries pushing against each other cancel out', () => {
  assert.ok(cellAt(['WWW', 'B.B', 'WLW'], 1, 2).level < 0.02);
});

test('an open switch breaks the loop; a closed one lets current through', () => {
  assert.equal(cellAt(['WSW', 'B.W', 'WLW'], 1, 2).level, 0);
  assert.ok(cellAt(['WCW', 'B.W', 'WLW'], 1, 2).level > 0.98);
});

test('a clicker lets current through on its on beat only', () => {
  const rows = ['WKW', 'B.W', 'WLW'];
  assert.ok(cellAt(rows, 1, 2, 0).level > 0.98);
  assert.equal(cellAt(rows, 1, 2, 8).level, 0);
});

test('wires and gold carry current; wood and stone do not', () => {
  assert.ok(cellAt(['WGW', 'B.W', 'WLW'], 1, 2).level > 0.98);
  assert.equal(cellAt(['WoW', 'B.W', 'WLW'], 1, 2).level, 0);
  assert.equal(cellAt(['WsW', 'B.W', 'WLW'], 1, 2).level, 0);
});

test('wiring + straight back to − makes the battery spark', () => {
  assert.equal(cellAt(['WW', 'BW', 'WW'], 0, 1).spark, true);
  assert.equal(cellAt(ONE_LAMP, 0, 1).spark, false);
});

test('a long shorting wire still sparks', () => {
  const rows = ['WWWWWWWWWW', 'B........W', 'WWWWWWWWWW']; // 21 wire cells
  assert.equal(cellAt(rows, 0, 1).spark, true);
});

test('a short steals the current from a lamp beside it', () => {
  const rows = ['WWWW', 'BWLW', 'WWWW'];
  assert.equal(cellAt(rows, 0, 1).spark, true);
  assert.ok(cellAt(rows, 2, 1).level < 0.05);
});

test('two batteries wired straight to each other spark; two pushing against each other do not', () => {
  assert.equal(cellAt(['WW', 'BW', 'BW', 'WW'], 0, 1).spark, true);
  assert.equal(cellAt(['WWW', 'B.B', 'WWW'], 0, 1).spark, false);
});

test('current comes OUT of the battery\'s + end and goes back IN at the − end', () => {
  const battery = cellAt(ONE_LAMP, 0, 1);
  assert.ok(battery.arms.up > 0.9);   // out of + (the top)
  assert.ok(battery.arms.down < -0.9); // into − (the bottom)
  const wire = cellAt(ONE_LAMP, 1, 0); // top wire: current flows left → right
  assert.ok(wire.arms.left < 0 && wire.arms.right > 0);
});

test('wires know which sides they connect through', () => {
  assert.deepEqual(cellAt(ONE_LAMP, 0, 0).faces.sort(), ['down', 'right']);
  assert.deepEqual(cellAt(['W'], 0, 0).faces, []);
});

test('every electric cell gets a record, even an open switch', () => {
  const switchCell = cellAt(['WSW', 'B.W', 'WLW'], 1, 0);
  assert.equal(switchCell.axis, 'h');
  assert.deepEqual(switchCell.faces, []);
});

test('flowing says whether any current moves', () => {
  assert.equal(solveCircuit(worldFrom(ONE_LAMP), blockInfo).flowing, true);
  assert.equal(solveCircuit(worldFrom(['WSW', 'B.W', 'WLW']), blockInfo).flowing, false);
});

test('note blocks are loads too: one in a loop gets full current', () => {
  assert.ok(cellAt(['WWW', 'B.W', 'WnW'], 1, 2).level > 0.98);
});

test('equations with no single answer give null instead of a crash', () => {
  assert.equal(solveLinear([[0, 0], [0, 0]], [1, 1]), null);
  assert.deepEqual(solveLinear([[2, 0], [0, 4]], [2, 8]), [1, 2]);
});
```

Add `'circuit.js'` to the end of `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/circuit.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/circuit.js`

- [ ] **Step 3: Create js/circuit.js**

```js
/**
 * circuit.js — works out how electricity flows through the world.
 *
 * Every wire, gold block and electric part is a "point". Points that
 * touch (and face each other) are joined by a connection, which is
 * like a tiny resistor, and batteries add a push:
 *
 *     🔋 ━━ ━━ 💡 ━━         each ━━ joint is a connection
 *
 * Then we solve the circuit the way electricians do (Kirchhoff's law:
 * at every point, the current flowing in equals the current flowing
 * out). That tells us the current through every connection, which way
 * it goes, and so how bright each lamp is.
 *
 * This file knows nothing about which blocks exist. It only reads the
 * fields blocks have: `conducts`, `part`, `partWhen`, `electric`.
 */
import { getBlock, inBounds } from './world.js';

/** The four sides of a cell, in the order we always list them. */
export const SIDES = ['up', 'right', 'down', 'left'];

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** The side facing back the other way. */
export const OPPOSITE = { up: 'down', right: 'left', down: 'up', left: 'right' };

/**
 * Half of a wire's resistance (each connection gets half from each end).
 * Real wire has a tiny bit of resistance, so we give it a tiny number.
 */
export const WIRE_HALF_RESISTANCE = 0.0005;

/**
 * The current that flows when one lamp (resistance 1) sits in a loop
 * with one battery (push 1, resistance 0.05). A lamp with exactly this
 * much current shows brightness level 1.
 */
export const REFERENCE_CURRENT = 1 / (1 + 0.05);

/** The brightest a lamp can show (twice as bright as normal). */
export const MAX_LEVEL = 2;

/** Parts at least this "wire-like" (low resistance) count as wire when hunting for short circuits. */
const SHORT_PATH_RESISTANCE = 0.01;

/**
 * A short circuit only sparks if the battery is really pushing a lot of
 * current: more than this. (Two batteries pushing against each other
 * make a loop with no current, which is safe.)
 */
const SHORT_CURRENT = 2 * REFERENCE_CURRENT;

/** Less current than this counts as "nothing is flowing". */
export const FLOW_MIN = 0.01;

/**
 * Is this block part of electricity at all (even a switch that's open
 * right now)? Parts use this to decide which way to face.
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true for wires, conductors, parts and `electric` blocks
 */
export function isElectric(info) {
  return Boolean(info && (info.conducts || info.part || info.electric));
}

/**
 * The block's part settings if it's a working part RIGHT NOW. A clicker
 * is only a part on its "on" beat; the rest of the time it's a gap.
 * @param {object|undefined} info - the block's definition
 * @param {object} world - the world (the clicker reads world.ticks)
 * @returns {{resistance: number, push?: number}|null} the part, or null
 */
export function activePart(info, world) {
  if (!info?.part) return null;
  if (info.partWhen && !info.partWhen(world)) return null;
  return info.part;
}

/**
 * Which way a part faces: sideways ('h') or up-down ('v'). It looks at
 * its four neighbors and faces the electric ones:
 *   1. electric on both left and right → sideways
 *   2. electric on both up and down    → up-down
 *   3. electric on the left or right   → sideways
 *   4. electric above or below         → up-down
 *   5. nothing around                  → sideways
 * @param {object} world - the world
 * @param {number} x - the part's column
 * @param {number} y - the part's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the direction it faces
 */
export function partAxis(world, x, y, blockInfo) {
  /**
   * Is the neighbor dx, dy away electric?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it's electric
   */
  const electricAt = (dx, dy) => isElectric(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = electricAt(-1, 0);
  const right = electricAt(1, 0);
  const up = electricAt(0, -1);
  const down = electricAt(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
  return 'h';
}

/**
 * Which side is a battery's + end? The top when it faces up-down, the
 * right when it faces sideways.
 * @param {'h'|'v'} axis - the way the battery faces
 * @returns {string} 'up' or 'right'
 */
export function plusSide(axis) {
  return axis === 'v' ? 'up' : 'right';
}

/**
 * The sides a point connects through: all four for a wire, or just its
 * two ends for a part.
 * @param {object} info - the block's definition
 * @param {'h'|'v'|null} axis - the way a part faces (null for wires)
 * @returns {string[]} the sides
 */
function sidesFor(info, axis) {
  if (info.conducts) return SIDES;
  return axis === 'v' ? ['up', 'down'] : ['right', 'left'];
}

/**
 * Half of a point's resistance: each connection gets half from each end.
 * @param {{info: object, part: object|null}} point - a point
 * @returns {number} half its resistance
 */
function halfResistance(point) {
  return point.info.conducts ? WIRE_HALF_RESISTANCE : point.part.resistance / 2;
}

/**
 * How hard a battery pushes current OUT through one of its sides:
 * half its push out of the + end, half pulled in at the − end.
 * Anything that isn't a battery pushes 0.
 * @param {{part: object|null, axis: string|null}} point - a point
 * @param {string} side - which side
 * @returns {number} the push out through that side
 */
function pushOut(point, side) {
  const push = point.part?.push ?? 0;
  if (!push) return 0;
  const plus = plusSide(point.axis);
  if (side === plus) return push / 2;
  if (side === OPPOSITE[plus]) return -push / 2;
  return 0;
}

/**
 * Solve a set of equations  A · x = b  by Gaussian elimination (the
 * method taught in school: clear out one unknown at a time). We pick
 * the biggest number in each column to divide by ("partial pivoting"),
 * which keeps rounding errors small.
 * @param {number[][]} matrix - A, a square grid of numbers (it gets changed)
 * @param {number[]} rhs - b, the right-hand side (it gets changed)
 * @returns {number[]|null} x, or null if there's no single answer
 */
export function solveLinear(matrix, rhs) {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[best][col])) best = row;
    }
    if (Math.abs(matrix[best][col]) < 1e-12) return null; // no single answer
    [matrix[col], matrix[best]] = [matrix[best], matrix[col]];
    [rhs[col], rhs[best]] = [rhs[best], rhs[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col] / matrix[col][col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) matrix[row][k] -= factor * matrix[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let k = row + 1; k < n; k++) sum -= matrix[row][k] * x[k];
    x[row] = sum / matrix[row][row];
  }
  return x.every(Number.isFinite) ? x : null;
}

/**
 * Work out the voltage at every point of one separate circuit.
 * Each connection is a "conductance" g = 1 / resistance (how easily
 * current flows), and a battery's push becomes a current source g × push.
 * @param {number[]} members - the cell indexes in this circuit
 * @param {object[]} links - this circuit's connections
 * @returns {Map<number, number>|null} cell index → voltage, or null if it can't be solved
 */
function solveVoltages(members, links) {
  const position = new Map(members.map((index, k) => [index, k]));
  const n = members.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (const link of links) {
    const a = position.get(link.a);
    const b = position.get(link.b);
    const g = 1 / link.resistance;
    matrix[a][a] += g;
    matrix[b][b] += g;
    matrix[a][b] -= g;
    matrix[b][a] -= g;
    rhs[a] -= g * link.push;
    rhs[b] += g * link.push;
  }
  // Voltages only matter compared to each other, so we pin the first
  // point at 0 volts. Without this there'd be endless answers.
  matrix[0] = new Array(n).fill(0);
  matrix[0][0] = 1;
  rhs[0] = 0;
  const voltages = solveLinear(matrix, rhs);
  return voltages && new Map(members.map((index, k) => [index, voltages[k]]));
}

/**
 * Group the points into separate circuits: points joined by connections
 * (directly or through others) are in the same group.
 * @param {number[]} indexes - every point's cell index
 * @param {object[]} links - every connection
 * @returns {number[][]} the groups, each a list of cell indexes
 */
function groupsOf(indexes, links) {
  const parent = new Map(indexes.map((index) => [index, index]));
  /**
   * Find the "leader" of a point's group.
   * @param {number} index - a cell index
   * @returns {number} the group leader's index
   */
  const leader = (index) => {
    while (parent.get(index) !== index) index = parent.get(index);
    return index;
  };
  for (const link of links) parent.set(leader(link.a), leader(link.b));
  const groups = new Map();
  for (const index of indexes) {
    const key = leader(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  }
  return [...groups.values()];
}

/**
 * Is this battery short-circuited? That's when its + end and − end are
 * joined by a path of plain wire (wires, gold, closed switches, other
 * batteries) with nothing to slow the current down, like a lamp.
 * @param {number} battery - the battery's cell index
 * @param {object} point - the battery's point
 * @param {Map<number, object>} points - every point
 * @param {Map<number, number[]>} touching - cell index → the indexes it's connected to
 * @param {number} width - the world's width
 * @returns {boolean} true if + and − are joined by plain wire
 */
function shortedByShape(battery, point, points, touching, width) {
  /**
   * The cell index next to the battery on one side.
   * @param {string} side - which side
   * @returns {number} the neighbor's cell index
   */
  const beside = (side) => battery + STEP[side][0] + STEP[side][1] * width;
  const plus = beside(plusSide(point.axis));
  const minus = beside(OPPOSITE[plusSide(point.axis)]);
  const linked = touching.get(battery) ?? [];
  if (!linked.includes(plus) || !linked.includes(minus)) return false;

  /**
   * Can current pass this point without slowing down?
   * @param {number} index - a cell index
   * @returns {boolean} true for wire-like points and batteries
   */
  const plain = (index) => {
    const p = points.get(index);
    return p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE || (p.part.push ?? 0) > 0;
  };
  if (!plain(plus) || !plain(minus)) return false;
  const seen = new Set([battery, plus]);
  const queue = [plus];
  while (queue.length > 0) {
    const index = queue.shift();
    if (index === minus) return true;
    for (const next of touching.get(index) ?? []) {
      if (!seen.has(next) && plain(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Work out the electricity in the whole world.
 *
 * Returns a record for every electric cell:
 *   axis   'h' or 'v' for parts (null for wires)
 *   faces  the sides it's connected through
 *   arms   current out through each connected side (negative = flowing in)
 *   level  for parts: current through it ÷ REFERENCE_CURRENT (0 to MAX_LEVEL)
 *   spark  true for a short-circuited battery
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Map<number, object>, flowing: boolean}} the records, and whether any current flows
 */
export function solveCircuit(world, blockInfo) {
  const cells = new Map();
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isElectric(info)) continue;
      const index = y * world.width + x;
      const axis = info.conducts ? null : partAxis(world, x, y, blockInfo);
      cells.set(index, { axis, faces: [], arms: {}, level: 0, spark: false });
      const part = activePart(info, world);
      if (info.conducts || part) points.set(index, { x, y, info, part, axis, sides: sidesFor(info, axis) });
    }
  }

  // Join touching points that face each other. We only look right and
  // down from each point, so every pair is joined exactly once.
  const links = [];
  const touching = new Map();
  for (const [a, pa] of points) {
    for (const side of ['right', 'down']) {
      const [dx, dy] = STEP[side];
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      if (!pb || !pa.sides.includes(side) || !pb.sides.includes(OPPOSITE[side])) continue;
      links.push({
        a, b, side,
        resistance: halfResistance(pa) + halfResistance(pb),
        push: pushOut(pa, side) - pushOut(pb, OPPOSITE[side]),
        current: 0,
      });
      cells.get(a).faces.push(side);
      cells.get(b).faces.push(OPPOSITE[side]);
      cells.get(a).arms[side] = 0;
      cells.get(b).arms[OPPOSITE[side]] = 0;
      touching.set(a, [...(touching.get(a) ?? []), b]);
      touching.set(b, [...(touching.get(b) ?? []), a]);
    }
  }

  // Solve each separate circuit that has a battery in it.
  for (const members of groupsOf([...points.keys()], links)) {
    if (!members.some((index) => points.get(index).part?.push)) continue;
    const inside = new Set(members);
    const groupLinks = links.filter((link) => inside.has(link.a));
    const voltages = solveVoltages(members, groupLinks);
    if (!voltages) {
      console.warn('A circuit could not be solved, so it gets no current.');
      continue;
    }
    for (const link of groupLinks) {
      const current = (voltages.get(link.a) - voltages.get(link.b) + link.push) / link.resistance;
      // Rounding leaves crumbs like 0.000000000000002 where the answer is 0.
      link.current = Math.abs(current) < 1e-9 ? 0 : current;
      cells.get(link.a).arms[link.side] = link.current;
      cells.get(link.b).arms[OPPOSITE[link.side]] = -link.current;
    }
  }

  for (const [index, point] of points) {
    if (!point.part) continue;
    const cell = cells.get(index);
    const through = Math.max(0, ...point.sides.map((side) => Math.abs(cell.arms[side] ?? 0)));
    cell.level = Math.min(MAX_LEVEL, through / REFERENCE_CURRENT);
    if (point.part.push && through > SHORT_CURRENT) {
      cell.spark = shortedByShape(index, point, points, touching, world.width);
    }
  }

  const flowing = links.some((link) => Math.abs(link.current) > FLOW_MIN);
  return { cells, flowing };
}
```

In `sw.js`, add `'./js/circuit.js',` to `PRECACHE` on the line after `'./js/blocks/basic.js',`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. That includes the 24 circuit tests, the circuit.js docstrings, and "every js file is saved for offline use".

- [ ] **Step 5: Commit**

```bash
git add js/circuit.js tests/circuit.test.js tests/modules.test.js sw.js
git commit -m "Add the circuit solver: loops, brightness, shorts, current direction"
```

---

### Task 4: The ⚡ pack (js/blocks/electric.js) + registry + basic-pack wiring

**Files:**
- Create: `js/blocks/electric.js`
- Create: `tests/electric.test.js`
- Modify: `js/blocks/registry.js` (import + `PACKS`, comments, `blocksInPack` hides `hidden`, new `refreshSignals`)
- Modify: `js/blocks/basic.js` (gold `conducts` + `drawGoldSignals`; note blocks get `part` and `use` returns false)
- Modify: `tests/registry.test.js`, `tests/basic.test.js`, `tests/modules.test.js`
- Modify: `sw.js` (`PRECACHE` gets `'./js/blocks/electric.js'`)

**Interfaces:**
- Consumes:
  - `FLOW_MIN`, `solveCircuit` from `js/circuit.js`
  - `setBlock` from `js/world.js`
  - `drawCell` usage from Task 2 (blocks provide `drawSignals`)
- Produces:
  - **`js/blocks/electric.js`:**
    - `CLICKER_TICKS`, `NOTE_ON_LEVEL`
    - `clickerOn(world)`, `circuitKey(world)`
    - `refreshElectric(world, blockInfo) → boolean`
    - `electricSystem(world, blockInfo) → false`
    - `drawDots(ctx, left, top, size, cell, ticks)`
    - `drawWire(ctx, info, left, top, size, cell, ticks)`
    - default pack `{ tab: { id: 'electric', icon: '⚡', label: 'Power' }, blocks, systems: [electricSystem], refresh: refreshElectric }`
  - **`world.signals.electric`:** `{ key, cells, flowing, hum, wasOn, solves }`
  - **Note events:** `world.events` gets `{ type: 'note', midi, x, y }`
  - **`registry.js`:** `refreshSignals(world) → void`, and `blocksInPack` skips `hidden` blocks
  - **Block `use(ctx)` returns a boolean:** "did the world change?"

- [ ] **Step 1: Write the failing tests.** Create `tests/electric.test.js`:

```js
/**
 * electric.test.js — checks the ⚡ pack: switches, the clicker's beat,
 * note blocks playing when current starts, buzzer hum, redrawing, and
 * that the math only runs again when something changed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, tick } from '../js/world.js';
import { blockInfo, blocksInPack, isKnownBlock, refreshSignals } from '../js/blocks/registry.js';
import electric, {
  CLICKER_TICKS, circuitKey, clickerOn, drawWire, electricSystem, refreshElectric,
} from '../js/blocks/electric.js';

/** What each letter in a test picture means. */
const LETTERS = { '.': 'air', W: 'wire', B: 'battery', L: 'lamp', S: 'switchOpen', K: 'clicker', Z: 'buzzer', n: 'noteE' };

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - e.g. ['WWW', 'B.W', 'WLW']
 * @returns {object} the world
 */
function worldFrom(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * A pretend canvas "context" that records every rectangle drawn.
 * @returns {object} the fake context, with a `calls` list
 */
function fakeContext() {
  const ctx = {
    calls: [], fillStyle: '', globalAlpha: 1,
    fillRect(...args) { ctx.calls.push({ style: ctx.fillStyle, args }); },
  };
  return ctx;
}

test('the electric tab shows its blocks, but hides the switch\'s "on" side', () => {
  assert.deepEqual(blocksInPack('electric'), ['battery', 'wire', 'switchOpen', 'lamp', 'buzzer', 'clicker']);
  assert.equal(isKnownBlock('switchClosed'), true);
  assert.deepEqual(electric.tab, { id: 'electric', icon: '⚡', label: 'Power' });
});

test('✋ on a switch flips it, and says the world changed', () => {
  const world = worldFrom(['S']);
  const ctx = { world, x: 0, y: 0, playNote() {}, flash() {} };
  assert.equal(blockInfo('switchOpen').use(ctx), true);
  assert.equal(getBlock(world, 0, 0), 'switchClosed');
  assert.equal(blockInfo('switchClosed').use(ctx), true);
  assert.equal(getBlock(world, 0, 0), 'switchOpen');
});

test('the clicker is on for CLICKER_TICKS ticks, then off for CLICKER_TICKS', () => {
  assert.equal(clickerOn({ ticks: 0 }), true);
  assert.equal(clickerOn({ ticks: CLICKER_TICKS - 1 }), true);
  assert.equal(clickerOn({ ticks: CLICKER_TICKS }), false);
  assert.equal(clickerOn({ ticks: 2 * CLICKER_TICKS }), true);
});

test('the circuit key only changes with the beat when there is a clicker', () => {
  const plain = worldFrom(['WLW']);
  const before = circuitKey(plain);
  plain.ticks = CLICKER_TICKS;
  assert.equal(circuitKey(plain), before);
  const ticking = worldFrom(['WKW']);
  const onBeat = circuitKey(ticking);
  ticking.ticks = CLICKER_TICKS;
  assert.notEqual(circuitKey(ticking), onBeat);
});

test('the math only runs again when the circuit changes', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  assert.equal(refreshElectric(world, blockInfo), true);
  assert.equal(refreshElectric(world, blockInfo), false);
  assert.equal(world.signals.electric.solves, 1);
  setBlock(world, 1, 0, 'switchOpen');
  assert.equal(refreshElectric(world, blockInfo), true);
  assert.equal(world.signals.electric.solves, 2);
});

test('a note block plays once when current starts, not again while it keeps flowing', () => {
  const world = worldFrom(['WWW', 'B.W', 'WnW']);
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, [{ type: 'note', midi: 64, x: 1, y: 2 }]);
  world.events.length = 0;
  setBlock(world, 0, 0, 'wire'); // same blocks: no new solve, no new note
  world.ticks += 1;
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, []);
});

test('a note block plays again after the current stops and starts', () => {
  const world = worldFrom(['WWW', 'B.W', 'WnW']);
  refreshElectric(world, blockInfo);
  world.events.length = 0;
  setBlock(world, 1, 0, 'switchOpen');
  refreshElectric(world, blockInfo);
  assert.deepEqual(world.events, []);
  setBlock(world, 1, 0, 'switchClosed');
  refreshElectric(world, blockInfo);
  assert.equal(world.events.length, 1);
});

test('a clicker in the loop plays a note block on every on beat', () => {
  const world = worldFrom(['WKW', 'B.W', 'WnW']);
  const notes = [];
  // Ticks 1 to 31: on, off, on, off (tick 32 would start a third on beat).
  for (let i = 1; i < 4 * CLICKER_TICKS; i++) {
    tick(world, [electricSystem], blockInfo);
    notes.push(...world.events.splice(0));
  }
  assert.equal(notes.length, 2);
});

test('hum is how hard the loudest buzzer is buzzing', () => {
  const world = worldFrom(['WWW', 'B.W', 'WZW']);
  refreshElectric(world, blockInfo);
  assert.ok(Math.abs(world.signals.electric.hum - 1) < 0.02);
  const quiet = worldFrom(['WSW', 'B.W', 'WZW']);
  refreshElectric(quiet, blockInfo);
  assert.equal(quiet.signals.electric.hum, 0);
});

test('the electric system asks for a redraw when current flows, and never moves blocks', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  assert.equal(electricSystem(world, blockInfo), false);
  assert.equal(world.animating, true);
  world.animating = false;
  electricSystem(world, blockInfo); // nothing changed, but dots keep moving
  assert.equal(world.animating, true);
  const dark = worldFrom(['WSW', 'B.W', 'WLW']);
  electricSystem(dark, blockInfo); // first solve: redraw once
  dark.animating = false;
  electricSystem(dark, blockInfo); // nothing flows: no redraw needed
  assert.equal(dark.animating, false);
});

test('refreshSignals works the electricity out between ticks', () => {
  const world = worldFrom(['WWW', 'B.W', 'WLW']);
  refreshSignals(world);
  assert.ok(world.signals.electric.cells.get(2 * 3 + 1).level > 0.9);
});

test('a wire draws arms only toward the sides it connects through', () => {
  const ctx = fakeContext();
  drawWire(ctx, blockInfo('wire'), 0, 0, 80, { faces: ['up'], arms: { up: 0 } }, 0);
  // the middle (8 × 8 px at 32,32... as 2p squares) plus one arm going up
  assert.deepEqual(ctx.calls.map((call) => call.args), [[30, 30, 20, 20], [30, 0, 20, 40]]);
});

test('in the palette a wire is a plain sideways wire', () => {
  const ctx = fakeContext();
  drawWire(ctx, blockInfo('wire'), 0, 0, 80, undefined, 0);
  assert.equal(ctx.calls.length, 3); // middle + right arm + left arm
});

test('dots move along a wire that carries current', () => {
  const cell = { faces: ['right', 'left'], arms: { right: 1, left: -1 } };
  const first = fakeContext();
  const later = fakeContext();
  drawWire(first, blockInfo('wire'), 0, 0, 80, cell, 0);
  drawWire(later, blockInfo('wire'), 0, 0, 80, cell, 1);
  const dots = (ctx) => ctx.calls.filter((call) => call.style === '#ffe94d').map((call) => call.args);
  assert.equal(dots(first).length, 2);
  assert.notDeepEqual(dots(first), dots(later));
});
```

Append to `tests/basic.test.js`:

```js
test('note blocks are electric parts, and ✋ on one says the world did not change', () => {
  assert.deepEqual(basic.blocks.noteC.part, { resistance: 1 });
  const ctx = { world: createWorld(1, 1), x: 0, y: 0, playNote() {}, flash() {} };
  assert.equal(basic.blocks.noteC.use(ctx), false);
});

test('gold conducts electricity, like real gold', () => {
  assert.equal(basic.blocks.gold.conducts, true);
});
```

In `tests/registry.test.js`, insert before the `blocksInPack gives the palette` test:

```js
test('the packs run basic first, then electric', () => {
  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'electric']);
});

```

Add `'blocks/electric.js'` to the end of `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: FAIL. The cause is `ERR_MODULE_NOT_FOUND` for `js/blocks/electric.js`, which shows up in `tests/electric.test.js`, the module test, and the new basic and registry tests.

- [ ] **Step 3: Create js/blocks/electric.js**

```js
/**
 * electric.js — the ⚡ Electric pack: batteries, wires, switches, lamps,
 * buzzers and clickers.
 *
 * Electricity only flows around a complete LOOP: out of a battery's +
 * end, through wires and parts, and back into its − end. circuit.js does
 * the math; this file says what each block is, runs the math when the
 * world changes, and draws the results: glowing lamps, humming buzzers,
 * sparking batteries, and little dots flowing along the wires.
 */
import { FLOW_MIN, solveCircuit } from '../circuit.js';
import { setBlock } from '../world.js';

/**
 * How many ticks a clicker stays on, then off. 8 ticks = 1 second.
 * 🧪 Try this! 4 for a fast tick-tock, 16 for a slow one.
 */
export const CLICKER_TICKS = 8;

/** A note block plays when its current goes above this level. */
export const NOTE_ON_LEVEL = 0.25;

/** Wire colors: dull when nothing flows, bright copper when current flows. */
const WIRE_IDLE = '#7a4a1e';
const WIRE_HOT = '#e08a3c';

/** The color of the flowing dots (they show which way current goes). */
const DOT_COLOR = '#ffe94d';

/**
 * How fast the dots move, in half-cells per tick for each unit of current.
 * 🧪 Try this! 1 for zooming dots, 0.1 for slow ones.
 */
const DOT_SPEED = 0.25;

/** The color of the metal ends ("stubs") that show which way a part faces. */
const STUB_COLOR = '#b0b0b0';

/**
 * Is a clicker on (letting current through) right now?
 * On for CLICKER_TICKS ticks, then off for CLICKER_TICKS ticks.
 * @param {{ticks: number}} world - the world (its clock)
 * @returns {boolean} true on the "on" beat
 */
export function clickerOn(world) {
  return Math.floor(world.ticks / CLICKER_TICKS) % 2 === 0;
}

/**
 * A short text that changes whenever the circuit could change: the
 * blocks, plus the clicker beat (only if there's a clicker). If it's the
 * same as last time, there's no need to do the math again.
 * @param {{cells: string[], ticks: number}} world - the world
 * @returns {string} the key
 */
export function circuitKey(world) {
  const beat = world.cells.includes('clicker') ? String(clickerOn(world)) : '';
  return `${world.cells.join(',')}|${beat}`;
}

/**
 * Work out the electricity again, if anything changed since last time,
 * and keep the results in world.signals.electric for drawing:
 *   cells    each electric cell's record (see solveCircuit in circuit.js)
 *   flowing  true if current flows anywhere
 *   hum      how loud buzzers should hum (the loudest buzzer's level)
 *   wasOn    the note blocks that have current, so each plays once when it starts
 * Note blocks that just got current add a 'note' event to world.events.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if it did the math (something changed)
 */
export function refreshElectric(world, blockInfo) {
  const old = world.signals.electric;
  const key = circuitKey(world);
  if (old && old.key === key) return false;

  const { cells, flowing } = solveCircuit(world, blockInfo);
  const wasOn = old?.wasOn ?? new Set();
  const nowOn = new Set();
  let hum = 0;
  for (const [index, cell] of cells) {
    const info = blockInfo(world.cells[index]);
    if (info?.hums) hum = Math.max(hum, cell.level);
    if (info?.midi !== undefined && cell.level > NOTE_ON_LEVEL) {
      nowOn.add(index);
      if (!wasOn.has(index)) {
        world.events.push({ type: 'note', midi: info.midi, x: index % world.width, y: Math.floor(index / world.width) });
      }
    }
  }
  world.signals.electric = { key, cells, flowing, hum, wasOn: nowOn, solves: (old?.solves ?? 0) + 1 };
  return true;
}

/**
 * The electric rule that runs every tick. It never moves blocks (so it
 * returns false), but it asks for a redraw when the circuit changed or
 * current is flowing, so the dots keep moving.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function electricSystem(world, blockInfo) {
  const solved = refreshElectric(world, blockInfo);
  if (solved || world.signals.electric.flowing) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Every drawing function gets the same things:
//   ctx    the canvas paintbrush      left, top  where the cell is (pixels)
//   size   how big the cell is        cell       its electric record, or
//   ticks  the world's clock                     undefined (in the palette)
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.

/**
 * Draw a rectangle in "part space": as if the part faces sideways. For a
 * part facing up-down, the same rectangle is turned a quarter turn, so
 * one drawing works both ways.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way the part faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {number[]} box - [x, y, width, height] in little pixels (0 to 8), facing sideways
 * @returns {void}
 */
function partRect(ctx, axis, left, top, size, [x, y, w, h]) {
  const p = size / 8;
  if (axis === 'v') ctx.fillRect(left + y * p, top + (8 - x - w) * p, h * p, w * p);
  else ctx.fillRect(left + x * p, top + y * p, w * p, h * p);
}

/**
 * Draw the two metal ends of a part, on the sides it faces.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way the part faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawStubs(ctx, axis, left, top, size) {
  ctx.fillStyle = STUB_COLOR;
  partRect(ctx, axis, left, top, size, [0, 3, 1, 2]);
  partRect(ctx, axis, left, top, size, [7, 3, 1, 2]);
}

/**
 * Draw the flowing dots on each side of a cell that carries current.
 * A dot travels from the middle to the edge when current flows out that
 * side, and from the edge to the middle when it flows in.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
export function drawDots(ctx, left, top, size, cell, ticks) {
  const p = size / 8;
  const half = size / 2;
  ctx.fillStyle = DOT_COLOR;
  for (const side of cell.faces) {
    const current = cell.arms[side] ?? 0;
    if (Math.abs(current) <= FLOW_MIN) continue;
    const speed = Math.min(0.5, Math.max(0.05, Math.abs(current) * DOT_SPEED));
    const phase = (ticks * speed) % 1;
    const along = (current > 0 ? phase : 1 - phase) * half; // pixels from the middle
    const [dx, dy] = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[side];
    const x = left + half + dx * along - p;
    const y = top + half + dy * along - p;
    ctx.fillRect(x, y, 2 * p, 2 * p);
  }
}

/**
 * Draw a wire: a copper line from the middle toward every side it's
 * connected through (a lone wire is just a dot), plus flowing dots.
 * In the palette (no record) it's a plain sideways wire.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
export function drawWire(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const half = size / 2;
  const faces = cell ? cell.faces : ['right', 'left'];
  const hot = Boolean(cell) && faces.some((side) => Math.abs(cell.arms[side] ?? 0) > FLOW_MIN);
  ctx.fillStyle = hot ? WIRE_HOT : WIRE_IDLE;
  ctx.fillRect(left + half - p, top + half - p, 2 * p, 2 * p); // the middle
  for (const side of faces) {
    if (side === 'up') ctx.fillRect(left + half - p, top, 2 * p, half);
    if (side === 'down') ctx.fillRect(left + half - p, top + half, 2 * p, half);
    if (side === 'left') ctx.fillRect(left, top + half - p, half, 2 * p);
    if (side === 'right') ctx.fillRect(left + half, top + half - p, half, 2 * p);
  }
  if (cell) drawDots(ctx, left, top, size, cell, ticks);
}

/**
 * Draw a battery: a red + half and a black − half, a "+" sign, metal
 * ends, and sparks with a puff of smoke when it's short-circuited.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBattery(ctx, info, left, top, size, cell, ticks) {
  const axis = cell?.axis ?? 'h';
  // Facing sideways, + is on the right; partRect turns it so + is on top.
  ctx.fillStyle = '#212121';
  partRect(ctx, axis, left, top, size, [1, 1, 3, 6]); // the − half (black)
  ctx.fillStyle = '#ffffff';
  partRect(ctx, axis, left, top, size, [5, 3.5, 2, 1]); // the "+" sign: across...
  partRect(ctx, axis, left, top, size, [5.5, 3, 1, 2]); // ...and up and down
  drawStubs(ctx, axis, left, top, size);
  if (cell?.spark && ticks % 2 === 0) {
    const p = size / 8;
    ctx.fillStyle = '#fff59d'; // a zig-zag spark
    ctx.fillRect(left + p, top, p, p);
    ctx.fillRect(left + 2 * p, top + p, p, p);
    ctx.fillRect(left + p, top + 2 * p, p, p);
    ctx.fillRect(left + 6 * p, top + p, p, p);
    ctx.fillRect(left + 7 * p, top + 2 * p, p, p);
    ctx.fillStyle = 'rgba(120, 120, 120, 0.7)'; // a puff of smoke
    ctx.fillRect(left + 3 * p, top - p, 3 * p, 2 * p);
  }
}

/**
 * Draw a lamp: a bulb that's gray when off and yellow when on, with a
 * glow that gets bigger the more current flows.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @returns {void}
 */
function drawLamp(ctx, info, left, top, size, cell) {
  const p = size / 8;
  const level = cell?.level ?? 0;
  if (level > 0.05) {
    const glow = p * 1.5 * level;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff3a0';
    ctx.fillRect(left + 2 * p - glow, top + 2 * p - glow, 4 * p + 2 * glow, 4 * p + 2 * glow);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = level > 0.05 ? '#ffe066' : '#bdbdbd';
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

/**
 * Draw a switch: a lever between the two metal ends. Closed, it lies
 * flat across (current can pass); open, it tips up and leaves a gap.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.closed says which)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @returns {void}
 */
function drawSwitch(ctx, info, left, top, size, cell) {
  const axis = cell?.axis ?? 'h';
  ctx.fillStyle = '#eeeeee';
  if (info.closed) {
    partRect(ctx, axis, left, top, size, [1, 3.5, 6, 1]);
  } else {
    // A lever tipped up from the left end: a little staircase.
    for (let step = 0; step < 4; step++) partRect(ctx, axis, left, top, size, [1 + step, 3 - step, 1.5, 1]);
  }
  drawStubs(ctx, axis, left, top, size);
}

/**
 * Draw a buzzer: a speaker grill whose lines jiggle while it hums.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBuzzer(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const jiggle = (cell?.level ?? 0) > 0.05 && ticks % 2 === 0 ? p / 2 : 0;
  ctx.fillStyle = '#263238';
  for (const row of [2, 4, 6]) ctx.fillRect(left + 2 * p + jiggle, top + (row - 0.5) * p, 4 * p, p);
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

/**
 * Draw a clicker: a clock face whose hand ticks round, with a green light
 * on the "on" beat (only in the world; the palette shows it plain).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawClicker(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(left + p, top + p, 6 * p, 6 * p); // the clock face
  ctx.fillStyle = '#212121';
  const hand = Math.floor(ticks / 2) % 4; // up, right, down, left
  const [x, y, w, h] = [[3.5, 1.5, 1, 2.5], [4, 3.5, 2.5, 1], [3.5, 4, 1, 2.5], [1.5, 3.5, 2.5, 1]][hand];
  ctx.fillRect(left + x * p, top + y * p, w * p, h * p);
  if (cell && clickerOn({ ticks })) {
    ctx.fillStyle = '#43a047';
    ctx.fillRect(left + 5.5 * p, top + 1.5 * p, p, p);
  }
  drawStubs(ctx, cell?.axis ?? 'h', left, top, size);
}

// =============================================================
// The blocks
// =============================================================

/**
 * Every block in this pack, in the order the palette shows them.
 *   part      a two-ended part: its resistance (how hard it is for current
 *             to get through) and push (a battery's volts)
 *   conducts  a wire: connects on all four sides
 *   bare      draw no square behind it, just the sky (and its drawSignals)
 *   hidden    not in the palette (you get it by flipping a switch)
 * 🧪 Try this! Make the lamp's resistance 2: lamps get dimmer.
 */
const blocks = {
  battery: { title: 'Battery', color: '#d32f2f', part: { resistance: 0.05, push: 1 }, drawSignals: drawBattery },
  wire: { title: 'Wire', color: WIRE_IDLE, conducts: true, bare: true, drawSignals: drawWire },
  switchOpen: {
    title: 'Switch',
    color: '#5d4037',
    electric: true,
    drawSignals: drawSwitch,
    use: (ctx) => setBlock(ctx.world, ctx.x, ctx.y, 'switchClosed'),
  },
  lamp: { title: 'Lamp', color: '#455a64', part: { resistance: 1 }, drawSignals: drawLamp },
  buzzer: { title: 'Buzzer', color: '#546e7a', part: { resistance: 1 }, hums: true, drawSignals: drawBuzzer },
  clicker: { title: 'Clicker', color: '#37474f', part: { resistance: 0.001 }, partWhen: clickerOn, drawSignals: drawClicker },
  switchClosed: {
    title: 'Switch (on)',
    color: '#5d4037',
    part: { resistance: 0.001 },
    closed: true,
    hidden: true,
    drawSignals: drawSwitch,
    use: (ctx) => setBlock(ctx.world, ctx.x, ctx.y, 'switchOpen'),
  },
};

export default {
  tab: { id: 'electric', icon: '⚡', label: 'Power' },
  blocks,
  systems: [electricSystem],
  refresh: refreshElectric,
};
```

- [ ] **Step 4: Wire it into the registry and the basic pack**

Change `js/blocks/registry.js` to exactly this (only the import, the `PACKS` comment and value, the `SIGNALS` comment, and `blocksInPack` change, plus the new `refreshSignals`):

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
import electric from './electric.js';

/**
 * Every pack, in the order their systems run each tick. Order matters
 * once packs talk to each other: sand must land BEFORE the electricity
 * is worked out, and water must turn to steam BEFORE the turbine checks
 * for steam. The plan for later phases is:
 *   basic → water → mechanical → electric
 */
export const PACKS = [basic, electric];

/**
 * The names of the signals packs pass to each other: ⚡ power (wires,
 * lamps; world.signals.electric) and 🔄 spin (gears, wheels; later).
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
 * The block names on one palette tab, in palette order (blocks marked
 * `hidden` are left out).
 * @param {string} id - a pack's tab id, like 'basic'
 * @returns {string[]} the block names (empty if there's no such tab)
 */
export function blocksInPack(id) {
  const pack = PACKS.find((p) => p.tab.id === id);
  if (!pack) return [];
  return Object.keys(pack.blocks).filter((name) => !pack.blocks[name].hidden);
}

/**
 * Bring every pack's signals up to date (for example, work out the
 * electricity after a block was placed), so the picture is right even
 * between ticks. Packs without a `refresh` are skipped.
 * @param {object} world - the world
 * @returns {void}
 */
export function refreshSignals(world) {
  for (const pack of PACKS) pack.refresh?.(world, blockInfo);
}
```

In `js/blocks/basic.js`:

1. Add the import after the `world.js` import:

```js
import { drawDots } from './electric.js';
```

2. In `noteBlock`, give the returned object a `part` and make `use` return false:

```js
    label,
    midi,
    // A note block is also an electric part: in a circuit it plays its
    // note when current starts flowing through it (see electric.js).
    part: { resistance: 1 },
    use: (ctx) => {
      ctx.playNote(midi);
      ctx.flash();
      return false; // playing a note doesn't change the world
    },
```

3. Insert before the `blocks` docstring:

```js
/**
 * Gold carries current like wire, so show the flowing dots on it too.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's electric record (none in the palette)
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawGoldSignals(ctx, info, left, top, size, cell, ticks) {
  if (cell) drawDots(ctx, left, top, size, cell, ticks);
}
```

4. In the `blocks` docstring, after the line about `seeThrough`, add:

```js
 * Gold `conducts` electricity, like real gold: it works as wire too.
```

5. Change the gold line to:

```js
  gold: { title: 'Gold', color: '#f2b705', conducts: true, drawSignals: drawGoldSignals },
```

In `sw.js`, add `'./js/blocks/electric.js',` to `PRECACHE` after `'./js/blocks/basic.js',`.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail (≈235 tests).

- [ ] **Step 6: Commit**

```bash
git add js/blocks tests/electric.test.js tests/basic.test.js tests/registry.test.js tests/modules.test.js sw.js
git commit -m "Add the electric pack: batteries, wires, switches, lamps, buzzers, clickers"
```

---

### Task 5: Build page: play events, animate without saving, hum, ✋ saves

**Files:**
- Modify: `js/build.js` (imports, `makeSwatch`, `draw`, `useBlockAt`, `startTicking`, new `playEvents`, `stopTicking`)
- Modify: `js/sound.js` (header line, `HUM_HZ`/`HUM_VOLUME`/`hum`, new `setHum`)
- Modify: `sw.js` (`CACHE_NAME` → `'caleb-v3'`)
- Test: `$SCRATCH/check-electric.cjs` (scratchpad browser check, written here; Task 6 runs it again for sign-off)

**Interfaces:**
- Consumes:
  - `refreshSignals` (Task 4), `drawCell` (Task 2)
  - `world.events`, `world.animating`, `world.signals.electric.hum`
  - the boolean returned by `use()`
- Produces: `setHum(level) → void` in `js/sound.js`

- [ ] **Step 1: Write the browser check (the failing test)**

Save as `$SCRATCH/check-electric.cjs`, where `$SCRATCH` is the session scratchpad:

```js
// Drives the ⚡ pack on build.html. Usage: node check-electric.cjs <port> <shot-prefix>
const pw = require('/home/hamsa/LFG/scripts/share_card/node_modules/playwright');
const assert = require('node:assert/strict');
const [port, prefix] = process.argv.slice(2);
(async () => {
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({ ...pw.devices['iPad Pro 11 landscape'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/build.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  const geo = () => page.evaluate(() => {
    const c = document.getElementById('world'); const b = c.getBoundingClientRect();
    return { cell: c.clientWidth / 24, left: b.left + c.clientLeft, top: b.top + c.clientTop };
  });
  const at = async (x, y) => { const g = await geo(); return [g.left + (x + 0.5) * g.cell, g.top + (y + 0.5) * g.cell]; };
  const tap = async (x, y) => { const [px, py] = await at(x, y); await page.mouse.click(px, py); };
  const place = async (label, cells) => { await page.click(`[aria-label="${label}"]`); for (const [x, y] of cells) await tap(x, y); };
  /** Average color of the middle of cell (x, y), read from the canvas. */
  const color = (x, y) => page.evaluate(([x, y]) => {
    const c = document.getElementById('world'); const ctx = c.getContext('2d');
    const r = c.width / 24; const d = ctx.getImageData(Math.round((x + 0.5) * r) - 2, Math.round((y + 0.5) * r) - 2, 4, 4).data;
    let s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return s.map((v) => Math.round(v / (d.length / 4)));
  }, [x, y]);
  const isYellow = ([r, g, b]) => r > 200 && g > 180 && b < 150;

  await page.click('[data-tab="electric"]');
  // y4: W W W   y5: B . W   y6: W L W   (x = 2..4)
  await place('Wire', [[2, 4], [3, 4], [4, 4], [4, 5], [2, 6], [4, 6]]);
  await place('Battery', [[2, 5]]);
  await place('Lamp', [[3, 6]]);
  await page.waitForTimeout(400);
  assert.ok(isYellow(await color(3, 6)), `lamp not lit: ${await color(3, 6)}`);
  await page.screenshot({ path: `${prefix}-lit.png` });

  // Dots move: the top wire's pixels change between frames.
  const strip = () => page.evaluate(() => {
    const c = document.getElementById('world'); const r = c.width / 24;
    return Array.from(c.getContext('2d').getImageData(Math.round(3 * r), Math.round(4 * r), Math.round(r), Math.round(r)).data).join();
  });
  const a = await strip(); await page.waitForTimeout(260); const b = await strip();
  assert.notEqual(a, b, 'dots are not moving');

  // Swap the top-middle wire for a switch: open = dark; ✋ flips it closed = lit.
  await page.click('[data-tab="electric"]');
  await place('Switch', [[3, 4]]);
  await page.waitForTimeout(300);
  assert.ok(!isYellow(await color(3, 6)), 'lamp lit with switch open');
  await page.click('[data-tool="use"]');
  await tap(3, 4);
  await page.waitForTimeout(300);
  assert.ok(isYellow(await color(3, 6)), 'lamp dark after closing switch');
  await tap(3, 4); // open again
  await page.waitForTimeout(1500); // autosave
  await page.reload(); await page.waitForTimeout(600);
  assert.ok(!isYellow(await color(3, 6)), 'switch did not stay open after reload');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('calebhamsa.build.world.1')));
  assert.equal(saved.blocks[saved.cells[4 * 24 + 3]], 'switchOpen');

  // A short: battery with wire straight round, at x = 10..11.
  await page.click('[data-tab="electric"]');
  await place('Wire', [[10, 4], [11, 4], [11, 5], [11, 6], [10, 6]]);
  await place('Battery', [[10, 5]]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${prefix}-short.png` });

  // A clicker + note block loop at x = 15..17 (just must not error).
  await place('Wire', [[15, 4], [17, 4], [17, 5], [15, 6], [17, 6]]);
  await place('Clicker', [[16, 4]]);
  await place('Battery', [[15, 5]]);
  await page.click('[data-tab="basic"]');
  await place('Note E', [[16, 6]]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${prefix}-all.png` });

  assert.deepEqual(errors, []);
  console.log('electric: all checks passed');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python3 -m http.server 8123 >/dev/null 2>&1 &
node $SCRATCH/check-electric.cjs 8123 $SCRATCH/t5
```

Expected: FAIL. The palette wire swatch is blank, and either `dots are not moving` appears (there's no redraw on `animating`) or the lamp stays dark (`switch did not stay open` / `lamp dark after closing switch`, because ✋ doesn't trigger a save or redraw).

- [ ] **Step 3: Change js/sound.js**

1. Add to the header comment: "It also makes the Build page's buzzer hum (setHum)."
2. Replace the `audioContext` declaration block with:

```js
/**
 * The buzzer's hum: a buzzy square wave, and how loud it gets at full power.
 * 🧪 Try this! 440 for a higher hum, 110 for a deep one.
 */
const HUM_HZ = 220;
const HUM_VOLUME = 0.06;

/** The browser's sound machine. Made on the first tap (see getAudio). */
let audioContext = null;

/** The buzzer hum that's playing now: { oscillator, gain }, or null. */
let hum = null;
```

3. Append:

```js
/**
 * Set how loud the buzzers hum: 0 is silent, 1 is normal, 2 is loud.
 * All buzzers share one hum. Before Caleb's first tap there's no sound
 * machine yet, and this quietly does nothing (it never makes one).
 * @param {number} level - how hard the loudest buzzer is buzzing (0 to 2)
 * @returns {void}
 */
export function setHum(level) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (level <= 0) {
    if (!hum) return;
    hum.gain.gain.setTargetAtTime(0, now, 0.02); // fade out quickly...
    hum.oscillator.stop(now + 0.1);               // ...then stop
    hum = null;
    return;
  }
  if (!hum) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = HUM_HZ;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, now);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    hum = { oscillator, gain };
  }
  // setTargetAtTime glides to the new loudness, so it doesn't click.
  hum.gain.gain.setTargetAtTime(HUM_VOLUME * Math.min(level, 2) / 2, now, 0.05);
}
```

- [ ] **Step 4: Change js/build.js**

1. Imports:

```js
import { AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack, isKnownBlock, refreshSignals } from './blocks/registry.js';
import { drawCell, drawWorld } from './block-art.js';
import { listenForUnlock, playTones, setHum } from './sound.js';
```

2. In `makeSwatch`, replace `drawBlock(swatchCtx, info, 0, 0, SWATCH_PX);` with:

```js
  drawCell(swatchCtx, info, 0, 0, SWATCH_PX, undefined, 0); // parts face sideways, nothing flowing
```

3. `draw()` becomes:

```js
function draw() {
  if (!state.cell) return; // not sized yet
  refreshSignals(state.world); // e.g. a wire was just placed: work out the electricity first
  drawWorld(ctx, state.world, state.cell, blockInfo, AIR_INFO.color);
}
```

4. At the end of `useBlockAt`, capture `use()`'s answer:

```js
  const changed = info.use({
    world: state.world,
    x,
    y,
    playNote: (midi) => playTones([midi]),
    flash: () => flashCell(x, y),
  });
  if (changed) worldChanged(); // e.g. a switch was flipped: redraw and save
}
```

5. Replace `startTicking` (keep its docstring), add `playEvents` after it, and make `stopTicking` silence the hum:

```js
function startTicking() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    state.world.animating = false;
    const changed = tick(state.world, SYSTEMS, blockInfo);
    playEvents();
    if (changed) worldChanged();             // blocks moved: redraw and save
    else if (state.world.animating) draw();  // only the picture moves (dots): just redraw
    setHum(state.world.signals.electric?.hum ?? 0);
  }, 1000 / TICKS_PER_SECOND);
}

/**
 * Do what the systems asked for this tick, like playing a note block
 * that just got current. Then empty the list.
 * @returns {void}
 */
function playEvents() {
  for (const event of state.world.events.splice(0)) {
    if (event.type === 'note') {
      playTones([event.midi]);
      flashCell(event.x, event.y);
    }
  }
}

/**
 * Stop the world's clock.
 * @returns {void}
 */
function stopTicking() {
  clearInterval(tickTimer);
  tickTimer = null;
  setHum(0); // no buzzing while the page is hidden
}
```

6. In `sw.js` set `const CACHE_NAME = 'caleb-v3';`.

- [ ] **Step 5: Run the tests and the browser check**

```bash
npm test
node $SCRATCH/check-electric.cjs 8123 $SCRATCH/t5
```

Expected: `npm test` PASS, 0 fail; the browser check prints `electric: all checks passed`.

- [ ] **Step 6: Commit**

```bash
git add js/build.js js/sound.js sw.js
git commit -m "Build page: electricity redraws without saving, note events play, buzzers hum, switches save"
```

---

### Task 6: README, full browser sign-off, ship

**Files:**
- Modify: `README.md` (two file-table rows, one Try-this tip)

- [ ] **Step 1: README**

After the `js/blocks/basic.js` row add:

```markdown
| `js/blocks/electric.js` | ⚡ Power blocks: batteries, wires, switches, lamps, buzzers, clickers |
| `js/circuit.js` | The electricity math: loops, brightness, short circuits (pure) |
```

Add a numbered tip at the end of the Try-this list, continuing its numbering:

```markdown
N. **Dimmer lamps:** in `js/blocks/electric.js`, change the lamp's `resistance` to 2.
```

- [ ] **Step 2: Full sign-off**

Server on 8123 as in Task 5. Run:

```bash
npm test
node $SCRATCH/check-electric.cjs 8123 $SCRATCH/final
node $SCRATCH/check-build.cjs chromium $SCRATCH/final-build.png
node $SCRATCH/check-build.cjs ipad $SCRATCH/final-build-ipad.png
node $SCRATCH/badge-check.cjs
```

Expected:
- tests PASS
- `electric: all checks passed`
- `chromium: all checks passed`
- `ipad: all checks passed`
- 4 × `clear`

`check-build.cjs` and `badge-check.cjs` are in the session scratchpad from phase 1 (`check-build.cjs` is also written out in the phase 1 plan, Task 10). If `badge-check.cjs` is gone, skip it with a ledger ruling.

Read `$SCRATCH/final-lit.png`, `final-short.png` and `final-all.png`. Check:
- the lamp is yellow with flowing dots on its loop
- the battery has a "+" on top
- the short loop shows dense dots
- the clicker loop and E note block are drawn
- the POWER palette shows 6 blocks with parts facing sideways

- [ ] **Step 3: Commit, push, verify live, close #3**

```bash
git add README.md && git commit -m "README: electric pack files and a Try-this tip"
git push origin main
```

Wait for the Pages run:

```bash
gh run watch $(gh run list -R Team-Hamsa/calebhamsa.fun -L 1 --json databaseId --jq '.[0].databaseId') -R Team-Hamsa/calebhamsa.fun --exit-status
```

Then:
- `curl -s https://calebhamsa.fun/js/circuit.js | head -3` shows the header comment.
- Close the issue:

```bash
gh issue close 3 --repo Team-Hamsa/calebhamsa.fun --comment "⚡ Power tab is live on https://calebhamsa.fun/build.html — real closed-loop circuits with batteries, wires, switches, lamps (series dim / parallel bright), buzzers, clickers, wired note blocks, short-circuit sparks, and dots flowing from + to −."
```

- [ ] **Step 4: Hand-check on the iPad**

Ask the user to check:
- the buzzer hum starts and stops (and is silent before the first tap)
- a clicker + note block loop plays on the beat
- dots look smooth
- the sparks are visible
