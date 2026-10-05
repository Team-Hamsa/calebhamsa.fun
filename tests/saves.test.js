/**
 * saves.test.js — checks saving and loading Build-page worlds, including
 * the ways it can go wrong (broken saves, blocked storage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, createWorld, defaultWorld, getBlock, setBlock, tick } from '../js/world.js';
import { allSystems, blockInfo } from '../js/blocks/registry.js';
import { makeRoom } from '../js/fluids.js';
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

test('water and steam are saved and come back (rounded to 3 decimals)', () => {
  const world = createWorld(4, 3);
  world.fluid.water[5] = 0.12345;
  world.fluid.steam[2] = 1;
  const back = deserializeWorld(serializeWorld(world), SMALL);
  assert.equal(back.fluid.water[5], 0.123);
  assert.equal(back.fluid.steam[2], 1);
});

test('version 1 saves (from before water) still load, dry', () => {
  const text = JSON.stringify({ version: 1, width: 4, height: 3, blocks: ['air', 'gold'], cells: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const world = deserializeWorld(text, SMALL);
  assert.equal(getBlock(world, 0, 0), 'gold');
  assert.ok(world.fluid.water.every((amount) => amount === 0));
});

test('a broken water list loads dry, but the blocks still load', () => {
  for (const water of ['lots', [1, 2], new Array(12).fill(-1), [...new Array(11).fill(0), 'x']]) {
    const world = deserializeWorld(saveText({ width: 4, height: 3, blocks: ['air', 'gold'], cells: [1, ...new Array(11).fill(0)], water }), SMALL);
    assert.equal(getBlock(world, 0, 0), 'gold', JSON.stringify(water));
    assert.ok(world.fluid.water.every((amount) => amount === 0), JSON.stringify(water));
  }
});

test('water in a smaller old save lines up at the bottom-left too', () => {
  const water = [0, 0, 0.5, 0]; // 2 × 2: water in the bottom-left cell
  const world = deserializeWorld(saveText({ width: 2, height: 2, blocks: ['air'], cells: [0, 0, 0, 0], water }), SMALL);
  assert.equal(world.fluid.water[2 * 4 + 0], 0.5);
});

test('an old save with squashed water loads with every cell at most full, and all the water that was drawn', () => {
  // What the old game saved for a tank 2 wide with 10 cells of water in it:
  // deep water squashed into fewer cells (more than 1 in a cell).
  const width = 4;
  const height = 8;
  const blocks = ['air', 'stone'];
  const cells = [];
  const water = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wall = x === 0 || x === 3 || y === 7;
      cells.push(wall ? 1 : 0);
      water.push(wall || y < 3 ? 0 : [0.7, 1.1, 1.2, 1.3][y - 3] ?? 0);
    }
  }
  water[3 * width + 1] = 0.7;
  const text = JSON.stringify({ version: SAVE_VERSION, width, height, blocks, cells, water, steam: new Array(width * height).fill(0) });
  const world = deserializeWorld(text, { width, height, isKnown: () => true });
  const saved = world.fluid.water.reduce((sum, amount) => sum + amount, 0);
  assert.ok(Math.max(...world.fluid.water) > 1, 'the save really holds squashed water');
  assert.equal(makeRoom(world, blockInfo), 0); // what build.js does to every world it loads (see openWorld)
  assert.ok(Math.max(...world.fluid.water) <= 1);
  assert.ok(Math.abs(world.fluid.water.reduce((sum, amount) => sum + amount, 0) - saved) < 1e-9, 'none of it was lost');
  // It is level, and stays put: the extra went back on top of the water it was squashed under.
  const systems = allSystems();
  const before = Array.from(world.fluid.water);
  for (let i = 0; i < 20; i++) tick(world, systems, blockInfo);
  world.fluid.water.forEach((amount, index) => assert.ok(Math.abs(amount - before[index]) < 1e-6, `cell ${index} moved`));
});

test('a new save never holds more than one cell of water in a cell', () => {
  const world = createWorld(6, 9);
  for (let y = 0; y < 9; y++) {
    setBlock(world, 0, y, 'stone');
    setBlock(world, 3, y, 'stone');
    for (const x of [1, 2]) world.fluid.water[y * 6 + x] = 1;
  }
  setBlock(world, 3, 8, 'pipe');
  const systems = allSystems();
  for (let i = 0; i < 60; i++) {
    tick(world, systems, blockInfo);
    const saved = JSON.parse(serializeWorld(world));
    assert.ok(Math.max(...saved.water) <= 1, `tick ${i}: the save holds ${Math.max(...saved.water)}`);
  }
});
