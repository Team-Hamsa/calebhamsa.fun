/**
 * lifting.test.js — checks the 🏗️ pack with the real blocks: a crank and
 * winch lift a crate, an iron weight is too heavy until the winch is
 * geared down (or hangs on a pulley hook), gearing UP makes even a crate
 * too heavy, a rope over a pulley, and cutting the rope.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, getBlock, setBlock, tick } from '../js/world.js';
import { allSystems, blockInfo, blocksInPack } from '../js/blocks/registry.js';
import { drawWorld } from '../js/block-art.js';
import lifting from '../js/blocks/lifting.js';
import { spinAt } from '../js/blocks/gears.js';

/** What each letter in a test picture means. */
const LETTERS = {
  '.': 'air', '#': 'stone', s: 'gearSmall', G: 'gearBig', '-': 'axle', R: 'crankCW', Q: 'crankCCW',
  w: 'winch', '|': 'rope', P: 'pulley', h: 'pulleyHook', c: 'crate', I: 'ironWeight', S: 'sand',
  f: 'faucet', O: 'waterWheel', D: 'drain', W: 'wire', B: 'battery', M: 'motor', E: 'generator', L: 'lamp', X: 'crankStop',
};

/**
 * Build a world from a picture.
 * @param {string[]} rows - the picture
 * @returns {object} the world
 */
function make(rows) {
  const world = createWorld(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((letter, x) => setBlock(world, x, y, LETTERS[letter])));
  return world;
}

/**
 * Run a world's clock for some ticks.
 * @param {object} world - the world
 * @param {number} ticks - how many
 * @returns {object} the same world
 */
function run(world, ticks) {
  const systems = allSystems();
  for (let i = 0; i < ticks; i++) tick(world, systems, blockInfo);
  return world;
}

/**
 * Which row a block is in, looking down one column.
 * @param {object} world - the world
 * @param {number} x - the column
 * @param {string} name - the block to look for
 * @returns {number} its row (−1 if it isn't there)
 */
function rowOf(world, x, name) {
  for (let y = 0; y < world.height; y++) if (getBlock(world, x, y) === name) return y;
  return -1;
}

test('the lifting tab shows its six blocks', () => {
  assert.deepEqual(blocksInPack('lift'), ['winch', 'rope', 'pulley', 'pulleyHook', 'crate', 'ironWeight']);
  assert.deepEqual(lifting.tab, { id: 'lift', icon: '🏗️', label: 'Lifting' });
});

test('a crank turning a winch ↻ lifts a crate, as far as the rope goes', () => {
  const world = run(make(['Rw', '.|', '.|', '.|', '.c', '##']), 24);
  assert.equal(rowOf(world, 1, 'crate'), 2); // up two; the last bit of rope stays
  assert.equal(getBlock(world, 1, 1), 'rope');
});

test('turning the crank ↺ lowers the crate until it rests on the ground', () => {
  const world = run(make(['Qw', '.|', '.c', '..', '..', '##']), 12);
  assert.equal(rowOf(world, 1, 'crate'), 4);
  assert.deepEqual([1, 2, 3].map((y) => getBlock(world, 1, y)), ['rope', 'rope', 'rope']);
});

test('the iron weight is too heavy for a crank: everything stalls', () => {
  const world = run(make(['Rw', '.|', '.|', '.I', '.#']), 16);
  assert.equal(rowOf(world, 1, 'ironWeight'), 3);
  const winch = world.signals.spin.cells.get(1);
  assert.equal(winch.stalled, true);
  assert.equal(winch.jammed, false);
  assert.equal(spinAt(world, 0, 0), 0); // the crank can't turn either
});

test('geared down twice (a quarter as fast) the crank lifts the iron weight', () => {
  // crank 1 → small 1 → big −½ → axle −½ → small −½ → big ¼ → winch ¼
  const world = run(make(['RsG-sGw', '......|', '......|', '......|', '......I', '......#']), 40);
  assert.equal(spinAt(world, 6, 0), 0.125); // a quarter as fast, then halved again by the heavy load
  assert.ok(rowOf(world, 6, 'ironWeight') < 4, 'the iron weight did not move');
});

test('a pulley hook makes the iron weight half as heavy: geared down once is enough', () => {
  // crank ↺ 1 → small −1 → big ½ → winch ½, lifting a hooked iron weight (4 / 2 = 2; 2 × ½ = 1)
  const world = run(make(['QsGw', '...|', '...|', '...|', '...h', '...I', '...#']), 40);
  assert.ok(rowOf(world, 3, 'ironWeight') < 5, 'the iron weight did not move');
  assert.equal(world.signals.spin.cells.get(3).stalled, false);
});

test('without the hook, the same machine stalls', () => {
  const world = run(make(['QsGw', '...|', '...|', '...|', '...I', '...#']), 16);
  assert.equal(rowOf(world, 3, 'ironWeight'), 4);
});

test('gearing UP makes lifting harder: a crank geared up twice can\'t lift a crate', () => {
  // crank ↺ 1 → big −1 → small 2 → winch 2: the crate needs 1 × 2 = 2
  const world = run(make(['QGsw', '...|', '...|', '...c', '...#']), 16);
  assert.equal(rowOf(world, 3, 'crate'), 3);
  assert.equal(world.signals.spin.cells.get(3).stalled, true);
});

test('a rope over a pulley: the winch on the ground lifts a crate hanging the other side', () => {
  const world = run(make(['P|w', '|.R', '|.#', 'c..', '...', '###']), 16);
  assert.equal(rowOf(world, 0, 'crate'), 2);
});

test('a crate hanging on a rope stays up, and falls when the rope is dug away', () => {
  const world = run(make(['.w', '.|', '.c', '..', '##']), 4);
  assert.equal(rowOf(world, 1, 'crate'), 2);
  setBlock(world, 1, 1, 'air');
  run(world, 2);
  assert.equal(rowOf(world, 1, 'crate'), 3);
});

test('a crate lowered onto sand can be lifted off it again (the sand isn\'t lifted too)', () => {
  const world = run(make(['Qw', '.|', '.c', '..', '.S', '##']), 12);
  assert.equal(rowOf(world, 1, 'crate'), 3);
  setBlock(world, 0, 0, 'crankCW');
  run(world, 12);
  assert.equal(rowOf(world, 1, 'crate'), 2);
  assert.equal(rowOf(world, 1, 'sand'), 4);
});

test('cutting the rope in the middle drops the crate', () => {
  const world = run(make(['.w.', '.|.', '.|.', '.|.', '.c.', '...', '...', '###']), 2);
  setBlock(world, 1, 2, 'air');
  run(world, 6);
  assert.equal(rowOf(world, 1, 'crate'), 6);
});

test('lots of water is strong: two water wheels lift a hooked iron weight with no gears at all', () => {
  // Like Caleb's dad's machine: six faucets, two wheels on one axle, a gear, the winch.
  const world = run(make([
    'fff.fff.....', '............', '.O---O-sw...', '.D...D..|...', '........|...', '........h...', '........I...', '############',
  ]), 80);
  assert.equal(world.signals.spin.cells.get(2 * 12 + 8).stalled, false);
  assert.ok(rowOf(world, 8, 'ironWeight') < 6, 'the iron weight did not move');
});

test('more water is stronger: one faucet\'s wheel can\'t lift the hooked iron weight that six can', () => {
  const world = run(make([
    'f...........', '............', '.O-----sw...', '.D......|...', '........|...', '........h...', '........I...', '############',
  ]), 80);
  assert.equal(rowOf(world, 8, 'ironWeight'), 6);
});

test('more batteries make a motor stronger: five batteries lift the iron weight with no gears', () => {
  // Five batteries and a motor in a loop; a big gear on the motor's shaft, axles over to the winch.
  const world = run(make(['.....G--w.', 'WBBBBMBW|.', 'W......W|.', 'W......W|.', 'WWWWWWWWI.']), 24);
  assert.equal(world.signals.spin.cells.get(8).stalled, false);
  assert.ok(rowOf(world, 8, 'ironWeight') < 4, 'the iron weight did not move');
});

test('one battery\'s motor is only as strong as a crank: it can\'t lift the iron weight', () => {
  const world = run(make(['.....G--w.', 'WWWWWMBW|.', 'W......W|.', 'W......W|.', 'WWWWWWWWI.']), 24);
  assert.equal(world.signals.spin.cells.get(8).stalled, true);
});

test('heavier loads go up slower', () => {
  const crate = run(make(['Rw', '.|', '.|', '.|', '.|', '.c', '.#']), 4);
  const hookedIron = run(make(['QsGw', '...|', '...|', '...|', '...h', '...I', '...#']), 4);
  // Crank → winch with a crate (1 of its 2): half the crank's speed.
  assert.equal(spinAt(crate, 1, 0), 0.5);
  // Geared down once, hooked iron (counts 2 → 1 at the crank): also half... of half.
  assert.equal(spinAt(hookedIron, 3, 0), 0.25);
});

test('every lifting block can be drawn, in the world and in the palette', () => {
  const world = run(make(['Rw.P|w', '.|.|.|', '.c.h.I', '.....#']), 3);
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {}, fillStyle: '', globalAlpha: 1 };
  drawWorld(ctx, world, 16, blockInfo, '#7ec8ff');
  for (const name of blocksInPack('lift')) {
    const info = blockInfo(name);
    info.drawSignals?.(ctx, info, 0, 0, 16, undefined, 0);
  }
});

test('a weight resting on the ground is no counterweight: it can\'t help a crank lift the iron weight', () => {
  // The right-hand iron weight already sits on stone, so its rope is slack.
  const world = run(make(['RwGGw.', '.|..|.', '.|..|.', '.|..I.', '.I..#.', '.#....']), 40);
  assert.equal(rowOf(world, 1, 'ironWeight'), 4); // still too heavy for a crank
  assert.equal(rowOf(world, 4, 'ironWeight'), 3);
  assert.equal(world.signals.spin.cells.get(1).stalled, true);
  assert.equal(spinAt(world, 0, 0), 0);
});

test('a counterweight that really hangs does help: it goes down as the iron weight goes up', () => {
  const world = run(make(['RwGGw.', '.|..|.', '.|..I.', '.|....', '.I....', '.#..#.']), 40);
  assert.ok(rowOf(world, 1, 'ironWeight') < 4, 'the iron weight did not go up');
  assert.ok(rowOf(world, 4, 'ironWeight') > 2, 'the counterweight did not go down');
});

test('letting out rope with the load already on the ground: the crank turns at its own speed, no faster', () => {
  for (const load of ['I', 'c', '.']) {
    const world = run(make(['Qw', '.|', `.${load}`, '.#']), 20);
    assert.equal(spinAt(world, 1, 0), -1, `with "${load}" under the rope`);
  }
});

test('a weight lying on the ground is not free power for a generator', () => {
  /**
   * How fast the crank ends up turning, with something under the rope.
   * @param {string} load - the letter under the rope ('.' for nothing)
   * @returns {number} turns per second
   */
  const crankSpeed = (load) => {
    const world = run(make(['..WLW.', '..WLW.', '..WLW.', '..WEW.', '...Qw.', '....|.', `....${load}.`, '######']), 200);
    return spinAt(world, 3, 4);
  };
  const alone = crankSpeed('.');
  assert.ok(alone < 0);
  assert.equal(crankSpeed('c'), alone);
  assert.equal(crankSpeed('I'), alone);
});

/**
 * Run a world tick by tick and write down which row a block is in after each tick.
 * @param {object} world - the world
 * @param {number} x - the column to watch
 * @param {string} name - the block to watch
 * @param {number} ticks - how many ticks
 * @returns {number[]} its row after each tick
 */
function rowsOverTime(world, x, name, ticks) {
  const rows = [];
  for (let i = 0; i < ticks; i++) rows.push(rowOf(run(world, 1), x, name));
  return rows;
}

/**
 * A tall empty world with a floor, with some rows drawn at the top.
 * @param {string[]} top - the top rows
 * @param {number} height - how many rows in all (the last one is stone)
 * @returns {string[]} the picture
 */
function tall(top, height) {
  const width = top[0].length;
  return [...top, ...Array(height - top.length - 1).fill('.'.repeat(width)), '#'.repeat(width)];
}

test('a load let down on a rope never goes down faster than one that is just dropped', () => {
  const dropped = rowsOverTime(make(tall(['...I'], 14)), 3, 'ironWeight', 12);
  // Geared UP: the winch turns twice as fast as the crank, the let-out way.
  const world = make(tall(['RGsw', '...|', '...I'], 14));
  const lowered = [2, ...rowsOverTime(world, 3, 'ironWeight', 12)];
  for (let i = 1; i < lowered.length; i++) {
    assert.ok(lowered[i] - lowered[i - 1] <= 1, `it went down ${lowered[i] - lowered[i - 1]} cells in one tick`);
  }
  const ticksToFloor = (rows) => rows.indexOf(12) + 1;
  assert.ok(ticksToFloor(lowered.slice(1)) >= 10, 'ten cells take at least ten ticks');
  assert.equal(ticksToFloor(dropped), 12); // free fall: one cell every tick
});

test('a heavy load going down doesn\'t whirl the crank: the winch stops at falling speed', () => {
  const world = run(make(tall(['RGsw', '...|', '...I'], 14)), 2);
  assert.equal(spinAt(world, 3, 0), -4); // 4 turns × 2 cells of rope = 8 cells a second = 1 cell a tick
  assert.equal(spinAt(world, 0, 0), 2);  // was 5
  // With no gears the iron weight still helps the crank along, like before.
  assert.equal(spinAt(run(make(tall(['Qw', '.|', '.I'], 14)), 2), 1, 0), -3);
});

test('a motor letting rope out faster than falling can\'t push the load down: rope can only pull', () => {
  // Five batteries: the motor turns the winch ↺ at more than 4 turns a second.
  const world = make(tall(['.....G--w.', 'WWWWWMWW|.', 'W......Wc.', 'WBBBBBWW..'], 15));
  const rows = [2, ...rowsOverTime(world, 8, 'crate', 10)];
  assert.ok(spinAt(world, 8, 0) < -4, `winch speed ${spinAt(world, 8, 0)}`);
  assert.ok(rows.at(-1) > 8, 'the crate did not go down');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i] - rows[i - 1] <= 1, `${rows[i] - rows[i - 1]} cells in one tick`);
});
