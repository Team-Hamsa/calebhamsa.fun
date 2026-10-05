/**
 * circuit.test.js — checks the electricity math: loops, brightness,
 * series and parallel, switches, short circuits, and which way current
 * flows. Each test draws a little world as a picture made of letters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, setBlock } from '../js/world.js';
import { factorLinear, partAxis, partPush, plusSide, solveCircuit, solveFactored, solveLinear, work } from '../js/circuit.js';

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

test('wires win over parts: a part with wire above and below faces them, even with parts on both sides', () => {
  assert.equal(partAxis(worldFrom(['WWW', 'LLL', 'WWW']), 1, 1, blockInfo), 'v');
  assert.equal(partAxis(worldFrom(['WGW', 'BLB', 'WGW']), 1, 1, blockInfo), 'v'); // gold is wire too
  assert.equal(partAxis(worldFrom(['WLW', 'LLL', 'WLW']), 1, 1, blockInfo), 'h'); // parts all round: sideways, as before
  assert.equal(partAxis(worldFrom(['LWL', 'WLW', 'LWL']), 1, 1, blockInfo), 'h'); // wires all round: sideways, as before
  assert.equal(partAxis(worldFrom(['.L.', 'WLW', '.L.']), 1, 1, blockInfo), 'h');
  // A row of parts joined end to end (series) still faces along the row.
  for (let x = 1; x <= 3; x++) assert.equal(partAxis(worldFrom(['WLLLW']), x, 0, blockInfo), 'h');
});

test('three or more lamps side by side between two rails all light the same (parallel)', () => {
  for (const count of [3, 8]) {
    const rows = [`WW${'W'.repeat(count)}`, `B.${'L'.repeat(count)}`, `WW${'W'.repeat(count)}`];
    const world = worldFrom(rows);
    const { cells } = solveCircuit(world, blockInfo);
    const currents = [...rows[1]].map((letter, x) => (letter === 'L' ? cells.get(world.width + x).current : null)).filter((c) => c !== null);
    for (const current of currents) {
      assert.ok(current > 0.5, `${count} lamps: one only gets ${current} (${currents.map((c) => c.toFixed(2)).join(' ')})`);
      assert.ok(Math.abs(current - currents[0]) < 0.1 * currents[0], `${count} lamps aren't alike: ${currents.map((c) => c.toFixed(2)).join(' ')}`);
    }
  }
});

test('three batteries side by side between two rails all share the work (parallel)', () => {
  const world = worldFrom(['WWWWW', 'BBB.L', 'WWWWW']);
  const { cells } = solveCircuit(world, blockInfo);
  const currents = [0, 1, 2].map((x) => cells.get(world.width + x).current);
  for (const current of currents) assert.ok(current > 0.25 && current < 0.4, `batteries carry ${currents.map((c) => c.toFixed(3)).join(' ')}`);
  assert.ok(Math.abs(cells.get(world.width + 4).level - 1) < 0.05, 'the lamp is as bright as with one battery (a little brighter)');
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

test('a part with pushNow pushes as hard as it says (like a generator)', () => {
  TEST_BLOCKS.pusher = { part: { resistance: 0.05, pushNow: (world) => world.pusherPush } };
  LETTERS.T = 'pusher';
  const world = worldFrom(['WWW', 'T.W', 'WLW']);
  world.pusherPush = 1;
  assert.ok(Math.abs(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level - 1) < 0.02);
  world.pusherPush = 0;
  assert.equal(solveCircuit(world, blockInfo).cells.get(2 * 3 + 1).level, 0);
});

test('a changing pusher (like a generator) wired straight back to itself sparks, like a battery', () => {
  const world = worldFrom(['WW', 'TW', 'WW']);
  world.pusherPush = 1;
  assert.equal(solveCircuit(world, blockInfo).cells.get(1 * 2 + 0).spark, true);
});

test('a very long shorting wire still sparks', () => {
  // A loop of wire 40 cells wide: about 80 wires between + and −, and still nothing to slow the current.
  const rows = [`W${'W'.repeat(39)}`, `B${'.'.repeat(38)}W`, `W${'W'.repeat(39)}`];
  const battery = cellAt(rows, 0, 1);
  assert.ok(battery.current > 5, `only ${battery.current} flows`);
  assert.equal(battery.spark, true);
});

test('two healthy batteries side by side (parallel) lighting lots of lamps do NOT spark', () => {
  // Each battery works LESS hard than one alone would. The other battery is not "plain wire".
  for (const rows of [
    ['WWWWWWWWWWWWWWWW', 'B.B.L.L.L.L.L.L.', 'WWWWWWWWWWWWWWWW'],
    ['WWWWWWWWWWW', 'BB.LLLLLLLL', 'WWWWWWWWWWW'],
    ['WWWWWWWWWWWW', 'BBB.LLLLLLLL', 'WWWWWWWWWWWW'],
  ]) {
    const world = worldFrom(rows);
    const { cells } = solveCircuit(world, blockInfo);
    [...rows[1]].forEach((letter, x) => {
      const cell = cells.get(world.width + x);
      if (letter === 'B') assert.equal(cell.spark, false, `${rows[1]}: battery ${x} sparks with ${cell.current}`);
      if (letter === 'L') assert.ok(cell.level > 0.7, `${rows[1]}: lamp ${x} is dim`);
    });
    assert.ok(cells.get(world.width).current > 2 || rows[1].startsWith('BBB'), 'the batteries are working hard');
  }
});

test('parallel batteries DO spark when a plain wire really joins + to −', () => {
  const world = worldFrom(['WWWWW', 'B.B.W', 'WWWWW']);
  const { cells } = solveCircuit(world, blockInfo);
  assert.equal(cells.get(5).spark, true);
  assert.equal(cells.get(7).spark, true);
});

test('a battery wired straight across a STOPPED generator sparks: its coil is just wire', () => {
  TEST_BLOCKS.pusher = { part: { resistance: 0.05, pushNow: (world) => world.pusherPush } };
  LETTERS.T = 'pusher';
  const world = worldFrom(['WWW', 'B.T', 'WWW']);
  world.pusherPush = 0;
  const battery = solveCircuit(world, blockInfo).cells.get(3);
  assert.ok(battery.current > 9, `only ${battery.current} flows`);
  assert.equal(battery.spark, true);
  // With a lamp beside it too: the stopped pusher steals nearly all the current.
  const beside = worldFrom(['WWWWW', 'B.T.L', 'WWWWW']);
  beside.pusherPush = 0;
  const cells = solveCircuit(beside, blockInfo).cells;
  assert.equal(cells.get(5).spark, true);
  assert.ok(cells.get(9).level < 0.6);
  // Mirror image: the same thing happens the other way round.
  const mirror = worldFrom(['WWW', 'T.B', 'WWW']);
  mirror.pusherPush = 0;
  assert.equal(solveCircuit(mirror, blockInfo).cells.get(5).spark, true);
});

test('a battery beside a generator that pushes the same way does not spark; one overpowering a weak generator does', () => {
  const world = worldFrom(['WWWWW', 'B.T.L', 'WWWWW']);
  world.pusherPush = 1; // as strong as the battery: they share the lamp
  let cells = solveCircuit(world, blockInfo).cells;
  assert.equal(cells.get(5).spark, false);
  assert.equal(cells.get(7).spark, false);
  world.pusherPush = 0.3; // much weaker: the battery forces current backwards through it
  cells = solveCircuit(world, blockInfo).cells;
  assert.ok(cells.get(5).current > 5, `only ${cells.get(5).current} flows`);
  assert.equal(cells.get(5).spark, true);
  assert.equal(cells.get(7).spark, false, 'the weak pusher is not the one pushing too hard');
});

test('a generator pushing almost nothing pushes nothing, so a stopped generator stops the circuit', () => {
  // The push is rounded down to a hundredth of a volt for the solve, the same
  // as the circuit key, so a dying generator can't leave a tiny current flowing forever.
  const world = worldFrom(['WWW', 'T.W', 'WLW']);
  world.pusherPush = 0.004;
  const { cells, flowing } = solveCircuit(world, blockInfo);
  assert.equal(cells.get(2 * 3 + 1).level, 0);
  assert.equal(flowing, false);
});

test('a weak push still makes a little electricity: voltage follows the push all the way down', () => {
  const world = worldFrom(['WWW', 'T.W', 'WLW']);
  world.pusherPush = 0.04;
  const lamp = solveCircuit(world, blockInfo).cells.get(2 * 3 + 1);
  assert.ok(Math.abs(lamp.current - 0.04 / 1.05) < 0.002, `lamp current ${lamp.current}`);
});

test('a changing push is rounded toward zero, to a hundredth: 0.016 pushes 0.01, -0.016 pushes -0.01, 0.3 stays 0.3', () => {
  assert.equal(partPush({ pushNow: () => 0.016 }, null, 0, 0), 0.01);
  assert.equal(partPush({ pushNow: () => -0.016 }, null, 0, 0), -0.01);
  assert.equal(partPush({ pushNow: () => 0.16 }, null, 0, 0), 0.16);
  assert.equal(partPush({ pushNow: () => 0.1 + 0.2 }, null, 0, 0), 0.3); // 0.30000000000000004
  assert.equal(partPush({ pushNow: () => 0.3 }, null, 0, 0), 0.3);
  assert.equal(partPush({ pushNow: () => 0.57 }, null, 0, 0), 0.57);
  assert.equal(partPush({ pushNow: () => 0.004 }, null, 0, 0), 0);
  assert.equal(Object.is(partPush({ pushNow: () => -0.004 }, null, 0, 0), 0), true); // a plain 0, not −0
  assert.equal(partPush({ push: 1 }, null, 0, 0), 1);
});

test('a part that feels its load is told the current per volt it would push, even while it pushes nothing', () => {
  TEST_BLOCKS.dynamo = { part: { resistance: 0.05, pushNow: () => 0, feelsLoad: true } };
  LETTERS.D = 'dynamo';
  const loadOf = (rows) => solveCircuit(worldFrom(rows), blockInfo).cells.get(1 * rows[0].length + 0).load;
  assert.ok(Math.abs(loadOf(['WWW', 'D.W', 'WLW']) - 1 / 1.05) < 0.02, 'one lamp: about 1 amp per volt');
  assert.ok(Math.abs(loadOf(['WWW', 'D.L', 'WLW']) - 1 / 2.05) < 0.02, 'two lamps in a row: about half');
  assert.ok(loadOf(['WW', 'DW', 'WW']) > 10, 'joined by plain wire: a huge load');
  assert.equal(loadOf(['WWW', 'D..', 'WLW']), 0, 'no loop: no load');
  assert.equal(solveCircuit(worldFrom(['WWW', 'B.W', 'WLW']), blockInfo).cells.get(3).load, undefined, 'batteries are not told');
});

test('equations can be cleared out ONCE and then answered for many right-hand sides', () => {
  /**
   * A fresh copy of the same grid of numbers (solving changes it).
   * @returns {number[][]} the grid
   */
  const grid = () => [[0, 2, 1, -1], [4, -6, 0, 2], [-2, 7, 2, 1], [1, 1, 1, 9]];
  const factored = factorLinear(grid());
  for (const rhs of [[1, 0, 0, 0], [0, 0, 0, 1], [3, -2, 5, 7], [0, 0, 0, 0]]) {
    const once = solveFactored(factored, [...rhs]);
    const fresh = solveLinear(grid(), [...rhs]);
    once.forEach((value, k) => assert.ok(Math.abs(value - fresh[k]) < 1e-12, `${rhs}: ${once} against ${fresh}`));
    // And it really is the answer: grid × answer = rhs.
    grid().forEach((row, r) => assert.ok(Math.abs(row.reduce((sum, value, k) => sum + value * once[k], 0) - rhs[r]) < 1e-12));
  }
  assert.equal(factorLinear([[1, 2], [2, 4]]), null, 'no single answer');
});

test('a circuit with many generators costs ONE big sum, not one for each generator', () => {
  // Twenty stand-in generators and a battery in one loop with a lamp.
  const blocks = { ...TEST_BLOCKS, maker: { part: { resistance: 0.05, pushNow: () => 0.5, feelsLoad: true } } };
  const world = createWorld(24, 3);
  for (let x = 0; x < 24; x++) {
    setBlock(world, x, 0, x >= 2 && x < 22 ? 'maker' : 'wire');
    setBlock(world, x, 2, x === 10 ? 'lamp' : x === 12 ? 'battery' : 'wire');
  }
  setBlock(world, 0, 1, 'wire');
  setBlock(world, 23, 1, 'wire');
  const before = work.factorings;
  const solved = solveCircuit(world, (name) => blocks[name]);
  assert.equal(work.factorings - before, 1);
  // The shares still add up to the real current: fixed + each generator's share × its push.
  const lamp = solved.cells.get(2 * 24 + 10);
  let sum = lamp.fixed;
  for (const share of lamp.perVolt.values()) sum += share * 0.5;
  assert.equal(lamp.perVolt.size, 20);
  assert.ok(Math.abs(Math.abs(sum) - lamp.current) < 1e-9, `shares add up to ${sum}, the current is ${lamp.current}`);
  assert.ok(lamp.current > 1, `the lamp only gets ${lamp.current}`);

  // The generators push harder, the wiring stays the same: told so, the
  // circuit keeps its shares and does only two quick sums, and gets the
  // very same answer as working everything out afresh.
  blocks.maker = { part: { resistance: 0.05, pushNow: () => 0.75, feelsLoad: true } };
  const fresh = solveCircuit(world, (name) => blocks[name]);
  const answers = work.answers;
  const again = solveCircuit(world, (name) => blocks[name], solved.cells);
  assert.equal(work.answers - answers, 2);
  for (const [index, cell] of fresh.cells) {
    const other = again.cells.get(index);
    assert.equal(other.current, cell.current);
    assert.equal(other.fixed, cell.fixed);
    assert.equal(other.load, cell.load);
    assert.deepEqual(other.perVolt && [...other.perVolt], cell.perVolt && [...cell.perVolt]);
  }
});
