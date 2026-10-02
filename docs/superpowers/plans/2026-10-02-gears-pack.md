# Block Playground Phase 4a (⚙️ Gears / Spin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⚙️ GEARS palette tab:
- small and big gears, an axle, a crank, a water wheel, a motor and a generator
- spin passes along gear trains, flipping direction at each mesh and changing speed by tooth count
- three big gears in a triangle jam (red ❌)
- energy changes form: 💧 water → wheel, ⚡ → motor → spin, spin → generator → ⚡

**Architecture:**
- **`js/spin.js` (pure):** builds a ratio graph over every spin block (gear meshes ×(−teethA/teethB); shafts ×1; axles only along their axis; big-big diagonal meshes). It walks each group breadth-first to give every block a ratio to the first one: inconsistent cycles **jam**, and the sources (`spinSource`) set the speed (opposite directions jam; same direction, the fastest wins).
- **`js/blocks/gears.js`:** the pack.
  - blocks; `gearsSystem` smooths the water-wheel flow and solves; `refresh`
  - drawings (gears drawn 4× slower than they turn, so their teeth don't alias)
  - the motor is a source driven by its circuit current; the generator is a circuit part whose `pushNow` = speed × 0.8
- **Small engine tweaks:**
  - `partPush` rounds **toward zero**, so motor ↔ generator loops wind down
  - `stepFluids` also reports water leaving `wheel` blocks (signed)
  - the water pack stores it in `signals.water.waterOut`
  - `PACKS = [basic, water, gears, electric]`
- **Docs ship with the tab:** README rows and pictures for every ⚙️ block (`tests/readme.test.js` enforces it) and three new machine pictures.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Node 20 `node --test`, Playwright (from `~/LFG`; Chromium iPad emulation).

**Spec:** `docs/superpowers/specs/2026-10-02-gears-pack-design.md`

**Prototype:** every code block and diff below ran green in a throwaway copy while the plan was being written:
- 342/342 tests
- the new `check-gears.cjs` (gears turn, a cranked generator lights a lamp, a jam shows red, the crank keeps turning after a reload)
- every phase 1–3 browser check

Diffs are against commit `7b6e2ac`. Apply them exactly (`git apply`).

## Global Constraints

- **Code style:**
  - vanilla JS, no dependencies
  - a header comment on every file; a JSDoc docstring on every function (`tests/docs.test.js`)
  - 🧪 on tweakables; DOM only inside `init…()`
- **Offline:** every `js/` file is in `PRECACHE`. `CACHE_NAME` goes `caleb-v4` → `caleb-v5` (Task 3).
- **README:** every palette block has a `docs/blocks/<name>.png` and a README line showing it (`tests/readme.test.js`). Pictures are made by `tools/make-block-pictures.cjs` (Playwright from `NODE_PATH=/home/hamsa/LFG/scripts/share_card/node_modules`).
- **Spin numbers:**
  - `CRANK_SPEED` 1, `MOTOR_SPEED` 1, `WHEEL_GAIN` 20, `GENERATOR_GAIN` 0.8
  - `MIN_SOURCE` 0.05, wheel smoothing 8 ticks
  - `DRAW_SLOWDOWN` 4
  - small gear 8 teeth, big gear 16 (diagonal)
- **Git:**
  - Repo `Team-Hamsa/calebhamsa.fun`.
  - Commit to `main` locally per task; push once at the end (Task 4).
  - **No `Co-Authored-By` trailers or AI attribution in commit messages** (user's global rule).
  - Issue **#5 stays open** (4b is still to come): comment on it, don't close it.

## Spec refinements made while prototyping (the spec is updated to match)

1. **`partPush` rounds toward zero** (to 0.1), not to the nearest 0.1. With nearest rounding, a motor powered only by its generator got stuck at speed 0.2 forever, because 0.2 × 0.8 = 0.16 rounds back up to 0.2. Toward zero, it winds down to 0. A 1e-9 nudge keeps 0.3 (stored as 0.2999…) at 0.3. The phase 3 turbine behavior is unchanged in practice.
2. **Gears are drawn 4× slower than their real speed** (`DRAW_SLOWDOWN`). At 1 turn per second, an 8-tooth gear moves exactly one tooth per tick, so every frame looked identical: it looked stopped. The prototype's browser check caught this.
3. **The crank's turning mark** is a knob color (green turning, red stopped), not a ↻/↺ arrow.
4. **The generator's "+"** shows only while it's turning.
5. **The motor's direction** comes from the current out of its right (or top) end, read from `signals.electric.cells.get(i).arms` with `axis` from the same record. That record's `axis` is the electric facing, as the spec says.

## Review Focus

1. **Cross-pack feedback loops:**
   - motor ↔ generator (must wind down)
   - generator powering a pump that feeds a water wheel that turns the generator: the 💧 pack adds losses, but check it can't run away or oscillate forever
   - → Task 3 wind-down test; the reviewer reasons about the others
2. **Jams and sources at the same time:** a jammed group containing a generator gives 0 push, and a jammed motor is still a circuit load. Nothing may flicker between jammed and not jammed on alternate ticks (for example, a motor whose own jam stops its current, which un-jams it…). → Task 2 tests; the reviewer checks the one-tick-lag loops.
3. **Turning a crank in a world that's also running water and circuits:** solve cost per tick (`solveSpin` runs every tick plus in `draw()`; `circuitKey` now changes whenever generator speeds change). Re-solve storms while a crank turns steadily are fine, but should be bounded. → Task 4 check is smooth; the reviewer estimates.
4. **Old saves:** crank names round-trip; no new saved layer. → existing save tests plus the Task 4 reload check.
5. **The README stays honest:** a palette block without a picture fails the tests (`tests/readme.test.js`), and the machine pictures exist. → Task 3.

---

### Task 1: Engine tweaks: round pushes toward zero; count water through wheels

**Files:**
- Modify: `js/circuit.js` (`partPush`)
- Modify: `js/fluids.js` (`stepFluids` returns `waterOut`)
- Modify: `js/blocks/water.js` (stores `waterOut` in `signals.water`)
- Modify: `tests/circuit.test.js`, `tests/fluids.test.js` (one test each)

**Interfaces:**
- Produces:
  - `partPush` rounds `pushNow` toward zero to 0.1
  - `stepFluids(...) → { moved, steamOut, waterOut, sides }`: `waterOut` is a `Map<index, signed amount>` for blocks with `wheel: true` (+ down or right)
  - `world.signals.water.waterOut`

- [ ] **Step 1: Write the failing tests.** Apply:

```diff
--- a/tests/circuit.test.js
+++ b/tests/circuit.test.js
@@ -6,7 +6,7 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
 import { createWorld, setBlock } from '../js/world.js';
-import { partAxis, plusSide, solveCircuit, solveLinear } from '../js/circuit.js';
+import { partAxis, partPush, plusSide, solveCircuit, solveLinear } from '../js/circuit.js';
 
 /**
  * Stand-in blocks, with the same electric settings as the real ones in
@@ -221,3 +221,11 @@
   assert.equal(cells.get(2 * 3 + 1).level, 0);
   assert.equal(flowing, false);
 });
+
+test('a changing push is rounded toward zero: 0.16 pushes 0.1, -0.16 pushes -0.1, 0.3 stays 0.3', () => {
+  assert.equal(partPush({ pushNow: () => 0.16 }, null, 0, 0), 0.1);
+  assert.equal(partPush({ pushNow: () => -0.16 }, null, 0, 0), -0.1);
+  assert.equal(partPush({ pushNow: () => 0.1 + 0.2 }, null, 0, 0), 0.3); // 0.30000000000000004
+  assert.equal(partPush({ pushNow: () => 0.3 }, null, 0, 0), 0.3);
+  assert.equal(partPush({ push: 1 }, null, 0, 0), 1);
+});
```

```diff
--- a/tests/fluids.test.js
+++ b/tests/fluids.test.js
@@ -262,3 +262,12 @@
   assert.ok(after - before < 0.5, `steam kept growing: ${before.toFixed(2)} → ${after.toFixed(2)}`);
   assert.ok(Math.max(...world.fluid.steam) < 3, `steam squished to ${Math.max(...world.fluid.steam).toFixed(2)}`);
 });
+
+test('water flowing down through a water wheel is counted, going down = +', () => {
+  TEST_BLOCKS.waterWheel = { fluid: { sides: 'all' }, wheel: true };
+  LETTERS.O = 'waterWheel';
+  const world = worldFrom(['~', 'O', '.', '#']);
+  let out = 0;
+  for (let i = 0; i < 10; i++) out += stepFluids(world, blockInfo).waterOut.get(1) ?? 0;
+  assert.ok(out > 0.5, `only ${out}`);
+});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/circuit.test.js tests/fluids.test.js`
Expected: FAIL — the rounding test (`0.16` gives `0.2`, expected `0.1`) and the wheel test (`waterOut` is undefined: `Cannot read properties of undefined (reading 'get')`).

- [ ] **Step 3: Implement.** Apply:

```diff
--- a/js/circuit.js
+++ b/js/circuit.js
@@ -147,9 +147,11 @@
 /**
  * How hard a part pushes right now, in volts: `pushNow` if it has one
  * (a turbine), otherwise its fixed `push` (a battery), otherwise 0.
- * A changing push is rounded to 0.1, the same as the circuit key does
- * (see circuitKey in electric.js), so the math always matches the key:
- * a turbine that has almost stopped pushes exactly 0, not a tiny bit forever.
+ * A changing push is rounded DOWN (toward zero) to 0.1, the same as the
+ * circuit key does (see circuitKey in electric.js), so the math always
+ * matches the key: a turbine that has almost stopped pushes exactly 0,
+ * not a tiny bit forever. Rounding toward zero also makes a motor that
+ * powers its own generator wind down instead of getting stuck.
  * @param {object|null} part - the part settings
  * @param {object} world - the world
  * @param {number} x - the part's column
@@ -158,7 +160,11 @@
  */
 export function partPush(part, world, x, y) {
   if (!part) return 0;
-  if (part.pushNow) return Math.round(part.pushNow(world, x, y) * 10) / 10;
+  if (part.pushNow) {
+    const push = part.pushNow(world, x, y);
+    // The tiny 1e-9 stops 0.3 (which computers store as 0.29999...) rounding down to 0.2.
+    return Math.sign(push) * Math.floor(Math.abs(push) * 10 + 1e-9) / 10;
+  }
   return part.push ?? 0;
 }
 
```

```diff
--- a/js/fluids.js
+++ b/js/fluids.js
@@ -444,8 +444,10 @@
  * steps), then the special blocks do their jobs once.
  * @param {object} world - the world
  * @param {Function} blockInfo - looks up what a block name means
- * @returns {{moved: number, steamOut: Map<number, number>, sides: string[][]}}
- *   how much changed in total, how much steam left each turbine, and every cell's open sides
+ * @returns {{moved: number, steamOut: Map<number, number>, waterOut: Map<number, number>, sides: string[][]}}
+ *   how much changed in total, how much steam left each turbine, how much
+ *   water left each water wheel (+ going down or right, − going up or left),
+ *   and every cell's open sides
  */
 export function stepFluids(world, blockInfo) {
   const sides = allOpenSides(world, blockInfo);
@@ -461,11 +463,25 @@
   const countTurbines = (from, to, amount) => {
     if (blockInfo(world.cells[from])?.turbine) steamOut.set(from, (steamOut.get(from) ?? 0) + amount);
   };
+  const waterOut = new Map();
+  /**
+   * Count water leaving a water wheel, and which way it went (that's
+   * what turns it): down or right counts +, up or left counts −.
+   * @param {number} from - the cell the water left
+   * @param {number} to - where it went
+   * @param {number} amount - how much
+   * @returns {void}
+   */
+  const countWheels = (from, to, amount) => {
+    if (!blockInfo(world.cells[from])?.wheel) return;
+    const signed = to > from ? amount : -amount; // down (+width) and right (+1) are bigger indexes
+    waterOut.set(from, (waterOut.get(from) ?? 0) + signed);
+  };
   let moved = 0;
   for (let step = 0; step < FLUID_STEPS; step++) {
-    moved += flowFluid(world, 'water', canFlow, () => {});
+    moved += flowFluid(world, 'water', canFlow, countWheels);
     moved += flowFluid(world, 'steam', canFlow, countTurbines);
   }
   moved += runSpecials(world, blockInfo, sides);
-  return { moved, steamOut, sides };
+  return { moved, steamOut, waterOut, sides };
 }
```

```diff
--- a/js/blocks/water.js
+++ b/js/blocks/water.js
@@ -105,7 +105,7 @@
  * @returns {boolean} always false: no blocks moved
  */
 export function waterSystem(world, blockInfo) {
-  const { moved, steamOut } = stepFluids(world, blockInfo);
+  const { moved, steamOut, waterOut } = stepFluids(world, blockInfo);
   const before = world.signals.water?.turbineFlow ?? new Map();
   const turbineFlow = new Map();
   world.cells.forEach((name, index) => {
@@ -113,7 +113,8 @@
     const last = before.get(index) ?? 0;
     turbineFlow.set(index, last + ((steamOut.get(index) ?? 0) - last) / TURBINE_SMOOTHING);
   });
-  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow };
+  // waterOut is kept for the ⚙️ pack: water flowing through a water wheel turns it.
+  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow, waterOut };
   if (moved > MOVE_EPSILON) world.fluidChanged = true;
   const spinning = [...turbineFlow.values()].some((flow) => flow > MIN_AMOUNT);
   if (moved > MOVE_EPSILON || spinning || world.cells.includes('burnerOn')) world.animating = true;
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. The phase 3 turbine tests still pass.

- [ ] **Step 5: Commit**

```bash
git add js/circuit.js js/fluids.js js/blocks/water.js tests/circuit.test.js tests/fluids.test.js
git commit -m "Engine: round changing pushes toward zero; count water flowing through wheels"
```

---

### Task 2: The spin solver (js/spin.js)

**Files:**
- Create: `js/spin.js`
- Create: `tests/spin.test.js`
- Modify: `tests/modules.test.js` (add `'spin.js'` to the end of `MODULES`)
- Modify: `sw.js` (`PRECACHE`: `'./js/spin.js',` after `'./js/blocks/water.js',`)

**Interfaces:**
- Consumes: `getBlock`, `inBounds` (`world.js`); `partAxis` (`circuit.js`)
- Produces:
  - `MIN_SPEED`
  - `isSpin(info)`
  - `spinAxis(world, x, y, blockInfo)`
  - `solveSpin(world, blockInfo) → { cells: Map<index, { speed, jammed, axis, partAxis }>, turning }`
- Block fields read:
  - `spin: { kind: 'gear' | 'axle' | 'hub', teeth?, diagonal? }`
  - `spinSource(world, x, y) → number | null`
  - `part` (for `partAxis`)

- [ ] **Step 1: Write the failing tests.** Create `tests/spin.test.js`:

```js
/**
 * spin.test.js — checks how gears, axles and spinning machines pass
 * their turning on: directions, speeds, axles, diagonals, jams and
 * sources. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { solveSpin, spinAxis } from '../js/spin.js';

/**
 * Stand-in blocks, with the same spin settings as the real ones in
 * js/blocks/gears.js. `R` is a crank turning ↻ at 1, `Q` one turning ↺ at 1.
 */
const TEST_BLOCKS = {
  gearSmall: { spin: { kind: 'gear', teeth: 8 } },
  gearBig: { spin: { kind: 'gear', teeth: 16, diagonal: true } },
  axle: { spin: { kind: 'axle' } },
  hub: { spin: { kind: 'hub' } },
  crankCW: { spin: { kind: 'hub' }, spinSource: () => 1 },
  crankCCW: { spin: { kind: 'hub' }, spinSource: () => -1 },
  fastCrank: { spin: { kind: 'hub' }, spinSource: () => 3 },
  stone: {},
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter means. */
const LETTERS = {
  '.': 'air', s: 'gearSmall', G: 'gearBig', '-': 'axle', H: 'hub', R: 'crankCW', Q: 'crankCCW',
  F: 'fastCrank', '#': 'stone',
};

/**
 * Build a world from a picture and work out the spinning.
 * @param {string[]} rows - the picture
 * @returns {Function} (x, y) => that block's record
 */
function spin(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const { cells } = solveSpin(world, blockInfo);
  return (x, y) => cells.get(y * world.width + x);
}

test('touching gears turn opposite ways', () => {
  const at = spin(['Rsss']);
  assert.equal(at(1, 0).speed, 1);  // shares the crank's shaft: same way
  assert.equal(at(2, 0).speed, -1); // meshes: the other way
  assert.equal(at(3, 0).speed, 1);
});

test('big gear → small gear: twice as fast; small → big: half as fast', () => {
  const at = spin(['RGsG']);
  assert.equal(at(1, 0).speed, 1);
  assert.equal(at(2, 0).speed, -2);
  assert.equal(at(3, 0).speed, 1);
});

test('an axle carries the turning along its line, the same way round', () => {
  const at = spin(['Rs--s']);
  assert.equal(at(4, 0).speed, 1); // gear → axle → axle → gear, all the same way
  assert.equal(at(2, 0).axis, 'h');
});

test('an axle only connects along its line', () => {
  const at = spin(['.s.', 'R-s']); // the axle faces sideways; the gear above it isn't on its line
  assert.equal(at(2, 1).speed, 1);
  assert.equal(at(1, 0).speed, 0);
});

test('axles face their spinning neighbors', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 0, 'gearSmall');
  setBlock(world, 0, 1, 'axle');
  setBlock(world, 0, 2, 'gearSmall');
  assert.equal(spinAxis(world, 0, 1, blockInfo), 'v');
});

test('hubs connect on all four sides', () => {
  const at = spin(['.s.', 'sRs', '.s.']);
  for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) assert.equal(at(x, y).speed, 1);
});

test('big gears also mesh corner to corner; small gears never do', () => {
  const big = spin(['RG.', '..G']);
  assert.equal(big(2, 1).speed, -1);
  const small = spin(['Rs.', '..s']);
  assert.equal(small(2, 1).speed, 0);
  const mixed = spin(['RG.', '..s']);
  assert.equal(mixed(2, 1).speed, 0);
});

test('three big gears in an L (a triangle) jam: nothing turns', () => {
  const at = spin(['GG', 'GR']);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) {
    assert.equal(at(x, y).jammed, true);
    assert.equal(at(x, y).speed, 0);
  }
});

test('four small gears in a square turn fine (an even loop)', () => {
  const at = spin(['ss.', 'ssR']);
  assert.equal(at(0, 0).jammed, false);
  assert.equal(at(1, 1).speed, 1);
  assert.equal(at(0, 1).speed, -1);
});

test('two cranks turning opposite ways jam; the same way, the faster wins', () => {
  const fight = spin(['RsssQ']);
  assert.equal(fight(2, 0).jammed, true);
  const agree = spin(['RsF']); // R ↻1 through a gear; F ↻3 on the same gear's shaft
  assert.equal(agree(1, 0).speed, 3);
});

test('no source, no turning; a source in one group does not turn another', () => {
  const at = spin(['ss#ss', 'R....']);
  assert.equal(at(0, 0).speed, 1);
  assert.equal(at(3, 0).speed, 0);
  assert.equal(at(3, 0).jammed, false);
});
```

Add `'spin.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/spin.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/spin.js`

- [ ] **Step 3: Create js/spin.js**

```js
/**
 * spin.js — works out how gears, axles and spinning machines turn.
 *
 * Spinning blocks that touch pass their turning on:
 *
 *   gear ↔ gear      the teeth mesh: the next gear turns the OTHER way,
 *                    faster if it's smaller (big → small = twice as fast)
 *   ↔ axle / hub     a shared shaft: it turns the SAME way, same speed
 *
 * So for every connected group, we pick one block and walk outward,
 * working out each block's "ratio": how fast it turns compared to that
 * first block (−2 means twice as fast, the other way round).
 *
 * If two paths give a block different ratios (like three big gears in a
 * triangle: each one would have to turn both ways at once), the group is
 * JAMMED and nothing in it turns. Then the "sources" (cranks, motors,
 * water wheels) decide how fast the group goes.
 *
 * Speeds are in turns per second. + is clockwise ↻, − is anticlockwise ↺.
 * This file only reads the fields blocks have: `spin` and `spinSource`.
 */
import { getBlock, inBounds } from './world.js';
import { partAxis } from './circuit.js';

/** Which way each side is: [dx, dy]. y counts DOWN, so up is -1. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/** Slower than this counts as standing still. */
export const MIN_SPEED = 0.001;

/**
 * Is this block part of the spinning world?
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true if it has a `spin` setting
 */
export function isSpin(info) {
  return Boolean(info?.spin);
}

/**
 * Which way an axle faces: sideways ('h') or up-down ('v'), from the
 * spinning blocks around it (the same rule as pipes and wires: both
 * sides, then above and below, then one side, then one above or below).
 * @param {object} world - the world
 * @param {number} x - the axle's column
 * @param {number} y - the axle's row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {'h'|'v'} the way it faces
 */
export function spinAxis(world, x, y, blockInfo) {
  /**
   * Is the cell dx, dy away a spinning block?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it is
   */
  const at = (dx, dy) => isSpin(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = at(-1, 0);
  const right = at(1, 0);
  const up = at(0, -1);
  const down = at(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
  return 'h';
}

/**
 * Does an axle reach out through this side? Only along its own line.
 * @param {{spin: object, axis: string|null}} point - a spinning block
 * @param {string} side - which side
 * @returns {boolean} true if this block connects through that side
 */
function reaches(point, side) {
  if (point.spin.kind !== 'axle') return true;
  return point.axis === 'v' ? side === 'up' || side === 'down' : side === 'left' || side === 'right';
}

/**
 * How two blocks touching side by side pass on their turning: the
 * number to multiply the first one's speed by to get the second one's.
 * @param {object} a - the first block
 * @param {object} b - the block on its `side`
 * @param {string} side - which side of `a` the block `b` is on
 * @returns {number|null} the ratio, or null if they don't connect
 */
function sideRatio(a, b, side) {
  const opposite = { up: 'down', right: 'left', down: 'up', left: 'right' }[side];
  if (!reaches(a, side) || !reaches(b, opposite)) return null;
  if (a.spin.kind === 'gear' && b.spin.kind === 'gear') return -a.spin.teeth / b.spin.teeth; // teeth mesh
  return 1; // a shared shaft
}

/**
 * Work out how every spinning block turns.
 *
 * Returns a record for every spinning block:
 *   speed     turns per second (+ = ↻ clockwise, − = ↺ anticlockwise)
 *   jammed    true if its group can't turn
 *   axis      for axles: the way it faces
 *   partAxis  for blocks that are also electric parts (motors,
 *             generators): the way they face in a circuit
 *
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{cells: Map<number, object>, turning: boolean}} the records, and whether anything turns
 */
export function solveSpin(world, blockInfo) {
  const points = new Map();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const info = blockInfo(getBlock(world, x, y));
      if (!isSpin(info)) continue;
      const axis = info.spin.kind === 'axle' ? spinAxis(world, x, y, blockInfo) : null;
      points.set(y * world.width + x, { x, y, info, spin: info.spin, axis });
    }
  }

  // Who's connected to whom, and with what ratio (both ways round).
  const links = new Map([...points.keys()].map((index) => [index, []]));
  /**
   * Connect two blocks.
   * @param {number} a - one block's index
   * @param {number} b - the other block's index
   * @param {number} ratio - b's speed = a's speed × ratio
   * @returns {void}
   */
  const connect = (a, b, ratio) => {
    links.get(a).push({ to: b, ratio });
    links.get(b).push({ to: a, ratio: 1 / ratio });
  };
  for (const [a, pa] of points) {
    for (const side of ['right', 'down']) { // looking right and down meets every pair once
      const [dx, dy] = STEP[side];
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      const ratio = pb ? sideRatio(pa, pb, side) : null;
      if (ratio !== null) connect(a, b, ratio);
    }
    if (!pa.spin.diagonal) continue;
    for (const [dx, dy] of [[1, -1], [1, 1]]) { // big gears also mesh corner to corner
      if (!inBounds(world, pa.x + dx, pa.y + dy)) continue;
      const b = a + dx + dy * world.width;
      const pb = points.get(b);
      if (pb?.spin.diagonal) connect(a, b, -pa.spin.teeth / pb.spin.teeth);
    }
  }

  const cells = new Map();
  let turning = false;
  const done = new Set();
  for (const start of points.keys()) {
    if (done.has(start)) continue;
    // Walk the group, giving every block its ratio to the first block.
    const ratio = new Map([[start, 1]]);
    const queue = [start];
    let jammed = false;
    while (queue.length > 0) {
      const at = queue.shift();
      for (const link of links.get(at)) {
        const expected = ratio.get(at) * link.ratio;
        if (!ratio.has(link.to)) {
          ratio.set(link.to, expected);
          queue.push(link.to);
        } else if (Math.abs(ratio.get(link.to) - expected) > 1e-9 * Math.max(1, Math.abs(expected))) {
          jammed = true; // two paths disagree: this block would have to turn two ways at once
        }
      }
    }

    // The sources say how fast the first block must turn. They must all
    // agree on the direction (or it's jammed); the fastest one wins.
    let speed = 0;
    for (const index of ratio.keys()) {
      const point = points.get(index);
      const wants = point.info.spinSource?.(world, point.x, point.y) ?? null;
      if (!wants) continue; // null or 0: not driving right now
      const first = wants / ratio.get(index);
      if (speed !== 0 && Math.sign(first) !== Math.sign(speed)) jammed = true;
      if (Math.abs(first) > Math.abs(speed)) speed = first;
    }

    for (const [index, r] of ratio) {
      done.add(index);
      const point = points.get(index);
      const own = jammed ? 0 : speed * r;
      if (Math.abs(own) > MIN_SPEED) turning = true;
      cells.set(index, {
        speed: own,
        jammed,
        axis: point.axis,
        partAxis: point.info.part ? partAxis(world, point.x, point.y, blockInfo) : null,
      });
    }
  }
  return { cells, turning };
}
```

Add `'./js/spin.js',` to `PRECACHE` in `sw.js` after `'./js/blocks/water.js',`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail (11 spin tests).

- [ ] **Step 5: Commit**

```bash
git add js/spin.js tests/spin.test.js tests/modules.test.js sw.js
git commit -m "Add the spin solver: gear ratios, axles, diagonal big gears, jams, sources"
```

---

### Task 3: The ⚙️ pack, its README section and pictures

**Files:**
- Create: `js/blocks/gears.js`
- Create: `tests/gears.test.js`
- Modify: `js/blocks/registry.js` (import + `PACKS = [basic, water, gears, electric]`)
- Modify: `tests/registry.test.js` (pack order), `tests/modules.test.js` (add `'blocks/gears.js'`)
- Modify: `sw.js` (`PRECACHE`: `'./js/blocks/gears.js',` after `'./js/spin.js',`; `CACHE_NAME = 'caleb-v5'`)
- Modify: `tools/make-block-pictures.cjs` (gear letters, 2 extra pictures, 3 machines)
- Modify: `README.md` (⚙️ GEARS section, 3 machines, file rows, a Try-this tip)
- Create (generated): `docs/blocks/{gearSmall,gearBig,axle,crankStop,crankCW,waterWheel,motor,generator,gearBig-jammed}.png`, `docs/machines/{gear-train,jam-triangle,hydro-dam}.png`

**Interfaces:**
- Consumes:
  - `solveSpin`, `MIN_SPEED` (Task 2)
  - `swapBlock` (world)
  - `signals.water.waterOut` (Task 1)
  - `signals.electric.cells` (phase 2)
- Produces:
  - **`gears.js`:** `CRANK_SPEED`, `MOTOR_SPEED`, `WHEEL_GAIN`, `GENERATOR_GAIN`, `spinAt(world, x, y)`, `generatorPush`, `motorSource`, `wheelSource`, `refreshSpin`, `gearsSystem`
  - **The default pack:** `{ tab: { id: 'gears', icon: '⚙️', label: 'Gears' }, blocks, systems: [gearsSystem], refresh: refreshSpin }`
  - **`world.signals.spin`:** `{ cells, turning, wheelFlow }`

- [ ] **Step 1: Write the failing tests.** Create `tests/gears.test.js`:

```js
/**
 * gears.test.js — checks the ⚙️ pack with the real blocks: the crank,
 * gear trains, a crank-powered generator lighting a lamp, a battery
 * running a motor, a motor and generator winding down, and a water wheel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack, isKnownBlock } from '../js/blocks/registry.js';
import gears, { spinAt } from '../js/blocks/gears.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery', s: 'gearSmall', G: 'gearBig',
  '-': 'axle', R: 'crankCW', Q: 'crankCCW', M: 'motor', E: 'generator', O: 'waterWheel', F: 'faucet',
};

/**
 * Build a world from a picture and run it for some ticks.
 * @param {string[]} rows - the picture
 * @param {number} ticks - how many ticks to run
 * @returns {object} the world
 */
function run(rows, ticks) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * How bright the lamp at x, y is.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} its level
 */
const lampLevel = (world, x, y) => world.signals.electric.cells.get(y * world.width + x)?.level ?? 0;

test('the gears tab shows one of each block (the crank is shown stopped)', () => {
  assert.deepEqual(blocksInPack('gears'), ['gearSmall', 'gearBig', 'axle', 'crankStop', 'waterWheel', 'motor', 'generator']);
  assert.equal(isKnownBlock('crankCW'), true);
  assert.deepEqual(gears.tab, { id: 'gears', icon: '⚙️', label: 'Gears' });
});

test('✋ on a crank: stopped → ↻ → ↺ → stopped', () => {
  const world = createWorld(1, 1);
  setBlock(world, 0, 0, 'crankStop');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(blockInfo(getBlock(world, 0, 0)).use({ world, x: 0, y: 0 }), true);
    seen.push(getBlock(world, 0, 0));
  }
  assert.deepEqual(seen, ['crankCW', 'crankCCW', 'crankStop']);
});

test('a crank turns a gear train: each gear the other way, big → small twice as fast', () => {
  const world = run(['RsGs'], 1);
  assert.equal(spinAt(world, 1, 0), 1);
  assert.equal(spinAt(world, 2, 0), -0.5);
  assert.equal(spinAt(world, 3, 0), 1);
});

test('a crank turning a generator lights a lamp, whichever way it turns', () => {
  for (const crank of ['R', 'Q']) {
    // The generator sits in a loop of wire with a lamp; the crank turns it from above.
    const world = run([
      `.${crank}.`,
      'WEW',
      'W.W',
      'WLW',
    ], 3);
    assert.ok(lampLevel(world, 1, 3) > 0.5, `crank ${crank}: lamp at ${lampLevel(world, 1, 3)}`);
  }
});

test('a battery turns a motor, and turning the battery round turns the motor the other way', () => {
  // Battery on the left: current goes left → right through the motor: ↻.
  const forward = run(['.s.', 'WMW', 'B.W', 'WWW'], 3);
  assert.ok(spinAt(forward, 1, 0) > 0.5, `forward: ${spinAt(forward, 1, 0)}`); // the gear shares the motor's shaft
  // Battery on the right: current goes right → left: ↺.
  const backward = run(['.s.', 'WMW', 'W.B', 'WWW'], 3);
  assert.ok(spinAt(backward, 1, 0) < -0.5, `backward: ${spinAt(backward, 1, 0)}`);
});

test('a motor powered only by its own generator winds down and stops', () => {
  const world = createWorld(4, 3);
  const rows = ['WMEW', 'W..W', 'WWWW'];
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  // Give it a push to start: pretend the generator was spinning fast.
  world.signals.spin = { cells: new Map([[2, { speed: 2 }]]), wheelFlow: new Map() };
  const systems = allSystems();
  for (let i = 0; i < 40; i++) tick(world, systems, blockInfo);
  assert.equal(spinAt(world, 1, 0), 0);
  assert.equal(spinAt(world, 2, 0), 0);
});

test('water falling through a water wheel turns it', () => {
  const world = createWorld(3, 5);
  const rows = ['.F.', '...', '.O.', '...', '###'];
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  setFluid(world, 'water', 1, 1, 0);
  const systems = allSystems();
  let fastest = 0;
  for (let i = 0; i < 30; i++) {
    tick(world, systems, blockInfo);
    fastest = Math.max(fastest, spinAt(world, 1, 2));
  }
  assert.ok(fastest > 0.1, `the wheel only reached ${fastest}`);
});
```

Apply:

```diff
--- a/tests/registry.test.js
+++ b/tests/registry.test.js
@@ -56,8 +56,8 @@
   assert.ok(allSystems().includes(fallingBlocks));
 });
 
-test('the packs run basic first, then water, then electric', () => {
-  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'water', 'electric']);
+test('the packs run basic, then water, then gears, then electric', () => {
+  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'water', 'gears', 'electric']);
 });
 
 test('blocksInPack gives the palette for one tab', () => {
```

Add `'blocks/gears.js'` to the end of `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/blocks/gears.js` (`gears.test.js`, module test) and the pack-order test.

- [ ] **Step 3: Create js/blocks/gears.js**

```js
/**
 * gears.js — the ⚙️ Gears pack: small and big gears, axles, a crank,
 * a water wheel, a motor and a generator.
 *
 * spin.js works out who turns which way and how fast; this file says
 * what each block is, runs spin.js every tick, and draws the turning.
 * It joins the other packs together:
 *
 *    💧 water → water wheel → gears → generator → ⚡ lamp
 *    ⚡ battery → motor → gears
 *
 * Nothing spins forever by itself: a generator gives back a little less
 * than a motor uses (GENERATOR_GAIN), so a motor powered only by its own
 * generator slows down and stops. Real machines lose energy too.
 */
import { solveSpin, MIN_SPEED } from '../spin.js';
import { swapBlock } from '../world.js';

/**
 * How fast a crank turns, in turns per second.
 * 🧪 Try this! 3 for a speedy crank.
 */
export const CRANK_SPEED = 1;

/** How fast a motor turns with a normal amount of current (level 1). */
export const MOTOR_SPEED = 1;

/**
 * How fast a water wheel turns for each unit of water flowing through
 * it per tick. A faucet drips 0.05 a tick, so 20 makes that 1 turn a second.
 */
export const WHEEL_GAIN = 20;

/**
 * How hard a generator pushes (volts) for each turn per second. Less
 * than 1, so motor → generator → motor loops run down: no machine runs
 * forever on its own.
 * 🧪 Try this! 1.5 and build a motor powered by its own generator... it
 * runs away faster and faster (real machines can't do that!).
 */
export const GENERATOR_GAIN = 0.8;

/** Sources slower than this don't drive anything. */
const MIN_SOURCE = 0.05;

/** A water wheel's speed follows the water slowly (about 8 ticks), so it doesn't jitter. */
const WHEEL_SMOOTHING = 8;

/**
 * The clock's ticks per second (the same as TICKS_PER_SECOND in build.js),
 * used to turn "turns per second" into how far to draw a gear round.
 */
const TICKS_PER_SECOND = 8;

/**
 * Gears are DRAWN turning this many times slower than they really turn.
 * A small gear has 8 teeth, so at 1 turn a second it would move exactly
 * one tooth every tick, and every picture would look the same: it would
 * look stopped! Slowed down 4 times, its teeth creep round a quarter of
 * a tooth each tick, which you can see.
 * 🧪 Try this! 1, and watch the gears seem to stand still.
 */
const DRAW_SLOWDOWN = 4;

/** The order a crank goes through when you tap it with ✋. */
const CRANK_TURNS = { crankStop: 'crankCW', crankCW: 'crankCCW', crankCCW: 'crankStop' };

// =============================================================
// Sources: how fast each machine wants to turn
// =============================================================

/**
 * How fast the block at x, y is turning right now (0 if it isn't).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {number} turns per second (+ = ↻)
 */
export function spinAt(world, x, y) {
  return world.signals.spin?.cells?.get(y * world.width + x)?.speed ?? 0;
}

/**
 * A generator's push: how fast it turns × GENERATOR_GAIN. Turning the
 * other way pushes the other way (its + end swaps).
 * @param {object} world - the world
 * @param {number} x - the generator's column
 * @param {number} y - the generator's row
 * @returns {number} the push, in volts
 */
export function generatorPush(world, x, y) {
  return spinAt(world, x, y) * GENERATOR_GAIN;
}

/**
 * How fast a motor wants to turn: as hard as the current through it,
 * and which way depends on which way the current goes. Current coming
 * out of its right end (or top end, facing up-down) turns it ↻.
 * @param {object} world - the world
 * @param {number} x - the motor's column
 * @param {number} y - the motor's row
 * @returns {number|null} turns per second, or null if it has no power
 */
export function motorSource(world, x, y) {
  const cell = world.signals.electric?.cells?.get(y * world.width + x);
  if (!cell || cell.level < MIN_SOURCE) return null;
  const out = cell.arms[cell.axis === 'v' ? 'up' : 'right'] ?? 0;
  if (out === 0) return null;
  return Math.sign(out) * cell.level * MOTOR_SPEED;
}

/**
 * How fast a water wheel wants to turn: the water flowing through it
 * (smoothed), × WHEEL_GAIN. Water going down or right turns it ↻.
 * @param {object} world - the world
 * @param {number} x - the wheel's column
 * @param {number} y - the wheel's row
 * @returns {number|null} turns per second, or null if hardly any water flows
 */
export function wheelSource(world, x, y) {
  const flow = world.signals.spin?.wheelFlow?.get(y * world.width + x) ?? 0;
  const speed = flow * WHEEL_GAIN;
  return Math.abs(speed) < MIN_SOURCE ? null : speed;
}

// =============================================================
// Running the gears
// =============================================================

/**
 * Work out the turning again (for example, right after a gear was
 * placed), keeping the water wheels' flow. See refreshSignals in registry.js.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
export function refreshSpin(world, blockInfo) {
  const wheelFlow = world.signals.spin?.wheelFlow ?? new Map();
  world.signals.spin = { ...solveSpin(world, blockInfo), wheelFlow };
}

/**
 * The gears rule that runs every tick: follow the water flowing through
 * the water wheels (from the 💧 pack, which ran just before), work out
 * the turning, and ask for a redraw while anything turns.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function gearsSystem(world, blockInfo) {
  const before = world.signals.spin?.wheelFlow ?? new Map();
  const waterOut = world.signals.water?.waterOut ?? new Map();
  const wheelFlow = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.wheel) return;
    const last = before.get(index) ?? 0;
    wheelFlow.set(index, last + ((waterOut.get(index) ?? 0) - last) / WHEEL_SMOOTHING);
  });
  world.signals.spin = { ...solveSpin(world, blockInfo), wheelFlow };
  if (world.signals.spin.turning) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.
// A cell's record (from spin.js) says how fast it turns and if it's jammed.

/**
 * How far round a block has turned, as a number from 0 to 1, from the
 * clock and its speed.
 * @param {object|undefined} cell - its spin record (none in the palette)
 * @param {number} ticks - the world's clock
 * @returns {number} 0 = not turned, 0.5 = half a turn, ...
 */
function turned(cell, ticks) {
  if (!cell || Math.abs(cell.speed) < MIN_SPEED) return 0;
  const turns = (ticks * cell.speed) / (TICKS_PER_SECOND * DRAW_SLOWDOWN);
  return turns - Math.floor(turns);
}

/**
 * Draw a filled circle made of little squares (pixel-art style).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} cx - the middle, in pixels
 * @param {number} cy - the middle, in pixels
 * @param {number} radius - in pixels
 * @param {number} step - how big each little square is
 * @returns {void}
 */
function drawDisc(ctx, cx, cy, radius, step) {
  for (let dy = -radius; dy < radius; dy += step) {
    const y = dy + step / 2;
    const half = Math.sqrt(Math.max(0, radius * radius - y * y));
    const width = Math.round(half / step) * step;
    if (width > 0) ctx.fillRect(cx - width, cy + dy, width * 2, step);
  }
}

/**
 * Draw a gear: a disc, a ring of teeth, and a hole in the middle. The
 * teeth go round as it turns. Jammed gears get a red ❌.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.spin.teeth)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawGear(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const big = info.spin.teeth > 8;
  const cx = left + size / 2;
  const cy = top + size / 2;
  ctx.fillStyle = big ? '#8d6e63' : '#9e9e9e';
  drawDisc(ctx, cx, cy, (big ? 3 : 2.25) * p, p / 2);
  const teeth = info.spin.teeth;
  const reach = (big ? 3.5 : 2.75) * p;
  const angle = turned(cell, ticks) * Math.PI * 2;
  ctx.fillStyle = big ? '#6d4c41' : '#757575';
  for (let k = 0; k < teeth; k++) {
    const a = angle + (k / teeth) * Math.PI * 2;
    ctx.fillRect(cx + Math.cos(a) * reach - p / 2, cy + Math.sin(a) * reach - p / 2, p, p);
  }
  ctx.fillStyle = '#424242';
  ctx.fillRect(cx - p / 2, cy - p / 2, p, p); // the hole for the shaft
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a red ❌ across a jammed block.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawJam(ctx, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#e53935';
  for (let k = 1; k < 7; k++) {
    ctx.fillRect(left + k * p, top + k * p, p, p);
    ctx.fillRect(left + (7 - k) * p, top + k * p, p, p);
  }
}

/**
 * Draw an axle: a rod along its line, with a stripe that slides as it turns.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawAxle(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const upright = cell?.axis === 'v';
  ctx.fillStyle = '#9e9e9e';
  if (upright) ctx.fillRect(left + 3 * p, top, 2 * p, size);
  else ctx.fillRect(left, top + 3 * p, size, 2 * p);
  ctx.fillStyle = '#616161';
  const along = Math.floor(turned(cell, ticks) * 8) * p; // the stripe moves one little pixel at a time
  if (upright) ctx.fillRect(left + 3 * p, top + along, 2 * p, p);
  else ctx.fillRect(left + along, top + 3 * p, p, 2 * p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a crank: a handle on an arm that goes round while it's turning.
 * The knob is green while it turns and red when it's stopped.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.turning when it's not stopped)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawCrank(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const quarter = Math.floor(turned(cell, ticks) * 4); // 4 positions: up, right, down, left
  const [kx, ky] = [[3.5, 1], [6, 3.5], [3.5, 6], [1, 3.5]][quarter];
  ctx.fillStyle = '#5d4037'; // the arm
  const [ax, ay, aw, ah] = [[3.5, 1.5, 1, 2], [4, 3.5, 2, 1], [3.5, 4, 1, 2], [1.5, 3.5, 2, 1]][quarter];
  ctx.fillRect(left + ax * p, top + ay * p, aw * p, ah * p);
  ctx.fillStyle = '#424242';
  ctx.fillRect(left + 3 * p, top + 3 * p, 2 * p, 2 * p); // the hub
  ctx.fillStyle = info.turning ? '#43a047' : '#e53935'; // the knob
  ctx.fillRect(left + kx * p, top + ky * p, p, p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a water wheel: a hub with four paddles that turn.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawWheel(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  const tilted = Math.floor(turned(cell, ticks) * 8) % 2 === 1; // + or × paddles
  ctx.fillStyle = '#8d6e63';
  const paddles = tilted
    ? [[1, 1], [6, 1], [1, 6], [6, 6], [2, 2], [5, 2], [2, 5], [5, 5]]
    : [[3.5, 0], [3.5, 1], [3.5, 6], [3.5, 7], [0, 3.5], [1, 3.5], [6, 3.5], [7, 3.5]];
  for (const [x, y] of paddles) ctx.fillRect(left + x * p, top + y * p, p, p);
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(left + 3 * p, top + 3 * p, 2 * p, 2 * p);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw the two metal ends of a motor or generator, on the sides it
 * faces in a circuit (like the ⚡ parts).
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {'h'|'v'} axis - the way it faces
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawEnds(ctx, axis, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#b0b0b0';
  if (axis === 'v') {
    ctx.fillRect(left + 3 * p, top, 2 * p, p);
    ctx.fillRect(left + 3 * p, top + 7 * p, 2 * p, p);
  } else {
    ctx.fillRect(left, top + 3 * p, p, 2 * p);
    ctx.fillRect(left + 7 * p, top + 3 * p, p, 2 * p);
  }
}

/**
 * Draw a motor: a box with a shaft end that goes round.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawMotor(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  ctx.fillStyle = '#263238';
  ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, 4 * p);
  const quarter = Math.floor(turned(cell, ticks) * 4);
  const [x, y] = [[3.5, 2.5], [4.5, 3.5], [3.5, 4.5], [2.5, 3.5]][quarter];
  ctx.fillStyle = '#ffca28';
  ctx.fillRect(left + x * p, top + y * p, p, p);
  drawEnds(ctx, cell?.partAxis ?? 'h', left, top, size);
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

/**
 * Draw a generator: a box with a copper coil, and a "+" on the end that
 * pushes current out. That's the right (or top) end turning ↻, and the
 * other end turning ↺.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - its spin record
 * @returns {void}
 */
function drawGenerator(ctx, info, left, top, size, cell) {
  const p = size / 8;
  ctx.fillStyle = '#e08a3c';
  for (const row of [2, 3.5, 5]) ctx.fillRect(left + 2 * p, top + row * p, 4 * p, p); // the coil
  const axis = cell?.partAxis ?? 'h';
  const forward = (cell?.speed ?? 0) >= 0;
  // Where the "+" goes: the + end.
  const [px, py] = axis === 'v' ? (forward ? [3.5, 0.5] : [3.5, 6.5]) : (forward ? [6.5, 3.5] : [0.5, 3.5]);
  drawEnds(ctx, axis, left, top, size);
  if (Math.abs(cell?.speed ?? 0) >= MIN_SPEED) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(left + (px - 0.5) * p, top + py * p, 2 * p, p);            // across...
    ctx.fillRect(left + px * p, top + (py - 0.5) * p, p, 2 * p);            // ...and up and down
  }
  if (cell?.jammed) drawJam(ctx, left, top, size);
}

// =============================================================
// The blocks
// =============================================================

/**
 * Make one of the crank's three blocks (stopped, ↻ or ↺).
 * @param {number} speed - how fast it drives: CRANK_SPEED, −CRANK_SPEED or 0
 * @param {string} name - its block name
 * @returns {object} the block's definition
 */
function crank(speed, name) {
  return {
    title: 'Crank',
    color: '#bcaaa4',
    hidden: name !== 'crankStop',
    turning: speed !== 0,
    spin: { kind: 'hub' },
    spinSource: speed === 0 ? undefined : () => speed,
    use: (ctx) => swapBlock(ctx.world, ctx.x, ctx.y, CRANK_TURNS[name]),
    drawSignals: drawCrank,
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 *   spin         how it joins the spinning: a gear (with teeth), an axle, or a hub (a shaft)
 *   spinSource   how fast it wants to turn right now (null = not driving)
 *   wheel        the 💧 pack counts water flowing through it
 *   part         it's also an ⚡ circuit part (motor, generator)
 *   hidden       not in the palette (you get it with ✋)
 * 🧪 Try this! Give the big gear 24 teeth: small gears spin 3 times as fast.
 */
const blocks = {
  gearSmall: { title: 'Small gear', color: '#cfd8dc', bare: true, spin: { kind: 'gear', teeth: 8 }, drawSignals: drawGear },
  gearBig: {
    title: 'Big gear', color: '#d7ccc8', bare: true,
    spin: { kind: 'gear', teeth: 16, diagonal: true }, drawSignals: drawGear,
  },
  axle: { title: 'Axle', color: '#9e9e9e', bare: true, spin: { kind: 'axle' }, drawSignals: drawAxle },
  crankStop: crank(0, 'crankStop'),
  waterWheel: {
    title: 'Water wheel', color: '#a1887f', bare: true,
    spin: { kind: 'hub' }, fluid: { sides: 'all' }, wheel: true, spinSource: wheelSource, drawSignals: drawWheel,
  },
  motor: {
    title: 'Motor', color: '#78909c',
    spin: { kind: 'hub' }, part: { resistance: 1 }, spinSource: motorSource, drawSignals: drawMotor,
  },
  generator: {
    title: 'Generator', color: '#546e7a',
    spin: { kind: 'hub' }, part: { resistance: 0.05, pushNow: generatorPush }, drawSignals: drawGenerator,
  },
  crankCW: crank(CRANK_SPEED, 'crankCW'),
  crankCCW: crank(-CRANK_SPEED, 'crankCCW'),
};

export default {
  tab: { id: 'gears', icon: '⚙️', label: 'Gears' },
  blocks,
  systems: [gearsSystem],
  refresh: refreshSpin,
};
```

Apply to the registry:

```diff
--- a/js/blocks/registry.js
+++ b/js/blocks/registry.js
@@ -9,6 +9,7 @@
 import basic from './basic.js';
 import electric from './electric.js';
 import water from './water.js';
+import gears from './gears.js';
 
 /**
  * Every pack, in the order their systems run each tick. Order matters
@@ -17,7 +18,7 @@
  * for steam. The plan for later phases is:
  *   basic → water → mechanical → electric
  */
-export const PACKS = [basic, water, electric];
+export const PACKS = [basic, water, gears, electric];
 
 /**
  * The names of the signals packs pass to each other: ⚡ power (wires,
```

In `sw.js`, add `'./js/blocks/gears.js',` to `PRECACHE` after `'./js/spin.js',`, and set `CACHE_NAME = 'caleb-v5'`.

- [ ] **Step 4: Run the tests: only the README tests should fail now**

Run: `npm test 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: exactly 7 failures, `the README shows and explains the Gears block "…"`, one for each new palette block. Everything else passes. That's the README test doing its job.

- [ ] **Step 5: Pictures and README.** Apply to the picture tool:

```diff
--- a/tools/make-block-pictures.cjs
+++ b/tools/make-block-pictures.cjs
@@ -38,6 +38,8 @@
   ['valveClosed', 'valveClosed', undefined],
   ['burnerOff', 'burnerOff', undefined],
   ['pumpUp', 'pumpUp', undefined],
+  ['crankCW', 'crankCW', undefined],
+  ['gearBig-jammed', 'gearBig', { speed: 0, jammed: true }],
 ];
 
 /**
@@ -62,6 +64,14 @@
   C: ['chiller'],
   '^': ['pumpUp'],
   '~': ['air', 'water'],
+  D: ['drain'],
+  f: ['faucet'],
+  i: ['gearSmall'],
+  G: ['gearBig'],
+  '-': ['axle'],
+  R: ['crankCW'],
+  O: ['waterWheel'],
+  E: ['generator'],
 };
 
 /**
@@ -126,6 +136,20 @@
     '##~##',
     '#####',
   ] },
+  'gear-train': { ticks: 3, rows: [
+    'RiGi--i',
+  ] },
+  'jam-triangle': { ticks: 3, rows: [
+    'GG',
+    'GR',
+  ] },
+  'hydro-dam': { ticks: 40, rows: [
+    '.f.....',
+    '....WWW',
+    '.OiiE.L',
+    '.D..WWW',
+    '#######',
+  ] },
   'sand-in-water': { ticks: 4, rows: [
     'gsssg',
     'g~~~g',
```

Run:

```bash
NODE_PATH=/home/hamsa/LFG/scripts/share_card/node_modules node tools/make-block-pictures.cjs
```

Expected: `made 46 block pictures and 12 machine pictures`.

Apply to the README:

```diff
--- a/README.md
+++ b/README.md
@@ -2,8 +2,8 @@
 
 Caleb's blocky corner of the internet: 🎵 **Note Blocks** (notes, chords,
 scales and an ear-training game), 🎨 **Draw**, ✍️ **Write** (print and
-cursive tracing), and ⛏️ **Build** (a block world with water, steam and
-electricity: see [the Build page blocks](#-the-build-page-blocks)).
+cursive tracing), and ⛏️ **Build** (a block world with water, steam,
+electricity and gears: see [the Build page blocks](#-the-build-page-blocks)).
 
 It's built with plain HTML, CSS and JavaScript (no frameworks, no build
 step), so every file can be opened, read, changed and tried.
@@ -39,6 +39,8 @@
 | `js/circuit.js` | The electricity math: loops, brightness, short circuits (pure) |
 | `js/blocks/water.js` | 💧 Water blocks: pipes, valves, faucets, drains, burners, chillers, turbines, pumps |
 | `js/fluids.js` | How water and steam move: falling, spreading, squishing (pure) |
+| `js/blocks/gears.js` | ⚙️ Gear blocks: gears, axle, crank, water wheel, motor, generator |
+| `js/spin.js` | How turning passes from gear to gear, and when gears jam (pure) |
 | `js/blocks/registry.js` | The list of block packs (add new packs here) |
 | `js/block-art.js` | Draws blocks pixel-art style |
 | `js/saves.js` | Keeps the three Build worlds saved |
@@ -66,7 +68,7 @@
 - **✋ USE**: tap a block to make it do its thing: a switch flips, a valve
   opens, a note block sings.
 
-The blocks are on three tabs. Here's what every one of them is.
+The blocks are on four tabs. Here's what every one of them is.
 
 ### ⛏️ BLOCKS
 
@@ -130,6 +132,31 @@
 batteries get dangerously hot when you do that, so never try it with a real
 one. Nothing breaks here: fix the wiring and it stops.
 
+### ⚙️ GEARS
+
+Spinning things pass their turning on to whatever they touch. **Gears**
+that touch turn **opposite** ways. Things on the same **shaft** (an axle,
+or a crank, wheel, motor or generator touching a gear) turn the **same** way.
+
+| | Block | What it does | ✋ USE |
+|---|---|---|---|
+| ![Small gear](docs/blocks/gearSmall.png) | **Small gear** | 8 teeth. Turns the gears next to it the other way. | — |
+| ![Big gear](docs/blocks/gearBig.png) | **Big gear** | 16 teeth, so it turns **half as fast** as a small gear it's touching (and a small gear driven by it turns **twice as fast**). Big gears also touch corner to corner. | — |
+| ![Axle](docs/blocks/axle.png) | **Axle** | A rod: carries turning in a straight line, the same way round. | — |
+| ![Crank](docs/blocks/crankStop.png) | **Crank** | Hand power! Red knob = stopped, green knob = turning. ![Turning crank](docs/blocks/crankCW.png) | stop → ↻ → ↺ → stop |
+| ![Water wheel](docs/blocks/waterWheel.png) | **Water wheel** | Turns when 💧 water flows through it. More water = faster. | — |
+| ![Motor](docs/blocks/motor.png) | **Motor** | Turns ⚡ electricity into turning. Put it in a loop with a battery (wires on its sides). Swap the battery round and it turns the other way. | — |
+| ![Generator](docs/blocks/generator.png) | **Generator** | Turns turning into ⚡ electricity: wire it up like a battery. Its **+** end swaps when it turns the other way. | — |
+
+**Jammed!** Three big gears all touching each other (in an L) can't turn: each
+one would have to turn both ways at once. The whole group stops and shows a
+red ❌ (![Jammed gear](docs/blocks/gearBig-jammed.png)). Two cranks turning
+opposite ways on the same gears jam too.
+
+**Nothing runs forever.** A generator gives back a little less electricity
+than a motor uses, so a motor powered only by its own generator slows down
+and stops, just like real machines.
+
 ### 🛠️ Machines to build
 
 Each picture was taken from the real game. Build it, then watch.
@@ -177,6 +204,24 @@
 
 ![A battery-powered pump lifting water](docs/machines/pump-uphill.png)
 
+**Gear train.** A crank, then small, big and small gears, an axle, and one more
+gear. Each gear turns the other way from the one it touches; the big gear turns
+slowly and the small gear after it turns twice as fast. The axle carries the
+turning along without flipping it.
+
+![A crank turning a row of gears and an axle](docs/machines/gear-train.png)
+
+**Jam!** Three big gears touching in an L, turned by a crank. They can't turn,
+so they all show a red ❌. Take one away and they spin again.
+
+![Three big gears jammed](docs/machines/jam-triangle.png)
+
+**Hydro dam.** A faucet pours water through a water wheel (and away down a
+drain). The wheel turns two gears, the gears turn a generator, and the
+generator lights a lamp: water power!
+
+![Water turning a wheel, gears and a generator that lights a lamp](docs/machines/hydro-dam.png)
+
 **Sand sinks.** Drop sand onto water. The sand sinks and the water floats up
 in its place.
 
@@ -200,6 +245,7 @@
 12. **Slow-motion sand:** in `js/build.js`, set `TICKS_PER_SECOND` to 2.
 13. **Dimmer lamps:** in `js/blocks/electric.js`, change the lamp's `resistance` to 2.
 14. **Slow-motion water:** in `js/fluids.js`, set `FLUID_STEPS` to 1.
+15. **Super gears:** in `js/blocks/gears.js`, give the big gear 24 teeth: small gears it drives spin 3 times as fast.
 
 ## Using it like an app (offline)
 
```

Look at `docs/machines/gear-train.png`, `jam-triangle.png` and `hydro-dam.png`. You should see:
- the gear train: small, big and small gears, an axle, and a gear
- every block in the jam showing a red ❌
- the hydro dam's lamp lit, with dots on its wires

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail (342).

- [ ] **Step 7: Commit**

```bash
git add js/blocks tests/gears.test.js tests/registry.test.js tests/modules.test.js sw.js tools/make-block-pictures.cjs README.md docs/blocks docs/machines
git commit -m "Add the gears pack: gears, axle, crank, water wheel, motor, generator (with README pictures)"
```

---

### Task 4: Browser sign-off, ship

**Files:**
- Test: `$SCRATCH/check-gears.cjs` (scratchpad)

- [ ] **Step 1: Write the browser check.** Save as `$SCRATCH/check-gears.cjs`:

```js
// Drives the ⚙️ pack on build.html. Usage: node check-gears.cjs <port> <shot-prefix>
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
  const tap = async (x, y) => { const g = await geo(); await page.mouse.click(g.left + (x + 0.5) * g.cell, g.top + (y + 0.5) * g.cell); };
  const tab = (id) => page.click(`[data-tab="${id}"]`);
  const place = async (label, cells) => { await page.click(`[aria-label="${label}"]`); for (const [x, y] of cells) await tap(x, y); };
  /** The canvas pixels of one cell, as a string (to compare frames). */
  const cellPixels = (x, y) => page.evaluate(([x, y]) => {
    const c = document.getElementById('world'); const r = c.width / 24;
    return Array.from(c.getContext('2d').getImageData(Math.round(x * r), Math.round(y * r), Math.round(r), Math.round(r)).data).join();
  }, [x, y]);
  /** Average color of the middle of a cell. */
  const color = (x, y) => page.evaluate(([x, y]) => {
    const c = document.getElementById('world'); const r = c.width / 24;
    const d = c.getContext('2d').getImageData(Math.round((x + 0.5) * r) - 2, Math.round((y + 0.5) * r) - 2, 4, 4).data;
    return [d[0], d[1], d[2]];
  }, [x, y]);

  // 1. A crank turning a gear train at row 3: crank (2,3), gears (3..5,3).
  await tab('gears');
  await place('Small gear', [[3, 3], [5, 3]]);
  await place('Big gear', [[4, 3]]);
  await place('Crank', [[2, 3]]);
  await page.click('[data-tool="use"]');
  await tap(2, 3); // stopped → ↻
  await page.waitForTimeout(300);
  const a = await cellPixels(3, 3); await page.waitForTimeout(260); const b = await cellPixels(3, 3);
  assert.notEqual(a, b, 'the gear is not turning');

  // 2. Crank → generator → lamp: crank (10,2) above generator (10,3); loop of wire with a lamp.
  await page.click('[data-tool="build"]');
  await tab('electric');
  await place('Wire', [[9, 3], [11, 3], [9, 4], [11, 4], [9, 5], [11, 5]]);
  await place('Lamp', [[10, 5]]);
  await tab('gears');
  await place('Generator', [[10, 3]]);
  await place('Crank', [[10, 2]]);
  await page.click('[data-tool="use"]');
  await tap(10, 2);
  let lit = false;
  for (let i = 0; i < 12 && !lit; i++) {
    await page.waitForTimeout(250);
    const [r, g, bl] = await color(10, 5);
    lit = r > 200 && g > 180 && bl < 150;
  }
  assert.ok(lit, 'the crank-powered generator never lit the lamp');
  await page.screenshot({ path: `${prefix}-generator.png` });

  // 3. Three big gears in an L jam: red shows.
  await page.click('[data-tool="build"]');
  await place('Big gear', [[16, 3], [17, 3], [16, 4]]);
  await place('Crank', [[17, 4]]);
  await page.click('[data-tool="use"]');
  await tap(17, 4);
  await page.waitForTimeout(300);
  const red = await page.evaluate(() => {
    const c = document.getElementById('world'); const r = c.width / 24;
    const d = c.getContext('2d').getImageData(Math.round(16 * r), Math.round(3 * r), Math.round(r), Math.round(r)).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) return true;
    return false;
  });
  assert.ok(red, 'the jammed gears show no red');
  await page.screenshot({ path: `${prefix}-jam.png` });

  // 4. Reload: the crank is still turning (its state is saved in its name).
  await page.waitForTimeout(1300);
  await page.reload(); await page.waitForTimeout(800);
  const c1 = await cellPixels(3, 3); await page.waitForTimeout(260); const c2 = await cellPixels(3, 3);
  assert.notEqual(c1, c2, 'the gear stopped after reload');

  assert.deepEqual(errors, []);
  console.log('gears: all checks passed');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Full sign-off.** With the server on 8123 (`python3 -m http.server 8123` in the repo):

```bash
node $SCRATCH/check-gears.cjs 8123 $SCRATCH/final4
node $SCRATCH/check-water.cjs 8123 $SCRATCH/final4w
node $SCRATCH/check-electric.cjs 8123 $SCRATCH/final4e
node $SCRATCH/check-build.cjs ipad $SCRATCH/final4b.png
node $SCRATCH/badge-check.cjs
node $SCRATCH/fixes-check.cjs
node $SCRATCH/audio-early-check.cjs
node $SCRATCH/music-smoke.cjs
```

Expected: everything passes, with the badge check showing 4 × `clear`.

Read `$SCRATCH/final4-jam.png` and check:
- the gear train
- a lit lamp next to the cranked generator
- the red jam
- the GEARS tab with 7 blocks

- [ ] **Step 3: Push, verify live, comment on #5**

```bash
git push origin main
gh run watch $(gh run list -R Team-Hamsa/calebhamsa.fun -L 1 --json databaseId --jq '.[0].databaseId') -R Team-Hamsa/calebhamsa.fun --exit-status
curl -s https://calebhamsa.fun/sw.js | grep "CACHE_NAME ="   # caleb-v5
gh issue comment 5 --repo Team-Hamsa/calebhamsa.fun --body "Phase 4a (⚙️ spin) is live: small/big gears, axle, crank, water wheel, motor, generator, with jams for big-gear triangles and opposing cranks, and a hydro dam (water → wheel → gears → generator → lamp). Phase 4b (pulleys, rope, weights, and load/effort) is next."
```

- [ ] **Step 4: Hand-check on the iPad.** Ask the user to check:
- gears visibly turn
- a cranked generator lights a lamp
- the jam triangle
- a hydro dam
