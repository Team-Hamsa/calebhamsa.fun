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
  w: 'winch', '|': 'rope', P: 'pulley', h: 'pulleyHook', c: 'crate', I: 'ironWeight',
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
  const world = run(make(['Rw', '.|', '.|', '.|', '.c', '##']), 12);
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
  assert.equal(spinAt(world, 6, 0), 0.25);
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

test('every lifting block can be drawn, in the world and in the palette', () => {
  const world = run(make(['Rw.P|w', '.|.|.|', '.c.h.I', '.....#']), 3);
  const ctx = { fillRect() {}, strokeRect() {}, fillText() {}, fillStyle: '', globalAlpha: 1 };
  drawWorld(ctx, world, 16, blockInfo, '#7ec8ff');
  for (const name of blocksInPack('lift')) {
    const info = blockInfo(name);
    info.drawSignals?.(ctx, info, 0, 0, 16, undefined, 0);
  }
});
