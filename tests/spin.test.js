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
