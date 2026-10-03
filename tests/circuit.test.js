/**
 * circuit.test.js — checks the electricity math: loops, brightness,
 * series and parallel, switches, short circuits, and which way current
 * flows. Each test draws a little world as a picture made of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { partAxis, partPush, plusSide, solveCircuit, solveLinear } from '../js/circuit.js';

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

test('a part with pushNow pushes as hard as it says (a turbine)', () => {
  TEST_BLOCKS.turbine = { part: { resistance: 0.05, pushNow: (world) => world.turbinePush } };
  LETTERS.T = 'turbine';
  const world = worldFrom(['WWW', 'T.W', 'WLW']);
  world.turbinePush = 1;
  assert.ok(Math.abs(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level - 1) < 0.02);
  world.turbinePush = 0;
  assert.equal(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level, 0);
});

test('a pushing turbine wired straight back to itself sparks, like a battery', () => {
  const world = worldFrom(['WW', 'TW', 'WW']);
  world.turbinePush = 1;
  assert.equal(solveCircuit(world, blockInfo).cells.get(1 * 2 + 0).spark, true);
});

test('a turbine pushing almost nothing pushes nothing, so a stopped turbine stops the circuit', () => {
  // The push is rounded to 0.1 for the solve, the same as the circuit key,
  // so a dying turbine can't leave a tiny current flowing forever.
  const world = worldFrom(['WWW', 'T.W', 'WLW']);
  world.turbinePush = 0.04;
  const { cells, flowing } = solveCircuit(world, blockInfo);
  assert.equal(cells.get(2 * 3 + 1).level, 0);
  assert.equal(flowing, false);
});

test('a changing push is rounded toward zero: 0.16 pushes 0.1, -0.16 pushes -0.1, 0.3 stays 0.3', () => {
  assert.equal(partPush({ pushNow: () => 0.16 }, null, 0, 0), 0.1);
  assert.equal(partPush({ pushNow: () => -0.16 }, null, 0, 0), -0.1);
  assert.equal(partPush({ pushNow: () => 0.1 + 0.2 }, null, 0, 0), 0.3); // 0.30000000000000004
  assert.equal(partPush({ pushNow: () => 0.3 }, null, 0, 0), 0.3);
  assert.equal(partPush({ push: 1 }, null, 0, 0), 1);
});
