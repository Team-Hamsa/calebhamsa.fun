# Block Playground Phase 3 (💧 Fluids) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 💧 WATER palette tab to the Build page with real, conserved amounts of water and steam:
- water falls and spreads
- it squishes under depth, so U-tubes level out and water towers push water up pipes
- a steam power plant (burner → steam → turbine → ⚡ lamp) runs
- a battery-powered pump moves water uphill

**Architecture:**
- **`js/fluids.js` (pure):** squishy-water cellular rules, run in 4 small steps per tick. Steam follows the same rules upside down. Pipes, valves and pumps are cells with open sides. It also runs the special blocks (faucet, drain, burner, chiller, pump).
- **`js/blocks/water.js`:** the pack. It holds the blocks, `waterSystem` (moves fluids, smooths the turbine flow), `refresh`, the water `drawLayer`, and block drawings.
- **Engine additions:**
  - the world gets a saved `fluid` layer plus `swapBlock` / `moveBlock` / `getFluid` / `setFluid` / `clearFluid`
  - the save format goes to version 2
  - circuits get `part.pushNow` (turbines)
  - the registry gets `drawLayers`
  - `build.js` gains pouring, DIG scooping, saving on fluid change with a 5-second limit, and the drawing layers

**Tech Stack:** Vanilla ES modules, Canvas 2D, Node 20 `node --test`, Playwright (from `~/LFG`, Chromium iPad emulation).

**Spec:** `docs/superpowers/specs/2026-10-02-fluids-pack-design.md` (and the phase 1 and 2 specs it builds on)

**Prototype:** every code block and diff below ran green in a throwaway copy of the repo while the plan was being written:
- 276/276 tests
- the new `check-water.cjs` browser check (U-tube level, the power plant lights a lamp, water kept after reload)
- every phase 1–2 browser check

Diffs are against commit `e7c81ce`. **Apply them exactly** (`git apply` works: save the diff block to a file first).

## Global Constraints

- **No dependencies:** vanilla HTML/CSS/JS, ES modules, no build step.
- **Comments:** every file starts with a header comment. Every named function has a JSDoc docstring (`tests/docs.test.js`). Tweakable values get 🧪 "Try this!" comments.
- **Importable in Node:** modules touch the DOM only inside `init…()` and its callees (`tests/modules.test.js`).
- **Offline:** every `js/` file is in `sw.js` `PRECACHE` (`tests/sw.test.js`). `CACHE_NAME` goes `caleb-v3` → `caleb-v4` once (Task 6).
- **Fluid numbers:**
  - `FULL` 1, `SQUISH` 0.1, `FLUID_STEPS` 4, `MIN_AMOUNT` 0.001
  - `FAUCET_RATE`, `BOIL_RATE`, `CONDENSE_RATE`: 0.05 each
  - `PUMP_RATE` 0.1, `PUMP_ON_LEVEL` 0.25
  - `TURBINE_GAIN` 20, max turbine push 2, turbine smoothing 8 ticks
  - `MOVE_EPSILON` 0.001
- **Save timing:** `SAVE_MAX_WAIT_MS = 5000`.
- **Git:**
  - Repo `Team-Hamsa/calebhamsa.fun`.
  - Commit to `main` locally per task; push once at the end (Task 7).
  - **No `Co-Authored-By` trailers or AI attribution in commit messages** (user's global rule).

## Spec refinements made while prototyping (the spec is updated to match)

1. **Faster water.** `SQUISH` is 0.1 (not 0.02), there's no halving of big flows, and the water takes **4 small steps per tick**.
   - Measured: with the spec's settings a U-tube took about 800 ticks (100 s) to level, far too slow for Caleb. Now it takes about 38 ticks (5 s), and settling still dies out completely.
   - The pump's front-cell limit is `FULL + SQUISH`.
2. **Exact conservation.** Tiny amounts are never deleted. `MIN_AMOUNT` is only used for "is it wet?" (drawing, and whether anything moved).
3. **Steam in water.**
   - The spec said: steam in a wet cell may only move up.
   - Now: steam may always **rise** into water, and spreads sideways only into cells that are at most half water.
   - Why: the spec's rule trapped steam under ceilings.
4. **Valves and turbines face by fluid *blocks* only,** not by wet air. They have a favorite when nothing's around (`prefer`: valve sideways, turbine up-down), so they don't flip as water moves.
5. **A pump is a one-way door for normal flow.** Otherwise pumped water just falls back through it.
6. **The water layer is drawn by `registry.drawLayers`,** which `build.js` calls after `drawWorld`. `block-art.js` stays pack-agnostic.
7. **New world helper:** `world.clearFluid`. `fluids.pour` lives in `fluids.js`.
8. **`circuitKey(world, blockInfo)` now takes `blockInfo`** (it needs to read turbines' `pushNow`).
9. **The water pack keeps drawing records** in `world.signals.water.cells` (sides, flow, level) for fluid blocks. `signalsAt` finds them, because the water pack refreshes before electric.
10. **The steam edge wobble is dropped** (it's decoration).

## Review Focus

1. **Running water forever** (a faucet with no drain): the page must still save (5-second limit), never freeze, and never grow numbers to infinity. → Task 6 `saveDelay` tests; the Task 3 faucet test; the Task 7 browser run.
2. **Building, digging or flipping in and around water:** no water appears from nowhere, flips keep their water, and sand sinking through water loses none. → Task 1 tests (`setBlock` / `swapBlock` / `moveBlock`); Task 5 sand test.
3. **Old and broken saves:** version 1 loads dry, a broken water list loads dry with its blocks intact, and the bottom-left alignment includes fluids. → Task 2 tests.
4. **The cross-pack loop** (turbine push → circuit → pump level → water): no runaway re-solving every tick (pushes are rounded to 0.1 in the key) and no crash when one pack is missing its signals. → Tasks 4–5 tests.
5. **Performance on the iPad:** `stepFluids` is 4 steps × 336 cells × 2 fluids per tick, plus `allOpenSides` in every `draw()`. It should stay well under a frame. → Task 7: a timing note in the browser check (`console.time` is optional); the reviewer should check that nothing allocates per cell per step beyond the `Float64Array` copies.

---

### Task 1: The world's fluid layer (js/world.js) + sand sinks through water

**Files:**
- Modify: `js/world.js` (`FLUIDS`, `createWorld`, `setBlock`, new `swapBlock`, `moveBlock`, `getFluid`, `setFluid`, `clearFluid`)
- Modify: `js/blocks/basic.js` (`fallingBlocks` uses `moveBlock`)
- Modify: `tests/world.test.js` (imports + 5 tests)

**Interfaces:**
- Produces:
  - `FLUIDS = ['water', 'steam']`
  - `world.fluid = { water: Float64Array, steam: Float64Array }` (saved, from Task 2)
  - `setBlock(...)` also clears the cell's fluid when the name changes
  - `swapBlock(world, x, y, name) → boolean` (keeps the fluid)
  - `moveBlock(world, fromX, fromY, toX, toY) → boolean` (into air only; the fluid trades places)
  - `getFluid(world, kind, x, y) → number`
  - `setFluid(world, kind, x, y, amount)`
  - `clearFluid(world, x, y) → boolean`

- [ ] **Step 1: Write the failing tests.** Apply:

```diff
--- a/tests/world.test.js
+++ b/tests/world.test.js
@@ -5,8 +5,8 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
 import {
-  AIR, EDGE, WORLD_HEIGHT, WORLD_WIDTH, createWorld, defaultWorld, getBlock,
-  inBounds, neighbors, setBlock, tick,
+  AIR, EDGE, WORLD_HEIGHT, WORLD_WIDTH, clearFluid, createWorld, defaultWorld, getBlock,
+  getFluid, inBounds, moveBlock, neighbors, setBlock, setFluid, swapBlock, tick,
 } from '../js/world.js';
 
 test('a new world is all air', () => {
@@ -102,3 +102,44 @@
   tick(world, [], () => undefined);
   assert.equal(world.ticks, 2);
 });
+
+test('a new world is dry: no water or steam anywhere', () => {
+  const world = createWorld(2, 2);
+  assert.deepEqual([...world.fluid.water], [0, 0, 0, 0]);
+  assert.deepEqual([...world.fluid.steam], [0, 0, 0, 0]);
+});
+
+test('building into a wet cell washes the water away; swapBlock keeps it', () => {
+  const world = createWorld(2, 1);
+  setFluid(world, 'water', 0, 0, 1);
+  swapBlock(world, 0, 0, 'valveOpen');
+  assert.equal(getFluid(world, 'water', 0, 0), 1);
+  setBlock(world, 0, 0, 'stone');
+  assert.equal(getFluid(world, 'water', 0, 0), 0);
+});
+
+test('moveBlock: sand sinking into water trades places with it', () => {
+  const world = createWorld(1, 2);
+  setBlock(world, 0, 0, 'sand');
+  setFluid(world, 'water', 0, 1, 0.7);
+  assert.equal(moveBlock(world, 0, 0, 0, 1), true);
+  assert.equal(getBlock(world, 0, 1), 'sand');
+  assert.equal(getFluid(world, 'water', 0, 0), 0.7);
+  assert.equal(getFluid(world, 'water', 0, 1), 0);
+  setBlock(world, 0, 0, 'stone');
+  assert.equal(moveBlock(world, 0, 1, 0, 0), false); // blocks only move into air
+});
+
+test('clearFluid empties a cell and says whether there was anything', () => {
+  const world = createWorld(1, 1);
+  assert.equal(clearFluid(world, 0, 0), false);
+  setFluid(world, 'steam', 0, 0, 0.3);
+  assert.equal(clearFluid(world, 0, 0), true);
+  assert.equal(getFluid(world, 'steam', 0, 0), 0);
+});
+
+test('fluid outside the world is 0, and setting it there does nothing', () => {
+  const world = createWorld(1, 1);
+  assert.equal(getFluid(world, 'water', 5, 5), 0);
+  assert.doesNotThrow(() => setFluid(world, 'water', -1, 0, 1));
+});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/world.test.js`
Expected: FAIL — `does not provide an export named 'clearFluid'`

- [ ] **Step 3: Implement.** Apply to `js/world.js`:

```diff
--- a/js/world.js
+++ b/js/world.js
@@ -16,6 +16,9 @@
 /** The name of an empty cell. */
 export const AIR = 'air';
 
+/** The two kinds of fluid a cell can hold (amounts, not blocks: see world.fluid). */
+export const FLUIDS = ['water', 'steam'];
+
 /** What the outside of the world counts as: solid, so sand lands on the floor. */
 export const EDGE = 'stone';
 
@@ -41,9 +44,13 @@
  *   events     things for the page to do, like { type: 'note', midi: 64, x, y }
  *   animating  set by systems when the picture moves even though no block did
  *
+ * And one more thing that IS saved:
+ *   fluid      how much water and steam each cell holds: 0 = empty,
+ *              1 = full, a little over 1 = squished by the weight above
+ *
  * @param {number} width - how many blocks across
  * @param {number} height - how many blocks down
- * @returns {{width: number, height: number, cells: string[], ticks: number, signals: object, events: object[], animating: boolean}} the world
+ * @returns {object} the world
  */
 export function createWorld(width, height) {
   return {
@@ -54,6 +61,7 @@
     signals: {},
     events: [],
     animating: false,
+    fluid: { water: new Float64Array(width * height), steam: new Float64Array(width * height) },
   };
 }
 
@@ -101,6 +109,8 @@
 
 /**
  * Put a block at this spot. Outside the world, nothing happens.
+ * Any water or steam in the cell is washed away (like building into
+ * water in the game). To flip a block without spilling, use swapBlock.
  * @param {{width: number, height: number, cells: string[]}} world - the world
  * @param {number} x - column, 0 = left
  * @param {number} y - row, 0 = top
@@ -108,6 +118,21 @@
  * @returns {boolean} true if the cell really changed
  */
 export function setBlock(world, x, y, name) {
+  if (!swapBlock(world, x, y, name)) return false;
+  clearFluid(world, x, y);
+  return true;
+}
+
+/**
+ * Change a block but keep the water or steam inside it. ✋ uses this to
+ * flip valves, burners and pumps, which shouldn't spill their water.
+ * @param {{width: number, height: number, cells: string[]}} world - the world
+ * @param {number} x - column, 0 = left
+ * @param {number} y - row, 0 = top
+ * @param {string} name - the new block
+ * @returns {boolean} true if the cell really changed
+ */
+export function swapBlock(world, x, y, name) {
   if (!inBounds(world, x, y)) return false;
   const index = y * world.width + x;
   if (world.cells[index] === name) return false;
@@ -116,6 +141,74 @@
 }
 
 /**
+ * Move a block into an empty (air) cell, and move that cell's water and
+ * steam back into the cell the block left. That's how sand sinks
+ * through water: the sand and the water trade places, so no water is lost.
+ * @param {object} world - the world
+ * @param {number} fromX - where the block is
+ * @param {number} fromY - where the block is
+ * @param {number} toX - the air cell it moves into
+ * @param {number} toY - the air cell it moves into
+ * @returns {boolean} true if it moved
+ */
+export function moveBlock(world, fromX, fromY, toX, toY) {
+  if (!inBounds(world, fromX, fromY) || !inBounds(world, toX, toY)) return false;
+  const from = fromY * world.width + fromX;
+  const to = toY * world.width + toX;
+  if (world.cells[to] !== AIR || world.cells[from] === AIR) return false;
+  world.cells[to] = world.cells[from];
+  world.cells[from] = AIR;
+  for (const kind of FLUIDS) {
+    world.fluid[kind][from] = world.fluid[kind][to];
+    world.fluid[kind][to] = 0;
+  }
+  return true;
+}
+
+/**
+ * How much water (or steam) is in a cell. Outside the world there's none.
+ * @param {object} world - the world
+ * @param {'water'|'steam'} kind - which fluid
+ * @param {number} x - column
+ * @param {number} y - row
+ * @returns {number} the amount (1 = a full cell)
+ */
+export function getFluid(world, kind, x, y) {
+  return inBounds(world, x, y) ? world.fluid[kind][y * world.width + x] : 0;
+}
+
+/**
+ * Set how much water (or steam) is in a cell. Outside the world, nothing happens.
+ * @param {object} world - the world
+ * @param {'water'|'steam'} kind - which fluid
+ * @param {number} x - column
+ * @param {number} y - row
+ * @param {number} amount - the new amount (never below 0)
+ * @returns {void}
+ */
+export function setFluid(world, kind, x, y, amount) {
+  if (inBounds(world, x, y)) world.fluid[kind][y * world.width + x] = Math.max(0, amount);
+}
+
+/**
+ * Empty a cell of water and steam.
+ * @param {object} world - the world
+ * @param {number} x - column
+ * @param {number} y - row
+ * @returns {boolean} true if there was any fluid to empty
+ */
+export function clearFluid(world, x, y) {
+  if (!inBounds(world, x, y)) return false;
+  const index = y * world.width + x;
+  let had = false;
+  for (const kind of FLUIDS) {
+    if (world.fluid[kind][index] > 0) had = true;
+    world.fluid[kind][index] = 0;
+  }
+  return had;
+}
+
+/**
  * The cells touching this one (up, right, down, left), skipping any
  * that are outside the world.
  * @param {{width: number, height: number}} world - the world
```

and to `js/blocks/basic.js`:

```diff
--- a/js/blocks/basic.js
+++ b/js/blocks/basic.js
@@ -6,7 +6,7 @@
  * ("systems") that make them do things. Later packs (⚡ wires, 💧 water,
  * ⚙️ gears) are new files shaped just like this one.
  */
-import { AIR, getBlock, setBlock } from '../world.js';
+import { AIR, getBlock, moveBlock } from '../world.js';
 import { drawDots } from './electric.js';
 
 /**
@@ -44,9 +44,9 @@
     for (let x = 0; x < world.width; x++) {
       const name = getBlock(world, x, y);
       if (blockInfo(name)?.falls && getBlock(world, x, y + 1) === AIR) {
-        setBlock(world, x, y + 1, name);
-        setBlock(world, x, y, AIR);
-        changed = true;
+        // moveBlock also lifts any water below up into the gap, so sand
+        // sinks through water instead of deleting it.
+        changed = moveBlock(world, x, y, x, y + 1) || changed;
       }
     }
   }
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. The existing saves deepEqual round trips still pass, because both sides are dry `Float64Array`s.

- [ ] **Step 5: Commit**

```bash
git add js/world.js js/blocks/basic.js tests/world.test.js
git commit -m "World: a saved water/steam layer; sand sinks through water"
```

---

### Task 2: Save format version 2 (js/saves.js)

**Files:**
- Modify: `js/saves.js`
- Modify: `tests/saves.test.js` (4 tests)

**Interfaces:**
- Consumes: `FLUIDS`, `setFluid` (Task 1)
- Produces:
  - `SAVE_VERSION = 2`
  - saves gain `water` / `steam` lists rounded to 3 decimals
  - versions 1 and 2 are both readable
  - a bad fluid list makes that fluid dry

- [ ] **Step 1: Write the failing tests.** Apply:

```diff
--- a/tests/saves.test.js
+++ b/tests/saves.test.js
@@ -161,3 +161,33 @@
   const full = { ...fakeStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
   assert.equal(saveWorld(1, defaultWorld(4, 3), 'thumb', full), false);
 });
+
+test('water and steam are saved and come back (rounded to 3 decimals)', () => {
+  const world = createWorld(4, 3);
+  world.fluid.water[5] = 0.12345;
+  world.fluid.steam[2] = 1;
+  const back = deserializeWorld(serializeWorld(world), SMALL);
+  assert.equal(back.fluid.water[5], 0.123);
+  assert.equal(back.fluid.steam[2], 1);
+});
+
+test('version 1 saves (from before water) still load, dry', () => {
+  const text = JSON.stringify({ version: 1, width: 4, height: 3, blocks: ['air', 'gold'], cells: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
+  const world = deserializeWorld(text, SMALL);
+  assert.equal(getBlock(world, 0, 0), 'gold');
+  assert.ok(world.fluid.water.every((amount) => amount === 0));
+});
+
+test('a broken water list loads dry, but the blocks still load', () => {
+  for (const water of ['lots', [1, 2], new Array(12).fill(-1), [...new Array(11).fill(0), 'x']]) {
+    const world = deserializeWorld(saveText({ width: 4, height: 3, blocks: ['air', 'gold'], cells: [1, ...new Array(11).fill(0)], water }), SMALL);
+    assert.equal(getBlock(world, 0, 0), 'gold', JSON.stringify(water));
+    assert.ok(world.fluid.water.every((amount) => amount === 0), JSON.stringify(water));
+  }
+});
+
+test('water in a smaller old save lines up at the bottom-left too', () => {
+  const water = [0, 0, 0.5, 0]; // 2 × 2: water in the bottom-left cell
+  const world = deserializeWorld(saveText({ width: 2, height: 2, blocks: ['air'], cells: [0, 0, 0, 0], water }), SMALL);
+  assert.equal(world.fluid.water[2 * 4 + 0], 0.5);
+});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/saves.test.js`
Expected: FAIL — the "saved and come back" test gets `0` instead of `0.123`, and the version 1 test gets `null`.

- [ ] **Step 3: Implement.** Apply:

```diff
--- a/js/saves.js
+++ b/js/saves.js
@@ -4,21 +4,31 @@
  *
  * A saved world is a bit of JSON text, like:
  *
- *   { "version": 1, "width": 24, "height": 14,
+ *   { "version": 2, "width": 24, "height": 14,
  *     "blocks": ["air", "grass", "sand"],
- *     "cells":  [0, 0, 0, ..., 1, 1, 1] }
+ *     "cells":  [0, 0, 0, ..., 1, 1, 1],
+ *     "water":  [0, 0, 0.5, ...],
+ *     "steam":  [0, 0, 0, ...] }
  *
  * Each cell stores a small number (0 = the first name in "blocks"),
- * which is much shorter than writing "grass" 24 times.
+ * which is much shorter than writing "grass" 24 times. "water" and
+ * "steam" say how much of each fluid every cell holds (version 1 saves,
+ * from before water existed, don't have them: they load dry).
  *
  * Every function here takes the storage as an argument, so the tests
  * can hand in a pretend one. Storage can fail (private browsing, a full
  * iPad), so every function here catches that and never crashes the page.
  */
-import { AIR, createWorld, setBlock } from './world.js';
+import { AIR, FLUIDS, createWorld, setBlock, setFluid } from './world.js';
 
-/** Bump this if the save format ever changes, so old pages ignore new saves. */
-export const SAVE_VERSION = 1;
+/**
+ * Bump this if the save format ever changes, so old pages ignore new saves.
+ * Version 2 added water and steam. This page still reads version 1.
+ */
+export const SAVE_VERSION = 2;
+
+/** The save versions this page knows how to read. */
+const READABLE_VERSIONS = [1, 2];
 
 /** How many worlds Caleb can switch between. */
 export const WORLD_COUNT = 3;
@@ -59,7 +69,21 @@
     }
     return numberOf.get(name);
   });
-  return JSON.stringify({ version: SAVE_VERSION, width: world.width, height: world.height, blocks, cells });
+  /**
+   * Round an amount to 3 decimals, so saves stay short.
+   * @param {number} amount - a fluid amount
+   * @returns {number} the rounded amount
+   */
+  const round = (amount) => Math.round(amount * 1000) / 1000;
+  return JSON.stringify({
+    version: SAVE_VERSION,
+    width: world.width,
+    height: world.height,
+    blocks,
+    cells,
+    water: Array.from(world.fluid.water, round),
+    steam: Array.from(world.fluid.steam, round),
+  });
 }
 
 /**
@@ -69,7 +93,7 @@
  */
 function isReadableSave(data) {
   return data !== null && typeof data === 'object'
-    && data.version === SAVE_VERSION
+    && READABLE_VERSIONS.includes(data.version)
     && Number.isInteger(data.width) && data.width > 0
     && Number.isInteger(data.height) && data.height > 0
     && Array.isArray(data.blocks)
@@ -105,10 +129,29 @@
       setBlock(world, x, y + shiftDown, isKnown(name) ? name : AIR);
     }
   }
+  for (const kind of FLUIDS) {
+    const amounts = data[kind];
+    if (!isAmountList(amounts, data.width * data.height)) continue; // missing or broken: this fluid is dry
+    for (let y = 0; y < data.height; y++) {
+      for (let x = 0; x < data.width; x++) setFluid(world, kind, x, y + shiftDown, amounts[y * data.width + x]);
+    }
+  }
   return world;
 }
 
 /**
+ * Is this a proper list of fluid amounts: the right length, and every
+ * amount a real number that isn't negative?
+ * @param {*} amounts - whatever the save had for one fluid
+ * @param {number} length - how many cells the save has
+ * @returns {boolean} true if it can be used
+ */
+function isAmountList(amounts, length) {
+  return Array.isArray(amounts) && amounts.length === length
+    && amounts.every((amount) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0);
+}
+
+/**
  * Load world n from storage.
  * @param {number} n - which world, 1 to WORLD_COUNT
  * @param {Storage|null} storage - localStorage (or a pretend one)
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. The existing "newer version loads as nothing" test now uses version 3, and still passes.

- [ ] **Step 5: Commit**

```bash
git add js/saves.js tests/saves.test.js
git commit -m "Saves v2: water and steam are saved; v1 saves still load"
```

---

### Task 3: The fluid rules (js/fluids.js)

**Files:**
- Create: `js/fluids.js`
- Create: `tests/fluids.test.js`
- Modify: `tests/modules.test.js` (add `'fluids.js'` to the end of `MODULES`)
- Modify: `sw.js` (`PRECACHE`: `'./js/fluids.js',` after `'./js/circuit.js',`)

**Interfaces:**
- Consumes:
  - `AIR`, `getBlock`, `inBounds` (`world.js`)
  - `OPPOSITE`, `SIDES` (`circuit.js`)
- Produces:
  - Constants: `FULL`, `SQUISH`, `FLUID_STEPS`, `MIN_AMOUNT`, `FAUCET_RATE`, `BOIL_RATE`, `CONDENSE_RATE`, `PUMP_RATE`, `PUMP_ON_LEVEL`
  - `stableBelow(total)`
  - `fluidAxis(world, x, y, blockInfo, prefer)`
  - `openSides(world, x, y, blockInfo)` and `drawingSides(...)`
  - `pour(world, kind, x, y, blockInfo) → boolean`
  - `allOpenSides`, `flowChecker`, `flowFluid`, `runSpecials`
  - `stepFluids(world, blockInfo) → { moved, steamOut: Map, sides }`
- Block fields read:
  - `fluid: { sides: 'auto-pipe' | 'axis' | 'all' | string[], prefer?, closed?, pump? }`
  - `faucet`, `drains`, `burns`, `chills`, `turbine`
- Also reads `world.signals.electric.cells.get(i).level` (pumps).

- [ ] **Step 1: Write the failing tests.** Create `tests/fluids.test.js`:

```js
/**
 * fluids.test.js — checks how water and steam move: falling, leveling
 * out, U-tubes, water towers, pipes and valves, steam rising, and the
 * special blocks. Each test draws a little world as a picture of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getFluid, setBlock, setFluid } from '../js/world.js';
import {
  BOIL_RATE, CONDENSE_RATE, FAUCET_RATE, PUMP_RATE, SQUISH, openSides, stableBelow, stepFluids,
} from '../js/fluids.js';

/**
 * Stand-in blocks with the same fluid settings as the real ones in
 * js/blocks/water.js (fluids.js only reads these fields).
 */
const TEST_BLOCKS = {
  stone: {},
  pipe: { fluid: { sides: 'auto-pipe' } },
  valveOpen: { fluid: { sides: 'axis', prefer: 'h' } },
  valveClosed: { fluid: { sides: 'axis', prefer: 'h', closed: true } },
  drain: { fluid: { sides: 'all' }, drains: true },
  faucet: { faucet: true },
  burnerOn: { burns: true },
  chiller: { chills: true },
  turbine: { fluid: { sides: 'axis', prefer: 'v' }, turbine: true },
  pumpUp: { fluid: { sides: ['up', 'down'], pump: 'up' } },
};

/**
 * Look up a stand-in block.
 * @param {string} name - a block name
 * @returns {object|undefined} its settings (undefined for air)
 */
const blockInfo = (name) => TEST_BLOCKS[name];

/** What each letter means. `~` is air full of water, `s` is air full of steam. */
const LETTERS = {
  '.': 'air', '~': 'air', s: 'air', '#': 'stone', P: 'pipe', V: 'valveOpen', X: 'valveClosed',
  D: 'drain', F: 'faucet', B: 'burnerOn', C: 'chiller', T: 'turbine', '^': 'pumpUp',
};

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function worldFrom(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => {
    setBlock(world, x, y, LETTERS[letter]);
    if (letter === '~') setFluid(world, 'water', x, y, 1);
    if (letter === 's') setFluid(world, 'steam', x, y, 1);
  }));
  return world;
}

/**
 * Run the fluids for a number of ticks.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the world
 */
function run(world, ticks) {
  for (let i = 0; i < ticks; i++) stepFluids(world, blockInfo);
  return world;
}

/**
 * Add up one fluid over the whole world.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @returns {number} the total
 */
const total = (world, kind) => world.fluid[kind].reduce((sum, amount) => sum + amount, 0);

/**
 * Add up one fluid down a column, between two rows (inclusive).
 * @param {object} world - the world
 * @param {number} x - the column
 * @param {number} top - the first row
 * @param {number} bottom - the last row
 * @returns {number} the total
 */
function column(world, x, top, bottom) {
  let sum = 0;
  for (let y = top; y <= bottom; y++) sum += getFluid(world, 'water', x, y);
  return sum;
}

test('the lower of two stacked cells holds a little extra when both are full (squish)', () => {
  assert.equal(stableBelow(0.5), 1);
  assert.equal(stableBelow(1), 1);
  assert.ok(stableBelow(2) > 1 && stableBelow(2) < 1 + SQUISH);
  assert.ok(stableBelow(4) > 2);
});

test('a drop of water falls and lands on the floor', () => {
  const world = run(worldFrom(['~', '.', '.', '#']), 60);
  assert.ok(getFluid(world, 'water', 0, 2) > 0.99);
  assert.ok(getFluid(world, 'water', 0, 0) < 0.01);
});

test('a pile of water spreads out and levels off', () => {
  const world = run(worldFrom(['#~~~~#', '#....#', '######']), 400);
  for (let x = 1; x <= 4; x++) assert.ok(Math.abs(getFluid(world, 'water', x, 1) - 1) < 0.03, `x=${x}`);
});

test('water in a U-tube ends at the same height on both sides, within 10 seconds', () => {
  const world = worldFrom([
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#~#.#',
    '#...#',
    '#####',
  ]);
  run(world, 80); // 80 ticks = 10 seconds
  const left = column(world, 1, 0, 3);
  const right = column(world, 3, 0, 3);
  assert.ok(Math.abs(left - right) < 0.05, `left ${left.toFixed(3)} right ${right.toFixed(3)}`);
});

test('a water tower pushes water up a pipe and out of a lower spout', () => {
  const world = worldFrom([
    '#.#......',
    '#~#......',
    '#~#......',
    '#~#..P...',
    '#~#..P...',
    '#~#..P...',
    '#~#..P...',
    '#~PPPP...',
    '#########',
  ]);
  run(world, 160); // 20 seconds
  let outside = 0;
  for (let y = 0; y <= 7; y++) for (let x = 3; x <= 8; x++) if (x !== 5) outside += getFluid(world, 'water', x, y);
  outside += column(world, 5, 0, 2);
  assert.ok(outside > 0.5, `only ${outside.toFixed(3)} came out`);
});

test('water in a pipe ends level with the water in the tower, and no higher', () => {
  // 7 waters: 5 fill the bottom row (tower + pipe), the other 2 share
  // the tower and the pipe's upright part, so both end about 1 high.
  const world = worldFrom([
    '#.#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~#..P.',
    '#~PPPP.',
    '#######',
  ]);
  run(world, 400); // 50 seconds: a tall tower takes a while
  const tower = column(world, 1, 0, 6);
  const pipe = column(world, 5, 0, 6);
  assert.ok(Math.abs(tower - pipe) < 0.1, `tower ${tower.toFixed(3)} pipe ${pipe.toFixed(3)}`);
  assert.ok(column(world, 5, 0, 4) < 0.05, 'water rose above the tower level');
  assert.ok(pipe > 0.7, 'water should have climbed the pipe');
});

test('water is never made or lost when nothing special happens', () => {
  const world = worldFrom([
    '~~~~~~~~',
    '~#..P..~',
    '~#..P..~',
    '..PPP...',
    '.#....#.',
    '########',
  ]);
  const before = total(world, 'water');
  run(world, 300);
  assert.ok(Math.abs(total(world, 'water') - before) < 1e-9);
  for (const amount of world.fluid.water) assert.ok(amount >= 0);
});

test('a closed valve stops water; an open one lets it through', () => {
  const closed = run(worldFrom(['#~X..#', '######']), 200);
  assert.ok(getFluid(closed, 'water', 3, 0) < 0.001);
  const open = run(worldFrom(['#~V..#', '######']), 400);
  assert.ok(getFluid(open, 'water', 4, 0) > 0.1);
});

test('pipes are sealed along their sides, and open at their ends', () => {
  const world = worldFrom(['PPP']);
  assert.deepEqual(openSides(world, 1, 0, blockInfo), ['right', 'left']); // middle: joined both ways
  assert.deepEqual(openSides(world, 0, 0, blockInfo).sort(), ['left', 'right']); // end: open past its end
  const flooded = worldFrom(['~~~~', '.PP.', '....', '####']);
  run(flooded, 50);
  assert.ok(getFluid(flooded, 'water', 1, 1) < 0.01, 'water leaked into the pipe through its top');
});

test('steam rises and spreads out under a ceiling', () => {
  const world = run(worldFrom(['####', '....', '....', 's...']), 400);
  let top = 0;
  for (let x = 0; x < 4; x++) top += getFluid(world, 'steam', x, 1);
  assert.ok(top > 0.95, `steam at the top: ${top.toFixed(3)}`);
});

test('steam bubbles up through water', () => {
  const world = worldFrom(['#.#', '#~#', '#~#', '#s#', '###']);
  run(world, 300);
  assert.ok(getFluid(world, 'steam', 1, 0) > 0.5);
});

test('a burner boils the water above it into steam', () => {
  const world = worldFrom(['###', '#~#', '#B#']);
  stepFluids(world, blockInfo);
  assert.ok(Math.abs(getFluid(world, 'steam', 1, 1) - BOIL_RATE) < 1e-9);
  assert.ok(Math.abs(getFluid(world, 'water', 1, 1) - (1 - BOIL_RATE)) < 1e-9);
});

test('a chiller turns the steam around it back into water', () => {
  const world = worldFrom(['###', 'sC#', '###']);
  stepFluids(world, blockInfo);
  assert.ok(Math.abs(getFluid(world, 'water', 0, 1) - CONDENSE_RATE) < 1e-9);
});

test('a faucet drips water into the cell below; a drain swallows water', () => {
  const tap = worldFrom(['F', '.', '#']);
  stepFluids(tap, blockInfo);
  assert.ok(Math.abs(total(tap, 'water') - FAUCET_RATE) < 1e-9);
  const sink = run(worldFrom(['~', 'D', '#']), 50);
  assert.ok(total(sink, 'water') < 0.001);
});

test('a powered pump pushes water uphill; an unpowered one does not', () => {
  const build = () => worldFrom(['#.#', '#^#', '#~#', '###']);
  const off = run(build(), 100);
  assert.ok(getFluid(off, 'water', 1, 0) < 0.001);
  const on = build();
  on.signals.electric = { cells: new Map([[1 * 3 + 1, { level: 1 }]]) };
  stepFluids(on, blockInfo);
  assert.ok(Math.abs(getFluid(on, 'water', 1, 0) - PUMP_RATE) < 1e-9);
});

test('steam leaving a turbine is counted (that is what makes it spin)', () => {
  const world = worldFrom(['#.#', '#T#', '#s#', '###']);
  let out = 0;
  for (let i = 0; i < 20; i++) out += stepFluids(world, blockInfo).steamOut.get(1 * 3 + 1) ?? 0;
  assert.ok(out > 0.5);
});
```

Add `'fluids.js'` to `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/fluids.test.js`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/fluids.js`

- [ ] **Step 3: Create js/fluids.js**

```js
/**
 * fluids.js — how water and steam move, one tick at a time.
 *
 * Every cell holds an AMOUNT of water (and of steam): 0 is empty, 1 is
 * full. Each tick, every wet cell shares its water with its neighbors:
 *
 *   1. DOWN first: water falls into room below.
 *   2. SIDEWAYS: water evens out with its left and right neighbors.
 *   3. UP: water under a lot of other water gets slightly "squished"
 *      (it holds a bit more than 1), and the extra pushes upward.
 *
 * Rule 3 is the clever part. It's why water in a U-shaped tube ends up
 * at the same height on both sides, and why a tall water tower can push
 * water up a pipe, but never higher than the tower itself.
 *
 * Steam follows the very same rules upside down: it rises, and spreads
 * out under ceilings.
 *
 * Fluid only moves between two cells if BOTH let it through on the
 * sides that touch: air lets it through everywhere, solid blocks never
 * do, and pipes only along their open sides (see openSides).
 */
import { AIR, getBlock, inBounds } from './world.js';
import { OPPOSITE, SIDES } from './circuit.js';

/** A full cell. */
export const FULL = 1;

/**
 * How much extra a cell may hold for each full cell of water above it.
 * Squishier water pushes harder, so it levels out faster.
 * 🧪 Try this! 0.02 for stiff water: it's slow to climb up U-tubes.
 */
export const SQUISH = 0.1;

/**
 * How many small steps the water takes each tick. More steps = faster
 * water (a U-tube levels out in about 5 seconds with 4).
 * 🧪 Try this! 1 for slow-motion water.
 */
export const FLUID_STEPS = 4;

/** Less than this counts as dry when drawing and when deciding if anything moved. */
export const MIN_AMOUNT = 0.001;

/** The most that can move through one side in one tick. */
const MAX_FLOW = 1;

/** Which way is [dx, dy] for each side. */
const STEP = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/**
 * For two cells stacked on top of each other holding `total` between
 * them, how much should the LOWER one hold? Usually "full, and the rest
 * on top", but when both are full the lower one holds a little extra:
 * it's squished by the weight above it.
 * @param {number} total - the amount in both cells together
 * @returns {number} how much the lower cell should hold
 */
export function stableBelow(total) {
  if (total <= FULL) return FULL;
  if (total < 2 * FULL + SQUISH) return (FULL * FULL + total * SQUISH) / (FULL + SQUISH);
  return (total + SQUISH) / 2;
}

/**
 * Is this block a fluid block (pipe, valve, pump...)? Pipes connect to these.
 * @param {object|undefined} info - the block's definition
 * @returns {boolean} true if it has a `fluid` setting
 */
function isFluidBlock(info) {
  return Boolean(info?.fluid);
}

/**
 * Which way a valve or turbine faces, from the fluid blocks around it:
 * pipes on both sides wins, then pipes above and below, then pipes on
 * one side, then one above or below, then its favorite (`prefer`).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @param {'h'|'v'} prefer - the way to face with nothing around
 * @returns {'h'|'v'} sideways or up-down
 */
export function fluidAxis(world, x, y, blockInfo, prefer) {
  /**
   * Is the cell dx, dy away a fluid block?
   * @param {number} dx - columns across
   * @param {number} dy - rows down
   * @returns {boolean} true if it is
   */
  const at = (dx, dy) => isFluidBlock(blockInfo(getBlock(world, x + dx, y + dy)));
  const left = at(-1, 0);
  const right = at(1, 0);
  const up = at(0, -1);
  const down = at(0, 1);
  if (left && right) return 'h';
  if (up && down) return 'v';
  if (left || right) return 'h';
  if (up || down) return 'v';
  return prefer;
}

/**
 * The sides a non-pipe fluid block lets fluid through (a closed valve
 * still "connects" to pipes, but lets nothing through: see openSides).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {object} fluid - the block's `fluid` setting
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the sides
 */
function connectSides(world, x, y, fluid, blockInfo) {
  if (fluid.sides === 'all') return SIDES;
  if (fluid.sides === 'axis') {
    return fluidAxis(world, x, y, blockInfo, fluid.prefer ?? 'h') === 'v' ? ['up', 'down'] : ['left', 'right'];
  }
  if (Array.isArray(fluid.sides)) return fluid.sides;
  return [];
}

/**
 * The sides of a pipe that are open. A pipe joins every neighboring
 * fluid block that joins back. A pipe END (only one join) is also open
 * on its far side, so water pours out of it. A lone pipe is open on its
 * left and right.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the open sides
 */
function pipeSides(world, x, y, blockInfo) {
  const joined = SIDES.filter((side) => {
    const [dx, dy] = STEP[side];
    const info = blockInfo(getBlock(world, x + dx, y + dy));
    if (!isFluidBlock(info)) return false;
    if (info.fluid.sides === 'auto-pipe') return true; // pipes always join pipes
    return connectSides(world, x + dx, y + dy, info.fluid, blockInfo).includes(OPPOSITE[side]);
  });
  if (joined.length === 0) return ['left', 'right'];
  if (joined.length === 1) return [joined[0], OPPOSITE[joined[0]]];
  return joined;
}

/**
 * The sides fluid can pass through in this cell. Air: every side.
 * Solid blocks, closed valves and outside the world: none.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the open sides
 */
export function openSides(world, x, y, blockInfo) {
  if (!inBounds(world, x, y)) return [];
  const name = getBlock(world, x, y);
  if (name === AIR) return SIDES;
  const fluid = blockInfo(name)?.fluid;
  if (!fluid || fluid.closed) return [];
  if (fluid.sides === 'auto-pipe') return pipeSides(world, x, y, blockInfo);
  return connectSides(world, x, y, fluid, blockInfo);
}

/**
 * The sides to DRAW a fluid block with: its open sides, except that a
 * closed valve is still drawn joined to its pipes (just blocked).
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[]} the sides
 */
export function drawingSides(world, x, y, blockInfo) {
  const fluid = blockInfo(getBlock(world, x, y))?.fluid;
  if (fluid?.closed) return connectSides(world, x, y, fluid, blockInfo);
  return openSides(world, x, y, blockInfo);
}

/**
 * Pour a full cell of water (or steam) into a cell, if it can hold
 * fluid and isn't full already. This is what BUILD does with the 💧
 * and ☁️ palette items.
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {number} x - column
 * @param {number} y - row
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} true if any fluid was added
 */
export function pour(world, kind, x, y, blockInfo) {
  if (openSides(world, x, y, blockInfo).length === 0) return false;
  const index = y * world.width + x;
  if (world.fluid[kind][index] >= FULL) return false;
  world.fluid[kind][index] = FULL;
  return true;
}

/**
 * The open sides of every cell, worked out once per tick.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {string[][]} open sides, by cell index
 */
export function allOpenSides(world, blockInfo) {
  const sides = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) sides.push(openSides(world, x, y, blockInfo));
  }
  return sides;
}

/**
 * Make a "can fluid go from cell i out through this side?" checker.
 * Both cells must be open on the touching sides. A pump is a one-way
 * door: fluid may only leave it from its front, and only enter it from
 * its back.
 * @param {object} world - the world
 * @param {string[][]} sides - open sides by cell index (from allOpenSides)
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {Function} (index, side) => the neighbor's index, or -1 if blocked
 */
export function flowChecker(world, sides, blockInfo) {
  return (index, side) => {
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const [dx, dy] = STEP[side];
    if (!inBounds(world, x + dx, y + dy)) return -1;
    const next = index + dx + dy * world.width;
    if (!sides[index].includes(side) || !sides[next].includes(OPPOSITE[side])) return -1;
    const from = blockInfo(world.cells[index])?.fluid?.pump;
    if (from && side !== from) return -1;
    const into = blockInfo(world.cells[next])?.fluid?.pump;
    if (into && side !== into) return -1;
    return next;
  };
}

/**
 * Keep a number between two limits.
 * @param {number} value - the number
 * @param {number} low - the smallest allowed
 * @param {number} high - the biggest allowed
 * @returns {number} the number, squeezed between low and high
 */
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * Move one kind of fluid for one small step, using the three rules (down,
 * sideways, up). For steam, "down" means up: it falls toward the sky.
 *
 * Every cell's flow is worked out from the amounts at the START of the
 * step and added up in a fresh copy, so it doesn't matter which cell
 * goes first.
 *
 * @param {object} world - the world
 * @param {'water'|'steam'} kind - which fluid
 * @param {Function} canFlow - from flowChecker
 * @param {Function} onMove - told (fromIndex, toIndex, amount) for every move
 * @returns {number} the total amount that moved
 */
export function flowFluid(world, kind, canFlow, onMove) {
  const before = world.fluid[kind];
  const after = Float64Array.from(before);
  const water = world.fluid.water;
  const fall = kind === 'water' ? 'down' : 'up';
  const rise = OPPOSITE[fall];
  let moved = 0;

  /**
   * Move some fluid from one cell to another.
   * @param {number} from - the cell it leaves
   * @param {number} to - the cell it goes to
   * @param {number} amount - how much
   * @returns {void}
   */
  const move = (from, to, amount) => {
    if (amount <= 0) return;
    after[from] -= amount;
    after[to] += amount;
    moved += amount;
    onMove(from, to, amount);
  };

  /**
   * Can steam spread sideways (or sink) into this cell? Not into cells
   * that are mostly water. (Steam may always RISE into water: bubbles!
   * And water may always go into steamy cells.)
   * @param {number} to - the cell index
   * @returns {boolean} true if it may
   */
  const roomFor = (to) => kind !== 'steam' || water[to] <= 0.5;

  for (let index = 0; index < before.length; index++) {
    let remaining = before[index];
    if (remaining <= 0) continue;

    const below = canFlow(index, fall); // for steam, this is the cell ABOVE
    if (below >= 0) {
      const flow = clamp(stableBelow(remaining + before[below]) - before[below], 0, Math.min(MAX_FLOW, remaining));
      move(index, below, flow);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    for (const side of ['left', 'right']) {
      const beside = canFlow(index, side);
      if (beside < 0 || !roomFor(beside)) continue;
      const flow = clamp((remaining - before[beside]) / 4, 0, remaining);
      move(index, beside, flow);
      remaining -= flow;
    }
    if (remaining <= 0) continue;

    const above = canFlow(index, rise);
    if (above >= 0 && roomFor(above)) {
      const flow = clamp(remaining - stableBelow(remaining + before[above]), 0, Math.min(MAX_FLOW, remaining));
      move(index, above, flow);
    }
  }

  for (let index = 0; index < after.length; index++) if (after[index] < 0) after[index] = 0;
  world.fluid[kind] = after;
  return moved;
}

// =============================================================
// The special blocks
// =============================================================

/**
 * How much water a faucet adds each tick.
 * 🧪 Try this! 0.2 for a gushing faucet.
 */
export const FAUCET_RATE = 0.05;

/**
 * How much water a burner turns into steam each tick.
 * 🧪 Try this! 0.01 for a gentle simmer.
 */
export const BOIL_RATE = 0.05;

/** How much steam a chiller turns back into water each tick (in each touching cell). */
export const CONDENSE_RATE = 0.05;

/**
 * How much water a fully powered pump moves each tick.
 * 🧪 Try this! 0.5 for a super pump.
 */
export const PUMP_RATE = 0.1;

/** A pump needs at least this much circuit level to work. */
export const PUMP_ON_LEVEL = 0.25;

/** A pump won't squeeze the cell in front of it fuller than this. */
const PUMP_FRONT_CAP = FULL + SQUISH;

/**
 * Let the special blocks do their jobs: faucets add water, drains take
 * it away, burners boil water into steam, chillers turn steam back
 * into water, and powered pumps push water from behind them to in front.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {string[][]} sides - open sides by cell index
 * @returns {number} the total amount that changed
 */
export function runSpecials(world, blockInfo, sides) {
  const { water, steam } = world.fluid;
  let changed = 0;
  /**
   * The index of the neighbor on one side, or -1 outside the world.
   * @param {number} index - a cell index
   * @param {string} side - which side
   * @returns {number} the neighbor's index, or -1
   */
  const beside = (index, side) => {
    const x = index % world.width + STEP[side][0];
    const y = Math.floor(index / world.width) + STEP[side][1];
    return inBounds(world, x, y) ? y * world.width + x : -1;
  };
  for (let index = 0; index < world.cells.length; index++) {
    const info = blockInfo(world.cells[index]);
    if (!info) continue;
    if (info.faucet) {
      const below = beside(index, 'down');
      if (below >= 0 && sides[below].includes('up')) {
        const add = Math.min(FAUCET_RATE, Math.max(0, FULL - water[below]));
        water[below] += add;
        changed += add;
      }
    }
    if (info.drains && water[index] > 0) {
      changed += water[index];
      water[index] = 0;
    }
    if (info.burns) {
      const above = beside(index, 'up');
      if (above >= 0 && sides[above].length > 0) {
        const boil = Math.min(BOIL_RATE, water[above]);
        water[above] -= boil;
        steam[above] += boil;
        changed += boil;
      }
    }
    if (info.chills) {
      for (const side of SIDES) {
        const next = beside(index, side);
        if (next < 0 || sides[next].length === 0) continue;
        const cool = Math.min(CONDENSE_RATE, steam[next]);
        steam[next] -= cool;
        water[next] += cool;
        changed += cool;
      }
    }
    const front = info.fluid?.pump;
    if (front) {
      const level = world.signals.electric?.cells?.get(index)?.level ?? 0;
      if (level < PUMP_ON_LEVEL) continue;
      const back = beside(index, OPPOSITE[front]);
      const ahead = beside(index, front);
      if (back < 0 || ahead < 0 || !sides[back].includes(front) || !sides[ahead].includes(OPPOSITE[front])) continue;
      const push = Math.min(PUMP_RATE * level, water[back], Math.max(0, PUMP_FRONT_CAP - water[ahead]));
      water[back] -= push;
      water[ahead] += push;
      changed += push;
    }
  }
  return changed;
}

/**
 * One tick of fluids: water and steam move (in FLUID_STEPS small
 * steps), then the special blocks do their jobs once.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {{moved: number, steamOut: Map<number, number>, sides: string[][]}}
 *   how much changed in total, how much steam left each turbine, and every cell's open sides
 */
export function stepFluids(world, blockInfo) {
  const sides = allOpenSides(world, blockInfo);
  const canFlow = flowChecker(world, sides, blockInfo);
  const steamOut = new Map();
  /**
   * Count steam leaving a turbine (that's what spins it).
   * @param {number} from - the cell the steam left
   * @param {number} to - where it went
   * @param {number} amount - how much
   * @returns {void}
   */
  const countTurbines = (from, to, amount) => {
    if (blockInfo(world.cells[from])?.turbine) steamOut.set(from, (steamOut.get(from) ?? 0) + amount);
  };
  let moved = 0;
  for (let step = 0; step < FLUID_STEPS; step++) {
    moved += flowFluid(world, 'water', canFlow, () => {});
    moved += flowFluid(world, 'steam', canFlow, countTurbines);
  }
  moved += runSpecials(world, blockInfo, sides);
  return { moved, steamOut, sides };
}
```

Add `'./js/fluids.js',` to `PRECACHE` in `sw.js` after `'./js/circuit.js',`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. That includes 16 fluid tests: U-tube level within 80 ticks, tower level, conservation over 300 ticks.

- [ ] **Step 5: Commit**

```bash
git add js/fluids.js tests/fluids.test.js tests/modules.test.js sw.js
git commit -m "Add the fluid rules: falling, spreading, squishing water; rising steam; special blocks"
```

---

### Task 4: Turbines push in circuits (pushNow)

**Files:**
- Modify: `js/circuit.js` (new `partPush`, points carry `push`; `pushOut`, groups, shorts and sparks use it)
- Modify: `js/blocks/electric.js` (`circuitKey(world, blockInfo)` includes the rounded `pushNow` values)
- Modify: `tests/circuit.test.js` (2 tests), `tests/electric.test.js` (`circuitKey` calls pass `blockInfo`)

**Interfaces:**
- Produces:
  - `partPush(part, world, x, y) → number`
  - `part.pushNow(world, x, y)` overrides `part.push`
  - `circuitKey(world, blockInfo)`

- [ ] **Step 1: Write the failing tests.** Apply:

```diff
--- a/tests/circuit.test.js
+++ b/tests/circuit.test.js
@@ -195,3 +195,19 @@
   assert.equal(solveLinear([[0, 0], [0, 0]], [1, 1]), null);
   assert.deepEqual(solveLinear([[2, 0], [0, 4]], [2, 8]), [1, 2]);
 });
+
+test('a part with pushNow pushes as hard as it says (a turbine)', () => {
+  TEST_BLOCKS.turbine = { part: { resistance: 0.05, pushNow: (world) => world.turbinePush } };
+  LETTERS.T = 'turbine';
+  const world = worldFrom(['WWW', 'T.W', 'WLW']);
+  world.turbinePush = 1;
+  assert.ok(Math.abs(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level - 1) < 0.02);
+  world.turbinePush = 0;
+  assert.equal(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level, 0);
+});
+
+test('a pushing turbine wired straight back to itself sparks, like a battery', () => {
+  const world = worldFrom(['WW', 'TW', 'WW']);
+  world.turbinePush = 1;
+  assert.equal(solveCircuit(world, blockInfo).cells.get(1 * 2 + 0).spark, true);
+});
```

```diff
--- a/tests/electric.test.js
+++ b/tests/electric.test.js
@@ -61,13 +61,13 @@
 
 test('the circuit key only changes with the beat when there is a clicker', () => {
   const plain = worldFrom(['WLW']);
-  const before = circuitKey(plain);
+  const before = circuitKey(plain, blockInfo);
   plain.ticks = CLICKER_TICKS;
-  assert.equal(circuitKey(plain), before);
+  assert.equal(circuitKey(plain, blockInfo), before);
   const ticking = worldFrom(['WKW']);
-  const onBeat = circuitKey(ticking);
+  const onBeat = circuitKey(ticking, blockInfo);
   ticking.ticks = CLICKER_TICKS;
-  assert.notEqual(circuitKey(ticking), onBeat);
+  assert.notEqual(circuitKey(ticking, blockInfo), onBeat);
 });
 
 test('the math only runs again when the circuit changes', () => {
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/circuit.test.js`
Expected: FAIL — "a part with pushNow pushes…" (level 0, because `pushNow` is ignored) and the turbine-short test (`spark` false).

- [ ] **Step 3: Implement.** Apply:

```diff
--- a/js/circuit.js
+++ b/js/circuit.js
@@ -13,7 +13,9 @@
  * it goes, and so how bright each lamp is.
  *
  * This file knows nothing about which blocks exist. It only reads the
- * fields blocks have: `conducts`, `part`, `partWhen`, `electric`.
+ * fields blocks have: `conducts`, `part`, `partWhen`, `electric`. A part
+ * pushes with `part.push` volts, or, if it has `part.pushNow`, with
+ * whatever that says right now (a turbine pushes harder with more steam).
  */
 import { getBlock, inBounds } from './world.js';
 
@@ -143,15 +145,29 @@
 }
 
 /**
+ * How hard a part pushes right now, in volts: `pushNow` if it has one
+ * (a turbine), otherwise its fixed `push` (a battery), otherwise 0.
+ * @param {object|null} part - the part settings
+ * @param {object} world - the world
+ * @param {number} x - the part's column
+ * @param {number} y - the part's row
+ * @returns {number} the push
+ */
+export function partPush(part, world, x, y) {
+  if (!part) return 0;
+  return part.pushNow ? part.pushNow(world, x, y) : (part.push ?? 0);
+}
+
+/**
  * How hard a battery pushes current OUT through one of its sides:
  * half its push out of the + end, half pulled in at the − end.
- * Anything that isn't a battery pushes 0.
- * @param {{part: object|null, axis: string|null}} point - a point
+ * Anything that isn't pushing pushes 0.
+ * @param {{push: number, axis: string|null}} point - a point
  * @param {string} side - which side
  * @returns {number} the push out through that side
  */
 function pushOut(point, side) {
-  const push = point.part?.push ?? 0;
+  const push = point.push;
   if (!push) return 0;
   const plus = plusSide(point.axis);
   if (side === plus) return push / 2;
@@ -285,7 +301,7 @@
    */
   const plain = (index) => {
     const p = points.get(index);
-    return p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE || (p.part.push ?? 0) > 0;
+    return p.info.conducts || p.part.resistance <= SHORT_PATH_RESISTANCE || p.push !== 0;
   };
   if (!plain(plus) || !plain(minus)) return false;
   const seen = new Set([battery, plus]);
@@ -328,7 +344,9 @@
       const axis = info.conducts ? null : partAxis(world, x, y, blockInfo);
       cells.set(index, { axis, faces: [], arms: {}, level: 0, spark: false });
       const part = activePart(info, world);
-      if (info.conducts || part) points.set(index, { x, y, info, part, axis, sides: sidesFor(info, axis) });
+      if (info.conducts || part) {
+        points.set(index, { x, y, info, part, axis, sides: sidesFor(info, axis), push: partPush(part, world, x, y) });
+      }
     }
   }
 
@@ -360,7 +378,7 @@
 
   // Solve each separate circuit that has a battery in it.
   for (const members of groupsOf([...points.keys()], links)) {
-    if (!members.some((index) => points.get(index).part?.push)) continue;
+    if (!members.some((index) => points.get(index).push !== 0)) continue;
     const inside = new Set(members);
     const groupLinks = links.filter((link) => inside.has(link.a));
     const voltages = solveVoltages(members, groupLinks);
@@ -382,7 +400,7 @@
     const cell = cells.get(index);
     const through = Math.max(0, ...point.sides.map((side) => Math.abs(cell.arms[side] ?? 0)));
     cell.level = Math.min(MAX_LEVEL, through / REFERENCE_CURRENT);
-    if (point.part.push && through > SHORT_CURRENT) {
+    if (point.push !== 0 && through > SHORT_CURRENT) {
       cell.spark = shortedByShape(index, point, points, touching, world.width);
     }
   }
```

```diff
--- a/js/blocks/electric.js
+++ b/js/blocks/electric.js
@@ -48,14 +48,24 @@
 
 /**
  * A short text that changes whenever the circuit could change: the
- * blocks, plus the clicker beat (only if there's a clicker). If it's the
- * same as last time, there's no need to do the math again.
+ * blocks, the clicker beat (only if there's a clicker), and how hard any
+ * changing pushers (turbines) push, rounded so tiny wobbles don't count.
+ * If it's the same as last time, there's no need to do the math again.
  * @param {{cells: string[], ticks: number}} world - the world
+ * @param {Function} blockInfo - looks up what a block name means
  * @returns {string} the key
  */
-export function circuitKey(world) {
+export function circuitKey(world, blockInfo) {
   const beat = world.cells.includes('clicker') ? String(clickerOn(world)) : '';
-  return `${world.cells.join(',')}|${beat}`;
+  const pushes = [];
+  world.cells.forEach((name, index) => {
+    const part = blockInfo(name)?.part;
+    if (part?.pushNow) {
+      const push = part.pushNow(world, index % world.width, Math.floor(index / world.width));
+      pushes.push(Math.round(push * 10) / 10);
+    }
+  });
+  return `${world.cells.join(',')}|${beat}|${pushes.join(',')}`;
 }
 
 /**
@@ -72,7 +82,7 @@
  */
 export function refreshElectric(world, blockInfo) {
   const old = world.signals.electric;
-  const key = circuitKey(world);
+  const key = circuitKey(world, blockInfo);
   if (old && old.key === key) return false;
 
   const { cells, flowing } = solveCircuit(world, blockInfo);
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/circuit.js js/blocks/electric.js tests/circuit.test.js tests/electric.test.js
git commit -m "Circuits: parts can push by how much is happening right now (turbines)"
```

---

### Task 5: The 💧 pack (js/blocks/water.js) + registry

**Files:**
- Create: `js/blocks/water.js`
- Create: `tests/water.test.js`
- Modify: `js/blocks/registry.js` (import `water`, `PACKS = [basic, water, electric]`, new `drawLayers`)
- Modify: `tests/registry.test.js` (pack order), `tests/modules.test.js` (add `'blocks/water.js'`)
- Modify: `sw.js` (`PRECACHE`: `'./js/blocks/water.js',` after `'./js/fluids.js',`)

**Interfaces:**
- Consumes:
  - `stepFluids`, `drawingSides`, `FULL`, `MIN_AMOUNT`, `PUMP_ON_LEVEL` (Task 3)
  - `swapBlock` (Task 1)
  - `pushNow` support (Task 4)
- Produces:
  - **`water.js`:** `TURBINE_GAIN`, `MOVE_EPSILON`, `turbinePush(world, x, y)`, `refreshWater`, `waterSystem`, `drawWaterLayer`
  - **The default pack:** `{ tab: { id: 'water', icon: '💧', label: 'Water' }, blocks, systems: [waterSystem], refresh: refreshWater, drawLayer: drawWaterLayer }`
  - **`world.signals.water`:** `{ cells: Map<index, { sides, flow, level }>, turbineFlow: Map<index, number> }`
  - **`world.fluidChanged`:** set when more than `MOVE_EPSILON` moved
  - **`registry.drawLayers(ctx, world, size)`**

- [ ] **Step 1: Write the failing tests.** Create `tests/water.test.js`:

```js
/**
 * water.test.js — checks the 💧 pack with the real blocks: flipping
 * valves, burners and pumps, the palette, a steam power plant lighting a
 * lamp, and a battery-powered pump pushing water uphill.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, getFluid, setBlock, setFluid, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack, isKnownBlock } from '../js/blocks/registry.js';
import { partAxis } from '../js/circuit.js';
import { openSides } from '../js/fluids.js';
import water, { turbinePush } from '../js/blocks/water.js';

/** What each letter in a test picture means. `~` is air full of water. */
const LETTERS = {
  '.': 'air', '~': 'air', '#': 'stone', W: 'wire', L: 'lamp', B: 'battery',
  F: 'burnerOn', T: 'turbine', '^': 'pumpUp', P: 'pipe',
};

/**
 * Build a world from a picture, one string per row.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function worldFrom(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => {
    setBlock(world, x, y, LETTERS[letter]);
    if (letter === '~') setFluid(world, 'water', x, y, 1);
  }));
  return world;
}

/**
 * ✋ a block, the way build.js does.
 * @param {object} world - the world
 * @param {number} x - column
 * @param {number} y - row
 * @returns {boolean} what use() said
 */
function use(world, x, y) {
  return blockInfo(getBlock(world, x, y)).use({ world, x, y, playNote() {}, flash() {} });
}

test('the water tab shows one of each block, plus water and steam to pour', () => {
  assert.deepEqual(blocksInPack('water'), [
    'water', 'steam', 'pipe', 'valveOpen', 'faucet', 'drain', 'burnerOn', 'chiller', 'turbine', 'pumpRight',
  ]);
  for (const name of ['valveClosed', 'burnerOff', 'pumpDown', 'pumpLeft', 'pumpUp']) assert.equal(isKnownBlock(name), true);
  assert.deepEqual(water.tab, { id: 'water', icon: '💧', label: 'Water' });
});

test('✋ flips valves and burners, and turns pumps round, without spilling', () => {
  const world = worldFrom(['P']);
  setBlock(world, 0, 0, 'valveOpen');
  setFluid(world, 'water', 0, 0, 0.5);
  assert.equal(use(world, 0, 0), true);
  assert.equal(getBlock(world, 0, 0), 'valveClosed');
  assert.equal(getFluid(world, 'water', 0, 0), 0.5);
  use(world, 0, 0);
  assert.equal(getBlock(world, 0, 0), 'valveOpen');

  setBlock(world, 0, 0, 'burnerOn');
  use(world, 0, 0);
  assert.equal(getBlock(world, 0, 0), 'burnerOff');

  setBlock(world, 0, 0, 'pumpRight');
  const turns = [];
  for (let i = 0; i < 4; i++) {
    use(world, 0, 0);
    turns.push(getBlock(world, 0, 0));
  }
  assert.deepEqual(turns, ['pumpDown', 'pumpLeft', 'pumpUp', 'pumpRight']);
});

test('a turbine faces two ways: steam goes up through it, wires leave it sideways', () => {
  const world = worldFrom(['...', 'WTW', '...']);
  assert.deepEqual(openSides(world, 1, 1, blockInfo), ['up', 'down']);
  assert.equal(partAxis(world, 1, 1, blockInfo), 'h');
});

test('a steam power plant lights a lamp: burner → steam → turbine → ⚡', () => {
  const world = worldFrom([
    'WWWLWWW',
    'W.....W',
    'WWWTWWW',
    '###~###',
    '###F###',
    '#######',
  ]);
  const systems = allSystems();
  let brightest = 0;
  for (let i = 0; i < 40; i++) {
    tick(world, systems, blockInfo);
    brightest = Math.max(brightest, world.signals.electric.cells.get(3).level);
  }
  assert.ok(brightest > 0.5, `the lamp only reached ${brightest.toFixed(3)}`);
  assert.ok(turbinePush(world, 3, 2) > 0); // still spinning from the steam
});

test('a battery-powered pump pushes water uphill; without power it does not', () => {
  const plan = (battery) => [
    'WWWWW',
    `${battery}#.#W`,
    'WW^WW',
    '##~##',
    '#####',
  ];
  const systems = allSystems();
  const powered = worldFrom(plan('B'));
  for (let i = 0; i < 20; i++) tick(powered, systems, blockInfo);
  assert.ok(getFluid(powered, 'water', 2, 1) > 0.5, 'the pump did not lift the water');

  const unpowered = worldFrom(plan('#'));
  for (let i = 0; i < 20; i++) tick(unpowered, systems, blockInfo);
  assert.equal(getFluid(unpowered, 'water', 2, 1), 0);
});

test('sand sinks through water: they trade places and no water is lost', () => {
  const world = createWorld(1, 3);
  setBlock(world, 0, 0, 'sand');
  setFluid(world, 'water', 0, 1, 1);
  setBlock(world, 0, 2, 'stone');
  const systems = allSystems();
  for (let i = 0; i < 5; i++) tick(world, systems, blockInfo);
  assert.equal(getBlock(world, 0, 1), 'sand');
  assert.ok(Math.abs(getFluid(world, 'water', 0, 0) - 1) < 1e-9);
});
```

Apply:

```diff
--- a/tests/registry.test.js
+++ b/tests/registry.test.js
@@ -56,8 +56,8 @@
   assert.ok(allSystems().includes(fallingBlocks));
 });
 
-test('the packs run basic first, then electric', () => {
-  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'electric']);
+test('the packs run basic first, then water, then electric', () => {
+  assert.deepEqual(PACKS.map((pack) => pack.tab.id), ['basic', 'water', 'electric']);
 });
 
 test('blocksInPack gives the palette for one tab', () => {
```

Add `'blocks/water.js'` to the end of `MODULES` in `tests/modules.test.js`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `js/blocks/water.js` (`water.test.js`, module test) and the pack-order test.

- [ ] **Step 3: Create js/blocks/water.js**

```js
/**
 * water.js — the 💧 Water pack: water, steam, pipes, valves, faucets,
 * drains, burners, chillers, turbines and pumps.
 *
 * fluids.js does the moving; this file says what each block is, runs
 * the fluids every tick, and draws them. It also connects to the ⚡
 * Power pack: a turbine spun by steam is a battery in a circuit, and a
 * pump in a circuit pushes water.
 *
 * A steam power plant, like the real ones:
 *
 *    ☁️ steam rises → ⚙️ turbine spins → ⚡ lamp lights
 *    🔥 burner boils water          ❄️ chiller turns steam back to water
 */
import { FULL, MIN_AMOUNT, PUMP_ON_LEVEL, drawingSides, stepFluids } from '../fluids.js';
import { swapBlock } from '../world.js';

/**
 * How much push a turbine gives for each unit of steam per tick.
 * One burner makes 0.05 steam a tick, so 20 makes it push like one battery.
 * 🧪 Try this! 40: one burner pushes like two batteries.
 */
export const TURBINE_GAIN = 20;

/** The strongest push a turbine can give (like two batteries). */
const MAX_TURBINE_PUSH = 2;

/**
 * A turbine's push follows the steam slowly (over about 8 ticks, one
 * second), so lamps fade up and down instead of flickering.
 */
const TURBINE_SMOOTHING = 8;

/** Fluid moving less than this in a tick doesn't count as the world changing. */
export const MOVE_EPSILON = 0.001;

/** The water and steam colors. */
const WATER_COLOR = 'rgba(47, 127, 224, 0.8)';
const WATER_TOP = '#7fb8ff';
const STEAM_COLOR = 'rgba(255, 255, 255, 0.6)';

/** The order a pump turns through when you tap it with ✋. */
const PUMP_TURNS = { pumpRight: 'pumpDown', pumpDown: 'pumpLeft', pumpLeft: 'pumpUp', pumpUp: 'pumpRight' };

// =============================================================
// Running the water
// =============================================================

/**
 * How hard a turbine pushes right now: its smoothed steam flow × TURBINE_GAIN.
 * @param {object} world - the world
 * @param {number} x - the turbine's column
 * @param {number} y - the turbine's row
 * @returns {number} the push, in volts (0 to MAX_TURBINE_PUSH)
 */
export function turbinePush(world, x, y) {
  const flow = world.signals.water?.turbineFlow?.get(y * world.width + x) ?? 0;
  return Math.min(MAX_TURBINE_PUSH, flow * TURBINE_GAIN);
}

/**
 * Make a record for every fluid block, for drawing: the sides it's
 * drawn with, the steam flowing through it (turbines), and its circuit
 * level (pumps).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @param {Map<number, number>} turbineFlow - smoothed steam flow by cell index
 * @returns {Map<number, object>} records by cell index
 */
function fluidCells(world, blockInfo, turbineFlow) {
  const cells = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.fluid) return;
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    cells.set(index, {
      sides: drawingSides(world, x, y, blockInfo),
      flow: turbineFlow.get(index) ?? 0,
      level: world.signals.electric?.cells?.get(index)?.level ?? 0,
    });
  });
  return cells;
}

/**
 * Bring the drawing records up to date without moving any water (for
 * example, right after a pipe was placed). See refreshSignals in registry.js.
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {void}
 */
export function refreshWater(world, blockInfo) {
  const turbineFlow = world.signals.water?.turbineFlow ?? new Map();
  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow };
}

/**
 * The water rule that runs every tick: move the fluids, keep track of
 * the steam spinning each turbine, and say whether anything changed.
 * It never moves blocks, so it returns false; when fluid moved it sets
 * world.fluidChanged (save and redraw), and world.animating for things
 * that move by themselves (flames, spinning turbines).
 * @param {object} world - the world
 * @param {Function} blockInfo - looks up what a block name means
 * @returns {boolean} always false: no blocks moved
 */
export function waterSystem(world, blockInfo) {
  const { moved, steamOut } = stepFluids(world, blockInfo);
  const before = world.signals.water?.turbineFlow ?? new Map();
  const turbineFlow = new Map();
  world.cells.forEach((name, index) => {
    if (!blockInfo(name)?.turbine) return;
    const last = before.get(index) ?? 0;
    turbineFlow.set(index, last + ((steamOut.get(index) ?? 0) - last) / TURBINE_SMOOTHING);
  });
  world.signals.water = { cells: fluidCells(world, blockInfo, turbineFlow), turbineFlow };
  if (moved > MOVE_EPSILON) world.fluidChanged = true;
  const spinning = [...turbineFlow.values()].some((flow) => flow > MIN_AMOUNT);
  if (moved > MOVE_EPSILON || spinning || world.cells.includes('burnerOn')) world.animating = true;
  return false;
}

// =============================================================
// Drawing
// =============================================================
// Blocks are drawn on an 8 × 8 grid of little pixels: p = size / 8.

/**
 * Draw a channel (or a pipe's walls) as a middle square plus an arm
 * toward each side, `width` little pixels wide.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {string[]} sides - which sides the arms go to
 * @param {number} width - how wide, in little pixels (out of 8)
 * @returns {void}
 */
function drawArms(ctx, left, top, size, sides, width) {
  const p = size / 8;
  const near = (8 - width) / 2 * p; // where the channel starts across the cell
  const across = width * p;
  ctx.fillRect(left + near, top + near, across, across);
  for (const side of sides) {
    if (side === 'up') ctx.fillRect(left + near, top, across, near);
    if (side === 'down') ctx.fillRect(left + near, top + near + across, across, near);
    if (side === 'left') ctx.fillRect(left, top + near, near, across);
    if (side === 'right') ctx.fillRect(left + near + across, top + near, near, across);
  }
}

/**
 * Draw a pipe: gray walls with a dark channel inside. The water layer
 * fills the channel later. In the palette it's a plain sideways pipe.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawPipe(ctx, info, left, top, size, cell) {
  const sides = cell?.sides ?? ['left', 'right'];
  ctx.fillStyle = '#9e9e9e';
  drawArms(ctx, left, top, size, sides, 6);
  ctx.fillStyle = '#37474f';
  drawArms(ctx, left, top, size, sides, 4);
}

/**
 * Draw a valve: a pipe with a wheel on top. Closed, the channel is
 * blocked with red.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.fluid.closed when shut)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawValve(ctx, info, left, top, size, cell) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell);
  const closed = info.fluid.closed;
  ctx.fillStyle = closed ? '#c62828' : '#2e7d32';
  ctx.fillRect(left + 2.5 * p, top + 2.5 * p, 3 * p, 3 * p); // the wheel's middle
  ctx.fillStyle = '#ffcdd2';
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p);
}

/**
 * Draw a turbine: a pipe with fan blades that turn faster with more steam.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawTurbine(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell ?? { sides: ['up', 'down'] });
  const speed = Math.min(1, (cell?.flow ?? 0) * TURBINE_GAIN);
  const turn = Math.floor(ticks * speed) % 2; // two blade positions: + and ×
  ctx.fillStyle = '#eceff1';
  const blades = turn === 0
    ? [[3.5, 1.5], [3.5, 5.5], [1.5, 3.5], [5.5, 3.5]]
    : [[2, 2], [5, 2], [2, 5], [5, 5]];
  for (const [x, y] of blades) ctx.fillRect(left + x * p, top + y * p, p, p);
  ctx.fillStyle = '#546e7a';
  ctx.fillRect(left + 3.5 * p, top + 3.5 * p, p, p); // the hub
}

/**
 * Draw a pump: a pipe with an arrow pointing the way it pushes. The
 * arrow glows yellow when the pump has power.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.fluid.pump is its direction)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - the cell's water record
 * @returns {void}
 */
function drawPump(ctx, info, left, top, size, cell) {
  const p = size / 8;
  drawPipe(ctx, info, left, top, size, cell ?? { sides: info.fluid.sides });
  ctx.fillStyle = (cell?.level ?? 0) >= PUMP_ON_LEVEL ? '#ffeb3b' : '#bdbdbd';
  // An arrowhead: three rows getting shorter, pointing right; turned for other directions.
  const rows = [[2.5, 2.5, 3], [3.5, 3, 2], [4.5, 3.5, 1]]; // [x, y, height]
  for (const [x, y, h] of rows) {
    const box = {
      right: [x, y, 1, h],
      left: [7 - x, y, 1, h],
      down: [y, x, h, 1],
      up: [y, 7 - x, h, 1],
    }[info.fluid.pump];
    ctx.fillRect(left + box[0] * p, top + box[1] * p, box[2] * p, box[3] * p);
  }
}

/**
 * Draw a faucet: a tap with a spout at the bottom.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawFaucet(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#607d8b';
  ctx.fillRect(left + 3 * p, top + 5 * p, 2 * p, 3 * p); // the spout
  ctx.fillStyle = '#e53935';
  ctx.fillRect(left + 2 * p, top + p, 4 * p, p); // the handle
}

/**
 * Draw a drain: a grate of dark bars.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawDrain(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#212121';
  for (const x of [1.5, 3.5, 5.5]) ctx.fillRect(left + x * p, top + p, p, 6 * p);
}

/**
 * Draw a burner: flickering flames when it's on, a gray ring when off.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition (info.burns when on)
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @param {object|undefined} cell - unused (burners have no record)
 * @param {number} ticks - the world's clock
 * @returns {void}
 */
function drawBurner(ctx, info, left, top, size, cell, ticks) {
  const p = size / 8;
  if (!info.burns) {
    ctx.fillStyle = '#9e9e9e';
    ctx.fillRect(left + 2 * p, top + 2 * p, 4 * p, p);
    return;
  }
  const tall = ticks % 2 === 0 ? 0 : p; // flicker
  ctx.fillStyle = '#ff7043';
  ctx.fillRect(left + 2 * p, top + p + tall, 4 * p, 4 * p - tall);
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(left + 3 * p, top + 2.5 * p + tall, 2 * p, 2.5 * p - tall);
}

/**
 * Draw a chiller: a few white frost sparkles.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} info - the block's definition
 * @param {number} left - the cell's left edge
 * @param {number} top - the cell's top edge
 * @param {number} size - the cell's size
 * @returns {void}
 */
function drawChiller(ctx, info, left, top, size) {
  const p = size / 8;
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[1, 1], [5, 2], [2, 5], [6, 6], [4, 4]]) ctx.fillRect(left + x * p, top + y * p, p, p);
}

/**
 * Draw all the water and steam, on top of the blocks. In open air,
 * water fills a cell from the bottom (a cell with water above it is
 * drawn full), and steam fills from the top. Inside pipes, valves,
 * pumps and turbines it fills the channel, darker when fuller.
 * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
 * @param {object} world - the world
 * @param {number} size - how big each cell is, in pixels
 * @returns {void}
 */
export function drawWaterLayer(ctx, world, size) {
  const { water, steam } = world.fluid;
  const records = world.signals.water?.cells ?? new Map();
  for (let index = 0; index < world.cells.length; index++) {
    const wet = water[index] >= MIN_AMOUNT;
    const steamy = steam[index] >= MIN_AMOUNT;
    if (!wet && !steamy) continue;
    const left = (index % world.width) * size;
    const top = Math.floor(index / world.width) * size;
    const record = records.get(index);
    if (record) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, water[index] + steam[index]);
      ctx.fillStyle = wet ? WATER_COLOR : STEAM_COLOR;
      drawArms(ctx, left, top, size, record.sides, 4);
      ctx.globalAlpha = 1;
      continue;
    }
    if (world.cells[index] !== 'air') continue; // solid blocks never show fluid
    if (wet) {
      const above = index - world.width;
      const full = above >= 0 && water[above] >= MIN_AMOUNT;
      const height = full ? size : size * Math.min(water[index], FULL);
      ctx.fillStyle = WATER_COLOR;
      ctx.fillRect(left, top + size - height, size, height);
      if (!full && height < size) {
        ctx.fillStyle = WATER_TOP;
        ctx.fillRect(left, top + size - height, size, Math.max(1, size / 16));
      }
    }
    if (steamy) {
      ctx.fillStyle = STEAM_COLOR;
      ctx.fillRect(left, top, size, size * Math.min(steam[index], FULL));
    }
  }
}

// =============================================================
// The blocks
// =============================================================

/**
 * Make the ✋ USE for a block that flips to another block (keeping its water).
 * @param {string} next - the block it turns into
 * @returns {Function} the use function
 */
function flipTo(next) {
  return (ctx) => swapBlock(ctx.world, ctx.x, ctx.y, next);
}

/**
 * Make one pump block, facing one direction.
 * @param {'right'|'down'|'left'|'up'} direction - the way it pushes water
 * @param {boolean} hidden - true for all but one direction, so the palette shows one pump
 * @returns {object} the block's definition
 */
function pump(direction, hidden) {
  const name = `pump${direction[0].toUpperCase()}${direction.slice(1)}`;
  return {
    title: 'Pump',
    color: '#607d8b',
    bare: true,
    hidden,
    fluid: { sides: direction === 'left' || direction === 'right' ? ['left', 'right'] : ['up', 'down'], pump: direction },
    part: { resistance: 1 },
    use: flipTo(PUMP_TURNS[name]),
    drawSignals: drawPump,
  };
}

/**
 * Every block in this pack, in the order the palette shows them.
 *   pours     not a block: BUILD pours a full cell of this fluid
 *   fluid     lets water through: which sides, and if it's a closed valve or a pump
 *   faucet / drains / burns / chills / turbine   the special jobs (see fluids.js)
 *   hidden    not in the palette (you get it with ✋)
 * 🧪 Try this! Change the burner's color to '#1565c0' for a blue-flame burner.
 */
const blocks = {
  water: { title: 'Water', color: '#2f7fe0', pours: 'water' },
  steam: { title: 'Steam', color: '#eceff1', pours: 'steam' },
  pipe: { title: 'Pipe', color: '#9e9e9e', bare: true, fluid: { sides: 'auto-pipe' }, drawSignals: drawPipe },
  valveOpen: {
    title: 'Valve', color: '#9e9e9e', bare: true,
    fluid: { sides: 'axis', prefer: 'h' }, use: flipTo('valveClosed'), drawSignals: drawValve,
  },
  faucet: { title: 'Faucet', color: '#cfd8dc', faucet: true, drawSignals: drawFaucet },
  drain: { title: 'Drain', color: '#546e7a', fluid: { sides: 'all' }, drains: true, drawSignals: drawDrain },
  burnerOn: { title: 'Burner', color: '#4e342e', burns: true, use: flipTo('burnerOff'), drawSignals: drawBurner },
  chiller: { title: 'Chiller', color: '#81d4fa', chills: true, drawSignals: drawChiller },
  turbine: {
    title: 'Turbine', color: '#78909c', bare: true, turbine: true,
    fluid: { sides: 'axis', prefer: 'v' },
    part: { resistance: 0.05, pushNow: turbinePush },
    drawSignals: drawTurbine,
  },
  pumpRight: pump('right', false),
  valveClosed: {
    title: 'Valve (shut)', color: '#9e9e9e', bare: true, hidden: true,
    fluid: { sides: 'axis', prefer: 'h', closed: true }, use: flipTo('valveOpen'), drawSignals: drawValve,
  },
  burnerOff: { title: 'Burner (off)', color: '#4e342e', hidden: true, use: flipTo('burnerOn'), drawSignals: drawBurner },
  pumpDown: pump('down', true),
  pumpLeft: pump('left', true),
  pumpUp: pump('up', true),
};

export default {
  tab: { id: 'water', icon: '💧', label: 'Water' },
  blocks,
  systems: [waterSystem],
  refresh: refreshWater,
  drawLayer: drawWaterLayer,
};
```

Apply to the registry:

```diff
--- a/js/blocks/registry.js
+++ b/js/blocks/registry.js
@@ -8,6 +8,7 @@
 import { AIR } from '../world.js';
 import basic from './basic.js';
 import electric from './electric.js';
+import water from './water.js';
 
 /**
  * Every pack, in the order their systems run each tick. Order matters
@@ -16,7 +17,7 @@
  * for steam. The plan for later phases is:
  *   basic → water → mechanical → electric
  */
-export const PACKS = [basic, electric];
+export const PACKS = [basic, water, electric];
 
 /**
  * The names of the signals packs pass to each other: ⚡ power (wires,
@@ -84,3 +85,15 @@
 export function refreshSignals(world) {
   for (const pack of PACKS) pack.refresh?.(world, blockInfo);
 }
+
+/**
+ * Draw every pack's whole-world layer (like water and steam) on top of
+ * the blocks. Packs without a `drawLayer` are skipped.
+ * @param {CanvasRenderingContext2D} ctx - the canvas paintbrush
+ * @param {object} world - the world
+ * @param {number} size - how big each cell is, in pixels
+ * @returns {void}
+ */
+export function drawLayers(ctx, world, size) {
+  for (const pack of PACKS) pack.drawLayer?.(ctx, world, size);
+}
```

Add `'./js/blocks/water.js',` to `PRECACHE` in `sw.js` after `'./js/fluids.js',`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, 0 fail. That includes "a steam power plant lights a lamp" and "a battery-powered pump pushes water uphill".

- [ ] **Step 5: Commit**

```bash
git add js/blocks tests/water.test.js tests/registry.test.js tests/modules.test.js sw.js
git commit -m "Add the water pack: pipes, valves, faucets, drains, burners, chillers, turbines, pumps"
```

---

### Task 6: Build page: pour, scoop, save while water flows, draw the water

**Files:**
- Modify: `js/build.js` (imports, `SAVE_MAX_WAIT_MS`, `firstUnsavedAt`, `applyTool` pours and scoops, `saveDelay`, `draw` / `pictureOf` draw layers, `saveNow` / `scheduleSave` timing, tick loop counts `fluidChanged`)
- Modify: `tests/build.test.js` (3 tests)
- Modify: `sw.js` (`CACHE_NAME = 'caleb-v4'`)
- Test: `$SCRATCH/check-water.cjs` (scratchpad browser check, below)

**Interfaces:**
- Consumes:
  - `pour` (Task 3), `clearFluid` (Task 1)
  - `drawLayers` (Task 5)
  - `world.fluidChanged` (Task 5)
- Produces: `saveDelay(now, firstUnsaved) → ms` (exported from `build.js`)

- [ ] **Step 1: Write the failing tests.** Apply:

```diff
--- a/tests/build.test.js
+++ b/tests/build.test.js
@@ -5,7 +5,7 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
 import { AIR, createWorld, getBlock, setBlock } from '../js/world.js';
-import { applyTool, fitCellSize } from '../js/build.js';
+import { applyTool, fitCellSize, saveDelay } from '../js/build.js';
 
 test('blocks are as big as fits, and always square', () => {
   assert.equal(fitCellSize(960, 560, 24, 14), 40);  // fits exactly
@@ -43,3 +43,27 @@
   assert.equal(applyTool(world, 'build', -1, 0, 'gold'), false);
   assert.ok(world.cells.every((name) => name === AIR));
 });
+
+test('saving waits 1 second after a change, but never more than 5 seconds after the first one', () => {
+  assert.equal(saveDelay(1000, 1000), 1000);  // just changed
+  assert.equal(saveDelay(4500, 1000), 1000);  // 3.5 s in: still the normal wait
+  assert.equal(saveDelay(5500, 1000), 500);   // 4.5 s in: only half a second left
+  assert.equal(saveDelay(9000, 1000), 0);     // past 5 s: save now
+});
+
+test('BUILD with water pours it; DIG scoops it out', () => {
+  const world = createWorld(2, 1);
+  assert.equal(applyTool(world, 'build', 0, 0, 'water'), true);
+  assert.equal(world.cells[0], AIR);       // pouring never places a block
+  assert.equal(world.fluid.water[0], 1);
+  assert.equal(applyTool(world, 'build', 0, 0, 'water'), false); // already full
+  assert.equal(applyTool(world, 'dig', 0, 0, 'gold'), true);
+  assert.equal(world.fluid.water[0], 0);
+});
+
+test('you cannot pour water into a solid block', () => {
+  const world = createWorld(1, 1);
+  setBlock(world, 0, 0, 'stone');
+  assert.equal(applyTool(world, 'build', 0, 0, 'water'), false);
+  assert.equal(world.fluid.water[0], 0);
+});
```

Save the browser check as `$SCRATCH/check-water.cjs`, where `$SCRATCH` is the session scratchpad:

```js
// Drives the 💧 pack on build.html. Usage: node check-water.cjs <port> <shot-prefix>
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
  const tab = (id) => page.click(`[data-tab="${id}"]`);
  const place = async (label, cells) => { await page.click(`[aria-label="${label}"]`); for (const [x, y] of cells) await tap(x, y); };
  const saved = async () => {
    await page.waitForTimeout(1300);
    return page.evaluate(() => JSON.parse(localStorage.getItem('calebhamsa.build.world.1')));
  };
  /** Total saved water in column x between rows top..bottom. */
  const columnWater = (data, x, top, bottom) => { let s = 0; for (let y = top; y <= bottom; y++) s += data.water[y * data.width + x]; return s; };

  // 1. A glass U-tube on the grass (grass is row 10): columns x=2 and x=4, joined at row 9.
  //    rows 5..8: glass at x=1,3,5; row 9: glass at x=1 and x=5, open between.
  await tab('basic');
  const glass = [];
  for (let y = 5; y <= 9; y++) glass.push([1, y], [5, y]);
  for (let y = 5; y <= 8; y++) glass.push([3, y]);
  await place('Glass', glass);
  await tab('water');
  // 6 waters into the top of the left column, waiting between pours so
  // each one adds a whole cell (a pour only tops a cell up to full).
  await page.click('[aria-label="Water"]');
  for (let i = 0; i < 6; i++) { await tap(2, 5); await page.waitForTimeout(500); }
  await page.waitForTimeout(8000);
  let data = await saved();
  const left = columnWater(data, 2, 0, 8);
  const right = columnWater(data, 4, 0, 8);
  assert.ok(left > 0.8 && right > 0.8, `U-tube columns too empty to test: left ${left} right ${right}`);
  assert.ok(Math.abs(left - right) < 0.15, `U-tube not level: left ${left} right ${right}`);
  await page.screenshot({ path: `${prefix}-utube.png` });

  // 2. A steam power plant at x=10..16 (same shape as the unit test), lamp at (13, 3).
  await tab('electric');
  await place('Wire', [[10, 3], [11, 3], [12, 3], [14, 3], [15, 3], [16, 3], [10, 4], [16, 4], [10, 5], [11, 5], [12, 5], [14, 5], [15, 5], [16, 5]]);
  await place('Lamp', [[13, 3]]);
  await tab('water');
  await place('Turbine', [[13, 5]]);
  await tab('basic');
  await place('Stone', [[12, 6], [14, 6], [12, 7], [14, 7]]);
  await tab('water');
  await place('Burner', [[13, 7]]);
  await place('Water', [[13, 6]]);
  let lit = false;
  for (let i = 0; i < 20 && !lit; i++) {
    await page.waitForTimeout(250);
    const [r, g, b] = await page.evaluate(() => {
      const c = document.getElementById('world'); const r = c.width / 24;
      const d = c.getContext('2d').getImageData(Math.round(13.5 * r) - 2, Math.round(3.5 * r) - 2, 4, 4).data;
      return [d[0], d[1], d[2]];
    });
    lit = r > 200 && g > 180 && b < 150;
  }
  assert.ok(lit, 'the steam power plant never lit the lamp');
  await page.screenshot({ path: `${prefix}-plant.png` });

  // 3. Reload: the U-tube water is still there. (A pour tops a cell up to
  //    full, so the exact amount depends on tap timing: compare before/after.)
  /** All the water in the U-tube (x = 2..4). */
  const uTube = (d) => [2, 3, 4].reduce((sum, x) => sum + columnWater(d, x, 0, 9), 0);
  const before = uTube(await saved());
  await page.reload(); await page.waitForTimeout(800);
  data = await page.evaluate(() => JSON.parse(localStorage.getItem('calebhamsa.build.world.1')));
  assert.ok(before > 2 && Math.abs(uTube(data) - before) < 0.01, `water changed on reload: ${before} → ${uTube(data)}`);
  assert.equal(data.version, 2);

  assert.deepEqual(errors, []);
  console.log('water: all checks passed');
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Run to verify they fail**

```bash
node --test tests/build.test.js
python3 -m http.server 8123 >/dev/null 2>&1 &   # if not already running
node $SCRATCH/check-water.cjs 8123 $SCRATCH/t6
```

Expected: FAIL — `does not provide an export named 'saveDelay'`. The browser check also fails (pouring places nothing, so "U-tube columns too empty").

- [ ] **Step 3: Implement.** Apply:

```diff
--- a/js/build.js
+++ b/js/build.js
@@ -12,8 +12,11 @@
  * anything moved. It also keeps three worlds saved (see saves.js), and
  * makes the 📷 picture. build.html calls initBuild() once.
  */
-import { AIR, WORLD_HEIGHT, WORLD_WIDTH, defaultWorld, getBlock, setBlock, tick } from './world.js';
-import { AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack, isKnownBlock, refreshSignals } from './blocks/registry.js';
+import { AIR, WORLD_HEIGHT, WORLD_WIDTH, clearFluid, defaultWorld, getBlock, setBlock, tick } from './world.js';
+import {
+  AIR_INFO, PACKS, allSystems, blockInfo, blocksInPack, drawLayers, isKnownBlock, refreshSignals,
+} from './blocks/registry.js';
+import { pour } from './fluids.js';
 import { drawCell, drawWorld } from './block-art.js';
 import { WORLD_COUNT, loadCurrent, loadThumbnail, loadWorld, saveCurrent, saveWorld, worldKey } from './saves.js';
 import { audioRunning, listenForUnlock, playTones, setHum } from './sound.js';
@@ -45,6 +48,14 @@
  */
 const SAVE_DELAY_MS = 1000;
 
+/**
+ * The longest a change may wait to be saved, in milliseconds. Running
+ * water keeps changing the world, which would keep pushing the save
+ * back forever, so after this long we save anyway.
+ * 🧪 Try this! 20000 to save less often while water flows.
+ */
+const SAVE_MAX_WAIT_MS = 5000;
+
 /** Block size for the little world pictures on the 🌍 buttons (24 × 4 = 96 pixels wide). */
 const THUMB_CELL_PX = 4;
 
@@ -88,6 +99,9 @@
 let worldButtons = [];
 let saveTimer = null;
 
+/** When the oldest unsaved change happened (performance.now()), or 0 if everything is saved. */
+let firstUnsavedAt = 0;
+
 /**
  * True when the world has changes that aren't saved yet. We only save
  * when there's something new, so an old browser tab that was left open
@@ -120,7 +134,8 @@
 }
 
 /**
- * Do what BUILD or DIG does to one cell. (USE is handled by useBlockAt,
+ * Do what BUILD or DIG does to one cell: build (or pour), or dig (which
+ * also scoops out water). (USE is handled by useBlockAt,
  * because it makes sounds instead of changing the world.)
  * @param {{width: number, height: number, cells: string[]}} world - the world
  * @param {string} tool - 'build', 'dig' or 'use'
@@ -130,11 +145,29 @@
  * @returns {boolean} true if the world changed
  */
 export function applyTool(world, tool, x, y, selected) {
-  if (tool === 'build') return setBlock(world, x, y, selected);
-  if (tool === 'dig') return setBlock(world, x, y, AIR);
+  if (tool === 'build') {
+    const fluid = blockInfo(selected)?.pours; // 💧 and ☁️ pour instead of building
+    if (fluid) return pour(world, fluid, x, y, blockInfo);
+    return setBlock(world, x, y, selected);
+  }
+  if (tool === 'dig') {
+    const dried = clearFluid(world, x, y); // digging scoops out water too
+    return setBlock(world, x, y, AIR) || dried;
+  }
   return false;
 }
 
+/**
+ * How long to wait before saving: SAVE_DELAY_MS after the last change,
+ * but never past SAVE_MAX_WAIT_MS after the oldest unsaved change.
+ * @param {number} now - the time now, in milliseconds
+ * @param {number} firstUnsaved - when the oldest unsaved change happened
+ * @returns {number} milliseconds to wait (0 = save now)
+ */
+export function saveDelay(now, firstUnsaved) {
+  return Math.max(0, Math.min(SAVE_DELAY_MS, firstUnsaved + SAVE_MAX_WAIT_MS - now));
+}
+
 // =============================================================
 // Starting up
 // =============================================================
@@ -321,6 +354,7 @@
   if (!state.cell) return; // not sized yet
   refreshSignals(state.world); // e.g. a wire was just placed: work out the electricity first
   drawWorld(ctx, state.world, state.cell, blockInfo, AIR_INFO.color);
+  drawLayers(ctx, state.world, state.cell); // water and steam on top
 }
 
 /**
@@ -383,7 +417,9 @@
   const picture = document.createElement('canvas');
   picture.width = world.width * cell;
   picture.height = world.height * cell;
-  drawWorld(picture.getContext('2d'), world, cell, blockInfo, AIR_INFO.color);
+  const pictureCtx = picture.getContext('2d');
+  drawWorld(pictureCtx, world, cell, blockInfo, AIR_INFO.color);
+  drawLayers(pictureCtx, world, cell);
   return picture;
 }
 
@@ -395,6 +431,7 @@
 function saveNow() {
   clearTimeout(saveTimer);
   saveTimer = null;
+  firstUnsavedAt = 0; // even if saving fails, so we don't retry every tick
   const thumbnail = pictureOf(state.world, THUMB_CELL_PX).toDataURL('image/png');
   const saved = saveWorld(state.current, state.world, thumbnail, storage())
     && saveCurrent(state.current, storage());
@@ -426,12 +463,14 @@
 }
 
 /**
- * Save soon: SAVE_DELAY_MS after the last change.
+ * Save soon: SAVE_DELAY_MS after the last change (see saveDelay).
  * @returns {void}
  */
 function scheduleSave() {
+  const now = performance.now();
+  if (!firstUnsavedAt) firstUnsavedAt = now;
   clearTimeout(saveTimer);
-  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
+  saveTimer = setTimeout(saveNow, saveDelay(now, firstUnsavedAt));
 }
 
 /**
@@ -614,9 +653,10 @@
   if (tickTimer) return;
   tickTimer = setInterval(() => {
     state.world.animating = false;
-    const changed = tick(state.world, SYSTEMS, blockInfo);
+    state.world.fluidChanged = false;
+    const changed = tick(state.world, SYSTEMS, blockInfo) || state.world.fluidChanged;
     playEvents();
-    if (changed) worldChanged();             // blocks moved: redraw and save
+    if (changed) worldChanged();             // blocks or water moved: redraw and save
     else if (state.world.animating) draw();  // only the picture moves (dots): just redraw
     setHum(state.world.signals.electric?.hum ?? 0);
   }, 1000 / TICKS_PER_SECOND);
```

Set `const CACHE_NAME = 'caleb-v4';` in `sw.js`.

- [ ] **Step 4: Run the tests and the browser check**

```bash
npm test
node $SCRATCH/check-water.cjs 8123 $SCRATCH/t6
```

Expected: `npm test` PASS, 0 fail; `water: all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add js/build.js tests/build.test.js sw.js
git commit -m "Build page: pour and scoop water, draw it, and keep saving while it flows"
```

---

### Task 7: README, full sign-off, ship

**Files:**
- Modify: `README.md` (two file-table rows, one Try-this tip)

- [ ] **Step 1: README.** After the `js/circuit.js` row add:

```markdown
| `js/blocks/water.js` | 💧 Water blocks: pipes, valves, faucets, drains, burners, chillers, turbines, pumps |
| `js/fluids.js` | How water and steam move: falling, spreading, squishing (pure) |
```

Add a tip at the end of the Try-this list (continue the numbering):

```markdown
N. **Slow-motion water:** in `js/fluids.js`, set `FLUID_STEPS` to 1.
```

- [ ] **Step 2: Full sign-off.** With the server on 8123:

```bash
npm test
node $SCRATCH/check-water.cjs 8123 $SCRATCH/final3
node $SCRATCH/check-electric.cjs 8123 $SCRATCH/final3e
node $SCRATCH/check-build.cjs chromium $SCRATCH/final3b.png
node $SCRATCH/check-build.cjs ipad $SCRATCH/final3bi.png
node $SCRATCH/badge-check.cjs
node $SCRATCH/fixes-check.cjs
node $SCRATCH/audio-early-check.cjs
node $SCRATCH/music-smoke.cjs
```

Expected: everything passes, with the badge check showing 4 × `clear`.

Read `$SCRATCH/final3-utube.png` and `$SCRATCH/final3-plant.png`. Check:
- the U-tube columns are level
- the plant lamp is lit, the burner flame shows, and the turbine sits in the steam path
- the 💧 WATER palette shows 10 items

- [ ] **Step 3: Commit, push, verify live, close #4**

```bash
git add README.md && git commit -m "README: water pack files and a Try-this tip"
git push origin main
gh run watch $(gh run list -R Team-Hamsa/calebhamsa.fun -L 1 --json databaseId --jq '.[0].databaseId') -R Team-Hamsa/calebhamsa.fun --exit-status
curl -s https://calebhamsa.fun/sw.js | grep "CACHE_NAME ="   # caleb-v4
gh issue close 4 --repo Team-Hamsa/calebhamsa.fun --comment "💧 Water tab is live on https://calebhamsa.fun/build.html — real amounts of water that fall, spread and squish (U-tubes level out, water towers push water up pipes), pipes/valves/faucets/drains, and a steam power plant: burner → steam → turbine → ⚡ lamp, with chillers and battery-powered pumps."
```

- [ ] **Step 4: Hand-check on the iPad.** Ask the user to check:
- pouring feels responsive
- a U-tube levels in about 5 s
- a power plant lights a lamp
- the page stays smooth with a running faucet
